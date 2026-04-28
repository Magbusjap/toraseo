/**
 * Preload script — the trust boundary between the sandboxed renderer
 * and the Node.js privileges of the main process.
 *
 * Everything the React UI needs to do that requires Node — running
 * SEO tools, reading files, opening dialogs, checking for updates —
 * must be exposed here via `contextBridge.exposeInMainWorld`. The
 * renderer never gets direct `ipcRenderer` access; it only gets the
 * typed methods below.
 *
 * Channel names are duplicated here from `electron/tools.ts` and
 * `electron/updater.ts` rather than imported, because preload runs
 * in a separate, sandboxed context and pulling in tool code (which
 * transitively imports @toraseo/core, cheerio, etc.) would bloat the
 * preload bundle and defeat the sandbox. Keep this file
 * dependency-free except for `electron`.
 */

import { contextBridge, ipcRenderer } from "electron";

import type {
  CheckUpdateResult,
  CurrentScanState,
  DetectorStatus,
  DownloadProgress,
  DownloadSkillZipResult,
  OpenClaudeResult,
  PickMcpConfigResult,
  ScanComplete,
  StageUpdate,
  StartBridgeScanResult,
  StartScanArgs,
  SupportedLocale,
  ToolId,
  ToraseoApi,
  UpdateInfo,
} from "../src/types/ipc";
import type {
  OrchestratorMessageInput,
  OrchestratorMessageResult,
  ProviderInfo,
} from "../src/types/runtime";

// Mirror of IPC_CHANNELS from electron/tools.ts. Kept in sync manually;
// if you add a channel there, add it here too.
const SCAN = {
  startScan: "toraseo:start-scan",
  stageUpdate: "toraseo:stage-update",
  scanComplete: "toraseo:scan-complete",
} as const;

// Mirror of UPDATER_CHANNELS from electron/updater.ts.
const UPDATER = {
  check: "toraseo:updater:check",
  download: "toraseo:updater:download",
  install: "toraseo:updater:install",
  available: "toraseo:updater:update-available",
  notAvailable: "toraseo:updater:update-not-available",
  progress: "toraseo:updater:download-progress",
  downloaded: "toraseo:updater:update-downloaded",
  error: "toraseo:updater:update-error",
} as const;

// Mirror of DETECTOR_CHANNELS from electron/detector.ts.
const DETECTOR = {
  checkNow: "toraseo:detector:check-now",
  pickMcpConfig: "toraseo:detector:pick-mcp-config",
  clearManualMcpConfig: "toraseo:detector:clear-manual-mcp-config",
  getManualMcpConfig: "toraseo:detector:get-manual-mcp-config",
  confirmSkillInstalled: "toraseo:detector:confirm-skill-installed",
  clearSkillConfirmation: "toraseo:detector:clear-skill-confirmation",
  downloadSkillZip: "toraseo:detector:download-skill-zip",
  openSkillReleasesPage: "toraseo:detector:open-skill-releases-page",
  statusUpdate: "toraseo:detector:status-update",
} as const;

// Mirror of LAUNCHER_CHANNELS from electron/launcher.ts.
const LAUNCHER = {
  openClaude: "toraseo:launcher:open-claude",
} as const;

// Mirror of LOCALE_CHANNELS from electron/locale.ts.
const LOCALE = {
  get: "toraseo:locale:get",
  set: "toraseo:locale:set",
  getOs: "toraseo:locale:get-os",
} as const;

// Mirror of BRIDGE_CHANNELS from electron/bridge/index.ts.
const BRIDGE = {
  startScan: "toraseo:bridge:start-scan",
  cancelScan: "toraseo:bridge:cancel-scan",
  retryHandshake: "toraseo:bridge:retry-handshake",
  getState: "toraseo:bridge:get-state",
  stateUpdate: "toraseo:bridge:state-update",
} as const;

// Mirror of RUNTIME_CHANNELS from electron/runtime/index.ts.
const RUNTIME = {
  isEnabled: "toraseo:runtime:is-enabled",
  listProviders: "toraseo:runtime:list-providers",
  sendMessage: "toraseo:runtime:send-message",
} as const;

