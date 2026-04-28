/**
 * IPC contract between Electron main process and React renderer.
 *
 * These types are shared between:
 * - `electron/main.ts` (sender of stage updates)
 * - `electron/tools.ts` (producer of stage results)
 * - `electron/updater.ts` (auto-update events and IPC)
 * - `electron/preload.ts` (bridge surface)
 * - `src/hooks/useScan.ts` (consumer in renderer)
 * - `src/hooks/useUpdater.ts` (consumer in renderer)
 * - `src/components/...` (UI rendering)
 *
 * Renderer cannot import from `electron/` because of the sandbox
 * boundary. Main can import from `src/types/` (it's just TypeScript
 * source). So we keep the contract here and use relative imports from
 * `../src/types/ipc.js` in main-side files at compile time.
 */

import type { ToolId } from "../config/tools";

/**
 * Verdict classification for a single tool result.
 *
 * Mapping rules (applied in `electron/tools.ts`):
 * - "critical" if any verdict has severity "critical"
 * - "warning"  if any verdict has severity "warning" (and none critical)
 * - "ok"       if there are no critical/warning verdicts
 * - "error"    if the tool threw — network failure, robots disallow,
 *              parse error, etc.
 *
 * `scan_site_minimal` does not produce verdicts; it maps to "ok"
 * unless it threw.
 */
export type StageStatus =
  | "pending"   // not started yet
  | "running"   // tool is currently executing
  | "ok"        // finished, no issues
  | "warning"   // finished, has warnings
  | "critical"  // finished, has critical issues
  | "error";    // threw — see `errorCode` / `errorMessage`

/**
 * One progress event emitted while a scan is running.
 *
 * `result` is the raw return value of the corresponding core tool
 * (typed loosely as `unknown` here — the renderer treats it as an
 * opaque payload for now; later iterations will render details per
 * stage by narrowing on `toolId`).
 */
export interface StageUpdate {
  scanId: string;
  toolId: ToolId;
  status: StageStatus;
  /** Set when status is "ok" / "warning" / "critical". */
  result?: unknown;
  /** Set when status is "error". */
  errorCode?: string;
  /** Set when status is "error". */
  errorMessage?: string;
  /** Counts of verdicts by severity (only when result is present). */
  summary?: {
    critical: number;
    warning: number;
    info: number;
  };
}

/**
 * Final aggregate sent once every selected tool has finished
 * (successfully, with verdicts, or with an error).
 */
export interface ScanComplete {
  scanId: string;
  /** Wall-clock duration of the scan in milliseconds. */
  durationMs: number;
  /** Aggregate counts across all stages. */
  totals: {
    critical: number;
    warning: number;
    info: number;
    errors: number;
  };
}

/**
 * Arguments accepted by `window.toraseo.startScan(...)`.
 */
export interface StartScanArgs {
  url: string;
  toolIds: ToolId[];
}

// =====================================================================
// Auto-updater contract
// =====================================================================

/**
 * Information about a release available on GitHub Releases.
 * Mirrored from electron-updater's UpdateInfo with only the fields
 * the renderer actually needs.
 */
export interface UpdateInfo {
  version: string;
  releaseNotes?: string;
  releaseDate?: string;
}

/**
 * Progress event during update download.
 */
export interface DownloadProgress {
  percent: number;
  bytesPerSecond: number;
  total: number;
  transferred: number;
}

/**
 * Result of `updater.check()`.
 *
 * `version` is the latest version on the server (may equal current
 * if no update). `currentVersion` is read from package.json at runtime
 * via app.getVersion().
 */
export interface CheckUpdateResult {
  ok: boolean;
  version?: string;
  currentVersion?: string;
  error?: string;
}

/** Updater surface inside `window.toraseo.updater`.
 *
 * Three actions (check / download / install) are gated on user clicks
 * by design — autoDownload and autoInstallOnAppQuit are both disabled
 * in `electron/updater.ts`.
 *
 * Five events tell the renderer what's happening; each subscriber
 * returns an unsubscribe function for cleanup.
 */
export interface UpdaterApi {
  check(): Promise<CheckUpdateResult>;
  download(): Promise<{ ok: boolean; error?: string }>;
  install(): Promise<{ ok: boolean }>;

  onUpdateAvailable(listener: (info: UpdateInfo) => void): () => void;
  onUpdateNotAvailable(listener: (info: { version: string }) => void): () => void;
  onDownloadProgress(listener: (progress: DownloadProgress) => void): () => void;
  onUpdateDownloaded(listener: (info: UpdateInfo) => void): () => void;
  onUpdateError(listener: (err: { message: string }) => void): () => void;
}

// =====================================================================
// Hard-dependency detector contract
// =====================================================================

