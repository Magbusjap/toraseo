/**
 * Provider config store — encrypted persistence of LLM provider
 * credentials.
 *
 * Storage:
 *   - Path: `userData/runtime-providers.json`
 *   - Format: JSON object keyed by provider id
 *   - API keys are encrypted via Electron's `safeStorage` (DPAPI on
 *     Windows, Keychain on macOS, libsecret on Linux). The raw key
 *     never lives on disk.
 *
 * Renderer surface:
 *   - Returns `ProviderConfigPublic` only — the raw key is stripped
 *     and replaced with a `lastFour` digest for UI hints. This means
 *     a compromised renderer cannot exfiltrate the key.
 *
 * Failure handling:
 *   - safeStorage unavailable → store rejects writes, IPC reports
 *     `encryption_unavailable` so the UI can prompt the user.
 *   - Disk write failure → atomic temp+rename pattern means partial
 *     writes never corrupt the file; a write error returns `ok=false`.
 *   - Decrypt failure on read → the entry is treated as missing
 *     (likely OS keychain reset); UI sees `configured=false`.
 */

import { app, safeStorage } from "electron";
import { promises as fs } from "node:fs";
import path from "node:path";
import log from "electron-log";

import type {
  ProviderId,
  ProviderModelProfile,
} from "../../src/types/runtime.js";

const STORE_FILE_NAME = "runtime-providers.json";
const SCHEMA_VERSION = 2 as const;
const LEGACY_SCHEMA_VERSION = 1 as const;
const MAX_MODEL_PROFILES = 20;

interface PersistedEntry {
  /** Base64 of safeStorage.encryptString(apiKey). */
  encryptedApiKey: string;
  /** Optional override of provider's default endpoint. */
  baseUrl?: string;
  /** Legacy optional default model id from schema v1. */
  defaultModel?: string;
  /** User-saved model choices under this provider. */
  modelProfiles?: ProviderModelProfile[];
  /** ID of the model profile used by default in the UI/runtime. */
  defaultModelProfileId?: string;
  /** Last 4 visible chars of the API key (UI hint). */
  lastFour: string;
}

interface PersistedFile {
  schemaVersion: typeof SCHEMA_VERSION;
  providers: Partial<Record<ProviderId, PersistedEntry>>;
}

interface LegacyPersistedFile {
  schemaVersion: typeof LEGACY_SCHEMA_VERSION;
  providers: Partial<Record<ProviderId, PersistedEntry>>;
}

/**
 * Public view returned to the renderer. Never includes the raw or
 * encrypted key.
 */
export interface ProviderConfigPublic {
  id: ProviderId;
  configured: boolean;
  baseUrl: string | null;
  defaultModel: string | null;
  defaultModelProfileId: string | null;
  modelProfiles: ProviderModelProfile[];
  /** Last 4 chars of the stored API key, or null when not configured. */
  lastFour: string | null;
}

/**
 * Internal view used by the registry — includes the decrypted key.
 * Stays in main process; never crosses an IPC boundary.
 */
export interface ProviderConfigInternal {
  id: ProviderId;
  apiKey: string;
  baseUrl?: string;
  defaultModel?: string;
  modelProfiles: ProviderModelProfile[];
  defaultModelProfileId: string | null;
}

function storeFile(): string {
  return path.join(app.getPath("userData"), STORE_FILE_NAME);
}

function emptyFile(): PersistedFile {
  return { schemaVersion: SCHEMA_VERSION, providers: {} };
}

async function readPersisted(): Promise<PersistedFile> {
  try {
    const raw = await fs.readFile(storeFile(), "utf-8");
    const parsed = JSON.parse(raw) as PersistedFile | LegacyPersistedFile;
    if (parsed.schemaVersion === LEGACY_SCHEMA_VERSION) {
      return migrateLegacyFile(parsed);
    }
    if (parsed.schemaVersion !== SCHEMA_VERSION) {
      log.warn(
        `[runtime/store] schema mismatch (${parsed.schemaVersion}), treating as empty`,
      );
      return emptyFile();
    }
    return normaliseFile(parsed);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") {
      log.warn(`[runtime/store] read failed: ${(err as Error).message}`);
    }
    return emptyFile();
  }
}

