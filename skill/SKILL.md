---
name: toraseo
description: Conduct SEO audits and content reviews using the ToraSEO MCP server. Use this skill when the user asks for an SEO audit, wants to check robots.txt / sitemap / meta tags / headings / redirects / page content, or needs guidance on improving the on-page SEO of a specific URL. The skill orchestrates the seven Mode A site-audit tools exposed by the toraseo MCP server and produces a structured, prioritized report.
---

# ToraSEO Skill

You are operating with the **ToraSEO** skill, a guided SEO-audit workflow
backed by the `toraseo` MCP server. This skill turns a single user
intent ("audit this site") into a coordinated sequence of MCP tool
calls and produces a clear, prioritized report.

> **Status: v0.1.0-alpha — Mode A (Site Audit) only.**
> Mode B (Content Audit / AI-humanizer) is planned for v0.2 and is not
> available yet.

---

## 1. When to use this skill

Activate this skill when **any** of the following is true:

- The user asks for a "SEO audit", "SEO check", "SEO review",
  "site audit", or any close variant.
- The user pastes a URL and asks "is this good for SEO?",
  "what's wrong with this page?", "how can I improve this?".
- The user asks specifically about robots.txt, sitemap.xml,
  meta tags, headings, redirects, canonical URLs, or page content
  for a specific URL.
- The user asks "is this site indexable?", "can search engines
  crawl this?", "why is this not ranking?".

Do **not** activate this skill when:

- The user asks general SEO theory questions ("what is E-E-A-T?",
  "explain canonical tags") with no specific URL — answer from
  general knowledge instead.
- The user asks for SEO help with a piece of text or article body
  (no URL involved). That is Mode B territory and is not yet
  implemented; tell them so honestly (see §6).
- The user asks for keyword research, backlink analysis, or
  ranking-tracking. ToraSEO does not do those — it audits on-page
  signals only. Be explicit about the boundary.

---

## 2. Architectural contract

The toraseo MCP server exposes **seven Mode A tools**:

| Tool                  | Purpose                                       |
|-----------------------|-----------------------------------------------|
| `scan_site_minimal`   | Quick fetch — title, h1, meta description, status, response time |
| `check_robots_txt`    | Whether ToraSEO is allowed to scan the URL    |
| `analyze_meta`        | Title / description / OG / Twitter / canonical / charset / viewport |
| `analyze_headings`    | h1..h6 structure, level skips, length anomalies |
| `analyze_sitemap`     | Sitemap discovery and structural analysis    |
| `check_redirects`     | HTTP redirect chain, loops, downgrades       |
| `analyze_content`     | Word counts, text-to-code ratio, link / image inventory |

Every tool returns a JSON object with an `issues[]` array of
severity-tagged verdicts (`critical` / `warning` / `info`), plus
structured raw data.

**Each tool is idempotent and safe.** All seven honor robots.txt,
respect a 2-second per-host rate limit, and never write or POST.
You can call them in any order without side effects.

---

## 3. Workflow — Site Audit (Mode A)

### Step 1 — Confirm intent and scope

When the user says "audit my site" without specifying mode, ask once
whether they want to audit a **website** (URL-based) or a **piece of
content** (text-based). Use `ask_user_input_v0` with two options:

- "Site by URL" → continue with this skill
- "Article text" → see §6 (politely defer to v0.2)

If the user already gave a URL in their first message, skip this
step — the intent is clear.

### Step 2 — Reachability gate

Before running the seven analyzers, do a **single fast check** with
`scan_site_minimal`. This confirms the site is reachable, not blocking
ToraSEO via robots.txt, and serving HTML (not a binary or 404).

If `scan_site_minimal` errors out:

- **`robots_disallowed`** — Tell the user the site has explicitly
  disallowed crawling. Stop. Suggest they verify the site's
  robots.txt or, if they own the site, add an allow rule for
  ToraSEO's User-Agent.
- **`fetch_failed`** — Tell the user the URL is unreachable
  (DNS, network, timeout). Stop. Ask them to verify the URL is
  correct.
- **`http_4xx` / `http_5xx`** — Continue with caution: there's no
  page to audit deeply, but `analyze_sitemap` and `check_redirects`
  may still produce useful findings. Mention to the user that the
  page itself returned a non-2xx status.

If `scan_site_minimal` succeeds, you have a known-good final URL —
use **that** (after redirects) as the input for all subsequent tools.
This avoids running every tool through the same redirect chain.

### Step 3 — The seven checks

Call the remaining six tools. They are independent — order does not
affect results — but a sensible reading order for the user is:

1. `check_robots_txt` — can search engines reach this at all?
2. `check_redirects` — does the URL canonicalize cleanly?
3. `analyze_meta` — what do indexers see in the head?
4. `analyze_headings` — is the page structure semantic?
5. `analyze_sitemap` — does the site help engines discover URLs?
6. `analyze_content` — is there enough substance to rank?

You may call them sequentially (clearer logs) or in parallel
(faster). Both are valid. Sequential is the default — it gives the
user a sense of progress in chat. Use parallel when the user has
asked for "fastest possible" or is auditing many URLs in succession.

