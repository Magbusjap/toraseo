/**
 * Preload script for the renderer process.
 *
 * Currently a placeholder — the renderer does not yet need access to
 * any privileged Node.js or Electron APIs (no IPC, no fs, no shell).
 *
 * When Stage 4 progresses to wiring up the sidebar settings to core/
 * tools, this file will expose a typed `window.toraseo` API via
 * `contextBridge.exposeInMainWorld(...)`.
 */

import { contextBridge } from "electron";

// Expose an empty namespace now so window.toraseo always exists.
// Renderer can feature-detect specific methods later.
contextBridge.exposeInMainWorld("toraseo", {
  version: "0.0.1",
});
