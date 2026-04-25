/**
 * Robots.txt fetcher and evaluator.
 *
 * Wraps the `robots-parser` npm package with three additions specific
 * to ToraSEO:
 *
 *   1. An in-process cache keyed by origin (scheme + host + port), so
 *      a single MCP-server lifetime fetches each robots.txt at most once.
 *      Per CRAWLING_POLICY: "fetched once per session per host".
 *
 *   2. A strict failure mode: if robots.txt is unreachable (5xx, timeout,
 *      DNS error), we treat the site as DISALLOWED for that session. This
 *      is intentionally stricter than Googlebot, which uses a temporary
 *      "unavailable = disallow" with retry. We are a small tool; safer to
 *      err on the side of refusing than to scrape something we should not.
 *
 *      A 404 on robots.txt is the special case: per RFC 9309 it means
 *      "no policy declared" and is treated as full allow. This is also
 *      the convention every major search engine follows.
 *
 *   3. A normalized return type (`CheckRobotsResult`) that the MCP tool
 *      layer can hand back to Claude with a clear `reason` enum.
 *
 * Why a separate file (not co-located with the tool):
 * `scan_site_minimal` ALSO needs to consult robots.txt before fetching,
 * so the parser/cache live here as a pure module. The MCP tool wrapper
 * in `tools/check-robots.ts` is a thin adapter on top.
 */

// `robots-parser` is a CommonJS module that exports a callable directly
// via `module.exports = function`. Under our strict TS settings
// (`verbatimModuleSyntax: true` + `module: NodeNext`), the cleanest way
// to consume such a module is `createRequire`, which gives us the raw
// `module.exports` value without any ESM-interop translation. The .d.ts
// declares an ESM default export, but the runtime value is the function
// itself — `createRequire` returns that function directly.
import { createRequire } from "node:module";

import type { CheckRobotsResult } from "../types.js";

const require_ = createRequire(import.meta.url);

/**
 * Public interface of a `robots-parser` instance. Mirrors the package's
 * own `.d.ts` but is declared locally so we own the type and don't depend
 * on a default-export declaration that doesn't match the CJS runtime shape.
 */
interface RobotsParser {
  isAllowed(url: string, ua?: string): boolean | undefined;
  isDisallowed(url: string, ua?: string): boolean | undefined;
  getMatchingLineNumber(url: string, ua?: string): number;
  getCrawlDelay(ua?: string): number | undefined;
  getSitemaps(): string[];
  getPreferredHost(): string | null;
}

const robotsParser = require_("robots-parser") as (
  url: string,
  contents: string,
) => RobotsParser;

// --- Constants ------------------------------------------------------------

/** Hard timeout for fetching /robots.txt itself. Smaller than the page
 * timeout because robots.txt is a tiny text file — if it takes longer
 * than 5s, the site is unhealthy. */
const ROBOTS_TIMEOUT_MS = 5_000;

/** Maximum size of a robots.txt body we will accept. RFC 9309 §2.5
 * recommends 500 KiB. We cap at 512 KB to be generous. */
const ROBOTS_MAX_BYTES = 512 * 1024;

/** The product token under which we identify ourselves. Matches the
 * literal token requirement in CRAWLING_POLICY. */
const USER_AGENT_TOKEN = "ToraSEO";

/** Full User-Agent header for the robots.txt fetch. Same shape as the
 * one used in `scan-site.ts`. Keep them in sync until we centralize. */
const USER_AGENT_HEADER =
  "ToraSEO/0.0.1 (+https://github.com/Magbusjap/toraseo)";

// --- Cache ---------------------------------------------------------------

/**
 * Result of a previous fetch+parse, kept around so we do not hit the
 * same /robots.txt twice during one server lifetime.
 */
interface CachedRobots {
  /** The parser instance from `robots-parser`, ready to answer queries. */
  parser: RobotsParser;
  /** Whether the fetch succeeded at all (false → site is disallowed). */
  reachable: boolean;
  /** Whether the file actually exists (404 → no policy, full allow). */
  exists: boolean;
}

/**
 * Origin → cached robots data. Origin is `scheme://host[:port]`, NOT
 * the bare hostname. `https://example.com` and `http://example.com`
 * are different origins and therefore different cache entries; this
 * matches RFC 9309 §2.3 and avoids surprising scope-leaks.
 */
const cache = new Map<string, CachedRobots>();

// --- Public API ----------------------------------------------------------