/**
 * Aggregated status of the three hard dependencies.
 *
 * `allGreen` is the only field the UI needs to gate the scan button;
 * the individual booleans drive the per-row checkboxes in the
 * onboarding screen.
 *
 * Skill detection is hybrid — see detector.ts header for rationale.
 * Filesystem path is checked first (Claude Code path), and if the
 * file isn't there we fall back to a manual confirmation marker
 * created when the user clicks «I installed Skill» in the onboarding
 * UI (Claude Desktop path — server-side skills aren't filesystem-
 * detectable).
 */
export interface DetectorStatus {
  /** Claude Desktop process is currently running. */
  claudeRunning: boolean;
  /** mcpServers.toraseo present in claude_desktop_config.json. */
  mcpRegistered: boolean;
  /** Skill is confirmed installed via filesystem OR manual flag. */
  skillInstalled: boolean;
  /**
   * Which path produced a positive Skill verdict, for UI copy:
   * - "filesystem" — found at ~/.claude/skills/toraseo/SKILL.md
   * - "manual" — user clicked "I installed Skill"
   * - null — not satisfied
   */
  skillSource: "filesystem" | "manual" | null;
  /** All three above are true. UI uses this to enable scanning. */
  allGreen: boolean;
  /** ISO-8601 timestamp; for staleness checks if needed. */
  checkedAt: string;
  /**
   * Path the user picked manually via the file dialog, if any.
   * Null means MCP detection is using only the canonical four-path
   * fallback. UI shows this so the user can confirm what's in use
   * and revert to auto if needed.
   */
  manualMcpPath: string | null;
}

/**
 * Result of asking the user to pick a config file via the system
 * dialog. `ok=true` means the file was picked AND parses as JSON;
 * `hasToraseo` then says whether the toraseo MCP entry is in there
 * (it might not be — the user may pick the file before installing
 * the MCP, which is a valid flow).
 */
export interface PickMcpConfigResult {
  ok: boolean;
  path?: string;
  hasToraseo?: boolean;
  reason?: "cancelled" | "read-error" | "parse-error";
  errorMessage?: string;
}

/**
 * Result of fetching the latest skill ZIP from GitHub Releases.
 * On success the file is in user's Downloads folder and the
 * Downloads folder is opened with the file selected, ready to be
 * dragged into Claude Desktop's Settings → Skills.
 */
export interface DownloadSkillZipResult {
  ok: boolean;
  filePath?: string;
  releaseTag?: string;
  error?: string;
}

/**
 * Detector surface inside `window.toraseo.detector`.
 *
 * Polling runs in main process every 5 seconds and pushes through
 * onStatusUpdate. checkNow() is the synchronous pre-flight used
 * by App.tsx right before starting a scan, to close the race window
 * between the last poll tick and the user click.
 *
 * Manual MCP path methods (pickMcpConfig / clearManualMcpConfig /
 * getManualMcpConfig) manage the user-chosen fallback config path —
 * used when the canonical four-path lookup doesn't find Claude's
 * config (custom install, portable build, future Store hash change).
 *
 * Skill methods cover the hybrid detect-or-confirm flow:
 *   - downloadSkillZip(): fetch latest skill-v* release ZIP into
 *     user's Downloads and open the folder with file selected
 *   - openSkillReleasesPage(): fallback that opens the GitHub
 *     releases page filtered to skill-v* tags
 *   - confirmSkillInstalled(): write the manual marker so the
 *     skill row turns green
 *   - clearSkillConfirmation(): undo confirmation; row goes red
 *     unless the filesystem path also exists
 */
export interface DetectorApi {
  /** Subscribe to status updates pushed every 5 seconds. */
  onStatusUpdate(listener: (status: DetectorStatus) => void): () => void;
  /** Force a fresh check, bypassing the polling cache. */
  checkNow(): Promise<DetectorStatus>;
  /** Open a file picker to choose claude_desktop_config.json manually. */
  pickMcpConfig(): Promise<PickMcpConfigResult>;
  /** Forget the manual MCP choice; revert to canonical-only lookup. */
  clearManualMcpConfig(): Promise<{ ok: boolean }>;
  /** Read the currently-persisted manual MCP path. */
  getManualMcpConfig(): Promise<{ path: string | null }>;
  /** Download the latest skill ZIP from GitHub Releases. */
  downloadSkillZip(): Promise<DownloadSkillZipResult>;
  /** Open the GitHub Releases page filtered to skill-v* tags. */
  openSkillReleasesPage(): Promise<{ ok: boolean }>;
  /** Mark Skill as installed (Claude Desktop manual flow). */
  confirmSkillInstalled(): Promise<{ ok: boolean }>;
  /** Undo the manual confirmation. */
  clearSkillConfirmation(): Promise<{ ok: boolean }>;
}

// =====================================================================
// Launcher contract
// =====================================================================

