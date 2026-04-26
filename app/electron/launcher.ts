/**
 * Launch Claude Desktop from within the app.
 *
 * Used by the onboarding screen's "Открыть Claude Desktop" button
 * when the detector reports `claudeRunning: false`. We try a list of
 * known install paths per platform; if none exist, we fall back to
 * the platform's default app launcher (`shell.openExternal` style),
 * which handles cases where Claude is installed in a non-standard
 * location.
 *
 * If everything fails — including the fallback — we report it back
 * to the renderer so the UI can show "Не удалось открыть. Запустите
 * Claude Desktop вручную."
 */

import { ipcMain, shell } from "electron";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";
import log from "electron-log";

export const LAUNCHER_CHANNELS = {
  openClaude: "toraseo:launcher:open-claude",
} as const;

export interface OpenClaudeResult {
  ok: boolean;
  /** Which path was used, if any (for debugging). */
  launchedFrom?: string;
  /** Set when ok = false. */
  error?: string;
}

/**
 * Likely install locations for Claude Desktop on Windows.
 *
 * Anthropic publishes installers that put Claude into either the
 * per-user Programs folder (default for non-admin installs) or
 * Program Files (admin install). We check both.
 */
function windowsCandidates(): string[] {
  const localAppData =
    process.env.LOCALAPPDATA ??
    path.join(os.homedir(), "AppData", "Local");
  const programFiles =
    process.env["PROGRAMFILES"] ?? "C:\\Program Files";
  const programFilesX86 =
    process.env["PROGRAMFILES(X86)"] ?? "C:\\Program Files (x86)";

  return [
    path.join(localAppData, "Programs", "claude", "Claude.exe"),
    path.join(localAppData, "Programs", "Claude", "Claude.exe"),
    path.join(programFiles, "Claude", "Claude.exe"),
    path.join(programFilesX86, "Claude", "Claude.exe"),
  ];
}

function macCandidates(): string[] {
  const home = os.homedir();
  return [
    "/Applications/Claude.app",
    path.join(home, "Applications", "Claude.app"),
  ];
}

function linuxCandidates(): string[] {
  const home = os.homedir();
  return [
    "/usr/bin/claude",
    "/usr/local/bin/claude",
    path.join(home, ".local", "bin", "claude"),
  ];
}

async function firstExisting(paths: string[]): Promise<string | null> {
  for (const p of paths) {
    try {
      await fs.access(p, fs.constants.R_OK);
      return p;
    } catch {
      // try next
    }
  }
  return null;
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
    const exe = await firstExisting(windowsCandidates());
    if (exe) {
      try {
        const child = spawn(exe, [], {
          detached: true,
          stdio: "ignore",
        });
        child.unref();
        return { ok: true, launchedFrom: exe };
      } catch (err) {
        log.warn(`[launcher] spawn failed: ${(err as Error).message}`);
      }
    }
  } else if (process.platform === "darwin") {
    const appBundle = await firstExisting(macCandidates());
    if (appBundle) {
      const result = await shell.openPath(appBundle);
      if (result === "") {
        // shell.openPath returns "" on success, error message on failure
        return { ok: true, launchedFrom: appBundle };
      }
      log.warn(`[launcher] shell.openPath failed: ${result}`);
    }
  } else if (process.platform === "linux") {
    const bin = await firstExisting(linuxCandidates());
    if (bin) {
      try {
        const child = spawn(bin, [], {
          detached: true,
          stdio: "ignore",
        });
        child.unref();
        return { ok: true, launchedFrom: bin };
      } catch (err) {
        log.warn(`[launcher] spawn failed: ${(err as Error).message}`);
      }
    }
  }

  // Fallback: try the claude:// URI scheme. If Claude was installed
  // through Anthropic's official installer, the protocol handler is
  // registered and opens the app regardless of disk path.
  try {
    await shell.openExternal("claude://");
    return { ok: true, launchedFrom: "claude:// protocol handler" };
  } catch (err) {
    return {
      ok: false,
      error: `Could not launch Claude Desktop: ${(err as Error).message}`,
    };
  }
}

export function setupLauncher(): void {
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
}
