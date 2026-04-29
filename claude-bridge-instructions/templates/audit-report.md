# Audit Report Template

Structural reference for the report ToraSEO produces at the end of a
Mode A site audit. This is **not** a fill-in form — adapt section
lengths and phrasing to the actual findings.

The goal of every audit report is to answer **three questions**:

1. Is the page healthy? (one-line verdict)
2. What must I fix first? (critical items, priority-ordered)
3. What should I improve next? (warnings, in fix-effort order)

Everything else is supporting detail.

---

## Structural skeleton

```
# SEO Audit — {URL}

**Verdict:** {one short sentence}

## Critical issues ({N})
{numbered list, each item: what + why + how to fix}

## Warnings ({N})
{numbered list, each item: what + how to fix}

## Notes ({N})
{bulleted list, informational only}

## What I checked
{compact list of the 7 tools that ran}

## Next step
{ONE concrete prompt the user can act on}
```

---

## Section guidance

### Verdict (1 sentence)

Tell the user the headline. Three patterns work:

- **Healthy:** "The page is in good shape — no critical issues, a few
  optimization opportunities below."
- **Repairable:** "The page has {N} critical issues that need fixing
  before search engines will index it properly."
- **Blocked:** "Search engines cannot reach this page right now —
  see the critical issues below for what's blocking them."

Do not start with "I conducted an SEO audit and found...". Get to
the verdict in the first six words.

### Critical issues (variable length)

Each item:

```
1. **{Plain-language one-liner}**
   {1 sentence on why it matters in plain language.}
   Fix: {1–2 sentences with concrete steps.}
```

Order critical issues by **impact-then-effort**. The first item
should be the one whose fix unlocks the most other things. For
example, if `rule_disallow` and `title_missing` both fire, the
robots.txt issue goes first — fixing the title is moot if the
page is blocked from crawling.

If there are no critical issues, omit the section entirely. Do
not write "Critical issues: none." — just skip the heading.

### Warnings (variable length)

Same structure as critical issues, but the tone shifts from "must"
to "should". Order by ease-of-fix: meta-tag fixes are 30 seconds,
content rewrites are days. Lead with the cheap wins.

If there are no warnings, omit the section.

### Notes (compact)

Informational findings that don't require action — the user just
deserves to know. Use bullets, not numbered list. One line per
note. Examples:

- Twitter Cards inherit from Open Graph, which is fine.
- Sitemap declared but contains no `<lastmod>` timestamps —
  works, but slows incremental crawling slightly.
- 1 redirect from HTTP to HTTPS — the recommended pattern.

If there are no notes, omit the section.

### What I checked

A compact reassurance to the user that the audit was thorough.
List the tools that ran and what they covered, in one or two
lines each. Example:

```
- robots.txt — page is allowed for crawling
- redirect chain — clean, 1 hop (HTTP → HTTPS)
- meta tags — title, description, OG, Twitter, canonical, charset, viewport, html lang
- heading structure — 12 headings, h1-h6 walk
- sitemap — present at /sitemap.xml, 47 URLs
- page content — 1,247 words, 18 paragraphs, 6 images
```

This section is optional but recommended — it lets the user
confirm nothing was skipped, especially if they expect a
specific check.

### Next step

**One** prompt, not three. Pick the most useful of:

- "Want me to start with {top critical issue}? I can give you
  copy-paste-ready fixes."
- "Want me to re-run the audit after you've made those changes?"
- "Want a priority-ordered fix list as a checklist you can
  hand to your dev team?"

Do not write "Let me know how you want to proceed!" — that's
unactionable filler.

---

## Tone calibration

- **Avoid SEO jargon when a normal word works.** "Indexable" is
  fine; "URL canonicalization scheme" is jargon. Substitute
  "canonical URL" or "preferred URL".
- **Show the number, then the meaning.** "Title is 78 characters
  (will be truncated in search results)" beats "Title length
  exceeds recommended threshold".
- **Quote the offending value when short.** Showing the actual
  broken meta description is more useful than describing it.
  Quote tool output verbatim only for short strings — never for
  full HTML or full content extracts.
- **Drop tool/code names from the user-facing report.** The user
  doesn't need to know that `analyze_headings` reported
  `heading_level_skip_systematic`. They need to know that the
  page is using h-tags for visual styling instead of structure.

---

## Common-shape examples

### Example A — clean audit

```
# SEO Audit — example.com/about

**Verdict:** The page is in good shape — no critical issues, two minor
optimizations below.

## Warnings (2)

1. **Meta description is missing.**
   Without one, Google will auto-generate a snippet from your page text,
   which usually performs worse than a hand-written summary.
   Fix: Add `<meta name="description" content="...">` to the page head,
   70–160 characters describing what the page is about.

2. **Title is short (24 characters).**
   Short titles ("About") miss the chance to include keywords or
   context. Recommended length is 30–60 characters.
   Fix: Expand the title to include the company name and a short
   descriptor, e.g. "About Acme — Industrial Sensors Since 1998".

## Notes
- Twitter Cards inherit from Open Graph (working as intended).
- Page returned 200 in 184 ms — well within budget.

## What I checked
- robots.txt — allowed
- redirect chain — clean
- meta tags — title, description, OG, canonical, viewport, html lang
- heading structure — 8 headings, well-formed
- sitemap — present, 23 URLs
- page content — 612 words, 8 paragraphs, 4 images all with alt

## Next step
Want me to draft the meta description and an extended title for you?
```

### Example B — blocking issue

```
# SEO Audit — staging.example.com/landing

**Verdict:** Search engines cannot index this page — robots.txt is
blocking all crawlers.

## Critical issues (1)

1. **Site is blocking all crawlers via robots.txt.**
   Your robots.txt has a `Disallow: /` rule for User-agent `*`,
   which means Google, Bing, and every other crawler will skip
   the entire site. Nothing on this domain can rank in search
   results until that's removed.
   Fix: If this is a staging site that should stay private,
   you're done — keep the rule. If this is your production site,
   remove `Disallow: /` from robots.txt and ask Google Search
   Console to recrawl.

## What I checked
- robots.txt — found, but disallows everything, so the rest of the
  audit was skipped.

## Next step
Is this a staging site, or did robots.txt get deployed to
production by mistake?
```

### Example C — many findings

When there are 5+ items in any section, group them with sub-headings
to keep the report scannable:

```
## Critical issues (6)

### Indexing-blocking
1. **noindex meta tag is set.**
   ...

### Content quality
2. **Page has only 142 words.**
   ...

### Page structure
3. **No `<h1>` on the page.**
   ...
```

Sub-headings are optional. For 1–4 items, a flat list is fine.
