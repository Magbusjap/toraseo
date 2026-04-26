# Changelog

All notable changes to ToraSEO are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Pre-1.0 releases use `0.MAJOR.PATCH` numbering — the leading `0` signals
that the public surface is still evolving and breaking changes may occur
between minor versions until the v1.0 milestone.

---

## Two release tracks

ToraSEO ships in two independently-versioned tracks:

- **App** — the Electron desktop application. Tags: `v0.0.2`,
  `v0.0.3`, ... `v1.0.0`. Built and published by
  `.github/workflows/release-app.yml` via electron-builder.
- **Skill** — the Claude Skill ZIP (and its companion MCP server).
  Tags: `skill-v0.2.0`, `skill-v0.3.0`, ... `skill-v1.0.0`. Built
  and published by `.github/workflows/release-skill.yml`.

Both tracks live in the same repo and share the `core/` library, but
they ship to users separately and evolve at different rates. App
development usually moves faster (UI, UX, packaging, auto-update);
Skill stays stable until a new analysis mode or significant accuracy
improvement justifies a bump.

Legacy note: the very first release `v0.1.0-alpha` (skill+MCP) was
published before this naming convention was introduced. It stays as-is
for users who already downloaded that ZIP; future skill releases use
the `skill-v*` namespace.

---

## [Unreleased]

Nothing yet. The next slice of work is **app v0.0.4** — Phase 2 of
hard-dependency support: instructions overlay (per-row click →
step-by-step setup), automatic MCP installation (NSIS installer
writes the config), and the start of an app-as-Skill-package-manager
flow (auto-update Skill via GitHub). After that, the **skill track
v0.2.0** — Mode B content audit (humanizer, readability, style match,
AI-detection score).

---

## [App 0.0.3] — 2026-04-26

Hard-dependency detector and onboarding screen. The app now requires
three components before scanning is unlocked: Claude Desktop running,
ToraSEO MCP registered in `claude_desktop_config.json`, and ToraSEO
Skill installed on disk at `~/.claude/skills/toraseo/SKILL.md`.
Without all three the main UI is replaced with an onboarding screen.
When all three become green, the UI returns to normal automatically.

### Added — Detector

- **`app/electron/detector.ts`** — three checks running in parallel:
  - Claude Desktop process scan via `ps-list@8` (case-insensitive
    match on basename `claude` / `claude.exe`)
  - `mcpServers.toraseo` lookup in `claude_desktop_config.json`
    (platform-specific path)
  - `fs.access` on `~/.claude/skills/toraseo/SKILL.md`
- **Polling** every 5 seconds (compromise between UX reactivity and
  CPU load), with an immediate first tick so the UI doesn't sit on
  default-false values for the first 5 seconds.
- **`checkNow()`** synchronous IPC handler. Used by the renderer
  immediately before starting a scan to close the race window
  between the last polling tick and the user click.

### Added — Launcher

