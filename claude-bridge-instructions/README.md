# ToraSEO Claude Bridge Instructions

Claude-side instruction package for ToraSEO workflows. It teaches Claude Desktop how to use the ToraSEO MCP server, respect the product boundaries, and summarize audit evidence without inventing unavailable data.

This package is separate from the Codex package:

- `claude-bridge-instructions/` is for Claude Desktop / Claude.ai style skill installation.
- `toraseo-codex-workflow/` is for Codex local skill loading.

## Status

**0.0.9 release candidate.** The package supports the current ToraSEO analysis families:

- article text
- compare two texts
- page by URL
- site by URL
- site comparison by URL
- chat-only fallback when MCP or the app is unavailable

## Installation

### 1. Prerequisites

- ToraSEO MCP server registered in Claude Desktop.
- ToraSEO desktop app if you want bridge results to appear in the app.
- Claude Desktop / Claude.ai / Claude Code with skill support.

### 2. Get The ZIP

Download the prebuilt ZIP from the [Releases page](https://github.com/Magbusjap/toraseo/releases):

```text
toraseo-claude-bridge-instructions-vX.Y.Z.zip
```

Use the asset named `toraseo-claude-bridge-instructions-*.zip`, not the auto-generated GitHub source archive.

### 3. Install In Claude

1. Open Claude settings.
2. Go to the Skills area.
3. Install the ZIP.
4. Start a new chat after installation.

### 4. Verify

Run the setup check from ToraSEO or ask Claude which skills are available. For a real bridge run, open ToraSEO, choose `MCP + Instructions`, select an analysis, and paste the generated Claude command.

## Chat-Only Fallback

When the skill is installed but the desktop app, MCP server, or active scan is unavailable, use the fallback commands documented in [docs/README.md](../docs/README.md). In this path Claude answers in chat from pasted or visible evidence, and the ToraSEO app report is not updated.

## Package Layout

```text
claude-bridge-instructions/
|- SKILL.md
|- checklists/
|- references/
`- templates/
```

## Documentation

- [Documentation hub](../docs/README.md)
- [FAQ](../docs/FAQ.md)
- [Codex workflow package](../toraseo-codex-workflow/README.md)
