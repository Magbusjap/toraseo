/**
 * Native Runtime IPC setup.
 *
 * Channels (Stage 2):
 *   toraseo:runtime:is-enabled              → feature-flag readout
 *   toraseo:runtime:is-encryption-available → safeStorage probe
 *   toraseo:runtime:list-providers          → installed providers + status
 *   toraseo:runtime:set-provider-config     → persist API key (encrypted)
 *   toraseo:runtime:delete-provider-config  → remove a provider config
 *   toraseo:runtime:send-message            → orchestrator entry
 *
 * The setup runs once on app ready; teardown happens implicitly
 * when the process quits.
 */

import { ipcMain } from "electron";
import log from "electron-log";

import { handleUserMessage } from "./orchestrator.js";
import {
  CHAT_WINDOW_CHANNELS,
  closeChatWindow,
  endChatWindowSession,
  getChatWindowSession,
  openChatWindow,
  updateChatWindowSession,
} from "./chatWindow.js";
import {
  initProviderRegistry,
  listProviders,
} from "./providers/registry.js";
import { isNativeRuntimeEnabled } from "./featureFlag.js";
import {
  closeReportWindow,
  copyArticleSourceText,
  endReportWindowSession,
  exportReportDocument,
  exportReportPdf,
  exportReportPresentation,
  openReportWindow,
  showReportWindowProcessing,
} from "./reporting.js";
import { testProviderConnection } from "./providerDiagnostics.js";
import {
  deleteProviderConfig,
  isEncryptionAvailable,
  setProviderConfig,
  setProviderModelProfiles,
} from "./providerConfigStore.js";

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
} from "../../src/types/runtime.js";

export const RUNTIME_CHANNELS = {
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
  testProviderConnection: "toraseo:runtime:test-provider-connection",
  openChatWindow: "toraseo:runtime:open-chat-window",
  updateChatWindowSession: "toraseo:runtime:update-chat-window-session",
  endChatWindowSession: "toraseo:runtime:end-chat-window-session",
  closeChatWindow: "toraseo:runtime:close-chat-window",
} as const;

const ALLOWED_PROVIDER_IDS: ReadonlySet<ProviderId> = new Set<ProviderId>([
  "openrouter",
  "openai",
  "anthropic",
  "google",
  "local",
]);

function isValidProviderId(value: unknown): value is ProviderId {
  return typeof value === "string" && ALLOWED_PROVIDER_IDS.has(value as ProviderId);
}

/**
 * Wire up IPC handlers and seed the provider registry. Call once
 * after `app.whenReady()` resolves.
 */