- **`app/electron/launcher.ts`** — cross-platform Claude Desktop
  launcher with three strategies (in order):
  - Windows: spawn `Claude.exe` from known paths
    (`%LOCALAPPDATA%\Programs\claude\`, `Program Files\Claude\`,
    etc.) with `detached: true` and `unref()` so Claude survives
    ToraSEO closing
  - macOS: `shell.openPath()` on the `.app` bundle
  - Linux: spawn the binary from known bin paths
  - Fallback: `shell.openExternal("claude://")` — the protocol
    handler registered by Anthropic's official installer opens
    Claude regardless of disk path

### Added — Onboarding UI

- **`OnboardingView`** — calm three-row checklist with single
  primary action ("Открыть Claude Desktop"). MCP and Skill rows
  show hint text but no action button — those installations are
  manual for now (automatic MCP install is Phase 3, app-managed
  Skill is Phase 4).
- **`DependencyCheck`** — one row component with satisfied/missing
  visual states; green check vs orange X.
- **Sidebar overlay** during onboarding: dimmed white scrim with
  hint "Завершите проверку справа". Sidebar still visible to
  preserve layout consistency.
- **Pre-flight error toast** — when a scan click fails the
  `checkNow()` gate, a top-center toast explains the reason and
  the app routes to the onboarding view automatically.

### Modified

- **`app/electron/main.ts`** — calls `setupDetector(getMainWindow)`
  and `setupLauncher()` after `app.whenReady()`.
- **`app/electron/preload.ts`** — bridge surface extended with
  `detector` and `launcher` namespaces; channel constants
  mirrored from main process.
- **`app/src/types/ipc.ts`** — `DetectorStatus`, `DetectorApi`,
  `LauncherApi`, `OpenClaudeResult` added; `ToraseoApi` extended.
- **`app/src/App.tsx`** — `isOnboarding` gate before the normal
  layout; pre-flight `checkNow()` inside `handleStartScan`.
- **`app/package.json`** — bump 0.0.2 → 0.0.3; `ps-list@8.1.1`
  added to dependencies.

### Deferred to Phase 2–5

This release covers the backend and core onboarding flow.
Following slices fill out the rest:

- **Phase 2** — click-through instructions overlay for each row
  ("Как установить?"), with screenshots and copy-paste paths.
- **Phase 3** — automatic MCP installation: the NSIS installer
  writes `mcpServers.toraseo` into `claude_desktop_config.json`
  on first run, merging with existing entries instead of
  overwriting.
- **Phase 4** — app as Skill package manager. App reads version
  from SKILL.md frontmatter, polls GitHub for the latest skill
  release, and offers an in-app "Update Skill" action. This
  fills the gap left by Claude Desktop having no native
  update mechanism for file-based skills.
- **Phase 5** — polish: localization (EN/RU), transition
  animations, dark mode.

---

## [App 0.0.2] — 2026-04-26

First app release with auto-update infrastructure. Distribution
continues through GitHub Releases as before, but installed copies of
ToraSEO 0.0.2+ now check for updates automatically and offer download
+ install through an in-app notification.

### Added — Auto-update infrastructure

- **`electron-updater` integration** in `app/electron/updater.ts`.
  Initial check runs 3 seconds after app ready (avoids blocking
  startup). Logs to `electron-log` (default platform path — e.g.
  `%APPDATA%\toraseo\logs\main.log` on Windows).
- **In-app notification** in the bottom-right corner of the window.
  Renders only when there's an update event in flight — stays
  invisible during normal operation. Component:
  `app/src/components/UpdateNotification/UpdateNotification.tsx`.
- **State machine** in `app/src/hooks/useUpdater.ts`:
  `idle` → `available` → `downloading` → `downloaded`, plus an
  `error` branch with dismiss-only behavior.
- **IPC contract** for updater actions and events in
  `app/src/types/ipc.ts` (UpdaterApi, UpdateInfo, DownloadProgress,
  CheckUpdateResult).
- **Bridge surface** in `app/electron/preload.ts` exposes the
  updater under `window.toraseo.updater`. The renderer never gets
  direct ipcRenderer access — only the typed methods.
- **CI/CD workflow** `.github/workflows/release-app.yml`. Triggered
  by clean version tags (`v*`, excluding `skill-v*`). Runs `npm ci`,
  builds the `@toraseo/core` workspace, then
  `electron-builder --publish always` which uploads installer +
  `latest.yml` manifest to GitHub Releases.

### Behavior — user consent at every step

- `autoDownload: false` — user must explicitly click «Скачать»
- `autoInstallOnAppQuit: false` — user must explicitly click
  «Установить и перезапустить»
- Notification can't be dismissed while a download is in progress
  (avoids orphaned partial downloads)
- During development (`app.isPackaged === false`) the updater
  silently skips checks — documented behavior of electron-updater,
  not a bug

### Compatibility

- **Node.js:** 20+ (Electron 33 ships Node 20.x)
- **OS tested:** Windows 11 (NSIS installer 0.0.1 → 0.0.2 verified)
- **First update path:** users on 0.0.1 must install 0.0.2 manually
  (0.0.1 has no updater UI). From 0.0.2 onwards, all updates flow
  through the in-app notification.

### Known limitations

- **No code signing.** Windows SmartScreen will warn on first
  install. Users must click "More info" → "Run anyway". Code
  signing is deferred to post-v0.6 (alpha audience tolerates this;
  it costs ~$99/year Apple Dev + ~$300+/year Windows EV cert).
- **No delta updates yet.** Each update downloads the full installer
  (~180 MB). electron-builder can produce delta updates via
  blockmaps but tuning that for our payload comes after the basic
  flow is verified in production.
- **Only Windows builds in CI right now.** macOS and Linux targets
  are wired in `package.json` but the GitHub Actions matrix
  currently builds only `windows-latest`. Other platforms unblock
  when those audiences become real.

---

## [0.1.0-alpha] — 2026-04-26

The first installable release. Mode A (Site Audit) is complete with
seven working tools and a Claude Skill that orchestrates them into a
structured audit report.

### Added — MCP server

Seven Mode A site-audit tools, each returning severity-tagged
findings (`critical` / `warning` / `info`):

- **`scan_site_minimal`** — fast reachability check; returns title,
  h1, meta description, response time, and HTTP status
- **`check_robots_txt`** — whether ToraSEO is allowed to crawl the
  URL, plus crawl-delay extraction; results cached per session
- **`analyze_meta`** — title, description, Open Graph, Twitter Card,
  canonical, charset, viewport, html lang; produces issue codes
  including `noindex_present`, `no_title`, `title_too_short`,
  `og_missing`, `og_incomplete`, `canonical_relative`, `no_viewport`
- **`analyze_headings`** — h1..h6 walk in DOM order, level-skip
  detection, h1 length sanity, empty-heading detection
- **`analyze_sitemap`** — discovery via robots.txt then
  `/sitemap.xml` fallback, `<urlset>` and `<sitemapindex>` parsing,
  20-entry sample, host-mismatch detection, oversize detection
- **`check_redirects`** — manual chain walk (HEAD-then-GET fallback),
  loop detection (10-hop cap), HTTPS→HTTP downgrade detection,
  relative Location flag
- **`analyze_content`** — semantic-cascade extraction
  (article→main→body), word/sentence/paragraph counts,
  text-to-code ratio (Yoast-aligned 300/600 thresholds),
  link inventory, image alt coverage

### Added — Skill

- **`SKILL.md`** as the main entry point with name/description
  frontmatter, 10 sections covering activation rules, the
  seven-tool workflow, structured selectors via `ask_user_input_v0`,
  token-budget rules, Mode B deferral, and i18n plan
- **`checklists/google-basics.md`** mapping 19 on-page SEO signals
  from Google Search Essentials to specific issue codes from each
  analyzer
- **`templates/audit-report.md`** structural template with three
  worked examples (clean / blocking / many-findings) and
  tone-calibration rules

### Added — Crawling etiquette

- robots.txt is honored on every fetch (in-process cache, one
  request per host per session)
- Per-host rate limiter (default 2 seconds; honors longer
  `Crawl-delay` from robots.txt)
- Honest User-Agent: `ToraSEO/X.Y.Z (+https://github.com/Magbusjap/toraseo)`
- Body-size cap (10 MB HTML, 60 MB XML for sitemaps)
- Per-request timeout (15 s for HTML, 30 s for sitemaps, 10 s for
  redirect steps)
- 10-hop cap on redirect chains
- Full policy in [`CRAWLING_POLICY.md`](CRAWLING_POLICY.md)

### Added — Distribution

- **GitHub Action** (`.github/workflows/release-skill.yml`) builds
  and attaches `toraseo-skill-vX.Y.Z.zip` to every `v*` git tag,
  with frontmatter validation as a sanity check
- **Local build script** (`scripts/build-skill.sh`) reproduces the
  CI build for testing before pushing a tag
- `.gitignore` rules so generated skill ZIPs don't get committed

### Added — Documentation

- Architecture document (`docs/ARCHITECTURE.md`) covering the
  three-component design, communication patterns, and ethical
  crawling policy
- Skill installation README (`skill/README.md`) with steps for
  Claude Desktop, Claude.ai, and Claude Code
- This CHANGELOG

### Verified end-to-end

The full skill-plus-MCP pipeline was tested against
[bozheslav.ru](https://bozheslav.ru), a real Laravel + Filament
production site. All seven tools ran without errors, the skill
produced a clean structured report on the first attempt, and
findings were real and actionable (missing meta description, short
title, missing Open Graph tags, H1 noise characters, missing
canonical). No prompt re-engineering was required.

### Known limitations

These are **deliberately out of scope for v0.1.0-alpha**, not bugs:

- **No Mode B** — content audit, AI-humanizer, readability, style
  matching all arrive in v0.2
- **No multi-page crawling** — one URL per tool call by design;
  site-wide scans need an explicit orchestrator that's not yet
  built
- **No JavaScript rendering** — static HTML only, no headless
  browser. Pages that render content client-side will surface as
  `text_to_code_ratio_very_low` or `no_main_content`
- **No Yandex / Bing / AI-search specific checklists** — Google
  Search Essentials is the baseline. Per-engine checklists arrive
  based on user feedback
- **No Schema.org / JSON-LD analyzer** — deferred; Open Graph and
  Twitter Cards already cover the practical sharing case
- **No Core Web Vitals / PageSpeed** — use Google PageSpeed Insights
- **No backlinks / keyword research / rank tracking** — out of
  scope; these require paid third-party APIs
- **No visual dashboard** — architecture supports it, UI itself is
  a later milestone

### Compatibility

- **Node.js:** 22+ (uses native `fetch`, `AbortController`,
  ES2022 features)
- **Claude clients tested:** Claude Desktop, Claude Code
- **OS tested:** Windows, Linux. macOS expected to work but
  not verified

[Unreleased]: https://github.com/Magbusjap/toraseo/compare/v0.1.0-alpha...HEAD
[0.1.0-alpha]: https://github.com/Magbusjap/toraseo/releases/tag/v0.1.0-alpha
