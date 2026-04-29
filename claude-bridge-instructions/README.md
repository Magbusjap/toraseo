# ToraSEO Claude Bridge Instructions

Claude-side instruction package for SEO workflows. Once installed,
Claude knows how to conduct SEO audits using the ToraSEO MCP server's
seven Mode A tools (robots.txt, sitemap, meta, headings, redirects,
content, and a quick reachability scan).

This package is the Claude-side instruction component for ToraSEO.
Codex has a separate package at `toraseo-codex-workflow/`.

## Status

🚧 **v0.1.0-alpha — Mode A only.** Mode B (Content Audit /
AI-humanizer) is planned for v0.2.

## Installation

### 1. Prerequisites

- A working installation of the **ToraSEO MCP server** (see
  [`../mcp/README.md`](../mcp/README.md)). The skill on its own does
  nothing — it's a set of instructions that tells Claude how to
  use the MCP tools effectively.
- **Claude Desktop**, **Claude.ai** (Pro/Max/Team/Enterprise), or
  **Claude Code**. Skills are not available on the free tier.

### 2. Get the skill ZIP

The easiest path is to download the prebuilt ZIP from the
[Releases page](https://github.com/Magbusjap/toraseo/releases):

> **Download:** `toraseo-claude-bridge-instructions-vX.Y.Z.zip`
>
> Use the asset named `toraseo-claude-bridge-instructions-*.zip`, **not** the
> auto-generated "Source code (zip)" — the source archive contains
> the whole repo and won't install as Claude Bridge Instructions.

### 3. Install in Claude Desktop / Claude.ai

1. Open **Settings → Capabilities** and confirm **Code execution
   and file creation** is enabled.
2. Go to **Customize → Skills**.
3. Click the **+** button → **+ Create skill**.
4. Upload `toraseo-claude-bridge-instructions-vX.Y.Z.zip`.
5. Toggle the skill to **ON**.

### 4. Install in Claude Code

```bash
# Unzip the release into your personal skills folder
unzip toraseo-claude-bridge-instructions-vX.Y.Z.zip -d ~/.claude/skills/
```

After unzip you should have `~/.claude/skills/toraseo/SKILL.md`.
That path is for Claude local skill loading; it is not the Codex skill
installation path.

### 5. Verify

Open a new chat and ask:

> What skills do you have available?

Claude should mention `toraseo`. Then for a real test:

> Run an SEO audit on https://example.com

Claude should activate the skill, call the seven MCP tools in turn,
and produce a structured audit report.

## What's inside

```text
claude-bridge-instructions/
├── SKILL.md                       # Main entry point read by Claude
├── checklists/
│   └── google-basics.md           # Google Search Essentials checklist
└── templates/
    └── audit-report.md            # Structural template for the report
```

Future releases will add:

- `checklists/yandex-seo.md` — Yandex-specific signals
- `checklists/bing-seo.md` — Bing webmaster tools
- `checklists/ai-search-geo.md` — AI-search readiness (ChatGPT,
  Perplexity, Google AI Overviews)
- `humanizer/` — Patterns for the v0.2 Content Audit mode

## Building the ZIP yourself

If you cloned the repo and want to build the ZIP locally (for
testing or contributing):

```bash
./scripts/build-skill.sh v0.1.0
```

This produces `toraseo-claude-bridge-instructions-v0.1.0.zip` in the repo root with the
correct structure for upload to Claude.

CI builds the same ZIP automatically on every `v*` git tag —
see [`.github/workflows/release-skill.yml`](../.github/workflows/release-skill.yml).

## Architecture

See [`../docs/ARCHITECTURE.md`](../docs/ARCHITECTURE.md) for the
full three-component picture (Claude Instructions / MCP / future App).

## Localization

The primary language of this skill is English. Russian and other
localizations will live under `i18n/<lang>/` once added — they
will package as separate ZIPs (`toraseo-claude-bridge-instructions-ru-vX.Y.Z.zip`).
