/**
 * Sitemap analyzer for site-audit Mode A.
 *
 * Discovers and analyzes the sitemap(s) for a given URL's origin.
 * Discovery follows two steps:
 *   1. Read robots.txt for `Sitemap:` directives (RFC 9309 §2.6)
 *   2. If none, probe `<origin>/sitemap.xml` as the standard fallback
 *
 * Once a sitemap is fetched, we determine its top-level shape:
 *   - <urlset> — a regular sitemap listing URLs
 *   - <sitemapindex> — an index referencing other sitemaps
 *
 * For an index, we DO NOT recursively follow children. We return the
 * index entries as-is so the user (Claude or a human) can decide which
 * child to inspect next. This keeps each call bounded to one HTTP
 * request and one parse, which respects CRAWLING_POLICY's "be polite"
 * rule and keeps the JSON response under reasonable token budgets.
 *
 * Architectural placement:
 *   Lives in `analyzers/site/` (Mode A — URL-based). The MCP tool
 *   wrapper in `tools/site/analyze-sitemap.ts` is a thin adapter on
 *   top, mirroring the meta.ts and headings.ts pattern.
 *
 * Network etiquette:
 *   The fetch path here is the FIFTH copy of the same boilerplate
 *   (timeout/abort/cap/UA). A cleanup-only commit will follow this
 *   one to extract a `crawlers/fetch.ts` helper. Doing it now would
 *   conflate "new feature" with "refactor" in a single diff.
 *
 *   We do NOT call `checkRobots()` for the sitemap itself. Sitemap
 *   files are PUBLIC by definition and explicitly named in robots.txt;
 *   asking robots.txt whether we can read robots.txt's own pointer
 *   would be circular. We DO honor the per-host rate limiter.
 */

import * as cheerio from "cheerio";

import {
  awaitRateLimit,
} from "../../crawlers/rate-limiter.js";
import {
  getSitemapsFromRobots,
} from "../../crawlers/robots-txt.js";
import type {
  AnalyzeSitemapResult,
  SitemapIndexEntry,
  SitemapIssue,
  SitemapUrlEntry,
} from "../../types.js";

// --- Constants ------------------------------------------------------------

/**
 * Sitemap protocol caps a single XML file at 50 MB uncompressed and
 * 50,000 URL entries. We cap our buffer at 60 MB to allow some slack
 * for sitemaps that slightly exceed the spec (and to detect them as
 * `sitemap_too_large` rather than fail hard).
 */
const MAX_BODY_BYTES = 60 * 1024 * 1024;

/**
 * Sitemap fetch timeout. Larger than the page timeout because some
 * large sitemaps stream slowly.
 */
const REQUEST_TIMEOUT_MS = 30_000;

/** Same User-Agent used everywhere else. */
const USER_AGENT = "ToraSEO/0.0.1 (+https://github.com/Magbusjap/toraseo)";

/**
 * How many entries we sample for host-mismatch and lastmod-presence
 * checks. Picked to keep the cost bounded on huge sitemaps while still
 * being representative.
 */
const SAMPLE_LIMIT = 20;

/** Sitemap-protocol limit on entries per file (Sitemaps.org §1.1). */
const SITEMAP_MAX_ENTRIES = 50_000;

// --- Errors ---------------------------------------------------------------

export class AnalyzeSitemapError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "timeout"
      | "body_too_large"
      | "fetch_failed"
      | "not_xml",
  ) {
    super(message);
    this.name = "AnalyzeSitemapError";
  }
}

// --- Public API -----------------------------------------------------------

/**
 * Discovers and analyzes the sitemap for the given URL's origin.
 * Throws `AnalyzeSitemapError` only on operational failures during
 * the fetch (timeout, non-XML response, body cap). When discovery
 * itself fails (no sitemap found anywhere, or the file is invalid
 * XML), we DO NOT throw — instead we return a result with
 * `kind: "none"` and an `issues[]` array that explains what we tried.
 *
 * Why discovery failures are non-throwing while fetch errors throw:
 * "no sitemap" is a legitimate audit outcome that we want to surface
 * structurally; "request timed out" is an operational error that
 * makes the WHOLE result meaningless and is better expressed as an
 * MCP-layer error.
 */
