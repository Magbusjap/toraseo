---
name: toraseo-codex-workflow
description: Use when Codex is asked to work on the ToraSEO codebase, MCP server, runtime provider flow, SEO audit policy, smoke tests, release hardening, the Codex bridge path, or to check whether Codex can see/access ToraSEO MCP and Codex Workflow Instructions. Provides the Codex-specific workflow, including the Codex bridge handshake, while keeping ToraSEO scoped to evidence-first audit behavior.
---

# ToraSEO Codex Workflow

Use this package when working inside the ToraSEO repository or when the
user explicitly asks Codex to participate in the ToraSEO bridge flow.

This package is for Codex. It is not the Claude package and must never
be described as the same installation model.

Keep this file short. Treat it as the entry point, not the entire
knowledge base. Load the reference files only when the task needs them.

## Start Here

1. Read `references/runtime-distinction.md` once at the start of a
   ToraSEO task.
2. If the task is about the live Codex bridge path, also read
   `references/codex-bridge-handshake.md`.
3. If the task changes product behavior or UX, read
   `references/product-rules.md`.
4. If the task changes analysis types, tool selection, or formula
   groundwork, read `references/analysis-policy.md`.
5. If the task is future-facing strategy work, read
   `references/future-direction.md`.
6. If the live ToraSEO bridge cannot run because MCP and/or the Desktop
   App is unavailable, read `references/chat-only-fallback.md`. Do not
   read that fallback file when the bridge handshake succeeds and all
   selected MCP tools are available.

## Required Bridge Behavior

ToraSEO Desktop prompts are intentionally short. Do not expect the
prompt to repeat the token rules, selected tools, temporary file paths,
or result format. Extra prompt text costs user tokens; this package and
the ToraSEO MCP handshake are the source of truth for those details.

When the pasted prompt says `Use $toraseo-codex-workflow` and contains
`/toraseo codex-bridge-mode`, your first action is:

```text
verify_codex_workflow_loaded(token="codex-workflow-v1-2026-04-29")
```

Recognized Codex trigger variants:

| Command | Meaning |
|---|---|
| `/toraseo codex-bridge-mode setup-check` | Verify that Codex can reach ToraSEO MCP and that Codex Workflow Instructions are active. |
| `/toraseo codex-bridge-mode article-text` | Analyze one article text from the temporary ToraSEO workspace. |
| `/toraseo codex-bridge-mode article-compare` | Compare Text A and Text B from the temporary ToraSEO workspace. |
| `/toraseo codex-bridge-mode page-by-url` | Analyze the main article text extracted from a URL. |
| `/toraseo codex-bridge-mode site-by-url` | Run the internal site URL audit package and summarize its facts. |
| `/toraseo codex-bridge-mode site-compare` | Compare up to three site URLs as one competitive dashboard. |

Recognized chat-only fallback variants, used only when the live Desktop
App/MCP bridge cannot run:

| Command | Meaning |
|---|---|
| `/toraseo chat-only-fallback article-text` | Analyze pasted article text directly in chat. |
| `/toraseo chat-only-fallback article-compare` | Compare pasted Text A and Text B directly in chat. |
| `/toraseo chat-only-fallback page-by-url` | Analyze pasted page text or a visible page extract; do not pretend a URL was fetched if browsing is unavailable. |
| `/toraseo chat-only-fallback site-by-url` | Analyze available site evidence directly in chat; do not pretend a URL was fetched if browsing is unavailable. |
| `/toraseo chat-only-fallback site-compare` | Compare available evidence for up to three sites as one compact dashboard. |

Also run this same check when the user manually asks whether Codex can
see, access, or connect to ToraSEO, ToraSEO MCP, the ToraSEO SKILL, or
Codex Workflow Instructions. Do not answer these setup questions from
memory or process status alone. The live MCP handshake is the proof.

Do not read the token from chat, do not ask the user for it, and do
not start analyzer tools before that handshake succeeds.

If `verify_codex_workflow_loaded` returns `token_mismatch`, do not ask
the user to reveal or paste the protocol token. Treat it as an
installation/version problem: tell the user to update or reinstall the
`toraseo-codex-workflow` package, restart Codex, open a new session, and
run the setup check again.

