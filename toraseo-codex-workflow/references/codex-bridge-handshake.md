# Codex Bridge Handshake

Use this reference when working on the live Codex bridge path.

## Goal

ToraSEO must not trust process detection alone. A live Codex bridge scan
is considered ready only after Codex proves two things in the active
session:

1. Codex can reach the ToraSEO MCP surface.
2. Codex is operating with the intended Codex Workflow Instructions.

## Required first call

The user-facing prompt should stay compact. It only needs to activate
this package and say that ToraSEO is waiting. Do not require the prompt
to list selected tools, temporary workspace files, token-mismatch
handling, or final confirmation text; those details belong to this
package and the MCP handshake response.

When the prompt says `Use $toraseo-codex-workflow` and contains
`/toraseo codex-bridge-mode`, the first MCP call must be:

```text
verify_codex_workflow_loaded(token="codex-workflow-v1-2026-04-29")
```

Current user-facing Codex commands are:

| Command | Purpose |
|---|---|
| `/toraseo codex-bridge-mode setup-check` | Prove that Codex can access ToraSEO MCP and the Codex Workflow Instructions in the active session. |
| `/toraseo codex-bridge-mode article-text` | Run the article-text bridge flow. |
| `/toraseo codex-bridge-mode article-compare` | Run the two-text comparison bridge flow. |

The same MCP call is required for manual connectivity questions. If the
user asks in their own words whether Codex sees, can access, or is
connected to ToraSEO, ToraSEO MCP, the ToraSEO SKILL, or Codex Workflow
Instructions, do not guess from the visible UI, process list, or prior
memory. Call `verify_codex_workflow_loaded` and base the answer on the
tool response.

The token is stored only in this package and in the MCP server. It is
not copied into the user-facing bridge prompt.

If the MCP response is `token_mismatch`, do not ask the user to provide
the token. The expected token is intentionally not exposed in chat. Ask
the user to update or reinstall the `toraseo-codex-workflow` package,
restart Codex, open a new session, and run the setup check again.

For `/toraseo codex-bridge-mode setup-check`, never tell the user to
click Scan. It is not an analysis run and may be launched from the
connection/setup screen where no Scan button exists. On `setupVerified`,
confirm that ToraSEO MCP and Codex Workflow Instructions are reachable in
the current Codex session. On `app_not_running`, say that app liveness is
not reachable yet, ask the user to keep ToraSEO open on
`MCP + Instructions -> Codex`, and rerun the setup prompt after the app
refreshes. If the user wants work to continue without the app, use the
chat-only fallback and state that ToraSEO will not be updated.

## App trust model

The app may show that Codex is running, but that alone is not enough to
unlock the full path. The readiness contract is:

- `Codex is running`: process-level signal
- `ToraSEO MCP is available to Codex`: verified by handshake
- `Codex Workflow Instructions are available`: verified by handshake

If the handshake fails, the UI must stay honest and avoid fake green
states.

## Analysis types

The handshake response can describe different bridge workloads:

- `site_by_url`: call `site_url_internal` when it is available. It runs
  the selected site-audit checks inside ToraSEO and writes individual
  results back under the normal check names. Do not call separate site
  URL tools unless explicitly debugging one check. Do not request
  filesystem access to read JSON result files after the report is
  already visible in the app unless the user explicitly asks for raw
  debugging files. Do not ask the user to paste a report summary,
  screenshot, JSON, or result files after `site_url_internal` has
  completed; its MCP response contains enough facts for the final
  user-facing summary.
- `article_text`: call the selected article-text tools. The text body is
  stored in the temporary ToraSEO workspace as `input.md`, so Codex must
  not ask the user to paste it into chat. The selected MCP tools read
  that file and return enough structured evidence for the final chat
  summary and app report.
- `page_by_url`: call `page_url_article_internal` when returned by the
  handshake. It extracts the article from the URL or the optional
  user-highlighted text block, cleans local URL/page noise, and writes
  individual page/text check results back into the app. If Google or
  Yandex page checks are returned separately, call them after the
  internal package. Do not ask the user to paste the page text into chat.
- `article_compare`: call the selected comparison tools. Text A and
  Text B are stored in the temporary ToraSEO workspace as `input.md`, so
  Codex must not ask the user to paste either text into chat. Some
  selected tool IDs are shared with `article_text`; in this analysis type
  they mean "analyze A and B side by side." If the input goal is empty,
  produce the standard comparison report. If the goal focuses on one
  side, adapt the final chat answer to that side. Compare text evidence
  only; do not claim ranking causes from text alone.

For `article_text`, the handshake input may include `action: "scan"` or
`action: "solution"`. `scan` means analyze the submitted article and
summarize recommendations. `solution` means the user clicked "Suggest
solution": run the selected tools first, then propose a solution,
outline, or draft direction in chat from the tool evidence. If the app
only supplied a topic or very thin brief in `input.md`, do not imitate a
full analysis. Explain the missing context and give a bounded plan or
the minimum clarifying question needed for the next step.

For `article_text`, the final chat answer must be more than a completion
notice. Summarize each selected category, explicitly name the detected
style/platform/tone when those tools ran, and explain the first fixes the
user should make. If media placement is missing, ask whether the user
wants ToraSEO to add media markers; choose image, animation, video, or
audio from the article context only after the user agrees or asks for a
rewrite.

