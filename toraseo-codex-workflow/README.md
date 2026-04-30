# ToraSEO Codex Workflow Instructions

This package is the Codex-side instruction component for ToraSEO.

It is intentionally separate from the Claude package:

- `claude-bridge-instructions/` is packaged for Claude Desktop /
  Claude.ai style skill installation.
- `toraseo-codex-workflow/` is packaged for Codex local skill loading.

## Why this package is split across files

Codex should not depend on one massive `SKILL.md`.

This package uses:

- `SKILL.md` as a short entry point
- `references/` for detailed guidance loaded only when needed
- `agents/openai.yaml` for Codex UI metadata

That keeps the trigger file small, makes the package easier to evolve,
and avoids wasting context on every task.

## Package layout

```text
toraseo-codex-workflow/
|- README.md
|- SKILL.md
|- agents/
|  `- openai.yaml
`- references/
   |- codex-bridge-handshake.md
   |- future-direction.md
   |- product-rules.md
   `- runtime-distinction.md
```

## Notes

- `agents/openai.yaml` is service metadata used by Codex to display the
  skill cleanly in its UI. It is not the workflow logic itself.
- A folder existing on disk is not proof that the current Codex session
  is using the package. ToraSEO uses a live MCP handshake for that.

## Install and verify

1. Copy this whole `toraseo-codex-workflow/` folder into your Codex
   local skills directory:

```text
~/.codex/skills/toraseo-codex-workflow
```

2. Restart Codex so it can discover the new package.
3. Open ToraSEO and choose `MCP + Instructions -> Codex`.
4. In ToraSEO, click `Copy setup prompt`.
5. Paste that text into Codex.

If Codex can call `verify_codex_workflow_loaded`, ToraSEO will know that:

- the ToraSEO MCP server is reachable from Codex
- the Codex Workflow Instructions are active in that live Codex session

This setup check does not start a site scan. It only verifies the
Codex-side connection before the first analysis.

When Codex asks for ToraSEO MCP permission, choose the one-time
chat/session approval option if it is available. In the current Codex
permission dialog this usually means ticking the chat/session checkbox
and then clicking Allow. Per-tool approval is only a platform fallback,
not the intended ToraSEO workflow.
