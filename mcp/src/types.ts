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

// =========================================================================
// Mode A — Site Audit
// =========================================================================
//
// Types below are for site-audit tools (URL-based). Mode B (content-audit,
// text-based) types will be added when humanizer/readability tools are
// implemented.

/**
 * A single finding produced by a site-audit analyzer. Designed for token
 * efficiency: the consumer (Claude in chat, or a future dashboard) gets
 * pre-computed verdicts rather than raw numbers it has to interpret.
 *
 * `severity` follows industry SEO-audit conventions:
 *   - critical: blocks indexing or breaks the page experience (e.g. noindex,
 *               missing title). User must fix before anything else matters.
 *   - warning:  measurably suboptimal but not blocking (e.g. title 78 chars,
 *               missing twitter:image). Worth fixing in normal cadence.
 *   - info:     observed behavior worth noting but not requiring action
 *               (e.g. "twitter cards inherit from OG, which is fine").
 *
 * `code` is a stable machine-readable identifier so future tooling can
 * filter, group, or translate findings without parsing `message`.
 */
export interface MetaIssue {
  severity: "critical" | "warning" | "info";
  code: string;
  message: string;
}

/**
 * Result of meta-tag analysis for a single URL. Returned by the
 * `analyze_meta` tool.
 *
 * The structure has four nested blocks (basic / open_graph / twitter /
 * technical) that mirror how SEO professionals actually think about
 * meta-tag audits, plus a top-level `issues` array with pre-computed
 * verdicts for Claude.
 *
 * Out of scope for this tool (handled by other site-audit analyzers):
 *   - <h1>..<h6> hierarchy        → analyze_headings
 *   - JSON-LD / microdata schemas → analyze_schema
 *   - sitemap.xml                 → analyze_sitemap
 *   - Yandex-specific tags        → analyze_yandex (optional, post-MVP)
 */
export interface AnalyzeMetaResult {
  /** Final URL after redirects. */
  url: string;

  /** HTTP status of the final response. */
  status: number;

  /** Wall-clock duration of the analysis (network + parse) in ms. */
  response_time_ms: number;

  /** Pre-computed verdicts. The most important field for Claude. */
  issues: MetaIssue[];

  /** Standard SEO meta tags. */
  basic: {
    /** <title> contents and length, or null if missing. */
    title: { value: string; length_chars: number } | null;

    /** <meta name="description"> contents, or null if missing. */
    description: { value: string; length_chars: number } | null;

    /**
     * <meta name="robots"> directives. `indexable: false` when the value
     * contains `noindex` (case-insensitive). Absent meta robots is
     * treated as indexable: true.
     */
    robots: { value: string; indexable: boolean } | null;

    /**
     * <link rel="canonical"> target. `points_to_self` is true when the
     * canonical equals the requested URL after normalization (trailing
     * slash, fragment stripped); false signals an intentional canonical
     * elsewhere or a misconfiguration.
     */
    canonical: {
      value: string;
      is_absolute: boolean;
      points_to_self: boolean;
    } | null;
  };

  /** Open Graph tags (used by Facebook, LinkedIn, Telegram, Slack, etc.). */
  open_graph: {
    title: string | null;
    description: string | null;
    image: string | null;
    url: string | null;
    type: string | null;
    /** How many of the 5 core OG tags above are present (0..5). */
    completeness: number;
  };

  /**
   * Twitter Card tags. Per Twitter's spec, when twitter:* is missing,
   * the renderer falls back to og:* equivalents — so we report the
   * EFFECTIVE values, marking which ones are inherited.
   */
  twitter: {
    card: string | null;
    title: string | null;
    description: string | null;
    image: string | null;
    /** Which of title/description/image fell back to OG. */
    inherits_from_og: {
      title: boolean;
      description: boolean;
      image: boolean;
    };
    /** How many of the 4 core Twitter tags are effectively present (0..4). */
    completeness: number;
  };

  /** Page-level technical tags affecting rendering and crawling. */
  technical: {
    /** <meta charset> or HTTP-equiv content-type charset. */
    charset: string | null;
    /** <meta name="viewport"> contents. Mobile-friendly when present. */
    viewport: string | null;
    /** <html lang="..."> attribute. */
    html_lang: string | null;
  };
}

