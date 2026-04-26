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
- `rule_disallow` (critical)
- `robots_unreachable` (critical — ToraSEO refuses to scan; a
  reasonable crawler will be more forgiving but still flag this)

---

## 2. The page returns HTTP 200

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

## 3. Redirect chains are short and consistent

**What.** No more than 1–2 redirects. No loops. No HTTPS→HTTP
downgrades.

**Why.** Google's documentation specifies that each additional hop
risks losing PageRank ("link equity") and adds latency. Redirect
loops kill indexing entirely. Downgrading from HTTPS to HTTP is a
security regression that Google flags.

**Tool.** `check_redirects`

**Issue codes.**
- `redirect_loop` (critical)
- `too_many_redirects` (critical)
- `chain_too_long` (warning — > 2 hops)
- `https_to_http_redirect` (critical)
- `broken_redirect` (critical)
- `relative_location_header` (info)

---

## 4. The page has a `<title>` tag

**What.** Non-empty `<title>` between 30 and 60 characters.

**Why.** The title is the single most prominent SEO signal Google
uses for both indexing and SERP display. Missing titles produce
auto-generated SERP labels that almost always rank worse than a
hand-written title would.

**Tool.** `analyze_meta`

**Issue codes.**
- `title_missing` (critical)
- `title_empty` (critical)
- `title_too_short` (warning — < 30 chars)
- `title_too_long` (warning — > 60 chars; truncated in SERP)

---

## 5. The page has a `<meta name="description">`

**What.** Non-empty meta description between 70 and 160 characters.

**Why.** Google does not always use the meta description in SERP
snippets, but when it does, a well-written one increases CTR. When
it's missing, Google synthesizes a snippet from page content,
which is rarely as compelling.

**Tool.** `analyze_meta`

**Issue codes.**
- `description_missing` (warning — not technically critical, but
  a clear miss)
- `description_too_short` (info — < 70 chars)
- `description_too_long` (info — > 160 chars; truncated in SERP)

---

## 6. The page has exactly one `<h1>`

**What.** Exactly one `<h1>` per page, semantically the page's
primary topic.

**Why.** Google has officially stated that multiple h1s "are not
a problem", but the broader accessibility and document-outline
practice is one h1. More importantly, a missing h1 is a strong
signal that the page lacks semantic structure — which correlates
with low ranking.

**Tool.** `analyze_headings`

**Issue codes.**
- `no_h1` (critical)
- `multiple_h1` (warning)
- `h1_too_short` (info — < 10 chars; suggests an icon or boilerplate)
- `h1_too_long` (info — > 70 chars; suggests a misuse)

---

## 7. Heading hierarchy doesn't skip levels

**What.** No jumps from h1 to h3, or h2 to h4, etc.

**Why.** Skips break the document outline. Screen readers fail
on them, accessibility audits flag them, and Google has indicated
that semantic structure influences understanding of the page.

**Tool.** `analyze_headings`

**Issue codes.**
- `heading_level_skip` (warning — one or two skips)
- `heading_level_skip_systematic` (critical — many skips,
  indicates the page uses headings for visual styling, not
  semantics)

---

## 8. Canonical URL points to the right place

**What.** A `<link rel="canonical">` that resolves to either the
current URL or a deliberate canonical elsewhere.

**Why.** Without a canonical, Google guesses which version of a
page to index when there are URL variants (with/without
trailing slash, query parameters, etc.). With a misconfigured
canonical, you actively tell Google to deindex the current page.

**Tool.** `analyze_meta`

**Issue codes.**
- `canonical_missing` (info — not always required, but a strong
  best practice)
- `canonical_relative` (warning — should be absolute)
- `canonical_mismatch` (warning — points to a different URL than
  the page; legitimate for pagination/variants but worth
  flagging)

---

## 9. The page declares its language

**What.** `<html lang="...">` attribute is present and accurate.

**Why.** Google uses `html lang` along with content analysis to
decide which language the page is in. Mismatched or missing
`lang` causes pages to surface in the wrong country's results.

**Tool.** `analyze_meta`

**Issue codes.**
- `html_lang_missing` (warning)

---

## 10. The page is mobile-friendly

**What.** `<meta name="viewport" content="width=device-width, initial-scale=1">`
or equivalent.

**Why.** Google switched to mobile-first indexing in 2019. A page
without a proper viewport meta is treated as desktop-only and
penalized in mobile search.

**Tool.** `analyze_meta`

**Issue codes.**
- `viewport_missing` (warning)

---

## 11. The page declares character encoding

**What.** `<meta charset="utf-8">` (or similar) early in the head.

**Why.** Without explicit charset, browsers and crawlers guess.
Wrong guesses produce mojibake in the SERP snippet and broken
indexing for non-Latin text. UTF-8 is the universal correct
answer.

**Tool.** `analyze_meta`

**Issue codes.**
- `charset_missing` (warning)
- `charset_not_utf8` (info — non-UTF-8 charsets work but are an
  anti-pattern in 2026)

---

## 12. The page has open graph tags

**What.** At minimum `og:title`, `og:description`, `og:image`,
`og:url`, `og:type`.

**Why.** Open Graph tags control how the page renders when shared
on Facebook, LinkedIn, Telegram, Slack, Discord, and others.
Twitter's card tags fall back to OG. Missing OG = ugly,
text-only previews when the page is shared, which kills
click-through.

**Tool.** `analyze_meta`

**Issue codes.**
- `og_title_missing` (warning)
- `og_description_missing` (warning)
- `og_image_missing` (warning)
- `og_url_missing` (info)
- `og_type_missing` (info)

---

## 13. The site has a sitemap

**What.** A valid `sitemap.xml` is reachable, either via robots.txt
declaration or at `/sitemap.xml`.

**Why.** For sites larger than a few dozen pages, sitemaps speed up
discovery dramatically. For small sites they're optional but
expected. A broken sitemap (invalid XML, blocked by server) is
worse than no sitemap.

**Tool.** `analyze_sitemap`

**Issue codes.**
- `no_sitemap` (warning — not critical, but a clear miss for
  any site with 10+ URLs)
- `sitemap_invalid_xml` (critical)
- `sitemap_blocked_by_server` (critical — server returns 401/403/406/451)
- `sitemap_empty` (warning)
- `sitemap_no_lastmod` (info — recommended for crawl efficiency)
- `sitemap_url_mismatch` (warning — entries point to a different host)

---

## 14. The page has substantive content

**What.** Roughly 300+ words of actual visible text in the main
content area.

**Why.** Google has been cautious about endorsing word counts, but
its own
[Quality Rater Guidelines](https://services.google.com/fh/files/misc/hsw-sqrg.pdf)
penalize "thin content". Yoast and most major audit tools flag
< 300 words as thin. < 600 words is borderline for most topics.

**Tool.** `analyze_content`

**Issue codes.**
- `no_main_content` (critical)
- `thin_content` (critical — < 300 words)
- `borderline_content` (warning — 300–600 words)
- `no_paragraphs` (warning — substantive text but no `<p>` tags
  suggests divs-as-paragraphs which break readability)

---

## 15. Images have alt text

**What.** Every meaningful `<img>` has a non-empty `alt` attribute.

**Why.** Alt text is the only way images contribute to topical
relevance for SEO, and it's required for accessibility. Pages
where the majority of images lack alt text rank worse and fail
WCAG.

**Tool.** `analyze_content`

**Issue codes.**
- `images_no_alts_at_all` (critical)
- `images_without_alt_majority` (warning — > 50% missing)

---

## 16. The page has reasonable text-to-code ratio

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
