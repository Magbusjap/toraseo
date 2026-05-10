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
  BridgeAnalysisInput,
  BridgeClient,
  CurrentScanState,
  DetectorStatus,
  DownloadProgress,
  DownloadSkillZipResult,
  InstallMcpConfigResult,
  OpenClaudeResult,
  OpenCodexResult,
  PickAppPathResult,
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
  ProviderConnectionTestResult,
  ProviderId,
  ProviderInfo,
  RuntimeAuditReport,
  RuntimeChatWindowSession,
  SetProviderConfigInput,
  SetProviderConfigResult,
  SetProviderModelProfilesInput,
  SetProviderModelProfilesResult,
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
  installMcpConfig: "toraseo:detector:install-mcp-config",
  pickMcpConfig: "toraseo:detector:pick-mcp-config",
  clearManualMcpConfig: "toraseo:detector:clear-manual-mcp-config",
  getManualMcpConfig: "toraseo:detector:get-manual-mcp-config",
  confirmSkillInstalled: "toraseo:detector:confirm-skill-installed",
  clearSkillConfirmation: "toraseo:detector:clear-skill-confirmation",
  downloadSkillZip: "toraseo:detector:download-skill-zip",
  downloadCodexWorkflowZip: "toraseo:detector:download-codex-workflow-zip",
  openSkillReleasesPage: "toraseo:detector:open-skill-releases-page",
  statusUpdate: "toraseo:detector:status-update",
} as const;

// Mirror of LAUNCHER_CHANNELS from electron/launcher.ts.
const LAUNCHER = {
  openClaude: "toraseo:launcher:open-claude",
  openCodex: "toraseo:launcher:open-codex",
  pickClaudePath: "toraseo:launcher:pick-claude-path",
  pickCodexPath: "toraseo:launcher:pick-codex-path",
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
  copyCodexSetupPrompt: "toraseo:bridge:copy-codex-setup-prompt",
  copyBridgeSetupPrompt: "toraseo:bridge:copy-bridge-setup-prompt",
  stateUpdate: "toraseo:bridge:state-update",
} as const;

// Mirror of RUNTIME_CHANNELS from electron/runtime/index.ts.
const RUNTIME = {
  isEnabled: "toraseo:runtime:is-enabled",
  isEncryptionAvailable: "toraseo:runtime:is-encryption-available",
  listProviders: "toraseo:runtime:list-providers",
  setProviderConfig: "toraseo:runtime:set-provider-config",
  setProviderModelProfiles: "toraseo:runtime:set-provider-model-profiles",
  deleteProviderConfig: "toraseo:runtime:delete-provider-config",
  sendMessage: "toraseo:runtime:send-message",
  openReportWindow: "toraseo:runtime:open-report-window",
  closeReportWindow: "toraseo:runtime:close-report-window",
  showReportWindowProcessing: "toraseo:runtime:show-report-window-processing",
  endReportWindowSession: "toraseo:runtime:end-report-window-session",
  copyArticleSourceText: "toraseo:runtime:copy-article-source-text",
  exportReportPdf: "toraseo:runtime:export-report-pdf",
  exportReportDocument: "toraseo:runtime:export-report-document",
  exportReportPresentation: "toraseo:runtime:export-report-presentation",
  exportReportJson: "toraseo:runtime:export-report-json",
  testProviderConnection: "toraseo:runtime:test-provider-connection",
  openChatWindow: "toraseo:runtime:open-chat-window",
  updateChatWindowSession: "toraseo:runtime:update-chat-window-session",
  endChatWindowSession: "toraseo:runtime:end-chat-window-session",
  closeChatWindow: "toraseo:runtime:close-chat-window",
  getChatWindowSession: "toraseo:runtime:chat-window:get-session",
  chatWindowSessionUpdate: "toraseo:runtime:chat-window:session-update",
} as const;

