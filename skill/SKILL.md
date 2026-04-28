---
name: toraseo
description: Conduct SEO audits and content reviews using the ToraSEO MCP server. Use this skill when the user asks for an SEO audit, wants to check robots.txt / sitemap / meta tags / headings / redirects / page content, or needs guidance on improving the on-page SEO of a specific URL. The skill orchestrates the seven Mode A site-audit tools exposed by the toraseo MCP server and produces a structured, prioritized report. Supports Bridge Mode handshake when ToraSEO Desktop App is running an active scan.
---

# ToraSEO Skill

You are operating with the **ToraSEO** skill, a guided SEO-audit workflow
backed by the `toraseo` MCP server. This skill turns a single user
intent ("audit this site") into a coordinated sequence of MCP tool
calls and produces a clear, prioritized report.

> **Status: v0.2.0 — Mode A (Site Audit) + Bridge Mode handshake.**
> Mode B (Content Audit / AI-humanizer) is planned for a later release
> and is not available yet.

---

## 1. When to use this skill

Activate this skill when **any** of the following is true:

- The user types a slash-command starting with `/toraseo` (e.g.
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
- The user mentions the **ToraSEO Skill** or **MCP server** by
  name in connection with a SEO task.

Do **not** activate this skill when:

- The user asks general SEO theory questions ("what is E-E-A-T?",
  "explain canonical tags") with no specific URL — answer from
  general knowledge instead.
- The user asks for SEO help with a piece of text or article body
  (no URL involved). That is Mode B territory and is not yet
  implemented; tell them so honestly (see §7).
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
- The user types `/toraseo` followed by any SEO-related request
  (e.g. `/toraseo проверь example.com`).
- The user mentions the **Desktop App / приложение / программу**
  alongside a URL, in any phrasing — paraphrased prompts must
  also work.
- The user mentions ToraSEO by name in any spelling (see §1
  trigger list) AND a URL.

In **all** of these, your **first action** is to call:

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

### 2.2 Interpreting the response — successful handshake

If `verify_skill_loaded` returns:

```json
{
  "ok": true,
  "scanId": "...",
  "url": "https://example.com",
  "selectedTools": ["check_robots_txt", "analyze_meta", ...],
  "message": "Handshake verified..."
}
```

— the app has a scan waiting. Use the returned `url` and
`selectedTools` as your scope. **Do not ask the user to confirm
the URL** — they already provided it in the app.

Call each tool in `selectedTools` (in any order, but matching the
listed order makes the app's UI feel linear). Each tool writes
its result to the state file; the app polls and updates its UI
in real time. You will receive a brief summary in chat for each
tool — use these to compose the final recommendations.

When all tools complete, write the **standard audit report**
in chat following §3.4 and the template in
`templates/audit-report.md`. The user reads the report in chat
and sees the structured per-tool data in the app.

### 2.3 Interpreting the response — error responses

If `verify_skill_loaded` returns `{ok: false, error: ...}`,
react based on the `error` code. User-facing replies must be
in the **user's language** — the templates below are reference
English; translate on the fly.

#### 2.3.1 `app_not_running`

The Desktop App is not running (no alive-file, or its PID is
dead).

```json
{ "ok": false, "error": "app_not_running", "reason": "...", "message": "..." }
```

If the user **mentioned the app** in their message, tell them:

> "Похоже, что приложение ToraSEO не запущено. Запустите его,
> нажмите Сканировать с нужным URL и инструментами, затем
> перешлите мне сгенерированный промпт. Если хотите получить
> SEO-отчёт прямо в чате (без приложения), скажите — я сделаю
> обычный аудит."

If the user **did not** mention the app (e.g. they typed
`/toraseo проверь example.com` without referencing the desktop
app explicitly), proceed silently with the regular Mode A
workflow (§3) — the app is just not part of their flow.

#### 2.3.2 `app_running_no_scan`

The Desktop App is running, but the user hasn't clicked Scan
yet.

```json
{ "ok": false, "error": "app_running_no_scan", "appPid": ..., "appVersion": "...", "message": "..." }
```

This is an explicit **branch point** — the user must choose.
Use `ask_user_input_v0` with two options:

- **Option A:** "Хочу получить результат прямо в чате" /
  "I want results in chat" — fall back to the regular Mode A
  workflow (§3) using the URL the user mentioned. Don't run
  Bridge Mode tools; the app won't show data because no scan
  was started.
- **Option B:** "Я нажму Сканировать в приложении" /
  "I'll click Scan in the app" — reply: *"Хорошо, нажмите
  Сканировать в приложении и пришлите мне любое сообщение,
  когда будете готовы (например, 'готово' или 'я нажал')."*
  Then **stop and wait**. Do NOT call any tools. The user will
  click Scan in the app, then send another message. On that
  next message, call `verify_skill_loaded` again — by then it
  should return `ok: true` and Bridge Mode proceeds.

Critical: **do not start a Mode A audit on Option B** — the
user explicitly chose to wait. Do not call tools without an
explicit choice. If the user gives an ambiguous response (not
A or B), ask again with the same selector.

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
> `toraseo-skill-v*.zip` со страницы GitHub Releases, затем в
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
  seven analyzer tools in your tool inventory, the MCP server is
  connected. If those tools are missing entirely, tell the user:
  *"MCP-сервер ToraSEO не подключён. Проверьте подключение в
  настройках Claude Desktop (Settings → Connectors → toraseo)."*
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

The toraseo MCP server exposes **seven Mode A analyzer tools**
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

Every analyzer tool returns a JSON object with an `issues[]` array
of severity-tagged verdicts (`critical` / `warning` / `info`),
plus structured raw data.

**Each analyzer tool is idempotent and safe.** All seven honor
robots.txt, respect a 2-second per-host rate limit, and never
write or POST. You can call them in any order without side
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

Before running the seven analyzers, do a **single fast check**
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

#### Step 3 — The seven checks

Call the remaining six tools. They are independent — order does
not affect results — but a sensible reading order for the user is:

1. `check_robots_txt` — can search engines reach this at all?
2. `check_redirects` — does the URL canonicalize cleanly?
3. `analyze_meta` — what do indexers see in the head?
4. `analyze_headings` — is the page structure semantic?
5. `analyze_sitemap` — does the site help engines discover URLs?
6. `analyze_content` — is there enough substance to rank?

You may call them sequentially (clearer logs) or in parallel
(faster). Both are valid. Sequential is the default — it gives the
user a sense of progress in chat.

In Bridge Mode, follow the order in `selectedTools` as returned
by `verify_skill_loaded`. The app's UI lists the tools in that
order — running them in matching order makes progress feel linear
to the user.

#### Step 4 — Synthesize the report

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
- **Bridge Mode branch (app_running_no_scan)** — see §2.3.2. Two
  options: "I want results in chat" (Mode A fallback) /
  "I'll click Scan in the app" (wait for user).
- **Bridge Mode fallback (app_not_running, user mentioned app)** —
  see §2.3.1. Two options: "Run a regular audit anyway" /
  "I'll start the app first".

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

## 7. Mode B (Content Audit) — coming later

If the user asks for any of:

- AI-humanizer / make this text sound less AI-generated
- Readability score for an article
- Content quality review of pasted text (no URL)
- Anti-detector verification (Originality.ai, GPTZero, etc.)

Respond honestly:

> Content Audit (Mode B) is planned for a later ToraSEO release
> and is not available yet. The current build only audits sites
> by URL (Mode A). For now, I can give you general feedback on
> the text using my own judgement, but I don't have the toraseo
> MCP tools for content humanization yet — those are coming.

Then offer a fallback: if the text was published somewhere with a
URL, you **can** audit that URL with Mode A and comment on the
on-page signals around the article.

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
other localizations will live in `i18n/<lang>/SKILL.md` once
added. Until then, respond to the user in whatever language they
wrote in — translate the report on the fly. The tool outputs
themselves are language-neutral (they return codes and structured
data, not user-facing prose).

This applies to Bridge Mode error messages too — the templates
in §2.3 are reference English. Translate them to match the
user's language.
