# App 0.0.8 - Unified release packaging, Codex bridge reliability, and native chat polish

App 0.0.8 is the first release-candidate line built around a unified public release entry. It keeps the dual-mode product shape from `0.0.7`, but tightens how bridge results, instruction packages, and native AI interpretation are presented and delivered.

## Highlights

- Unified the public release entry for the desktop app, Claude Bridge Instructions ZIP, and Codex Workflow Instructions ZIP
- Fixed Codex bridge result delivery so structured findings populate the app instead of depending on chat text
- Kept completed bridge results visible after temporary bridge cleanup
- Improved Codex setup UX with a persistent helper, copied-prompt feedback, and clearer approval guidance
- Improved native AI chat output quality, locale handling, and post-scan interpretation behavior
- Hardened MCP mismatch handling so protocol token values are no longer disclosed in user-visible responses

## Included assets

- Desktop installer assets
- `toraseo-claude-bridge-instructions-*.zip`
- `toraseo-codex-workflow-*.zip`

## Installation / upgrade notes

- New users should start from the desktop app asset on the release page.
- `MCP + Instructions` users still need the MCP server plus the relevant instructions ZIP in their AI client.
- `API + AI Chat` users must configure a supported provider inside the app Settings before running native interpretation.
- Codex bridge users should prefer one-time chat/session MCP approval when the Codex client offers that option.
- Older standalone instruction-package releases remain available as historical downloads, but `0.0.8+` uses the app release as the canonical public entry point.

## What changed

### App

- Bridge-mode results now map structured `buffer[toolId].data` into visible `Overview` and `Confirmed facts` sections.
- Bridge severity summaries now understand both `issues[]` and the older `verdicts[]` naming.
- Completed bridge results remain visible after temporary bridge state cleanup.
- `Copy setup prompt` now shows a persistent Codex helper near the sidebar until the user dismisses it or real bridge data arrives.
- Prompt copying now shows a short toast so the interaction has immediate feedback.
- Native AI chat now has stronger locale guidance, a fuller structured response path, and automatic post-scan interpretation after completed native scans.

### MCP / bridge

- Codex workflow guidance now explicitly steers users toward one-time chat/session approvals when available.
- Bridge mismatch handling no longer discloses expected or received protocol token values in MCP responses or app-visible error text.
- Prompt construction continues to avoid exposing protocol token values in renderer-visible text.

### Docs / packaging

- Public release packaging now targets one app-led release entry.
- Claude and Codex packages remain independently buildable through dedicated workflows and manual packaging paths.
- Root README, release docs, and release-note standards were updated to reflect the multi-surface product structure.

## Verification

- Run `docs/SMOKE_TESTS.md` against App 0.0.8.
- Verify a real Codex bridge scan populates `Overview` and `Confirmed facts` from structured bridge data.
- Verify a real native `API + AI Chat` scan auto-starts interpretation and respects the selected locale.
- Verify GitHub Actions attaches the app installer, Claude ZIP, and Codex ZIP to one `v0.0.8` release.
- Confirm packaging/build works on Node.js 22 in a normal release environment.

## Known limits

- Codex clients still control MCP approval UX; the app can guide the user but cannot grant tool permissions silently.
- Native AI chat quality still depends on the configured provider and chosen model.
- Unified release assets do not remove the architectural independence of the app, MCP server, and instruction packages.

## Docs

- [Root README](../README.md)
- [App README](../app/README.md)
- [Claude Bridge Instructions README](../claude-bridge-instructions/README.md)
- [Codex Workflow Instructions README](../toraseo-codex-workflow/README.md)
- [Architecture overview](ARCHITECTURE.md)
- [Changelog](../CHANGELOG.md)
