/**
 * MCP-side state-file management.
 *
 * Mirrors the App's `app/electron/bridge/stateFile.ts` but without
 * Electron dependencies — the MCP server runs as a child process
 * spawned by Claude Desktop, with no `app.getPath("userData")`
 * available. We resolve the same userData path manually using
 * platform-specific environment variables and conventions.
 *
 * Both sides MUST resolve to the exact same path. If they diverge
 * (e.g. wrong product name capitalization), App will create the
 * file at one location and MCP will read from another — silently
 * failing every scan. The path-resolution logic here is verified
 * against APP_PRODUCT_NAME from constants.ts.
 *
 * Operations supported:
 *   - readState():  read current-scan.json, null if missing/stale
 *   - writeState(): atomic write via tmp + rename
 *   - mutateBuffer(): read-modify-write helper for tools that
 *     update their own slot in buffer (the common case)
 */

import { promises as fs } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

import {
  APP_PRODUCT_NAME,
  STATE_FILE_SCHEMA_VERSION,
} from "./constants.js";

// =====================================================================
// Types
// =====================================================================

/**
 * Mirror of CurrentScanState from app/src/types/ipc.ts.
 *
 * Kept as a separate definition to avoid creating a runtime
 * dependency from MCP to App's TypeScript. Schema is identical;
 * if App's interface changes, this file must update too.
 */
export type BridgeScanStatus =
  | "awaiting_handshake"
  | "in_progress"
  | "complete"
  | "cancelled"
  | "error";

export type HandshakeStatus =
  | "pending"
  | "verified"
  | "mismatch"
  | "timeout";

export interface ToolBufferEntry {
  status: "running" | "complete" | "error";
  startedAt: string;
  completedAt: string | null;
  verdict?: "ok" | "warning" | "critical";
  data?: unknown;
  summary?: {
    critical: number;
    warning: number;
    info: number;
  };
  errorCode?: string;
  errorMessage?: string;
}

export interface BridgeHandshake {
  expectedToken: string;
  receivedToken: string | null;
  status: HandshakeStatus;
  verifiedAt: string | null;
}

export interface BridgeScanError {
  code: string;
  message: string;
}

export interface CurrentScanState {
  schemaVersion: 1;
  scanId: string;
  status: BridgeScanStatus;
  url: string;
  createdAt: string;
  finishedAt: string | null;
  selectedTools: string[];
  handshake: BridgeHandshake;
  buffer: Record<string, ToolBufferEntry>;
  error: BridgeScanError | null;
}

// =====================================================================
// Path resolution
// =====================================================================

/**
 * Resolve the user's app-data directory(ies) for ToraSEO. Returns a
 * list of candidate paths to try in order — the first one that
 * contains a state-file wins.
 *
 * Why a list instead of a single path: Electron uses different
 * directory names depending on how the app is launched:
 *
 *   Production (installer):  %APPDATA%\ToraSEO\           (productName)
 *   Dev (`npm run dev`):     %APPDATA%\@toraseo\app\      (package.json name)
 *
 * The two are mutually exclusive on a single machine in normal use,
 * but a developer running `npm run dev` against a machine that also
 * has the production app installed could trip the wrong path. By
 * trying both, MCP works in dev and prod without any environment
 * detection.
 *
 * Path derivation per platform follows Electron's app.getPath
 * ("userData") logic:
 *   Windows: %APPDATA%\<dirName>
 *   macOS:   ~/Library/Application Support/<dirName>
 *   Linux:   ~/.config/<dirName>     (XDG_CONFIG_HOME if set)
 *
 * The dirName is what differs: prod gets "ToraSEO", dev gets the
 * package.json name with the `@scope/` slash kept (so on Windows it
 * becomes a `@toraseo\app` two-level subfolder, since backslash and
 * forward slash are equivalent in Windows path APIs).
 */
function userDataDirs(): string[] {
  const product = APP_PRODUCT_NAME;
  // Dev-mode dir: derived from package.json `name` field
  // "@toraseo/app". Electron joins this directly into the userData
  // path; on Windows the forward slash becomes a directory separator,
  // so it produces a nested `@toraseo\app` folder.
  const devSegments = ["@toraseo", "app"];

  switch (process.platform) {
    case "win32": {
      const appdata =
        process.env.APPDATA ??
        path.join(homedir(), "AppData", "Roaming");
      return [
        path.join(appdata, product),
        path.join(appdata, ...devSegments),
      ];
    }
    case "darwin": {
      const base = path.join(homedir(), "Library", "Application Support");
      return [
        path.join(base, product),
        path.join(base, ...devSegments),
      ];
    }
    default: {
      const base = process.env.XDG_CONFIG_HOME ?? path.join(homedir(), ".config");
      return [
        path.join(base, product),
        path.join(base, ...devSegments),
      ];
    }
  }
}

