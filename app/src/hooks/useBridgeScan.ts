import { useCallback, useEffect, useMemo, useState } from "react";

import { TOOLS, type ToolId } from "../config/tools";
import type {
  BridgeClient,
  CurrentScanState,
  StartBridgeScanResult,
  ToolBufferEntry,
} from "../types/ipc";

export interface BridgeStageState {
  status: "pending" | "running" | "ok" | "warning" | "critical" | "error";
  summary?: {
    critical: number;
    warning: number;
    info: number;
  };
  errorCode?: string;
  errorMessage?: string;
  result?: unknown;
}

export type BridgeStagesMap = Partial<Record<ToolId, BridgeStageState>>;

function shouldRetainStateAfterCleanup(
  previous: CurrentScanState | null,
  next: CurrentScanState | null,
): boolean {
  return next === null && previous?.status === "complete";
}

interface UseBridgeScanReturn {
  state: CurrentScanState | null;
  stages: BridgeStagesMap;
  prompt: string | null;
  startScan: (
    url: string,
    toolIds: string[],
    bridgeClient?: BridgeClient,
    input?: import("../types/ipc").BridgeAnalysisInput,
  ) => Promise<StartBridgeScanResult>;
  cancelScan: () => Promise<void>;
  retryHandshake: () => Promise<void>;
  copyCodexSetupPrompt: () => Promise<string>;
  copyBridgeSetupPrompt: (bridgeClient: BridgeClient) => Promise<string>;
  clearRetainedState: () => void;
  isAwaitingHandshake: boolean;
}

function mapBufferEntry(entry?: ToolBufferEntry): BridgeStageState {
  if (!entry) {
    return { status: "pending" };
  }
  if (entry.status === "running") {
    return { status: "running" };
  }
  if (entry.status === "error") {
    return {
      status: "error",
      errorCode: entry.errorCode,
      errorMessage: entry.errorMessage,
    };
  }
  return {
    status: entry.verdict ?? "ok",
    summary: entry.summary,
    result: entry.data,
  };
}

export function useBridgeScan(): UseBridgeScanReturn {
  const [state, setState] = useState<CurrentScanState | null>(null);
  const [prompt, setPrompt] = useState<string | null>(null);

  useEffect(() => {
    let unsubscribe = () => undefined;
    void window.toraseo.bridge.getCurrentState().then(setState);
    unsubscribe = window.toraseo.bridge.onStateUpdate((next) => {
      setState((previous) =>
        shouldRetainStateAfterCleanup(previous, next) ? previous : next,
      );
    });
    return () => {
      unsubscribe();
    };
  }, []);

  const startScan = useCallback(
    async (
      url: string,
      toolIds: string[],
      bridgeClient?: BridgeClient,
      input?: import("../types/ipc").BridgeAnalysisInput,
    ) => {
      const result = await window.toraseo.bridge.startScan(
        url,
        toolIds,
        bridgeClient,
        input,
      );
      setPrompt(result.prompt);
      return result;
    },
    [],
  );

  const cancelScan = useCallback(async () => {
    await window.toraseo.bridge.cancelScan();
    setState(null);
    setPrompt(null);
  }, []);

  const clearRetainedState = useCallback(() => {
    setState(null);
    setPrompt(null);
  }, []);

  const retryHandshake = useCallback(async () => {
    const result = await window.toraseo.bridge.retryHandshake();
    if (!result.ok) {
      throw new Error(result.error ?? "bridge_retry_failed");
    }
  }, []);

  const copyCodexSetupPrompt = useCallback(async () => {
    const result = await window.toraseo.bridge.copyCodexSetupPrompt();
    return result.prompt;
  }, []);

  const copyBridgeSetupPrompt = useCallback(
    async (bridgeClient: BridgeClient) => {
      const result =
        await window.toraseo.bridge.copyBridgeSetupPrompt(bridgeClient);
      return result.prompt;
    },
    [],
  );

  const stages = useMemo<BridgeStagesMap>(() => {
    if (!state) return {};
    const next: BridgeStagesMap = {};
    for (const tool of TOOLS) {
      if (!state.selectedTools.includes(tool.id)) continue;
      next[tool.id] = mapBufferEntry(state.buffer[tool.id]);
    }
    return next;
  }, [state]);

  return {
    state,
    stages,
    prompt,
    startScan,
    cancelScan,
    retryHandshake,
    copyCodexSetupPrompt,
    copyBridgeSetupPrompt,
    clearRetainedState,
    isAwaitingHandshake: state?.status === "awaiting_handshake",
  };
}
