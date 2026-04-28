/**
 * MCP-side alive-file reader.
 *
 * Mirrors the App's `app/electron/bridge/aliveFile.ts` write side.
 * App writes; MCP reads.
 *
 * The alive-file's purpose is to let MCP (and through MCP, Claude)
 * distinguish three coarse states:
 *
 *   - App not running       → no alive-file, or alive-file exists
 *                             but its PID is dead (stale lock)
 *   - App running, no scan  → alive-file present, current-scan.json
 *                             is missing
 *   - App running, scan     → alive-file present, current-scan.json
 *                             is in awaiting_handshake / in_progress
 *
 * Implementation details:
 *
 *   - Path discovery uses the SAME dual-candidate logic as
 *     stateFile.ts (production %APPDATA%\ToraSEO\ vs dev
 *     %APPDATA%\@toraseo\app\). When stateFile.ts has cached a
 *     working dir, alive-file uses the same dir.
 *   - PID-alive check uses `process.kill(pid, 0)` — a no-op probe
 *     that throws ESRCH if the PID is dead, EPERM if alive but
 *     belongs to another user (we treat EPERM as alive).
 *   - Heartbeat freshness check: if heartbeat is older than
 *     STALE_THRESHOLD_MS, treat the file as stale even if the PID
 *     happens to still be alive. This catches frozen/hung apps.
 *
 * Stale-lock cleanup is NOT done here — only detection. If the
 * file is stale, we report "not running" and let the App's next
 * startup overwrite it. We don't unlink other processes' files
 * unilaterally.
 */

import { promises as fs } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

import { APP_PRODUCT_NAME } from "./constants.js";

const ALIVE_FILE_NAME = "app-alive.json";
const STALE_THRESHOLD_MS = 30_000;

interface AliveFileContent {
  schemaVersion: number;
  pid: number;
  startedAt: string;
  lastHeartbeat: string;
  version: string;
}

/**
 * Result of a status probe. The shape is intentionally narrow —
 * each case carries only what verify_skill_loaded needs to compose
 * its response.
 */
export type AppAliveStatus =
  | { kind: "not_running"; reason: "no_file" | "stale_pid" | "stale_heartbeat" | "read_error" }
  | { kind: "running"; pid: number; version: string; startedAt: string };

/**
 * Same dual-candidate logic as stateFile.ts. We could DRY this by
 * importing from stateFile, but the file paths are different
 * (current-scan.json vs app-alive.json) and the userDataDirs()
 * function is private over there. Duplication is intentional and
 * trivial.
 */
function userDataDirs(): string[] {
  const product = APP_PRODUCT_NAME;
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
      const base =
        process.env.XDG_CONFIG_HOME ?? path.join(homedir(), ".config");
      return [
        path.join(base, product),
        path.join(base, ...devSegments),
      ];
    }
  }
}

/**
 * Find the alive-file across candidate dirs. Returns the first
 * one that exists, or null if none. Cached for the lifetime of
 * this MCP process — same pattern as stateFile.ts.
 */
let cachedAliveFilePath: string | null = null;

async function findAliveFilePath(): Promise<string | null> {
  if (cachedAliveFilePath) {
    try {
      await fs.access(cachedAliveFilePath);
      return cachedAliveFilePath;
    } catch {
      cachedAliveFilePath = null;
    }
  }

  const dirs = userDataDirs();
  for (const dir of dirs) {
    const candidate = path.join(dir, ALIVE_FILE_NAME);
    try {
      await fs.access(candidate);
      cachedAliveFilePath = candidate;
      return candidate;
    } catch {
      // not present here, try next
    }
  }
  return null;
}

/**
 * Probe whether the App is running. Performs three checks in order:
 *
 *   1. Does the alive-file exist? (`no_file` if not)
 *   2. Is its PID still alive? (`stale_pid` if dead)
 *   3. Was lastHeartbeat updated recently? (`stale_heartbeat` if
 *      older than STALE_THRESHOLD_MS)
 *
 * Each check that passes contributes to a "running" result; first
 * failure reports the reason.
 *
 * The function never throws — read errors collapse to a `read_error`
 * not_running result. Callers can treat all not_running variants
 * uniformly when surfacing to the user.
 */
export async function probeAppAlive(): Promise<AppAliveStatus> {
  const filePath = await findAliveFilePath();
  if (!filePath) {
    return { kind: "not_running", reason: "no_file" };
  }

  let raw: string;
  try {
    raw = await fs.readFile(filePath, "utf-8");
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      cachedAliveFilePath = null;
      return { kind: "not_running", reason: "no_file" };
    }
    return { kind: "not_running", reason: "read_error" };
  }

  let parsed: AliveFileContent;
  try {
    parsed = JSON.parse(raw) as AliveFileContent;
  } catch {
    return { kind: "not_running", reason: "read_error" };
  }

  if (typeof parsed.pid !== "number") {
    return { kind: "not_running", reason: "read_error" };
  }

  // PID-alive check.
  try {
    process.kill(parsed.pid, 0);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ESRCH") {
      return { kind: "not_running", reason: "stale_pid" };
    }
    if (code === "EPERM") {
      // PID exists but belongs to another user — treat as alive.
      // (Fall through to heartbeat check.)
    } else {
      // Unknown error — be conservative, treat as alive.
    }
  }

  // Heartbeat freshness.
  const lastHeartbeatMs = Date.parse(parsed.lastHeartbeat);
  if (!Number.isFinite(lastHeartbeatMs)) {
    return { kind: "not_running", reason: "read_error" };
  }
  const ageMs = Date.now() - lastHeartbeatMs;
  if (ageMs > STALE_THRESHOLD_MS) {
    return { kind: "not_running", reason: "stale_heartbeat" };
  }

  return {
    kind: "running",
    pid: parsed.pid,
    version: parsed.version ?? "unknown",
    startedAt: parsed.startedAt,
  };
}
