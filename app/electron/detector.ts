/**
 * Hard-dependency detector for ToraSEO companion-app architecture.
 *
 * The app requires three components to be present before scanning is
 * unlocked. See `wiki/toraseo/hard-dependency-pivot.md` for the
 * design rationale.
 *
 *   1. Claude Desktop is currently running (a process named "Claude"
 *      / "claude.exe" exists on the system).
 *   2. claude_desktop_config.json contains an `mcpServers.toraseo`
 *      entry — meaning ToraSEO MCP is registered.
 *   3. ~/.claude/skills/toraseo/SKILL.md exists on disk — meaning
 *      the Claude Skill is installed (file-based variant; MCPB-format
 *      skills aren't detectable via filesystem and are out of scope
 *      for the alpha).
 *
 * Two access patterns:
 *
 *   - Polling (started in main on app ready). Every POLL_INTERVAL_MS
 *     re-checks all three and emits a status update event to renderer.
 *     This drives the live checkboxes in the onboarding screen.
 *
 *   - On-demand `checkNow()` — bypasses the polling cache and runs all
 *     three checks synchronously. Used by the renderer immediately
 *     before kicking off a scan, to close the race window between the
 *     last poll tick and the user click.
 */

import { app, BrowserWindow, ipcMain } from "electron";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import psList from "ps-list";
import log from "electron-log";

// 5 seconds is the compromise from hard-dependency-pivot Q3:
// fast enough that "Claude closed" → UI reflects it within 5s
// (perceived as "instant"), light enough that pslist polling
// stays under 1% CPU on average.
const POLL_INTERVAL_MS = 5000;

export const DETECTOR_CHANNELS = {
  // renderer → main
  checkNow: "toraseo:detector:check-now",
  // main → renderer (push)
  statusUpdate: "toraseo:detector:status-update",
} as const;

export interface DetectorStatus {
  /** Claude Desktop process running anywhere on the system. */
  claudeRunning: boolean;
  /** mcpServers.toraseo present in claude_desktop_config.json. */
  mcpRegistered: boolean;
  /** ~/.claude/skills/toraseo/SKILL.md exists. */
  skillInstalled: boolean;
  /** Convenience: all three are true. UI uses this to gate scanning. */
  allGreen: boolean;
  /** When this status was computed (ISO-8601, for staleness checks). */
  checkedAt: string;
}

// =====================================================================
// Individual checks
// =====================================================================

/**
 * Look for a running Claude Desktop process.
 *
 * Process names vary across platforms:
 *   - Windows: "Claude.exe" or "claude.exe"
 *   - macOS:   "Claude" (the .app bundle's main binary)
 *   - Linux:   "claude" (if/when there's a Linux build)
 *
 * We match case-insensitively on the basename equality (not substring)
 * to avoid false positives from things like "claude-code" or
 * "anthropic-claude-cli".
 */
async function checkClaudeProcess(): Promise<boolean> {
  try {
    const processes = await psList();
    return processes.some((p) => {
      const name = p.name.toLowerCase();
      return (
        name === "claude" ||
        name === "claude.exe"
      );
    });
  } catch (err) {
    log.warn(`[detector] ps-list failed: ${(err as Error).message}`);
    return false;
  }
}

/**
 * Path(s) to claude_desktop_config.json by platform.
 *
 * Windows is tricky because Claude Desktop ships in two flavours:
 *   - Standalone installer (.exe from anthropic.com): writes to
 *     `%APPDATA%\Claude\` — the canonical location.
 *   - Microsoft Store package: redirected by UWP sandboxing into
 *     `%LOCALAPPDATA%\Packages\Claude_<publisher-hash>\LocalCache\
 *     Roaming\Claude\`. The publisher hash `pzs8sxrjxfjjc` is
 *     stable across users (it's Anthropic's Store publisher ID).
 *
 * A user who switched between flavours can have stale configs in the
 * unused location. We check all known paths and consider the
 * dependency satisfied if `toraseo` is registered in *any* of them —
 * because that's exactly what Claude Desktop does at runtime: it
 * reads from whichever path matches the current install variant.
 *
 * If multiple paths exist with conflicting toraseo entries, we take
 * the first hit (canonical paths are listed first). This matches the
 * de facto precedence: a user with both files almost certainly uses
 * the standalone installer; the Store config is the legacy artifact.
 */
