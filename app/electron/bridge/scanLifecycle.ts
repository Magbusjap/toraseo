/**
 * Bridge Mode scan lifecycle — orchestrates state-file transitions
 * and timeouts.
 *
 * Each scan owns a small set of timers:
 *
 *   - HANDSHAKE_TIMEOUT_MS  — verify_skill_loaded must be called
 *                             within this window after creation,
 *                             else status flips to error
 *                             (handshake_timeout)
 *   - FIRST_TOOL_TIMEOUT_MS — after handshake_verified, at least
 *                             one tool must start within this
 *                             window, else error (no_tool_response)
 *   - GLOBAL_TIMEOUT_MS     — total scan duration cap; remaining
 *                             tools marked skipped_timeout
 *   - COMPLETION_GRACE_MS   — after status flips to complete /
 *                             cancelled / error, wait this long
 *                             before removing the file (so App's
 *                             last poll cycle can render the final
 *                             state)
 *
 * This module is the single source of truth for transitions. The
 * stateFile module is dumb storage; the IPC layer just exposes
 * commands. All decisions about "is this transition valid?" /
 * "should I clear timer X?" / etc. live here.
 *
 * Concurrency: only one active scan at a time. Starting a new scan
 * while another is in flight clears the existing one (App should
 * confirm this with the user before calling).
 */

import { randomUUID } from "node:crypto";
import { clipboard } from "electron";
import log from "electron-log";

import {
  readState,
  writeState,
  removeState,
  STATE_FILE_SCHEMA_VERSION,
} from "./stateFile.js";
import { buildScanPrompt } from "./promptBuilder.js";
import { createBridgeWorkspace } from "./workspace.js";
import { getCurrentLocale } from "../locale.js";

import type {
  BridgeClient,
  BridgeAnalysisInput,
  CurrentScanState,
  StartBridgeScanResult,
} from "../../src/types/ipc.js";

/**
 * The Bridge Mode protocol token. Both App and MCP must agree on
 * this value; mismatch is the failure path. Format: bridge-vN-DATE.
 *
 * Bumped when the protocol changes in a backwards-incompatible
 * way (renamed fields, new mandatory steps, schema bump). Date is
 * informational. Released coordinately with skill-v0.x.x and a
 * matching MCP version.
 *
 * Currently exported from a single constant in App; the MCP server
 * imports the same value from its own constants.ts (kept in sync
 * by code review during coordinated releases). Future improvement:
 * generate this at build time from a shared root constant so the
 * two can never diverge silently.
 *
 * SECURITY NOTE: this token is used here ONLY to populate the
 * state-file's `handshake.expectedToken` field, which MCP reads
 * to validate calls to verify_skill_loaded. The token is NEVER
 * passed to the prompt builder — see promptBuilder.ts for the
 * full reasoning. Without this discipline, the Skill becomes
 * optional and Bridge Mode can be triggered by any model with
 * MCP access, defeating the architectural contract.
 */
export const BRIDGE_PROTOCOL_TOKEN = "bridge-v1-2026-04-27";
const CODEX_WORKFLOW_HANDSHAKE_MARKER = "verified-by-mcp-codex-workflow";

/** Timer durations in milliseconds. */
const HANDSHAKE_TIMEOUT_MS = 10_000;
const FIRST_TOOL_TIMEOUT_MS = 30_000;
const GLOBAL_TIMEOUT_MS = 5 * 60_000;
const COMPLETION_GRACE_MS = 5_000;

function usesAutomaticTimeouts(
  bridgeClient: BridgeClient,
  analysisType?: CurrentScanState["analysisType"],
): boolean {
  return (
    bridgeClient === "claude" &&
    analysisType !== "article_text" &&
    analysisType !== "article_compare"
  );
}

function expectedHandshakeToken(bridgeClient: BridgeClient): string {
  return bridgeClient === "codex"
    ? CODEX_WORKFLOW_HANDSHAKE_MARKER
    : BRIDGE_PROTOCOL_TOKEN;
}

