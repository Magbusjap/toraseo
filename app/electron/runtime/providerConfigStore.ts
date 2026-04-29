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

import type { ProviderId } from "../../src/types/runtime.js";

const STORE_FILE_NAME = "runtime-providers.json";
const SCHEMA_VERSION = 1 as const;

interface PersistedEntry {
  /** Base64 of safeStorage.encryptString(apiKey). */
  encryptedApiKey: string;
  /** Optional override of provider's default endpoint. */
  baseUrl?: string;
  /** Optional default model id sent when no per-call override given. */
  defaultModel?: string;
  /** Last 4 visible chars of the API key (UI hint). */
  lastFour: string;
}

interface PersistedFile {
  schemaVersion: typeof SCHEMA_VERSION;
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
    const parsed = JSON.parse(raw) as PersistedFile;
    if (parsed.schemaVersion !== SCHEMA_VERSION) {
      log.warn(
        `[runtime/store] schema mismatch (${parsed.schemaVersion}), treating as empty`,
      );
      return emptyFile();
    }
    return parsed;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") {
      log.warn(`[runtime/store] read failed: ${(err as Error).message}`);
    }
    return emptyFile();
  }
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
  const apiKey = input.apiKey?.trim();
  if (!apiKey) {
    return {
      ok: false,
      errorCode: "invalid_input",
      errorMessage: "API key must be a non-empty string",
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
  if (defaultModel && defaultModel.length > 120) {
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

  let encryptedApiKey: string;
  try {
    const buf = safeStorage.encryptString(apiKey);
    encryptedApiKey = buf.toString("base64");
  } catch (err) {
    return {
      ok: false,
      errorCode: "write_failed",
      errorMessage: `Encryption failed: ${(err as Error).message}`,
    };
  }

  const file = await readPersisted();
  const entry: PersistedEntry = {
    encryptedApiKey,
    baseUrl,
    defaultModel,
    lastFour: maskLastFour(apiKey),
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
      defaultModel: entry.defaultModel ?? null,
      lastFour: entry.lastFour,
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
    defaultModel: entry?.defaultModel ?? null,
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
    defaultModel: entry.defaultModel ?? null,
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
    defaultModel: entry.defaultModel,
  };
}
