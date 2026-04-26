/**
 * Redirect-chain analyzer for site-audit Mode A.
 *
 * Walks the HTTP redirect chain manually, one fetch per step, and
 * reports the full path. Honors robots.txt and rate limits — the
 * chain may cross hosts, so each step is rate-limited against its
 * own host.
 *
 * Why manual walking instead of `redirect: "follow"`:
 *   The fetch API hides intermediate steps when redirects are auto-
 *   followed; we only see the final URL. For an audit tool, the
 *   intermediate steps ARE the data — we need to see each Location
 *   header, each status, each transition.
 *
 * HEAD-then-GET strategy:
 *   First attempt is HEAD (fast, no body). If the server returns
 *   405 Method Not Allowed (or 501 Not Implemented), we retry the
 *   same step as GET. This handles servers that don't speak HEAD,
 *   without paying body-download cost on cooperative servers.
 *
 * Architectural placement:
 *   Lives in `analyzers/site/` (Mode A — URL-based). The MCP tool
 *   wrapper in `tools/site/check-redirects.ts` is a thin adapter on
 *   top, mirroring the meta.ts / headings.ts / sitemap.ts pattern.
 *
 * Note on fetch boilerplate:
 *   This analyzer is the SIXTH consumer of the fetch-with-timeout
 *   boilerplate. We deliberately do NOT extract a shared helper here:
 *   redirect-checking is so different from the other consumers
 *   (manual redirect handling, no body parsing, no content-type
 *   guard, HEAD method) that the unifying abstraction is no longer
 *   obvious. Decision deferred to post-MVP.
 */

import { checkRobots } from "../../crawlers/robots-txt.js";
import { awaitRateLimit } from "../../crawlers/rate-limiter.js";
import { USER_AGENT } from "../../constants.js";
import type {
  CheckRedirectsResult,
  RedirectIssue,
  RedirectStep,
} from "../../types.js";

// --- Constants ------------------------------------------------------------

/**
 * Maximum number of redirects we'll follow before giving up. Chrome
 * uses 20, Firefox 20, but for an audit tool 10 is enough — anything
 * longer is almost always a misconfiguration (or a loop).
 */
const MAX_HOPS = 10;

/**
 * Hops above which we warn the chain is "too long for SEO". Google's
 * recommendation is to keep redirect chains short; 3+ hops measurably
 * degrade crawl budget.
 */
const CHAIN_TOO_LONG_THRESHOLD = 2;

/** Per-step timeout. Tighter than page fetch because we issue multiple. */
const STEP_TIMEOUT_MS = 10_000;

// --- Errors ---------------------------------------------------------------

export class CheckRedirectsError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "timeout"
      | "fetch_failed"
      | "robots_disallowed"
      | "robots_unreachable"
      | "invalid_location",
  ) {
    super(message);
    this.name = "CheckRedirectsError";
  }
}

// --- Public API -----------------------------------------------------------

/**
 * Walks the redirect chain starting at `inputUrl`. Returns the full
 * trail with pre-computed verdicts. Throws `CheckRedirectsError` on
 * operational failure of the FIRST step (where there's nothing to
 * report yet); failures mid-chain are recorded as issues with the
 * chain truncated at the failing step.
 */
