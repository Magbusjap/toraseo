<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/Magbusjap/toraseo/main/branding/logos/tora-logo-horizontal-dark.svg">
  <img src="https://raw.githubusercontent.com/Magbusjap/toraseo/main/branding/logos/tora-logo-horizontal.svg" alt="ToraSEO" width="480">
</picture>

**Open-source SEO toolkit built as a desktop app + MCP server + AI instructions**

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
[![Release: v0.1.0-alpha](https://img.shields.io/badge/Release-v0.1.0--alpha-FF6B35.svg)](https://github.com/Magbusjap/toraseo/releases)
[![Made with Claude](https://img.shields.io/badge/Made_with-Claude-D97757.svg)](https://claude.ai)
[![Made with Codex](https://img.shields.io/badge/Made_with-Codex-4D6BFE.svg)](https://openai.com/codex/)

</div>

**Language:** English | [Русский](README.ru.md)

---

ToraSEO is an open-source SEO workspace for structured site audits. It combines a desktop app, an MCP server, and reusable AI instruction packages so audits can run through either `MCP + Instructions` or `API + AI Chat`.

The project is intentionally split into independent components: you can use the app, the MCP server, or the instruction packages together or separately, depending on your workflow.

> [!NOTE]
> **App 0.0.8 is the current release candidate.** The app release is now the canonical public release entry and carries three asset groups together: desktop installer assets, Claude Bridge Instructions ZIP, and Codex Workflow Instructions ZIP.

> [!TIP]
> **ToraSEO supports both Claude and Codex workflows.** Use `claude-bridge-instructions` for Claude setup, `toraseo-codex-workflow` for Codex setup, or run `API + AI Chat` directly inside the desktop app.

## Quick navigation

- [What is in this repo](#what-is-in-this-repo)
- [Quick start](#quick-start)
- [Claude and Codex paths](#claude-and-codex-paths)
- [Current release status](#current-release-status)
- [What ToraSEO can do today](#what-toraseo-can-do-today)
- [Architecture](#architecture)
- [Release notes standard](#release-notes-standard)
- [Documentation map](#documentation-map)
- [Contributing](#contributing)
- [License](#license)

## What is in this repo

ToraSEO is a multi-surface repository. Multiple `README.md` files are expected here because several directories are independently usable entry points, not just internal folders.

| Surface | Purpose | Entry point |
|---|---|---|
| **Root repo** | Product overview, release status, documentation map | [`README.md`](README.md) |
| **Desktop app** | Native UI, bridge mode, native AI runtime | [`app/README.md`](app/README.md) |
| **MCP server** | Tool execution layer for scans and bridge data | [`mcp/README.md`](mcp/README.md) |
| **Claude Bridge Instructions** | Claude-side setup and workflow package | [`claude-bridge-instructions/README.md`](claude-bridge-instructions/README.md) |
| **Codex Workflow Instructions** | Codex-side setup and workflow package | [`toraseo-codex-workflow/README.md`](toraseo-codex-workflow/README.md) |
| **QA docs** | Manual checks and smoke-test support | [`qa/README.md`](qa/README.md) |

This pattern is deliberate: the root README helps users choose a path, while each component README goes deeper for its own audience.

## Quick start

Choose the path that matches how you want to work with ToraSEO.

### Path A - Desktop app user

Best for users who want the visual workspace, release assets, and either of the two runtime paths:

- `MCP + Instructions` for Claude Desktop / Codex bridge-driven audits
- `API + AI Chat` for the built-in native chat flow

Start here:

1. Download the latest app release from [GitHub Releases](https://github.com/Magbusjap/toraseo/releases).
2. Install the desktop app.
3. If you want `MCP + Instructions`, also install the MCP server and the relevant instructions ZIP package.
4. If you want `API + AI Chat`, configure your provider in the app Settings.

### Path B - MCP user

Best for users who want the scan tools directly and do not need the desktop UI.

```bash
git clone https://github.com/Magbusjap/toraseo.git
cd toraseo/mcp
npm install
npm run build
```

Then register the server in your MCP-compatible client:

```json
{
  "mcpServers": {
    "toraseo": {
      "command": "node",
      "args": ["/absolute/path/to/toraseo/mcp/dist/index.js"]
    }
  }
}
```

Full setup details live in [`mcp/README.md`](mcp/README.md).

### Path C - Bridge instructions user

Best for users who want guided audit workflows inside an AI client.

- For Claude setup, use [`claude-bridge-instructions/README.md`](claude-bridge-instructions/README.md)
- For Codex setup, use [`toraseo-codex-workflow/README.md`](toraseo-codex-workflow/README.md)

Download the ZIP assets from the unified [Releases page](https://github.com/Magbusjap/toraseo/releases). Do not use the auto-generated source-code archives for installation.

## Claude and Codex paths

ToraSEO treats Claude and Codex as first-class workflow paths rather than side notes.

| Path | Best for | Entry point |
|---|---|---|
| **Claude Bridge Instructions** | Guided audits inside Claude Desktop / Claude.ai / Claude Code | [`claude-bridge-instructions/README.md`](claude-bridge-instructions/README.md) |
| **Codex Workflow Instructions** | Repository-aware Codex workflows and bridge-mode scan delivery into the app | [`toraseo-codex-workflow/README.md`](toraseo-codex-workflow/README.md) |
| **API + AI Chat** | In-app interpretation flow without relying on an external chat client | [`app/README.md`](app/README.md) |

If you are evaluating ToraSEO as a product, this is the core distinction: Claude and Codex can orchestrate scans through instructions, while the desktop app can also run a native provider-backed interpretation path on its own.

## Current release status

### Stable baseline

- **`0.0.7`** is the released dual-mode baseline for the desktop app.

### Active release candidate

- **`0.0.8`** is focused on unified release packaging, Codex bridge result delivery, and native chat polish.

### Unified release assets

Starting with app `0.0.8`, a single GitHub release entry is intended to carry:

1. Desktop installer assets
2. `Claude Bridge Instructions` ZIP
3. `Codex Workflow Instructions` ZIP

The instruction packages remain independent components in repo structure and build flows, but public distribution is grouped under the app release.

## What ToraSEO can do today

The current public feature set is centered on **Mode A - Site Audit**.

| Tool | What it audits |
|---|---|
| `scan_site_minimal` | Reachability, title, h1, meta description, status, response timing |
| `check_robots_txt` | Crawl allowance, crawl-delay, robots availability |
| `analyze_meta` | Title, description, canonical, Open Graph, Twitter tags, viewport, lang |
| `analyze_headings` | Heading outline quality, skips, empty headings, h1 sanity |
| `analyze_sitemap` | Sitemap discovery, structure, fallback behavior, URL sampling |
| `check_redirects` | Redirect chains, loops, downgrade risks, terminal status |
| `analyze_content` | Main-text extraction, word count, link inventory, image alt coverage |

Outputs can be consumed in two product paths:

- **`MCP + Instructions`** - external AI client runs the workflow, the app can receive bridge results
- **`API + AI Chat`** - the app runs the scan and interprets it through the configured provider

## What is intentionally out of scope

These are current product boundaries, not hidden bugs:

- Mode B content-audit and humanizer workflows
- Site-wide multi-page crawling orchestration
- Core Web Vitals / PageSpeed analysis
- Backlink research, keyword tracking, and rank monitoring
- Paid third-party SEO data integrations as a default requirement

For release-by-release detail, see [CHANGELOG.md](CHANGELOG.md).

## Architecture

ToraSEO is designed so each layer stays independently useful:

- **App** for status, progress, reports, and native AI chat
- **MCP server** for scan execution and structured bridge data
- **Instruction packages** for Claude-side and Codex-side workflow orchestration

Three principles drive the design:

1. **Loose coupling** - app, MCP, and instruction packages should remain composable rather than fused
2. **Structured outputs first** - UI and AI layers consume normalized findings, not raw page dumps
3. **Security and trust boundaries matter** - provider secrets, bridge handshakes, and approval flows stay explicit

For the deeper design rationale, see [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Documentation map

- [App README](app/README.md) - desktop app setup and runtime behavior
- [MCP README](mcp/README.md) - server setup and tool details
- [Claude Bridge Instructions README](claude-bridge-instructions/README.md) - Claude installation and workflow
- [Codex Workflow Instructions README](toraseo-codex-workflow/README.md) - Codex installation and workflow
- [Architecture overview](docs/ARCHITECTURE.md)
- [Release notes for App 0.0.8](docs/RELEASE_NOTES_0.0.8.md)
- [Release template](docs/RELEASE_TEMPLATE.md)
- [Release draft for App 0.0.8](docs/RELEASE_DRAFT_0.0.8.md)
- [Crawling policy](CRAWLING_POLICY.md)
- [Security policy](SECURITY.md)
- [Changelog](CHANGELOG.md)

## Release notes standard

ToraSEO release descriptions should use a sectioned GitHub release format:

- short summary block at the top
- `Highlights`
- `Included assets`
- `Installation / upgrade notes`
- `What changed`
- `Verification`
- `Known limits`
- `Docs`

Optional but recommended for public-facing releases:

- logo or lightweight header image
- direct links to installer, docs, and instruction packages
- a compact status callout when a release candidate has specific expectations

This keeps public releases readable without turning them into marketing pages. The working template lives in [`docs/RELEASE_TEMPLATE.md`](docs/RELEASE_TEMPLATE.md), and the first concrete draft is tracked in [`docs/RELEASE_DRAFT_0.0.8.md`](docs/RELEASE_DRAFT_0.0.8.md).

## Contributing

The fastest ways to help right now:

- Star the repository
- Open an issue with product feedback, bugs, or workflow friction
- Run a real audit and share what worked or broke
- Report security issues privately per [`SECURITY.md`](SECURITY.md)

Formal contribution guidance can expand later, but the repo already accepts practical feedback and targeted fixes.

## SVG workflow

SVG assets in this repository can be edited directly as code. No extra plugin is required for repo-level SVG updates, including logo variants prepared specifically for GitHub light/dark surfaces.

If a future task needs illustration-grade vector editing in a visual editor, that becomes a tooling convenience choice, not a blocker for maintaining the SVG files in source control.

## License

Licensed under the [Apache License 2.0](LICENSE).

---

<div align="center">

**Built by [@Magbusjap](https://github.com/Magbusjap)** ·
[Report issue](https://github.com/Magbusjap/toraseo/issues) ·
[Security policy](SECURITY.md) ·
[Latest release](https://github.com/Magbusjap/toraseo/releases)

</div>
