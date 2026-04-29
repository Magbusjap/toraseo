import { useMemo, useState } from "react";
import { ExternalLink, FileDown, ShieldCheck, Sparkles } from "lucide-react";

import type { CurrentScanState, ScanComplete } from "../../types/ipc";
import type {
  AuditExecutionMode,
  RuntimeAuditReport,
  RuntimeConfirmedFact,
  RuntimeExpertHypothesis,
  RuntimeScanContext,
  RuntimeScanFact,
} from "../../types/runtime";

interface AnalysisPanelProps {
  executionMode: AuditExecutionMode;
  runtimeReport: RuntimeAuditReport | null;
  bridgeState: CurrentScanState | null;
  bridgeFacts: RuntimeScanFact[];
  scanContext: RuntimeScanContext | null;
  localSummary: ScanComplete | null;
}

function priorityClass(priority: "high" | "medium" | "low"): string {
  if (priority === "high") return "text-red-600";
  if (priority === "low") return "text-emerald-600";
  return "text-orange-700";
}

function buildFallbackReport(
  executionMode: AuditExecutionMode,
  report: RuntimeAuditReport | null,
  scanContext: RuntimeScanContext | null,
  bridgeFacts: RuntimeScanFact[],
): RuntimeAuditReport | null {
  if (report) return report;

  const factsSource =
    executionMode === "native" ? scanContext?.facts ?? [] : bridgeFacts;
  if (factsSource.length === 0) return null;

  const confirmedFacts: RuntimeConfirmedFact[] = factsSource.map((fact) => ({
    title: fact.title,
    detail: fact.detail,
    priority:
      fact.severity === "critical"
        ? "high"
        : fact.severity === "warning"
          ? "medium"
          : "low",
    sourceToolIds: [fact.toolId],
  }));

  return {
    mode: "strict_audit",
    providerId: executionMode === "native" ? "openrouter" : "openrouter",
    model: executionMode === "native" ? "pending-ai-chat" : "bridge-facts-only",
    generatedAt: new Date().toISOString(),
    summary:
      executionMode === "native"
        ? "Scan results are ready. Ask the in-app AI to interpret them, or export the factual report now."
        : "Bridge scan facts are available in the app. Claude recommendations continue in the external chat.",
    nextStep:
      executionMode === "native"
        ? "Ask for a priority-ordered interpretation once the current scan is complete."
        : "Finish the conversation in Claude Desktop, then export the report if you need a static artifact.",
    confirmedFacts,
    expertHypotheses: [],
  };
}

