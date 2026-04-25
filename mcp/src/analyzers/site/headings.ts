/**
 * Heading-structure analyzer for site-audit Mode A.
 *
 * Fetches a single URL and walks every <h1>..<h6> in DOM order.
 * Produces three views of the data:
 *   - flat list of headings (with level, text, length)
 *   - aggregate summary (counts, h1 presence, skip count)
 *   - severity-tagged verdicts ready for Claude or a dashboard
 *
 * Architectural placement:
 *   Lives in `analyzers/site/` (Mode A — URL-based). The MCP tool
 *   wrapper in `tools/site/analyze-headings.ts` is a thin adapter on
 *   top, mirroring the meta.ts → analyze-meta.ts pattern.
 *
 * Network etiquette:
 *   The fetch path mirrors meta.ts and scan-site.ts — robots.txt gate,
 *   rate-limit gate, then the actual fetch with the same User-Agent,
 *   timeout, body-size cap, and content-type guard. That logic is
 *   duplicated for now; a future refactor will extract it into a
 *   shared `crawlers/fetch-html.ts`. Doing it now would still be
 *   premature — even with three consumers, the right abstraction is
 *   not yet obvious (e.g. should `analyze_sitemap` reuse it for XML?).
 */

import * as cheerio from "cheerio";

import { checkRobots } from "../../crawlers/robots-txt.js";
import { awaitRateLimit } from "../../crawlers/rate-limiter.js";
import type {
  AnalyzeHeadingsResult,
  HeadingEntry,
  HeadingIssue,
} from "../../types.js";

// --- Constants ------------------------------------------------------------

/** Max bytes of HTML we will buffer. Matches scan-site.ts and meta.ts. */
const MAX_BODY_BYTES = 10 * 1024 * 1024;

/** Hard request timeout. Matches scan-site.ts and meta.ts. */
const REQUEST_TIMEOUT_MS = 15_000;

/** Same honest User-Agent used everywhere else. */
const USER_AGENT = "ToraSEO/0.0.1 (+https://github.com/Magbusjap/toraseo)";

/**
 * Length thresholds for h1 specifically. Heuristics, not hard rules:
 *   - very short titles (<10) are often brand-only and miss keyword opportunity
 *   - very long titles (>70) drift from "page heading" toward "paragraph"
 * h2..h6 are not length-checked — too many false positives across the
 * variety of legitimate page layouts (FAQ accordions, navigation, etc.).
 */
const H1_MIN_CHARS = 10;
const H1_MAX_CHARS = 70;

/**
 * Threshold above which level skips become a warning rather than info.
 * Two skips = could be a coincidence (e.g. one component imports a
 * deeper heading level). Three or more = systematic structural issue.
 */
const SYSTEMATIC_SKIP_THRESHOLD = 2;

// --- Errors ---------------------------------------------------------------

/**
 * Same shape as ScanSiteError and AnalyzeMetaError so MCP wrapper
 * formats it uniformly.
 */
export class AnalyzeHeadingsError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "timeout"
      | "body_too_large"
      | "fetch_failed"
      | "not_html"
      | "robots_disallowed"
      | "robots_unreachable",
  ) {
    super(message);
    this.name = "AnalyzeHeadingsError";
  }
}

// --- Public API -----------------------------------------------------------

/**
 * Performs the heading-structure analysis. Throws
 * `AnalyzeHeadingsError` on operational failures (timeout,
 * robots-blocked, etc.).
 */
