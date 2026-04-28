/**
 * Bridge Mode IPC setup.
 *
 * Registers four request handlers and one push channel:
 *
 *   request: toraseo:bridge:start-scan      → startScan(url, toolIds)
 *   request: toraseo:bridge:cancel-scan     → cancelScan()
 *   request: toraseo:bridge:retry-handshake → retryHandshake()
 *   request: toraseo:bridge:get-state       → getCurrentState()
 *   push:    toraseo:bridge:state-update    → state changes from polling
 *
 * The push channel is driven by a single watchState() subscription
 * that fires once per state transition. Multiple BrowserWindows
 * are not supported in v0.0.7 — there's only one main window, so
 * one polling watcher is enough.
 *
 * Watcher lifecycle: setup on first call to setupBridge, runs for
 * the entire app lifetime. There's no teardown path because the
 * polling timer holds nothing expensive (file reads on a short
 * interval) and stops when the app quits.
 */

import { BrowserWindow, ipcMain } from "electron";
import log from "electron-log";

import {
  startScan,
  cancelScan,
  retryHandshake,
  getCurrentState,
} from "./scanLifecycle.js";
import { watchState } from "./stateFile.js";

import type {
  CurrentScanState,
  ToolId,
  StartBridgeScanResult,
} from "../../src/types/ipc.js";

export const BRIDGE_CHANNELS = {
  // renderer → main
  startScan: "toraseo:bridge:start-scan",
  cancelScan: "toraseo:bridge:cancel-scan",
  retryHandshake: "toraseo:bridge:retry-handshake",
  getState: "toraseo:bridge:get-state",
  // main → renderer (push)
  stateUpdate: "toraseo:bridge:state-update",
} as const;

/**
 * Wire up Bridge Mode handlers. Call once on app ready, after
 * the main BrowserWindow is created (we need it for the push
 * channel).
 */
export function setupBridge(getMainWindow: () => BrowserWindow | null): void {
  // ----- Request handlers -----

  ipcMain.handle(
    BRIDGE_CHANNELS.startScan,
    async (
      _event,
      args: { url: string; toolIds: ToolId[] },
    ): Promise<StartBridgeScanResult> => {
      // Validate inputs at the trust boundary. Renderer is sandboxed
      // but a buggy renderer could still pass garbage; we reject
      // here so the lifecycle module can assume clean inputs.
      if (typeof args?.url !== "string" || args.url.trim().length === 0) {
        throw new Error("Invalid args: 'url' must be a non-empty string");
      }
      if (!Array.isArray(args.toolIds) || args.toolIds.length === 0) {
        throw new Error("Invalid args: 'toolIds' must be a non-empty array");
      }
      return startScan(args.url.trim(), args.toolIds);
    },
  );

  ipcMain.handle(
    BRIDGE_CHANNELS.cancelScan,
    async (): Promise<{ ok: boolean }> => {
      return cancelScan();
    },
  );

  ipcMain.handle(
    BRIDGE_CHANNELS.retryHandshake,
    async (): Promise<{ ok: boolean; error?: string }> => {
      return retryHandshake();
    },
  );

  ipcMain.handle(
    BRIDGE_CHANNELS.getState,
    async (): Promise<CurrentScanState | null> => {
      return getCurrentState();
    },
  );

  // ----- Push channel (state-file polling) -----

  watchState((state) => {
    const win = getMainWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send(BRIDGE_CHANNELS.stateUpdate, state);
    }
  });

  log.info("[bridge] IPC handlers registered, polling watcher started");
}