export interface OpenClaudeResult {
  ok: boolean;
  /** Which path was used (for debugging in DevTools). */
  launchedFrom?: string;
  /** Set when ok = false. */
  error?: string;
}

/**
 * Launcher surface inside `window.toraseo.launcher`.
 *
 * Currently only opens Claude Desktop. Future additions could include
 * opening the MCP config file in the user's editor, opening the Skill
 * folder, etc.
 */
export interface LauncherApi {
  openClaude(): Promise<OpenClaudeResult>;
}

// =====================================================================
// Locale persistence
// =====================================================================

/**
 * Supported UI locales. Adding a third locale is a coordinated
 * change: extend this union, add a JSON file under
 * `app/src/i18n/locales/`, register the resource in
 * `app/src/i18n/index.ts`, and update `mapOsLocaleToSupported()`
 * in `app/electron/locale.ts`.
 */
export type SupportedLocale = "en" | "ru";

/**
 * Locale surface inside `window.toraseo.locale`.
 *
 * `get()` returns the user's persisted choice (null if none).
 * `set(locale)` writes the choice; UI typically reloads i18next
 * on success.
 * `getOs()` returns the OS-derived default — used by the renderer
 * the first time the app runs to seed i18next without storing
 * anything yet.
 */
export interface LocaleApi {
  get(): Promise<SupportedLocale | null>;
  set(locale: SupportedLocale): Promise<{ ok: boolean }>;
  getOs(): Promise<SupportedLocale>;
}

// =====================================================================
// Bridge Mode — v0.0.7+
// =====================================================================

/**
 * Lifecycle stage of an active Bridge Mode scan.
 *
 * Transitions:
 *   awaiting_handshake → in_progress (verify_skill_loaded ok)
 *   awaiting_handshake → error      (verify_skill_loaded mismatch / timeout)
 *   in_progress        → complete   (all selected tools finished)
 *   in_progress        → error      (no_tool_response / global timeout)
 *   any                → cancelled  (user cancelled)
 */
export type BridgeScanStatus =
  | "awaiting_handshake"
  | "in_progress"
  | "complete"
  | "cancelled"
  | "error";

/**
 * Status of the Skill protocol handshake.
 *
 * "pending"  — file created, waiting for verify_skill_loaded()
 * "verified" — token matched, scan can proceed
 * "mismatch" — token didn't match (Skill outdated)
 * "timeout"  — no verify_skill_loaded call within HANDSHAKE_TIMEOUT_MS
 */
export type HandshakeStatus =
  | "pending"
  | "verified"
  | "mismatch"
  | "timeout";

/**
 * Per-tool entry in the scan buffer. Tools NOT in the buffer
 * map are still pending — Claude hasn't called them yet.
 *
 * - status "running":   MCP tool started, hasn't finished
 * - status "complete":  data + verdict + summary populated
 * - status "error":     errorCode + errorMessage populated
 */
export interface ToolBufferEntry {
  status: "running" | "complete" | "error";
  startedAt: string;
  completedAt: string | null;
  /** Severity verdict (only when status="complete"). */
  verdict?: "ok" | "warning" | "critical";
  /** Raw tool output (only when status="complete"). Schema differs per tool. */
  data?: unknown;
  /** Issue counts (only when status="complete"). */
  summary?: {
    critical: number;
    warning: number;
    info: number;
  };
  /** Set when status="error". */
  errorCode?: string;
  /** Set when status="error". */
  errorMessage?: string;
}

/**
 * Skill handshake details inside CurrentScanState.
 *
 * `expectedToken` is the protocol token the App+MCP both reference
 * (constant compiled into MCP, exposed via IPC for the App to
 * cross-check). `receivedToken` is what the MCP got from Claude
 * via verify_skill_loaded() — null until that call lands.
 */
export interface BridgeHandshake {
  expectedToken: string;
  receivedToken: string | null;
  status: HandshakeStatus;
  verifiedAt: string | null;
}

/**
 * Top-level error that aborted the scan, distinct from per-tool
 * errors which live in `buffer[toolId].errorCode/errorMessage`.
 *
 * Codes used in v0.0.7:
 *   handshake_timeout      — verify_skill_loaded never called within 10s
 *   handshake_mismatch     — token didn't match (Skill outdated)
 *   no_tool_response       — handshake passed but no tool started in 30s
 *   global_timeout         — 5min total elapsed, abort remaining tools
 */
export interface BridgeScanError {
  code: string;
  message: string;
}

/**
 * Full state-file content. App reads this via polling, MCP writes
 * to it as Claude calls tools.
 *
 * Lives at: path.join(app.getPath("userData"), "current-scan.json")
 *
 * Single active scan in flight at a time. Starting a new scan
 * overwrites the previous file (after cancel confirmation in UI).
 *
 * Schema versioning: bump `schemaVersion` on breaking changes.
 * MCP and App both check the version on read — mismatch is fatal
 * (signals coordinated-release went wrong).
 */
