/**
 * Meta-tag analyzer for site-audit Mode A.
 *
 * Fetches a single URL and extracts the four blocks of meta information
 * a typical SEO audit looks at: basic SEO tags, Open Graph, Twitter
 * Cards, and page-level technical tags. Produces both the raw values
 * and a pre-computed `issues[]` array of severity-tagged verdicts.
 *
 * Architectural placement:
 *   This module lives in `analyzers/site/` (Mode A — URL-based). The
 *   MCP tool wrapper in `tools/site/analyze-meta.ts` is a thin adapter
 *   on top, so a future orchestrator (`audit_full`) can call
 *   `analyzeMeta()` directly without going through the MCP layer.
 *
 *   Same pattern as `crawlers/robots-txt.ts` + `tools/check-robots.ts`.
 *
 * Network etiquette:
 *   The fetch path here intentionally mirrors `tools/scan-site.ts` —
 *   robots.txt gate, rate-limit gate, then the actual fetch with the
 *   same User-Agent, timeout, body-size cap, and content-type guard.
 *   That logic is duplicated for now; a future refactor will extract
 *   it into a shared `crawlers/fetch-html.ts`. Doing it now would be
 *   premature: with two consumers we still aren't sure what the right
 *   abstraction is.
 */

import * as cheerio from "cheerio";

import { checkRobots } from "../../crawlers/robots-txt.js";
import { awaitRateLimit } from "../../crawlers/rate-limiter.js";
import { USER_AGENT } from "../../constants.js";
import type { AnalyzeMetaResult, MetaIssue } from "../../types.js";

// --- Constants ------------------------------------------------------------

/** Max bytes of HTML we will buffer. Matches scan-site.ts. */
const MAX_BODY_BYTES = 10 * 1024 * 1024;

/** Hard request timeout. Matches scan-site.ts. */
const REQUEST_TIMEOUT_MS = 15_000;

/**
 * SEO industry guidance for title length. Sources broadly agree that
 * Google truncates around 50–60 characters in desktop SERPs.
 */
const TITLE_MIN_CHARS = 30;
const TITLE_MAX_CHARS = 60;

/**
 * SEO industry guidance for description length. Google's snippet width
 * fits roughly 150–160 characters; below 50 is too sparse to be useful.
 */
const DESCRIPTION_MIN_CHARS = 50;
const DESCRIPTION_MAX_CHARS = 160;

// --- Errors ---------------------------------------------------------------

/**
 * Same shape as ScanSiteError so the MCP tool wrapper can format it
 * uniformly. Kept local rather than imported because future analyzers
 * may add domain-specific codes (e.g. `analyze_schema` may emit
 * `schema_invalid_jsonld`).
 */
export class AnalyzeMetaError extends Error {
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
    this.name = "AnalyzeMetaError";
  }
}

// --- Public API -----------------------------------------------------------

/**
 * Performs the meta-tag analysis. Throws `AnalyzeMetaError` on
 * operational failures (timeout, robots-blocked, etc.).
 */
