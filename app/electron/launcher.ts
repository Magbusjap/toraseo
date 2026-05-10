/**
 * Launch Claude Desktop from within the app.
 *
 * Used by the onboarding screen's open-Claude button
 * when the detector reports `claudeRunning: false`. We try a list of
 * known install paths per platform; if none exist, we fall back to
 * the platform's default app launcher (`shell.openExternal` style),
 * which handles cases where Claude is installed in a non-standard
 * location.
 *
 * If everything fails, including the fallback, we report it back to
 * the renderer so the UI can show its localized failure message.
 */

import { BrowserWindow, dialog, ipcMain, shell } from "electron";
import { spawn, spawnSync } from "node:child_process";
import log from "electron-log";
import {
  writeManualAppPath,
  type LaunchAppId,
} from "./appPathStore.js";
import { resolveLaunchPath } from "./launchPaths.js";

export const LAUNCHER_CHANNELS = {
  openClaude: "toraseo:launcher:open-claude",
  openCodex: "toraseo:launcher:open-codex",
  pickClaudePath: "toraseo:launcher:pick-claude-path",
  pickCodexPath: "toraseo:launcher:pick-codex-path",
} as const;

export interface OpenClaudeResult {
  ok: boolean;
  /** Which path was used, if any (for debugging). */
  launchedFrom?: string;
  /** True when ToraSEO could not find an executable path automatically. */
  needsManualPath?: boolean;
  /** Set when ok = false. */
  error?: string;
}

export type OpenCodexResult = OpenClaudeResult;

export interface PickAppPathResult {
  ok: boolean;
  path?: string;
  reason?: "cancelled";
  error?: string;
}

function launchExecutable(exe: string): OpenClaudeResult {
  if (exe.endsWith("://")) {
    void shell.openExternal(exe);
    return { ok: true, launchedFrom: exe };
  }

  if (process.platform === "win32" && exe.startsWith("shell:")) {
    const result = spawnSync("explorer.exe", [exe], {
      windowsHide: true,
      stdio: "ignore",
    });
    if (result.error) {
      throw result.error;
    }
    return { ok: true, launchedFrom: exe };
  }

  if (process.platform === "win32" && !exe.toLowerCase().endsWith(".exe")) {
    void shell.openPath(exe);
    return { ok: true, launchedFrom: exe };
  }

  const child = spawn(exe, [], {
    detached: true,
    stdio: "ignore",
  });
  child.unref();
  return { ok: true, launchedFrom: exe };
}

async function pickAppPath(
  appId: LaunchAppId,
  getMainWindow: () => BrowserWindow | null,
): Promise<PickAppPathResult> {
  const win = getMainWindow();
  const options: Electron.OpenDialogOptions = {
    title: appId === "claude" ? "Claude Desktop" : "Codex",
    properties: process.platform === "darwin" ? ["openFile", "openDirectory"] : ["openFile"],
    filters:
      process.platform === "win32"
        ? [{ name: "Applications", extensions: ["exe", "lnk", "appref-ms"] }]
        : undefined,
  };
  const result = win
    ? await dialog.showOpenDialog(win, options)
    : await dialog.showOpenDialog(options);

  if (result.canceled || result.filePaths.length === 0) {
    return { ok: false, reason: "cancelled" };
  }

  const picked = result.filePaths[0];
  if (!picked) {
    return { ok: false, reason: "cancelled" };
  }
  await writeManualAppPath(appId, picked);
  return { ok: true, path: picked };
}

/**
 * Best-effort launch. Strategy by platform:
 *   - Windows: spawn with detached + unref so Claude doesn't die when
 *     ToraSEO closes
 *   - macOS: shell.openPath on the .app bundle (LaunchServices handles it)
 *   - Linux: spawn the binary directly
 *
 * On failure at any layer, fall back to a final shell.openExternal
 * with a `claude://` URI scheme — Anthropic registers this on install,
 * and clicking it opens Claude even if we don't know the binary path.
 */
async function tryLaunch(): Promise<OpenClaudeResult> {
  if (process.platform === "win32") {
    const exe = await resolveLaunchPath("claude");
    if (exe) {
      try {
        return launchExecutable(exe);
      } catch (err) {
        log.warn(`[launcher] spawn failed: ${(err as Error).message}`);
      }
    }
  } else if (process.platform === "darwin") {
    const appBundle = await resolveLaunchPath("claude");
    if (appBundle) {
      const result = await shell.openPath(appBundle);
      if (result === "") {
        // shell.openPath returns "" on success, error message on failure
        return { ok: true, launchedFrom: appBundle };
      }
      log.warn(`[launcher] shell.openPath failed: ${result}`);
    }
  } else if (process.platform === "linux") {
    const bin = await resolveLaunchPath("claude");
    if (bin) {
      try {
        return launchExecutable(bin);
      } catch (err) {
        log.warn(`[launcher] spawn failed: ${(err as Error).message}`);
      }
    }
  }

  return {
    ok: false,
    needsManualPath: true,
    error: "ToraSEO could not find the Claude Desktop executable path.",
  };
}

async function tryLaunchCodex(): Promise<OpenCodexResult> {
  if (process.platform === "win32") {
    const exe = await resolveLaunchPath("codex");
    if (exe) {
      try {
        return launchExecutable(exe);
      } catch (err) {
        log.warn(`[launcher] codex spawn failed: ${(err as Error).message}`);
      }
    }
  } else if (process.platform === "darwin") {
    const appBundle = await resolveLaunchPath("codex");
    if (appBundle) {
      const result = await shell.openPath(appBundle);
      if (result === "") {
        return { ok: true, launchedFrom: appBundle };
      }
      log.warn(`[launcher] codex shell.openPath failed: ${result}`);
    }
  } else if (process.platform === "linux") {
    const bin = await resolveLaunchPath("codex");
    if (bin) {
      try {
        return launchExecutable(bin);
      } catch (err) {
        log.warn(`[launcher] codex spawn failed: ${(err as Error).message}`);
      }
    }
  }

  return {
    ok: false,
    needsManualPath: true,
    error: "ToraSEO could not find the Codex executable path.",
  };
}

export function setupLauncher(getMainWindow: () => BrowserWindow | null): void {
  ipcMain.handle(LAUNCHER_CHANNELS.openClaude, async () => {
    log.info("[launcher] User requested Claude Desktop launch");
    const result = await tryLaunch();
    if (result.ok) {
      log.info(`[launcher] Launched: ${result.launchedFrom}`);
    } else {
      log.error(`[launcher] All launch strategies failed: ${result.error}`);
    }
    return result;
  });

  ipcMain.handle(LAUNCHER_CHANNELS.openCodex, async () => {
    log.info("[launcher] User requested Codex launch");
    const result = await tryLaunchCodex();
    if (result.ok) {
      log.info(`[launcher] Launched Codex: ${result.launchedFrom}`);
    } else {
      log.error(`[launcher] Codex launch strategies failed: ${result.error}`);
    }
    return result;
  });

  ipcMain.handle(LAUNCHER_CHANNELS.pickClaudePath, async () => {
    return pickAppPath("claude", getMainWindow);
  });

  ipcMain.handle(LAUNCHER_CHANNELS.pickCodexPath, async () => {
    return pickAppPath("codex", getMainWindow);
  });
}
