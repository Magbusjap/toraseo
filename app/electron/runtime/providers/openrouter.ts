/**
 * OpenRouter provider adapter.
 *
 * OpenRouter is the default provider for v0.0.7 native runtime
 * because it acts as a multi-LLM gateway: a single API key gives
 * access to OpenAI, Anthropic, Google, and many open-source
 * models. This lowers onboarding friction — the user adds one
 * key and immediately picks any compatible model.
 *
 * Stage 1 (skeleton): the adapter is wired end-to-end through
 * the registry and orchestrator, but `sendChat` returns a
 * placeholder response instead of calling the real API. Stage 2
 * replaces the placeholder with a fetch to
 * `https://openrouter.ai/api/v1/chat/completions`.
 *
 * Auth: `Authorization: Bearer <apiKey>` header. The API key is
 * stored encrypted in user data (Stage 2); never logged, never
 * sent to the renderer.
 */

import {
  DEFAULT_CAPABILITIES,
  validateProviderConfig,
  type ProviderAdapter,
  type ProviderChatRequest,
  type ProviderChatResponse,
} from "./base.js";
import type {
  ProviderCapabilities,
  ProviderConfig,
} from "../../../src/types/runtime.js";

const DEFAULT_MODEL = "openrouter/auto";

export class OpenRouterAdapter implements ProviderAdapter {
  public readonly id = "openrouter" as const;
  public readonly label = "OpenRouter";
  public readonly capabilities: ProviderCapabilities = {
    ...DEFAULT_CAPABILITIES,
    streaming: true,
    toolCalls: true,
  };

  private config: ProviderConfig;

  constructor(config: ProviderConfig) {
    const check = validateProviderConfig(config);
    if (!check.ok) {
      throw new Error(`openrouter adapter init failed: ${check.reason}`);
    }
    this.config = config;
  }

  isConfigured(): boolean {
    return this.config.apiKey.trim().length > 0;
  }

  /**
   * Stage 1 placeholder: returns a deterministic message instead
   * of calling the network. This lets us test the IPC pipeline,
   * UI rendering, and orchestrator wiring without the side
   * effect of real spend on the user's API budget.
   *
   * Stage 2 will replace this body with a real fetch and stream
   * adapter.
   */
  async sendChat(
    request: ProviderChatRequest,
  ): Promise<ProviderChatResponse> {
    if (!this.isConfigured()) {
      return {
        ok: false,
        errorCode: "provider_not_configured",
        errorMessage:
          "OpenRouter is not configured. Add an API key in Settings.",
      };
    }

    const model = request.modelOverride ?? this.config.defaultModel ?? DEFAULT_MODEL;

    return {
      ok: true,
      text: [
        "[native-runtime / openrouter — Stage 1 skeleton]",
        `mode: ${request.policy.mode}`,
        `locale: ${request.policy.locale}`,
        `model: ${model}`,
        "",
        "Real API call lands in Stage 2. The orchestrator and",
        "policy layer are wired correctly through this stub.",
        "",
        `User said: ${request.userText}`,
      ].join("\n"),
    };
  }
}
