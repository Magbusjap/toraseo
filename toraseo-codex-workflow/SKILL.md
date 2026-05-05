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

After the handshake succeeds, use the returned `analysisType` and
`selectedTools` as the contract. For `site_by_url`, selected tools audit
the returned URL. For `article_text`, the article body is already stored
in the temporary ToraSEO workspace as `input.md`; do not ask the user to
paste the article into chat and do not copy the article body back into
your final answer. Call the selected article-text MCP tools directly;
they read `input.md` and write structured results back to the app state
and `results/*.json`. Then give a useful article-analysis answer in
chat: name what style/platform/tone you detected, mention every selected
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

Do not confuse `ai_writing_probability` with
`ai_hallucination_check`. The first is a style/rhythm probability. The
second is an optional claim-safety review for vague sources, fabricated
citations, or factual details that may have been invented during
AI-assisted drafting. `fact_distortion_check` is also optional and is a
claim-risk review, not a complete internet fact-check.

The prompt command is only a trigger. The real bridge protocol is:
Codex Workflow Instructions -> `verify_codex_workflow_loaded` -> MCP
selected tools -> app state updates.

If the user asks for article-text or two-text comparison analysis while
ToraSEO Desktop App or the live MCP bridge is unavailable, switch to the
chat-only fallback in `references/chat-only-fallback.md`. Make clear that
the app will not be updated and that no MCP tools, live SERP, external
plagiarism, legal, medical, investment, engineering, or scientific expert
verification ran. Do not read the fallback file during a healthy bridge
run; the handshake response and selected MCP tools are authoritative then.

If Codex asks the user to approve ToraSEO MCP tools, prefer the
one-time chat/session approval option when the platform offers it. Tell
the user to tick the chat/session approval checkbox and click Allow. Do
not ask the user to approve each analyzer tool one by one unless Codex
itself provides no broader approval path.

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
- Do not introduce Tora Rank / gamified scoring into an implementation
  pass unless the user explicitly asks for scoring work.
- Keep detailed product rules, handshake notes, and long-form design
  material in `references/`, not in this file.
