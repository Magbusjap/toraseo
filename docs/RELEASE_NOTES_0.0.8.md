# ToraSEO App 0.0.8 Release Notes

App 0.0.8 focuses on Codex bridge reliability and release packaging.
It builds on the dual-mode 0.0.7 baseline without changing the core
product split between `MCP + Instructions` and `API + AI Chat`.

## Highlights

- Unified GitHub release asset list under the app tag `v0.0.8`
- App installer assets, Claude Bridge Instructions ZIP, and Codex
  Workflow Instructions ZIP attached to the same release entry
- Standalone manual packaging workflows retained for the two
  instruction packages
- Codex bridge results now render from `buffer[toolId].data` in the
  app's `Overview` and `Confirmed facts` areas
- Bridge issue counts now read the core analyzer `issues[]` contract
  as well as the older `verdicts[]` name
- Completed bridge results remain visible in the renderer after the
  temporary state file is cleaned up
- `Copy setup prompt` now shows a persistent Codex helper until the
  user dismisses it or real Codex scan data reaches the app
- Codex prompts and workflow docs now guide users toward one-time
  chat/session MCP approval when the platform offers it
- Codex prompt copy now shows a short toast, and the persistent helper
  sits near the sidebar with clearer permission guidance
- MCP token mismatch errors no longer disclose bridge protocol token
  values in responses or app-visible error messages

## Security and trust notes

- The Codex handshake token still lives only in the Codex Workflow
  Instructions package and MCP server.
- Prompt text continues to avoid embedding bridge protocol tokens.
- A Codex chat message is not treated as proof of scan success; the app
  must receive and render bridge data.
- Provider secrets and native runtime behavior are unchanged from the
  0.0.7 baseline.

## Verification required before tag

- Run `docs/SMOKE_TESTS.md` against App 0.0.8.
- Verify a real Codex bridge scan shows populated `Overview` and
  `Confirmed facts` after completion.
- Verify GitHub Actions attaches the app installer, Claude ZIP, and
  Codex ZIP to one `v0.0.8` release.
- Confirm app packaging/build works on Node.js 22 in a normal release
  environment.