export async function analyzeMeta(url: string): Promise<AnalyzeMetaResult> {
  // --- robots.txt gate -------------------------------------------------
  const robotsVerdict = await checkRobots(url);
  if (!robotsVerdict.allowed) {
    if (robotsVerdict.reason === "robots_unreachable") {
      throw new AnalyzeMetaError(
        `Cannot determine robots.txt status for ${robotsVerdict.robots_txt_url}; ` +
          `treating as disallowed per CRAWLING_POLICY.`,
        "robots_unreachable",
      );
    }
    throw new AnalyzeMetaError(
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
      throw new AnalyzeMetaError(
        `Request timed out after ${REQUEST_TIMEOUT_MS}ms`,
        "timeout",
      );
    }
    throw new AnalyzeMetaError(
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
    throw new AnalyzeMetaError(
      `Response is not HTML (content-type: ${contentType || "unknown"})`,
      "not_html",
    );
  }

  const body = await readBodyWithCap(response, MAX_BODY_BYTES);
  const elapsedMs = Math.round(performance.now() - startedAt);

  // --- parse + extract -------------------------------------------------
  const $ = cheerio.load(body);
  const finalUrl = response.url; // canonical URL after redirects

  const basic = extractBasic($, finalUrl);
  const open_graph = extractOpenGraph($);
  const twitter = extractTwitter($, open_graph);
  const technical = extractTechnical($);

  // --- compute verdicts ------------------------------------------------
  const issues = computeIssues({ basic, open_graph, twitter, technical });

  return {
    url: finalUrl,
    status: response.status,
    response_time_ms: elapsedMs,
    issues,
    basic,
    open_graph,
    twitter,
    technical,
  };
}

// --- Extraction: basic SEO tags -------------------------------------------

function extractBasic(
  $: cheerio.CheerioAPI,
  finalUrl: string,
): AnalyzeMetaResult["basic"] {
  // <title>: first occurrence inside <head>, trimmed.
  const titleText = $("head > title").first().text().trim();
  const title =
    titleText === ""
      ? null
      : { value: titleText, length_chars: titleText.length };

  // <meta name="description">: first occurrence, content attribute trimmed.
  const descRaw = $('meta[name="description"]').first().attr("content");
  const descText = descRaw?.trim() ?? "";
  const description =
    descText === ""
      ? null
      : { value: descText, length_chars: descText.length };

  // <meta name="robots">: indexability is false iff "noindex" appears.
  const robotsRaw = $('meta[name="robots"]').first().attr("content");
  const robotsText = robotsRaw?.trim() ?? "";
  const robots =
    robotsText === ""
      ? null
      : {
          value: robotsText,
          indexable: !/\bnoindex\b/i.test(robotsText),
        };

  // <link rel="canonical">: absolute-vs-relative + self-comparison.
  const canonicalRaw = $('link[rel="canonical"]').first().attr("href");
  const canonicalText = canonicalRaw?.trim() ?? "";
  let canonical: AnalyzeMetaResult["basic"]["canonical"] = null;
  if (canonicalText !== "") {
    const isAbsolute = /^https?:\/\//i.test(canonicalText);
    const pointsToSelf = (() => {
      try {
        const canonicalAbs = isAbsolute
          ? new URL(canonicalText)
          : new URL(canonicalText, finalUrl);
        const finalAbs = new URL(finalUrl);
        return (
          normalizeUrlForCompare(canonicalAbs) ===
          normalizeUrlForCompare(finalAbs)
        );
      } catch {
        return false;
      }
    })();
    canonical = {
      value: canonicalText,
      is_absolute: isAbsolute,
      points_to_self: pointsToSelf,
    };
  }

  return { title, description, robots, canonical };
}

// --- Extraction: Open Graph -----------------------------------------------

function extractOpenGraph(
  $: cheerio.CheerioAPI,
): AnalyzeMetaResult["open_graph"] {
  // OG meta lookup. We take the FIRST occurrence of each property —
  // sites often duplicate og:image with size variants (og:image:width
  // etc.); we ignore those siblings here. A future analyze-og tool can
  // expose the full set if it becomes useful.
  const og = (property: string): string | null => {
    const v = $(`meta[property="og:${property}"]`).first().attr("content");
    const trimmed = v?.trim() ?? "";
    return trimmed === "" ? null : trimmed;
  };

  const title = og("title");
  const description = og("description");
  const image = og("image");
  const ogUrl = og("url");
  const type = og("type");

  const completeness = [title, description, image, ogUrl, type].filter(
    (v) => v !== null,
  ).length;

  return { title, description, image, url: ogUrl, type, completeness };
}

// --- Extraction: Twitter Cards --------------------------------------------

function extractTwitter(
  $: cheerio.CheerioAPI,
  og: AnalyzeMetaResult["open_graph"],
): AnalyzeMetaResult["twitter"] {
  const tw = (name: string): string | null => {
    const v = $(`meta[name="twitter:${name}"]`).first().attr("content");
    const trimmed = v?.trim() ?? "";
    return trimmed === "" ? null : trimmed;
  };

  const card = tw("card");
  const twitterTitleExplicit = tw("title");
  const twitterDescExplicit = tw("description");
  const twitterImageExplicit = tw("image");

  // Per Twitter's documented behavior, missing twitter:* tags fall back
  // to og:*. Report the EFFECTIVE values plus which ones inherited.
  const title = twitterTitleExplicit ?? og.title;
  const description = twitterDescExplicit ?? og.description;
  const image = twitterImageExplicit ?? og.image;

  const inherits_from_og = {
    title: twitterTitleExplicit === null && og.title !== null,
    description: twitterDescExplicit === null && og.description !== null,
    image: twitterImageExplicit === null && og.image !== null,
  };

  const completeness = [card, title, description, image].filter(
    (v) => v !== null,
  ).length;

  return {
    card,
    title,
    description,
    image,
    inherits_from_og,
    completeness,
  };
}

// --- Extraction: technical tags -------------------------------------------

function extractTechnical(
  $: cheerio.CheerioAPI,
): AnalyzeMetaResult["technical"] {
  // <meta charset="..."> OR legacy <meta http-equiv="Content-Type">.
  let charset: string | null =
    $("meta[charset]").first().attr("charset") ?? null;
  if (charset === null) {
    const httpEquiv = $('meta[http-equiv="Content-Type"]')
      .first()
      .attr("content");
    if (httpEquiv !== undefined) {
      const match = /charset=([^;\s]+)/i.exec(httpEquiv);
      charset = match !== null ? (match[1] ?? null) : null;
    }
  }
  charset = charset?.trim() ?? null;
  if (charset === "") charset = null;

  const viewportRaw = $('meta[name="viewport"]').first().attr("content");
  const viewport = viewportRaw?.trim() ?? null;

  const htmlLangRaw = $("html").first().attr("lang");
  const html_lang = htmlLangRaw?.trim() ?? null;

  return {
    charset,
    viewport: viewport === "" ? null : viewport,
    html_lang: html_lang === "" ? null : html_lang,
  };
}

// --- Verdict computation --------------------------------------------------

/**
 * Produces a list of severity-tagged findings from the extracted blocks.
 *
 * The intent is that downstream consumers (Claude in chat, future
 * dashboard) can render `issues[]` directly, sorted by severity, and
 * not have to re-derive verdicts from raw values. New rules added here
 * are visible in every consumer instantly.
 */
function computeIssues(parts: {
  basic: AnalyzeMetaResult["basic"];
  open_graph: AnalyzeMetaResult["open_graph"];
  twitter: AnalyzeMetaResult["twitter"];
  technical: AnalyzeMetaResult["technical"];
}): MetaIssue[] {
  const issues: MetaIssue[] = [];
  const { basic, open_graph, twitter, technical } = parts;

  // --- Critical: indexability ----------------------------------------
  if (basic.robots !== null && !basic.robots.indexable) {
    issues.push({
      severity: "critical",
      code: "noindex_present",
      message:
        `Page declares <meta name="robots" content="${basic.robots.value}">; ` +
        `it will not be indexed by search engines.`,
    });
  }

  // --- Critical: missing title ---------------------------------------
  if (basic.title === null) {
    issues.push({
      severity: "critical",
      code: "no_title",
      message:
        "Page has no <title> tag. Search engines will fall back to URL " +
        "or anchor text, both of which produce poor SERP appearance.",
    });
  } else {
    if (basic.title.length_chars < TITLE_MIN_CHARS) {
      issues.push({
        severity: "warning",
        code: "title_too_short",
        message:
          `Title is ${basic.title.length_chars} characters; recommended ` +
          `${TITLE_MIN_CHARS}-${TITLE_MAX_CHARS}. Short titles miss ranking ` +
          `keywords and look thin in SERPs.`,
      });
    } else if (basic.title.length_chars > TITLE_MAX_CHARS) {
      issues.push({
        severity: "warning",
        code: "title_too_long",
        message:
          `Title is ${basic.title.length_chars} characters; recommended ` +
          `${TITLE_MIN_CHARS}-${TITLE_MAX_CHARS}. Google typically truncates ` +
          `around 60 chars in desktop SERPs.`,
      });
    }
  }

  // --- Critical: missing meta description ----------------------------
  if (basic.description === null) {
    issues.push({
      severity: "critical",
      code: "no_meta_description",
      message:
        'No <meta name="description">. Browsers will show an algorithmic ' +
        "snippet from the page body, which you don't control.",
    });
  } else {
    if (basic.description.length_chars < DESCRIPTION_MIN_CHARS) {
      issues.push({
        severity: "warning",
        code: "description_too_short",
        message:
          `Meta description is ${basic.description.length_chars} characters; ` +
          `recommended ${DESCRIPTION_MIN_CHARS}-${DESCRIPTION_MAX_CHARS}.`,
      });
    } else if (basic.description.length_chars > DESCRIPTION_MAX_CHARS) {
      issues.push({
        severity: "warning",
        code: "description_too_long",
        message:
          `Meta description is ${basic.description.length_chars} characters; ` +
          `Google truncates around ${DESCRIPTION_MAX_CHARS} in desktop SERPs.`,
      });
    }
  }

  // --- Warning: canonical issues -------------------------------------
  if (basic.canonical === null) {
    issues.push({
      severity: "info",
      code: "no_canonical",
      message:
        'No <link rel="canonical">. Recommended for any page that may have ' +
        "duplicate URL variants (with/without trailing slash, query strings).",
    });
  } else if (!basic.canonical.is_absolute) {
    issues.push({
      severity: "warning",
      code: "canonical_relative",
      message:
        `Canonical URL "${basic.canonical.value}" is relative. Google ` +
        `recommends absolute URLs to avoid resolution ambiguity.`,
    });
  } else if (!basic.canonical.points_to_self) {
    issues.push({
      severity: "info",
      code: "canonical_points_elsewhere",
      message:
        `Canonical points to a different URL (${basic.canonical.value}). ` +
        `If this is the master version of duplicated content, this is ` +
        `correct; otherwise it tells search engines to ignore this page.`,
    });
  }

  // --- Open Graph completeness ---------------------------------------
  if (open_graph.completeness === 0) {
    issues.push({
      severity: "warning",
      code: "og_missing",
      message:
        "No Open Graph tags. Links to this page on Facebook, LinkedIn, " +
        "Telegram, and Slack will show generic previews.",
    });
  } else if (open_graph.completeness < 5) {
    const missing: string[] = [];
    if (open_graph.title === null) missing.push("og:title");
    if (open_graph.description === null) missing.push("og:description");
    if (open_graph.image === null) missing.push("og:image");
    if (open_graph.url === null) missing.push("og:url");
    if (open_graph.type === null) missing.push("og:type");
    issues.push({
      severity: "info",
      code: "og_incomplete",
      message: `Open Graph incomplete (${open_graph.completeness}/5). Missing: ${missing.join(", ")}.`,
    });
  }

  // --- Twitter Cards -------------------------------------------------
  if (twitter.card === null) {
    if (open_graph.completeness > 0) {
      issues.push({
        severity: "info",
        code: "twitter_card_inherits",
        message:
          "No twitter:card tag, but Open Graph is present. Twitter (X) " +
          "will fall back to OG tags, which usually works fine.",
      });
    } else {
      issues.push({
        severity: "warning",
        code: "twitter_card_missing",
        message:
          "No twitter:card tag and no Open Graph fallback. Links on " +
          "Twitter (X) will show plain-text previews.",
      });
    }
  }

  // --- Technical: charset --------------------------------------------
  if (technical.charset === null) {
    issues.push({
      severity: "warning",
      code: "no_charset",
      message:
        "No <meta charset> declared. Browsers will guess the encoding, " +
        "which can mangle non-ASCII text.",
    });
  }

  // --- Technical: viewport (mobile-friendliness) ---------------------
  if (technical.viewport === null) {
    issues.push({
      severity: "warning",
      code: "no_viewport",
      message:
        'No <meta name="viewport">. Page will not scale properly on ' +
        "mobile devices, hurting mobile-first ranking.",
    });
  }

  // --- Technical: html lang ------------------------------------------
  if (technical.html_lang === null) {
    issues.push({
      severity: "info",
      code: "no_html_lang",
      message:
        "No lang attribute on <html>. Helps screen readers and improves " +
        "language-targeted SEO.",
    });
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
 * Same streaming-with-cap implementation as `tools/scan-site.ts`.
 * Duplicated for now; will move to `crawlers/fetch-html.ts` when a
 * third consumer exists.
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
      throw new AnalyzeMetaError(
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

/**
 * Normalizes a URL for canonical-comparison purposes:
 *   - lowercase host
 *   - drop fragment
 *   - drop trailing slash from pathname (except for root "/")
 *   - keep query intact (different querystrings ARE different URLs)
 */
function normalizeUrlForCompare(u: URL): string {
  const host = u.host.toLowerCase();
  let pathname = u.pathname;
  if (pathname.length > 1 && pathname.endsWith("/")) {
    pathname = pathname.slice(0, -1);
  }
  return `${u.protocol}//${host}${pathname}${u.search}`;
}