const api: ToraseoApi = {
  version: "0.0.9",

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

    installMcpConfig: (target) => {
      return ipcRenderer.invoke(
        DETECTOR.installMcpConfig,
        target,
      ) as Promise<InstallMcpConfigResult>;
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

    downloadCodexWorkflowZip: () => {
      return ipcRenderer.invoke(
        DETECTOR.downloadCodexWorkflowZip,
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
    openCodex: () => {
      return ipcRenderer.invoke(LAUNCHER.openCodex) as Promise<OpenCodexResult>;
    },
    pickClaudePath: () => {
      return ipcRenderer.invoke(
        LAUNCHER.pickClaudePath,
      ) as Promise<PickAppPathResult>;
    },
    pickCodexPath: () => {
      return ipcRenderer.invoke(
        LAUNCHER.pickCodexPath,
      ) as Promise<PickAppPathResult>;
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
    startScan: (
      url: string,
      toolIds: string[],
      bridgeClient?: BridgeClient,
      input?: BridgeAnalysisInput,
    ) => {
      return ipcRenderer.invoke(BRIDGE.startScan, {
        url,
        toolIds,
        bridgeClient,
        input,
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

    copyCodexSetupPrompt: () => {
      return ipcRenderer.invoke(BRIDGE.copyCodexSetupPrompt) as Promise<{
        ok: boolean;
        prompt: string;
      }>;
    },

    copyBridgeSetupPrompt: (bridgeClient: BridgeClient) => {
      return ipcRenderer.invoke(
        BRIDGE.copyBridgeSetupPrompt,
        bridgeClient,
      ) as Promise<{
        ok: boolean;
        prompt: string;
      }>;
    },
  },

  runtime: {
    isEnabled: () => {
      return ipcRenderer.invoke(RUNTIME.isEnabled) as Promise<boolean>;
    },

    isEncryptionAvailable: () => {
      return ipcRenderer.invoke(
        RUNTIME.isEncryptionAvailable,
      ) as Promise<boolean>;
    },

    listProviders: () => {
      return ipcRenderer.invoke(RUNTIME.listProviders) as Promise<
        ProviderInfo[]
      >;
    },

    setProviderConfig: (input: SetProviderConfigInput) => {
      return ipcRenderer.invoke(
        RUNTIME.setProviderConfig,
        input,
      ) as Promise<SetProviderConfigResult>;
    },

    setProviderModelProfiles: (input: SetProviderModelProfilesInput) => {
      return ipcRenderer.invoke(
        RUNTIME.setProviderModelProfiles,
        input,
      ) as Promise<SetProviderModelProfilesResult>;
    },

    deleteProviderConfig: (id: ProviderId) => {
      return ipcRenderer.invoke(
        RUNTIME.deleteProviderConfig,
        id,
      ) as Promise<{ ok: boolean }>;
    },

    sendMessage: (input: OrchestratorMessageInput) => {
      return ipcRenderer.invoke(
        RUNTIME.sendMessage,
        input,
      ) as Promise<OrchestratorMessageResult>;
    },

    openReportWindow: (report: RuntimeAuditReport) => {
      return ipcRenderer.invoke(
        RUNTIME.openReportWindow,
        report,
      ) as Promise<{ ok: boolean }>;
    },

    closeReportWindow: () => {
      return ipcRenderer.invoke(
        RUNTIME.closeReportWindow,
      ) as Promise<{ ok: boolean }>;
    },

    showReportWindowProcessing: () => {
      return ipcRenderer.invoke(
        RUNTIME.showReportWindowProcessing,
      ) as Promise<{ ok: boolean }>;
    },

    endReportWindowSession: () => {
      return ipcRenderer.invoke(
        RUNTIME.endReportWindowSession,
      ) as Promise<{ ok: boolean }>;
    },

    copyArticleSourceText: (report: RuntimeAuditReport) => {
      return ipcRenderer.invoke(
        RUNTIME.copyArticleSourceText,
        report,
      ) as Promise<{ ok: boolean; charCount?: number; error?: string }>;
    },

    exportReportPdf: (report: RuntimeAuditReport) => {
      return ipcRenderer.invoke(
        RUNTIME.exportReportPdf,
        report,
      ) as Promise<{ ok: boolean; filePath?: string; error?: string }>;
    },

    exportReportDocument: (report: RuntimeAuditReport) => {
      return ipcRenderer.invoke(
        RUNTIME.exportReportDocument,
        report,
      ) as Promise<{ ok: boolean; filePath?: string; error?: string }>;
    },

    exportReportPresentation: (report: RuntimeAuditReport) => {
      return ipcRenderer.invoke(
        RUNTIME.exportReportPresentation,
        report,
      ) as Promise<{ ok: boolean; filePath?: string; error?: string }>;
    },

    exportReportJson: (report: RuntimeAuditReport) => {
      return ipcRenderer.invoke(
        RUNTIME.exportReportJson,
        report,
      ) as Promise<{ ok: boolean; filePath?: string; error?: string }>;
    },

    testProviderConnection: (
      providerId: ProviderId,
      locale: SupportedLocale,
      modelOverride?: string,
    ) => {
      return ipcRenderer.invoke(
        RUNTIME.testProviderConnection,
        providerId,
        locale,
        modelOverride,
      ) as Promise<ProviderConnectionTestResult>;
    },

    openChatWindow: (session: RuntimeChatWindowSession) => {
      return ipcRenderer.invoke(
        RUNTIME.openChatWindow,
        session,
      ) as Promise<{ ok: boolean }>;
    },

    updateChatWindowSession: (session: RuntimeChatWindowSession) => {
      return ipcRenderer.invoke(
        RUNTIME.updateChatWindowSession,
        session,
      ) as Promise<{ ok: boolean }>;
    },

    endChatWindowSession: () => {
      return ipcRenderer.invoke(
        RUNTIME.endChatWindowSession,
      ) as Promise<{ ok: boolean }>;
    },

    closeChatWindow: () => {
      return ipcRenderer.invoke(
        RUNTIME.closeChatWindow,
      ) as Promise<{ ok: boolean }>;
    },

    getChatWindowSession: () => {
      return ipcRenderer.invoke(
        RUNTIME.getChatWindowSession,
      ) as Promise<RuntimeChatWindowSession>;
    },

    onChatWindowSessionUpdate: (listener) => {
      const wrapped = (_event: unknown, session: RuntimeChatWindowSession) =>
        listener(session);
      ipcRenderer.on(RUNTIME.chatWindowSessionUpdate, wrapped);
      return () =>
        ipcRenderer.removeListener(RUNTIME.chatWindowSessionUpdate, wrapped);
    },
  },
};

contextBridge.exposeInMainWorld("toraseo", api);