/**
 * A single finding produced by the headings analyzer. Same shape as
 * MetaIssue — kept as a separate type rather than reusing MetaIssue
 * because the `code` literal unions diverge: meta-codes mention
 * canonical/og/twitter, headings-codes mention h1/level-skip/etc.
 * Keeping them distinct lets future tooling discriminate by source.
 */
export interface HeadingIssue {
  severity: "critical" | "warning" | "info";
  code: string;
  message: string;
}

/**
 * A single heading captured from the page, in DOM order.
 *
 * Note: `level` is typed as the union 1..6 because we only collect
 * actual <h1>..<h6> tags. ARIA role="heading" with aria-level is NOT
 * captured here — that's an accessibility concern, not an SEO one.
 */
export interface HeadingEntry {
  level: 1 | 2 | 3 | 4 | 5 | 6;
  text: string;
  length_chars: number;
}

/**
 * Result of heading-structure analysis for a single URL. Returned by
 * the `analyze_headings` tool.
 *
 * Three sections:
 *   - `headings[]` — every heading in DOM order, with text and length.
 *   - `summary`    — counts and structural flags useful for at-a-glance
 *                    judgement without iterating `headings[]`.
 *   - `issues[]`   — pre-computed verdicts for Claude (or a dashboard).
 *
 * Out of scope:
 *   - Heading visibility (display:none, off-screen positioning) — would
 *     require a real browser, not just HTML parsing.
 *   - ARIA-based headings (role="heading") — accessibility audit, not SEO.
 *   - Comparing headings against page topic / keyword density — content
 *     analysis, belongs to a future Mode B tool.
 */
export interface AnalyzeHeadingsResult {
  /** Final URL after redirects. */
  url: string;

  /** HTTP status of the final response. */
  status: number;

  /** Wall-clock duration of the analysis (network + parse) in ms. */
  response_time_ms: number;

  /** Pre-computed verdicts. The most important field for Claude. */
  issues: HeadingIssue[];

  /**
   * Every heading in the document, in DOM order. Empty array means
   * the page has no <h1>..<h6> tags at all (which itself produces
   * a `no_headings` critical issue).
   */
  headings: HeadingEntry[];

  /** Aggregate counts and structural flags. */
  summary: {
    /** Total number of headings of any level. */
    total: number;
    /** Per-level counts for quick rendering. */
    by_level: {
      h1: number;
      h2: number;
      h3: number;
      h4: number;
      h5: number;
      h6: number;
    };
    /** True iff at least one <h1> is present. */
    has_h1: boolean;
    /** Number of <h1> elements. >1 is a warning. */
    h1_count: number;
    /**
     * Number of level skips in DOM order. A skip is any pair of
     * consecutive headings where the second is more than one level
     * deeper than the first (e.g. h1 → h3, h2 → h5). h3 → h2 is NOT
     * a skip (going up is fine). The very first heading is compared
     * against an implicit level-0 root, so the document opening with
     * h2 instead of h1 counts as one skip.
     */
    skip_count: number;
  };
}

/**
 * A single finding produced by the sitemap analyzer. Same shape as
 * MetaIssue and HeadingIssue — distinct type so future tooling can
 * discriminate by source without parsing message text.
 */
export interface SitemapIssue {
  severity: "critical" | "warning" | "info";
  code: string;
  message: string;
}

/**
 * One entry from inside a `<urlset>` sitemap. Captures the four
 * standard sitemap-protocol fields. Extensions (image:image, news:news,
 * video:video) are NOT captured here — they belong to a future
 * `analyze_sitemap_extensions` if needed.
 *
 * Each field is optional except `loc` (which the protocol mandates).
 */
export interface SitemapUrlEntry {
  /** The URL itself, normalized to the value as written in <loc>. */
  loc: string;
  /** ISO 8601 timestamp of last modification, or null if absent. */
  lastmod: string | null;
  /** "always", "hourly", "daily", "weekly", "monthly", "yearly", "never" — or null. */
  changefreq: string | null;
  /** Priority 0.0..1.0 declared by the site. Null if absent. */
  priority: number | null;
}