export async function checkRedirects(
  inputUrl: string,
): Promise<CheckRedirectsResult> {
  const startedAt = performance.now();

  // --- robots.txt gate on the input URL --------------------------------
  // We only check robots for the FIRST URL. Cross-host redirects can
  // legitimately go to many destinations; checking robots at every
  // hop would multiply HTTP traffic and produce surprising refusals
  // mid-chain. The standard interpretation: if the user has robots-
  // permission for the entry point, the chain is fair game.
  const robotsVerdict = await checkRobots(inputUrl);
  if (!robotsVerdict.allowed) {
    if (robotsVerdict.reason === "robots_unreachable") {
      throw new CheckRedirectsError(
        `Cannot determine robots.txt status for ${robotsVerdict.robots_txt_url}; ` +
          `treating as disallowed per CRAWLING_POLICY.`,
        "robots_unreachable",
      );
    }
    throw new CheckRedirectsError(
      `Disallowed by robots.txt at ${robotsVerdict.robots_txt_url} ` +
        `(reason: ${robotsVerdict.reason}).`,
      "robots_disallowed",
    );
  }

  // --- Walk the chain --------------------------------------------------
  const chain: RedirectStep[] = [];
  const visitedUrls = new Set<string>();
  let currentUrl = inputUrl;
  let loopDetectedAt: string | null = null;
  let truncatedAtLimit = false;

  for (let hop = 0; hop <= MAX_HOPS; hop++) {
    // Loop detection BEFORE the fetch: if we've seen this URL before
    // in this chain, we're in a cycle. Don't fetch again.
    if (visitedUrls.has(currentUrl)) {
      loopDetectedAt = currentUrl;
      break;
    }
    visitedUrls.add(currentUrl);

    // Limit check: if we're at the cap and would need ANOTHER fetch
    // to satisfy a redirect, stop here. The current step already
    // exists in chain (or doesn't, depending on iteration).
    if (hop > MAX_HOPS) {
      truncatedAtLimit = true;
      break;
    }

    // Rate-limit per-host. Each hop in the chain may be on a different
    // host; the limiter is keyed by hostname, so cross-host redirects
    // pay the per-host minimum delay correctly.
    await awaitRateLimit(currentUrl, null);

    let step: RedirectStep;
    try {
      step = await fetchOneStep(currentUrl);
    } catch (error: unknown) {
      // If the very first step fails, propagate. Mid-chain failures
      // become a chain entry with status 0 and a "fetch_failed" issue.
      if (chain.length === 0) {
        if (error instanceof CheckRedirectsError) throw error;
        throw new CheckRedirectsError(
          `Failed to fetch ${currentUrl}: ${
            error instanceof Error ? error.message : String(error)
          }`,
          "fetch_failed",
        );
      }
      // Mid-chain failure: record a synthetic step with status 0 to
      // mark the failure point, then stop walking.
      chain.push({
        url: currentUrl,
        status: 0,
        location: null,
        is_absolute: false,
        method: "HEAD",
      });
      break;
    }

    chain.push(step);

    // Terminal step: status not in 3xx, or 3xx without Location
    // (broken redirect handled separately in verdicts).
    if (step.status < 300 || step.status >= 400) break;
    if (step.location === null) break;

    // Resolve the next URL. Relative Locations are resolved against
    // the current URL per RFC 7231 §7.1.2.
    let nextUrl: string;
    try {
      nextUrl = new URL(step.location, currentUrl).href;
    } catch (error: unknown) {
      // Malformed Location. Record the issue downstream; stop walking.
      throw new CheckRedirectsError(
        `Step ${hop + 1} returned invalid Location header "${step.location}" ` +
          `at ${currentUrl}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        "invalid_location",
      );
    }

    currentUrl = nextUrl;
  }

  // --- Compute summary fields ------------------------------------------
  const lastStep = chain[chain.length - 1];
  const finalUrl = lastStep?.url ?? inputUrl;
  const finalStatus = lastStep?.status ?? 0;
  // total_hops counts redirects, not entries. A single-entry chain
  // (direct 200) is 0 hops.
  const totalHops = Math.max(chain.length - 1, 0);
  const elapsedMs = Math.round(performance.now() - startedAt);

  // --- Compute verdicts -----------------------------------------------
  const issues = computeIssues({
    inputUrl,
    chain,
    loopDetectedAt,
    truncatedAtLimit,
    finalStatus,
  });

  return {
    url: inputUrl,
    final_url: finalUrl,
    final_status: finalStatus,
    total_hops: totalHops,
    response_time_ms: elapsedMs,
    issues,
    chain,
  };
}

// --- Per-step fetch -------------------------------------------------------

/**
 * Issues one HEAD request to `url` with `redirect: "manual"` and a
 * timeout, falling back to GET if the server returns 405 or 501.
 * Returns the resulting RedirectStep with method and Location parsed.
 */
async function fetchOneStep(url: string): Promise<RedirectStep> {
  let step = await fetchOneStepMethod(url, "HEAD");

  // Some servers return 405 (Method Not Allowed) or 501 (Not Implemented)
  // on HEAD. Retry as GET — we still ignore the body.
  if (step.status === 405 || step.status === 501) {
    step = await fetchOneStepMethod(url, "GET");
  }

  return step;
}

async function fetchOneStepMethod(
  url: string,
  method: "HEAD" | "GET",
): Promise<RedirectStep> {
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), STEP_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      // CRITICAL: do NOT auto-follow. We need to see each step.
      redirect: "manual",
      signal: controller.signal,
      headers: {
        "User-Agent": USER_AGENT,
        // Accept anything; we don't care about the body.
        Accept: "*/*",
      },
    });
  } catch (error: unknown) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new CheckRedirectsError(
        `Request to ${url} timed out after ${STEP_TIMEOUT_MS}ms`,
        "timeout",
      );
    }
    throw new CheckRedirectsError(
      `Network error fetching ${url}: ${
        error instanceof Error ? error.message : String(error)
      }`,
      "fetch_failed",
    );
  } finally {
    clearTimeout(timeoutHandle);
  }

  // For HEAD/GET we never read the body. Cancel the body stream
  // explicitly so the connection can be reused. This matters for
  // long redirect chains on the same host.
  response.body?.cancel().catch(() => {
    // ignore: aborting on purpose
  });

  const locationRaw = response.headers.get("location");
  const location = locationRaw === null ? null : locationRaw.trim();
  const is_absolute =
    location !== null && /^https?:\/\//i.test(location);

  return {
    url,
    status: response.status,
    location: location === "" ? null : location,
    is_absolute,
    method,
  };
}

// --- Verdict computation --------------------------------------------------

function computeIssues(parts: {
  inputUrl: string;
  chain: RedirectStep[];
  loopDetectedAt: string | null;
  truncatedAtLimit: boolean;
  finalStatus: number;
}): RedirectIssue[] {
  const { chain, loopDetectedAt, truncatedAtLimit, finalStatus } = parts;
  const issues: RedirectIssue[] = [];

  // --- Critical: redirect loop ---------------------------------------
  if (loopDetectedAt !== null) {
    issues.push({
      severity: "critical",
      code: "redirect_loop",
      message:
        `Redirect loop detected: URL ${loopDetectedAt} appeared twice in ` +
        `the chain. Search engines and browsers will refuse to follow ` +
        `looping redirects, making the destination URL unreachable.`,
    });
  }

  // --- Warning: hit the hop limit ------------------------------------
  if (truncatedAtLimit) {
    issues.push({
      severity: "warning",
      code: "too_many_redirects",
      message:
        `Chain exceeded ${MAX_HOPS} hops without resolving. Even browsers ` +
        `cap chains at this length; chains this long always indicate ` +
        `serious misconfiguration.`,
    });
  }

  // --- Critical: broken redirect (3xx without Location) --------------
  for (const step of chain) {
    if (
      step.status >= 300 &&
      step.status < 400 &&
      step.location === null
    ) {
      issues.push({
        severity: "critical",
        code: "broken_redirect",
        message:
          `Step at ${step.url} returned HTTP ${step.status} but no Location ` +
          `header. Browsers cannot follow this redirect; users see an error.`,
      });
    }
  }

  // --- Critical: terminal failure ------------------------------------
  if (finalStatus >= 400 && finalStatus < 500) {
    issues.push({
      severity: "critical",
      code: "redirect_to_4xx",
      message:
        `Chain terminates at HTTP ${finalStatus}. The final destination is ` +
        `a client error \u2014 broken link, missing page, or access denied.`,
    });
  } else if (finalStatus >= 500) {
    issues.push({
      severity: "critical",
      code: "redirect_to_5xx",
      message:
        `Chain terminates at HTTP ${finalStatus}. The final destination is ` +
        `a server error; this is likely transient but still breaks the URL ` +
        `for users hitting it right now.`,
    });
  }

  // --- Warning: chain too long for SEO -------------------------------
  // Count actual redirects, not entries. Skip if loop or limit already
  // dominate the picture (those are louder findings).
  const redirectCount = Math.max(chain.length - 1, 0);
  if (
    redirectCount > CHAIN_TOO_LONG_THRESHOLD &&
    loopDetectedAt === null &&
    !truncatedAtLimit
  ) {
    issues.push({
      severity: "warning",
      code: "chain_too_long",
      message:
        `Chain has ${redirectCount} redirects. Google recommends keeping ` +
        `chains to 2 or fewer; longer chains burn crawl budget and slow ` +
        `down user navigation.`,
    });
  }

  // --- Warning: HTTPS-to-HTTP downgrade ------------------------------
  // Walk consecutive pairs and check transitions.
  for (let i = 0; i + 1 < chain.length; i++) {
    const from = chain[i];
    const to = chain[i + 1];
    if (from === undefined || to === undefined) continue;

    let fromProto: string;
    let toProto: string;
    try {
      fromProto = new URL(from.url).protocol;
      toProto = new URL(to.url).protocol;
    } catch {
      continue;
    }

    if (fromProto === "https:" && toProto === "http:") {
      issues.push({
        severity: "warning",
        code: "https_to_http_redirect",
        message:
          `Step ${i + 1} redirects from HTTPS to HTTP (${from.url} \u2192 ` +
          `${to.url}). This downgrades transport security and modern ` +
          `browsers may block it.`,
      });
    }
  }

  // --- Info: relative Location header --------------------------------
  // RFC 7231 allows relative Location since 2014, but absolute is
  // recommended for portability. Some old crawlers struggle with it.
  for (const step of chain) {
    if (step.location !== null && !step.is_absolute) {
      issues.push({
        severity: "info",
        code: "relative_location_header",
        message:
          `Step at ${step.url} returned a relative Location header ` +
          `("${step.location}"). RFC 7231 permits this since 2014, but ` +
          `absolute URLs in Location are more portable and clearer in audits.`,
      });
    }
  }

  // --- Info: no redirects (positive note) ----------------------------
  if (
    redirectCount === 0 &&
    finalStatus >= 200 &&
    finalStatus < 300 &&
    issues.length === 0
  ) {
    issues.push({
      severity: "info",
      code: "no_redirects",
      message:
        `URL responds directly with HTTP ${finalStatus} \u2014 no redirects ` +
        `involved. This is the optimal case for crawl efficiency.`,
    });
  }

  return issues;
}