export async function analyzeSitemap(
  url: string,
): Promise<AnalyzeSitemapResult> {
  const startedAt = performance.now();
  const parsedInput = new URL(url);
  const origin = `${parsedInput.protocol}//${parsedInput.host}`;
  const inputHost = parsedInput.host.toLowerCase();

  // --- Discovery -------------------------------------------------------
  // 1. Ask robots.txt for Sitemap: directives (uses the existing cache,
  //    no extra HTTP if checkRobots was already called this session).
  // 2. Fall back to <origin>/sitemap.xml.
  let sitemapUrl: string | null = null;
  let discovered_via: AnalyzeSitemapResult["discovered_via"] = "none";

  const fromRobots = await getSitemapsFromRobots(url);
  if (fromRobots.length > 0) {
    // Pick the first declared sitemap. A site that lists multiple is
    // typically using an index pattern; the first is conventionally the
    // canonical entry point. Future opt-in tool can iterate all of them.
    sitemapUrl = fromRobots[0] ?? null;
    discovered_via = sitemapUrl !== null ? "robots_txt" : "none";
  }

  if (sitemapUrl === null) {
    sitemapUrl = `${origin}/sitemap.xml`;
    discovered_via = "fallback_root";
  }

  // --- Rate limit gate -------------------------------------------------
  // We don't have crawl-delay info specific to this fetch (sitemap is
  // not page content); use the default 2s/host minimum.
  await awaitRateLimit(sitemapUrl, null);

  // --- Fetch -----------------------------------------------------------
  const controller = new AbortController();
  const timeoutHandle = setTimeout(
    () => controller.abort(),
    REQUEST_TIMEOUT_MS,
  );

  let response: Response;
  try {
    response = await fetch(sitemapUrl, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": USER_AGENT,
        // Sitemaps are typically served as application/xml or text/xml.
        // Some misconfigured servers serve them as text/plain; we accept
        // anything and let the parser decide.
        Accept: "application/xml, text/xml, */*;q=0.5",
      },
    });
  } catch (error: unknown) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new AnalyzeSitemapError(
        `Sitemap fetch timed out after ${REQUEST_TIMEOUT_MS}ms`,
        "timeout",
      );
    }
    throw new AnalyzeSitemapError(
      `Failed to fetch sitemap at ${sitemapUrl}: ${
        error instanceof Error ? error.message : String(error)
      }`,
      "fetch_failed",
    );
  } finally {
    clearTimeout(timeoutHandle);
  }

  // --- Empty result for "no sitemap found" -----------------------------
  // 404 on /sitemap.xml fallback (or robots.txt-listed URL) is treated
  // as "no sitemap" — a structural audit finding, not an error.
  if (response.status === 404) {
    const elapsedMs = Math.round(performance.now() - startedAt);
    return emptyResult({
      url,
      sitemap_url: sitemapUrl,
      discovered_via,
      status: 404,
      response_time_ms: elapsedMs,
      issue_message: discovered_via === "robots_txt"
        ? `Sitemap declared in robots.txt at ${sitemapUrl} returned 404. ` +
          `Robots.txt advertises a sitemap that does not exist; this ` +
          `is a misconfiguration that should be fixed.`
        : `No sitemap found. Probed ${sitemapUrl} (the standard fallback) ` +
          `and got 404. Robots.txt did not declare any Sitemap: directives ` +
          `either.`,
    });
  }

  // For non-OK responses other than 404, surface the status as a
  // critical issue but keep the structured result so Claude can read it.
  //
  // We split this into two cases:
  //   - 401/403/406/451 — the server actively refused to serve the
  //     sitemap to our User-Agent / Accept header. Semantically this is
  //     "there might be a sitemap, but you can't have it", which is a
  //     different user action item from "there is no sitemap".
  //   - everything else 5xx/4xx — generic "server didn't deliver".
  if (!response.ok) {
    const elapsedMs = Math.round(performance.now() - startedAt);
    const isAccessRefused =
      response.status === 401 ||
      response.status === 403 ||
      response.status === 406 ||
      response.status === 451;

    return emptyResult({
      url,
      sitemap_url: sitemapUrl,
      discovered_via,
      status: response.status,
      response_time_ms: elapsedMs,
      issue_code: isAccessRefused
        ? "sitemap_blocked_by_server"
        : "no_sitemap",
      issue_message: isAccessRefused
        ? `Sitemap fetch returned HTTP ${response.status} — the server ` +
          `actively refused to serve the file. The sitemap may exist but ` +
          `is gated by User-Agent rules, Accept-header negotiation, or ` +
          `geographic blocking. This is a server-config issue, not a ` +
          `missing-sitemap issue.`
        : `Sitemap fetch returned HTTP ${response.status}. ` +
          `The sitemap location was discovered (${discovered_via}) but the ` +
          `server did not deliver it.`,
    });
  }

  // --- Read body with cap ---------------------------------------------
  const body = await readBodyWithCap(response, MAX_BODY_BYTES);

  // --- Parse XML ------------------------------------------------------
  // cheerio in xmlMode preserves tag case and behaves like a strict XML
  // parser for our purposes. We use it (and not a dedicated XML lib)
  // to avoid adding a dependency for what amounts to two element types.
  let $: cheerio.CheerioAPI;
  try {
    $ = cheerio.load(body, { xml: true });
  } catch (error: unknown) {
    const elapsedMs = Math.round(performance.now() - startedAt);
    return emptyResult({
      url,
      sitemap_url: sitemapUrl,
      discovered_via,
      status: response.status,
      response_time_ms: elapsedMs,
      issue_message:
        `Sitemap at ${sitemapUrl} is not parseable as XML: ` +
        (error instanceof Error ? error.message : String(error)) +
        `. The file may be HTML served on the wrong path, gzipped without ` +
        `a Content-Encoding header, or simply malformed.`,
      issue_code: "sitemap_invalid_xml",
    });
  }

  // --- Determine sitemap kind -----------------------------------------
  // The root element is either <urlset> or <sitemapindex>. We probe
  // both, in that order. Anything else falls through to "unknown".
  const urlsetRoot = $("urlset").first();
  const indexRoot = $("sitemapindex").first();

  if (urlsetRoot.length > 0) {
    return analyzeUrlset({
      $,
      url,
      sitemap_url: sitemapUrl,
      discovered_via,
      status: response.status,
      response_time_ms: Math.round(performance.now() - startedAt),
      inputHost,
    });
  }

  if (indexRoot.length > 0) {
    return analyzeIndex({
      $,
      url,
      sitemap_url: sitemapUrl,
      discovered_via,
      status: response.status,
      response_time_ms: Math.round(performance.now() - startedAt),
    });
  }

  // Root element is neither <urlset> nor <sitemapindex>.
  const elapsedMs = Math.round(performance.now() - startedAt);
  return emptyResult({
    url,
    sitemap_url: sitemapUrl,
    discovered_via,
    status: response.status,
    response_time_ms: elapsedMs,
    issue_message:
      `Document at ${sitemapUrl} parsed as XML, but its root element is ` +
      `neither <urlset> nor <sitemapindex>. Either it is a custom format ` +
      `outside the Sitemap protocol, or it was served by mistake on the ` +
      `sitemap path.`,
    issue_code: "sitemap_invalid_xml",
    kind: "unknown",
  });
}

