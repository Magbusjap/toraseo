---
name: toraseo-codex-workflow
description: Use when Codex is asked to work on the ToraSEO codebase, MCP server, runtime provider flow, SEO audit policy, smoke tests, release hardening, or the Codex bridge path. Provides the Codex-specific workflow, including the Codex bridge handshake, while keeping ToraSEO scoped to evidence-first audit behavior.
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

## Required Bridge Behavior

When the pasted prompt says `Use $toraseo-codex-workflow` and contains
`/toraseo codex-bridge-mode`, your first action is:

```text
verify_codex_workflow_loaded(token="codex-workflow-v1-2026-04-29")
```

Do not read the token from chat, do not ask the user for it, and do
not start analyzer tools before that handshake succeeds.

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
  immediately whether the user wants ToraSEO to mark recommended image
  positions for better SEO. If the user agrees, or already asked for
  image placement guidance, insert the exact ToraSEO media placeholder
  lines inside the rewritten article at the intended positions; do not
  invent alternate labels. For Russian article drafts, use:
  `------------------------- место для изображения --------------------------`.
- Do not claim that Codex Workflow Instructions are active unless the
  Codex handshake has verified them for the current session.
- Do not introduce Tora Rank / gamified scoring into an implementation
  pass unless the user explicitly asks for scoring work.
- Keep detailed product rules, handshake notes, and long-form design
  material in `references/`, not in this file.
