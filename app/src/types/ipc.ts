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
 */
export interface DetectorStatus {
  /** Claude Desktop process is currently running. */
  claudeRunning: boolean;
  /** mcpServers.toraseo present in claude_desktop_config.json. */
  mcpRegistered: boolean;
  /** ~/.claude/skills/toraseo/SKILL.md exists. */
  skillInstalled: boolean;
  /** All three above are true. UI uses this to enable scanning. */
  allGreen: boolean;
  /** ISO-8601 timestamp; for staleness checks if needed. */
  checkedAt: string;
}

/**
 * Detector surface inside `window.toraseo.detector`.
 *
 * Polling runs in main process every 5 seconds and pushes through
 * onStatusUpdate. checkNow() is the synchronous pre-flight used
 * by App.tsx right before starting a scan, to close the race window
 * between the last poll tick and the user click.
 */
export interface DetectorApi {
  /** Subscribe to status updates pushed every 5 seconds. */
  onStatusUpdate(listener: (status: DetectorStatus) => void): () => void;
  /** Force a fresh check, bypassing the polling cache. */
  checkNow(): Promise<DetectorStatus>;
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
}