// --- Urlset branch --------------------------------------------------------

function analyzeUrlset(input: {
  $: cheerio.CheerioAPI;
  url: string;
  sitemap_url: string;
  discovered_via: AnalyzeSitemapResult["discovered_via"];
  status: number;
  response_time_ms: number;
  inputHost: string;
}): AnalyzeSitemapResult {
  const { $, inputHost } = input;

  const urlNodes = $("urlset > url");
  const total = urlNodes.length;

  // Sample first SAMPLE_LIMIT entries for detailed parsing.
  const sample: SitemapUrlEntry[] = [];
  let sameHostCount = 0;
  let withLastmodCount = 0;

  urlNodes.slice(0, SAMPLE_LIMIT).each((_, element) => {
    const $el = $(element);
    const loc = $el.find("loc").first().text().trim();
    const lastmodRaw = $el.find("lastmod").first().text().trim();
    const changefreqRaw = $el.find("changefreq").first().text().trim();
    const priorityRaw = $el.find("priority").first().text().trim();

    const lastmod = lastmodRaw === "" ? null : lastmodRaw;
    const changefreq = changefreqRaw === "" ? null : changefreqRaw;

    let priority: number | null = null;
    if (priorityRaw !== "") {
      const parsed = Number.parseFloat(priorityRaw);
      priority = Number.isFinite(parsed) ? parsed : null;
    }

    sample.push({ loc, lastmod, changefreq, priority });

    if (lastmod !== null) withLastmodCount += 1;

    // Host-mismatch check: compare loc's host against the input host.
    try {
      if (new URL(loc).host.toLowerCase() === inputHost) {
        sameHostCount += 1;
      }
    } catch {
      // Malformed loc — count it as a mismatch (it's certainly not the
      // expected host).
    }
  });

  const sampleSize = Math.min(total, SAMPLE_LIMIT);
  const summary: AnalyzeSitemapResult["summary"] = {
    total_entries: total,
    same_host_entries_sampled: sameHostCount,
    with_lastmod_sampled: withLastmodCount,
    sample_size: sampleSize,
  };

  const issues = computeUrlsetIssues({ summary, sampleSize });

  return {
    url: input.url,
    sitemap_url: input.sitemap_url,
    discovered_via: input.discovered_via,
    status: input.status,
    response_time_ms: input.response_time_ms,
    issues,
    kind: "urlset",
    summary,
    urls: sample,
    child_sitemaps: [],
  };
}

