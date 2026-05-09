# ToraSEO Documentation

**Language:** English | [Russian](README.ru.md)

This folder is the GitHub documentation hub for ToraSEO. The desktop app has its own built-in documentation screen, but GitHub should also explain the product paths, installation surfaces, and current limits without requiring the app to be open.

## Start Here

| Topic | When to read it |
|---|---|
| [Architecture](ARCHITECTURE.md) | You want to understand the app, MCP server, instruction packages, and trust boundaries. |
| [FAQ](FAQ.md) | You want short answers about modes, providers, reports, exports, and privacy. |
| [Model compatibility](MODEL_COMPATIBILITY.md) | You are choosing AI models for `API + AI Chat`. |
| [Smoke tests](SMOKE_TESTS.md) | You are validating a local build or release candidate. |
| [Design system](DESIGN_SYSTEM.md) | You are changing UI components, colors, layout, or mascots. |
| [Release template](RELEASE_TEMPLATE.md) | You are preparing a public GitHub release. |

## Product Modes

ToraSEO currently has three user-facing AI paths:

| Mode | What it does |
|---|---|
| **MCP + Instructions** | ToraSEO prepares the scan, Codex or Claude Desktop calls MCP tools, and the app receives structured results. |
| **API + AI Chat** | ToraSEO runs the workflow inside the app through a configured provider and model. |
| **Skill without MCP and APP** | A chat-only fallback when the instruction package is available, but the desktop app, MCP server, or active scan is not. |

## Analysis Areas

| Analysis | Status |
|---|---|
| Text | Active |
| Compare two texts | Active |
| Page by URL | Active |
| Site by URL | Active |
| Site comparison by URL | Active |
| Design and content by URL | In development |
| Image analysis | In development |

## GitHub Documentation Rules

- English is the primary documentation language.
- Russian pages should mirror the public product meaning, not preserve word-for-word phrasing.
- App screenshots may remain English until localized screenshots are prepared.
- Claims about ranking, traffic, backlinks, clicks, impressions, or SERP state must be tied to official data sources when implemented.
- AI-writing probability and AI trace signals are editing heuristics, not proof of authorship.

## Release Documentation

Release notes should stay practical:

- what changed
- what assets are included
- how to install or upgrade
- what was verified
- known limits
- links to the relevant docs

Historical release drafts live in [docs/releases](releases/).
