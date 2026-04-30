# ToraSEO App 0.0.8 Release Notes

This document is the repo-side release notes reference for the `0.0.8`
line. The future GitHub Releases body can be based on
[`RELEASE_DRAFT_0.0.8.md`](RELEASE_DRAFT_0.0.8.md) when the release is
actually published.

App 0.0.8 focuses on release consolidation, Codex bridge reliability,
and the first serious polish pass for the native AI chat experience.
It builds on the dual-mode 0.0.7 baseline without changing the core
product split between `MCP + Instructions` and `API + AI Chat`.

## Highlights

- Unified the public GitHub release entry for app, Claude bridge, and
  Codex workflow assets
- Fixed the Codex bridge path so app-visible results are rendered from
  structured bridge data instead of relying on chat text
- Kept completed bridge results visible after temporary state cleanup
- Improved Codex prompt UX with a persistent helper, copied-prompt
  toast, and clearer one-time approval guidance
- Hardened MCP mismatch handling so protocol token values are no longer
  exposed in user-visible responses
- Improved native AI chat output quality, locale handling, and
  post-scan interpretation behavior

## Included assets

- Desktop installer assets for the app release
- `toraseo-claude-bridge-instructions-*.zip`
- `toraseo-codex-workflow-*.zip`

This is the intended public release shape for `0.0.8+`.

## Installation / upgrade notes

- Fresh installs should start from the desktop app release page.
- Users who want `MCP + Instructions` must still set up the MCP server
  and install the relevant instructions ZIP in their AI client.
- Users who want `API + AI Chat` must configure a supported provider
  inside the app Settings.
- In Codex bridge flows, users should prefer one-time chat/session MCP
  approval when the Codex client offers that option.
- Older standalone instruction-package release entries remain usable as
  historical downloads, but the app release becomes the canonical
  public entry point.

## What changed

### App

- Bridge-mode results now map `buffer[toolId].data` into the app's
  `Overview` and `Confirmed facts` sections.
- Bridge severity summaries now understand both `issues[]` and the
  older `verdicts[]` naming.
- Completed bridge results persist in the renderer even after the
  temporary bridge state file is cleaned up.
- `Copy setup prompt` now surfaces a persistent helper near the
  sidebar until the user dismisses it or real bridge data arrives.
- Prompt copying now shows a short toast so the interaction has clear
  feedback.
- Native AI chat now has stronger locale guidance, a fuller structured
  response path, and automatic post-scan interpretation behavior after
  completed native scans.

### MCP / bridge

- Codex workflow guidance now explicitly steers users toward one-time
  chat/session approvals when available.
- Bridge mismatch handling no longer discloses expected or received
  protocol token values in MCP responses or app-visible error text.
- Prompt construction continues to avoid embedding protocol token
  values in renderer-visible text.

### Docs / packaging

- Release packaging now targets one app-led public release entry.
- Claude and Codex packages remain independently buildable through
  dedicated workflows and manual packaging paths.
- Smoke tests, changelog, README structure, and release-note standards
  were updated to match the unified release model.

## Verification

- Run `docs/SMOKE_TESTS.md` against App 0.0.8.
- Verify a real Codex bridge scan populates `Overview` and
  `Confirmed facts` from structured bridge data.
- Verify a real native `API + AI Chat` scan auto-starts
  interpretation and respects the selected locale.
- Verify GitHub Actions attaches the app installer, Claude ZIP, and
  Codex ZIP to one `v0.0.8` release.
- Confirm packaging/build works on Node.js 22 in a normal release
  environment.

## Known limits

- Codex clients still control MCP approval UX; the app can guide the
  user but cannot silently grant tool permissions on the user's behalf.
- Native AI chat quality still depends on the configured provider and
  chosen model.
- Unified release assets do not remove the architectural independence
  of the app, MCP server, and instruction packages.

## Docs

- [Root README](../README.md)
- [Architecture overview](ARCHITECTURE.md)
- [Changelog](../CHANGELOG.md)
- [Claude Bridge Instructions README](../claude-bridge-instructions/README.md)
- [Codex Workflow Instructions README](../toraseo-codex-workflow/README.md)
