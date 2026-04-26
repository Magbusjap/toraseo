<div align="center">

<img src="https://raw.githubusercontent.com/Magbusjap/toraseo/main/branding/logos/tora-logo-horizontal.svg" alt="ToraSEO" width="480">

**Open-source SEO toolkit built as a Claude Skill + MCP server**

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
[![Release: v0.1.0-alpha](https://img.shields.io/badge/Release-v0.1.0--alpha-FF6B35.svg)](https://github.com/Magbusjap/toraseo/releases)
[![Made with Claude](https://img.shields.io/badge/Made_with-Claude-D97757.svg)](https://claude.ai)

</div>

---

> [!NOTE]
> **v0.1.0-alpha is the first installable release.** Mode A (Site Audit)
> is complete with seven working tools. Mode B (Content Audit /
> AI-humanizer) is planned for v0.2. Public visual dashboard is a
> later milestone.

## What is ToraSEO?

ToraSEO is an SEO toolkit built around the
[Model Context Protocol](https://modelcontextprotocol.io/).
It connects to Claude Desktop (and other MCP-compatible AI clients)
and gives Claude a structured workflow for auditing websites.

You ask Claude *"audit my site"*, and behind the scenes ToraSEO runs
a full technical audit: robots.txt, sitemap, meta tags, headings,
redirects, content quality, and reachability — then returns a clean
priority-ordered report with concrete fix instructions.

It is built as two independent components that work together:

| Component | What it is | v0.1.0-alpha |
|---|---|:---:|
| **Skill** | Markdown instructions, checklists, report templates that teach Claude how to use the MCP tools | ✅ |
| **MCP server** | Node.js server that performs the actual HTTP requests, parsing, and analysis | ✅ |
| **Visual dashboard** | Native UI for status, progress, and reports | 📋 future |

## Quick start

### Prerequisites

- **Claude Desktop**, **Claude.ai** (Pro/Max/Team/Enterprise),
  or **Claude Code**. Skills require a paid tier.
- **Node.js 22+** for the MCP server

### 1. Install the MCP server

```bash
git clone https://github.com/Magbusjap/toraseo.git
cd toraseo/mcp
npm install
npm run build
```

Then register the server in your Claude Desktop config (path differs
per OS — see the [official MCP guide](https://modelcontextprotocol.io/quickstart/user)):

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

Restart Claude Desktop. The seven tools (`scan_site_minimal`,
`check_robots_txt`, `analyze_meta`, `analyze_headings`,
`analyze_sitemap`, `check_redirects`, `analyze_content`) should
now appear in the tools list.

### 2. Install the Skill

Download the latest `toraseo-skill-v*.zip` from the
[Releases page](https://github.com/Magbusjap/toraseo/releases),
then in Claude Desktop:

1. Open **Settings → Capabilities** and ensure
   **Code execution and file creation** is enabled.
2. Go to **Customize → Skills**, click **+ → Create skill**.
3. Upload the ZIP. Toggle the skill to **ON**.

> ⚠️ Use the `toraseo-skill-*.zip` asset, **not** the auto-generated
> "Source code (zip)" — the source archive contains the whole repo
> and won't install as a skill.

For the full installation walkthrough (including Claude Code), see
[`skill/README.md`](skill/README.md).

### 3. Try it

Open a new chat and say:

> Run an SEO audit on https://example.com

Claude will activate the skill, call the seven tools in turn, and
produce a structured report with critical issues, warnings,
informational notes, and a single concrete next step.

## What v0.1.0-alpha can do

Mode A — **Site Audit**. Given a URL, ToraSEO checks:

| Tool | What it audits |
|---|---|
| `scan_site_minimal` | Quick reachability check — title, h1, meta description, response time, status |
| `check_robots_txt` | Whether robots.txt allows crawling, plus crawl-delay |
| `analyze_meta` | Title / description / Open Graph / Twitter Card / canonical / charset / viewport / html lang |
| `analyze_headings` | h1..h6 outline, level skips, length anomalies, empty headings |
| `analyze_sitemap` | Sitemap discovery (robots.txt + `/sitemap.xml`), structural analysis, URL sampling |
| `check_redirects` | Manual redirect-chain walk, loop detection, HTTPS→HTTP downgrades, terminal status |
| `analyze_content` | Word counts, text-to-code ratio, link inventory, image alt coverage, paragraph structure |

Each tool returns severity-tagged findings. The skill aggregates
them into a single human-readable audit report against the
[Google Search Essentials checklist](skill/checklists/google-basics.md).

## What's NOT in v0.1.0-alpha (honest list)

These are **deliberately deferred**, not bugs:

- **Mode B** — content audit / AI-humanizer / readability / style
  matching. Coming in v0.2.
- **Yandex / Bing / AI-search specific checklists**. Google Search
  Essentials is the baseline; per-engine checklists arrive based on
  user feedback.
- **Schema.org / JSON-LD analyzer**. Deferred — Open Graph and
  Twitter Cards already cover the practical sharing case.
- **Multi-page crawling**. ToraSEO audits one URL per call by design.
  Site-wide scans require an explicit orchestrator that's not yet
  built.
- **Visual dashboard**. The architecture is designed for it but the
  UI itself is a later milestone.
- **Core Web Vitals / PageSpeed**. Use Google PageSpeed Insights for
  performance numbers — ToraSEO is for on-page signals.
- **Backlinks / keyword research / rank tracking**. Out of scope.
  These need paid third-party APIs (Ahrefs, DataForSEO).

For the full backlog and rationale per item, follow project
updates in [issues](https://github.com/Magbusjap/toraseo/issues)
and [discussions](https://github.com/Magbusjap/toraseo/discussions).

## Architecture

ToraSEO is designed so each component is independently useful:

- **Skill alone** — text-only experience; user describes intent,
  Claude reads instructions, calls MCP tools, produces a report
- **MCP alone** — technical scans without AI commentary; useful for
  scripted audits and CI checks
- **Full stack** (future) — richest experience with AI + visual
  dashboard

Three architectural principles drive the design:

1. **Skill works without MCP, MCP works without dashboard** —
   no component is a hard dependency of another
2. **Token efficiency is non-negotiable** — Claude never sees raw
   HTML, only summarized verdicts
3. **MCP is shared memory** — when the dashboard ships, Claude and
   UI never communicate directly; MCP holds shared state

For the full design rationale, see [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Ethical crawling

ToraSEO **always** honors robots.txt, identifies itself with an
honest User-Agent (`ToraSEO/X.Y.Z (+https://github.com/Magbusjap/toraseo)`),
and rate-limits at 1 request per 2 seconds per host (or whatever
robots.txt declares — whichever is slower). It does not bypass
CAPTCHAs, rotate proxies, spoof Googlebot, or crawl behind
authentication.

Full policy: [`CRAWLING_POLICY.md`](CRAWLING_POLICY.md).

## Documentation

- [Architecture overview](docs/ARCHITECTURE.md) — three-component design
- [Skill README](skill/README.md) — installation walkthrough
- [MCP server README](mcp/README.md) — server setup details
- [Google Search Basics checklist](skill/checklists/google-basics.md) — what gets audited
- [Security policy](SECURITY.md)
- [Crawling policy](CRAWLING_POLICY.md)
- [Changelog](CHANGELOG.md)

## Contributing

The fastest paths to contribute right now:

- ⭐ Star the repo if you find the project useful
- 💬 [Open an issue](https://github.com/Magbusjap/toraseo/issues)
  with feedback, bug reports, or feature requests
- 🐛 Report security issues privately per [`SECURITY.md`](SECURITY.md)
- 🧪 Run an audit on your own site and share what worked or didn't

A formal `CONTRIBUTING.md` will be published as v0.1.0-alpha matures
based on real feedback.

## Project name and identity

**ToraSEO** combines _tora_ (虎, tiger) with _SEO_. The mascot is
**Tora-chan** (虎ちゃん), an orange tiger cub representing alertness,
clarity, and focus. The brand reflects Japanese aesthetic principles:
clean lines, deliberate color choices, and a touch of playfulness.

## License

Licensed under the [Apache License 2.0](LICENSE).

---

<div align="center">

**Built by [@Magbusjap](https://github.com/Magbusjap)** ·
[Report issue](https://github.com/Magbusjap/toraseo/issues) ·
[Security policy](SECURITY.md) ·
[Latest release](https://github.com/Magbusjap/toraseo/releases)

</div>
