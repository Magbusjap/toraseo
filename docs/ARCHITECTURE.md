# ToraSEO — Architecture

**Version:** 0.1.0-alpha
**License:** Apache 2.0
**Status:** App 0.0.8 release candidate: dual-mode desktop runtime
(`MCP + Instructions` and `API + AI Chat`) with Codex bridge reliability
and unified release assets under hardening.

This document describes the technical architecture of ToraSEO. It is intended for users, contributors, and anyone integrating with the project.

---

## Table of Contents

1. [Overview](#1-overview)
2. [Three-Component System](#2-three-component-system)
3. [Component Responsibilities](#3-component-responsibilities)
4. [Architectural Principles](#4-architectural-principles)
5. [User Interface Design](#5-user-interface-design)
6. [Communication Patterns](#6-communication-patterns)
7. [Repository Structure](#7-repository-structure)
8. [Installation & Distribution](#8-installation--distribution)
9. [Ethical Crawling Policy](#9-ethical-crawling-policy)
10. [Branding](#10-branding)

---

## 1. Overview

ToraSEO is an open-source SEO toolkit built as a hybrid of:

- **Claude Bridge Instructions** — instructions and knowledge layer
- **MCP server** — execution and data layer
- **Visual application** (Electron + React desktop app) — presentation and native AI runtime layer

This architecture enables three modes of operation:

- **Claude instructions alone:** text-only experience in Claude Desktop
- **MCP alone:** technical scans without AI commentary
- **Full stack:** richest experience with AI + visual dashboard

Today the **Claude instructions + MCP** line remains supported, and the desktop app
is being prepared for App 0.0.8 as a dual-mode release. Historical
sections below still describe earlier milestones; the current release
rules are tracked in the private System Design.

---

## 2. Three-Component System

For a visual overview, see [`architecture-diagram.svg`](architecture-diagram.svg).

```
┌─────────────────────────────────────────────────────────────────┐
│                         User's Computer                         │
│                                                                 │
│  ┌──────────────────┐         ┌──────────────────────────────┐  │
│  │  Claude Desktop  │◄────────┤  Claude Bridge Instructions  │  │
│  │                  │  reads  │  — instructions, checklists  │  │
│  │     (the brain)  │         │  — humanizer patterns (v0.2) │  │
│  └────────┬─────────┘         │  — multi-engine rules        │  │
│           │                   └──────────────────────────────┘  │
│           │ uses tools                                          │
│           ▼                                                     │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │             ToraSEO MCP Server                           │   │
│  │                  (the hands)                             │   │
│  │                                                          │   │
│  │  Mode A — Site Audit (v0.1.0-alpha):                     │   │
│  │  - scan_site_minimal(url)                                │   │
│  │  - check_robots_txt(url)                                 │   │
│  │  - analyze_meta(url)                                     │   │
│  │  - analyze_headings(url)                                 │   │
│  │  - analyze_sitemap(url)                                  │   │
│  │  - check_redirects(url)                                  │   │
│  │  - analyze_content(url)                                  │   │
│  │                                                          │   │
│  │  Mode B — Content Audit (v0.2 planned):                  │   │
│  │  - humanize_text(text, lang)                             │   │
│  │  - analyze_naturalness(text)                             │   │
│  │  - check_style_match(text, target_style)                 │   │
│  │  - check_readability(text)                               │   │
│  │                                                          │   │
│  │  WebSocket server (for App, future):                     │   │
│  │  - subscribe(channel)                                    │   │
│  │  - push_status(stage, data)                              │   │
│  │  - get_state()                                           │   │
│  └────────────────────────────────┬─────────────────────────┘   │
│                                   │                             │
│                                   │ pushes status (future)      │
│                                   ▼                             │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │     ToraSEO App (Electron desktop, App 0.0.8)              │ │
│  │              (the eyes)                                    │ │
│  │                                                            │ │
│  │  Native window with React+Tailwind dashboard:              │ │
│  │  - Status indicators (colored dots + mascot)               │ │
│  │  - Progress bars                                           │ │
│  │  - Cards per analysis stage                                │ │
│  │  - Detailed reports                                        │ │
│  │  - Minimal inputs (URL, text, checkboxes)                  │ │
│  └────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ ethical crawling (polite mode)
                              ▼
              ┌────────────────────────────────────┐
              │       External APIs / Web          │
              │  - User's website (verified)       │
              │  - Google PageSpeed API (future)   │
              │  - Yandex Webmaster API (future)   │
              │  - Bing Webmaster API (future)     │
              └────────────────────────────────────┘
```

---

## 3. Component Responsibilities

### Claude (the brain)
- Reads `SKILL.md` instructions
- Conducts dialogue with user (asking questions, clarifying)
- Decides which MCP tools to call and in what order
- Generates final recommendations and explanations
- Does NOT process raw data — sees only summaries to save tokens
- Will be able to update App via MCP tools when the App ships

### MCP Server (the hands)
- Performs all actual work: HTTP requests, parsing, analysis
- Today exposes a single interface:
  - **stdio (for Claude):** standard MCP protocol with tool definitions
- Will additionally expose, when the App is built:
  - **WebSocket (for App):** pushes status updates in real time
- Returns to Claude only summarized data (≤ a few hundred tokens per result)
- Handles authentication with external APIs (when used)
- Will hold shared state between Claude and App once App ships

### Visual App (the eyes)
- Renders the desktop dashboard
- Displays statuses, progress, metrics, reports, and recommendations
- Has minimal inputs (URL, tool selection, provider settings)
- Supports `MCP + Instructions` and `API + AI Chat` execution paths
- Keeps provider secrets in the Electron main process
- Can trigger technical scans without involving Claude in native mode

The app stack is Electron + React + TypeScript. Earlier Tauri notes are
historical context and are no longer the implementation direction.

---

## 4. Architectural Principles

### Principle 1: Claude Instructions work without MCP, MCP works without App

This is critical for flexibility:
- **Claude instructions alone:** user can work in chat with Claude using only the Claude package, without launching an app
- **MCP alone:** the app (when it ships) can trigger MCP scans without Claude involvement (technical analysis only)
- **Full stack:** Claude instructions + MCP + App working together for richest experience

### Principle 2: Token efficiency is non-negotiable

**Critical rule:** Claude must never see raw HTML or large payloads.

```
❌ Bad:  MCP returns 50 KB HTML → Claude parses → 12k tokens consumed
✅ Good: MCP parses → returns {status: "OK", issues: 3} → 50 tokens
```

This allows hundreds of pages to be analyzed within a single Pro-tier session. Detailed data will go to App via WebSocket, bypassing Claude entirely.

### Principle 3: MCP is shared memory between Claude and App

Once the App ships, Claude and App **never communicate directly**. They communicate through MCP:

```
Claude  ←→  MCP Server  ←→  App
        tools         WebSocket
```

MCP holds shared state. When user fills URL in App, MCP saves it. When Claude asks `app_get_state()`, MCP returns the URL.

In v0.1.0-alpha this principle still informs the design even though only Claude is connected — the MCP keeps state available for future App attachment without redesign.

---

## 5. User Interface Design

When the visual app ships, it will provide a dashboard for analysis status and results. This section describes the high-level UI concept. Implementation details and design decisions are maintained internally.

### Status-Driven UI

The application will have six main status states. Each state corresponds to a mascot pose for instant visual recognition. The full mascot system is documented in [`branding/`](../branding/).

### Two Operation Modes

The app will support two analysis modes:

- **Site Analysis (Mode A)** — triggered by URL input. Runs the seven Mode A MCP tools and presents the output structurally.
- **Content Analysis (Mode B, v0.2)** — triggered by text input. Runs the Mode B MCP tools (humanizer, readability, style, AI-detection).

### Three Main Screens

- **Welcome** — entry point, mode selection (URL vs text)
- **Site Analysis** — progress and results for site audit
- **Content Analysis** — score and results for text quality

All screens will include a sidebar with settings, history, current project, and connection status indicators.

### Connection-Aware Design

The UI must clearly communicate which Claude chat session the app is bound to. A connection indicator must always be visible, showing the active session and any diagnostic information.

### Three Interaction Patterns

The UI will support three usage patterns:

1. **Claude-driven** — user speaks to Claude, app reflects state changes automatically
2. **App-driven** — user fills app manually, optionally invokes Claude for recommendations
3. **Hybrid** — mixed manual input and chat commands, with automatic synchronization through MCP

Detailed UI specifications, mockups, and design tokens are maintained internally during the design phase. This document focuses on architectural concepts that contributors and integrators need to understand.

---

## 6. Communication Patterns

### Key Constraint

Claude does not have direct access to chat windows. MCP "lives inside" each chat where it's enabled — it's bound to that specific chat session.

This has implications:
- One MCP server runs, but each chat gets its own "instance"
- State does NOT sync between chats
- App must show which chat it's bound to
- For initial release: support only one active session at a time

### Pattern 1: Claude-driven audit (today, Claude instructions + MCP)

This is the only interaction pattern available in v0.1.0-alpha:

```
1. User in chat: "Run an SEO audit on example.com"
2. Claude reads SKILL.md, understands intent
3. Claude calls scan_site_minimal("example.com") to verify reachability
4. Claude calls the six analyzer tools (analyze_meta, analyze_headings,
   analyze_sitemap, check_redirects, analyze_content, check_robots_txt)
   in any order — they are independent
5. Each tool returns severity-tagged findings (≤ a few hundred tokens)
6. Claude aggregates findings against checklists/google-basics.md
7. Claude produces a structured report following templates/audit-report.md
8. User reads the report in chat
```

### Pattern 2: App-driven (future, when App ships)

When the visual App is added, MCP will gain shared-state tools so
Claude and App can coordinate without talking directly. The exact
tool names are not yet finalized — they will be designed alongside
the App rather than committed in advance and changed later. The
pattern will look roughly like:

```
1. User opens App, fills URL, clicks "Scan"
2. App writes URL to MCP shared state
3. App prompts user: "Tell Claude any message to start"
4. User writes "go" in chat
5. Claude reads MCP shared state, sees URL, runs the same seven tools
   as Pattern 1
6. As tools complete, MCP pushes stage updates to App over WebSocket
7. App renders progress, results, mascot states in real time
8. Claude returns a text summary to chat; App holds the detailed view
```

### Pattern 3: Hybrid (future, when App ships)

```
1. User in App: enters URL
2. User in chat: "Run a full audit"
3. Claude reads MCP shared state, sees URL already filled
4. Claude runs the same seven tools as Pattern 1
5. Continues like Pattern 2 from step 6
```

### What MCP Cannot Do

- ❌ Open new chats in Claude Desktop programmatically
- ❌ Switch between chats
- ❌ Send messages from user's name in chat
- ❌ Detect which chat is active without Claude telling it

---

## 7. Repository Structure

```
toraseo/
├── README.md                       # Main documentation
├── LICENSE                         # Apache 2.0
├── CHANGELOG.md                    # Semantic versioning history
├── CONTRIBUTING.md                 # How to contribute
├── SECURITY.md                     # Security policy
├── CRAWLING_POLICY.md              # Ethical crawling commitment
├── .github/
│   └── workflows/
│       ├── release-app.yml         # Publishes app + instruction ZIP assets
│       ├── release-skill.yml       # Manual Claude ZIP package artifact
│       └── release-codex-workflow.yml # Manual Codex ZIP package artifact
├── .gitignore
├── package.json
│
├── claude-bridge-instructions/     # Claude Bridge Instructions release package
│   ├── README.md                   # User-facing install instructions
│   ├── SKILL.md                    # Main entry point read by Claude
│   ├── checklists/
│   │   └── google-basics.md        # Google Search Essentials (16 items)
│   └── templates/
│       └── audit-report.md         # Structural template + examples
│   # Future: checklists/yandex-seo.md, bing-seo.md, ai-search-geo.md
│   # Future: humanizer/ for Mode B (AI-detection patterns, style rules)
│
├── toraseo-codex-workflow/         # Codex Workflow Instructions package
│   ├── README.md                   # User-facing package notes
│   ├── SKILL.md                    # Short Codex entry point
│   ├── agents/openai.yaml          # Codex UI metadata
│   └── references/                 # Load on demand, not every task
│
├── mcp/                            # User registers in claude_desktop_config.json
│   ├── README.md
│   ├── package.json
│   ├── tsconfig.json
│   ├── src/
│   │   ├── index.ts                # MCP server entry point
│   │   ├── types.ts                # Shared type contracts
│   │   ├── analyzers/
│   │   │   ├── site/               # Mode A analyzers (7)
│   │   │   └── content/            # Mode B analyzers (v0.2)
│   │   ├── crawlers/               # robots.txt, rate limiter
│   │   ├── tools/
│   │   │   ├── site/               # MCP tool wrappers (Mode A)
│   │   │   └── content/            # MCP tool wrappers (Mode B, v0.2)
│   │   ├── humanizer/              # Future, v0.2
│   │   ├── api/                    # Future, external API integrations
│   │   ├── state/                  # Future, MCP shared state
│   │   └── websocket/              # Future, App connection
│   └── tests/                      # Future, Vitest suite
│
├── app/                            # Electron desktop app
│
├── branding/                       # All visual assets
│   ├── mascots/
│   ├── logos/
│   ├── favicons/
│   ├── compositions/
│   ├── palettes/
│   └── BRAND_BOOK.md
│
├── docs/                           # User-facing documentation
│   ├── ARCHITECTURE.md             # This document
│   └── examples/
│   # Future: INSTALLATION.md, TROUBLESHOOTING.md
│
└── scripts/                        # Build helpers
    ├── build-skill.sh              # Build Claude ZIP locally (bash/Git Bash)
    ├── build-skill.ps1             # Same script for Windows PowerShell
    ├── build-codex-workflow.sh     # Build Codex ZIP locally
    └── build-codex-workflow.ps1    # Same script for Windows PowerShell
    # Future: install.sh, install.bat for one-command setup
```

---

## 8. Installation & Distribution

### Current release distribution

Starting with App 0.0.8, users download one app release entry from
GitHub Releases. That release contains:

- the desktop app installer/updater assets
- `toraseo-claude-bridge-instructions-vX.Y.Z.zip`
- `toraseo-codex-workflow-vX.Y.Z.zip`

The instruction ZIPs remain independently buildable for QA and support,
but public release assets are grouped under the app tag.

### Claude instructions + MCP

#### The MCP Server
- Clone the repo, run `npm install` in `mcp/`, register the binary path in `claude_desktop_config.json`
- Detailed steps in `mcp/README.md`

#### The Claude package
- Download `toraseo-claude-bridge-instructions-vX.Y.Z.zip` from the GitHub Releases page
- Upload to Claude Desktop via **Customize → Skills**
- Detailed steps in `claude-bridge-instructions/README.md`

To verify the ZIP locally before tagging, maintainers can run
`./scripts/build-skill.sh <version>` (bash) or
`.\scripts\build-skill.ps1 <version>` (PowerShell on Windows).

#### The Codex package

- Download `toraseo-codex-workflow-vX.Y.Z.zip` from the same app release
  entry.
- Install it into the Codex local skills directory.
- Detailed steps live in `toraseo-codex-workflow/README.md`.

### Future: One-command installer

Once the visual App is built, an installer script will:
- Run **once** during setup
- Register MCP in `claude_desktop_config.json`
- Suggest user to add the Claude package via Customize → Skills
- Verify dependencies (Node.js 22+, plus build tools for the App)
- Build the App for the current OS

### Future: DXT Package

When Anthropic stabilizes the DXT format, package everything into a single `.dxt` file for true one-click installation.

### Three-Way Independence

The system is designed so each component can work without others:

- **Claude instructions alone:** user works in chat with Claude, no app needed (today)
- **MCP alone:** app triggers technical scans without Claude (future)
- **Full stack:** richest experience with AI + visual dashboard (future)

---

## 9. Ethical Crawling Policy

### Core Principles

1. **Respect robots.txt** — always
2. **Honest User-Agent:** `ToraSEO/X.Y.Z (+https://github.com/Magbusjap/toraseo)`
3. **Rate limiting:** 1 request per 2-3 seconds by default
4. **Page limit:** max 50 pages per analysis
5. **Three-tier scanning** (planned):
   - **Tier 1 (Owner mode):** verified-owner sites — aggressive scanning OK
   - **Tier 2 (Polite mode):** public/competitor sites — minimal, respectful
   - **Tier 3 (API-only mode):** sites with strong protection — only public APIs

### What We Don't Do

- ❌ No stealth crawling
- ❌ No proxy rotation
- ❌ No User-Agent spoofing as Googlebot
- ❌ No CAPTCHA bypassing
- ❌ No session hijacking
- ❌ No PII scraping

### Why This Matters

Ethical crawling is a feature, not a limitation. It means:
- Corporate users can trust the tool in their environment
- No legal risks for users
- Long-term reliability (no IP bans)
- Open data lineage and reproducibility

The full policy is at [`../CRAWLING_POLICY.md`](../CRAWLING_POLICY.md).

---

## 10. Branding

### Identity

- **Project name:** ToraSEO
- **Mascot name:** Tora-chan (虎ちゃん)
- **Kanji:** 虎 (tiger)
- **Tagline (EN):** SEE THE TOP. RANK THE TOP.

### Color Palette

| Role | HEX |
|---|---|
| Primary | `#FF6B35` |
| Outline | `#1A0F08` |
| White | `#FFFFFF` |
| Accent | `#FFB800` |
| UI status | `#4ECDC4` |
| Ear inner | `#FFB8A0` |

### Mascot States

Six emotional states cover all UI scenarios:

| Pose | Use case |
|---|---|
| Neutral | Main logo, idle when ready |
| Happy | Success notifications |
| Focused | Active analysis state |
| Surprised | Issue/error states |
| Sleeping | Idle/standby state |
| Champion | Major achievement |

For full brand guidelines, see [`branding/BRAND_BOOK.md`](../branding/BRAND_BOOK.md).

---

_This document is part of the public ToraSEO documentation. For Claude Bridge Instructions installation steps, see [`claude-bridge-instructions/README.md`](../claude-bridge-instructions/README.md). For Codex Workflow Instructions, see [`toraseo-codex-workflow/README.md`](../toraseo-codex-workflow/README.md). For the MCP server installation, see [`mcp/README.md`](../mcp/README.md)._
