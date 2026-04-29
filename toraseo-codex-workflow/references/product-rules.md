# Product Rules

Use this reference when changing ToraSEO product behavior or UX.

## Current release rules

- `MCP + Instructions` and `API + AI Chat` are distinct execution modes.
- `MCP + Instructions` keeps deterministic scan execution outside the
  native in-app AI chat path.
- `API + AI Chat` may use provider-backed interpretation, but it must
  stay scoped to the active analysis.
- Facts from MCP tools and AI interpretation must remain clearly
  separated in product output.

## Naming rules

- Say `Claude Bridge Instructions` for the Claude-side package.
- Say `Codex Workflow Instructions` for the Codex-side package.
- Do not collapse both into a single generic `Skill` label in the user
  interface.

## Readiness rules

- Claude readiness is based on its existing runtime verification flow.
- Codex readiness must not rely on a manual checkbox as the source of
  truth.
- If a state cannot be verified, the UI should say that plainly.
