<div align="center">

<img src="https://raw.githubusercontent.com/Magbusjap/toraseo/main/branding/logos/tora-logo-horizontal.svg" alt="ToraSEO" width="480">

**Open-source SEO toolkit built as a Claude Skill + MCP server + visual dashboard**

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
[![Status: Pre-MVP](https://img.shields.io/badge/Status-Pre--MVP-orange.svg)](#status)
[![Made with Claude](https://img.shields.io/badge/Made_with-Claude-D97757.svg)](https://claude.ai)

</div>

---

> [!WARNING]
> **ToraSEO is in active design phase (pre-MVP).** Code is not yet ready for use.
> Stars and feedback are welcome — installable releases are coming.

## What is ToraSEO?

ToraSEO is an SEO toolkit built around the [Model Context Protocol](https://modelcontextprotocol.io/).
It connects to Claude Desktop (and other MCP-compatible AI clients) and provides:

- **Multi-engine SEO audits** — Google, Yandex, Bing, AI search
- **AI content humanization** — making generated text pass AI detectors with verified results
- **Native Russian language support** — first-class, not an afterthought
- **Visual dashboard** — status indicators, progress, reports (planned)

It is built as three independent components that work together or alone:

| Component | What it is | Status |
|---|---|:---:|
| **Skill** | Markdown instructions and checklists for Claude | 🚧 |
| **MCP server** | Node.js server that performs scans and analysis | 🚧 |
| **Visual dashboard** | UI for status, progress, and reports | 📋 |

## Why another SEO tool?

The market has multiple SEO tools but a clear gap exists for:

1. **Multi-language native support** — most tools are English-only
2. **Multi-engine optimization** — most tools are Google-only
3. **Visual dashboard experience** — no MCP-based competitor has this
4. **AI-detector verified humanization** — only weak attempts exist

## Architecture

ToraSEO follows a three-component design where each component is independently useful:

- **Skill alone** — text-only experience in Claude Desktop
- **MCP alone** — technical scans without AI commentary
- **Full stack** — richest experience with AI + visual dashboard

For details, see [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Project Status

- ✅ Architecture document
- ✅ Brand identity (Tora-chan mascot, color palette)
- ✅ Security policy ([`SECURITY.md`](SECURITY.md))
- ✅ Crawling policy ([`CRAWLING_POLICY.md`](CRAWLING_POLICY.md))
- 🚧 MCP server (in development)
- 📋 Skill files (planned)
- 📋 Visual dashboard (architecture decision pending)

## Documentation

- [Architecture overview](docs/ARCHITECTURE.md)
- [Security policy](SECURITY.md)
- [Crawling policy](CRAWLING_POLICY.md)
- [Brand book](branding/BRAND_BOOK.md) _(coming soon)_

## Contributing

The project is in pre-MVP design phase. The best way to contribute right now:

- ⭐ Star the repository to show interest
- 💬 Open an issue with feedback or feature requests
- 🐛 Report security issues privately per [`SECURITY.md`](SECURITY.md)

A formal `CONTRIBUTING.md` will be published before the first installable release.

## License

Licensed under the [Apache License 2.0](LICENSE).

## Project name and identity

**ToraSEO** combines _tora_ (虎, tiger) with _SEO_. The mascot is **Tora-chan**
(虎ちゃん), an orange tiger cub representing alertness, clarity, and focus.
The brand reflects Japanese aesthetic principles: clean lines, deliberate
color choices, and a touch of playfulness.

---

<div align="center">

**Built by [@Magbusjap](https://github.com/Magbusjap)** ·
[Report issue](https://github.com/Magbusjap/toraseo/issues) ·
[Security policy](SECURITY.md)

</div>
