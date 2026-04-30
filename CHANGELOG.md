# Changelog

All notable changes to ToraSEO are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Pre-1.0 releases use `0.MAJOR.PATCH` numbering — the leading `0` signals
that the public surface is still evolving and breaking changes may occur
between minor versions until the v1.0 milestone.

---

## Release distribution

Starting with App `0.0.8`, the desktop app release is the canonical
public release entry:

- **App tags:** `v0.0.8`, `v0.0.9`, ... `v1.0.0`.
- **Release assets:** desktop installer/updater assets, Claude Bridge
  Instructions ZIP, and Codex Workflow Instructions ZIP attached to
  the same GitHub release.
- **Standalone packaging:** the Claude and Codex instruction packages
  remain buildable through scripts and manual packaging workflows, but
  they no longer create separate public release-note blocks by default.

Legacy note: older releases used separate instruction-package release
entries. Those remain as historical downloads, but new app releases
should present one unified asset list.

---

## [Unreleased]

Current active app release candidate:

- **App 0.0.8 - unified release + Codex bridge reliability.**
- The app release workflow now attaches app assets, Claude Bridge
  Instructions ZIP, and Codex Workflow Instructions ZIP to the same
  GitHub release entry.
- Codex bridge results are rendered from app-side bridge data, not
  trusted from Codex chat text alone.
- `Copy setup prompt` now has persistent in-app guidance for the Codex
  handoff.

Roadmap after v0.0.6:

- **v0.0.7 — NSIS multi-language installer.** Build the installer
  with `multiLanguageInstaller: true` so the setup wizard appears
  in English or Russian based on the user's Windows system locale.
  Persist the installer's choice to a registry value the app reads
  on first launch as the default UI language, before the
  `userData/locale.txt` written from Settings takes precedence.
  Doesn't change the runtime i18n stack from v0.0.6 — just adds a
  pre-app touchpoint so the very first impression matches the
  user's environment.

- **v0.0.8 — Skill runtime handshake.** Token-matching protocol
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

- **v0.0.9 — First `skill-v*` release.** Bootstraps the skill
  release track that v0.0.4's download-ZIP button reads from. Until
  the first `skill-v*` tag exists, the button correctly reports
  "Skill release not found on GitHub" and falls back to opening
  the releases page.

After that, the **skill track v0.2.0** — Mode B content audit
(humanizer, readability, style match, AI-detection score).

---

## [App 0.0.8] - Unreleased

### Added

- Unified app release workflow that attaches the app installer assets,
  Claude Bridge Instructions ZIP, and Codex Workflow Instructions ZIP
  to one `v0.0.8` GitHub release entry.
- Manual packaging workflows for standalone Claude and Codex ZIP
  artifacts without creating separate public releases.
- Persistent Codex copied-prompt helper that stays visible until the
  user dismisses it or real Codex scan data reaches the app.
- Codex workflow guidance for one-time chat/session MCP approvals when
  available.

### Fixed

- Bridge result rendering now consumes `buffer[toolId].data` and turns
  core analyzer `issues[]` into visible `Confirmed facts`.
- Bridge severity summaries now recognize the core `issues[]` contract
  in addition to the older `verdicts[]` name.
- Completed bridge results remain visible after the temporary scan state
  file is cleaned up.

---

## [App 0.0.7] - 2026-04-30

Dual-mode desktop runtime. This release reshapes the app from a
Claude-dependent Bridge workflow into a product with two explicit
execution modes: `MCP + Instructions` and `API + AI Chat`.

### Added - dual-mode workspace

- **Home-screen execution mode selection.** The user now confirms
  `MCP + Instructions` or `API + AI Chat` before choosing the analysis type;
  the selected mode is highlighted and persisted across restarts.
- **Mode-specific setup flows.** `MCP + Instructions` exposes a Claude
  Desktop guided setup and a Codex setup verification path, while
  `API + AI Chat` routes missing providers and models to Settings
  without forcing a home-screen connection check.
- **Standalone native AI chat window.** Native analysis opens the AI
  chat in a separate window instead of embedding it in the main
  workspace.
- **Analysis status hero.** Site analysis now keeps a visible mascot,
  animated progress stripe, and issue counters at the top of the main
  workspace during and after scans.
- **Main analysis workspace.** The main window keeps scan controls and
  structured analysis together, rendering confirmed facts, expert
  hypotheses, priority, expected impact, validation method, and scan
  totals.
- **Second-screen details.** Reports can be opened in a separate
  details window. Returning home leaves open details/chat windows in
  an inactive ended state.
- **Report exports.** The app can export generated audit reports as
  PDF, a standard Markdown document, or a lightweight HTML
  presentation through the same structured report contract.