export interface CurrentScanState {
  schemaVersion: 1;
  scanId: string;
  status: BridgeScanStatus;
  url: string;
  createdAt: string;
  finishedAt: string | null;
  selectedTools: ToolId[];
  handshake: BridgeHandshake;
  buffer: Partial<Record<ToolId, ToolBufferEntry>>;
  error: BridgeScanError | null;
}

/**
 * Result of `bridge.startScan(...)`. Renderer needs the prompt
 * (already copied to clipboard but returned for fallback) and
 * the scanId for diagnostic display.
 */
export interface StartBridgeScanResult {
  scanId: string;
  prompt: string;
  expectedToken: string;
}

/**
 * Bridge Mode surface inside `window.toraseo.bridge`.
 *
 * v0.0.7 introduces this as the new way to run scans. The legacy
 * top-level `startScan()` / `onStageUpdate()` / `onScanComplete()`
 * stay in place during v0.0.7 development for fallback testing
 * but are removed in the final v0.0.7 commit (Commit 4) once UI
 * is fully migrated to useBridgeScan.
 *
 * Lifecycle:
 *   1. UI calls bridge.startScan(url, toolIds)
 *   2. Main process creates current-scan.json with status=
 *      awaiting_handshake, copies the localized prompt to
 *      clipboard, starts the handshake timeout timer
 *   3. Main process emits state changes via onStateUpdate as
 *      MCP tools write to the file (polled at ~500ms)
 *   4. UI calls cancelScan() at any time to abort — file removed,
 *      timers cleared
 *   5. UI calls retryHandshake() after a handshake_timeout error
 *      — same scanId, fresh timer, file status reset to
 *      awaiting_handshake (preserving any partial buffer entries
 *      from a previous run is unnecessary; retry is a clean slate)
 */
export interface BridgeApi {
  /**
   * Create a new scan-state file, copy the localized prompt to
   * the clipboard, return diagnostic info to the caller.
   */
  startScan(url: string, toolIds: ToolId[]): Promise<StartBridgeScanResult>;

  /**
   * Subscribe to state-file changes. Listener called immediately
   * with the current state (or null if no scan is active), then on
   * every change detected by the polling watcher. Returns
   * unsubscribe.
   */
  onStateUpdate(listener: (state: CurrentScanState | null) => void): () => void;

  /** Read the current scan state synchronously. Null if no scan. */
  getCurrentState(): Promise<CurrentScanState | null>;

  /** Abort the active scan and remove the state-file. */
  cancelScan(): Promise<{ ok: boolean }>;

  /**
   * Re-arm the handshake after a handshake_timeout / handshake_
   * mismatch error. Same scanId; status flips back to
   * awaiting_handshake; clipboard is re-populated with the prompt;
   * timer restarts.
   */
  retryHandshake(): Promise<{ ok: boolean; error?: string }>;
}

// =====================================================================
// Public API on window.toraseo
// =====================================================================

/**
 * Public surface exposed on `window.toraseo` by the preload script.
 *
 * Renderer code is the only consumer. Keep this minimal — every
 * method here widens the attack surface from a sandboxed renderer
 * back into Node.js privileges.
 */
export interface ToraseoApi {
  /** Static, set in preload. Useful for sanity-checking preload loaded. */
  version: string;

  /**
   * Kick off a scan. Resolves with the new scanId immediately;
   * progress arrives over `onStageUpdate` / `onScanComplete`.
   */
  startScan(args: StartScanArgs): Promise<{ scanId: string }>;

  /**
   * Subscribe to per-stage updates.
   * Returns an unsubscribe function — call it on unmount.
   */
  onStageUpdate(listener: (update: StageUpdate) => void): () => void;

  /**
   * Subscribe to the scan-complete signal.
   * Returns an unsubscribe function.
   */
  onScanComplete(listener: (summary: ScanComplete) => void): () => void;

  /** Auto-updater API. See UpdaterApi. */
  updater: UpdaterApi;

  /** Hard-dependency detector API. See DetectorApi. */
  detector: DetectorApi;

  /** Claude Desktop launcher API. See LauncherApi. */
  launcher: LauncherApi;

  /** UI locale persistence + OS detection. See LocaleApi. */
  locale: LocaleApi;

  /** Bridge Mode (v0.0.7+) scan orchestration. See BridgeApi. */
  bridge: BridgeApi;

  /**
   * Native Runtime (v0.0.7 redesign) — orchestrator + providers
   * + policy. See `src/types/runtime.ts` for the contract.
   *
   * Always present, but disabled by default (feature flag).
   * Renderer must call `runtime.isEnabled()` before exposing
   * the new layout.
   */
  runtime: import("./runtime").RuntimeApi;
}