/**
 * Find the active state-file. Tries each candidate userData dir in
 * order; returns the first one that exists, or null if none do.
 *
 * The result is cached for the lifetime of this MCP process — once
 * we know which userData dir the App is writing to, we don't need
 * to probe again. Cache invalidates on null result (file might appear
 * later when App starts a scan).
 */
let cachedStateFilePath: string | null = null;

async function findStateFilePath(): Promise<string | null> {
  if (cachedStateFilePath) {
    // Verify cached path still has a file. If the App was uninstalled
    // or moved, the cache is stale and we should rediscover.
    try {
      await fs.access(cachedStateFilePath);
      return cachedStateFilePath;
    } catch {
      cachedStateFilePath = null;
    }
  }

  const dirs = userDataDirs();
  process.stderr.write(
    `[bridge:stateFile] searching candidates: ${dirs.join(" | ")}\n`,
  );
  for (const dir of dirs) {
    const candidate = path.join(dir, "current-scan.json");
    try {
      await fs.access(candidate);
      cachedStateFilePath = candidate;
      process.stderr.write(
        `[bridge:stateFile] found state file at: ${candidate}\n`,
      );
      return candidate;
    } catch {
      // File doesn't exist at this candidate — try next.
    }
  }
  process.stderr.write(
    `[bridge:stateFile] no state file in any candidate dir\n`,
  );
  return null;
}

/**
 * Resolve the path where MCP should WRITE the state-file. This is
 * trickier than reading: when App hasn't created a file yet, we
 * have no way to know which userData dir it would use. In practice
 * MCP only writes to the file when there's an active scan (which
 * means App created the file and we already discovered its dir),
 * so we use the cached discovery.
 *
 * If write is called when no file has been discovered (shouldn't
 * happen in normal flow — verify_skill_loaded reads first), default
 * to the production path so we don't silently lose data in a
 * non-standard location.
 */
async function writeStateFilePath(): Promise<string> {
  const found = await findStateFilePath();
  if (found) return found;
  const dirs = userDataDirs();
  // dirs always returns at least one entry per the switch in
  // userDataDirs, but TS doesn't infer that — fallback explicitly.
  const fallback = dirs[0] ?? path.join(homedir(), "AppData", "Roaming", APP_PRODUCT_NAME);
  return path.join(fallback, "current-scan.json");
}

/** Absolute path to the active scan-state file. Public for diagnostics. */
export function stateFilePath(): string {
  // Synchronous version for compatibility — uses cache if available,
  // else falls back to production path. Most callers should use
  // findStateFilePath() / writeStateFilePath() instead.
  if (cachedStateFilePath) return cachedStateFilePath;
  const dirs = userDataDirs();
  const fallback = dirs[0] ?? path.join(homedir(), "AppData", "Roaming", APP_PRODUCT_NAME);
  return path.join(fallback, "current-scan.json");
}

// =====================================================================
// Read / write
// =====================================================================

/**
 * Read current scan state. Returns null when:
 *   - file doesn't exist (no active scan)
 *   - JSON parse fails (likely a partial write — caller can
 *     retry on next call)
 *   - schemaVersion mismatch (stale file from old App version)
 *
 * Errors are not thrown — null signals "no active scan", which
 * is the same as "file missing" to the caller. This keeps tools
 * working in legacy mode (no App running) without try/catch
 * around every read.
 */
export async function readState(): Promise<CurrentScanState | null> {
  const filePath = await findStateFilePath();
  if (!filePath) return null;

  let raw: string;
  try {
    raw = await fs.readFile(filePath, "utf-8");
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      // File disappeared between findStateFilePath and readFile.
      // Invalidate cache so next call rediscovers.
      cachedStateFilePath = null;
      return null;
    }
    // Other errors (permission denied, IO error) — log to stderr
    // for diagnostics, return null so MCP can fall back.
    process.stderr.write(
      `[bridge:stateFile] read failed (${code ?? "unknown"})\n`,
    );
    return null;
  }

  let parsed: CurrentScanState;
  try {
    parsed = JSON.parse(raw) as CurrentScanState;
  } catch {
    // Partial write caught mid-rename. Retry on next call.
    return null;
  }

  if (parsed.schemaVersion !== STATE_FILE_SCHEMA_VERSION) {
    process.stderr.write(
      `[bridge:stateFile] schema mismatch (file=${parsed.schemaVersion} expected=${STATE_FILE_SCHEMA_VERSION})\n`,
    );
    return null;
  }

  return parsed;
}

