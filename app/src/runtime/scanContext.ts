import { TOOLS, getToolI18nKeyBase, type ToolId } from "../config/tools";
import type { ScanComplete, CurrentScanState } from "../types/ipc";
import type { BridgeStagesMap } from "../hooks/useBridgeScan";
import type { StagesMap } from "../hooks/useScan";
import type {
  RuntimeScanContext,
  RuntimeScanFact,
} from "../types/runtime";

function priorityFromStatus(
  status: "ok" | "warning" | "critical" | "error",
): RuntimeScanFact["severity"] {
  return status;
}

function detailFromLocalStage(
  toolId: ToolId,
  stage: NonNullable<StagesMap[ToolId]>,
): string {
  if (stage.status === "error") {
    return stage.errorMessage ?? stage.errorCode ?? "The scan stage failed.";
  }
  if (!stage.summary) {
    return "Completed successfully.";
  }
  return `Critical: ${stage.summary.critical}, warning: ${stage.summary.warning}, info: ${stage.summary.info}.`;
}

function detailFromBridgeStage(
  toolId: ToolId,
  stage: NonNullable<BridgeStagesMap[ToolId]>,
): string {
  if (stage.status === "error") {
    return stage.errorMessage ?? stage.errorCode ?? "The bridge stage failed.";
  }
  if (!stage.summary) {
    return "Completed successfully.";
  }
  return `Critical: ${stage.summary.critical}, warning: ${stage.summary.warning}, info: ${stage.summary.info}.`;
}

export function buildNativeScanContext(
  url: string,
  selectedTools: Set<ToolId>,
  stages: StagesMap,
  summary: ScanComplete | null,
): RuntimeScanContext | null {
  const selected = TOOLS.filter((tool) => selectedTools.has(tool.id)).map(
    (tool) => tool.id,
  );
  if (!url.trim() || selected.length === 0) return null;

  const facts: RuntimeScanFact[] = [];
  const completedTools: ToolId[] = [];
  for (const toolId of selected) {
    const stage = stages[toolId];
    if (!stage) continue;
    if (
      stage.status === "ok" ||
      stage.status === "warning" ||
      stage.status === "critical" ||
      stage.status === "error"
    ) {
      completedTools.push(toolId);
      facts.push({
        toolId,
        title: getToolI18nKeyBase(toolId),
        detail: detailFromLocalStage(toolId, stage),
        severity: priorityFromStatus(stage.status),
        source: "local_scan",
      });
    }
  }

  return {
    url: url.trim(),
    selectedTools: selected,
    completedTools,
    totals: summary?.totals ?? {
      critical: 0,
      warning: 0,
      info: 0,
      errors: 0,
    },
    facts,
  };
}

export function buildBridgeScanFacts(
  state: CurrentScanState | null,
  stages: BridgeStagesMap,
): RuntimeScanFact[] {
  if (!state) return [];
  const facts: RuntimeScanFact[] = [];
  for (const toolId of state.selectedTools) {
    const stage = stages[toolId];
    if (
      !stage ||
      (stage.status !== "ok" &&
        stage.status !== "warning" &&
        stage.status !== "critical" &&
        stage.status !== "error")
    ) {
      continue;
    }
    facts.push({
      toolId,
      title: getToolI18nKeyBase(toolId),
      detail: detailFromBridgeStage(toolId, stage),
      severity: priorityFromStatus(stage.status),
      source: "bridge_scan",
    });
  }
  return facts;
}