/**
 * Active timer set for the current scan. Stored at module scope
 * because there's only ever one active scan; multiple would be a
 * design error (state-file is singleton).
 */
interface ScanTimers {
  scanId: string;
  handshakeTimer: NodeJS.Timeout | null;
  firstToolTimer: NodeJS.Timeout | null;
  globalTimer: NodeJS.Timeout | null;
  cleanupTimer: NodeJS.Timeout | null;
}

let activeTimers: ScanTimers | null = null;
const LIFECYCLE_STARTED_AT_MS = Date.now();

function isInFlightStatus(status: CurrentScanState["status"]): boolean {
  return status === "awaiting_handshake" || status === "in_progress";
}

function wasCreatedBeforeThisAppRun(state: CurrentScanState): boolean {
  const createdAtMs = Date.parse(state.createdAt);
  return !Number.isFinite(createdAtMs) || createdAtMs < LIFECYCLE_STARTED_AT_MS;
}

async function discardStaleInFlightState(
  state: CurrentScanState | null,
): Promise<CurrentScanState | null> {
  if (!state || !isInFlightStatus(state.status)) return state;
  if (activeTimers) return state;
  if (!wasCreatedBeforeThisAppRun(state)) return state;

  log.warn(
    `[bridge:lifecycle] discarding stale ${state.status} scan ${state.scanId} from a previous app run`,
  );
  await removeState();
  return null;
}

/**
 * Clear all timers for the active scan and forget the entry.
 * Safe to call when there's no active scan (idempotent).
 */
function clearAllTimers(): void {
  if (!activeTimers) return;
  if (activeTimers.handshakeTimer) clearTimeout(activeTimers.handshakeTimer);
  if (activeTimers.firstToolTimer) clearTimeout(activeTimers.firstToolTimer);
  if (activeTimers.globalTimer) clearTimeout(activeTimers.globalTimer);
  if (activeTimers.cleanupTimer) clearTimeout(activeTimers.cleanupTimer);
  activeTimers = null;
}

/**
 * Start a new Bridge Mode scan.
 *
 * Steps:
 *   1. If a previous scan is in flight, cancel it (state-file
 *      removed, timers cleared) — caller is expected to have
 *      confirmed this with the user.
 *   2. Create a fresh scan-state with status=awaiting_handshake.
 *   3. Build a localized prompt (no token; the token lives only
 *      in SKILL.md — see promptBuilder.ts), copy to clipboard.
 *   4. Start the handshake timeout.
 *   5. Return scanId + prompt to the renderer.
 */
export async function startScan(
  url: string,
  toolIds: string[],
  bridgeClient: BridgeClient = "claude",
  input?: BridgeAnalysisInput,
): Promise<StartBridgeScanResult> {
  // Cancel any prior scan (caller should have asked the user).
  if (activeTimers) {
    log.info(
      `[bridge:lifecycle] new scan requested while ${activeTimers.scanId} active — cancelling previous`,
    );
    clearAllTimers();
    await removeState();
  }

  const scanId = randomUUID();
  const now = new Date().toISOString();
  const analysisType =
    url === "toraseo://article-compare"
      ? "article_compare"
      : input?.sourceType === "page_by_url"
        ? "page_by_url"
        : input || url === "toraseo://article-text"
        ? "article_text"
        : "site_by_url";
  const workspace = await createBridgeWorkspace({
    scanId,
    bridgeClient,
    analysisType,
    url,
    selectedTools: toolIds,
    input,
    createdAt: now,
  });

  const state: CurrentScanState = {
    schemaVersion: STATE_FILE_SCHEMA_VERSION,
    scanId,
    bridgeClient,
    analysisType,
    input: input
      ? {
          ...input,
          text: undefined,
          pageTextBlock: undefined,
          textA: undefined,
          textB: undefined,
        }
      : undefined,
    workspace,
    status: "awaiting_handshake",
    url,
    createdAt: now,
    finishedAt: null,
    selectedTools: toolIds,
    handshake: {
      expectedToken: expectedHandshakeToken(bridgeClient),
      receivedToken: null,
      status: "pending",
      verifiedAt: null,
    },
    buffer: {},
    error: null,
  };

  await writeState(state);

  const locale = await getCurrentLocale();
  const prompt = buildScanPrompt(url, toolIds, locale, bridgeClient, state);

  // Copy to clipboard. clipboard.writeText is sync and trivially
  // fast — no need to await anything.
  clipboard.writeText(prompt);

  // Set up timers.
  const handshakeTimer = usesAutomaticTimeouts(bridgeClient, state.analysisType)
    ? setTimeout(() => {
        void onHandshakeTimeout(scanId);
      }, HANDSHAKE_TIMEOUT_MS)
    : null;

  const globalTimer = usesAutomaticTimeouts(bridgeClient, state.analysisType)
    ? setTimeout(() => {
        void onGlobalTimeout(scanId);
      }, GLOBAL_TIMEOUT_MS)
    : null;

  activeTimers = {
    scanId,
    handshakeTimer,
    firstToolTimer: null,
    globalTimer,
    cleanupTimer: null,
  };

  log.info(
    `[bridge:lifecycle] scan ${scanId} started -- url=${url}, tools=${toolIds.length}, locale=${locale}`,
  );

  return {
    scanId,
    prompt,
    expectedToken: state.handshake.expectedToken,
    bridgeClient,
  };
}

