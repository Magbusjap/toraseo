# Changelog

All notable changes to ToraSEO are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Pre-1.0 releases use `0.MAJOR.PATCH` numbering — the leading `0` signals
that the public surface is still evolving and breaking changes may occur
between minor versions until the v1.0 milestone.

---

## [Unreleased]

Nothing yet. The next slice of work targets **v0.2** — Mode B content
audit (humanizer, readability, style match, AI-detection score).

---

## [0.1.0-alpha] — 2026-04-26

The first installable release. Mode A (Site Audit) is complete with
seven working tools and a Claude Skill that orchestrates them into a
structured audit report.

### Added — MCP server

Seven Mode A site-audit tools, each returning severity-tagged
findings (`critical` / `warning` / `info`):

- **`scan_site_minimal`** — fast reachability check; returns title,
  h1, meta description, response time, and HTTP status
- **`check_robots_txt`** — whether ToraSEO is allowed to crawl the
  URL, plus crawl-delay extraction; results cached per session
- **`analyze_meta`** — title, description, Open Graph, Twitter Card,
  canonical, charset, viewport, html lang; produces issue codes
  including `noindex_present`, `no_title`, `title_too_short`,
  `og_missing`, `og_incomplete`, `canonical_relative`, `no_viewport`
- **`analyze_headings`** — h1..h6 walk in DOM order, level-skip
  detection, h1 length sanity, empty-heading detection
- **`analyze_sitemap`** — discovery via robots.txt then
  `/sitemap.xml` fallback, `<urlset>` and `<sitemapindex>` parsing,
  20-entry sample, host-mismatch detection, oversize detection
- **`check_redirects`** — manual chain walk (HEAD-then-GET fallback),
  loop detection (10-hop cap), HTTPS→HTTP downgrade detection,
  relative Location flag
- **`analyze_content`** — semantic-cascade extraction
  (article→main→body), word/sentence/paragraph counts,
  text-to-code ratio (Yoast-aligned 300/600 thresholds),
  link inventory, image alt coverage

### Added — Skill

- **`SKILL.md`** as the main entry point with name/description
  frontmatter, 10 sections covering activation rules, the
  seven-tool workflow, structured selectors via `ask_user_input_v0`,
  token-budget rules, Mode B deferral, and i18n plan
- **`checklists/google-basics.md`** mapping 19 on-page SEO signals
  from Google Search Essentials to specific issue codes from each
  analyzer
- **`templates/audit-report.md`** structural template with three
  worked examples (clean / blocking / many-findings) and
  tone-calibration rules

### Added — Crawling etiquette

- robots.txt is honored on every fetch (in-process cache, one
  request per host per session)
- Per-host rate limiter (default 2 seconds; honors longer
  `Crawl-delay` from robots.txt)
- Honest User-Agent: `ToraSEO/X.Y.Z (+https://github.com/Magbusjap/toraseo)`
- Body-size cap (10 MB HTML, 60 MB XML for sitemaps)
- Per-request timeout (15 s for HTML, 30 s for sitemaps, 10 s for
  redirect steps)
- 10-hop cap on redirect chains
- Full policy in [`CRAWLING_POLICY.md`](CRAWLING_POLICY.md)

### Added — Distribution

- **GitHub Action** (`.github/workflows/release-skill.yml`) builds
  and attaches `toraseo-skill-vX.Y.Z.zip` to every `v*` git tag,
  with frontmatter validation as a sanity check
- **Local build script** (`scripts/build-skill.sh`) reproduces the
  CI build for testing before pushing a tag
- `.gitignore` rules so generated skill ZIPs don't get committed

### Added — Documentation

- Architecture document (`docs/ARCHITECTURE.md`) covering the
  three-component design, communication patterns, and ethical
  crawling policy
- Skill installation README (`skill/README.md`) with steps for
  Claude Desktop, Claude.ai, and Claude Code
- This CHANGELOG

### Verified end-to-end

The full skill-plus-MCP pipeline was tested against
[bozheslav.ru](https://bozheslav.ru), a real Laravel + Filament
production site. All seven tools ran without errors, the skill
produced a clean structured report on the first attempt, and
findings were real and actionable (missing meta description, short
title, missing Open Graph tags, H1 noise characters, missing
canonical). No prompt re-engineering was required.

### Known limitations

These are **deliberately out of scope for v0.1.0-alpha**, not bugs:

- **No Mode B** — content audit, AI-humanizer, readability, style
  matching all arrive in v0.2
- **No multi-page crawling** — one URL per tool call by design;
  site-wide scans need an explicit orchestrator that's not yet
  built
- **No JavaScript rendering** — static HTML only, no headless
  browser. Pages that render content client-side will surface as
  `text_to_code_ratio_very_low` or `no_main_content`
- **No Yandex / Bing / AI-search specific checklists** — Google
  Search Essentials is the baseline. Per-engine checklists arrive
  based on user feedback
- **No Schema.org / JSON-LD analyzer** — deferred; Open Graph and
  Twitter Cards already cover the practical sharing case
- **No Core Web Vitals / PageSpeed** — use Google PageSpeed Insights
- **No backlinks / keyword research / rank tracking** — out of
  scope; these require paid third-party APIs
- **No visual dashboard** — architecture supports it, UI itself is
  a later milestone

### Compatibility

- **Node.js:** 22+ (uses native `fetch`, `AbortController`,
  ES2022 features)
- **Claude clients tested:** Claude Desktop, Claude Code
- **OS tested:** Windows, Linux. macOS expected to work but
  not verified

[Unreleased]: https://github.com/Magbusjap/toraseo/compare/v0.1.0-alpha...HEAD
[0.1.0-alpha]: https://github.com/Magbusjap/toraseo/releases/tag/v0.1.0-alpha
