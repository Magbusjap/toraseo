---
name: toraseo
description: Conduct SEO audits and content reviews using the ToraSEO MCP server. Use this skill when the user asks for an SEO audit, wants to check robots.txt / sitemap / meta tags / headings / redirects / page content / public stack signals, or needs guidance on improving the on-page SEO of a specific URL. The skill orchestrates the Mode A site-audit tools exposed by the toraseo MCP server and produces a structured, prioritized report. Supports Bridge Mode handshake when ToraSEO Desktop App is running an active scan.
---

# ToraSEO Claude Bridge Instructions

You are operating with the **ToraSEO** Claude Bridge Instructions, a
guided SEO-audit workflow backed by the `toraseo` MCP server. This
Claude-side package turns a single user intent ("audit this site") into
a coordinated sequence of MCP tool calls and produces a clear,
prioritized report.

> **Status: Mode A (Site Audit) + Mode B (Article Text) + Mode C (Two-Text Comparison) + Mode D (Page by URL) + Mode E (Site Comparison) + Bridge Mode handshake.**
> The `0.0.9` expansion adds article-text, two-text comparison,
> page-by-URL, site-by-URL, and site-comparison MCP paths. In Bridge Mode
> the app stores the temporary context in workspace `input.md` or app
> state; Claude must not ask the user to paste the article, URL page text,
> comparison texts, screenshots, summaries, or JSON after a healthy
> handshake.

Bridge Mode has two command families:

- `/toraseo` is the regular skill entry point and can be used without
  the desktop app.
- `/toraseobridge` is the desktop-app bridge entry point. Use it only
  when the app created an active MCP state file.

When the user is working inside a ToraSEO text/content analysis flow,
keep the conversation anchored to that task. If they ask for broad or
unrelated research, redirect gently: offer to collect material for the
article or prepare a draft/recommendation set instead of drifting into a
general-purpose chat. If ToraSEO Desktop App or MCP is unavailable,
load `references/chat-only-fallback.md`, produce the best possible
chat-only answer, and make that limitation clear. Do not load the
fallback reference during a healthy Bridge Mode run: when Skill, MCP,
and the Desktop App scan are all available, the handshake response and
selected MCP tools are the source of truth.

When you propose to rewrite or substantially rework an article, ask
immediately whether the user wants ToraSEO to mark recommended image
positions for better SEO. If the user agrees, or already asked for image
placement guidance, insert the exact ToraSEO media placeholder lines
inside the rewritten article at the intended positions; do not invent
alternate labels. For Russian article drafts, use:
`------------------------- место для изображения --------------------------`.

---

## 1. When to use this skill

Activate this skill when **any** of the following is true:

- The user types a slash-command starting with `/toraseo` or
  `/toraseobridge` (e.g.
  `/toraseo`, `/toraseo bridge-mode`, `/toraseo проверь example.com`).
  This is an **unambiguous** trigger — always activate.
- The user mentions ToraSEO by name in any spelling — English
  `ToraSEO` / `Tora SEO`, Russian `ТораСЕО` / `ТораСЭО` /
  `ТораСео` / `ТораСэо` / `Тора СЕО` / `тора сео`, lowercase
  `toraseo`, etc. — alongside a URL or audit request. Be tolerant
  of typos and capitalization.
- The user asks for a "SEO audit", "SEO check", "SEO review",
  "site audit", or any close variant.
- The user pastes a URL and asks "is this good for SEO?",
  "what's wrong with this page?", "how can I improve this?".
- The user asks specifically about robots.txt, sitemap.xml,
  meta tags, headings, redirects, canonical URLs, or page content
  for a specific URL.
- The user asks "is this site indexable?", "can search engines
  crawl this?", "why is this not ranking?".
