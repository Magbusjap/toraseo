# ToraSEO — Architecture

**Version:** 0.2.0-draft
**License:** Apache 2.0
**Status:** Pre-MVP, design phase

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

- **Claude Skill** — instructions and knowledge layer
- **MCP server** — execution and data layer
- **Tauri visual application** — presentation layer

This architecture enables three modes of operation:

- **Skill alone:** text-only experience in Claude Desktop
- **MCP alone:** technical scans without AI commentary
- **Full stack:** richest experience with AI + visual dashboard

---

## 2. Three-Component System

For a visual overview, see [`architecture-diagram.svg`](architecture-diagram.svg).

```
┌─────────────────────────────────────────────────────────────────┐
│                         User's Computer                          │
│                                                                  │
│  ┌──────────────────┐         ┌──────────────────────────────┐ │
│  │  Claude Desktop  │◄────────┤  ToraSEO Skill (SKILL.md)    │ │
│  │                  │  reads  │  — instructions, checklists  │ │
│  │     (the brain)  │         │  — humanizer patterns        │ │
│  └────────┬─────────┘         │  — multi-engine rules        │ │
│           │                   └──────────────────────────────┘ │
│           │ uses tools                                          │
│           ▼                                                     │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              ToraSEO MCP Server                           │  │
│  │                  (the hands)                              │  │
│  │                                                           │  │
│  │  Tools (stdio for Claude):                                │  │
│  │  - scan_site(url)                                         │  │
│  │  - check_robots_txt(url)                                  │  │
│  │  - analyze_meta(url)                                      │  │
│  │  - check_yandex_index(url)                                │  │
│  │  - humanize_text(text)                                    │  │
│  │  - app_set_url(url)                                       │  │
│  │  - app_set_status(status, payload)                        │  │
│  │  - app_get_state()                                        │  │
│  │                                                           │  │
│  │  WebSocket server (for App):                              │  │
│  │  - subscribe(channel)                                     │  │
│  │  - push_status(stage, data)                               │  │
│  │  - get_state()                                            │  │
│  └─────────────────────────────────┬─────────────────────────┘  │
│                                    │                            │
│                                    │ pushes status              │
│                                    ▼                            │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │           ToraSEO App (Tauri, ~5-10 MB)                    │ │
│  │              (the eyes)                                    │ │
│  │                                                            │ │
│  │  Native window with React+Tailwind dashboard:              │ │
│  │  - Status indicators (colored dots + mascot)               │ │
│  │  - Progress bars                                           │ │
│  │  - Cards per analysis stage                                │ │
│  │  - Detailed reports                                        │ │
│  │  - Minimal inputs (URL, text, checkboxes)                  │ │
│  └────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────┘
                              │
                              │ ethical crawling (polite mode)
                              ▼
              ┌────────────────────────────────────┐
              │       External APIs / Web          │
              │  - User's website (verified)       │
              │  - Google PageSpeed API            │
              │  - Yandex Webmaster API            │
              │  - Bing Webmaster API              │
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
- Can update App via MCP tools (`app_set_url`, `app_set_status`)

### MCP Server (the hands)
- Performs all actual work: HTTP requests, parsing, analysis
- Maintains two interfaces:
  - **stdio (for Claude):** standard MCP protocol with tool definitions
  - **WebSocket (for App):** pushes status updates in real time
- Returns to Claude only summarized data (≤100 tokens per result)
- Handles authentication with external APIs
- Holds shared state between Claude and App

### Tauri App (the eyes)
- Renders visual dashboard
- Displays statuses, progress, charts, recommendations
- Has minimal inputs (URL, text, options)
- Does NOT perform any analysis — only displays results
- Subscribed to MCP via WebSocket for real-time updates
- Can trigger MCP-only operations (e.g., scan without involving Claude)

---

## 4. Architectural Principles

### Principle 1: Skill works without MCP, MCP works without App

This is critical for flexibility:
- **Skill alone:** user can work in chat with Claude using only the skill, without launching the app
- **MCP alone:** the app can trigger MCP scans without Claude involvement (technical analysis only)
- **Full stack:** Skill + MCP + App working together for richest experience

### Principle 2: Token efficiency is non-negotiable

**Critical rule:** Claude must never see raw HTML or large payloads.

```
❌ Bad:  MCP returns 50 KB HTML → Claude parses → 12k tokens consumed
✅ Good: MCP parses → returns {status: "OK", issues: 3} → 50 tokens
```

This allows hundreds of pages to be analyzed within a single Pro-tier session. Detailed data goes to App via WebSocket, bypassing Claude entirely.

### Principle 3: MCP is shared memory between Claude and App

Claude and App **never communicate directly**. They communicate through MCP:

```
Claude  ←→  MCP Server  ←→  App
        tools         WebSocket
