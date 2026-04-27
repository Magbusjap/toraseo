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

Nothing yet. Roadmap after v0.0.4:

- **v0.0.5 — i18n localization.** English as primary, Russian as
  option. Stack: i18next + react-i18next. Language switcher in
  header or settings. Persist user choice in `userData/locale.txt`.
  All UI strings extracted from components into `locales/en.json`
  and `locales/ru.json`.

- **v0.0.6 — Skill runtime handshake.** Token-matching protocol
  between MCP server and SKILL.md so the app can verify at runtime
  that Skill is actually loaded into Claude's context (not just
  installed-on-disk). MCP exposes `register_session(token)`; the
  same token lives in SKILL.md as a first-call instruction; MCP
  writes a fresh timestamp to `userData/skill-active-session.json`
  on every valid call; the detector treats records < 60 seconds
  old as "runtime verified". This adds a third status tier for the
  Skill row: `not installed` → `installed but unverified` →
  `runtime verified`. Requires coordinated release of three
  artifacts (MCP, Skill, App) with versioned protocol token.

- **v0.0.7 — First `skill-v*` release.** Bootstraps the skill
  release track that v0.0.4's download-ZIP button reads from. Until
  the first `skill-v*` tag exists, the button correctly reports
  "Не найден skill-релиз на GitHub" and falls back to opening the
  releases page.

After that, the **skill track v0.2.0** — Mode B content audit
(humanizer, readability, style match, AI-detection score).

---

## [App 0.0.4] — 2026-04-27

Quality fixes after the v0.0.3 dogfooding session: a manual fallback
for users whose Claude Desktop config sits in a non-standard
location, an icon fix for window/installer chrome, and — most
importantly — a return of Skill detection with hybrid semantics
that closes the silent quality regression v0.0.3 had introduced.

### Added — Skill detection (returned with hybrid semantics)

Skill is back as the third required dependency. The drop in v0.0.3
was reasoned correctly at the technical level (Claude Desktop
skills are server-side, filesystem detection isn't reliable for
those users) but wrong at the product level: without the skill
loaded into Claude's context, MCP tools still return raw JSON, and
Claude interprets it without ToraSEO's CRAWLING_POLICY,
verdict-mapping, or CGS scoring formula. The user gets an answer
that looks like a ToraSEO audit but isn't — a silent quality
regression we cannot accept.

The new check is hybrid:

  - **Filesystem path** — if `~/.claude/skills/toraseo/SKILL.md`
    exists, treat skill as installed. This works for Claude Code
    (CLI) users without any user action.
  - **Manual confirmation** — if the filesystem check fails, look
    for a marker file at `userData/skill-installed.flag`. This
    file is created when the user clicks «Я установил Skill» after
    installing the ZIP through Claude Desktop's Settings → Skills
    → Install ZIP. Honest manual handoff, not pretend automatic
    detection.

The row also exposes:

  - **«Скачать ZIP с GitHub»** — fetches the latest `skill-v*`
    release from GitHub Releases API into the user's Downloads
    folder, then opens the folder with the file selected so the
    user can drag it straight into Claude Desktop.
  - **«Открыть страницу релизов»** — manual fallback if the API
    fetch fails (no internet, GitHub rate-limit, etc.).
  - **Reset link** — next to the «Используется: ручное подтверждение»
    indicator, lets the user undo the manual flag if e.g. they
    uninstall the Skill in Claude. Filesystem-source rows have no
    reset — those files live outside our app.

- **`app/electron/detector.ts`** — returned `checkSkillInstalled()`
  with two-source logic; added IPC handlers `confirmSkillInstalled`,
  `clearSkillConfirmation`, `downloadSkillZip`,
  `openSkillReleasesPage`; added `DetectorStatus.skillInstalled` and
  `skillSource` (“filesystem” | “manual” | null); `allGreen` now
  requires all three checks.
- **`app/src/types/ipc.ts`** — `DownloadSkillZipResult` interface;
  four new methods on `DetectorApi`; `skillInstalled` /
  `skillSource` fields restored on `DetectorStatus`.
- **`app/electron/preload.ts`** — four new bridge methods.
- **`app/src/hooks/useDetector.ts`** — four new exported helpers.
- **`app/src/components/Onboarding/OnboardingView.tsx`** — third
  row restored; three secondary actions (download ZIP, open
  releases page, confirm install); active-source indicator with
  conditional reset link; inline error/info blocks.
