/**
 * App alive-file management.
 *
 * The alive-file is a small JSON marker on disk that signals
 * "the ToraSEO Desktop App is running". The MCP server reads
 * it to distinguish:
 *
 *   - App not running (no alive-file, or stale PID) → instruct
 *     the user to start the app.
 *   - App running, no scan started → instruct the user to click
 *     "Scan" in the app.
 *   - App running, scan started → proceed with Bridge Mode.
 *
 * The file is created on app ready and removed on graceful
 * shutdown (before-quit). On crash or kill -9 it remains —
 * MCP guards against this by checking the PID is alive when
 * reading.
 *
 * Schema:
 *   {
 *     schemaVersion: 1,
 *     pid: number,            // process.pid
 *     startedAt: string,      // ISO-8601
 *     lastHeartbeat: string,  // ISO-8601, refreshed every HEARTBEAT_MS
 *     version: string         // app/package.json version
 *   }
 *
 * Heartbeat is provisional — PID-check alone is enough on most
 * systems but heartbeat catches a hung-but-alive process. The
 * combination is belt-and-suspenders. If heartbeat causes
 * problems on Mikhail's Windows / macOS machines, we can drop it
 * and rely on PID alone.
 *
 * NOT for Bridge Mode scan tracking — that lives in current-scan.json
 * via stateFile.ts. This file answers a coarser question: "is the
 * app process alive at all?".
 */

import { app } from "electron";
import { promises as fs } from "node:fs";
import path from "node:path";
import log from "electron-log";

const ALIVE_FILE_NAME = "app-alive.json";
const ALIVE_FILE_SCHEMA_VERSION = 1 as const;
const HEARTBEAT_MS = 10_000;

interface AliveFileContent {
  schemaVersion: typeof ALIVE_FILE_SCHEMA_VERSION;
  pid: number;
  startedAt: string;
  lastHeartbeat: string;
  version: string;
}

let heartbeatTimer: NodeJS.Timeout | null = null;
let aliveFilePath: string | null = null;

function devSharedAliveFilePath(): string | null {
  const explicit = process.env.TORASEO_BRIDGE_STATE_DIR?.trim();
  if (explicit) return path.join(explicit, ALIVE_FILE_NAME);
  if (app.isPackaged) return null;

  const cwd = process.cwd();
  const candidates = [
    path.resolve(cwd, "..", ".toraseo-bridge"),
    path.resolve(cwd, ".toraseo-bridge"),
  ];
  const repoLike = candidates.find((candidate) =>
    candidate.toLowerCase().includes(`${path.sep}toraseo${path.sep}`),
  );
  return path.join(repoLike ?? candidates[0], ALIVE_FILE_NAME);
}

/**
 * Resolve the alive-file path. Lazy because app.getPath()
 * isn't valid before app is ready.
 */
function getAliveFilePath(): string {
  if (aliveFilePath) return aliveFilePath;
  aliveFilePath =
    devSharedAliveFilePath() ??
    path.join(app.getPath("userData"), ALIVE_FILE_NAME);
  return aliveFilePath;
}

/**
 * Atomic write — same pattern as stateFile.ts. Write to .tmp,
 * rename. On Windows rename is best-effort atomic; partial
 * writes are still avoided because rename either succeeds or
 * fails as a whole.
 */
async function writeAtomic(filePath: string, data: AliveFileContent): Promise<void> {
  const tempPath = filePath + ".tmp";
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(tempPath, JSON.stringify(data, null, 2), "utf-8");
  await fs.rename(tempPath, filePath);
}

/**
 * Refresh the heartbeat timestamp. Called every HEARTBEAT_MS.
 * If the file got deleted manually (or by a stale-detection
 * fallback in MCP), this recreates it. We don't treat that as
 * an error — the goal is "while the app is alive, the file
 * exists with a fresh heartbeat".
 */