function makeProfileId(value: string, existing: Set<string>): string {
  const base =
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "model";
  let candidate = base;
  let suffix = 2;
  while (existing.has(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  existing.add(candidate);
  return candidate;
}

function sanitiseModelProfiles(
  profiles: ProviderModelProfile[] | undefined,
  legacyDefaultModel?: string,
): {
  modelProfiles: ProviderModelProfile[];
  defaultModelProfileId: string | null;
} {
  const source =
    profiles && profiles.length > 0
      ? profiles
      : legacyDefaultModel
        ? [
            {
              id: "default",
              displayName: legacyDefaultModel,
              modelId: legacyDefaultModel,
              usageHint: "Default",
            },
          ]
        : [];
  const seen = new Set<string>();
  const modelProfiles = source
    .map((profile) => {
      const modelId = profile.modelId?.trim();
      if (!modelId) return null;
      const displayName = profile.displayName?.trim() || modelId;
      const id = profile.id?.trim()
        ? makeProfileId(profile.id, seen)
        : makeProfileId(modelId, seen);
      const usageHint = profile.usageHint?.trim();
      return {
        id,
        displayName: displayName.slice(0, 80),
        modelId: modelId.slice(0, 160),
        usageHint: usageHint ? usageHint.slice(0, 120) : undefined,
      } satisfies ProviderModelProfile;
    })
    .filter((profile): profile is ProviderModelProfile => Boolean(profile))
    .slice(0, MAX_MODEL_PROFILES);

  return {
    modelProfiles,
    defaultModelProfileId: modelProfiles[0]?.id ?? null,
  };
}

function resolveDefaultProfileId(
  modelProfiles: ProviderModelProfile[],
  requested?: string | null,
): string | null {
  if (requested && modelProfiles.some((profile) => profile.id === requested)) {
    return requested;
  }
  return modelProfiles[0]?.id ?? null;
}

function getDefaultModel(
  entry: PersistedEntry | undefined,
): string | null {
  if (!entry) return null;
  const modelProfiles = entry.modelProfiles ?? [];
  const defaultId = resolveDefaultProfileId(
    modelProfiles,
    entry.defaultModelProfileId,
  );
  return (
    modelProfiles.find((profile) => profile.id === defaultId)?.modelId ??
    entry.defaultModel ??
    null
  );
}

function normaliseEntry(entry: PersistedEntry): PersistedEntry {
  const { modelProfiles, defaultModelProfileId } = sanitiseModelProfiles(
    entry.modelProfiles,
    entry.defaultModel,
  );
  return {
    ...entry,
    defaultModel: getDefaultModel({
      ...entry,
      modelProfiles,
      defaultModelProfileId: resolveDefaultProfileId(
        modelProfiles,
        entry.defaultModelProfileId ?? defaultModelProfileId,
      ) ?? undefined,
    }) ?? undefined,
    modelProfiles,
    defaultModelProfileId:
      resolveDefaultProfileId(
        modelProfiles,
        entry.defaultModelProfileId ?? defaultModelProfileId,
      ) ?? undefined,
  };
}

function normaliseFile(file: PersistedFile): PersistedFile {
  const providers: PersistedFile["providers"] = {};
  for (const [id, entry] of Object.entries(file.providers)) {
    if (entry) {
      providers[id as ProviderId] = normaliseEntry(entry);
    }
  }
  return { schemaVersion: SCHEMA_VERSION, providers };
}

function migrateLegacyFile(file: LegacyPersistedFile): PersistedFile {
  return normaliseFile({
    schemaVersion: SCHEMA_VERSION,
    providers: file.providers,
  });
}

async function writeAtomic(file: PersistedFile): Promise<void> {
  const target = storeFile();
  const tmp = target + ".tmp";
  await fs.writeFile(tmp, JSON.stringify(file, null, 2), "utf-8");
  await fs.rename(tmp, target);
}

function maskLastFour(apiKey: string): string {
  const trimmed = apiKey.trim();
  if (trimmed.length <= 4) return trimmed;
  return trimmed.slice(-4);
}

function validateOptionalUrl(value?: string): boolean {
  if (!value) return true;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function looksLikeUrl(value: string): boolean {
  return /^https?:\/\//i.test(value.trim());
}

function looksLikeOpenRouterKey(value: string): boolean {
  return /^sk-or-/i.test(value.trim());
}

/**
 * True when the platform supports key encryption. On most desktops
 * this is unconditionally true; on Linux without a configured
 * keyring, Electron returns false and we refuse to persist rather
 * than silently storing the key in plaintext.
 */
export function isEncryptionAvailable(): boolean {
  try {
    return safeStorage.isEncryptionAvailable();
  } catch (err) {
    log.warn(
      `[runtime/store] safeStorage probe failed: ${(err as Error).message}`,
    );
    return false;
  }
}

/**
 * Persist a provider config. Returns the public view (no key) on
 * success, or a structured error code the IPC layer surfaces to UI.
 */
export async function setProviderConfig(input: {
  id: ProviderId;
  apiKey: string;
  baseUrl?: string;
  defaultModel?: string;
  modelProfiles?: ProviderModelProfile[];
  defaultModelProfileId?: string | null;
}): Promise<
  | { ok: true; config: ProviderConfigPublic }
  | { ok: false; errorCode: "encryption_unavailable" | "invalid_input" | "write_failed"; errorMessage: string }
> {
  if (!input.id) {
    return {
      ok: false,
      errorCode: "invalid_input",
      errorMessage: "Provider id is required",
    };
  }
  const file = await readPersisted();
  const existing = file.providers[input.id];
  const apiKey = input.apiKey?.trim() ?? "";
  if (!apiKey && !existing?.encryptedApiKey) {
    return {
      ok: false,
      errorCode: "invalid_input",
      errorMessage: "API key must be a non-empty string",
    };
  }
  if (apiKey && looksLikeUrl(apiKey)) {
    return {
      ok: false,
      errorCode: "invalid_input",
      errorMessage: "API key must be a secret key, not a URL",
    };
  }
  if (apiKey && input.id === "openrouter" && !looksLikeOpenRouterKey(apiKey)) {
    return {
      ok: false,
      errorCode: "invalid_input",
      errorMessage:
        "OpenRouter API keys usually start with sk-or-. Paste the key from OpenRouter Keys, not a model ID.",
    };
  }
  const baseUrl = input.baseUrl?.trim() || undefined;
  const defaultModel = input.defaultModel?.trim() || undefined;
  if (!validateOptionalUrl(baseUrl)) {
    return {
      ok: false,
      errorCode: "invalid_input",
      errorMessage: "Custom endpoint URL must be a valid http(s) URL",
    };
  }
  if (defaultModel && defaultModel.length > 160) {
    return {
      ok: false,
      errorCode: "invalid_input",
      errorMessage: "Default model is too long",
    };
  }
  if (!isEncryptionAvailable()) {
    return {
      ok: false,
      errorCode: "encryption_unavailable",
      errorMessage:
        "OS-level encryption (safeStorage) is unavailable. On Linux, ensure a keyring is configured.",
    };
  }

  let encryptedApiKey = existing?.encryptedApiKey;
  let lastFour = existing?.lastFour;
  if (apiKey) {
    try {
      const buf = safeStorage.encryptString(apiKey);
      encryptedApiKey = buf.toString("base64");
      lastFour = maskLastFour(apiKey);
    } catch (err) {
      return {
        ok: false,
        errorCode: "write_failed",
        errorMessage: `Encryption failed: ${(err as Error).message}`,
      };
    }
  }
  if (!encryptedApiKey || !lastFour) {
    return {
      ok: false,
      errorCode: "invalid_input",
      errorMessage: "API key must be a non-empty string",
    };
  }
  const profileSource =
    input.modelProfiles ?? existing?.modelProfiles ?? undefined;
  const { modelProfiles, defaultModelProfileId } = sanitiseModelProfiles(
    profileSource,
    defaultModel ?? existing?.defaultModel,
  );
  const resolvedDefaultProfileId = resolveDefaultProfileId(
    modelProfiles,
    input.defaultModelProfileId ?? existing?.defaultModelProfileId,
  );
  const resolvedDefaultModel =
    modelProfiles.find((profile) => profile.id === resolvedDefaultProfileId)
      ?.modelId ??
    defaultModel ??
    undefined;
  const entry: PersistedEntry = {
    encryptedApiKey,
    baseUrl,
    defaultModel: resolvedDefaultModel,
    modelProfiles,
    defaultModelProfileId: resolvedDefaultProfileId ?? undefined,
    lastFour,
  };
  file.providers[input.id] = entry;

  try {
    await writeAtomic(file);
  } catch (err) {
    return {
      ok: false,
      errorCode: "write_failed",
      errorMessage: `Disk write failed: ${(err as Error).message}`,
    };
  }

  return {
    ok: true,
    config: {
      id: input.id,
      configured: true,
      baseUrl: entry.baseUrl ?? null,
      defaultModel: getDefaultModel(entry),
      defaultModelProfileId: entry.defaultModelProfileId ?? null,
      modelProfiles: entry.modelProfiles ?? [],
      lastFour: entry.lastFour,
    },
  };
}

export async function setProviderModelProfiles(input: {
  id: ProviderId;
  modelProfiles: ProviderModelProfile[];
  defaultModelProfileId: string | null;
}): Promise<
  | { ok: true; config: ProviderConfigPublic }
  | {
      ok: false;
      errorCode: "provider_not_configured" | "invalid_input" | "write_failed";
      errorMessage: string;
    }
> {
  const file = await readPersisted();
  const entry = file.providers[input.id];
  if (!entry?.encryptedApiKey) {
    return {
      ok: false,
      errorCode: "provider_not_configured",
      errorMessage: "Provider must be configured before adding models.",
    };
  }
  const { modelProfiles } = sanitiseModelProfiles(input.modelProfiles);
  if (modelProfiles.length === 0) {
    return {
      ok: false,
      errorCode: "invalid_input",
      errorMessage: "Add at least one model profile.",
    };
  }
  const defaultModelProfileId =
    resolveDefaultProfileId(modelProfiles, input.defaultModelProfileId) ??
    modelProfiles[0].id;
  const defaultModel =
    modelProfiles.find((profile) => profile.id === defaultModelProfileId)
      ?.modelId ?? modelProfiles[0].modelId;

  const nextEntry: PersistedEntry = {
    ...entry,
    defaultModel,
    modelProfiles,
    defaultModelProfileId,
  };
  file.providers[input.id] = nextEntry;

  try {
    await writeAtomic(file);
  } catch (err) {
    return {
      ok: false,
      errorCode: "write_failed",
      errorMessage: `Disk write failed: ${(err as Error).message}`,
    };
  }

  return {
    ok: true,
    config: {
      id: input.id,
      configured: true,
      baseUrl: nextEntry.baseUrl ?? null,
      defaultModel: getDefaultModel(nextEntry),
      defaultModelProfileId,
      modelProfiles,
      lastFour: nextEntry.lastFour,
    },
  };
}

/**
 * Remove a provider config. No-op when missing.
 */
export async function deleteProviderConfig(
  id: ProviderId,
): Promise<{ ok: boolean }> {
  const file = await readPersisted();
  if (!file.providers[id]) {
    return { ok: true };
  }
  delete file.providers[id];
  try {
    await writeAtomic(file);
    return { ok: true };
  } catch (err) {
    log.warn(
      `[runtime/store] delete write failed: ${(err as Error).message}`,
    );
    return { ok: false };
  }
}

/**
 * List configured providers as a renderer-safe view.
 */
export async function listProviderConfigs(): Promise<ProviderConfigPublic[]> {
  const file = await readPersisted();
  return Object.entries(file.providers).map(([id, entry]) => ({
    id: id as ProviderId,
    configured: Boolean(entry?.encryptedApiKey),
    baseUrl: entry?.baseUrl ?? null,
    defaultModel: getDefaultModel(entry),
    defaultModelProfileId: entry?.defaultModelProfileId ?? null,
    modelProfiles: entry?.modelProfiles ?? [],
    lastFour: entry?.lastFour ?? null,
  }));
}

/**
 * Public view of a single provider, or null if not configured.
 */
export async function getProviderConfigPublic(
  id: ProviderId,
): Promise<ProviderConfigPublic | null> {
  const file = await readPersisted();
  const entry = file.providers[id];
  if (!entry) return null;
  return {
    id,
    configured: Boolean(entry.encryptedApiKey),
    baseUrl: entry.baseUrl ?? null,
    defaultModel: getDefaultModel(entry),
    defaultModelProfileId: entry.defaultModelProfileId ?? null,
    modelProfiles: entry.modelProfiles ?? [],
    lastFour: entry.lastFour ?? null,
  };
}

/**
 * Internal accessor used by the registry to bootstrap adapters.
 * Decrypts the key on demand. Returns null when the entry is
 * missing OR decryption fails (e.g. keychain reset).
 */
export async function getProviderConfigInternal(
  id: ProviderId,
): Promise<ProviderConfigInternal | null> {
  const file = await readPersisted();
  const entry = file.providers[id];
  if (!entry) return null;
  if (!isEncryptionAvailable()) return null;

  let apiKey: string;
  try {
    const buf = Buffer.from(entry.encryptedApiKey, "base64");
    apiKey = safeStorage.decryptString(buf);
  } catch (err) {
    log.warn(
      `[runtime/store] decrypt failed for ${id}: ${(err as Error).message}`,
    );
    return null;
  }
  return {
    id,
    apiKey,
    baseUrl: entry.baseUrl,
    defaultModel: getDefaultModel(entry) ?? undefined,
    modelProfiles: entry.modelProfiles ?? [],
    defaultModelProfileId: entry.defaultModelProfileId ?? null,
  };
}
