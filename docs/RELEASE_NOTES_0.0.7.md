# ToraSEO App 0.0.7 Release Notes

App 0.0.7 is the first dual-mode desktop release candidate for
ToraSEO. It keeps the existing `MCP + Instructions` path and adds the new
native `API + AI Chat` path so the app can remain useful even when
Claude Desktop is not available.

## Highlights

- Home-screen execution mode selection: `MCP + Instructions` or
  `API + AI Chat`
- Separate native windows for the main audit workspace, AI chat, and
  details/metrics
- OpenRouter provider adapter with one encrypted key and multiple
  saved model profiles
- Secure local provider configuration through Electron `safeStorage`
- Provider diagnostics moved into Settings so users do not spend
  tokens just to unlock the home flow
- Home-screen model selection for `API + AI Chat`
- Codex readiness rows for the `MCP + Instructions` path
- Separate Codex Workflow Instructions package under
  `toraseo-codex-workflow/`
- Structured audit reports with confirmed facts separated from expert
  hypotheses
- `strict_audit` and `audit_plus_ideas` policy modes
- Second-screen details window
- PDF, document, and presentation exports for native audit reports
- Updated security model for Electron IPC, preload, and provider
  secrets

## Security notes

- API keys are stored in the Electron main process and encrypted with
  OS-level secure storage when available.
- Raw provider secrets are not returned to the renderer.
- The report contract keeps factual tool output separate from AI
  interpretation.
- Bridge Mode prompt text does not expose the protocol token; the token
  remains sourced from the Claude Bridge Instructions package.
- Codex Workflow Instructions are not treated as proof that Claude
  Bridge Mode is installed, and the app does not pretend to verify
  Codex MCP/instruction readiness from process detection alone.

## Before installing

This release should be smoke-tested with:

- Node.js 22 for local build verification
- a valid OpenRouter key and at least one saved model profile for
  native mode
- Claude Desktop with the ToraSEO Claude Bridge Instructions enabled
  for Bridge Mode
- Codex running plus a live `verify_codex_workflow_loaded` handshake
  for the Codex bridge path

See `docs/SMOKE_TESTS.md` for the full checklist.

## Known verification note

In one local Codex environment, `npm.cmd run build` inside `app/`
failed before compiling the app with `electron-vite` / `esbuild`
`spawn EPERM` while running Node.js 25.9.0. Type-checking passed, and
`core` + `mcp` built successfully. Final packaging should be verified
on Node.js 22 before tagging `v0.0.7`.