For `/toraseo codex-bridge-mode setup-check`, do not tell the user to
click Scan. This command only verifies reachability of ToraSEO MCP and
the Codex Workflow Instructions. If the response says `setupVerified`,
confirm that setup is ready and tell the user they can return to ToraSEO
and choose an analysis type. If the response says `app_not_running`,
explain that MCP/Workflow Instructions may be loaded but the ToraSEO app
liveness marker is not reachable yet; ask the user to keep ToraSEO open
on `MCP + Instructions -> Codex` and rerun the setup prompt after the app
refreshes. If the user wants analysis without the app, switch to the
chat-only fallback instead of sending them to a generic Scan button.

After the handshake succeeds, use the returned `analysisType` and
`selectedTools` as the contract. For `site_by_url`, call
`site_url_internal` first; that one MCP permission runs the selected core
site-audit checks one by one and writes individual results back to the
app under normal check names, so the progress bar advances per check.
Then call any additional tools returned after `site_url_internal`. Do not
request filesystem access to read JSON result files after the site report
is already visible in the app unless the user explicitly asks for raw
debugging files. Do not ask the user to paste the report summary, a
screenshot, JSON, or result files after the selected site URL tools have
completed; their MCP responses and the app report contain enough facts
for the final user-facing summary.
For `site_compare`, call `site_compare_internal` when it is available;
that single MCP call runs the selected site checks for up to three URLs
and writes compact comparison entries back to the app. Do not render
three full audits side by side. Your final answer should follow the
comparison dashboard shape: summary, compact site KPI cards,
comparative metrics, heatmap/direction matrix, winners by block, and
actionable insights. Do not ask for JSON, screenshots, pasted summaries,
or result files after `site_compare_internal` has completed.
For `article_text`,
the article body is already stored
in the temporary ToraSEO workspace as `input.md`; do not ask the user to
paste the article into chat and do not copy the article body back into
your final answer. Call the selected article-text MCP tools directly and
summarize from their responses and the app report. Then give a useful
article-analysis answer in chat: name what style/platform/tone you detected, mention every selected
tool category at least briefly, and separate "what to fix first" from
"optional improvements". Do not say only that results were written to
the app. Built-in text checks may run even when they are not visible as
sidebar checkboxes: uniqueness, syntax, AI-writing probability,
naturalness, and logic consistency.

If the handshake input contains `action: "solution"`, treat the run as
the app's "Suggest solution" flow. Run the selected article-text tools
first, then propose the solution, outline, or draft direction directly
in chat from the tool evidence. The app may provide only a topic or a
short brief in `input.md`; in that case, do not pretend a full article
was analyzed. State what context is missing and give a bounded plan or
the minimum clarifying question needed for a stronger draft.

If the handshake input contains `analysisRole`, apply that role while
interpreting the text. If the role is `default` or empty, use ToraSEO's
standard analysis posture and choose the most suitable reviewer role
yourself when offering a rewrite.

After an article-text analysis, end with a numbered list of clear user
choices. Include whether the user needs a rewrite, whether they need a
shorter structure pass, whether media markers are useful, and which role
you would use for the rewrite. If the user stays silent or declines, do
not push; respond politely and keep the analysis available for later.

For `article_compare`, Text A and Text B are already stored in the
temporary ToraSEO workspace as `input.md`. Do not ask the user to paste
either text into chat and do not copy both full texts back into the
answer. Run every selected tool. The selected tool list may include the
same tool IDs used by `article_text`; in comparison mode they mean
"analyze A and B side by side." If the user did not specify a goal,
write the standard comparison report for both texts. If the user did
specify a goal, adapt the answer to that goal: for example, if the user
asks for strengths and weaknesses of text B, focus the final answer on
text B instead of forcing a symmetrical report. Keep the boundary
text-only: do not claim ranking causes from text alone, and do not
rewrite the full article unless the user asks in a later message.

For `page_by_url`, the URL and optional user-highlighted text block are
already stored in the app state/workspace. Do not ask the user to paste
the page text into chat. Call each selected page URL MCP tool returned
by the handshake, in order. `extract_main_text` must run before the
article-text checks so the temporary article body is available to those
checks. Google and Yandex page search checks are separate provider-bound
checks and must not invent clicks, impressions, indexed phrases, or
mentions without an official connected source. Keep the final answer
user-facing: do not mention handshake details, scan ids, tool ids, or
result files unless the user asks for debugging.

