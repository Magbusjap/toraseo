import { ChatPanel } from "../Chat";
import { AnalysisPanel } from "../Analysis";

import type { SupportedLocale, CurrentScanState, ScanComplete } from "../../types/ipc";
import type {
  AuditExecutionMode,
  RuntimeAuditReport,
  RuntimeScanContext,
  RuntimeScanFact,
} from "../../types/runtime";

interface NativeLayoutProps {
  locale: SupportedLocale;
  executionMode: AuditExecutionMode;
  runtimeScanContext: RuntimeScanContext | null;
  runtimeReport: RuntimeAuditReport | null;
  onRuntimeReportChange: (report: RuntimeAuditReport | null) => void;
  bridgeState: CurrentScanState | null;
  bridgePrompt: string | null;
  bridgeFacts: RuntimeScanFact[];
  localSummary: ScanComplete | null;
}

export default function NativeLayout({
  locale,
  executionMode,
  runtimeScanContext,
  runtimeReport,
  onRuntimeReportChange,
  bridgeState,
  bridgePrompt,
  bridgeFacts,
  localSummary,
}: NativeLayoutProps) {
  return (
    <div className="flex h-full min-w-[1280px] flex-1 overflow-hidden">
      <div className="flex flex-1 min-w-0">
        <div className="min-w-[420px] flex-1">
          <ChatPanel
            locale={locale}
            executionMode={executionMode}
            scanContext={runtimeScanContext}
            bridgeState={bridgeState}
            bridgePrompt={bridgePrompt}
            onReport={onRuntimeReportChange}
          />
        </div>
        <div className="w-[440px] shrink-0">
          <AnalysisPanel
            executionMode={executionMode}
            runtimeReport={runtimeReport}
            bridgeState={bridgeState}
            bridgeFacts={bridgeFacts}
            scanContext={runtimeScanContext}
            localSummary={localSummary}
          />
        </div>
      </div>
    </div>
  );
}
