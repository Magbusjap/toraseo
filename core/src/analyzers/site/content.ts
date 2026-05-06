/**
 * Content analyzer for site-audit Mode A.
 *
 * Fetches a single URL, identifies the main content area using a
 * cascade of semantic-landmark selectors, and computes basic
 * SEO-relevant metrics: word count, paragraph count, link inventory,
 * image inventory, text-to-code ratio.
 *
 * Extraction strategy (cascade, most specific first):
 *   1. <article> if present
 *   2. <main> if present
 *   3. <body> with <header>/<nav>/<footer>/<aside> removed
 *   4. <body> as-is (only if step 3 produced nothing usable)
 *
 * The extracted root is what we report metrics over. The text-to-code
 * ratio is the one exception — it's computed over the WHOLE HTML per
 * industry convention.
 *
 * Architectural placement:
 *   Lives in `analyzers/site/` (Mode A — URL-based). The MCP tool
 *   wrapper in `tools/site/analyze-content.ts` is a thin adapter on
 *   top, mirroring the meta.ts / headings.ts / sitemap.ts pattern.
 *
 * Note on fetch boilerplate:
 *   This is the SEVENTH consumer of fetch-with-timeout. Combined with
 *   the redirects analyzer (manual mode, no body) and sitemap
 *   (xml + 60MB cap), the seven cases are diverse enough that a clean
 *   abstraction is now realistic. The post-MVP refactor will extract
 *   `crawlers/fetch.ts` parametrized by accepted content-type, body
 *   cap, and timeout.
 */

import * as cheerio from "cheerio";

import { checkRobots } from "../../crawlers/robots-txt.js";
import { awaitRateLimit } from "../../crawlers/rate-limiter.js";
import { USER_AGENT } from "../../constants.js";
import type {
  AnalyzeContentResult,
  ContentIssue,
} from "../../types.js";

// --- Constants ------------------------------------------------------------

const MAX_BODY_BYTES = 10 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 15_000;

/**
 * Word-count thresholds, derived from Yoast's industry-standard
 * guidance. Google does not publish a hard threshold, so any number
 * is somewhat arbitrary — these are widely used and pragmatic.
 */
const THIN_CONTENT_THRESHOLD = 300;
const BORDERLINE_CONTENT_THRESHOLD = 600;

/**
 * Text-to-code ratio thresholds. 0.10 is the common "thin" threshold
 * across SEO tools (Screaming Frog uses 0.15 as warning); 0.03 is
 * a hard floor below which the page is almost certainly broken or
 * a JS-heavy SPA shell.
 */
const RATIO_LOW_THRESHOLD = 0.10;
const RATIO_VERY_LOW_THRESHOLD = 0.03;

/**
 * External-link count above which we surface an info note. Not a
 * critical issue — some pages legitimately have many outbound links
 * (link aggregators, reference articles) — but worth flagging.
 */
const MANY_EXTERNAL_LINKS = 20;

// --- Errors ---------------------------------------------------------------

export class AnalyzeContentError extends Error {
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
    this.name = "AnalyzeContentError";
  }
}

// --- Public API -----------------------------------------------------------

