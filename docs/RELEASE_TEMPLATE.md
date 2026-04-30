# ToraSEO Release Template

Use this structure for public GitHub releases starting with the unified app-led release flow introduced in `0.0.8`. The goal is a public release page that looks polished and helpful without turning into a marketing landing page.

## Title

`App X.Y.Z - short release name`

## Optional header

- logo or lightweight header image
- one-line release summary
- direct links when useful: installer, docs, instructions packages
- release-candidate callout if the version is intentionally not final

## Highlights

- 2-5 bullets covering the highest-value changes
- Mention user-visible behavior first
- Keep wording factual, not promotional

## Included assets

- Desktop installer assets
- `toraseo-claude-bridge-instructions-*.zip`
- `toraseo-codex-workflow-*.zip`

If a release intentionally omits one of these assets, say so explicitly.

Recommended order:

1. App installer assets
2. Claude Bridge Instructions ZIP
3. Codex Workflow Instructions ZIP

## Installation / upgrade notes

- Fresh install path
- Upgrade path from the previous app version
- Any required MCP or instructions update coordination
- Any approval or provider setup note the user must know before first use
- If this is a release candidate, say what still needs validation

## What changed

Group changes by subsystem when possible:

### App

- UI, runtime, bridge, export, settings, updater changes

### MCP / bridge

- Tool behavior, state handoff, protocol, security, parser changes

### Docs / packaging

- Release workflow, packaging, docs, smoke tests, changelog updates

## Verification

- Smoke tests run
- Manual scenarios run
- Platform/build assumptions confirmed
- Anything still pending before the tag

## Known limits

- Explicitly list what is still unfinished or intentionally deferred
- Keep this honest and short

## Docs

- Link to the most relevant docs for this release:
  - architecture
  - component README files
  - changelog
  - release-specific notes

## Working examples

- [`docs/RELEASE_NOTES_0.0.8.md`](RELEASE_NOTES_0.0.8.md) - structured release notes for the `0.0.8` line
- [`docs/RELEASE_DRAFT_0.0.8.md`](RELEASE_DRAFT_0.0.8.md) - ready-to-use GitHub release body draft for the future `0.0.8` publish step