Do not confuse `ai_writing_probability` with
`ai_trace_map`, `genericness_water_check`, `readability_complexity`,
`claim_source_queue`, or `ai_hallucination_check`.
The first is a style/rhythm probability. `ai_trace_map` is an editing
map of local AI-like fragments, not authorship proof.
`genericness_water_check` flags broad or watery phrasing and weak
concrete evidence. `readability_complexity` flags dense sentences and
heavy paragraphs. `claim_source_queue` collects statements that need
source review, softer wording, or removal. `ai_hallucination_check`
is an optional claim-safety review for vague sources, fabricated
citations, or factual details that may have been invented during
AI-assisted drafting. `fact_distortion_check` is also optional and is a
claim-risk review, not a complete internet fact-check.

The prompt command is only a trigger. The real bridge protocol is:
Codex Workflow Instructions -> `verify_codex_workflow_loaded` -> MCP
selected tools -> app state updates.

## Response Language Rule

When ToraSEO provides an interface locale in the pasted desktop prompt or
bridge context, treat that locale as the default reply language for the
current run. If the interface locale is English, reply in English. If the
interface locale is Russian, reply in Russian.

Only override that default when the user explicitly switches language in
their own new message. Do not drift into another language just because a
previous conversation, model habit, or surrounding UI happened to use it.

If the user asks for `article_text`, `article_compare`, `page_by_url`,
`site_by_url`, or `site_compare` analysis while ToraSEO Desktop App or
the live MCP bridge is unavailable, switch to the chat-only fallback in
`references/chat-only-fallback.md`. Make clear that the app will not be
updated and that no MCP tools, live SERP, external plagiarism, legal,
medical, investment, engineering, or scientific expert verification ran.
For URL-only requests, do not pretend the URL was fetched unless your
current environment has a real browsing/network tool and you actually
used it. Do not read the fallback file during a healthy bridge run; the
handshake response and selected MCP tools are authoritative then.

If Codex asks the user to approve ToraSEO MCP tools, prefer the
one-time chat/session approval option when the platform offers it. Tell
the user to tick the chat/session approval checkbox and click Allow. Do
not ask the user to approve each analyzer tool one by one unless Codex
itself provides no broader approval path.

For `site_by_url`, call `site_url_internal` for the core site checks,
then call any additional tools returned by the handshake.
For `site_compare`, the only analysis MCP approval should be
`site_compare_internal`. After an internal aggregator
completes and ToraSEO has the report, write the final chat summary from
those results without asking for another MCP tool approval, report
screenshot, pasted summary, JSON file, or filesystem permission to read
the temporary bridge cache.

## Working Rules

- Keep ToraSEO evidence-first: deterministic scan facts first, model
  interpretation second.
- Keep analysis type, selected tools, AI interpretation, and formula
  policy as separate layers.
- Keep `API + AI Chat` scoped to the active analysis.
- Keep `MCP + Instructions` free of in-app AI chat.
- When the active task is ToraSEO text/content analysis, keep the
  conversation anchored to analysis, recommendations, contradiction
  checks, or article drafting. If the user drifts into general search,
  offer to gather material for the article instead of acting like a
  general-purpose chat.
- When proposing to rewrite or substantially rework an article, ask
  whether the user wants ToraSEO to add text markers where media should
  be placed. If the user agrees, choose the marker type from the article
  context: image, animation, video, or audio. Insert the exact ToraSEO
  media placeholder lines at the intended positions; do not invent
  alternate labels. For Russian article drafts, use these marker words:
  `место для изображения`, `место для анимации`, `место для видео`,
  `место для аудио`.
- Do not claim that Codex Workflow Instructions are active unless the
  Codex handshake has verified them for the current session.
- Do not invent or calculate Tora Rank inside chat. If the ToraSEO app
  already displays a Tora Rank / cgs preview for the active text
  analysis, describe it as an app-side preview layer built above the
  completed tool metrics. MCP tools still produce the evidence; the app
  currently renders the early cgs score. Do not confuse it with raw text
  counters such as character counts.
- Keep detailed product rules, handshake notes, and long-form design
  material in `references/`, not in this file.