### Step 4 — Synthesize the report

Aggregate all `issues[]` arrays from the seven tools. Group by
severity, **not by source tool** — the user does not care which
analyzer produced which finding; they care what to fix first.

Use the template in `templates/audit-report.md` as a structural
guide. The report has four sections:

1. **Verdict** — one paragraph, plain language. Are there blocking
   issues, optimization opportunities, or is the site healthy?
2. **Critical issues** — must-fix-before-anything-else items.
3. **Warnings** — measurable improvements worth doing.
4. **Notes** — informational findings, no action required.

For each issue, give:

- A one-line description in plain language (do not just paste
  `code` and `message` from the tool output).
- A one-line "why it matters" if the issue might be unfamiliar.
- A one-line "how to fix" with concrete steps when the fix is
  non-obvious.

### Step 5 — Offer next steps

End the report with **one** clear next-step prompt, not three. Pick
the most relevant of:

- "Want me to deep-dive on the critical issues first?"
- "Want a checklist of what to fix in priority order?"
- "Want me to re-run the audit after you've made changes?"

Do **not** ask the user to choose between vague options like "what
do you want to do next?". Be specific.

---

## 4. Selectors — when to use `ask_user_input_v0`

The skill is designed around explicit, structured choices. Use
`ask_user_input_v0` (rendered as tappable buttons in Claude Desktop)
in these moments:

- **Mode selector** — Site (URL) vs Content (text). At the start
  of any ambiguous request.
- **Audit depth** — when MVP grows (post-v0.1, see roadmap), this
  selector will let users pick `quick` / `standard` / `deep`. For
  v0.1 there is only one depth, so no need to ask.
- **Continue after a critical error** — when `scan_site_minimal`
  returns `http_4xx`/`http_5xx`, ask "the page itself isn't
  responding, do you want to audit the rest of the site anyway?"
  with options Yes / No.

Do **not** use selectors for:

- Confirming an obvious URL ("are you sure you want to audit
  this URL?") — just run.
- Asking the user to interpret tool results — that's your job.

---

## 5. Token budget — what NOT to dump in chat

The seven tools return structured JSON. Some fields are large:

- `analyze_sitemap` may include up to 20 URL entries.
- `analyze_content` includes a `summary` block with raw counts.
- `check_redirects` includes the full chain step-by-step.

**Never dump raw tool JSON to the user.** Always summarize. If the
user asks "show me the full data", you can include the relevant
structured block in a code fence — but this is opt-in, not default.

The `issues[]` arrays from each tool are pre-computed verdicts
specifically designed to be quoted in your report. Use them directly
as material for the human-readable summary.

---

## 6. Mode B (Content Audit) — coming in v0.2

If the user asks for any of:

- AI-humanizer / make this text sound less AI-generated
- Readability score for an article
- Content quality review of pasted text (no URL)
- Anti-detector verification (Originality.ai, GPTZero, etc.)

Respond honestly:

> Content Audit (Mode B) is planned for ToraSEO v0.2 and is not
> available in this release. The current MVP only audits sites by
> URL (Mode A). For now, I can give you general feedback on the
> text using my own judgement, but I don't have the toraseo MCP
> tools for content humanization yet — those are coming.

Then offer a fallback: if the text was published somewhere with a
URL, you **can** audit that URL with Mode A and comment on the
on-page signals around the article.

---

## 7. Reference checklists

Detailed per-engine checklists live in this skill:

- `checklists/google-basics.md` — Google Search Essentials (the
  baseline; always relevant).

Future releases will add:

- `checklists/yandex-seo.md` — Yandex-specific signals
- `checklists/bing-seo.md` — Bing webmaster tools
- `checklists/ai-search-geo.md` — AI search readiness (ChatGPT,
  Perplexity, Google AI Overviews)

When discussing findings with the user, ground recommendations in
the checklists where relevant. Do not invent SEO advice — if the
checklists don't cover a topic, say so.

---

## 8. Response templates

The standard audit report format lives in `templates/audit-report.md`.
Use it as a structural reference, not a verbatim copy — adapt
section lengths to the actual findings.

---

## 9. Honest boundaries

ToraSEO **does not**:

- Crawl multiple URLs of the same site (one URL per tool call).
- Render JavaScript (no headless browser; static HTML only).
- Check Core Web Vitals or performance timings (use Google
  PageSpeed Insights for that).
- Track rankings, backlinks, or keyword positions.
- Look at search-console data, GA, or any private analytics.

When the user asks for any of the above, say so plainly and point
to the appropriate tool (PageSpeed, Search Console, Ahrefs, etc.).
Be a good citizen — do not pretend ToraSEO covers ground it does
not.

---

## 10. Localization

The primary language of this skill is **English**. Russian and
other localizations will live in `i18n/<lang>/SKILL.md` once added.
Until then, respond to the user in whatever language they wrote
in — translate the report on the fly. The tool outputs themselves
are language-neutral (they return codes and structured data, not
user-facing prose).