### Added - native runtime

- **OpenRouter provider adapter.** Replaced the Stage 1 stub with a
  real chat-completions request path, timeout handling, retry logic,
  and stable provider error mapping.
- **Provider configuration.** Added local provider setup with
  encrypted API-key storage through Electron `safeStorage`; raw keys
  do not round-trip back to the renderer.
- **OpenRouter model profiles.** One saved OpenRouter key can now
  power multiple saved model profiles, with a default model selected
  for analysis and follow-up chat.
- **Structured report contract.** Runtime responses must keep
  confirmed facts separate from expert hypotheses and include
  priority, expected impact, and validation guidance.
- **Policy modes.** `strict_audit` forbids hypotheses; `audit_plus_ideas`
  allows hypotheses only when explicitly labeled.

### Changed

- **Native mode no longer depends on Claude Desktop readiness.** The
  legacy dependency gate remains relevant for Bridge Mode, but the
  native API path is intended to work with Claude Desktop fully closed.
- **Bridge mode has no in-app AI chat.** The integrated chat is scoped
  to `API + AI Chat`; `MCP + Instructions` keeps the live conversation in the
  external Claude Desktop workflow.
- **Provider registry precedence.** Environment overrides can win over
  stored provider config, which is useful for local testing and
  emergency recovery.
- **Bridge scan state mapping.** Bridge Mode state is mapped into the
  shared workspace so MCP facts can populate the analysis view without
  removing the Claude Desktop path.
- **Standalone chat stability.** The AI chat window no longer resets
  its own session in a render loop when the analysis report state is
  synchronized.
- **Release workflow Node version.** The app release workflow now uses
  Node.js 22, matching the root `engines.node` requirement.

### Security and trust

- API keys are stored only in the Electron main process using OS-level
  encrypted storage when available.
- Provider errors are normalized before reaching the renderer.
- The UI and report contract keep factual tool output distinct from AI
  interpretation.
- Bridge prompt construction keeps the protocol token out of renderer
  prompt text; the token remains sourced from `SKILL.md`.

### Verification required before tag

- Run the smoke tests in `docs/SMOKE_TESTS.md`.
- Confirm `MCP + Instructions` works end-to-end with Claude Desktop.
- Confirm `API + AI Chat` works end-to-end with a real OpenRouter key.
- Confirm separate chat/details windows, inactive states, and all
  export formats with realistic content.

---

## [App 0.0.6] — Unreleased

Localization runtime + Settings UI. The app now ships English as the
primary UI language with Russian as a runtime-switchable option, and
the new Settings screen exposes the language switcher. All previously
hardcoded UI strings have been extracted into translation bundles.

### Added — i18n runtime

- **i18next + react-i18next stack.** Bundles loaded as static JSON
  resources at startup (no network fetch, no lazy loading). Language
  resolved before React mounts via `await initI18n()` in `main.tsx`,
  so components calling `t()` during their first render get the
  correct strings on the very first paint without flashing keys.
- **Locale persistence in main process.** New module
  `app/electron/locale.ts` stores the user's choice as a single line
  in `userData/locale.txt`. Three IPC handlers exposed through
  `window.toraseo.locale`: `get()`, `set(locale)`, `getOs()`. The
  OS-derived default maps Russian system locale (`ru`, `ru-RU`) to
  Russian; everything else falls back to English.
- **Three-step language resolution.** First check `locale.txt`, then
  `app.getLocale()` from Electron, then hardcoded fallback to
  English. Once the user explicitly saves a language in Settings,
  it sticks across launches regardless of OS changes.

### Added — Settings screen

- **New `mode: "settings"`** in `App.tsx`. Reachable via the
  toolbar's Settings button from any state — including onboarding,
  before dependencies are satisfied. This is intentional: the
  Language tab is exactly where a Russian-speaking user goes to
  switch the UI to a language they can read before troubleshooting
  onboarding hints.
- **Sidebar with tabs.** Currently a single tab — Language settings
  — with a «← Back to home» button on top. Tab list grows naturally
  as future settings categories are added (theme, persistence,
  manual config path, etc.) without redesign.
- **Language tab.** Dropdown with English / Russian, hint paragraph
  explaining that the change applies immediately but OS-level
  dialogs (file picker) keep using the system language. Save button
  enables only when the picked language differs from the current
  one. After save: write to disk first, then call
  `i18n.changeLanguage()` so a crash mid-flight can't leave UI and
  storage out of sync.