- **`app/src/App.tsx`** — wires the new callbacks through to
  OnboardingView.

### Added — Manual MCP config picker

New secondary action under the MCP onboarding row: **«Указать config
вручную»**. Opens the system file dialog. The picked path is
persisted in `userData/manual-mcp-path.txt` and tried first by
the detector before the canonical four-path fallback. The status
bar shows the active manual path with a «сбросить» link to revert
to auto-detection.

This closes a real gap: portable Claude builds, future Microsoft
Store publisher-hash changes, and uncommon installer locations
were all invisible to the v0.0.3 multi-path lookup. The picker is
the escape hatch.

Notably, the user can pick the file *before* installing the MCP
(e.g., immediately after fresh Claude install, when the config
exists but has no toraseo entry yet). The picker treats this as
an informational state, not an error: the file is accepted and
the detector keeps polling until `mcpServers.toraseo` lands in it.

- **`app/electron/detector.ts`** — added `pickMcpConfig`,
  `clearManualMcpConfig`, `getManualMcpConfig` IPC handlers;
  `readManualMcpPath` runs first inside `checkMcpRegistered` before
  the canonical four-path loop; status now includes
  `manualMcpPath: string | null`; manual path persisted in
  `userData/manual-mcp-path.txt` (plain text, single line).
- Same touches in preload.ts, ipc.ts, useDetector.ts, and
  OnboardingView.tsx as for Skill above.

### Fixed — App icon

The v0.0.3 installer produced a window and taskbar icon that fell
back to the default Electron logo. The icon assets at
`app/build/icons/` were on disk but not bundled into the runtime
package, and `BrowserWindow` had no explicit `icon` field, so
Electron had nothing to load.

Fix is platform-aware: Windows prefers `.ico` for native
integrations (taskbar, alt-tab), so the runtime path resolution
selects `icon.ico` on win32 and `icon.png` elsewhere.

Note on dev caveat: in `npm run dev` the taskbar still shows the
default Electron icon because the host process is `electron.exe`
whose own metadata icon takes precedence over `BrowserWindow.icon`
on Windows. Only packaged builds have the right icon end-to-end.

- **`app/electron/main.ts`** — `BrowserWindow({ icon: ... })` with
  `resolveIconPath()` that picks `.ico` on Windows and `.png`
  elsewhere via a path that works in both dev and packaged
  production; documents the dev caveat in code comments.
- **`app/package.json`** — `build.files` includes `build/icons/**`
  so assets end up inside the asar archive at runtime;
  `build.nsis.installerIcon` and `uninstallerIcon` set explicitly
  to `build/icons/icon.ico` so the installer dialog matches.

### Modified

- **`app/electron/main.ts`** — stale Skill-related comment in
  `setupDetector` invocation removed; new comment about the
  hybrid model.
- **`app/electron/preload.ts`** — internal `version` constant
  bumped to `0.0.4`.
- **`app/package.json`** — version bump 0.0.3 → 0.0.4.

---

## [App 0.0.3] — 2026-04-26

Hard-dependency detector and onboarding screen. The app now requires
two components before scanning is unlocked: Claude Desktop running,
and ToraSEO MCP registered in `claude_desktop_config.json`.
Without both the main UI is replaced with an onboarding screen.
When both become green, the UI returns to normal automatically.

### Added — Detector

