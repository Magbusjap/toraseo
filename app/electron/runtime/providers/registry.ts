/**
 * Provider registry — keeps a singleton map of installed adapters
 * and exposes lookup/list helpers for the orchestrator + IPC layer.
 *
 * Stage 1 (skeleton): registry holds in-memory configs only. No
 * persistence yet. Configs come from environment variables for
 * dev convenience (`TORASEO_OPENROUTER_API_KEY`); Stage 2 will
 * replace this with a secure-store backed config manager that
 * survives app restart and never leaks keys to the renderer.
 */

import { OpenRouterAdapter } from "./openrouter.js";
import type { ProviderAdapter } from "./base.js";
import type {
  ProviderId,
  ProviderInfo,
} from "../../../src/types/runtime.js";

const adapters = new Map<ProviderId, ProviderAdapter>();

/**
 * Initialise the registry from current environment / future
 * persisted configs. Idempotent — safe to call multiple times.
 *
 * Stage 1: only OpenRouter is auto-registered (and only when an
 * env var is present so non-configured runs don't surface stub
 * adapters in the UI).
 */
export function initProviderRegistry(): void {
  adapters.clear();

  const openrouterKey = process.env.TORASEO_OPENROUTER_API_KEY;
  if (openrouterKey && openrouterKey.trim().length > 0) {
    try {
      adapters.set(
        "openrouter",
        new OpenRouterAdapter({
          id: "openrouter",
          label: "OpenRouter",
          apiKey: openrouterKey.trim(),
          baseUrl: process.env.TORASEO_OPENROUTER_BASE_URL ?? undefined,
          defaultModel:
            process.env.TORASEO_OPENROUTER_DEFAULT_MODEL ?? undefined,
        }),
      );
    } catch {
      // Bad config — skip registration; UI will see the provider
      // as not configured and prompt the user to fix it.
    }
  }
}

/**
 * Get an adapter by id. Throws if not found — callers should
 * either catch or first verify availability via listProviders().
 */
export function getProvider(id: ProviderId): ProviderAdapter {
  const adapter = adapters.get(id);
  if (!adapter) {
    throw new Error(`Provider not registered: ${id}`);
  }
  return adapter;
}

/**
 * Renderer-safe summary of installed providers. Never includes
 * API keys or other secrets — UI only needs ids, labels, and
 * capability flags.
 */
export function listProviders(): ProviderInfo[] {
  return Array.from(adapters.values()).map((adapter) => ({
    id: adapter.id,
    label: adapter.label,
    configured: adapter.isConfigured(),
    defaultModel: null,
    capabilities: adapter.capabilities,
  }));
}
