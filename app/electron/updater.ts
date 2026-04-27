/**
 * Auto-updater integration via electron-updater.
 *
 * Distribution: GitHub Releases (Magbusjap/toraseo, public).
 *
 * Behavior:
 * - On app ready, checks GitHub Releases for newer versions after a
 *   3-second delay (avoid blocking startup).
 * - autoDownload: false — user explicitly clicks "Скачать".
 * - autoInstallOnAppQuit: false — user explicitly clicks "Установить".
 * - Both download and install actions go through IPC, so user intent
 *   must flow from renderer UI buttons.
 *
 * Logs:
 * - Windows: %APPDATA%/toraseo/logs/main.log
 * - macOS:   ~/Library/Logs/toraseo/main.log
 * - Linux:   ~/.config/toraseo/logs/main.log
 */

import { app, BrowserWindow, ipcMain } from "electron";
import pkg from "electron-updater";
import log from "electron-log";

// electron-updater is CommonJS; in ESM we destructure the default export.
const { autoUpdater } = pkg;

// Send electron-updater's chatty events to file + console.
log.transports.file.level = "info";
log.transports.console.level = "info";
autoUpdater.logger = log;

// Both gated on explicit user action.
autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = false;

// Centralized channel names. Mirrored in preload.ts.
export const UPDATER_CHANNELS = {
  // renderer → main (invoke / handle)
  checkForUpdates: "toraseo:updater:check",
  downloadUpdate: "toraseo:updater:download",
  installUpdate: "toraseo:updater:install",
  // main → renderer (send / on)
  updateAvailable: "toraseo:updater:update-available",
  updateNotAvailable: "toraseo:updater:update-not-available",
  downloadProgress: "toraseo:updater:download-progress",
  updateDownloaded: "toraseo:updater:update-downloaded",
  updateError: "toraseo:updater:update-error",
} as const;

/**
 * Wire up auto-updater event handlers and IPC.
 *
 * `getMainWindow` is a thunk so we always reach the *current* window;
 * if it gets recreated (macOS reopen), we don't keep a stale reference.
 */
export function setupAutoUpdater(
  getMainWindow: () => BrowserWindow | null,
): void {
  const send = (channel: string, payload: unknown) => {
    const win = getMainWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send(channel, payload);
    }
  };

  autoUpdater.on("update-available", (info) => {
    log.info(`[updater] Update available: ${info.version}`);
    send(UPDATER_CHANNELS.updateAvailable, {
      version: info.version,
      releaseNotes:
        typeof info.releaseNotes === "string" ? info.releaseNotes : undefined,
      releaseDate: info.releaseDate,
    });
  });

  autoUpdater.on("update-not-available", (info) => {
    log.info(
      `[updater] No update; current ${app.getVersion()}, latest ${info.version}`,
    );
    send(UPDATER_CHANNELS.updateNotAvailable, { version: info.version });
  });

  autoUpdater.on("download-progress", (progress) => {
    log.info(`[updater] Download: ${Math.round(progress.percent)}%`);
    send(UPDATER_CHANNELS.downloadProgress, {
      percent: progress.percent,
      bytesPerSecond: progress.bytesPerSecond,
      total: progress.total,
      transferred: progress.transferred,
    });
  });

  autoUpdater.on("update-downloaded", (info) => {
    log.info(`[updater] Downloaded ${info.version}; ready to install`);
    send(UPDATER_CHANNELS.updateDownloaded, { version: info.version });
  });

  autoUpdater.on("error", (err) => {
    log.error(`[updater] Error: ${err.message}`);
    send(UPDATER_CHANNELS.updateError, { message: err.message });
  });

  // IPC handlers triggered from UI buttons.
  ipcMain.handle(UPDATER_CHANNELS.checkForUpdates, async () => {
    try {
      const result = await autoUpdater.checkForUpdates();
      return {
        ok: true,
        version: result?.updateInfo.version,
        currentVersion: app.getVersion(),
      };
    } catch (err) {
      log.error(`[updater] Check failed: ${(err as Error).message}`);
      return { ok: false, error: (err as Error).message };
    }
  });

  ipcMain.handle(UPDATER_CHANNELS.downloadUpdate, async () => {
    try {
      await autoUpdater.downloadUpdate();
      return { ok: true };
    } catch (err) {
      log.error(`[updater] Download failed: ${(err as Error).message}`);
      return { ok: false, error: (err as Error).message };
    }
  });

  ipcMain.handle(UPDATER_CHANNELS.installUpdate, () => {
    log.info("[updater] User triggered install");
    // quitAndInstall(isSilent=true, isForceRunAfter=true): suppress
    // the NSIS installer UI — our in-app «Установка и
    // перезапуск» notification IS the installer UI for the
    // user. The NSIS dialog flashing in the middle of an auto-update
    // is jarring and confusing («I already clicked install, why is
    // there another installer?»). Silent mode runs the same NSIS
    // installer non-interactively, then relaunches the app.
    //
    // Important: silent mode applies ONLY to in-app updates. The
    // first-time install from a downloaded .exe still shows the
    // standard NSIS installer because that flow doesn't go through
    // electron-updater — the user runs the .exe directly.
    autoUpdater.quitAndInstall(true, true);
    return { ok: true };
  });

  // First check, deferred so it doesn't block window creation.
  setTimeout(() => {
    log.info(
      `[updater] Initial check; current version ${app.getVersion()}`,
    );
    autoUpdater.checkForUpdates().catch((err) => {
      log.error(`[updater] Initial check failed: ${err.message}`);
    });
  }, 3000);
}