- **Unsaved-changes guard.** Trying to leave Settings (toolbar
  Home, sidebar Back-to-home) with an unsaved language pick triggers
  a centered modal: «You have unsaved changes» with two actions —
  «Discard changes and go back» (resets the picker, navigates away)
  and «Stay» (closes modal, keeps user in Settings).

### Added — Translation bundles

- **`app/src/i18n/locales/en.json`** and **`ru.json`.** All UI
  strings touched in v0.0.5 and earlier extracted into hierarchical
  keys (`toolbar.about`, `siteAudit.status.scanning`, `tools.meta.
  label`, etc.). English is the source of truth; missing Russian
  keys fall back to English through i18next's standard
  `fallbackLng` mechanism.
- **Tools config rewired.** `app/src/config/tools.ts` no longer
  hardcodes `label`/`tooltip` strings; instead exports a helper
  `getToolI18nKeyBase(id)` that maps snake_case tool ids
  (`check_robots_txt`) to camelCase i18n key bases (`robots`). The
  MCP server and `core/` functions keep using the original
  snake_case ids — only the UI lookup layer changed.

### Modified

- **8 components rewritten to call `t()`** instead of inline
  Russian strings: `ModeSelection`, `IdleSidebar`, `ActiveSidebar`,
  `SiteAuditView`, `OnboardingView`, `DependencyCheck`,
  `UpdateNotification`, `SleepingMascot`, plus new `TopToolbar` and
  Settings components. Russian-language `console.warn` /
  `window.confirm` / `dialog.title` strings included.
- **`TopToolbar` Check-for-updates copy.** The toast now
  distinguishes four honest states — already-downloaded,
  currently-downloading, server-has-newer, and on-latest — instead
  of comparing `result.version` (which is undefined when no update
  exists) against `currentVersion` and producing
  «Найдено обновление: undefined» when there was nothing to find.
  The downloaded/downloading short-circuit also avoids
  re-querying the server when an update is already on disk waiting
  for an install click.
- **`App.tsx` layout structure.** New top-level branch for
  `mode === "settings"` that's exempt from the onboarding gate.
  `currentLocale` mirrored as React state so language changes
  cascade through the tree on save. `i18n.on("languageChanged")`
  listener keeps state in sync if any future code path bypasses
  the explicit save handler.
- **Mascot illustration on home screen.** `ModeSelection` now uses
  the wordmark-only `tora-logo-wordmark.svg` (no embedded mascot
  face) as its header logo. The previous horizontal logo embedded
  a small mascot identical to the large `SleepingMascot` rendered
  right below it — two of the same character in one frame split
  the user's gaze. The original `tora-logo-horizontal.svg` stays
  untouched for README and contexts where no separate mascot is in
  view.
- **All code comments switched to English.** Per the project's
  English-first audience policy adopted late in v0.0.5, all jsdoc,
  inline, and file-header comments are now English-only. User-
  facing strings remaining in Russian inside JSX have been
  extracted to `locales/ru.json` as part of this release; nothing
  hardcoded in Russian remains in source files outside translation
  bundles.

### Notes

- **NSIS installer language** is unchanged in this release — the
  setup wizard is still single-language. Installer i18n is
  scheduled for v0.0.7 via `multiLanguageInstaller: true`, which
  is independent of the runtime stack and only affects the
  pre-app first-install experience.
- **Two `useUpdater` consumers** — `UpdateNotification` and
  `TopToolbar` both call the hook independently and each holds
  its own state. In practice the race window is too narrow to
  matter (both mount synchronously in `App.tsx` before the first
  updater event fires three seconds after launch), but the right
  long-term fix is to lift updater state into a shared context.
  Tracked as technical debt.

---

## [App 0.0.5] — 2026-04-27

Window chrome polish and silent in-app updates. The app now has a
top toolbar with menu items and a GitHub link, the auto-update card
renders release notes as plain text instead of leaking raw HTML
tags, and applying an update no longer flashes the NSIS installer
over our in-app notification.

### Added — Top toolbar

A 36px-tall horizontal bar above sidebar and main area, white
background with subtle bottom border. Visible in both onboarding
and normal modes — the user can read «О ToraSEO» or open settings
before dependencies are satisfied.

Menu items:

- **«О ToraSEO»** — modal with version (read live from
  `window.toraseo.version`, the same value preload exposes),
  license, author, and a clickable GitHub link.
- **«Проверить обновления»** — calls
  `window.toraseo.updater.check()` on demand. If a newer version
  exists, electron-updater emits `update-available` which the
  existing `useUpdater` hook is already listening for, and the
  bottom-right card appears as usual; the toolbar additionally
  shows a center-top toast («Найдено обновление» / «У вас
  последняя версия») for explicit feedback. Toast auto-dismisses
  after 4 seconds. Spinner on the icon while checking.