export async function analyzeHeadings(
  url: string,
): Promise<AnalyzeHeadingsResult> {
  // --- robots.txt gate -------------------------------------------------
  const robotsVerdict = await checkRobots(url);
  if (!robotsVerdict.allowed) {
    if (robotsVerdict.reason === "robots_unreachable") {
      throw new AnalyzeHeadingsError(
        `Cannot determine robots.txt status for ${robotsVerdict.robots_txt_url}; ` +
          `treating as disallowed per CRAWLING_POLICY.`,
        "robots_unreachable",
      );
    }
    throw new AnalyzeHeadingsError(
      `Disallowed by robots.txt at ${robotsVerdict.robots_txt_url} ` +
        `(reason: ${robotsVerdict.reason}).`,
      "robots_disallowed",
    );
  }

  // --- rate-limit gate -------------------------------------------------
  const crawlDelayMs =
    robotsVerdict.crawl_delay_seconds === null
      ? null
      : robotsVerdict.crawl_delay_seconds * 1000;
  await awaitRateLimit(url, crawlDelayMs);

  // --- fetch -----------------------------------------------------------
  const startedAt = performance.now();
  const controller = new AbortController();
  const timeoutHandle = setTimeout(
    () => controller.abort(),
    REQUEST_TIMEOUT_MS,
  );

  let response: Response;
  try {
    response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml",
      },
    });
  } catch (error: unknown) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new AnalyzeHeadingsError(
        `Request timed out after ${REQUEST_TIMEOUT_MS}ms`,
        "timeout",
      );
    }
    throw new AnalyzeHeadingsError(
      `Failed to fetch ${url}: ${
        error instanceof Error ? error.message : String(error)
      }`,
      "fetch_failed",
    );
  } finally {
    clearTimeout(timeoutHandle);
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!isHtmlContentType(contentType)) {
    throw new AnalyzeHeadingsError(
      `Response is not HTML (content-type: ${contentType || "unknown"})`,
      "not_html",
    );
  }

  const body = await readBodyWithCap(response, MAX_BODY_BYTES);
  const elapsedMs = Math.round(performance.now() - startedAt);

  // --- parse + extract -------------------------------------------------
  const $ = cheerio.load(body);
  const finalUrl = response.url;

  const headings = extractHeadings($);
  const summary = computeSummary(headings);
  const issues = computeIssues(headings, summary);

  return {
    url: finalUrl,
    status: response.status,
    response_time_ms: elapsedMs,
    issues,
    headings,
    summary,
  };
}

// --- Extraction -----------------------------------------------------------

/**
 * Collects every <h1>..<h6> in DOM order. Uses a single cheerio query
 * with the union selector and lets cheerio guarantee document order
 * (it traverses the DOM tree depth-first, which equals document order
 * for well-formed HTML).
 *
 * Empty headings (whitespace only) are kept in the list — they'll
 * surface as an `empty_heading` issue, which is exactly what we want.
 * Filtering them out here would lose information.
 */
function extractHeadings($: cheerio.CheerioAPI): HeadingEntry[] {
  const result: HeadingEntry[] = [];
  $("h1, h2, h3, h4, h5, h6").each((_, element) => {
    // tagName comes back lowercased from cheerio; second char is the digit.
    const tagName = element.tagName.toLowerCase();
    const levelDigit = Number.parseInt(tagName.slice(1), 10);
    if (
      levelDigit !== 1 &&
      levelDigit !== 2 &&
      levelDigit !== 3 &&
      levelDigit !== 4 &&
      levelDigit !== 5 &&
      levelDigit !== 6
    ) {
      // Defensive: should never happen for h1..h6. Skip silently.
      return;
    }
    // .text() concatenates all descendant text nodes; we trim and also
    // collapse internal whitespace so multi-line markup doesn't inflate
    // length_chars artificially.
    const rawText = $(element).text();
    const text = rawText.replace(/\s+/g, " ").trim();
    result.push({
      level: levelDigit,
      text,
      length_chars: text.length,
    });
  });
  return result;
}

// --- Summary --------------------------------------------------------------

function computeSummary(
  headings: HeadingEntry[],
): AnalyzeHeadingsResult["summary"] {
  const by_level = { h1: 0, h2: 0, h3: 0, h4: 0, h5: 0, h6: 0 };
  for (const h of headings) {
    by_level[`h${h.level}` as keyof typeof by_level] += 1;
  }

  // Skip detection. Walk pairs of consecutive headings; a "skip" is any
  // descent more than one level (h1→h3, h2→h5). Going up (h3→h2) is not
  // a skip — that's a normal section transition.
  // The first heading is compared against implicit "level 0" root, so a
  // page that opens with h2 instead of h1 counts as one skip.
  let skip_count = 0;
  let previousLevel = 0;
  for (const h of headings) {
    if (h.level - previousLevel > 1) {
      skip_count += 1;
    }
    previousLevel = h.level;
  }

  return {
    total: headings.length,
    by_level,
    has_h1: by_level.h1 > 0,
    h1_count: by_level.h1,
    skip_count,
  };
}

// --- Verdicts -------------------------------------------------------------

/**
 * Produces severity-tagged findings. Same philosophy as meta.ts:
 * the consumer sees pre-computed verdicts, not raw numbers it has to
 * interpret.
 */
