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

/**
 * Result of a robots.txt check. Returned by the `check_robots_txt` tool
 * and also consumed internally by `scan_site_minimal` before any fetch.
 *
 * Models RFC 9309 evaluation as cleanly as possible: did robots.txt
 * exist, was it readable, what does it say about our User-Agent for
 * the requested path, and does it set a Crawl-delay we should honor.
 */
export interface CheckRobotsResult {
  /**
   * The URL that was checked against robots.txt rules. Echoed back so
   * Claude does not have to remember which URL was the input.
   */
  url: string;

  /**
   * The robots.txt URL that was fetched. For `https://example.com/blog`
   * this will be `https://example.com/robots.txt`. Useful for audit
   * trails and manual verification.
   */
  robots_txt_url: string;

  /**
   * Whether the User-Agent we present (`ToraSEO`) is allowed to fetch
   * the requested URL according to RFC 9309 evaluation:
   *
   *   - `true`   — explicit Allow, or no rule, or robots.txt is missing (404)
   *   - `false`  — explicit Disallow, or robots.txt unreachable (5xx/timeout)
   *
   * The per-RFC convention is "missing robots.txt = full allow"; we
   * follow that. Conversely, our CRAWLING_POLICY treats unreachable
   * robots.txt (5xx, network error) as disallowed for safety.
   */
  allowed: boolean;

  /**
   * Why we reached the `allowed` verdict. Helpful when explaining to
   * the user why a scan was refused.
   */
  reason:
    | "no_robots_txt" // 404 or empty file → full allow per RFC 9309
    | "rule_allow" // matched an explicit Allow directive
    | "rule_disallow" // matched an explicit Disallow directive
    | "no_matching_rule" // robots.txt exists but no rule applies → allow
    | "robots_unreachable"; // 5xx, timeout, or network error → disallow

  /**
   * Crawl-delay in seconds applied to our User-Agent, if specified.
   * RFC 9309 itself does NOT define Crawl-delay (it was deliberately
   * omitted because real-world implementations diverged), but it is a
   * widely deployed extension. ToraSEO honors it: if a site sets a
   * value larger than our default 2s/host, we wait that long instead.
   *
   * `null` means the directive is absent for our User-Agent.
   */
  crawl_delay_seconds: number | null;
}