function claudeConfigPaths(): string[] {
  const home = os.homedir();

  if (process.platform === "win32") {
    const appData =
      process.env.APPDATA ?? path.join(home, "AppData", "Roaming");
    const localAppData =
      process.env.LOCALAPPDATA ?? path.join(home, "AppData", "Local");

    return [
      // Canonical — standalone installer.
      path.join(appData, "Claude", "claude_desktop_config.json"),

      // Microsoft Store package. Sandbox-redirected from %APPDATA%.
      path.join(
        localAppData,
        "Packages",
        "Claude_pzs8sxrjxfjjc",
        "LocalCache",
        "Roaming",
        "Claude",
        "claude_desktop_config.json",
      ),

      // Legacy: very old preview builds put it directly in LocalAppData.
      path.join(
        localAppData,
        "Claude",
        "claude_desktop_config.json",
      ),

      // Legacy: very old preview builds used a Unix-style dotfolder.
      path.join(home, ".claude", "claude_desktop_config.json"),
    ];
  }

  if (process.platform === "darwin") {
    return [
      path.join(
        home,
        "Library",
        "Application Support",
        "Claude",
        "claude_desktop_config.json",
      ),
    ];
  }

  // Linux and anything else.
  return [
    path.join(home, ".config", "Claude", "claude_desktop_config.json"),
  ];
}

/**
 * Read every known claude_desktop_config.json location and check
 * for mcpServers.toraseo. Returns true on the first hit.
 *
 * Why scan all paths instead of one: see comment on
 * claudeConfigPaths() above — Microsoft Store sandboxing puts the
 * config in a non-obvious location, and users who migrated between
 * Store and standalone installers have legacy configs in the unused
 * spot. A user with valid setup shouldn't see a red checkbox just
 * because we looked in the wrong place.
 *
 * Failures (file missing, malformed JSON, no toraseo key) on
 * individual paths are silent — we just move on to the next path.
 * Only ENOENT vs other errors is logged at debug level.
 */
async function checkMcpRegistered(): Promise<boolean> {
  for (const cfgPath of claudeConfigPaths()) {
    try {
      const raw = await fs.readFile(cfgPath, "utf-8");
      const parsed = JSON.parse(raw) as {
        mcpServers?: Record<string, unknown>;
      };
      if (parsed.mcpServers && "toraseo" in parsed.mcpServers) {
        return true;
      }
      // File exists, parses fine, but no toraseo — fall through to
      // next path in case another config has it.
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      // ENOENT is the common case for paths that don't apply to the
      // user's install — don't pollute logs with it.
      if (code !== "ENOENT") {
        log.debug(
          `[detector] config read failed at ${cfgPath} (${code}): ${(err as Error).message}`,
        );
      }
    }
  }
  return false;
}

/**
 * Path to the local skill folder. Same on all platforms — Claude uses
 * ~/.claude/skills/ as the convention for both Claude Desktop and
 * Claude Code (file-based variant).
 */
function skillPath(): string {
  return path.join(os.homedir(), ".claude", "skills", "toraseo", "SKILL.md");
}

async function checkSkillInstalled(): Promise<boolean> {
  try {
    await fs.access(skillPath(), fs.constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

// =====================================================================
// Aggregated check + lifecycle
// =====================================================================

/**
 * Run all three checks in parallel. Total wall time ≈ slowest of
 * (process scan ~100ms, file read ~5ms, file stat ~5ms) = ~100ms.
 */
export async function checkAll(): Promise<DetectorStatus> {
  const [claudeRunning, mcpRegistered, skillInstalled] = await Promise.all([
    checkClaudeProcess(),
    checkMcpRegistered(),
    checkSkillInstalled(),
  ]);

  return {
    claudeRunning,
    mcpRegistered,
    skillInstalled,
    allGreen: claudeRunning && mcpRegistered && skillInstalled,
    checkedAt: new Date().toISOString(),
  };
}

let pollInterval: NodeJS.Timeout | null = null;

/**
 * Wire up detector polling and the on-demand IPC handler.
 *
 * Polling keeps the onboarding UI in sync with reality without the
 * user needing to do anything. The on-demand check is invoked by the
 * renderer immediately before starting a scan — see App.tsx
 * handleStartScan.
 */
export function setupDetector(getMainWindow: () => BrowserWindow | null): void {
  // On-demand check.
  ipcMain.handle(DETECTOR_CHANNELS.checkNow, async () => {
    const status = await checkAll();
    return status;
  });

  // Polling loop. We do an immediate first check so the UI doesn't
  // sit on default `false` values for the first 5 seconds.
  const tick = async () => {
    try {
      const status = await checkAll();
      const win = getMainWindow();
      if (win && !win.isDestroyed()) {
        win.webContents.send(DETECTOR_CHANNELS.statusUpdate, status);
      }
    } catch (err) {
      log.error(`[detector] tick failed: ${(err as Error).message}`);
    }
  };

  // Fire immediately, then on interval.
  void tick();
  pollInterval = setInterval(tick, POLL_INTERVAL_MS);

  // Stop polling when the app is shutting down — otherwise the
  // interval can keep the process alive for a few more ticks during
  // quit, which is harmless but noisy in logs.
  app.on("before-quit", () => {
    if (pollInterval) {
      clearInterval(pollInterval);
      pollInterval = null;
    }
  });

  log.info(
    `[detector] polling started (interval ${POLL_INTERVAL_MS}ms)`,
  );
}
