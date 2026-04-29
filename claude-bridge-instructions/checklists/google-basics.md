# Google Search Basics — Checklist

A pragmatic checklist of on-page SEO signals that Google's
[Search Essentials](https://developers.google.com/search/docs/essentials)
explicitly mentions or strongly implies, mapped to the ToraSEO MCP
tool that detects each one.

This checklist is the **baseline** for every site audit. It is
language-neutral and search-engine-agnostic in everything it covers
— Google is the floor, not the ceiling, for these items.

Each item has:

- **What** — the signal in one line
- **Why** — what breaks if it's wrong
- **Tool** — which `toraseo` MCP tool surfaces it
- **Issue codes** — the specific `code` values from the tool's
  `issues[]` array that map to this item

---

## 1. The page is reachable to crawlers

**What.** robots.txt does not block the URL.

**Why.** If robots.txt disallows the path for Googlebot or for any
crawler, Google will not index it. This is the most common reason
"my page won't rank" — the page literally cannot be read.

**Tool.** `check_robots_txt`

**Issue codes.**
- `rule_disallow` — explicit Disallow rule matched our path
- `robots_unreachable` — robots.txt itself is unreachable; per
  ToraSEO's strict policy we treat this as disallowed (a real
  crawler would be more forgiving but still flag this)

---

## 2. The page does not declare `noindex`

**What.** No `<meta name="robots" content="noindex">` on the page.

**Why.** `noindex` is a direct, page-level instruction to search
engines: "do not index this page, ever." It overrides everything
else — title, content, backlinks, sitemap presence. If you are
seeing a page omitted from search results despite robots.txt being
clean, this is the most likely reason. Common cause: leftover from
staging, or a CMS plugin that adds it by default to certain post
types.

**Tool.** `analyze_meta`

**Issue codes.**
- `noindex_present` (critical) — the meta robots tag declares
  `noindex` and the page will not be indexed

---

## 3. The page returns HTTP 200

**What.** No 4xx or 5xx errors at the final URL.

**Why.** Indexers drop pages that respond with 404 or 5xx. Soft
404s (200 status with empty/error content) are also penalized,
though detecting those needs more than HTTP status alone.

**Tool.** `scan_site_minimal` (status field) + `check_redirects`
(final_status)

**Issue codes.** This is reported in the raw `status` field;
`check_redirects` flags it via `redirect_to_4xx` / `redirect_to_5xx`
when reached via a redirect chain.

---

## 4. Redirect chains are short and consistent

**What.** No more than 1–2 redirects. No loops. No HTTPS→HTTP
downgrades.

**Why.** Google's documentation specifies that each additional hop
risks losing PageRank ("link equity") and adds latency. Redirect
loops kill indexing entirely. Downgrading from HTTPS to HTTP is a
security regression that Google flags.

**Tool.** `check_redirects`

**Issue codes.**
- `redirect_loop` (critical)
- `too_many_redirects` (critical) — exceeded 10 hops without resolving
- `chain_too_long` (warning) — > 2 hops
- `https_to_http_redirect` (warning) — security regression
- `broken_redirect` (critical) — 3xx without Location header
- `relative_location_header` (info) — RFC 7231 allows it but absolute is preferred
- `no_redirects` (info, positive) — URL responds directly with 2xx, no redirects

---

## 5. The page has a `<title>` tag

**What.** Non-empty `<title>` between 30 and 60 characters.

**Why.** The title is the single most prominent SEO signal Google
uses for both indexing and SERP display. Missing titles produce
auto-generated SERP labels that almost always rank worse than a
hand-written title would.

**Tool.** `analyze_meta`

**Issue codes.**
- `no_title` (critical) — covers both missing and empty `<title>`
  tags (whitespace-only is treated as missing)
- `title_too_short` (warning — < 30 chars)
- `title_too_long` (warning — > 60 chars; truncated in SERP)

---

## 6. The page has a `<meta name="description">`

**What.** Non-empty meta description between 50 and 160 characters.

**Why.** Google does not always use the meta description in SERP
snippets, but when it does, a well-written one increases CTR. When
it's missing, Google synthesizes a snippet from page content,
which is rarely as compelling.

**Tool.** `analyze_meta`

**Issue codes.**
- `no_meta_description` (critical) — no `<meta name="description">`
  on the page
- `description_too_short` (warning — < 50 chars)
- `description_too_long` (warning — > 160 chars; truncated in SERP)

---

