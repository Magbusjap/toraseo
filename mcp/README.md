# ToraSEO MCP Server

Model Context Protocol server for ToraSEO. Performs SEO scans, analysis,
and content humanization on behalf of an MCP-compatible AI client
(Claude Desktop, Claude Code, Cursor, etc.).

## Status

🚧 **In development.** Not yet functional.

## Planned tools

- `scan_site(url)` — full SEO audit
- `check_robots_txt(url)` — parse and validate robots.txt
- `analyze_meta(url)` — title, description, OG, schema.org, Twitter Cards
- `check_yandex_index(url)` — Yandex Webmaster API integration
- `humanize_text(text, lang)` — AI-detector-aware text rewriting
- `app_set_url(url)` — push state to visual dashboard
- `app_set_status(stage, payload)` — push progress updates

## Installation

_Coming with the first release._

## Architecture

See [`../docs/ARCHITECTURE.md`](../docs/ARCHITECTURE.md) for the full
three-component system overview, and
[`../CRAWLING_POLICY.md`](../CRAWLING_POLICY.md) for ethical crawling rules
that this server enforces.
