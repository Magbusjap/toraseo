# Codex Bridge Handshake

Use this reference when working on the live Codex bridge path.

## Goal

ToraSEO must not trust process detection alone. A live Codex bridge scan
is considered ready only after Codex proves two things in the active
session:

1. Codex can reach the ToraSEO MCP surface.
2. Codex is operating with the intended Codex Workflow Instructions.

## Required first call

When the prompt says `Use $toraseo-codex-workflow` and contains
`/toraseo codex-bridge-mode`, the first MCP call must be:

```text
verify_codex_workflow_loaded(token="codex-workflow-v1-2026-04-29")
```

The token is stored only in this package and in the MCP server. It is
not copied into the user-facing bridge prompt.

## App trust model

The app may show that Codex is running, but that alone is not enough to
unlock the full path. The readiness contract is:

- `Codex is running`: process-level signal
- `ToraSEO MCP is available to Codex`: verified by handshake
- `Codex Workflow Instructions are available`: verified by handshake

If the handshake fails, the UI must stay honest and avoid fake green
states.

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