- **«Документация»** — opens the README on GitHub
  (`#readme` anchor scrolls past the file tree). There's no
  project website yet, everything lives in the repo, so the toolbar
  links straight there.
- **«FAQ»** — opens `docs/FAQ.md` on GitHub. Created in this release
  as the FAQ companion to README — covers installation, dependency
  troubleshooting, scanning, updates, privacy, and contributing.
- **«Настройки»** — placeholder modal listing what's coming in
  v0.0.6+ (language switcher, persistence of selected tools, dark
  theme, manual config path). No real settings yet.
- **GitHub icon** — opens `https://github.com/Magbusjap/toraseo` in
  the system browser via the existing `setWindowOpenHandler` in
  `main.ts` that delegates http(s) URLs to `shell.openExternal`.

The layout switched from a single horizontal flex row to
`flex-col` with the toolbar on top and the existing sidebar+main
row below. Pre-flight error toast moved from `top-6` to `top-16`
so it doesn't collide with the toolbar.

- **`app/src/components/TopToolbar/TopToolbar.tsx`** — new
  component, fully self-contained including the lightweight Modal
  it uses for About and Settings. No external state — update-check
  result lives in local component state.
- **`app/src/components/TopToolbar/index.ts`** — barrel export.
- **`app/src/App.tsx`** — layout refactor; toolbar mounted in both
  onboarding and normal branches; existing markup wrapped in an
  inner `flex flex-1 overflow-hidden` container.
- **`docs/FAQ.md`** — new file. Six sections covering
  installation, dependencies, scanning behavior, updates, privacy,
  and contributing. Linked from the toolbar «FAQ» button.

### Fixed — Release notes show raw HTML in update card

`UpdateNotification` was rendering the `releaseNotes` string
directly, which meant users saw `<h2>[App 0.0.4]</h2><p>Quality
fixes after the v0.0.3 dogfooding session: a manual fallback<br>
for users...</p>` literally inside the card.

electron-updater delivers GitHub release bodies pre-rendered to
HTML (the source on GitHub is Markdown, but the auto-updater feed
resolves it). We strip tags rather than render them via
`dangerouslySetInnerHTML` — release-note HTML comes from whatever
gets pasted into a GitHub release body, and a 120-char preview
doesn't need formatting anyway. Block tags and `<br>` get replaced
with a space (otherwise headings glue to body: «App 0.0.4Quality
fixes»), then whitespace is collapsed. Common HTML entities are
decoded inline.

- **`app/src/components/UpdateNotification/UpdateNotification.tsx`**
  — added `stripHtml()` helper; updated the "available" branch to
  call `truncate(stripHtml(info.releaseNotes), 120)` instead of
  the raw string.

### Fixed — NSIS installer dialog flashing during in-app update

Clicking «Установить и перезапустить» in the update card
called `quitAndInstall(false, true)` — with the silent flag false,
the NSIS installer UI appeared over our in-app notification and
asked the user to confirm the install path again. Confusing: the
user already clicked install once, why is there another installer
dialog?

Fixed by switching to `quitAndInstall(true, true)`: same NSIS
installer runs non-interactively in the background, the app quits
and relaunches into the new version. The first-time install (a
directly-downloaded `.exe` from GitHub Releases) is unaffected —
that flow doesn't go through electron-updater, so the standard
NSIS dialog appears as before, which is correct for a fresh
install where path choice matters.

- **`app/electron/updater.ts`** — single line change in the
  `installUpdate` IPC handler; comment updated to explain the
  in-app vs first-time-install distinction.

### Modified

- **`app/electron/preload.ts`** — internal `version` constant
  bumped to `0.0.5`.
- **`app/package.json`** — version bump 0.0.4 → 0.0.5.

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

[Unreleased]: https://github.com/Magbusjap/toraseo/compare/v0.0.7...HEAD
[App 0.0.8]: https://github.com/Magbusjap/toraseo/compare/v0.0.7...v0.0.8
[App 0.0.7]: https://github.com/Magbusjap/toraseo/compare/v0.0.5...v0.0.7
[App 0.0.5]: https://github.com/Magbusjap/toraseo/compare/v0.0.4...v0.0.5
[App 0.0.4]: https://github.com/Magbusjap/toraseo/compare/v0.0.3...v0.0.4
[App 0.0.3]: https://github.com/Magbusjap/toraseo/compare/v0.0.2...v0.0.3
[App 0.0.2]: https://github.com/Magbusjap/toraseo/releases/tag/v0.0.2
[0.1.0-alpha]: https://github.com/Magbusjap/toraseo/releases/tag/v0.1.0-alpha
