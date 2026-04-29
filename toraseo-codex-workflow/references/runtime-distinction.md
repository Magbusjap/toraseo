# Runtime Distinction

- `claude-bridge-instructions/` is the Claude-side component.
- `toraseo-codex-workflow/` is the Codex-side component.
- Claude uses its own instruction package plus `verify_skill_loaded`.
- Codex uses this package plus `verify_codex_workflow_loaded`.
- Never tell users that Claude installation and Codex installation are
  the same mechanism.

## Practical meaning

- A Claude ZIP release can be installed into Claude Desktop / Claude.ai.
- The Codex package is a local Codex skill folder that belongs in the
  user's Codex skills directory.
- `agents/openai.yaml` is only Codex UI metadata. It is not where the
  workflow logic lives.
- A folder existing on disk is not proof that the active Codex session
  loaded it. Session proof comes from the handshake.