export default function AnalysisPanel({
  executionMode,
  runtimeReport,
  bridgeState,
  bridgeFacts,
  scanContext,
  localSummary,
}: AnalysisPanelProps) {
  const [secondScreenOpen, setSecondScreenOpen] = useState(false);
  const [exportStatus, setExportStatus] = useState<string | null>(null);

  const effectiveReport = useMemo(
    () =>
      buildFallbackReport(
        executionMode,
        runtimeReport,
        scanContext,
        bridgeFacts,
      ),
    [bridgeFacts, executionMode, runtimeReport, scanContext],
  );

  const totals = executionMode === "native"
    ? scanContext?.totals ?? localSummary?.totals ?? {
        critical: 0,
        warning: 0,
        info: 0,
        errors: 0,
      }
    : bridgeFacts.reduce(
        (acc, fact) => {
          if (fact.severity === "critical") acc.critical += 1;
          else if (fact.severity === "warning") acc.warning += 1;
          else if (fact.severity === "error") acc.errors += 1;
          else acc.info += 1;
          return acc;
        },
        { critical: 0, warning: 0, info: 0, errors: 0 },
      );

  const handleToggleSecondScreen = async () => {
    if (!effectiveReport) return;
    if (secondScreenOpen) {
      await window.toraseo.runtime.closeReportWindow();
      setSecondScreenOpen(false);
      return;
    }
    await window.toraseo.runtime.openReportWindow(effectiveReport);
    setSecondScreenOpen(true);
  };

  const handleExportPdf = async () => {
    if (!effectiveReport) return;
    const result = await window.toraseo.runtime.exportReportPdf(effectiveReport);
    if (result.ok) {
      setExportStatus(result.filePath ?? "Exported");
    } else if (result.error !== "cancelled") {
      setExportStatus(result.error ?? "Export failed");
    }
  };

  return (
    <section className="flex h-full min-w-0 flex-col border-l border-orange-100 bg-orange-50/40">
      <header className="flex items-center justify-between border-b border-orange-100 bg-white px-5 py-3">
        <div>
          <h2 className="text-sm font-semibold text-orange-900">
            Analysis Results
          </h2>
          <p className="text-xs text-orange-700/70">
            Facts, hypotheses, priority, export
          </p>
        </div>
        <span className="rounded-full bg-orange-50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-orange-700">
          {executionMode === "native" ? "Native mode" : "Bridge mode"}
        </span>
      </header>

      <div className="flex-1 space-y-4 overflow-auto px-5 py-4">
        <div className="grid grid-cols-2 gap-3">
          <MetricCard label="Critical" value={totals.critical} accent="text-red-600" />
          <MetricCard label="Warning" value={totals.warning} accent="text-orange-700" />
          <MetricCard label="Info" value={totals.info} accent="text-emerald-600" />
          <MetricCard label="Errors" value={totals.errors} accent="text-outline-900/70" />
        </div>

        <div className="rounded-xl border border-orange-200 bg-white p-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-orange-700">
            Overview
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-orange-950/80">
            {effectiveReport?.summary ??
              (bridgeState?.error?.message ??
                "Run a scan to populate the analysis panel.")}
          </p>
        </div>

        <SectionCard
          title="Confirmed facts"
          icon={<ShieldCheck className="h-4 w-4" />}
        >
          {effectiveReport?.confirmedFacts.length ? (
            <div className="space-y-3">
              {effectiveReport.confirmedFacts.map((fact, index) => (
                <article
                  key={`${fact.title}-${index}`}
                  className="rounded-lg border border-orange-100 bg-orange-50/30 p-3"
                >
                  <div className="mb-1 flex items-start justify-between gap-3">
                    <h4 className="text-sm font-medium text-orange-950">
                      {fact.title}
                    </h4>
                    <span className={`text-xs font-semibold uppercase ${priorityClass(fact.priority)}`}>
                      {fact.priority}
                    </span>
                  </div>
                  <p className="text-sm leading-relaxed text-orange-950/80">
                    {fact.detail}
                  </p>
                  <p className="mt-2 text-[11px] uppercase tracking-wide text-orange-700/70">
                    Sources: {fact.sourceToolIds.join(", ")}
                  </p>
                </article>
              ))}
            </div>
          ) : (
            <EmptyMessage text="No confirmed facts yet." />
          )}
        </SectionCard>

        <SectionCard
          title="Expert hypotheses"
          icon={<Sparkles className="h-4 w-4" />}
        >
          {effectiveReport?.expertHypotheses.length ? (
            <div className="space-y-3">
              {effectiveReport.expertHypotheses.map((item, index) => (
                <HypothesisCard key={`${item.title}-${index}`} item={item} />
              ))}
            </div>
          ) : (
            <EmptyMessage text="No hypotheses are available for the current report." />
          )}
        </SectionCard>

        <div className="rounded-xl border border-orange-200 bg-white p-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-orange-700">
            Validation method
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-orange-950/80">
            {effectiveReport?.expertHypotheses[0]?.validationMethod ??
              effectiveReport?.nextStep ??
              "No report has been generated yet."}
          </p>
        </div>
      </div>

      <footer className="space-y-2 border-t border-orange-100 bg-white px-5 py-3">
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={handleToggleSecondScreen}
            disabled={!effectiveReport}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-orange-200 bg-white px-4 py-2 text-sm font-medium text-orange-700 transition-colors hover:bg-orange-50 disabled:opacity-50"
          >
            <ExternalLink size={14} />
            <span>{secondScreenOpen ? "Close details" : "Подробнее"}</span>
          </button>
          <button
            type="button"
            onClick={handleExportPdf}
            disabled={!effectiveReport}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-orange-600 disabled:bg-orange-300"
          >
            <FileDown size={14} />
            <span>Export PDF</span>
          </button>
        </div>
        {exportStatus && (
          <p className="text-xs text-orange-700/70">{exportStatus}</p>
        )}
      </footer>
    </section>
  );
}

function MetricCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent: string;
}) {
  return (
    <div className="rounded-xl border border-orange-200 bg-white p-3">
      <div className={`text-lg font-semibold ${accent}`}>{value}</div>
      <div className="text-[11px] uppercase tracking-wide text-orange-700/70">
        {label}
      </div>
    </div>
  );
}

function SectionCard({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-orange-200 bg-white p-4">
      <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-orange-700">
        {icon}
        <span>{title}</span>
      </div>
      {children}
    </div>
  );
}

function HypothesisCard({ item }: { item: RuntimeExpertHypothesis }) {
  return (
    <article className="rounded-lg border border-orange-100 bg-orange-50/30 p-3">
      <div className="mb-1 flex items-start justify-between gap-3">
        <h4 className="text-sm font-medium text-orange-950">{item.title}</h4>
        <span className={`text-xs font-semibold uppercase ${priorityClass(item.priority)}`}>
          {item.priority}
        </span>
      </div>
      <p className="text-sm leading-relaxed text-orange-950/80">{item.detail}</p>
      <p className="mt-2 text-xs text-orange-800">
        <strong>Expected impact:</strong> {item.expectedImpact}
      </p>
      <p className="mt-1 text-xs text-orange-800">
        <strong>Validation:</strong> {item.validationMethod}
      </p>
    </article>
  );
}

function EmptyMessage({ text }: { text: string }) {
  return <p className="text-sm text-orange-950/60">{text}</p>;
}