/**
 * One entry from inside a `<sitemapindex>`. Index files do not contain
 * URLs themselves — only references to other sitemaps.
 */
export interface SitemapIndexEntry {
  /** URL of the child sitemap. */
  loc: string;
  /** ISO 8601 timestamp of last modification, or null if absent. */
  lastmod: string | null;
}

/**
 * Result of sitemap discovery and analysis. Returned by the
 * `analyze_sitemap` tool.
 *
 * Discovery order:
 *   1. Look in robots.txt for `Sitemap:` directives (RFC 9309 §2.6)
 *   2. If none, probe `<origin>/sitemap.xml` as the standard fallback
 *
 * `kind` distinguishes the two top-level sitemap shapes: a regular
 * `<urlset>` (list of URLs) or a `<sitemapindex>` (list of child
 * sitemaps). For an index, this tool does NOT recursively follow
 * children — it returns the index entries as-is and lets the user
 * pick which child to inspect next. This keeps each call bounded:
 * one HTTP request, one parse, one verdict.
 *
 * Out of scope (deliberate, for MVP):
 *   - Recursive index traversal (would be unbounded; future opt-in tool)
 *   - Sitemap extensions: image, video, news (separate analyzer)
 *   - Comparing sitemap URLs against actual crawled URLs (orchestration
 *     work, depends on a future site-crawl tool)
 *   - Verifying each sitemap URL is allowed by robots.txt (50k×
 *     robots-checks is impractical for a single call)
 */
export interface AnalyzeSitemapResult {
  /**
   * The URL the user asked us to inspect (input echo). May be a page
   * URL or a domain root — the tool always derives the origin and
   * works from there.
   */
  url: string;

  /**
   * The sitemap URL that was actually fetched, after discovery.
   * Null if discovery failed (no sitemap found anywhere).
   */
  sitemap_url: string | null;

  /** How we found it. Useful for audit trails. */
  discovered_via:
    | "robots_txt" // listed in robots.txt Sitemap: directive
    | "fallback_root" // probed /sitemap.xml as the standard location
    | "none"; // could not find anywhere

  /**
   * HTTP status of the sitemap fetch. Null if discovery failed before
   * we made the request.
   */
  status: number | null;

  /** Wall-clock time (network + parse) for the entire analysis, ms. */
  response_time_ms: number;

  /** Pre-computed verdicts. The most important field for Claude. */
  issues: SitemapIssue[];

  /**
   * Top-level shape of the discovered sitemap.
   *   - "urlset" — a regular sitemap; entries in `urls[]`
   *   - "sitemapindex" — an index; entries in `child_sitemaps[]`
   *   - "unknown" — root element was something else (rare)
   *   - "none" — sitemap was never found or could not be parsed
   */
  kind: "urlset" | "sitemapindex" | "unknown" | "none";

  /**
   * Aggregate counts. Even when `urls[]` is sampled, these counts
   * reflect the full sitemap.
   */
  summary: {
    /** For urlset: total <url> entries. For index: total <sitemap> entries. */
    total_entries: number;
    /**
     * Number of entries whose declared host matches the input URL's host.
     * Mismatches indicate either a misconfiguration or a sitemap that
     * lists external pages. Sample-based on the first 20 entries to
     * keep the work bounded.
     */
    same_host_entries_sampled: number;
    /**
     * Number of entries with a non-null lastmod field. Sample-based.
     */
    with_lastmod_sampled: number;
    /**
     * Number of entries we sampled to compute the counts above.
     * On small sitemaps this equals total_entries; on large ones it's
     * capped at 20.
     */
    sample_size: number;
  };

  /**
   * First 20 URL entries (in document order). Empty for sitemap indexes
   * and for failed discoveries. The full list is intentionally not
   * returned — sitemaps with 50k entries would blow the token budget.
   */
  urls: SitemapUrlEntry[];

  /**
   * First 20 child-sitemap entries from a sitemap index. Empty for
   * regular urlsets and failed discoveries.
   */
  child_sitemaps: SitemapIndexEntry[];
}
