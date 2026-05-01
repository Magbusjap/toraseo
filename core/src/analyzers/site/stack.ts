/**
 * detect_stack — lightweight public stack detection for Site by URL.
 *
 * This is not a Wappalyzer clone. It uses only the already-fetched HTML
 * document and public response headers, then returns evidence-backed
 * detections for the AI interpretation layer.
 */

import * as cheerio from "cheerio";

import { checkRobots } from "../../crawlers/robots-txt.js";
import { awaitRateLimit } from "../../crawlers/rate-limiter.js";
import { USER_AGENT } from "../../constants.js";
import type {
  DetectStackResult,
  StackDetection,
  StackIssue,
} from "../../types.js";

const MAX_BODY_BYTES = 10 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 15_000;

export class DetectStackError extends Error {
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
    this.name = "DetectStackError";
  }
}

export async function detectStack(url: string): Promise<DetectStackResult> {
  const robotsVerdict = await checkRobots(url);
  if (!robotsVerdict.allowed) {
    if (robotsVerdict.reason === "robots_unreachable") {
      throw new DetectStackError(
        `Cannot determine robots.txt status for ${robotsVerdict.robots_txt_url}; ` +
          `treating as disallowed per CRAWLING_POLICY.`,
        "robots_unreachable",
      );
    }
    throw new DetectStackError(
      `Disallowed by robots.txt at ${robotsVerdict.robots_txt_url} ` +
        `(reason: ${robotsVerdict.reason}).`,
      "robots_disallowed",
    );
  }

  const crawlDelayMs =
    robotsVerdict.crawl_delay_seconds === null
      ? null
      : robotsVerdict.crawl_delay_seconds * 1000;
  await awaitRateLimit(url, crawlDelayMs);

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
      throw new DetectStackError(
        `Request timed out after ${REQUEST_TIMEOUT_MS}ms`,
        "timeout",
      );
    }
    throw new DetectStackError(
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
    throw new DetectStackError(
      `Response is not HTML (content-type: ${contentType || "unknown"})`,
      "not_html",
    );
  }

  const body = await readBodyWithCap(response, MAX_BODY_BYTES);
  const elapsedMs = Math.round(performance.now() - startedAt);
  const $ = cheerio.load(body);
  const detections = detectFromDocument($, body, response.headers);
  const headers = {
    server: cleanHeader(response.headers.get("server")),
    powered_by: cleanHeader(response.headers.get("x-powered-by")),
    generator: cleanHeader($('meta[name="generator"]').attr("content") ?? null),
    via: cleanHeader(response.headers.get("via")),
  };

  return {
    url: response.url,
    status: response.status,
    response_time_ms: elapsedMs,
    issues: buildIssues(detections),
    detections,
    headers,
  };
}