- **`app/electron/detector.ts`** — two checks running in parallel:
  - Claude Desktop process scan via `ps-list@8` (case-insensitive
    match on basename `claude` / `claude.exe`)
  - `mcpServers.toraseo` lookup with **multi-path support** — four
    known Windows config locations are checked in order, MCP is
    considered registered if `toraseo` exists in any of them. This
    handles users with Microsoft Store Claude Desktop (sandbox-
    redirected to `%LOCALAPPDATA%\Packages\Claude_pzs8sxrjxfjjc\`),
    standalone installer (`%APPDATA%\Claude\`), and two legacy
    preview-build locations.
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

- **`OnboardingView`** — calm two-row checklist with single
  primary action ("Открыть Claude Desktop"). The MCP row shows
  hint text but no action button — automatic MCP install via the
  smart NSIS installer is Phase 3. A footer note points users to
  Claude Desktop's own Settings → Skills → Install ZIP for the
  Skill installation step.
- **`DependencyCheck`** — one row component with satisfied/missing
  visual states; green check vs orange X.
- **Replaced sidebar during onboarding** — the full sidebar is
  swapped for a calm "locked" panel with centered text "Завершите
  проверку справа". An earlier translucent overlay approach
  was abandoned because IdleSidebar text bled through.
- **Pre-flight error toast** — when a scan click fails the
  `checkNow()` gate, a top-center toast explains the reason and
  the app routes to the onboarding view automatically.

### Removed — Skill detection

The pre-release plan included a third dependency check on
`~/.claude/skills/toraseo/SKILL.md`. This was dropped after
dogfooding revealed that Skills in Claude Desktop are **server-side**
and bound to the user's Anthropic account, not file-based. The
filesystem path `~/.claude/skills/` is used by Claude Code (CLI)
only. Microsoft Store Claude Desktop maintains a runtime cache at
`%LOCALAPPDATA%\Packages\Claude_pzs8sxrjxfjjc\LocalCache\Roaming\
Claude\local-agent-mode-sessions\skills-plugin\<session-uuid>\
<skill-uuid>\skills\` — but that path uses session-scoped UUIDs,
is recreated on every session, and isn't a stable install marker.

Detecting Skill installation from disk for a Claude Desktop user is
therefore fundamentally not possible. Honest detection of two
components is preferred over a checkmark that lies. Skill
installation moves to onboarding documentation: users install via
Claude Desktop's own Settings → Skills → Install ZIP, and the app
points them there. Phase 2 instructions overlay (slated for v0.0.4)
will embed step-by-step screenshots and a download link.

### Modified

- **`app/electron/main.ts`** — calls `setupDetector(getMainWindow)`
  and `setupLauncher()` after `app.whenReady()`.
- **`app/electron/preload.ts`** — bridge surface extended with
  `detector` and `launcher` namespaces; channel constants
  mirrored from main process.
- **`app/src/types/ipc.ts`** — `DetectorStatus` (two booleans),
  `DetectorApi`, `LauncherApi`, `OpenClaudeResult` added; `ToraseoApi`
  extended.
- **`app/src/App.tsx`** — `isOnboarding` gate before the normal
  layout; pre-flight `checkNow()` inside `handleStartScan`.
- **`app/package.json`** — bump 0.0.2 → 0.0.3; `ps-list@8.1.1`
  added to dependencies.

### Deferred to Phase 2–5

This release covers the backend and core onboarding flow.
Following slices fill out the rest:

- **Phase 2** — click-through instructions overlay for each row
  ("Как установить?"), with screenshots and copy-paste paths.
  Includes Skill onboarding step pointing to Settings → Skills
  → Install ZIP with a direct download link.
- **Phase 3** — *smart* automatic MCP installation: the NSIS
  installer detects whether Claude Desktop is installed from
  Microsoft Store (via `Get-AppxPackage`) or as a standalone .exe,
  then writes `mcpServers.toraseo` into the appropriate config
  path. Merges with existing entries instead of overwriting.
  Critically prevents creating orphan config files (which is what
  our naive in-session PowerShell script did during dogfooding).
- **Phase 4** — evaluate whether app needs to manage Skill at all,
  given that Skill is server-side. Possibly the bridge-mode design
  obviates app-managed Skill entirely; revisit after Phase 2.
- **Phase 5** — polish: localization (EN/RU), transition
  animations, dark mode, DevTools diagnostics (which config files
  were found, which one provided the toraseo entry).

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

[Unreleased]: https://github.com/Magbusjap/toraseo/compare/v0.0.4...HEAD
[App 0.0.4]: https://github.com/Magbusjap/toraseo/compare/v0.0.3...v0.0.4
[App 0.0.3]: https://github.com/Magbusjap/toraseo/compare/v0.0.2...v0.0.3
[App 0.0.2]: https://github.com/Magbusjap/toraseo/releases/tag/v0.0.2
[0.1.0-alpha]: https://github.com/Magbusjap/toraseo/releases/tag/v0.1.0-alpha