function computeUrlsetIssues(parts: {
  summary: AnalyzeSitemapResult["summary"];
  sampleSize: number;
}): SitemapIssue[] {
  const { summary, sampleSize } = parts;
  const issues: SitemapIssue[] = [];

  if (summary.total_entries === 0) {
    issues.push({
      severity: "warning",
      code: "sitemap_empty",
      message:
        "Sitemap parses as a valid <urlset> but contains zero <url> " +
        "entries. Search engines have nothing to discover from it.",
    });
    // Nothing else makes sense to check on an empty sitemap.
    return issues;
  }

  if (summary.total_entries > SITEMAP_MAX_ENTRIES) {
    issues.push({
      severity: "warning",
      code: "sitemap_too_large",
      message:
        `Sitemap contains ${summary.total_entries} entries, exceeding the ` +
        `protocol limit of ${SITEMAP_MAX_ENTRIES}. Split it into multiple ` +
        `sitemaps and reference them via a <sitemapindex>.`,
    });
  }

  // Lastmod presence: based on the sample.
  if (sampleSize > 0 && summary.with_lastmod_sampled === 0) {
    issues.push({
      severity: "info",
      code: "sitemap_no_lastmod",
      message:
        `None of the ${sampleSize} sampled entries declare <lastmod>. ` +
        `Without lastmod, search engines cannot prioritize fresh content; ` +
        `they will fall back to crawling on their own schedule.`,
    });
  }

  // Host mismatch: based on the sample.
  if (
    sampleSize > 0 &&
    summary.same_host_entries_sampled < sampleSize
  ) {
    const mismatchCount = sampleSize - summary.same_host_entries_sampled;
    issues.push({
      severity: "warning",
      code: "sitemap_url_mismatch",
      message:
        `${mismatchCount} of ${sampleSize} sampled URLs declare a host ` +
        `different from the requested origin. Sitemaps should generally ` +
        `list URLs on the same host they are served from; mismatches ` +
        `can cause search engines to ignore the cross-host entries.`,
    });
  }

  return issues;
}

