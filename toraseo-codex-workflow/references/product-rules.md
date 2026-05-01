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
- `Site by URL` is one analysis type, not the whole product surface.
- New analysis cards may be visible before they are executable, but the
  UI must label planned modes honestly.
- Media/image analysis is excluded from the first `0.0.9` analysis-type
  implementation pass unless the user reopens that scope.

## Formula rules

- Do not ship Tora Rank / gamified scoring as part of the first `0.0.9`
  analysis-type expansion.
- Future formulas may be dynamic per analysis type and selected tool set.
- Tool count affects evidence coverage, not automatic score quality.
- Keep `0..100%` as a familiar display scale, but separate it from
  coverage and uncertainty when formulas become real.

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