- The user mentions the **ToraSEO Desktop App** alongside a URL
  ("started the app", "запустил программу", "use the app to
  check", "просканируй через приложение"). This is a Bridge
  Mode signal — see §2.
- The user mentions the **ToraSEO Claude Bridge Instructions** or
  **MCP server** by
  name in connection with a SEO task.

Do **not** activate this skill when:

- The user asks general SEO theory questions ("what is E-E-A-T?",
  "explain canonical tags") with no specific URL — answer from
  general knowledge instead.
- The user asks for unsupported off-scope text work such as private
  anti-detector bypassing or backlink/ranking promises.
- The user asks for keyword research, backlink analysis, or
  ranking-tracking. ToraSEO does not do those — it audits on-page
  signals only. Be explicit about the boundary.

---

## 2. Bridge Mode protocol

**Protocol version:** `bridge-v1-2026-04-27`

ToraSEO has three components: the **Skill** (this document), the
**MCP server** (provides analyzer tools), and the **Desktop App**
(an optional companion that gives the user a visual scan UI).

When the user clicks "Scan" in the Desktop App, the app writes a
state file to disk and copies a prompt to the user's clipboard.
The user pastes the prompt into Claude. From your side, the app
is invisible — but the MCP server can read and write the same
state file. The MCP tool `verify_skill_loaded` is the only way
to detect whether the app is running an active scan.

### 2.1 Bridge Mode triggers

Treat any of the following as a Bridge Mode signal:

- The pasted message starts with `/toraseo bridge-mode` (the
  literal command the Desktop App copies to the clipboard).
- The pasted message starts with `/toraseobridge article-text` (the
  article-text bridge command copied by the Desktop App).
- The pasted message starts with `/toraseobridge article-compare` (the
  two-text comparison bridge command copied by the Desktop App).
- The pasted message starts with `/toraseobridge page-by-url` (the
  page/article by URL bridge command copied by the Desktop App).
- The pasted message starts with `/toraseobridge site-by-url` or
  `/toraseo bridge-mode site-by-url` (the site URL bridge command copied
  by the Desktop App).
- The pasted message starts with `/toraseobridge site-compare` (the
  site comparison bridge command copied by the Desktop App).
- The pasted message starts with `/toraseo chat-only-fallback` (the
  Desktop App copied a fallback prompt because the Skill is installed but
  MCP and/or the app scan is unavailable). In this case load
  `references/chat-only-fallback.md` and answer in chat from the pasted
  content; do not call Bridge Mode tools unless the user later restarts a
  live scan.
- The user types `/toraseo` followed by any SEO-related request
  (e.g. `/toraseo проверь example.com`).
- The user mentions the **Desktop App / приложение / программу**
  alongside a URL, in any phrasing — paraphrased prompts must
  also work.
- The user mentions ToraSEO by name in any spelling (see §1
  trigger list) AND a URL.

In **all** Bridge Mode triggers except `/toraseo chat-only-fallback`,
your **first action** is to call:

```
verify_skill_loaded(token="bridge-v1-2026-04-27")
```

Use the token literal exactly as written above. The token lives
ONLY in this SKILL.md and the MCP server — do not invent it,
do not read it from chat or any other source. The MCP server
compares your argument against its own copy and rejects any
mismatch.

`verify_skill_loaded` is **non-destructive and cheap**. It only
reads disk state and reports back. Always call it before
attempting any other tool when a Bridge Mode trigger fires.

For `/toraseo chat-only-fallback`, do not call the handshake first. The
app has already determined that the live bridge is not available and has
pasted the needed text into chat. Load `references/chat-only-fallback.md`,
state the limitation, and produce the bounded chat-only analysis.

### 2.2 Interpreting the response — successful handshake

If `verify_skill_loaded` returns:

```json
{
  "ok": true,
  "scanId": "...",
  "url": "https://example.com",
  "analysisType": "site_by_url",
  "selectedTools": ["check_robots_txt", "analyze_meta", ...],
  "message": "Handshake verified..."
}
```

— the app has a scan waiting. Use the returned `url` and
`selectedTools` as your scope. **Do not ask the user to confirm
the URL** — they already provided it in the app.

If `analysisType` is `article_text`, the text is already stored in
the temporary ToraSEO workspace as `input.md`. Do **not** ask the user
to paste the article into Claude. Call the selected article-text MCP
tools directly; those tools read `input.md` and write results back to
the app state and `results/*.json`.

If `analysisType` is `article_compare`, Text A and Text B are already
stored in the temporary ToraSEO workspace as `input.md`. Do **not** ask
the user to paste either text into Claude. Call the selected MCP tools
directly; comparison runs may include the same tool IDs as article-text
analysis, but in this mode they mean "analyze A and B side by side."
The response may include `input.goal` and `input.goalMode`. If the user
did not specify a goal, write the standard comparison report for both
texts. If the user specified a goal, adapt the final answer to that
purpose:

- `focus_text_a` / `focus_text_b`: focus strengths, weaknesses, and
  fixes on that side; use the other text only as comparison context.
- `beat_competitor`: show textual advantages, content gaps, and a
  non-copying improvement plan.
- `style_match`: compare transferable style techniques without copying
  phrases.
- `similarity_check`: prioritize exact overlap, semantic closeness, and
  copying risk.
- `version_compare`: show what improved, worsened, was fixed, or
  appeared.
- `ab_post`: focus on hook, clarity, brevity, CTA, platform fit, and
  reaction potential.

Compare text evidence only; do not claim ranking causes from text alone
and do not rewrite the full article unless the user asks later.

If `analysisType` is `page_by_url`, the URL and optional highlighted text
block are already stored in the active ToraSEO app state. Do **not** ask
the user to paste the page text into Claude. Call `page_url_article_internal`
when it is returned in `selectedTools`; that single MCP call performs the
page-level checks, extracts the main article text, runs the selected
article-text checks, and writes individual results back to the app under
normal check names. If Google or Yandex page search checks are also
returned in `selectedTools`, call them after the internal package. Treat
search clicks, impressions, daily/monthly views, external mentions, and
index visibility as unavailable unless a real connected search provider
or evidence is present. In the final chat answer, use normal user-facing
check names and do not mention handshake details, scan IDs, backend tool
IDs, selectedTools, sourceToolIds, or result file paths.

If `analysisType` is `site_by_url`, call `site_url_internal` when it is
returned in `selectedTools`; that single MCP call performs the selected
site-audit checks and writes individual results back to the app under
normal check names. Do not call each separate site URL tool unless the
user explicitly asks to debug one check. In the final chat answer, use
normal user-facing check names and do not mention handshake details, scan
IDs, backend tool IDs, selectedTools, sourceToolIds, or result file paths.
Do not ask the user to paste the report summary, a screenshot, JSON, or
result files after `site_url_internal` has completed; use the MCP response
and visible app report.

If `analysisType` is `site_compare`, call only `site_compare_internal`
when it is returned in `selectedTools`; that single MCP call runs the
selected site checks for up to three URLs and writes compact comparison
entries back to the app. Do not render three full audits side by side,
do not ask the user to paste JSON, screenshots, summaries, or result
files after the internal package completes, and do not call separate
site URL tools unless the user explicitly asks to debug one check. In
the final chat answer, write one competitive summary: who is stronger,
why, where the gaps are, what to borrow, and what to fix first.

For analysis types that do not have an internal package, call each tool
in `selectedTools` (in any order, but matching the listed order makes the
app's UI feel linear). For `site_by_url`, `page_by_url`, and
`article_compare`, and `site_compare`, do not call each hidden/internal
tool separately after the internal package has completed. Each tool
writes its result to the state file; the app polls and updates its UI in
real time. You will
receive a brief summary in chat for each visible package/tool — use these
to compose the final recommendations.

When all tools complete, write the **standard audit report**
in chat following §3.4 and the template in
`templates/audit-report.md`. The user reads the report in chat
and sees the structured per-tool data in the app.

### 2.3 Interpreting the response — error responses

If `verify_skill_loaded` returns `{ok: false, error: ...}`,
react based on the `error` code. User-facing replies must follow the
effective ToraSEO reply language for the run: use the interface locale
from the pasted bridge prompt by default, and switch only if the user
explicitly changes language in their own new message. The templates
below are reference English; translate only when the active reply
language is not English.

If the Skill is loaded but the Desktop App scan is unavailable, load
`references/chat-only-fallback.md`. When the user has provided enough
content in chat, produce a bounded chat-only ToraSEO analysis instead
of stopping at setup instructions. When the pasted Desktop App prompt
does not include the article text, comparison texts, or URL content,
explain that the app cannot be updated and ask for the needed text or
for the user to start the scan again in the app. Do not load the
fallback reference when `verify_skill_loaded` returns `ok: true`.

#### 2.3.1 `app_not_running`

The Desktop App liveness marker is not reachable.

```json
{ "ok": false, "error": "app_not_running", "reason": "...", "message": "..." }
```

If this happened during setup-check, do not tell the user to click Scan.
The setup screen may not have a Scan button. Explain that MCP and Bridge
Instructions may be installed, but ToraSEO app liveness is not reachable
yet. Ask the user to keep ToraSEO open on `MCP + Instructions -> Claude
Desktop` and repeat the setup prompt after the app refreshes.

If the user wants to continue without the app and provided enough text or
URL details, load `references/chat-only-fallback.md` and continue in chat
while clearly stating that ToraSEO will not be updated.

#### 2.3.2 `app_running_no_scan`

The Desktop App is running, but no analysis run is waiting.

```json
{ "ok": false, "error": "app_running_no_scan", "appPid": ..., "appVersion": "...", "message": "..." }
```

For setup-check this is a successful setup proof: MCP is reachable and
Claude Bridge Instructions are active. Send a short confirmation and tell
the user they can return to ToraSEO, choose an analysis type, and start
analysis from that specific screen. Do not mention a generic Scan button.

If the user wants to continue without the app, offer the chat-only
fallback and state that ToraSEO will not be updated.
#### 2.3.3 `wrong_state`

The state-file exists but isn't in `awaiting_handshake` —
there's a previous scan still running or finished.

```json
{ "ok": false, "error": "wrong_state", "state": "...", "message": "..." }
```

Reply:

> "В приложении уже есть сканирование в другом состоянии.
> Откройте приложение, отмените текущее сканирование или
> закройте предыдущий результат, нажмите Сканировать заново
> с нужным URL и инструментами, затем пришлите мне новый
> промпт."

#### 2.3.4 `token_mismatch`

The Skill protocol token doesn't match MCP's expectation. The
user's SKILL.md is out of date relative to the App and MCP.

```json
{ "ok": false, "error": "token_mismatch", "expected": "...", "received": "...", "message": "..." }
```

Reply:

> "Версия Skill ToraSEO устарела. Скачайте свежий
> `toraseo-claude-bridge-instructions-v*.zip` со страницы GitHub Releases, затем в
> Claude Desktop откройте Settings → Skills, удалите старый
> toraseo skill и установите новый ZIP."

#### 2.3.5 Any other error

Quote the `message` field and ask the user to retry or check
the app.

After surfacing any handshake error other than `app_running_no_scan`
and `app_not_running` (when the user didn't mention the app),
**do not call analyzer tools**. The state file is in a bad
state and the MCP server's `bridgeWrap` will reject every tool
call anyway. Wait for the user to fix the situation.

### 2.4 Detecting connection state

The combination of three components — App, MCP, Skill — is what
the user installs. Each component is detectable from your side
in a different way:

- **Skill** — if you see this section, the Skill is loaded. (You
  cannot proceed past §2.1 if the Skill is missing — there is no
  instruction telling you to call `verify_skill_loaded`.)
- **MCP server** — if you have `verify_skill_loaded` and the
  analyzer tools in your tool inventory, the MCP server is
  connected. If those tools are missing entirely, tell the user:
  *"MCP-сервер ToraSEO не подключён. Проверьте подключение в
  настройках Claude Desktop (Settings → Connectors → toraseo)."*
  Then, if the user provided enough text or page details, load
  `references/chat-only-fallback.md` and give a bounded chat-only
  analysis instead of claiming the app was updated.
- **Desktop App** — call `verify_skill_loaded`. The response's
  `error` code tells you `app_not_running`, `app_running_no_scan`,
  or success.

### 2.5 Why this design

The Skill is a **hard dependency** for Bridge Mode. The protocol
token lives only in this SKILL.md and the MCP server — it is not
in the prompt the app generates. This means:

- **Without the Skill**, you have no way to know the token.
  Bridge Mode will never reach `in_progress` state, the analyzer
  tools' `bridgeWrap` will reject all calls, and the app's
  `handshake_timeout` fires after 10 seconds. The user sees a
  clear error in the app pointing them to install the Skill.
- **With the Skill**, the token is right above (§2.1). You call
  `verify_skill_loaded` correctly on the first try, and the
  scan proceeds.

This is intentional. It guarantees that Bridge Mode requires the
full three-component setup (App + MCP + Skill), not just a model
that happens to have MCP access. It also defends against
prompt-injection attacks where an attacker tries to trigger
Bridge Mode with a fabricated prompt — no token in the prompt,
no token from chat, no Bridge Mode.

You do **not** need to explain any of this to the user unless
they ask. Just follow the protocol; the ergonomics are designed
to feel seamless when everything works.

---

## 3. Architectural contract

The toraseo MCP server exposes **Mode A analyzer tools**
plus the Bridge Mode handshake tool described in §2:

| Tool                  | Purpose                                       |
|-----------------------|-----------------------------------------------|
| `verify_skill_loaded` | Bridge Mode handshake — see §2                |
| `scan_site_minimal`   | Quick fetch — title, h1, meta description, status, response time |
| `check_robots_txt`    | Whether ToraSEO is allowed to scan the URL    |
| `analyze_meta`        | Title / description / OG / Twitter / canonical / charset / viewport |
| `analyze_headings`    | h1..h6 structure, level skips, length anomalies |
| `analyze_sitemap`     | Sitemap discovery and structural analysis    |
| `check_redirects`     | HTTP redirect chain, loops, downgrades       |
| `analyze_content`     | Word counts, text-to-code ratio, link / image inventory |
| `detect_stack`        | Public CMS / builder / framework / analytics / CDN / server signals |
| `detect_text_platform` | Article-text platform/use-case signals from app state |
| `analyze_text_structure` | Article structure, headings, paragraphs, and thin-content risk |
| `analyze_text_style` | Sentence length, directness, and mechanical phrasing |
| `analyze_tone_fit` | Tone fit for topic risk and intended platform |
| `language_audience_fit` | Language clarity and audience fit |
| `media_placeholder_review` | Image/video/audio placeholder placement in the text |
| `article_uniqueness` | Local uniqueness and overlap signals |
| `language_syntax` | Syntax and punctuation signals |
| `ai_writing_probability` | AI-writing style/rhythm probability signals |
| `naturalness_indicators` | Repetition and mechanical phrasing indicators |
| `fact_distortion_check` | Optional claim-risk and fact-distortion review |
| `logic_consistency_check` | Logic and cause-effect consistency signals |
| `ai_hallucination_check` | Optional vague-source and invented-detail risk review |
| `intent_seo_forecast` | Text intent, title/meta, hook, and CTR direction |
| `safety_science_review` | Sensitive-topic, safety, science, legal, financial, and expert-review flags |
| `article_compare_internal` | Aggregate two-text comparison package for Bridge Mode |
| `site_compare_internal` | Aggregate up-to-three-site comparison package for Bridge Mode |
| `compare_intent_gap` | Two-text intent comparison |
| `compare_article_structure` | Two-text structure comparison |
| `compare_content_gap` | Content Gap between Text A and Text B |
| `compare_semantic_gap` | Semantic coverage comparison |
| `compare_specificity_gap` | Specificity and practical-detail comparison |
| `compare_trust_gap` | Trust, source, warning, and caution comparison |
| `compare_article_style` | Style comparison |
| `similarity_risk` | Exact and semantic similarity-risk check |
| `compare_title_ctr` | Title, intent, and click-potential comparison |
| `compare_platform_fit` | Platform-fit comparison |
| `compare_strengths_weaknesses` | A/B strengths and weaknesses |
| `compare_improvement_plan` | Non-copying improvement plan |

Every analyzer tool returns a JSON object with an `issues[]` array
of severity-tagged verdicts (`critical` / `warning` / `info`),
plus structured raw data.

**Each analyzer tool is idempotent and safe.** Analyzer tools never
write or POST, and network tools respect a 2-second per-host rate
limit. Tools that fetch page/site HTML honor robots.txt. The
`check_robots_txt` tool is the exception document fetch: it reads
robots.txt to determine crawl permissions, so robots.txt is not gated
by itself. `analyze_sitemap` may read the sitemap file discovered from
robots.txt or standard sitemap discovery without applying a second
robots-gate to the sitemap file itself; it still respects rate limits
and network safety. You can call tools in any order without side
effects.

In **Bridge Mode**, all analyzer tools also write their results
to the state file (via the MCP server's `bridgeWrap`). If the
state file is not in `in_progress`, every analyzer tool will
fail with an error — only call them after a successful handshake.

### 3.1 Workflow — Site Audit (Mode A)

This workflow runs when there is **no active Bridge Mode scan**
(`verify_skill_loaded` returned `app_not_running` AND the user
did not mention the desktop app, OR the user explicitly chose
"results in chat" via the §2.3.2 selector).

#### Step 1 — Confirm intent and scope

When the user says "audit my site" without specifying mode, ask
once whether they want to audit a **website** (URL-based) or a
**piece of content** (text-based). Use `ask_user_input_v0` with
two options:

- "Site by URL" → continue with this skill
- "Article text" → see §7 (politely defer to the next release)

If the user already gave a URL in their first message, skip this
step — the intent is clear.

If §2's `verify_skill_loaded` returned `{ok: true}`, also skip
this step — the user already chose "Site by URL" in the app.

#### Step 2 — Reachability gate

Before running the analyzers, do a **single fast check**
with `scan_site_minimal`. This confirms the site is reachable,
not blocking ToraSEO via robots.txt, and serving HTML (not a
binary or 404).

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
use **that** (after redirects) as the input for all subsequent
tools. This avoids running every tool through the same redirect
chain.

#### Step 3 — The site checks

Call the remaining tools. They are independent — order does
not affect results — but a sensible reading order for the user is:

1. `check_robots_txt` — can search engines reach this at all?
2. `check_redirects` — does the URL canonicalize cleanly?
3. `analyze_meta` — what do indexers see in the head?
4. `analyze_headings` — is the page structure semantic?
5. `analyze_sitemap` — does the site help engines discover URLs?
6. `analyze_content` — is there enough substance to rank?
7. `detect_stack` — which public platform signals should shape recommendations?

You may call them sequentially (clearer logs) or in parallel
(faster). Both are valid. Sequential is the default — it gives the
user a sense of progress in chat.

In Bridge Mode, follow the order in `selectedTools` as returned
by `verify_skill_loaded`. The app's UI lists the tools in that
order — running them in matching order makes progress feel linear
to the user.

#### Step 4 — Synthesize the report

Aggregate all `issues[]` arrays from the selected tools. Group by
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

#### Step 5 — Offer next steps

End the report with **one** clear next-step prompt, not three.
Pick the most relevant of:

- "Want me to deep-dive on the critical issues first?"
- "Want a checklist of what to fix in priority order?"
- "Want me to re-run the audit after you've made changes?"

Do **not** ask the user to choose between vague options like
"what do you want to do next?". Be specific.

---

## 4. Selectors — when to use `ask_user_input_v0`

The skill is designed around explicit, structured choices. Use
`ask_user_input_v0` (rendered as tappable buttons in Claude
Desktop) in these moments:

- **Mode selector** — Site (URL) vs Content (text). At the start
  of any ambiguous request. **Skip** when Bridge Mode handshake
  succeeded — the user already chose in the app.
- **Audit depth** — when MVP grows, this selector will let users
  pick `quick` / `standard` / `deep`. For the current release
  there's only one depth, so no need to ask.
- **Continue after a critical error** — when `scan_site_minimal`
  returns `http_4xx`/`http_5xx`, ask "the page itself isn't
  responding, do you want to audit the rest of the site anyway?"
  with options Yes / No.
- **Bridge Mode setup-check (app_running_no_scan)** — see §2.3.2.
  Treat it as setup success; do not ask the user to click Scan.
- **Bridge Mode fallback (app_not_running, user mentioned app)** —
  see §2.3.1. Offer chat-only fallback if the user provided enough
  content or URL details.

Do **not** use selectors for:

- Confirming an obvious URL ("are you sure you want to audit
  this URL?") — just run.
- Asking the user to interpret tool results — that's your job.

---

## 5. Token budget — what NOT to dump in chat

The tools return structured JSON. Some fields are large:

- `analyze_sitemap` may include up to 20 URL entries.
- `analyze_content` includes a `summary` block with raw counts.
- `check_redirects` includes the full chain step-by-step.

**Never dump raw tool JSON to the user.** Always summarize. If
the user asks "show me the full data", you can include the
relevant structured block in a code fence — but this is opt-in,
not default.

The `issues[]` arrays from each tool are pre-computed verdicts
specifically designed to be quoted in your report. Use them
directly as material for the human-readable summary.

In Bridge Mode, the full tool data is already visible to the user
in the desktop app. Your chat summary should focus on
**interpretation and prioritization**, not raw data — the app
covers that.

---

## 6. Reference checklists

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

## 7. Mode B (Article Text Bridge)

Article text analysis is available through Bridge Mode. The Desktop App
stores the temporary text context in workspace `input.md` and selected
checks in the state file; Claude should use MCP tools to read that file
and write structured results back into the app.

When the bridge handshake returns `analysisType: "article_text"`:

- Call the selected article-text tools in `selectedTools`.
- Do not ask the user to paste the article into chat.
- Do not copy the article body into the final answer.
- If the handshake input contains `action: "solution"`, treat it as the
  app's "Suggest solution" flow: run the selected tools first, then
  propose a concrete solution, outline, or draft direction in chat from
  the tool evidence. If `input.md` contains only a topic or very thin
  brief, do not pretend a full article was analyzed; name the missing
  context and give a bounded plan or minimum clarifying question.
- Use the tool results to summarize what to fix first and what can wait.
- Keep recommendations and rewrite directions bounded by selected MCP
  tool evidence and built-in text checks; do not invent ranking promises,
  hidden formula weights, or unsupported editorial strategy.
- If `intent_seo_forecast` is present, use it for intent, hook,
  CTR/trend-potential, and WordPress/Laravel CMS metadata suggestions.
  Treat it as a local forecast unless a real SERP, Search Console, or
  social-platform data source is explicitly connected.
- Treat the newer text checks as separate editorial questions, not as
  one generic "AI detector":
  `ai_writing_probability` estimates AI-like style/rhythm probability
  and is not proof of authorship; `ai_trace_map` highlights local
  AI-like editing targets such as generic transitions, formal wording,
  repeated terms, or overly even rhythm; `genericness_water_check`
  flags broad/watery phrasing and weak concrete evidence;
  `readability_complexity` flags dense sentences and heavy paragraphs;
  `claim_source_queue` collects claims, numbers, absolute wording,
  vague authorities, and sensitive statements that need manual source
  verification, softer wording, or removal.
- If `safety_science_review` is present, surface critical warnings
  clearly and do not help with illegal activity, platform-rule evasion,
  or dangerous instructions. For legal, scientific, medical, investment,
  technical/engineering, country-specific, source-dependent, or
  calculation-heavy claims, treat the tool as a risk flag only. Do not
  present the result as legal, medical, investment, engineering, or
  scientific advice; say when expert, official-source, platform-rule, or
  external SERP/social verification is required.
- For copied article text, treat headings as text-only heading-like
  lines. Do not claim that Claude or MCP saw the original page's HTML
  H1. If no title is present, say the title was not found; for short
  social posts, an untitled state is acceptable.
- If the user later asks to rewrite, improve, or draft the analyzed
  article in the same bridge session, call `article_rewrite_context`
  instead of asking the user to paste the article again or trying to read
  `input.md` directly. Write the rewritten article directly in chat as a
  separate copyable article block; do not write it back into ToraSEO.
  The user copies the rewritten article into ToraSEO, runs a new scan,
  and may send the new bridge prompt again in the same session.
- Rewrite using the active Bridge Instructions plus selected tool
  evidence: platform, style/audience fit, SEO intent, media-marker
  policy, and safety/legal/medical/scientific/technical risk flags.
  Do not strengthen unverified claims or remove necessary caveats.
- If a rewrite is useful, ask whether the user wants media placeholder
  positions marked before inserting them.

For standalone `/toraseo` text requests without the app/MCP bridge, or
when ToraSEO Desktop App is unavailable, analyze the pasted chat text
through this SKILL in chat-only mode. Use the same article-text logic as
the bridge path where possible: platform/use-case, structure, style,
tone, language/audience, media placeholders, local repetition,
AI-writing style risk, AI trace map, genericness/watery text,
readability/complexity, claim source queue, logic, SEO intent/metadata
draft, and safety/science/legal-sensitive risk flags. Make clear that no
structured results are written into the ToraSEO app and that local/chat-only
review is not live SERP, plagiarism, legal, medical, investment,
engineering, scientific, or external source verification.

If the standalone user asks to rewrite or draft the article, write the
article directly in chat as a separate copyable block. Keep the rewrite
bounded by the same rules: do not strengthen unverified claims, keep
necessary caveats, ask about media placeholder positions before adding
them unless the user already requested media placement, and recommend
copying the result into ToraSEO for a new scan.

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
to the appropriate external category of tool (performance tools,
search-console products, backlink providers, etc.).
Be a good citizen — do not pretend ToraSEO covers ground it does
not.

---

## 10. Localization

The primary language of this skill is **English**. Russian and
other localizations will live in `i18n/<lang>/SKILL.md` once
added. Until then, use this rule:

- In ToraSEO Bridge Mode, the interface locale from the pasted desktop
  prompt is the default reply language for the run.
- Only switch to another language if the user explicitly changes
  language in their own new message.
- Outside the ToraSEO bridge flow, you can still reply in the user's
  language as normal.

The tool outputs themselves are language-neutral: they return codes and
structured data, not user-facing prose.

This applies to Bridge Mode error messages too — the templates
in §2.3 are reference English. Translate them only when the active
reply language for the run is not English.