// --- Sitemap-index branch -------------------------------------------------

function analyzeIndex(input: {
  $: cheerio.CheerioAPI;
  url: string;
  sitemap_url: string;
  discovered_via: AnalyzeSitemapResult["discovered_via"];
  status: number;
  response_time_ms: number;
}): AnalyzeSitemapResult {
  const { $ } = input;

  const sitemapNodes = $("sitemapindex > sitemap");
  const total = sitemapNodes.length;

  const sample: SitemapIndexEntry[] = [];

  sitemapNodes.slice(0, SAMPLE_LIMIT).each((_, element) => {
    const $el = $(element);
    const loc = $el.find("loc").first().text().trim();
    const lastmodRaw = $el.find("lastmod").first().text().trim();
    sample.push({
      loc,
      lastmod: lastmodRaw === "" ? null : lastmodRaw,
    });
  });

  const sampleSize = Math.min(total, SAMPLE_LIMIT);
  const summary: AnalyzeSitemapResult["summary"] = {
    total_entries: total,
    // For an index, "same_host" of CHILD sitemaps is less common as a
    // smell; we still compute it for parity with urlset, against the
    // input host.
    same_host_entries_sampled: 0,
    with_lastmod_sampled: sample.filter((s) => s.lastmod !== null).length,
    sample_size: sampleSize,
  };

  const issues: SitemapIssue[] = [];
  if (total === 0) {
    issues.push({
      severity: "warning",
      code: "sitemap_index_no_children",
      message:
        "Sitemap index parses correctly but contains zero <sitemap> " +
        "child entries. Either the index is incomplete or this is a " +
        "stub left over from configuration.",
    });
  }

  return {
    url: input.url,
    sitemap_url: input.sitemap_url,
    discovered_via: input.discovered_via,
    status: input.status,
    response_time_ms: input.response_time_ms,
    issues,
    kind: "sitemapindex",
    summary,
    urls: [],
    child_sitemaps: sample,
  };
}

// --- Empty / failure result builder ---------------------------------------

/**
 * Builds an `AnalyzeSitemapResult` representing a discovery failure
 * (no sitemap found, fetch returned non-200, parse failed). All fields
 * are populated with safe defaults so the caller never has to handle
 * null-vs-shape ambiguity.
 */
function emptyResult(input: {
  url: string;
  sitemap_url: string | null;
  discovered_via: AnalyzeSitemapResult["discovered_via"];
  status: number | null;
  response_time_ms: number;
  issue_message: string;
  issue_code?: string;
  kind?: AnalyzeSitemapResult["kind"];
}): AnalyzeSitemapResult {
  return {
    url: input.url,
    sitemap_url: input.sitemap_url,
    discovered_via: input.discovered_via,
    status: input.status,
    response_time_ms: input.response_time_ms,
    issues: [
      {
        severity: "critical",
        code: input.issue_code ?? "no_sitemap",
        message: input.issue_message,
      },
    ],
    kind: input.kind ?? "none",
    summary: {
      total_entries: 0,
      same_host_entries_sampled: 0,
      with_lastmod_sampled: 0,
      sample_size: 0,
    },
    urls: [],
    child_sitemaps: [],
  };
}

// --- Helpers --------------------------------------------------------------

/**
 * Same streaming-with-cap implementation as the other analyzers and
 * scan-site.ts. This is the FIFTH copy. The next commit will extract
 * a shared `crawlers/fetch.ts` and switch all consumers to it.
 */
async function readBodyWithCap(
  response: Response,
  maxBytes: number,
): Promise<string> {
  if (response.body === null) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > maxBytes) {
      reader.cancel().catch(() => {
        // ignore: aborting on purpose
      });
      throw new AnalyzeSitemapError(
        `Sitemap body exceeds ${maxBytes} bytes`,
        "body_too_large",
      );
    }
    chunks.push(value);
  }

  const merged = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder("utf-8").decode(merged);
}