/**
 * Atomic write: serialize, write to a tmp file, rename over the
 * target. Same algorithm as App's writeState. The tmp file uses
 * a per-process suffix so concurrent writers from MCP (multiple
 * tool calls in parallel) don't clobber each other's tmp file.
 */
export async function writeState(state: CurrentScanState): Promise<void> {
  const target = await writeStateFilePath();
  const tmp = `${target}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(state, null, 2), "utf-8");
  await fs.rename(tmp, target);
}

// =====================================================================
// Buffer mutation helper
// =====================================================================

/**
 * Read the current state, apply a per-tool mutation, write back.
 * The common pattern for analysis tools: "mark myself running",
 * then later "mark myself complete with these results".
 *
 * Returns the new state, or null if there's no active scan
 * (caller treats this as the legacy-mode signal — fall back to
 * returning data directly to Claude in chat).
 *
 * The mutation function is called with a deep-cloned copy of
 * state so the caller can mutate freely; we serialize the result
 * back to disk.
 *
 * Concurrency note: read-modify-write with no locking. Two tools
 * writing to *different* buffer slots in parallel is fine because
 * each one only touches its own key. Two tools writing to the
 * *same* slot is a logical bug (a tool calling itself twice) —
 * out of scope.
 *
 * The race window where Tool A reads, Tool B reads (same data),
 * Tool A writes (its slot), Tool B writes (its slot, but missing
 * Tool A's write) is real but narrow. In practice MCP serializes
 * tool calls through the JSON-RPC request loop, so two MCP tools
 * never run simultaneously inside one server. This makes the
 * race effectively impossible during a single scan.
 */
export async function mutateBuffer(
  toolId: string,
  mutator: (current: ToolBufferEntry | undefined) => ToolBufferEntry,
): Promise<CurrentScanState | null> {
  const state = await readState();
  if (!state) return null;
  if (state.status !== "in_progress" && state.status !== "awaiting_handshake") {
    // Scan is already terminal (cancelled / complete / error).
    // No point writing buffer entries.
    return null;
  }

  const next: CurrentScanState = {
    ...state,
    buffer: {
      ...state.buffer,
      [toolId]: mutator(state.buffer[toolId]),
    },
  };

  // If this completion finishes all selected tools, transition
  // status to "complete" automatically. The lifecycle module on
  // the App side runs grace-period cleanup; MCP just signals
  // terminal status here.
  const allDone = state.selectedTools.every((tid) => {
    const entry = next.buffer[tid];
    return entry && (entry.status === "complete" || entry.status === "error");
  });
  if (allDone && state.status === "in_progress") {
    next.status = "complete";
    next.finishedAt = new Date().toISOString();
  }

  await writeState(next);
  return next;
}

// =====================================================================
// Handshake
// =====================================================================

/**
 * Apply a successful or failed handshake to the current scan.
 *
 * Returns the new state on success; null if there's no
 * awaiting_handshake scan to act on. The verify_skill_loaded
 * tool uses this; nothing else should call it directly.
 */
export async function applyHandshake(
  receivedToken: string,
  expectedToken: string,
): Promise<{ result: "verified" | "mismatch" | "no_scan"; state: CurrentScanState | null }> {
  const state = await readState();
  if (!state) return { result: "no_scan", state: null };
  if (state.status !== "awaiting_handshake") {
    return { result: "no_scan", state };
  }

  const now = new Date().toISOString();

  if (receivedToken !== expectedToken) {
    const next: CurrentScanState = {
      ...state,
      status: "error",
      finishedAt: now,
      handshake: {
        ...state.handshake,
        receivedToken,
        status: "mismatch",
      },
      error: {
        code: "handshake_mismatch",
        message: `Skill protocol token mismatch. Expected ${expectedToken}, got ${receivedToken}. The user likely has an outdated SKILL.md.`,
      },
    };
    await writeState(next);
    return { result: "mismatch", state: next };
  }

  const next: CurrentScanState = {
    ...state,
    status: "in_progress",
    handshake: {
      ...state.handshake,
      receivedToken,
      status: "verified",
      verifiedAt: now,
    },
  };
  await writeState(next);
  return { result: "verified", state: next };
}
