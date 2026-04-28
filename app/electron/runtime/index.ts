/**
 * Native Runtime IPC setup.
 *
 * Registers three handlers under the `toraseo:runtime:*` namespace:
 *
 *   request: toraseo:runtime:is-enabled    → feature-flag readout
 *   request: toraseo:runtime:list-providers → registered providers
 *   request: toraseo:runtime:send-message  → orchestrator entry
 *
 * Stage 1 wiring only — no streaming channel yet, no real provider
 * calls. The setup runs once on app ready; teardown happens
 * implicitly when the process quits.
 */

import { ipcMain } from "electron";
import log from "electron-log";

import { handleUserMessage } from "./orchestrator.js";
import { initProviderRegistry, listProviders } from "./providers/registry.js";
import { isNativeRuntimeEnabled } from "./featureFlag.js";

import type {
  OrchestratorMessageInput,
  OrchestratorMessageResult,
  ProviderInfo,
} from "../../src/types/runtime.js";

export const RUNTIME_CHANNELS = {
  isEnabled: "toraseo:runtime:is-enabled",
  listProviders: "toraseo:runtime:list-providers",
  sendMessage: "toraseo:runtime:send-message",
} as const;

/**
 * Wire up IPC handlers and seed the provider registry. Call once
 * after `app.whenReady()` resolves. Safe to call exactly once;
 * additional invocations would re-register handlers and throw.
 */
export function setupRuntime(): void {
  initProviderRegistry();

  ipcMain.handle(
    RUNTIME_CHANNELS.isEnabled,
    async (): Promise<boolean> => {
      return isNativeRuntimeEnabled();
    },
  );

  ipcMain.handle(
    RUNTIME_CHANNELS.listProviders,
    async (): Promise<ProviderInfo[]> => {
      return listProviders();
    },
  );

  ipcMain.handle(
    RUNTIME_CHANNELS.sendMessage,
    async (
      _event,
      input: OrchestratorMessageInput,
    ): Promise<OrchestratorMessageResult> => {
      // Trust boundary: validate before passing into orchestrator.
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

  log.info(
    `[runtime] IPC handlers registered (enabled=${isNativeRuntimeEnabled()})`,
  );
}
