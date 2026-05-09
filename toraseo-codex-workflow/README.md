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
   |- analysis-policy.md
   |- product-rules.md
   `- runtime-distinction.md
```

## Notes

- `agents/openai.yaml` is service metadata used by Codex to display the
  skill cleanly in its UI. It is not the workflow logic itself.
- A folder existing on disk is not proof that the current Codex session
  is using the package. ToraSEO uses a live MCP handshake for that.
- If the desktop app, MCP server, or active scan is unavailable, use
  the chat-only fallback commands documented in `docs/README.md`. In
  that path Codex answers in chat from pasted or visible evidence and
  does not update the ToraSEO app report.

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

The copied prompt is intentionally short. It should only activate this
package and point Codex to ToraSEO MCP. The workflow rules, selected
tools, temporary files, error handling, and final response policy live
in this package and in the MCP handshake response.

If Codex can call `verify_codex_workflow_loaded`, ToraSEO will know that:

- the ToraSEO MCP server is reachable from Codex
- the Codex Workflow Instructions are active in that live Codex session

The same rule applies if the user types a manual question in Codex, for
example asking whether Codex can see ToraSEO, ToraSEO MCP, the ToraSEO
SKILL, or has access to the bridge. Codex should call
`verify_codex_workflow_loaded` and answer from that live result instead
of guessing.

If the check returns `token_mismatch`, do not copy protocol tokens into
chat. That means Codex loaded an older/different package, or did not
load this package. Replace the local `toraseo-codex-workflow` folder
with the current one, restart Codex, open a new session, and repeat the
setup check.

This setup check does not start a site scan. It only verifies the
Codex-side connection before the first analysis.

When Codex asks for ToraSEO MCP permission, choose the one-time
chat/session approval option if it is available. In the current Codex
permission dialog this usually means ticking the chat/session checkbox
and then clicking Allow. Per-tool approval is only a platform fallback,
not the intended ToraSEO workflow.

## Documentation

- [Documentation hub](../docs/README.md)
- [FAQ](../docs/FAQ.md)
- [Claude Bridge Instructions](../claude-bridge-instructions/README.md)
