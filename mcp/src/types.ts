/**
 * Public types for the ToraSEO MCP server.
 *
 * These describe the data contracts between MCP tools and their callers
 * (Claude, the future ToraSEO dashboard, anything else that talks to MCP).
 *
 * Keep this file dependency-free — it is meant to be importable from
 * other workspaces (skill validation, the future app/) without pulling
 * in MCP SDK or runtime libraries.
 */

/**
 * Result of a minimal site scan. Returned by the `scan_site_minimal` tool.
 *
 * Designed for token efficiency: every field is short, primitive, and
 * directly useful for SEO analysis. The full HTML is never returned —
 * Claude only sees this summary, which keeps prompt cost low.
 */
export interface ScanSiteMinimalResult {
  /**
   * Final URL after following redirects. May differ from the requested
   * URL when the target uses 301/302 (e.g. `http://example.com` →
   * `https://www.example.com/`).
   */
  url: string;

  /**
   * HTTP status code of the final response (after redirects).
   * 200 means OK, 4xx/5xx indicate problems.
   */
  status: number;

  /**
   * Content of the `<title>` tag, trimmed. `null` if no title element
   * was found or the document is not HTML.
   */
  title: string | null;

  /**
   * Content of the first `<h1>` tag, trimmed. `null` if no `<h1>` exists.
   * Multiple `<h1>` tags are an SEO smell but not surfaced by this tool —
   * a future `analyze_meta` tool will report that separately.
   */
  h1: string | null;

  /**
   * Content of `<meta name="description">`, trimmed. `null` if missing.
   * One of the most important on-page SEO signals.
   */
  meta_description: string | null;

  /**
   * Wall-clock time of the HTTP request in milliseconds, integer.
   * Includes DNS resolution, TLS handshake, and full response body
   * download. A rough proxy for site responsiveness.
   */
  response_time_ms: number;
}