async function refreshHeartbeat(): Promise<void> {
  const filePath = getAliveFilePath();
  const content: AliveFileContent = {
    schemaVersion: ALIVE_FILE_SCHEMA_VERSION,
    pid: process.pid,
    startedAt: appStartTime ?? new Date().toISOString(),
    lastHeartbeat: new Date().toISOString(),
    version: app.getVersion(),
  };

  try {
    await writeAtomic(filePath, content);
  } catch (err) {
    // Disk full? Permissions? Log and continue — we'll try
    // again at next heartbeat tick.
    log.warn(`[alive-file] heartbeat write failed: ${(err as Error).message}`);
  }
}

let appStartTime: string | null = null;

/**
 * Stale-lock detection. If a previous app instance crashed and
 * left the alive-file behind, check whether its PID is still
 * alive. If not, ignore the file (we're free to overwrite).
 * If it IS alive, that means another copy of the app is running
 * — caller may want to abort startup or surface an error to
 * the user.
 *
 * Returns:
 *   - { kind: "no-file" } — clean state, free to start
 *   - { kind: "stale", pid } — file exists but PID is dead, free to start
 *   - { kind: "alive", pid } — another instance is running
 */
export async function detectExistingInstance(): Promise<
  | { kind: "no-file" }
  | { kind: "stale"; pid: number }
  | { kind: "alive"; pid: number }
> {
  const filePath = getAliveFilePath();
  let raw: string;
  try {
    raw = await fs.readFile(filePath, "utf-8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return { kind: "no-file" };
    }
    // Read error other than missing — treat as no-file (won't
    // block startup; we'll try to overwrite).
    log.warn(`[alive-file] could not read on startup: ${(err as Error).message}`);
    return { kind: "no-file" };
  }

  let parsed: AliveFileContent;
  try {
    parsed = JSON.parse(raw) as AliveFileContent;
  } catch {
    log.warn("[alive-file] existing file is invalid JSON, treating as stale");
    return { kind: "no-file" };
  }

  if (typeof parsed.pid !== "number") {
    return { kind: "no-file" };
  }

  // PID-alive check. process.kill(pid, 0) doesn't actually kill
  // — it's just an existence probe. Throws ESRCH if dead, EPERM
  // if alive but owned by another user (treat as alive).
  if (parsed.pid === process.pid) {
    // Same PID — almost certainly leftover from this same process
    // somehow (shouldn't happen, but treat as stale).
    return { kind: "stale", pid: parsed.pid };
  }

  try {
    process.kill(parsed.pid, 0);
    return { kind: "alive", pid: parsed.pid };
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ESRCH") {
      return { kind: "stale", pid: parsed.pid };
    }
    if (code === "EPERM") {
      // Process exists but we don't have permission — assume alive.
      return { kind: "alive", pid: parsed.pid };
    }
    // Unknown error — be conservative, treat as alive (don't
    // overwrite something that might be running).
    log.warn(`[alive-file] PID check error: ${code}`);
    return { kind: "alive", pid: parsed.pid };
  }
}

/**
 * Initialize the alive-file system. Call once on app ready,
 * after detectExistingInstance() has cleared startup.
 *
 * Creates the alive-file with current PID and schedules a
 * heartbeat refresh every HEARTBEAT_MS.
 */
export async function setupAliveFile(): Promise<void> {
  appStartTime = new Date().toISOString();
  await refreshHeartbeat();
  heartbeatTimer = setInterval(() => {
    void refreshHeartbeat();
  }, HEARTBEAT_MS);
  log.info(`[alive-file] initialized at ${getAliveFilePath()} (pid=${process.pid})`);
}

/**
 * Tear down the alive-file system. Call from app's before-quit
 * handler. Stops the heartbeat timer and removes the file. After
 * this, the MCP server will see the app as "not running" on its
 * next probe.
 *
 * Idempotent — safe to call multiple times (will-quit may run
 * after before-quit on some platforms).
 */
export async function teardownAliveFile(): Promise<void> {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
  try {
    await fs.unlink(getAliveFilePath());
    log.info("[alive-file] removed on shutdown");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      log.warn(`[alive-file] unlink failed: ${(err as Error).message}`);
    }
  }
}
