import { useCallback, useEffect, useRef, useState } from "react";

import type { ToolId } from "../config/tools";
import type { ScanComplete, StageStatus, StageUpdate } from "../types/ipc";

/**
 * Per-tool stage state held in the renderer.
 *
 * Mirrors `StageUpdate` but flattens the discriminated union so React
 * components can render uniformly: `state.stages[toolId]` always has
 * a `status`, and conditional fields are simply undefined when not
 * applicable.
 */
export interface StageState {
  status: StageStatus;
  result?: unknown;
  errorCode?: string;
  errorMessage?: string;
  summary?: {
    critical: number;
    warning: number;
    info: number;
  };
}

export type StagesMap = Partial<Record<ToolId, StageState>>;

/**
 * Aggregate scan state at the renderer level.
 *
 *   idle      — no scan started in this session yet
 *   scanning  — IPC kicked off; waiting for stage updates
 *   complete  — `scan-complete` event received
 */
export type ScanState = "idle" | "scanning" | "complete";

interface UseScanReturn {
  /** Per-tool state. Empty object before any scan was started. */
  stages: StagesMap;
  /**
   * Aggregate scan state, derived from `stages`.
   *
   * - "idle"     — no scan started in this session yet
   * - "scanning" — at least one tool is pending or running
   * - "complete" — a `scan-complete` event arrived for the latest scan
   */
  scanState: ScanState;
  /** Latest scan summary (counts + duration). Set on completion. */
  summary: ScanComplete | null;
  /** Kick off a new scan. Resets per-tool state to "pending" for the chosen tools. */
  startScan: (url: string, toolIds: ToolId[]) => Promise<void>;
}

/**
 * Hook that owns the scan state and IPC subscriptions.
 *
 * Subscribes to `stage-update` and `scan-complete` once on mount;
 * unsubscribes on unmount. Filters incoming events by the active
 * scanId so a stale update from a cancelled-but-still-running scan
 * doesn't corrupt the UI of a fresh one.
 */
export function useScan(): UseScanReturn {
  const [stages, setStages] = useState<StagesMap>({});
  const [scanState, setScanState] = useState<ScanState>("idle");
  const [summary, setSummary] = useState<ScanComplete | null>(null);

  // The scanId of the currently-tracked run. Stored in a ref so the
  // IPC listeners (which are registered once) always see the latest
  // value without needing to re-subscribe on every render.
  const activeScanIdRef = useRef<string | null>(null);

  useEffect(() => {
    // Defensive guard — if preload failed to load (e.g. wrong
    // module format, sandbox restriction, missing file) the renderer
    // still mounts but window.toraseo is undefined. Without this
    // check we crash on first render with an opaque
    // "Cannot read properties of undefined". With it, the UI stays
    // alive and a clear console error points at the real cause.
    if (typeof window === "undefined" || !window.toraseo) {
      console.error(
        "[useScan] window.toraseo is not available. Preload script " +
          "likely failed to load. Check the main-process console for " +
          "a 'Unable to load preload script' error.",
      );
      return;
    }

    const unsubUpdate = window.toraseo.onStageUpdate((update: StageUpdate) => {
      // Drop late-arriving events from any scan that isn't current.
      if (update.scanId !== activeScanIdRef.current) return;

      setStages((prev) => ({
        ...prev,
        [update.toolId]: {
          status: update.status,
          result: update.result,
          errorCode: update.errorCode,
          errorMessage: update.errorMessage,
          summary: update.summary,
        },
      }));
    });

    const unsubComplete = window.toraseo.onScanComplete(
      (final: ScanComplete) => {
        if (final.scanId !== activeScanIdRef.current) return;
        setSummary(final);
        setScanState("complete");
      },
    );

    return () => {
      unsubUpdate();
      unsubComplete();
    };
  }, []);

  const startScan = useCallback(
    async (url: string, toolIds: ToolId[]): Promise<void> => {
      // Same defensive guard as in the effect above. If preload is
      // missing, we can't kick anything off — surface that as an
      // explicit error for every selected tool rather than throwing.
      if (typeof window === "undefined" || !window.toraseo) {
        const failed: StagesMap = {};
        for (const id of toolIds) {
          failed[id] = {
            status: "error",
            errorCode: "preload_missing",
            errorMessage:
              "Preload script failed to load. The IPC bridge is " +
              "not available. Try restarting the app.",
          };
        }
        setStages(failed);
        setScanState("complete");
        return;
      }

      // Seed every selected tool with a "pending" state so the UI
      // can render the full list of stages immediately, before the
      // main process even starts work.
      const initial: StagesMap = {};
      for (const id of toolIds) {
        initial[id] = { status: "pending" };
      }
      setStages(initial);
      setSummary(null);
      setScanState("scanning");

      try {
        const { scanId } = await window.toraseo.startScan({ url, toolIds });
        activeScanIdRef.current = scanId;
      } catch (error: unknown) {
        // Treat IPC-level failure as if every selected tool errored
        // out at once. This is rare (validation rejected by main, or
        // preload misconfigured) but worth surfacing distinctly.
        const message =
          error instanceof Error ? error.message : String(error);
        const failed: StagesMap = {};
        for (const id of toolIds) {
          failed[id] = {
            status: "error",
            errorCode: "ipc_failure",
            errorMessage: message,
          };
        }
        setStages(failed);
        setScanState("complete");
        setSummary({
          scanId: "",
          durationMs: 0,
          totals: {
            critical: 0,
            warning: 0,
            info: 0,
            errors: toolIds.length,
          },
        });
      }
    },
    [],
  );

  return { stages, scanState, summary, startScan };
}