const api: ToraseoApi = {
  version: "0.0.6",

  startScan: (args: StartScanArgs) => {
    return ipcRenderer.invoke(SCAN.startScan, args) as Promise<{
      scanId: string;
    }>;
  },

  onStageUpdate: (listener) => {
    // We wrap the user's listener so we can strip the IpcRendererEvent
    // first arg — the renderer doesn't need it and shouldn't depend on
    // the Electron-specific shape.
    const wrapped = (_event: unknown, update: StageUpdate) => listener(update);
    ipcRenderer.on(SCAN.stageUpdate, wrapped);
    return () => {
      ipcRenderer.removeListener(SCAN.stageUpdate, wrapped);
    };
  },

  onScanComplete: (listener) => {
    const wrapped = (_event: unknown, summary: ScanComplete) =>
      listener(summary);
    ipcRenderer.on(SCAN.scanComplete, wrapped);
    return () => {
      ipcRenderer.removeListener(SCAN.scanComplete, wrapped);
    };
  },

  updater: {
    check: () => {
      return ipcRenderer.invoke(UPDATER.check) as Promise<CheckUpdateResult>;
    },

    download: () => {
      return ipcRenderer.invoke(UPDATER.download) as Promise<{
        ok: boolean;
        error?: string;
      }>;
    },

    install: () => {
      return ipcRenderer.invoke(UPDATER.install) as Promise<{ ok: boolean }>;
    },

    onUpdateAvailable: (listener) => {
      const wrapped = (_event: unknown, info: UpdateInfo) => listener(info);
      ipcRenderer.on(UPDATER.available, wrapped);
      return () => ipcRenderer.removeListener(UPDATER.available, wrapped);
    },

    onUpdateNotAvailable: (listener) => {
      const wrapped = (_event: unknown, info: { version: string }) =>
        listener(info);
      ipcRenderer.on(UPDATER.notAvailable, wrapped);
      return () => ipcRenderer.removeListener(UPDATER.notAvailable, wrapped);
    },

    onDownloadProgress: (listener) => {
      const wrapped = (_event: unknown, progress: DownloadProgress) =>
        listener(progress);
      ipcRenderer.on(UPDATER.progress, wrapped);
      return () => ipcRenderer.removeListener(UPDATER.progress, wrapped);
    },

    onUpdateDownloaded: (listener) => {
      const wrapped = (_event: unknown, info: UpdateInfo) => listener(info);
      ipcRenderer.on(UPDATER.downloaded, wrapped);
      return () => ipcRenderer.removeListener(UPDATER.downloaded, wrapped);
    },

    onUpdateError: (listener) => {
      const wrapped = (_event: unknown, err: { message: string }) =>
        listener(err);
      ipcRenderer.on(UPDATER.error, wrapped);
      return () => ipcRenderer.removeListener(UPDATER.error, wrapped);
    },
  },

  detector: {
    onStatusUpdate: (listener) => {
      const wrapped = (_event: unknown, status: DetectorStatus) =>
        listener(status);
      ipcRenderer.on(DETECTOR.statusUpdate, wrapped);
      return () => ipcRenderer.removeListener(DETECTOR.statusUpdate, wrapped);
    },

    checkNow: () => {
      return ipcRenderer.invoke(DETECTOR.checkNow) as Promise<DetectorStatus>;
    },

    pickMcpConfig: () => {
      return ipcRenderer.invoke(
        DETECTOR.pickMcpConfig,
      ) as Promise<PickMcpConfigResult>;
    },

    clearManualMcpConfig: () => {
      return ipcRenderer.invoke(
        DETECTOR.clearManualMcpConfig,
      ) as Promise<{ ok: boolean }>;
    },

    getManualMcpConfig: () => {
      return ipcRenderer.invoke(
        DETECTOR.getManualMcpConfig,
      ) as Promise<{ path: string | null }>;
    },

    downloadSkillZip: () => {
      return ipcRenderer.invoke(
        DETECTOR.downloadSkillZip,
      ) as Promise<DownloadSkillZipResult>;
    },

    openSkillReleasesPage: () => {
      return ipcRenderer.invoke(
        DETECTOR.openSkillReleasesPage,
      ) as Promise<{ ok: boolean }>;
    },

    confirmSkillInstalled: () => {
      return ipcRenderer.invoke(
        DETECTOR.confirmSkillInstalled,
      ) as Promise<{ ok: boolean }>;
    },

    clearSkillConfirmation: () => {
      return ipcRenderer.invoke(
        DETECTOR.clearSkillConfirmation,
      ) as Promise<{ ok: boolean }>;
    },
  },

  launcher: {
    openClaude: () => {
      return ipcRenderer.invoke(LAUNCHER.openClaude) as Promise<OpenClaudeResult>;
    },
  },

  locale: {
    get: () => {
      return ipcRenderer.invoke(LOCALE.get) as Promise<SupportedLocale | null>;
    },
    set: (locale: SupportedLocale) => {
      return ipcRenderer.invoke(LOCALE.set, locale) as Promise<{ ok: boolean }>;
    },
    getOs: () => {
      return ipcRenderer.invoke(LOCALE.getOs) as Promise<SupportedLocale>;
    },
  },

  bridge: {
    startScan: (url: string, toolIds: ToolId[]) => {
      return ipcRenderer.invoke(BRIDGE.startScan, {
        url,
        toolIds,
      }) as Promise<StartBridgeScanResult>;
    },

    onStateUpdate: (listener) => {
      const wrapped = (_event: unknown, state: CurrentScanState | null) =>
        listener(state);
      ipcRenderer.on(BRIDGE.stateUpdate, wrapped);
      return () => {
        ipcRenderer.removeListener(BRIDGE.stateUpdate, wrapped);
      };
    },

    getCurrentState: () => {
      return ipcRenderer.invoke(BRIDGE.getState) as Promise<
        CurrentScanState | null
      >;
    },

    cancelScan: () => {
      return ipcRenderer.invoke(BRIDGE.cancelScan) as Promise<{ ok: boolean }>;
    },

    retryHandshake: () => {
      return ipcRenderer.invoke(BRIDGE.retryHandshake) as Promise<{
        ok: boolean;
        error?: string;
      }>;
    },
  },

  runtime: {
    isEnabled: () => {
      return ipcRenderer.invoke(RUNTIME.isEnabled) as Promise<boolean>;
    },

    listProviders: () => {
      return ipcRenderer.invoke(RUNTIME.listProviders) as Promise<
        ProviderInfo[]
      >;
    },

    sendMessage: (input: OrchestratorMessageInput) => {
      return ipcRenderer.invoke(
        RUNTIME.sendMessage,
        input,
      ) as Promise<OrchestratorMessageResult>;
    },
  },
};

contextBridge.exposeInMainWorld("toraseo", api);