## 7. The page has well-formed headings

**What.** Page has heading elements, exactly one `<h1>`, and no
empty headings.

**Why.** Google has officially stated that multiple h1s "are not
a problem", but the broader accessibility and document-outline
practice is one h1. More importantly, a missing h1 is a strong
signal that the page lacks semantic structure — which correlates
with low ranking. A page with **no headings at all** is the most
severe case: search engines and screen readers rely on heading
structure to understand the outline.

**Tool.** `analyze_headings`

**Issue codes.**
- `no_headings` (critical) — page has no `<h1>`..`<h6>` at all
- `no_h1` (critical) — has headings but no `<h1>`
- `multiple_h1` (warning) — more than one `<h1>`
- `empty_heading` (warning) — heading with whitespace-only content
- `h1_too_short` (info — < 10 chars; suggests an icon or boilerplate)
- `h1_too_long` (info — > 70 chars; suggests a misuse)

---

## 8. Heading hierarchy doesn't skip levels

**What.** No jumps from h1 to h3, or h2 to h4, etc.

**Why.** Skips break the document outline. Screen readers fail
on them, accessibility audits flag them, and Google has indicated
that semantic structure influences understanding of the page.

**Tool.** `analyze_headings`

**Issue codes.**
- `heading_level_skip` (info — one or two skips)
- `heading_level_skip_systematic` (warning — three or more skips,
  indicates the page uses headings for visual styling, not
  semantics)

---

## 9. Canonical URL points to the right place

**What.** A `<link rel="canonical">` that resolves to either the
current URL or a deliberate canonical elsewhere.

**Why.** Without a canonical, Google guesses which version of a
page to index when there are URL variants (with/without
trailing slash, query parameters, etc.). With a misconfigured
canonical, you actively tell Google to deindex the current page.

**Tool.** `analyze_meta`

**Issue codes.**
- `no_canonical` (info) — not always required, but a strong
  best practice
- `canonical_relative` (warning) — should be absolute per Google's
  recommendation
- `canonical_points_elsewhere` (info) — points to a different URL
  than the page; legitimate for pagination/variants but worth
  flagging so the user can confirm intent

---

## 10. The page declares its language

**What.** `<html lang="...">` attribute is present and accurate.

**Why.** Google uses `html lang` along with content analysis to
decide which language the page is in. Mismatched or missing
`lang` causes pages to surface in the wrong country's results.

**Tool.** `analyze_meta`

**Issue codes.**
- `no_html_lang` (info)

---

## 11. The page is mobile-friendly

**What.** `<meta name="viewport" content="width=device-width, initial-scale=1">`
or equivalent.

**Why.** Google switched to mobile-first indexing in 2019. A page
without a proper viewport meta is treated as desktop-only and
penalized in mobile search.

**Tool.** `analyze_meta`

**Issue codes.**
- `no_viewport` (warning)

---

## 12. The page declares character encoding

**What.** `<meta charset="utf-8">` (or similar) early in the head.

**Why.** Without explicit charset, browsers and crawlers guess.
Wrong guesses produce mojibake in the SERP snippet and broken
indexing for non-Latin text. UTF-8 is the universal correct
answer.

**Tool.** `analyze_meta`

**Issue codes.**
- `no_charset` (warning)

---

## 13. The page has Open Graph tags

**What.** At minimum `og:title`, `og:description`, `og:image`,
`og:url`, `og:type`. The analyzer counts how many of those five
are present and reports completeness.

**Why.** Open Graph tags control how the page renders when shared
on Facebook, LinkedIn, Telegram, Slack, Discord, and others.
Twitter's card tags fall back to OG. Missing OG = ugly,
text-only previews when the page is shared, which kills
click-through.

**Tool.** `analyze_meta`

**Issue codes.**
- `og_missing` (warning) — zero OG tags found
- `og_incomplete` (info) — fewer than 5 of 5 OG tags found; the
  message names which ones are missing

---

## 14. The page has Twitter Cards (or inherits from OG)

**What.** Either explicit `twitter:card` family tags, or Open
Graph tags that Twitter (X) will fall back to.

**Why.** Twitter card tags control how the page renders when
shared on Twitter (X). Twitter explicitly falls back to OG when
twitter:* tags are missing — so if you have Open Graph, Twitter
already works. The bad case is "no OG and no Twitter": shares
on Twitter then show plain-text previews.

**Tool.** `analyze_meta`