function computeIssues(
  headings: HeadingEntry[],
  summary: AnalyzeHeadingsResult["summary"],
): HeadingIssue[] {
  const issues: HeadingIssue[] = [];

  // --- Critical: page has no headings at all -------------------------
  if (summary.total === 0) {
    issues.push({
      severity: "critical",
      code: "no_headings",
      message:
        "Page has no <h1>..<h6> elements at all. Search engines and " +
        "screen readers rely on heading structure to understand the " +
        "page outline.",
    });
    // No further checks make sense without any headings.
    return issues;
  }

  // --- Critical: missing h1 ------------------------------------------
  if (!summary.has_h1) {
    issues.push({
      severity: "critical",
      code: "no_h1",
      message:
        "Page has headings but no <h1>. Every page should declare its " +
        "primary topic with a single <h1>; without it, search engines " +
        "fall back to <title> which is less specific.",
    });
  }

  // --- Warning: multiple h1 ------------------------------------------
  if (summary.h1_count > 1) {
    issues.push({
      severity: "warning",
      code: "multiple_h1",
      message:
        `Page has ${summary.h1_count} <h1> elements. While HTML5 permits ` +
        `multiple h1 inside <article>/<section>, search engines still ` +
        `treat the first one as primary; extras dilute the topical signal.`,
    });
  }

  // --- Warning: empty headings ---------------------------------------
  // Reported as a single aggregated issue rather than one-per-heading,
  // to keep issues[] small and scannable.
  const emptyCount = headings.filter((h) => h.length_chars === 0).length;
  if (emptyCount > 0) {
    issues.push({
      severity: "warning",
      code: "empty_heading",
      message:
        `Found ${emptyCount} empty heading${emptyCount === 1 ? "" : "s"} ` +
        `(text content is whitespace only). Empty headings produce no ` +
        `outline information and confuse assistive technology.`,
    });
  }

  // --- Level skips ---------------------------------------------------
  if (summary.skip_count > 0) {
    const isSystematic = summary.skip_count > SYSTEMATIC_SKIP_THRESHOLD;
    issues.push({
      severity: isSystematic ? "warning" : "info",
      code: isSystematic
        ? "heading_level_skip_systematic"
        : "heading_level_skip",
      message: isSystematic
        ? `Found ${summary.skip_count} heading-level skips (e.g. h1 → h3 ` +
          `bypassing h2). This indicates a systematic outline issue ` +
          `worth refactoring; both SEO and accessibility tools flag it.`
        : `Found ${summary.skip_count} heading-level skip` +
          `${summary.skip_count === 1 ? "" : "s"} (e.g. h1 → h3 bypassing h2). ` +
          `Not strictly an SEO issue, but cleaner outline order helps ` +
          `accessibility tools and screen readers.`,
    });
  }

  // --- h1 length (info only, on the first h1) ------------------------
  // Multiple-h1 case is already flagged above; we only judge length on
  // the FIRST h1 to avoid noise when a page legitimately has several.
  const firstH1 = headings.find((h) => h.level === 1);
  if (firstH1 !== undefined) {
    if (firstH1.length_chars > 0 && firstH1.length_chars < H1_MIN_CHARS) {
      issues.push({
        severity: "info",
        code: "h1_too_short",
        message:
          `Primary <h1> is ${firstH1.length_chars} characters; under ` +
          `${H1_MIN_CHARS} chars often means the heading is brand-only ` +
          `and misses keyword opportunity.`,
      });
    } else if (firstH1.length_chars > H1_MAX_CHARS) {
      issues.push({
        severity: "info",
        code: "h1_too_long",
        message:
          `Primary <h1> is ${firstH1.length_chars} characters; over ` +
          `${H1_MAX_CHARS} chars drifts from "heading" toward "paragraph" ` +
          `and reads poorly in SERPs and social previews.`,
      });
    }
  }

  return issues;
}

// --- Helpers --------------------------------------------------------------

function isHtmlContentType(contentType: string): boolean {
  const normalized = contentType.toLowerCase();
  return (
    normalized.includes("text/html") ||
    normalized.includes("application/xhtml+xml")
  );
}

/**
 * Same streaming-with-cap implementation as `tools/scan-site.ts` and
 * `analyzers/site/meta.ts`. Triplicated now; we'll extract to
 * `crawlers/fetch-html.ts` once we can see what abstraction fits all
 * three (and the upcoming sitemap analyzer, which fetches XML, not HTML).
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
      throw new AnalyzeHeadingsError(
        `Response body exceeds ${maxBytes} bytes`,
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