/**
 * Cancel the active scan. Used when:
 *   - User clicks Cancel in the sidebar
 *   - User starts a new scan (covered by startScan internal cancel)
 *   - App is quitting
 *
 * Removes the state-file and clears timers. The MCP server, if
 * mid-call, will see no_active_scan on its next state-file read
 * and bail out gracefully.
 *
 * Idempotent — calling cancel when nothing is active is a no-op.
 */
export async function cancelScan(): Promise<{ ok: boolean }> {
  if (!activeTimers) {
    const staleState = await readState();
    if (staleState && isInFlightStatus(staleState.status)) {
      log.info(
        `[bridge:lifecycle] cancelling stale ${staleState.status} scan ${staleState.scanId}`,
      );
      await removeState();
      return { ok: true };
    }
    log.debug("[bridge:lifecycle] cancel called but no active scan");
    return { ok: true };
  }

  log.info(`[bridge:lifecycle] cancelling scan ${activeTimers.scanId}`);
  clearAllTimers();
  await removeState();
  return { ok: true };
}

/**
 * Re-arm the handshake after a timeout / mismatch. Reuses the
 * same scanId and selectedTools; resets handshake to pending,
 * status back to awaiting_handshake, clears any partial buffer
 * (a fresh attempt is a clean slate), restarts the handshake
 * timer, re-copies the prompt to clipboard.
 *
 * If there's no error state to retry from, returns
 * {ok: false, error: "..."}.
 */
export async function retryHandshake(): Promise<{
  ok: boolean;
  error?: string;
}> {
  const current = await readState();
  if (!current) {
    return { ok: false, error: "no_active_scan" };
  }
  if (current.status !== "error") {
    return {
      ok: false,
      error: `cannot_retry_in_state_${current.status}`,
    };
  }

  // Reset state.
  const reset: CurrentScanState = {
    ...current,
    status: "awaiting_handshake",
    handshake: {
      expectedToken: expectedHandshakeToken(current.bridgeClient),
      receivedToken: null,
      status: "pending",
      verifiedAt: null,
    },
    buffer: {},
    error: null,
    finishedAt: null,
  };

  await writeState(reset);

  // Re-copy prompt.
  const locale = await getCurrentLocale();
  const prompt = buildScanPrompt(
    reset.url,
    reset.selectedTools,
    locale,
    reset.bridgeClient,
    reset,
  );
  clipboard.writeText(prompt);

  // Restart timers (clear any old, set fresh).
  clearAllTimers();
  const handshakeTimer = usesAutomaticTimeouts(reset.bridgeClient, reset.analysisType)
    ? setTimeout(() => {
        void onHandshakeTimeout(reset.scanId);
      }, HANDSHAKE_TIMEOUT_MS)
    : null;
  const globalTimer = usesAutomaticTimeouts(reset.bridgeClient, reset.analysisType)
    ? setTimeout(() => {
        void onGlobalTimeout(reset.scanId);
      }, GLOBAL_TIMEOUT_MS)
    : null;
  activeTimers = {
    scanId: reset.scanId,
    handshakeTimer,
    firstToolTimer: null,
    globalTimer,
    cleanupTimer: null,
  };

  log.info(`[bridge:lifecycle] scan ${reset.scanId} handshake retried`);
  return { ok: true };
}