```

MCP holds shared state. When user fills URL in App, MCP saves it. When Claude asks `app_get_state()`, MCP returns the URL.

---

## 5. User Interface Design

The Tauri application provides a visual dashboard for analysis status and results. This section describes the high-level UI concept. Implementation details and design decisions are maintained internally.

### Status-Driven UI

The application has six main status states. Each state corresponds to a mascot pose for instant visual recognition. The full mascot system is documented in [`branding/`](../branding/).

### Two Operation Modes

The app supports two analysis modes:

- **Site Analysis** — triggered by URL input. Performs technical SEO audit including robots.txt, sitemap, meta-tags, speed, schema, content quality, and AI-citability checks.
- **Content Analysis** — triggered by text input. Performs content quality checks including AI-detection, readability, semantics, headings, and keyword analysis.

### Three Main Screens

- **Welcome** — entry point, mode selection (URL vs text)
- **Site Analysis** — progress and results for site audit
- **Content Analysis** — score and results for text quality

All screens include a sidebar with settings, history, current project, and connection status indicators.

### Connection-Aware Design

The UI must clearly communicate which Claude chat session the app is bound to. A connection indicator is always visible, showing the active session and any diagnostic information.

### Three Interaction Patterns

The UI supports three usage patterns:

1. **Claude-driven** — user speaks to Claude, app reflects state changes automatically
2. **App-driven** — user fills app manually, optionally invokes Claude for recommendations
3. **Hybrid** — mixed manual input and chat commands, with automatic synchronization through MCP

Detailed UI specifications, mockups, design tokens, and rationale are maintained in the design phase. This document focuses on architectural concepts that contributors and integrators need to understand.

---

## 6. Communication Patterns

### Key Constraint

Claude does not have direct access to chat windows. MCP "lives inside" each chat where it's enabled — it's bound to that specific chat session.

This has implications:
- One MCP server runs, but each chat gets its own "instance"
- State does NOT sync between chats
- App must show which chat it's bound to
- For initial release: support only one active session at a time

### Pattern 1: Claude initiates analysis

```
1. User in chat: "Analyze example.com for Google and Yandex"
2. Claude reads SKILL.md, understands intent
3. Claude calls MCP: app_set_url("example.com")
4. App receives WebSocket update → URL field fills automatically
5. Claude calls MCP: app_set_engines(["google", "yandex"])
6. App: checkboxes for Google and Yandex check
7. Claude calls MCP: app_start_scan()
8. App: mascot changes to "focused", progress starts
9. MCP performs HTTP requests in parallel
10. MCP pushes stages to App as they complete
11. MCP returns summary to Claude: { score: 78, issues: 1 }
12. Claude tells user in chat: "Done. Score 78. Details in app"
```

### Pattern 2: User works only in app

```
1. User opens app, fills URL: "example.com"
2. User selects engines: Google + Yandex
3. User clicks "Scan"
4. App via MCP: saves URL and engines to shared memory
5. App shows hint: "Tell Claude any message to start"
6. User writes in chat: "go"
7. Claude receives "go", checks MCP: app_get_state()
8. MCP returns: { url: "example.com", engines: [...], ready: true }
9. Claude understands and runs scan
10. Continues like Pattern 1
```

### Pattern 3: Hybrid (most common)

```
1. User in app: enters URL
2. User in chat: "Check Google and Yandex, no Bing"
3. Claude sees command but no URL — checks MCP: app_get_state()
4. MCP returns: { url: "example.com" }
5. Claude has all info — runs scan with specified engines
6. Continues like Pattern 1
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
├── .gitignore
├── package.json
│
├── skill/                          # User adds this to Claude Customize → Skills
│   ├── SKILL.md
│   ├── checklists/
│   │   ├── google-seo.md
│   │   ├── yandex-seo.md
│   │   ├── bing-seo.md
│   │   └── ai-search-geo.md
│   ├── humanizer/
│   │   ├── ru-patterns.json
│   │   ├── en-patterns.json
│   │   └── strategies.md
│   └── templates/
│       ├── audit-report.md
│       └── recommendation-format.md
│
├── mcp/                            # User registers in claude_desktop_config.json
│   ├── README.md
│   ├── package.json
│   ├── server.js
│   ├── src/
│   │   ├── tools/
│   │   ├── crawlers/
│   │   ├── analyzers/
│   │   ├── humanizer/
│   │   ├── api/
│   │   ├── state/
│   │   └── websocket/
│   └── tests/
│
├── app/                            # Tauri application
│   ├── README.md
│   ├── src-tauri/
│   │   ├── tauri.conf.json
│   │   ├── Cargo.toml
│   │   ├── icons/
│   │   └── src/main.rs
│   ├── src/
│   │   ├── App.jsx
│   │   ├── components/
│   │   ├── hooks/
│   │   ├── styles/
│   │   └── ws/
│   └── dist/
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
│   ├── INSTALLATION.md
│   ├── TROUBLESHOOTING.md
│   ├── CRAWLING_ETHICS.md
│   └── examples/
│
└── scripts/                        # Installation & build helpers
    ├── install.sh
    ├── install.bat
    ├── update-config.js
    └── build-app.sh