/**
 * Fetches and evaluates robots.txt for the origin of `targetUrl`, then
 * answers: may we fetch THAT URL with our User-Agent?
 *
 * Side effects: a single HTTP GET to `<origin>/robots.txt` if the result
 * is not already cached.
 *
 * Never throws on operational failure (network error, timeout, 5xx).
 * Those become `allowed: false` with `reason: "robots_unreachable"`.
 * The caller decides whether to surface that to the user as an error
 * or as "scan refused, try again later".
 */
export async function checkRobots(
  targetUrl: string,
): Promise<CheckRobotsResult> {
  const parsedUrl = new URL(targetUrl);
  const origin = `${parsedUrl.protocol}//${parsedUrl.host}`;
  const robotsTxtUrl = `${origin}/robots.txt`;

  const cached = cache.get(origin) ?? (await fetchAndCache(origin));

  // Unreachable → policy says disallowed.
  if (!cached.reachable) {
    return {
      url: targetUrl,
      robots_txt_url: robotsTxtUrl,
      allowed: false,
      reason: "robots_unreachable",
      crawl_delay_seconds: null,
    };
  }

  // 404 → RFC 9309 says no policy = full allow.
  if (!cached.exists) {
    return {
      url: targetUrl,
      robots_txt_url: robotsTxtUrl,
      allowed: true,
      reason: "no_robots_txt",
      crawl_delay_seconds: null,
    };
  }

  const isAllowed = cached.parser.isAllowed(targetUrl, USER_AGENT_TOKEN);
  const crawlDelay = cached.parser.getCrawlDelay(USER_AGENT_TOKEN) ?? null;

  // `isAllowed` returns `true | false | undefined`:
  //   true      → matched an Allow rule (or no rule found and default-allow)
  //   false     → matched a Disallow rule
  //   undefined → could not decide; treat as allow per RFC 9309 default
  if (isAllowed === false) {
    return {
      url: targetUrl,
      robots_txt_url: robotsTxtUrl,
      allowed: false,
      reason: "rule_disallow",
      crawl_delay_seconds: crawlDelay,
    };
  }

  // To distinguish "explicit allow" from "no matching rule, default allow"
  // we need a second probe with the wildcard UA. If the wildcard group
  // would also have allowed this path implicitly, we report no_matching_rule;
  // otherwise the verdict came from an explicit Allow targeting our token
  // or the wildcard group. This distinction is mostly cosmetic for the
  // Claude-facing message but useful in audit reports.
  const wildcardAllowed = cached.parser.isAllowed(targetUrl, "*");
  const reason: CheckRobotsResult["reason"] =
    wildcardAllowed === true ? "rule_allow" : "no_matching_rule";

  return {
    url: targetUrl,
    robots_txt_url: robotsTxtUrl,
    allowed: true,
    reason,
    crawl_delay_seconds: crawlDelay,
  };
}

/**
 * Returns the list of `Sitemap:` URLs declared in robots.txt for the
 * origin of `targetUrl`. RFC 9309 §2.6 specifies that Sitemap directives
 * are independent of User-Agent groups — they apply globally to the file.
 *
 * Reuses the same cache as `checkRobots`, so a paired call (check robots,
 * then ask for sitemaps) costs at most one HTTP request total.
 *
 * Returns an empty array on any failure (unreachable, 404, parse error).
 * The caller (typically `analyze_sitemap`) decides what fallback to use —
 * usually probing `/sitemap.xml` directly.
 */
export async function getSitemapsFromRobots(
  targetUrl: string,
): Promise<string[]> {
  const parsedUrl = new URL(targetUrl);
  const origin = `${parsedUrl.protocol}//${parsedUrl.host}`;
  const cached = cache.get(origin) ?? (await fetchAndCache(origin));

  // Unreachable or missing — no sitemaps to report. The fact that we
  // could not read robots.txt is already surfaced through `checkRobots`;
  // here we just return an empty list and let the caller decide.
  if (!cached.reachable || !cached.exists) {
    return [];
  }

  // robots-parser's getSitemaps() returns the absolute URLs as written
  // in the file. We trust them as-is; sitemap-fetch logic downstream
  // will validate they are reachable and parse-able.
  return cached.parser.getSitemaps();
}

// --- Internals -----------------------------------------------------------

/**
 * Fetches robots.txt for an origin, parses it, populates the cache,
 * and returns the cache entry. Always populates the cache, even on
 * failure, so we do not hammer broken hosts.
 *
 * Diagnostic: writes the disposition to stderr so failures are visible
 * in the Claude Desktop MCP log without polluting stdout (which is
 * reserved for JSON-RPC traffic).
 */
