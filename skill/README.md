# ToraSEO Skill

Claude Skill for SEO workflows. Once installed, Claude knows how to
conduct SEO audits, multi-engine optimization, and AI-content
humanization using the ToraSEO MCP server.

## Status

🚧 **In development.** Not yet ready for installation.

## What's inside

```
skill/
├── SKILL.md             # Main entry point read by Claude
├── checklists/          # Per-engine SEO checklists
│   ├── google-seo.md
│   ├── yandex-seo.md
│   ├── bing-seo.md
│   └── ai-search-geo.md
├── humanizer/           # Patterns for text humanization
│   ├── ru-patterns.json
│   ├── en-patterns.json
│   └── strategies.md
└── templates/           # Output formatting templates
    ├── audit-report.md
    └── recommendation-format.md
```

## Installation

_Coming with the first release._ Will be installable via
Claude Desktop → Customize → Skills.

## Architecture

See [`../docs/ARCHITECTURE.md`](../docs/ARCHITECTURE.md).