```

---

## 8. Installation & Distribution

### Installer vs Application — Different Things

This is a common confusion that needs clarity:

#### The Installer (`install.bat` / `install.sh`)
- Run **once** during setup
- Registers MCP in `claude_desktop_config.json`
- Suggests user to add Skill folder via Customize → Skills
- Verifies dependencies (Node.js 20+, Rust for Tauri build)
- Builds Tauri app for current OS
- No longer needed after setup

#### The Application (`ToraSEO.exe` / `.app` / etc.)
- Run **every time** user wants to use ToraSEO
- Native window with dashboard
- Connects to MCP via WebSocket
- Displays statuses and results
- Does no analysis — only shows

### Application Startup Flow (Runtime Checks)

When user launches `ToraSEO.exe`:

```
1. App starts, opens window
2. App attempts WebSocket connection to MCP
3. If fails → shows: "MCP server not running. Open Claude Desktop"
4. If connects → asks MCP for Skill status
5. If Skill not active → shows: "Activate ToraSEO Skill in Customize"
6. If all OK → shows main screen (Welcome)
```

This is a runtime check, not an installation check. Each app launch verifies the environment is ready.

### Three-Way Independence

The system is designed so each component can work without others:

- **Skill alone:** user works in chat with Claude, no app needed
- **MCP alone:** app triggers technical scans without Claude
- **Full stack:** richest experience with AI + visual dashboard

### Future: DXT Package

When Anthropic stabilizes the DXT format, package everything into a single `.dxt` file for true one-click installation. This is a future enhancement.

---

## 9. Ethical Crawling Policy

### Core Principles

1. **Respect robots.txt** — always
2. **Honest User-Agent:** `ToraSEO/X.Y.Z (+https://github.com/Magbusjap/toraseo)`
3. **Rate limiting:** 1 request per 2-3 seconds by default
4. **Page limit:** max 50 pages per analysis
5. **Three-tier scanning:**
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

_This document is part of the public ToraSEO documentation. For installation instructions, see [INSTALLATION.md](INSTALLATION.md)._