/**
 * Read the current scan state. Used by IPC handler for an
 * imperative read (separate from polling). Returns null if no
 * scan is active.
 */
export async function getCurrentState(): Promise<CurrentScanState | null> {
  return discardStaleInFlightState(await readState());
}

export async function getVisibleState(
  state: CurrentScanState | null,
): Promise<CurrentScanState | null> {
  return discardStaleInFlightState(state);
}

/**
 * Observe bridge state changes coming from the polling watcher.
 *
 * This lets the App react to MCP-driven transitions (handshake
 * verified, first tool started, terminal states) without forcing
 * the MCP process to know about App timers directly.
 */
export function observeBridgeState(state: CurrentScanState | null): void {
  if (!state || !activeTimers || state.scanId !== activeTimers.scanId) {
    return;
  }

  if (state.status === "in_progress") {
    const hasStartedTools = Object.keys(state.buffer).length > 0;
    if (
      usesAutomaticTimeouts(state.bridgeClient, state.analysisType) &&
      !hasStartedTools &&
      !activeTimers.firstToolTimer
    ) {
      activeTimers.firstToolTimer = setTimeout(() => {
        void onFirstToolTimeout(state.scanId);
      }, FIRST_TOOL_TIMEOUT_MS);
    }
    if (hasStartedTools && activeTimers.firstToolTimer) {
      clearTimeout(activeTimers.firstToolTimer);
      activeTimers.firstToolTimer = null;
    }
    if (activeTimers.handshakeTimer) {
      clearTimeout(activeTimers.handshakeTimer);
      activeTimers.handshakeTimer = null;
    }
    return;
  }

  if (
    state.status === "complete" ||
    state.status === "cancelled" ||
    state.status === "error"
  ) {
    scheduleCleanup(state.scanId);
  }
}

// =====================================================================
// Internal — timer callbacks
// =====================================================================

/**
 * Called when HANDSHAKE_TIMEOUT_MS elapses without a successful
 * verify_skill_loaded. If the scanId in activeTimers no longer
 * matches (a different scan started, or one was cancelled), bail.
 */
async function onHandshakeTimeout(scanId: string): Promise<void> {
  if (!activeTimers || activeTimers.scanId !== scanId) {
    log.debug(
      `[bridge:lifecycle] handshake timer fired for stale scan ${scanId}`,
    );
    return;
  }

  const state = await readState();
  if (!state || state.scanId !== scanId) return;

  // If handshake already verified, nothing to do — timer will be
  // cleared by the handshake-verified path (which is in MCP, not
  // here, but the state read confirms).
  if (state.status !== "awaiting_handshake") return;

  log.warn(`[bridge:lifecycle] scan ${scanId} handshake timed out`);

  await writeState({
    ...state,
    status: "error",
    finishedAt: new Date().toISOString(),
    handshake: { ...state.handshake, status: "timeout" },
    error: {
      code: "handshake_timeout",
      message:
        state.bridgeClient === "codex"
          ? "Codex did not call verify_codex_workflow_loaded within 10 seconds. Check that Codex is running, ToraSEO MCP is connected, and Codex Workflow Instructions are loaded."
          : "Claude did not call verify_skill_loaded within 10 seconds. Check that Claude Desktop is running, MCP is connected, and Claude Bridge Instructions are loaded.",
    },
  });

  // Don't clear timers here — the cleanup grace timer below.
  scheduleCleanup(scanId);
}

