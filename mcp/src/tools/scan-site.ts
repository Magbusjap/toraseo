/**
 * scan_site_minimal — fetch a URL and extract basic SEO signals.
 *
 * This is the simplest possible scan tool. It fetches a single page,
 * parses the HTML, and returns five primitive fields. Used to verify
 * that the HTTP + parsing pipeline works end-to-end.
 *
 * NOT in scope here (will be added in later tools):
 *   - robots.txt compliance (added with the rate limiter on Day 4)
 *   - rate limiting and per-host budgets (Day 4)
 *   - OG / Twitter Cards / schema.org (future analyze_meta tool)
 *   - multi-page crawling (intentionally out of scope forever — this
 *     tool is for one URL by design)
 */

import * as cheerio from "cheerio";
import { z } from "zod";

import type { ScanSiteMinimalResult } from "../types.js";

// --- Constants ------------------------------------------------------------

/**
 * Maximum size of the response body we will buffer into memory.
 * Anything larger gets truncated before parsing. Protects against
 * accidental zip-bomb-style responses.
 */
const MAX_BODY_BYTES = 10 * 1024 * 1024; // 10 MB

/**
 * Hard timeout for the entire HTTP request (DNS + TLS + body).
 * On expiry the request is aborted and the tool returns an error.
 */
const REQUEST_TIMEOUT_MS = 15_000; // 15 seconds

/**
 * User-Agent string identifying ToraSEO honestly per CRAWLING_POLICY.md.
 *
 * The version is hard-coded for now; on the publish path we will read
 * it from package.json so the User-Agent always matches the running
 * server build.
 */
const USER_AGENT =
  "ToraSEO/0.0.1 (+https://github.com/Magbusjap/toraseo)";

// --- Input schema (zod) ---------------------------------------------------

/**
 * Argument schema for the tool. Validated at the MCP layer before
 * the handler runs, so by the time `scanSiteMinimal` is called the
 * URL is guaranteed to be a syntactically valid HTTP/HTTPS URL.
 */
export const scanSiteMinimalInputSchema = {
  url: z
    .string()
    .url()
    .refine(
      (value) => {
        try {
          const parsed = new URL(value);
          return parsed.protocol === "http:" || parsed.protocol === "https:";
        } catch {
          return false;
        }
      },
      { message: "URL must use http:// or https:// protocol" },
    )
    .describe("The full URL to scan (must include http:// or https://)"),
};

// --- Implementation -------------------------------------------------------

/**
 * Custom error class so the MCP layer can distinguish our deliberate
 * failures (timeout, body too large, non-HTML response) from generic
 * runtime errors.
 */
export class ScanSiteError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "timeout"
      | "body_too_large"
      | "fetch_failed"
      | "not_html",
  ) {
    super(message);
    this.name = "ScanSiteError";
  }
}

/**
 * Performs the actual scan. Throws `ScanSiteError` on operational
 * failures (timeout, body too large, etc.) and lets unexpected errors
 * bubble up.
 */
export async function scanSiteMinimal(
  url: string,
): Promise<ScanSiteMinimalResult> {
  const startedAt = performance.now();

  // AbortController gives us a timeout we can apply to fetch.
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
      throw new ScanSiteError(
        `Request timed out after ${REQUEST_TIMEOUT_MS}ms`,
        "timeout",
      );
    }
    throw new ScanSiteError(
      `Failed to fetch ${url}: ${
        error instanceof Error ? error.message : String(error)
      }`,
      "fetch_failed",
    );
  } finally {
    clearTimeout(timeoutHandle);
  }

  // Reject obviously non-HTML responses early, before buffering.
  const contentType = response.headers.get("content-type") ?? "";
  if (!isHtmlContentType(contentType)) {
    throw new ScanSiteError(
      `Response is not HTML (content-type: ${contentType || "unknown"})`,
      "not_html",
    );
  }

  // Read the body with a hard size cap.
  const body = await readBodyWithCap(response, MAX_BODY_BYTES);

  // Parse and extract.
  const $ = cheerio.load(body);
  const title = extractText($, "title");
  const h1 = extractText($, "h1");
  const metaDescription = extractAttr(
    $,
    'meta[name="description"]',
    "content",
  );

  const elapsedMs = Math.round(performance.now() - startedAt);

  return {
    url: response.url, // canonical URL after redirects
    status: response.status,
    title,
    h1,
    meta_description: metaDescription,
    response_time_ms: elapsedMs,
  };
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
 * Reads the response body in chunks and aborts if the cumulative size
 * exceeds `maxBytes`. Returns the body as a UTF-8 string.
 *
 * Why not just `await response.text()`: that has no size cap, and a
 * malicious or misconfigured server could stream gigabytes at us.
 */
async function readBodyWithCap(
  response: Response,
  maxBytes: number,
): Promise<string> {
  if (response.body === null) {
    return "";
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    received += value.byteLength;
    if (received > maxBytes) {
      reader.cancel().catch(() => {
        // ignore: we are aborting on purpose
      });
      throw new ScanSiteError(
        `Response body exceeds ${maxBytes} bytes`,
        "body_too_large",
      );
    }
    chunks.push(value);
  }

  // Concatenate chunks into a single Uint8Array, then decode as UTF-8.
  const merged = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return new TextDecoder("utf-8").decode(merged);
}

function extractText(
  $: cheerio.CheerioAPI,
  selector: string,
): string | null {
  const text = $(selector).first().text().trim();
  return text === "" ? null : text;
}

function extractAttr(
  $: cheerio.CheerioAPI,
  selector: string,
  attr: string,
): string | null {
  const value = $(selector).first().attr(attr);
  if (value === undefined) return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}
