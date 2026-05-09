# ToraSEO Architecture

**Version:** App 0.0.9 release candidate
**License:** Apache 2.0
**Status:** active desktop app, MCP server, Claude instructions, Codex workflow instructions, and provider-backed in-app chat.

ToraSEO is an open-source SEO analysis workspace built around three composable surfaces:

- **Desktop app:** setup, mode selection, progress, reports, exports, provider settings, and native AI chat.
- **MCP server:** structured tool execution, bridge handshake, selected-check contracts, and report delivery into the app.
- **Instruction packages:** Claude Desktop and Codex workflow rules that teach the external AI client how to use ToraSEO safely.

## Runtime Modes

| Mode | Primary user path | App report updated |
|---|---|---|
| **MCP + Instructions** | Codex or Claude Desktop calls ToraSEO MCP tools from an external AI chat. | Yes |
| **API + AI Chat** | ToraSEO runs the analysis inside the app through a configured provider and model. | Yes |
| **Skill without MCP and APP** | Chat-only fallback when the instruction package exists but app/MCP/active scan is unavailable. | No |

## High-Level Flow

```text
User
 |
 v
ToraSEO Desktop App
 |-- API + AI Chat --> Provider model
 |
 |-- MCP + Instructions --> Codex / Claude Desktop
                          |
                          v
                       ToraSEO MCP Server
                          |
                          v
                     Structured tool evidence
                          |
                          v
                       Desktop report
```

The fallback path is intentionally separate:

```text
User -> Codex / Claude Skill -> chat-only answer
```

In fallback mode, the app is not updated and the AI should work only from pasted or visible evidence.

## Component Responsibilities

### Desktop App

- Presents the main mode selection screen.
- Shows analysis forms, sidebars, checklists, progress, reports, and FAQ/docs.
- Stores provider configuration and app defaults.
- Runs `API + AI Chat` analysis through the configured provider.
- Receives MCP bridge updates for `MCP + Instructions`.
- Keeps UI state clear with mascot states and report versions.

### MCP Server

- Exposes analysis tools to MCP-compatible AI clients.
- Verifies that the correct Claude/Codex instruction package is active.
- Returns selected tools and analysis type as a contract.
- Runs internal analysis wrappers for page, site, text, and comparison workflows.
- Updates the app through the bridge lifecycle when a scan is active.

### Instruction Packages

- Keep model behavior aligned with ToraSEO product rules.
- Prevent unsupported claims about rankings, traffic, backlinks, clicks, impressions, or SERP state.
- Keep output tied to tool evidence.
- Provide fallback commands for chat-only analysis when the app/MCP path is unavailable.

## Current Analysis Areas

| Analysis | Notes |
|---|---|
| Text | Article quality, structure, readability, AI-style signals, SEO package, and risks. |
| Compare two texts | Text A/B comparison, content gaps, similarity risk, style differences, and improvement plan. |
| Page by URL | Page extraction and article-style analysis for one URL. |
| Site by URL | Technical and on-page audit for one website. |
| Site comparison by URL | Competitive dashboard for up to three websites. |
| Design and content by URL | In development. |
| Image analysis | In development. |

## Data Boundaries

ToraSEO follows an evidence-first rule:

- Deterministic scan facts come before AI interpretation.
- Large raw payloads should not be copied into final chat answers.
- Text analysis should not echo the full user article back into chat.
- Site comparison should not run or display three full audits side by side.
- Provider prompts should include only the scan facts needed for the report.

## Provider Boundary

`API + AI Chat` sends selected scan evidence to the configured provider model. Provider configuration lives in app settings.

OpenRouter is treated as an international model router. RouterAI is treated as a Russian OpenAI-compatible router. Both use the same general provider model:

- provider key
- base URL
- saved model IDs
- one app-wide default model

RouterAI plugins should be represented as provider options in future UI work, not pasted as large functions into the model ID field.

## Trust And Privacy

- ToraSEO sends requests only to URLs selected by the user.
- Provider calls happen only in `API + AI Chat`.
- MCP tool use is explicit in `MCP + Instructions`.
- API keys should stay masked and should not be displayed back in plain text.
- Crawling behavior must follow [CRAWLING_POLICY.md](../CRAWLING_POLICY.md).

## Repository Surfaces

| Surface | Purpose |
|---|---|
| `app/` | Desktop application. |
| `mcp/` | MCP server and bridge tooling. |
| `claude-bridge-instructions/` | Claude-side instruction package. |
| `toraseo-codex-workflow/` | Codex-side instruction package. |
| `docs/` | GitHub documentation. |
| `branding/` | Logos, mascots, screenshots, and preview assets. |
| `qa/` | Manual test plans and verification notes. |

## Design Direction

The app should feel like a work-focused SEO cockpit, not a marketing landing page. Reports should be compact, visual, and evidence-backed.

For site comparison, the correct shape is:

1. summary
2. compact site cards
3. comparative metrics
4. direction heatmap
5. actionable insights
6. drill-down details

The dashboard should answer three questions quickly: who is stronger, why, and what to do next.
