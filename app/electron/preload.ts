/**
 * Preload script — the trust boundary between the sandboxed renderer
 * and the Node.js privileges of the main process.
 *
 * Everything the React UI needs to do that requires Node — running
 * SEO tools, reading files, opening dialogs — must be exposed here
 * via `contextBridge.exposeInMainWorld`. The renderer never gets
 * direct `ipcRenderer` access; it only gets the typed methods below.
 *
 * Channel names are duplicated here from `electron/tools.ts` rather
 * than imported, because preload runs in a separate, sandboxed
 * context and pulling in tool code (which transitively imports
 * @toraseo/core, cheerio, etc.) would bloat the preload bundle and
 * defeat the sandbox. Keep this file dependency-free except for
 * `electron`.
 */

import { contextBridge, ipcRenderer } from "electron";

import type {
  ScanComplete,
  StageUpdate,
  StartScanArgs,
  ToraseoApi,
} from "../src/types/ipc";

// Mirror of IPC_CHANNELS from electron/tools.ts. Kept in sync manually;
// if you add a channel there, add it here too.
const CH = {
  startScan: "toraseo:start-scan",
  stageUpdate: "toraseo:stage-update",
  scanComplete: "toraseo:scan-complete",
} as const;

const api: ToraseoApi = {
  version: "0.0.1",

  startScan: (args: StartScanArgs) => {
    return ipcRenderer.invoke(CH.startScan, args) as Promise<{
      scanId: string;
    }>;
  },

  onStageUpdate: (listener) => {
    // We wrap the user's listener so we can strip the IpcRendererEvent
    // first arg — the renderer doesn't need it and shouldn't depend on
    // the Electron-specific shape.
    const wrapped = (_event: unknown, update: StageUpdate) => listener(update);
    ipcRenderer.on(CH.stageUpdate, wrapped);
    return () => {
      ipcRenderer.removeListener(CH.stageUpdate, wrapped);
    };
  },

  onScanComplete: (listener) => {
    const wrapped = (_event: unknown, summary: ScanComplete) =>
      listener(summary);
    ipcRenderer.on(CH.scanComplete, wrapped);
    return () => {
      ipcRenderer.removeListener(CH.scanComplete, wrapped);
    };
  },
};

contextBridge.exposeInMainWorld("toraseo", api);
