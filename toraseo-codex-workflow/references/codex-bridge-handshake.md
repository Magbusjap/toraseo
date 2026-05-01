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