**Issue codes.**
- `twitter_card_missing` (warning) — no twitter:card and no OG
  fallback either
- `twitter_card_inherits` (info, positive) — no twitter:card but
  Open Graph is present and Twitter will fall back to it

---

## 15. The site has a sitemap

**What.** A valid `sitemap.xml` is reachable, either via robots.txt
declaration or at `/sitemap.xml`.

**Why.** For sites larger than a few dozen pages, sitemaps speed up
discovery dramatically. For small sites they're optional but
expected. A broken sitemap (invalid XML, blocked by server) is
worse than no sitemap.

**Tool.** `analyze_sitemap`

**Issue codes.**
- `no_sitemap` (critical) — robots.txt didn't declare a Sitemap and
  the `/sitemap.xml` fallback returned 404 or non-200
- `sitemap_invalid_xml` (critical) — file doesn't parse as XML
- `sitemap_blocked_by_server` (critical) — server returned 401/403/406/451;
  the file may exist but is gated by User-Agent or geo rules
- `sitemap_empty` (warning) — valid `<urlset>` but zero `<url>` entries
- `sitemap_too_large` (warning) — exceeds the protocol limit of 50,000 entries
- `sitemap_index_no_children` (warning) — `<sitemapindex>` with zero child entries
- `sitemap_no_lastmod` (info) — no `<lastmod>` in sampled entries;
  recommended for crawl efficiency
- `sitemap_url_mismatch` (warning) — sampled entries point to a
  different host than the audited URL

---

## 16. The page has substantive content

**What.** Roughly 300+ words of actual visible text in the main
content area.

**Why.** Google has been cautious about endorsing word counts, but
its own
[Quality Rater Guidelines](https://services.google.com/fh/files/misc/hsw-sqrg.pdf)
penalize "thin content". Yoast and most major audit tools flag
< 300 words as thin. < 600 words is borderline for most topics.

**Tool.** `analyze_content`

**Issue codes.**
- `no_main_content` (critical) — extraction produced zero words;
  likely a JS-rendered SPA shell
- `thin_content` (critical) — < 300 words
- `borderline_content` (warning) — 300–600 words
- `no_paragraphs` (warning) — substantive text but no `<p>` tags

---

## 17. The page has a healthy internal linking structure

**What.** At least one internal link on a substantial page; not
an unusually large number of external links.

**Why.** Internal links help search engines discover related
pages on your site and distribute authority. A content page with
no internal links is a discoverability dead-end. Many external
links can be legitimate on link-roundup pages but on typical
content may dilute authority signals.

**Tool.** `analyze_content`

**Issue codes.**
- `no_internal_links` (info) — page has > 600 words but zero
  internal links
- `many_external_links` (info) — page links to > 20 external
  destinations

---

## 18. Images have alt text

**What.** Every meaningful `<img>` has a non-empty `alt` attribute.

**Why.** Alt text is the only way images contribute to topical
relevance for SEO, and it's required for accessibility. Pages
where the majority of images lack alt text rank worse and fail
WCAG.

**Tool.** `analyze_content`

**Issue codes.**
- `images_no_alts_at_all` (critical) — every image lacks alt text
- `images_without_alt_majority` (warning) — > 50% missing

---

## 19. The page has reasonable text-to-code ratio

**What.** Visible text is at least 10% of the HTML payload size.

**Why.** Pages with very low text-to-code ratio (< 3%) are usually
either (a) all-JavaScript SPAs that render nothing server-side, or
(b) heavy boilerplate sites where the content is buried in
markup. Both rank poorly in Google.

**Tool.** `analyze_content`

**Issue codes.**
- `text_to_code_ratio_very_low` (critical — < 3%)
- `text_to_code_ratio_low` (warning — < 10%)

---

## What this checklist does NOT cover

These items matter for SEO but are out of scope for the v0.1
ToraSEO MVP:

- **Schema.org / JSON-LD structured data** — deferred to post-MVP.
- **Core Web Vitals (LCP, INP, CLS)** — needs PageSpeed Insights API.
- **Backlink profile** — needs third-party data (Ahrefs, Majestic).
- **Search Console signals** — private to site owner.
- **Yandex- and Bing-specific tags** — coming as opt-in checklists.
- **AI-search citation readiness** — coming as opt-in checklist.

When the audit is clean against this checklist, the page is
**Google-ready at the baseline level**. Higher-tier optimization
(performance, schema, off-page signals) is a separate conversation.