Keep backend keys out of the user-facing wording. For example, explain
`site_article` as "длинная статья для сайта" / "long site article" and
use raw IDs only in parentheses when they help debugging. Do the same for
tool IDs, issue codes, intent IDs, style IDs, and platform IDs.

When discussing headings in copied article text, do not claim that MCP
has seen the original page's HTML H1. It only sees pasted text and can
estimate heading-like lines. If the article title is missing, say that
the title was not found; for short social posts, "Untitled" is acceptable
because those formats may not use article titles.

If the user later asks to rewrite, improve, or draft the analyzed article
in the same ToraSEO bridge session, do not try to read `input.md`
directly through Codex filesystem access and do not ask the user to paste
the article again. Call the MCP tool `article_rewrite_context`; it reads
the active/cached ToraSEO article workspace and returns the article text
plus completed tool results for the rewrite pass. The rewritten article
must be written in chat as a separate copyable article block. Do not
write it back into ToraSEO. The expected loop is: user copies the
rewritten article from chat, pastes it into ToraSEO, runs a new scan, and
may paste the new bridge prompt again in the same Codex session. Treat
that later bridge prompt as a new analysis iteration and run the
handshake/tools again.

The article-text chat answer must stay evidence-bound. Base errors,
recommendations, rewrite directions, and "publish readiness" language on
the selected MCP tool results and built-in text checks only. Do not
invent ranking promises, a hidden ToraRank score, unsupported platform
strategy, or a full editorial rewrite outside the available evidence.
If a useful question is not covered by the current tools, name the
missing check instead of guessing.

When rewriting, preserve the behavior of this workflow package and the
selected ToraSEO tools: account for platform fit, style/audience fit,
SEO intent and metadata, media placeholder rules, safety/legal/medical/
scientific/technical risk flags, and the local-only nature of the
analysis. Do not silently remove required caveats or turn unverified
claims into stronger claims.

When `intent_seo_forecast` is present, use it for intent, hook,
CTR/trend-potential, and WordPress/Laravel CMS metadata suggestions.
Treat it as a local forecast unless a real external source explicitly
provides SERP, Search Console, or social-platform demand data.
If the CMS package looks copied from a service element such as
"Part 1", "Download PDF", or a numeric navigation line, tell the user
that metadata is a weak draft and suggest a human-readable title,
description, keywords, category, tags, and slug from the article topic.
When `safety_science_review` is present, surface critical warnings
clearly and do not help with illegal activity, platform-rule evasion, or
dangerous instructions. For legal, scientific, medical, financial, or
calculation-heavy claims, treat the tool as a risk flag only and remind
the user that AI can be wrong and expert review may be required.

If the handshake response contains `input.analysisRole`, apply it as the
reviewer role. If it is `default` or absent, use ToraSEO's standard
analysis rules and choose a suitable rewrite role yourself when proposing
next steps.

End article-text chat output with a numbered list of choices for the
user, not a vague open question. Example shape:

1. Нужно ли пользователю переписать статью целиком в роли `<role>`?
2. Нужно ли пользователю сначала поправить структуру H2/H3?
3. Нужно ли пользователю добавить медиа-метки?

If the user declines or does not answer, acknowledge it gently and leave
the analysis as-is.

Some article-text checks are built in and may be present in
`selectedTools` even when the user did not see them as sidebar
checkboxes: `article_uniqueness`, `language_syntax`,
`ai_writing_probability`, `ai_trace_map`,
`genericness_water_check`, `readability_complexity`,
`claim_source_queue`, `naturalness_indicators`, and
`logic_consistency_check`, `intent_seo_forecast`, and
`safety_science_review`. Optional sidebar checks can include
`fact_distortion_check` and `ai_hallucination_check`.

Treat `ai_writing_probability`, `ai_trace_map`,
`claim_source_queue`, and `ai_hallucination_check` as separate
questions. The first estimates AI-like style. `ai_trace_map` highlights
local editing targets, not authorship proof. `claim_source_queue`
collects claims for source review. `ai_hallucination_check` reviews
claim safety around vague authorities, fabricated citation placeholders,
and possibly invented factual details.

The slash command in the copied prompt is only the trigger. It must not
encode fake versioned text-analysis subcommands; the source of truth is
the handshake response, the app state, and the temporary workspace paths
returned by MCP.

## Chat-Only Fallback

If Codex Workflow Instructions are loaded but ToraSEO MCP and/or the
Desktop App scan is unavailable, do not pretend that the app was updated.
Load `references/chat-only-fallback.md` and give a bounded chat-only
ToraSEO analysis from the text or details the user provided. Do not load
that fallback reference when the handshake succeeds and selected MCP
tools are available.

## Tool permissions

Codex may ask the user to approve MCP tool calls. The preferred UX is a
one-time chat/session approval for the ToraSEO MCP server when the
platform offers that choice. When the approval dialog appears, guide
the user to tick the chat/session approval checkbox and click Allow.
Repeated per-tool approvals are a fallback only when Codex does not
expose a broader approval option.

For `site_by_url`, approval is only needed for `site_url_internal`. After
that package finishes and writes results to ToraSEO, do not request
additional MCP approval or filesystem permission for the final chat
summary. Use the MCP response and visible app report as the source of
facts; temporary `results/*.json` files are for debugging/export paths,
not for the normal user-facing summary. Do not ask the user to paste a
report summary, screenshot, JSON, or result files.

Do not describe per-tool approval as the intended long-term product
flow. Future ToraSEO scans may use many more tools, so the bridge
workflow should always guide the user toward the least repetitive
available approval scope.