export async function setupRuntime(): Promise<void> {
  await initProviderRegistry();

  ipcMain.handle(
    RUNTIME_CHANNELS.isEnabled,
    async (): Promise<boolean> => {
      return isNativeRuntimeEnabled();
    },
  );

  ipcMain.handle(
    RUNTIME_CHANNELS.isEncryptionAvailable,
    async (): Promise<boolean> => {
      return isEncryptionAvailable();
    },
  );

  ipcMain.handle(
    RUNTIME_CHANNELS.listProviders,
    async (): Promise<ProviderInfo[]> => {
      return listProviders();
    },
  );

  ipcMain.handle(
    RUNTIME_CHANNELS.setProviderConfig,
    async (
      _event,
      input: SetProviderConfigInput,
    ): Promise<SetProviderConfigResult> => {
      if (!input || typeof input !== "object") {
        return {
          ok: false,
          errorCode: "invalid_input",
          errorMessage: "Expected a config object",
        };
      }
      if (!isValidProviderId(input.id)) {
        return {
          ok: false,
          errorCode: "invalid_input",
          errorMessage: `Unknown provider id: ${String(input.id)}`,
        };
      }
      const result = await setProviderConfig({
        id: input.id,
        apiKey: input.apiKey,
        baseUrl: input.baseUrl,
        defaultModel: input.defaultModel,
        modelProfiles: input.modelProfiles,
        defaultModelProfileId: input.defaultModelProfileId,
      });
      if (!result.ok) {
        return result;
      }
      // Refresh registry so the new key is immediately usable
      // without an app restart.
      await initProviderRegistry();
      const info =
        listProviders().find((p) => p.id === input.id) ?? null;
      if (!info) {
        return {
          ok: false,
          errorCode: "write_failed",
          errorMessage:
            "Config persisted but registry refresh did not find provider",
        };
      }
      return { ok: true, config: info };
    },
  );

  ipcMain.handle(
    RUNTIME_CHANNELS.setProviderModelProfiles,
    async (
      _event,
      input: SetProviderModelProfilesInput,
    ): Promise<SetProviderModelProfilesResult> => {
      if (!input || typeof input !== "object") {
        return {
          ok: false,
          errorCode: "invalid_input",
          errorMessage: "Expected a model profile config object",
        };
      }
      if (!isValidProviderId(input.id)) {
        return {
          ok: false,
          errorCode: "invalid_input",
          errorMessage: `Unknown provider id: ${String(input.id)}`,
        };
      }
      const result = await setProviderModelProfiles(input);
      if (!result.ok) {
        return result;
      }
      await initProviderRegistry();
      const info = listProviders().find((p) => p.id === input.id) ?? null;
      if (!info) {
        return {
          ok: false,
          errorCode: "write_failed",
          errorMessage:
            "Models persisted but registry refresh did not find provider",
        };
      }
      return { ok: true, config: info };
    },
  );

  ipcMain.handle(
    RUNTIME_CHANNELS.deleteProviderConfig,
    async (_event, id: ProviderId): Promise<{ ok: boolean }> => {
      if (!isValidProviderId(id)) {
        return { ok: false };
      }
      const result = await deleteProviderConfig(id);
      await initProviderRegistry();
      return result;
    },
  );

  ipcMain.handle(
    RUNTIME_CHANNELS.sendMessage,
    async (
      _event,
      input: OrchestratorMessageInput,
    ): Promise<OrchestratorMessageResult> => {
      if (!input || typeof input !== "object") {
        return {
          ok: false,
          errorCode: "invalid_input",
          errorMessage: "Expected an object",
        };
      }
      if (typeof input.text !== "string" || input.text.trim().length === 0) {
        return {
          ok: false,
          errorCode: "invalid_input",
          errorMessage: "'text' must be a non-empty string",
        };
      }
      return handleUserMessage(input);
    },
  );

  ipcMain.handle(
    RUNTIME_CHANNELS.openReportWindow,
    async (_event, report: RuntimeAuditReport): Promise<{ ok: boolean }> => {
      return openReportWindow(report);
    },
  );

  ipcMain.handle(
    RUNTIME_CHANNELS.closeReportWindow,
    async (): Promise<{ ok: boolean }> => {
      return closeReportWindow();
    },
  );

  ipcMain.handle(
    RUNTIME_CHANNELS.showReportWindowProcessing,
    async (): Promise<{ ok: boolean }> => {
      return showReportWindowProcessing();
    },
  );

  ipcMain.handle(
    RUNTIME_CHANNELS.endReportWindowSession,
    async (): Promise<{ ok: boolean }> => {
      return endReportWindowSession();
    },
  );

  ipcMain.handle(
    RUNTIME_CHANNELS.copyArticleSourceText,
    async (
      _event,
      report: RuntimeAuditReport,
    ): Promise<{ ok: boolean; charCount?: number; error?: string }> => {
      return copyArticleSourceText(report);
    },
  );

  ipcMain.handle(
    RUNTIME_CHANNELS.exportReportPdf,
    async (
      _event,
      report: RuntimeAuditReport,
    ): Promise<{ ok: boolean; filePath?: string; error?: string }> => {
      return exportReportPdf(report);
    },
  );

  ipcMain.handle(
    RUNTIME_CHANNELS.exportReportDocument,
    async (
      _event,
      report: RuntimeAuditReport,
    ): Promise<{ ok: boolean; filePath?: string; error?: string }> => {
      return exportReportDocument(report);
    },
  );

  ipcMain.handle(
    RUNTIME_CHANNELS.exportReportPresentation,
    async (
      _event,
      report: RuntimeAuditReport,
    ): Promise<{ ok: boolean; filePath?: string; error?: string }> => {
      return exportReportPresentation(report);
    },
  );

  ipcMain.handle(
    RUNTIME_CHANNELS.testProviderConnection,
    async (
      _event,
      providerId: ProviderId,
      locale: "en" | "ru",
      modelOverride?: string,
    ): Promise<ProviderConnectionTestResult> => {
      if (!isValidProviderId(providerId)) {
        return {
          ok: false,
          providerId,
          errorCode: "invalid_provider",
          errorMessage: "Unknown provider id.",
        };
      }
      return testProviderConnection(providerId, locale, modelOverride);
    },
  );

  ipcMain.handle(
    RUNTIME_CHANNELS.openChatWindow,
    async (
      _event,
      session: RuntimeChatWindowSession,
    ): Promise<{ ok: boolean }> => {
      return openChatWindow(session);
    },
  );

  ipcMain.handle(
    RUNTIME_CHANNELS.updateChatWindowSession,
    async (
      _event,
      session: RuntimeChatWindowSession,
    ): Promise<{ ok: boolean }> => {
      return updateChatWindowSession(session);
    },
  );

  ipcMain.handle(
    RUNTIME_CHANNELS.endChatWindowSession,
    async (): Promise<{ ok: boolean }> => {
      return endChatWindowSession();
    },
  );

  ipcMain.handle(
    RUNTIME_CHANNELS.closeChatWindow,
    async (): Promise<{ ok: boolean }> => {
      return closeChatWindow();
    },
  );

  ipcMain.handle(
    CHAT_WINDOW_CHANNELS.getSession,
    async (): Promise<RuntimeChatWindowSession> => {
      return getChatWindowSession();
    },
  );

  log.info(
    `[runtime] IPC handlers registered (enabled=${isNativeRuntimeEnabled()})`,
  );
}
