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

- `site_by_url`: call the selected site-audit tools for the returned URL.
- `article_text`: call the selected article-text tools. The text body is
  stored in the temporary ToraSEO workspace as `input.md`, so Codex must
  not ask the user to paste it into chat. The selected MCP tools read
  that file and write their structured results back into the app state
  and `results/*.json`.

For `article_text`, the final chat answer must be more than a completion
notice. Summarize each selected category, explicitly name the detected
style/platform/tone when those tools ran, and explain the first fixes the
user should make. If media placement is missing, ask whether the user
wants ToraSEO to add media markers; choose image, animation, video, or
audio from the article context only after the user agrees or asks for a
rewrite.

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
`ai_writing_probability`, `naturalness_indicators`, and
`logic_consistency_check`. Optional sidebar checks can include
`fact_distortion_check` and `ai_hallucination_check`.

Treat `ai_writing_probability` and `ai_hallucination_check` as separate
questions. The former estimates AI-like style; the latter reviews claim
safety around vague authorities, fabricated citation placeholders, and
possibly invented factual details.

The slash command in the copied prompt is only the trigger. It must not
encode fake versioned text-analysis subcommands; the source of truth is
the handshake response, the app state, and the temporary workspace paths
returned by MCP.

## Tool permissions

Codex may ask the user to approve MCP tool calls. The preferred UX is a
one-time chat/session approval for the ToraSEO MCP server when the
platform offers that choice. When the approval dialog appears, guide
the user to tick the chat/session approval checkbox and click Allow.
Repeated per-tool approvals are a fallback only when Codex does not
expose a broader approval option.

Do not describe per-tool approval as the intended long-term product
flow. Future ToraSEO scans may use many more tools, so the bridge
workflow should always guide the user toward the least repetitive
available approval scope.
