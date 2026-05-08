/**
 * Bridge Mode state-file management.
 *
 * The state-file is a JSON document at `userData/current-scan.json`
 * that App and MCP both touch:
 *   - App creates it on Scan click (status=awaiting_handshake)
 *   - MCP reads/writes it as Claude calls verify_skill_loaded and
 *     subsequent analysis tools
 *   - App polls the file every POLL_INTERVAL_MS to render UI
 *   - App removes it on cancel / completion + 5s
 *
 * This module exposes:
 *   - read/write/remove primitives for the state-file
 *   - atomic write via tmp + rename (avoids partial reads)
 *   - polling watcher that emits state changes to a listener
 *
 * It does NOT manage the scan lifecycle (transitions, timeouts) —
 * that lives in `scanLifecycle.ts`. This file is the storage layer.
 */

import { app } from "electron";
import { promises as fs } from "node:fs";
import path from "node:path";
import log from "electron-log";

import type { CurrentScanState } from "../../src/types/ipc.js";

/**
 * How often the App polls the state-file for changes (ms).
 *
 * 500ms is the compromise: fast enough that tool results appear
 * "instantly" to the user, light enough that file I/O doesn't
 * dominate the event loop on idle.
 */
export const POLL_INTERVAL_MS = 500;

/**
 * Current schema version. Bumped on breaking changes to
 * CurrentScanState. Reads with mismatched schemaVersion are
 * treated as if the file doesn't exist (state-file is ephemeral,
 * a stale one from an old App version is safe to discard).
 */
export const STATE_FILE_SCHEMA_VERSION = 1;

function devSharedStateFilePath(): string | null {
  const explicit = process.env.TORASEO_BRIDGE_STATE_DIR?.trim();
  if (explicit) return path.join(explicit, "current-scan.json");
  if (app.isPackaged) return null;

  const cwd = process.cwd();
  const candidates = [
    path.resolve(cwd, "..", ".toraseo-bridge"),
    path.resolve(cwd, ".toraseo-bridge"),
  ];
  const repoLike = candidates.find((candidate) =>
    candidate.toLowerCase().includes(`${path.sep}toraseo${path.sep}`),
  );
  return path.join(repoLike ?? candidates[0], "current-scan.json");
}

/** Resolve the state-file path inside userData. */
export function stateFilePath(): string {
  const shared = devSharedStateFilePath();
  if (shared) return shared;
  return path.join(app.getPath("userData"), "current-scan.json");
}

/**
 * Read the current state. Returns null if:
 *   - the file doesn't exist
 *   - the file exists but JSON parse fails (likely partial write —
 *     caller will retry on next poll)
 *   - the schemaVersion doesn't match (stale file from old App)
 *
 * Errors from `fs` other than ENOENT are logged but still return
 * null — we don't want polling to crash the renderer subscription.
 */
export async function readState(): Promise<CurrentScanState | null> {
  const filePath = stateFilePath();
  let raw: string;
  try {
    raw = await fs.readFile(filePath, "utf-8");
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") {
      log.warn(
        `[bridge:stateFile] read failed (${code}): ${(err as Error).message}`,
      );
    }
    return null;
  }

  let parsed: CurrentScanState;
  try {
    parsed = JSON.parse(raw) as CurrentScanState;
  } catch (err) {
    // Likely a partial write caught mid-rename. Caller polls again
    // in POLL_INTERVAL_MS — silent retry.
    log.debug(
      `[bridge:stateFile] parse failed (likely transient): ${(err as Error).message}`,
    );
    return null;
  }

  if (parsed.schemaVersion !== STATE_FILE_SCHEMA_VERSION) {
    log.warn(
      `[bridge:stateFile] schemaVersion mismatch: file=${parsed.schemaVersion}, expected=${STATE_FILE_SCHEMA_VERSION}`,
    );
    return null;
  }

  return parsed;
}

/**
 * Write state atomically: serialize to a tmp file, then rename
 * over the target. `fs.rename` is atomic on POSIX and near-atomic
 * on Windows (ReplaceFile API). The window where a reader could
 * see partial JSON is reduced to a few microseconds.
 */
export async function writeState(state: CurrentScanState): Promise<void> {
  const filePath = stateFilePath();
  const tmpPath = filePath + ".tmp";
  const serialized = JSON.stringify(state, null, 2);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(tmpPath, serialized, "utf-8");
  await fs.rename(tmpPath, filePath);
}

/**
 * Delete the state-file if it exists. Used on cancel and on
 * completion (after a 5s grace period so the App's last poll
 * cycle can render the final state before the file disappears).
 *
 * ENOENT is silent — the file might already be gone (concurrent
 * cancel + complete). All other errors are logged.
 */
export async function removeState(): Promise<void> {
  const filePath = stateFilePath();
  try {
    await fs.unlink(filePath);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") {
      log.warn(
        `[bridge:stateFile] unlink failed (${code}): ${(err as Error).message}`,
      );
    }
  }
}

/**
 * Polling watcher. Calls `listener` immediately with the current
 * state (or null), then on every detected change.
 *
 * Change detection is by-value (deep comparison of serialized
 * JSON, not reference) — the file gets rewritten on every MCP
 * tool update and we don't want to miss those even if a key was
 * added without removing another.
 *
 * Returns an unsubscribe function that stops the polling timer.
 *
 * Multiple watchers are allowed (one per renderer subscription),
 * each gets its own timer. In practice there's one App window so
 * one watcher, but the code doesn't enforce singleton.
 */
export function watchState(
  listener: (state: CurrentScanState | null) => void,
): () => void {
  let lastSerialized: string | null = null;
  let stopped = false;

  const tick = async () => {
    if (stopped) return;
    try {
      const state = await readState();
      const serialized = state === null ? null : JSON.stringify(state);
      if (serialized !== lastSerialized) {
        lastSerialized = serialized;
        try {
          listener(state);
        } catch (err) {
          // Listener crashed — log but don't propagate; we want
          // to keep polling for other potential subscribers.
          log.error(
            `[bridge:stateFile] listener threw: ${(err as Error).message}`,
          );
        }
      }
    } catch (err) {
      log.error(
        `[bridge:stateFile] watcher tick failed: ${(err as Error).message}`,
      );
    }
  };

  // Fire once immediately so subscribers see initial state without
  // waiting POLL_INTERVAL_MS.
  void tick();

  const interval = setInterval(tick, POLL_INTERVAL_MS);

  return () => {
    stopped = true;
    clearInterval(interval);
  };
}