function detectFromDocument(
  $: cheerio.CheerioAPI,
  body: string,
  headers: Headers,
): StackDetection[] {
  const detections = new Map<string, StackDetection>();
  const lowerBody = body.toLowerCase();
  const generator = cleanHeader($('meta[name="generator"]').attr("content") ?? null);
  const server = cleanHeader(headers.get("server"));
  const poweredBy = cleanHeader(headers.get("x-powered-by"));
  const via = cleanHeader(headers.get("via"));

  const add = (
    name: string,
    category: StackDetection["category"],
    confidence: StackDetection["confidence"],
    evidence: string,
  ) => {
    const key = `${category}:${name.toLowerCase()}`;
    const current = detections.get(key);
    if (current) {
      if (!current.evidence.includes(evidence)) {
        current.evidence.push(evidence);
      }
      current.confidence = strongerConfidence(current.confidence, confidence);
      return;
    }
    detections.set(key, {
      name,
      category,
      confidence,
      evidence: [evidence],
    });
  };

  if (generator) {
    add(generator, "cms", "medium", `meta generator: ${generator}`);
  }

  if (lowerBody.includes("/wp-content/") || lowerBody.includes("/wp-includes/")) {
    add("WordPress", "cms", "high", "WordPress asset paths found");
  }
  if (lowerBody.includes("wp-json")) {
    add("WordPress REST API", "cms", "medium", "wp-json reference found");
  }
  if (lowerBody.includes("woocommerce")) {
    add("WooCommerce", "ecommerce", "high", "WooCommerce marker found");
  }
  if (lowerBody.includes("yoast-seo") || lowerBody.includes("yoast seo")) {
    add("Yoast SEO", "seo_plugin", "high", "Yoast marker found");
  }
  if (lowerBody.includes("rank-math")) {
    add("Rank Math", "seo_plugin", "high", "Rank Math marker found");
  }
  if (lowerBody.includes("shopify")) {
    add("Shopify", "ecommerce", "medium", "Shopify marker found");
  }
  if (lowerBody.includes("cdn.shopify.com")) {
    add("Shopify", "ecommerce", "high", "Shopify CDN asset found");
  }
  if (lowerBody.includes("tilda.ws") || lowerBody.includes("tildacdn.com")) {
    add("Tilda", "builder", "high", "Tilda asset found");
  }
  if (lowerBody.includes("wixstatic.com") || lowerBody.includes("x-wix-")) {
    add("Wix", "builder", "high", "Wix marker found");
  }
  if (lowerBody.includes("webflow") || lowerBody.includes("data-wf-page")) {
    add("Webflow", "builder", "high", "Webflow marker found");
  }
  if (lowerBody.includes("bitrix") || lowerBody.includes("/bitrix/")) {
    add("1C-Bitrix", "cms", "high", "Bitrix asset path found");
  }

  if (lowerBody.includes("__next") || lowerBody.includes("/_next/")) {
    add("Next.js", "framework", "high", "Next.js asset marker found");
  }
  if (lowerBody.includes("data-reactroot") || lowerBody.includes("react-dom")) {
    add("React", "framework", "medium", "React marker found");
  }
  if (lowerBody.includes("nuxt") || lowerBody.includes("/_nuxt/")) {
    add("Nuxt", "framework", "high", "Nuxt asset marker found");
  }
  if (lowerBody.includes("vue.js") || lowerBody.includes("vue.min.js")) {
    add("Vue", "framework", "medium", "Vue script marker found");
  }

  if (lowerBody.includes("googletagmanager.com/gtm.js")) {
    add("Google Tag Manager", "tag_manager", "high", "GTM script found");
  }
  if (lowerBody.includes("google-analytics.com") || lowerBody.includes("gtag/js")) {
    add("Google Analytics", "analytics", "high", "Google Analytics script found");
  }
  if (lowerBody.includes("mc.yandex.ru")) {
    add("Yandex Metrica", "analytics", "high", "Yandex Metrica script found");
  }

  if (server) {
    detectServerHeader(server, add);
  }
  if (poweredBy) {
    detectPoweredByHeader(poweredBy, add);
  }
  if (via?.toLowerCase().includes("cloudflare")) {
    add("Cloudflare", "cdn", "medium", `via header: ${via}`);
  }

  return Array.from(detections.values()).sort((a, b) =>
    a.category === b.category
      ? a.name.localeCompare(b.name)
      : a.category.localeCompare(b.category),
  );
}

function detectServerHeader(
  server: string,
  add: (
    name: string,
    category: StackDetection["category"],
    confidence: StackDetection["confidence"],
    evidence: string,
  ) => void,
): void {
  const lower = server.toLowerCase();
  const evidence = `server header: ${server}`;
  if (lower.includes("nginx")) add("Nginx", "server", "high", evidence);
  if (lower.includes("apache")) add("Apache", "server", "high", evidence);
  if (lower.includes("cloudflare")) add("Cloudflare", "cdn", "high", evidence);
  if (lower.includes("iis")) add("IIS", "server", "high", evidence);
}

function detectPoweredByHeader(
  poweredBy: string,
  add: (
    name: string,
    category: StackDetection["category"],
    confidence: StackDetection["confidence"],
    evidence: string,
  ) => void,
): void {
  const lower = poweredBy.toLowerCase();
  const evidence = `x-powered-by header: ${poweredBy}`;
  if (lower.includes("php")) add("PHP", "language", "high", evidence);
  if (lower.includes("express")) add("Express", "framework", "high", evidence);
  if (lower.includes("next")) add("Next.js", "framework", "high", evidence);
}

function buildIssues(detections: StackDetection[]): StackIssue[] {
  if (detections.length === 0) {
    return [
      {
        severity: "info",
        code: "stack_not_detected",
        message:
          "No reliable public stack markers were detected from HTML or response headers.",
      },
    ];
  }

  const primary = detections
    .filter((item) => item.confidence === "high")
    .slice(0, 5)
    .map((item) => item.name);

  return [
    {
      severity: "info",
      code: "stack_detected",
      message:
        primary.length > 0
          ? `Detected likely stack signals: ${primary.join(", ")}.`
          : `Detected ${detections.length} low/medium confidence stack signal(s).`,
    },
  ];
}

function strongerConfidence(
  current: StackDetection["confidence"],
  next: StackDetection["confidence"],
): StackDetection["confidence"] {
  const score = { low: 0, medium: 1, high: 2 };
  return score[next] > score[current] ? next : current;
}

function cleanHeader(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

function isHtmlContentType(contentType: string): boolean {
  const normalized = contentType.toLowerCase();
  return (
    normalized.includes("text/html") ||
    normalized.includes("application/xhtml+xml")
  );
}

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
      throw new DetectStackError(
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