async function fetchAndCache(origin: string): Promise<CachedRobots> {
  const robotsTxtUrl = `${origin}/robots.txt`;
  const controller = new AbortController();
  const timeoutHandle = setTimeout(
    () => controller.abort(),
    ROBOTS_TIMEOUT_MS,
  );

  let entry: CachedRobots;

  try {
    const response = await fetch(robotsTxtUrl, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": USER_AGENT_HEADER,
        Accept: "text/plain, */*;q=0.5",
      },
    });

    process.stderr.write(
      `[robots] ${robotsTxtUrl} -> HTTP ${response.status} ` +
        `(content-type: ${response.headers.get("content-type") ?? "none"})\n`,
    );

    if (response.status === 404) {
      // No policy declared. Per RFC 9309 §2.3.1, this is full allow.
      // We still create a parser instance over an empty file so the
      // public API does not have to special-case "no parser".
      entry = {
        parser: robotsParser(robotsTxtUrl, ""),
        reachable: true,
        exists: false,
      };
    } else if (response.status >= 500 || response.status === 429) {
      // Server error or rate-limit on robots.txt itself. CRAWLING_POLICY
      // says: treat as disallowed for this session.
      entry = {
        parser: robotsParser(robotsTxtUrl, ""),
        reachable: false,
        exists: false,
      };
    } else if (!response.ok) {
      // 4xx other than 404 (e.g. 401, 403). Per RFC 9309 §2.3.1 these
      // are "unavailable" and our policy says disallow.
      entry = {
        parser: robotsParser(robotsTxtUrl, ""),
        reachable: false,
        exists: false,
      };
    } else {
      // 2xx — read body with a size cap. We trust /robots.txt to be small,
      // so we do not stream-with-cap like the page scanner; we just check
      // Content-Length where available and otherwise truncate the result.
      const text = await readBoundedText(response, ROBOTS_MAX_BYTES);
      process.stderr.write(
        `[robots] ${robotsTxtUrl} body: ${text.length} chars\n`,
      );
      entry = {
        parser: robotsParser(robotsTxtUrl, text),
        reachable: true,
        exists: true,
      };
    }
  } catch (error: unknown) {
    // Network error, DNS failure, abort/timeout — same disposition as 5xx.
    // Log the cause so the user (and we) can tell WHY the fetch failed,
    // rather than only seeing "robots_unreachable" downstream.
    const errorName = error instanceof Error ? error.name : "unknown";
    const errorMessage =
      error instanceof Error ? error.message : String(error);
    process.stderr.write(
      `[robots] ${robotsTxtUrl} fetch failed: ${errorName}: ${errorMessage}\n`,
    );
    // Some fetch implementations attach a `cause` (e.g. UND_ERR_*).
    if (
      error instanceof Error &&
      "cause" in error &&
      error.cause !== undefined
    ) {
      process.stderr.write(
        `[robots] ${robotsTxtUrl} cause: ${
          error.cause instanceof Error
            ? `${error.cause.name}: ${error.cause.message}`
            : String(error.cause)
        }\n`,
      );
    }
    entry = {
      parser: robotsParser(robotsTxtUrl, ""),
      reachable: false,
      exists: false,
    };
  } finally {
    clearTimeout(timeoutHandle);
  }

  cache.set(origin, entry);
  return entry;
}

/**
 * Reads response.text() but truncates to maxBytes. We do not need the
 * full streaming-with-cap dance from scan-site.ts here because robots.txt
 * is bounded in practice. A misconfigured server could still try to
 * stream gigabytes labeled as text/plain — slice() after the await
 * protects against that absorbing too much memory only because fetch()
 * keeps the body in memory anyway. This is an acceptable trade-off for
 * a 512 KB cap.
 */
async function readBoundedText(
  response: Response,
  maxBytes: number,
): Promise<string> {
  const contentLength = Number(response.headers.get("content-length") ?? "0");
  if (contentLength > maxBytes) {
    // Reject oversized robots.txt outright; treating it as empty is safer
    // than parsing a 100 MB file that might be a logfile served on the
    // wrong route.
    return "";
  }
  const text = await response.text();
  return text.length > maxBytes ? text.slice(0, maxBytes) : text;
}

// --- Test helpers --------------------------------------------------------

/**
 * Clears the cache. Intended for unit tests; production code should
 * never call this.
 */
export function _resetRobotsCacheForTests(): void {
  cache.clear();
}
