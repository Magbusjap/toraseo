# Codex Bridge Handshake

Use this reference when working on the live Codex bridge path.

## Goal

ToraSEO must not trust process detection alone. A live Codex bridge scan
is considered ready only after Codex proves two things in the active
session:

1. Codex can reach the ToraSEO MCP surface.
2. Codex is operating with the intended Codex Workflow Instructions.

## Required first call

When the prompt starts with `/toraseo codex-bridge-mode`, the first MCP
call must be:

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
