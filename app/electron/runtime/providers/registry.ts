/**
 * Provider registry — singleton map of installed adapters and the
 * lookup/list helpers the orchestrator + IPC layer use.
 *
 * Stage 2 changes:
 *   - Configs are loaded from the encrypted store (safeStorage) on
 *     init; the env var path remains as a dev override and is
 *     applied AFTER the store, so a developer with a key checked in
 *     to their shell still wins.
 *   - The registry keeps a snapshot of the public (key-less) info
 *     for each adapter so listProviders() includes lastFour without
 *     touching the store on every IPC call.
 */

import log from "electron-log";

import { OpenRouterAdapter } from "./openrouter.js";
import type { ProviderAdapter } from "./base.js";
import {
  getProviderConfigInternal,
  getProviderConfigPublic,
  type ProviderConfigPublic,
} from "../providerConfigStore.js";
import type {
  ProviderId,
  ProviderInfo,
} from "../../../src/types/runtime.js";

interface RegistryEntry {
      adapter: ProviderAdapter;
  /** Snapshot of last persisted public info (lastFour, defaultModel). */
  publicInfo: ProviderConfigPublic | null;
}

const adapters = new Map<ProviderId, RegistryEntry>();

/** Built-in provider definitions: id → label + factory. */
const BUILTINS: ReadonlyArray<{
  id: ProviderId;
  label: string;
  envKey: string;
  envBaseUrl: string;
  envModel: string;
  build: (config: {
    id: ProviderId;
    label: string;
    apiKey: string;
    baseUrl?: string;
    defaultModel?: string;
  }) => ProviderAdapter;
}> = [
  {
    id: "openrouter",
    label: "OpenRouter",
    envKey: "TORASEO_OPENROUTER_API_KEY",
    envBaseUrl: "TORASEO_OPENROUTER_BASE_URL",
    envModel: "TORASEO_OPENROUTER_DEFAULT_MODEL",
    build: (config) => new OpenRouterAdapter(config),
  },
  {
    id: "routerai",
    label: "RouterAI",
    envKey: "TORASEO_ROUTERAI_API_KEY",
    envBaseUrl: "TORASEO_ROUTERAI_BASE_URL",
    envModel: "TORASEO_ROUTERAI_DEFAULT_MODEL",
    build: (config) =>
      new OpenRouterAdapter(config, {
        id: "routerai",
        label: "RouterAI",
        defaultModel: "openai/gpt-4o",
        defaultBaseUrl: "https://routerai.ru/api/v1",
      }),
  },
];

async function tryRegister(builtin: (typeof BUILTINS)[number]): Promise<void> {
  const envKey = process.env[builtin.envKey]?.trim();

  // 1) Encrypted store is the baseline source of truth.
  const stored = await getProviderConfigInternal(builtin.id);
  if (stored?.apiKey) {
    try {
      const adapter = builtin.build({
        id: builtin.id,
        label: builtin.label,
        apiKey: stored.apiKey,
        baseUrl: stored.baseUrl,
        defaultModel: stored.defaultModel,
      });
      const publicInfo = await getProviderConfigPublic(builtin.id);
      adapters.set(builtin.id, { adapter, publicInfo });
      log.info(`[runtime] provider registered from store: ${builtin.id}`);
    } catch (err) {
      log.warn(
        `[runtime] provider ${builtin.id} init from store failed: ${(err as Error).message}`,
      );
    }
  }

  // 2) Env var override for dev workflows. Never written back to disk.
  if (envKey && envKey.length > 0) {
    try {
      const adapter = builtin.build({
        id: builtin.id,
        label: builtin.label,
        apiKey: envKey,
        baseUrl: process.env[builtin.envBaseUrl] ?? undefined,
        defaultModel: process.env[builtin.envModel] ?? undefined,
      });
      adapters.set(builtin.id, { adapter, publicInfo: null });
      log.info(`[runtime] provider registered from env: ${builtin.id}`);
    } catch (err) {
      log.warn(
        `[runtime] provider ${builtin.id} init from env failed: ${(err as Error).message}`,
      );
    }
  }
}

/**
 * Initialise the registry from persisted store + env vars.
 * Idempotent — clears and rebuilds on every call so the Settings
 * UI can trigger a refresh after writing/deleting a key.
 */
export async function initProviderRegistry(): Promise<void> {
  adapters.clear();
  for (const builtin of BUILTINS) {
    await tryRegister(builtin);
  }
}

/**
 * Get an adapter by id. Throws if not found — callers should
 * either catch or first verify availability via listProviders().
 */
export function getProvider(id: ProviderId): ProviderAdapter {
  const entry = adapters.get(id);
  if (!entry) {
    throw new Error(`Provider not registered: ${id}`);
  }
  return entry.adapter;
}

/**
 * Renderer-safe summary of installed providers. Includes lastFour
 * (UI hint) but never the API key itself.
 *
 * Note: providers configured purely via env var don't have a store
 * entry, so their lastFour is null even though configured=true.
 */
export function listProviders(): ProviderInfo[] {
  // Surface every BUILTIN, even if not registered, so the UI can
  // render an "Add API key" affordance for unconfigured ones.
  return BUILTINS.map((builtin): ProviderInfo => {
    const entry = adapters.get(builtin.id);
    if (!entry) {
      return {
        id: builtin.id,
        label: builtin.label,
        configured: false,
        baseUrl: null,
        defaultModel: null,
        defaultModelProfileId: null,
        modelProfiles: [],
        lastFour: null,
        capabilities: {
          streaming: false,
          toolCalls: false,
          structuredOutput: false,
        },
      };
    }
    return {
      id: entry.adapter.id,
      label: entry.adapter.label,
      configured: entry.adapter.isConfigured(),
      baseUrl: entry.publicInfo?.baseUrl ?? null,
      defaultModel: entry.publicInfo?.defaultModel ?? null,
      defaultModelProfileId: entry.publicInfo?.defaultModelProfileId ?? null,
      modelProfiles: entry.publicInfo?.modelProfiles ?? [],
      lastFour: entry.publicInfo?.lastFour ?? null,
      capabilities: entry.adapter.capabilities,
    };
  });
}