export async function analyzeContent(
  url: string,
): Promise<AnalyzeContentResult> {
  // --- robots.txt gate -------------------------------------------------
  const robotsVerdict = await checkRobots(url);
  if (!robotsVerdict.allowed) {
    if (robotsVerdict.reason === "robots_unreachable") {
      throw new AnalyzeContentError(
        `Cannot determine robots.txt status for ${robotsVerdict.robots_txt_url}; ` +
          `treating as disallowed per CRAWLING_POLICY.`,
        "robots_unreachable",
      );
    }
    throw new AnalyzeContentError(
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
      throw new AnalyzeContentError(
        `Request timed out after ${REQUEST_TIMEOUT_MS}ms`,
        "timeout",
      );
    }
    throw new AnalyzeContentError(
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
    throw new AnalyzeContentError(
      `Response is not HTML (content-type: ${contentType || "unknown"})`,
      "not_html",
    );
  }

  const body = await readBodyWithCap(response, MAX_BODY_BYTES);
  const elapsedMs = Math.round(performance.now() - startedAt);

  // --- parse + analyze -------------------------------------------------
  const $ = cheerio.load(body);
  const finalUrl = response.url;
  const finalHost = (() => {
    try {
      return new URL(finalUrl).host.toLowerCase();
    } catch {
      return "";
    }
  })();

  // --- Extract main content -------------------------------------------
  const extraction = extractMainContent($);
  const $root = extraction.root;

  // --- Compute text metrics -------------------------------------------
  const textRaw = $root.text();
  const text = textRaw.replace(/\s+/g, " ").trim();
  const textBlocks = extractTextBlocks($root, $);
  const word_count = countWords(text);
  const character_count = text.length;
  const sentence_count = countSentences(text);
  const paragraph_count = $root.find("p").length;
  const average_words_per_sentence =
    sentence_count === 0 ? null : word_count / sentence_count;

  // --- Text-to-code ratio (over WHOLE document) -----------------------
  const wholeText = $("body").text().replace(/\s+/g, " ").trim();
  const text_to_code_ratio =
    body.length === 0 ? 0 : wholeText.length / body.length;

  // --- Link inventory --------------------------------------------------
  const links = countLinks($root, $, finalUrl, finalHost);

  // --- Image inventory -------------------------------------------------
  const images = countImages($root, $);

  // --- Compute verdicts -----------------------------------------------
  const summary: AnalyzeContentResult["summary"] = {
    extraction_method: extraction.method,
    word_count,
    character_count,
    sentence_count,
    paragraph_count,
    average_words_per_sentence,
    text_to_code_ratio,
    extraction_note: extraction.note,
  };

  const issues = computeIssues({ summary, links, images });

  return {
    url: finalUrl,
    status: response.status,
    response_time_ms: elapsedMs,
    issues,
    summary,
    main_text: text,
    text_blocks: textBlocks,
    links,
    images,
  };
}

// --- Extraction -----------------------------------------------------------

/**
 * Implements the extraction cascade. Returns both the cheerio
 * selection and which strategy was used (for transparency).
 *
 * Why we don't just `$("article, main, body")`:
 *   We want to know which strategy fired so we can report it. Also,
 *   the body-minus-landmarks variant requires actual mutation of a
 *   clone, which can't be expressed as a simple selector.
 */
function extractMainContent(
  $: cheerio.CheerioAPI,
): {
  root: cheerio.Cheerio<any>;
  method: AnalyzeContentResult["summary"]["extraction_method"];
  note: string;
} {
  const article = pickBestRoot($, "article");
  if (article.length > 0) {
    return {
      root: cleanContentRoot(article),
      method: "article",
      note: "Основной текст извлечен из семантического блока article; навигация, реклама и служебные блоки удалены локально.",
    };
  }

  const main = pickBestRoot($, "main");
  if (main.length > 0) {
    return {
      root: cleanContentRoot(main),
      method: "main",
      note: "Основной текст извлечен из блока main; навигация, реклама и служебные блоки удалены локально.",
    };
  }

  // <body> minus landmarks. We clone the body so mutations don't
  // affect the original document (other tools may want the full $ later).
  const body = $("body").first();
  if (body.length === 0) {
    // Pathological case: no <body>. Use the document root.
    return {
      root: cleanContentRoot($.root()),
      method: "body",
      note: "У страницы нет body, поэтому ToraSEO использовал корневой HTML-документ и удалил служебные блоки.",
    };
  }

  const clone = body.clone();
  // Remove all common landmarks. We use $ as the parser to evaluate
  // the selector against the clone (cheerio supports this pattern).
  removeNonArticleNoise(clone);

  // Also strip script/style/noscript — they contain text we don't want
  // counted (e.g. inline JSON-LD, CSS rules). They're not landmarks
  // strictly, but they're definitely not "content".

  const trimmedText = clone.text().trim();
  if (trimmedText.length === 0) {
    // Stripping landmarks left nothing. Fall back to body as-is and
    // report that fact via extraction_method.
    return {
      root: cleanContentRoot(body),
      method: "body",
      note: "После удаления служебных блоков текст не найден, поэтому ToraSEO использовал body страницы.",
    };
  }

  return {
    root: clone,
    method: "body_minus_landmarks",
    note: "Семантический article/main не найден, поэтому ToraSEO взял body без навигации, рекламы, комментариев и служебных блоков.",
  };
}

function pickBestRoot(
  $: cheerio.CheerioAPI,
  selector: string,
): cheerio.Cheerio<any> {
  let best: cheerio.Cheerio<any> | null = null;
  let bestScore = 0;

  $(selector).each((_, element) => {
    const candidate = $(element);
    const cleaned = cleanContentRoot(candidate);
    const text = cleaned.text().replace(/\s+/g, " ").trim();
    const linkText = cleaned.find("a").text().replace(/\s+/g, " ").trim();
    const score =
      countWords(text) +
      cleaned.find("p").length * 12 +
      cleaned.find("h1, h2, h3").length * 8 -
      countWords(linkText) * 0.6;

    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  });

  return bestScore > 20 && best !== null ? best : $([]);
}

function cleanContentRoot(
  root: cheerio.Cheerio<any>,
): cheerio.Cheerio<any> {
  const clone = root.clone();
  removeNonArticleNoise(clone);
  return clone;
}

function removeNonArticleNoise(root: cheerio.Cheerio<any>): void {
  root
    .find(
      [
        "script",
        "style",
        "noscript",
        "template",
        "svg",
        "canvas",
        "iframe",
        "header",
        "nav",
        "footer",
        "aside",
        "form",
        "button",
        "[hidden]",
        "[aria-hidden='true']",
        "[role='banner']",
        "[role='navigation']",
        "[role='complementary']",
        "[role='contentinfo']",
        "[class*='advert']",
        "[class*='ads']",
        "[class*='ad-']",
        "[class*='banner']",
        "[class*='promo']",
        "[class*='sponsor']",
        "[class*='recommend']",
        "[class*='related']",
        "[class*='share']",
        "[class*='social']",
        "[class*='comment']",
        "[class*='subscribe']",
        "[id*='advert']",
        "[id*='ads']",
        "[id*='banner']",
        "[id*='promo']",
        "[id*='sponsor']",
        "[id*='recommend']",
        "[id*='related']",
        "[id*='share']",
        "[id*='social']",
        "[id*='comment']",
        "[id*='subscribe']",
      ].join(","),
    )
    .remove();
}

function extractTextBlocks(
  root: cheerio.Cheerio<any>,
  $: cheerio.CheerioAPI,
): string[] {
  const blocks: string[] = [];

  root.find("h1, h2, h3, p, li, blockquote").each((_, element) => {
    const text = $(element).text().replace(/\s+/g, " ").trim();
    if (text.length < 24 || isLikelyNoiseText(text)) return;
    blocks.push(text);
  });

  if (blocks.length === 0) {
    const fallback = root.text().replace(/\s+/g, " ").trim();
    if (fallback.length > 0) blocks.push(fallback);
  }

  return blocks.slice(0, 120);
}

function isLikelyNoiseText(text: string): boolean {
  return /cookie|privacy policy|subscribe|advertisement|реклама|подпис|коммент|поделиться|читайте также|похожие материалы/i.test(
    text,
  );
}

// --- Word / sentence counting --------------------------------------------

/**
 * Splits on whitespace and filters tokens that contain at least one
 * letter or number. Pure-punctuation tokens ("---", "·") are excluded.
 *
 * For CJK languages this undercounts (each ideogram is its own
 * "word"); for those, character_count is the more meaningful metric.
 */
function countWords(text: string): number {
  if (text.length === 0) return 0;
  const tokens = text.split(/\s+/);
  let count = 0;
  for (const token of tokens) {
    if (token.length === 0) continue;
    if (/[\p{L}\p{N}]/u.test(token)) count += 1;
  }
  return count;
}

/**
 * Approximate sentence counter. Counts `.`, `!`, `?` terminators
 * not preceded by a single uppercase letter (filters out abbreviations
 * like "U.S." and "e.g.") followed by whitespace or end-of-string.
 *
 * This is best-effort. Real sentence segmentation requires NLP. For
 * the purpose of average_words_per_sentence, a rough count is fine.
 */
function countSentences(text: string): number {
  if (text.length === 0) return 0;
  // Match: terminator [.!?] followed by whitespace or end of string,
  // not immediately after a single uppercase letter.
  const matches = text.match(/(?<![A-Z])[.!?](?=\s|$)/g);
  return matches === null ? 0 : matches.length;
}

// --- Link counting --------------------------------------------------------

function countLinks(
  $root: cheerio.Cheerio<any>,
  $: cheerio.CheerioAPI,
  baseUrl: string,
  finalHost: string,
): AnalyzeContentResult["links"] {
  let internal = 0;
  let external = 0;
  let invalid = 0;

  $root.find("a[href]").each((_, element) => {
    const href = $(element).attr("href");
    if (href === undefined) {
      invalid += 1;
      return;
    }
    const trimmed = href.trim();
    if (trimmed === "" || trimmed.startsWith("#")) {
      // Empty hrefs and pure fragment links don't count as either
      // internal or external for SEO purposes.
      invalid += 1;
      return;
    }
    if (
      trimmed.startsWith("javascript:") ||
      trimmed.startsWith("mailto:") ||
      trimmed.startsWith("tel:")
    ) {
      // Non-navigation schemes — not a page link, skip silently.
      // Don't count as invalid: they're legitimate, just not navigational.
      return;
    }
    try {
      const resolved = new URL(trimmed, baseUrl);
      if (resolved.host.toLowerCase() === finalHost) {
        internal += 1;
      } else {
        external += 1;
      }
    } catch {
      invalid += 1;
    }
  });

  return { internal, external, invalid };
}

// --- Image counting -------------------------------------------------------

function countImages(
  $root: cheerio.Cheerio<any>,
  $: cheerio.CheerioAPI,
): AnalyzeContentResult["images"] {
  let with_alt = 0;
  let without_alt = 0;

  $root.find("img").each((_, element) => {
    const alt = $(element).attr("alt");
    // Per HTML spec, alt="" is a deliberate "decorative" marker, not
    // missing. But for SEO scoring, decorative-only is the same as
    // missing — search engines can't infer meaning from the image.
    // We count both as "without_alt".
    if (alt === undefined || alt.trim() === "") {
      without_alt += 1;
    } else {
      with_alt += 1;
    }
  });

  return {
    total: with_alt + without_alt,
    with_alt,
    without_alt,
  };
}

// --- Verdict computation --------------------------------------------------

function computeIssues(parts: {
  summary: AnalyzeContentResult["summary"];
  links: AnalyzeContentResult["links"];
  images: AnalyzeContentResult["images"];
}): ContentIssue[] {
  const issues: ContentIssue[] = [];
  const { summary, links, images } = parts;

  // --- Critical: extraction produced nothing -------------------------
  if (summary.word_count === 0) {
    issues.push({
      severity: "critical",
      code: "no_main_content",
      message:
        `Extraction strategy "${summary.extraction_method}" produced zero ` +
        `words. The page may be a JS-heavy SPA shell, an image gallery ` +
        `with no text, or a misconfigured layout. Search engines will ` +
        `have nothing to index.`,
    });
    // Skip downstream word-based checks — they'd be noise.
    return finishImageAndLinkIssues(issues, images, links, summary);
  }

  // --- Word count thresholds (Yoast-aligned) -------------------------
  if (summary.word_count < THIN_CONTENT_THRESHOLD) {
    issues.push({
      severity: "critical",
      code: "thin_content",
      message:
        `Page contains only ${summary.word_count} words of main content. ` +
        `Below ${THIN_CONTENT_THRESHOLD} is widely treated as "thin" — ` +
        `Google's quality signals flag pages that don't substantially ` +
        `address their topic.`,
    });
  } else if (summary.word_count < BORDERLINE_CONTENT_THRESHOLD) {
    issues.push({
      severity: "warning",
      code: "borderline_content",
      message:
        `Page contains ${summary.word_count} words of main content. ` +
        `${THIN_CONTENT_THRESHOLD}–${BORDERLINE_CONTENT_THRESHOLD} is a ` +
        `borderline zone — enough to index, but on competitive queries ` +
        `you'll lose to longer-form alternatives.`,
    });
  }

  // --- Text-to-code ratio --------------------------------------------
  if (summary.text_to_code_ratio < RATIO_VERY_LOW_THRESHOLD) {
    issues.push({
      severity: "critical",
      code: "text_to_code_ratio_very_low",
      message:
        `Text-to-code ratio is ${formatRatio(summary.text_to_code_ratio)} ` +
        `— less than 3% of the HTML is visible text. The page is likely ` +
        `a JS-rendered SPA shell, or its actual content is loaded after ` +
        `the initial response. Search engines that don't execute JS will ` +
        `see almost nothing.`,
    });
  } else if (summary.text_to_code_ratio < RATIO_LOW_THRESHOLD) {
    issues.push({
      severity: "warning",
      code: "text_to_code_ratio_low",
      message:
        `Text-to-code ratio is ${formatRatio(summary.text_to_code_ratio)}. ` +
        `Below 10% indicates the page carries a lot of markup, inline ` +
        `styles, or JS overhead relative to content.`,
    });
  }

  // --- Paragraph absence ---------------------------------------------
  if (summary.paragraph_count === 0 && summary.word_count > 50) {
    issues.push({
      severity: "warning",
      code: "no_paragraphs",
      message:
        `Page has ${summary.word_count} words but zero <p> elements. ` +
        `Text without paragraph structure is harder for both readers ` +
        `and screen readers to navigate.`,
    });
  }

  // --- Link smells ---------------------------------------------------
  if (links.external > MANY_EXTERNAL_LINKS) {
    issues.push({
      severity: "info",
      code: "many_external_links",
      message:
        `Page links to ${links.external} external destinations. Many ` +
        `outbound links can be legitimate (reference article, link ` +
        `roundup) but on a typical content page may dilute authority ` +
        `signals.`,
    });
  }
  if (
    links.internal === 0 &&
    summary.word_count > BORDERLINE_CONTENT_THRESHOLD
  ) {
    issues.push({
      severity: "info",
      code: "no_internal_links",
      message:
        `Page has substantial content but zero internal links. Internal ` +
        `linking helps search engines discover related pages and ` +
        `distribute authority. Consider linking to relevant pages on ` +
        `your own site.`,
    });
  }

  return finishImageAndLinkIssues(issues, images, links, summary);
}

/**
 * Image-related issues are split out so we can run them after an
 * early return from `no_main_content`. Even a content-empty page can
 * have images worth flagging if they exist at all.
 */
function finishImageAndLinkIssues(
  issues: ContentIssue[],
  images: AnalyzeContentResult["images"],
  _links: AnalyzeContentResult["links"],
  _summary: AnalyzeContentResult["summary"],
): ContentIssue[] {
  if (images.total === 0) return issues;

  if (images.with_alt === 0) {
    issues.push({
      severity: "critical",
      code: "images_no_alts_at_all",
      message:
        `All ${images.total} images on the page lack alt text. Image alt ` +
        `attributes are essential for accessibility and provide context ` +
        `that search engines use for image search ranking.`,
    });
  } else if (images.without_alt > images.with_alt) {
    issues.push({
      severity: "warning",
      code: "images_without_alt_majority",
      message:
        `${images.without_alt} of ${images.total} images lack alt text ` +
        `(majority). Each missing alt is an accessibility gap and a ` +
        `missed indexing opportunity.`,
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

function formatRatio(ratio: number): string {
  return `${(ratio * 100).toFixed(1)}%`;
}

/**
 * Same streaming-with-cap as the other analyzers. SEVENTH copy. The
 * post-MVP refactor will extract this into `crawlers/fetch.ts`.
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
      throw new AnalyzeContentError(
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