/**
 * Called when FIRST_TOOL_TIMEOUT_MS elapses after handshake
 * verified, without any tool entry appearing in buffer. (This
 * timer is set when the App observes the handshake_verified
 * transition — see scheduleFirstToolTimer.)
 */
async function onFirstToolTimeout(scanId: string): Promise<void> {
  if (!activeTimers || activeTimers.scanId !== scanId) return;

  const state = await readState();
  if (!state || state.scanId !== scanId) return;

  if (state.status !== "in_progress") return;
  if (Object.keys(state.buffer).length > 0) return; // tools already started

  log.warn(`[bridge:lifecycle] scan ${scanId} no tool response`);

  await writeState({
    ...state,
    status: "error",
    finishedAt: new Date().toISOString(),
    error: {
      code: "no_tool_response",
      message:
        "Handshake succeeded but no tools started within 30 seconds. Claude may not have understood the request.",
    },
  });

  scheduleCleanup(scanId);
}

/**
 * Called when GLOBAL_TIMEOUT_MS elapses. Marks remaining tools
 * as skipped_timeout, transitions to complete (with errors).
 */
async function onGlobalTimeout(scanId: string): Promise<void> {
  if (!activeTimers || activeTimers.scanId !== scanId) return;

  const state = await readState();
  if (!state || state.scanId !== scanId) return;

  // If already terminal, nothing to do.
  if (
    state.status === "complete" ||
    state.status === "cancelled" ||
    state.status === "error"
  ) {
    return;
  }

  log.warn(`[bridge:lifecycle] scan ${scanId} global timeout`);

  // Mark remaining tools as skipped.
  const finishedAt = new Date().toISOString();
  const buffer = { ...state.buffer };
  for (const toolId of state.selectedTools) {
    if (!buffer[toolId]) {
      buffer[toolId] = {
        status: "error",
        startedAt: finishedAt,
        completedAt: finishedAt,
        errorCode: "skipped_timeout",
        errorMessage: "Tool was not called before global timeout (5min).",
      };
    } else if (buffer[toolId]!.status === "running") {
      buffer[toolId] = {
        ...buffer[toolId]!,
        status: "error",
        completedAt: finishedAt,
        errorCode: "skipped_timeout",
        errorMessage: "Tool was running when global timeout fired.",
      };
    }
  }

  await writeState({
    ...state,
    status: "complete",
    finishedAt,
    buffer,
  });

  scheduleCleanup(scanId);
}

/**
 * Schedule the state-file cleanup. Runs COMPLETION_GRACE_MS after
 * a terminal status (complete / cancelled / error) so the App can
 * render the final state, then unlink the file.
 *
 * Idempotent — multiple terminal events for the same scan only
 * schedule one cleanup (subsequent calls find the cleanupTimer
 * already set).
 */
function scheduleCleanup(scanId: string): void {
  if (!activeTimers || activeTimers.scanId !== scanId) return;
  if (activeTimers.cleanupTimer) return;

  // Stop in-flight timers immediately — only the cleanup is left.
  if (activeTimers.handshakeTimer) {
    clearTimeout(activeTimers.handshakeTimer);
    activeTimers.handshakeTimer = null;
  }
  if (activeTimers.firstToolTimer) {
    clearTimeout(activeTimers.firstToolTimer);
    activeTimers.firstToolTimer = null;
  }
  if (activeTimers.globalTimer) {
    clearTimeout(activeTimers.globalTimer);
    activeTimers.globalTimer = null;
  }

  activeTimers.cleanupTimer = setTimeout(() => {
    void (async () => {
      const state = await readState();
      if (state && state.scanId === scanId) {
        log.info(`[bridge:lifecycle] cleaning up scan ${scanId}`);
        await removeState();
      }
      clearAllTimers();
    })();
  }, COMPLETION_GRACE_MS);
}
