import { useEffect, useMemo, useState } from "react";
import {
  ExternalLink,
  FileDown,
  FileText,
  Presentation,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import type { CurrentScanState, ScanComplete } from "../../types/ipc";
import type { SupportedLocale } from "../../types/ipc";
import type { ScanState } from "../../hooks/useScan";
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
  nativeScanState: ScanState;
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

function summarizeFacts(
  executionMode: AuditExecutionMode,
  facts: RuntimeScanFact[],
  locale: SupportedLocale,
): string {
  const totals = facts.reduce(
    (acc, fact) => {
      if (fact.severity === "critical") acc.critical += 1;
      else if (fact.severity === "warning") acc.warning += 1;
      else if (fact.severity === "error") acc.errors += 1;
      else acc.info += 1;
      return acc;
    },
    { critical: 0, warning: 0, info: 0, errors: 0 },
  );
  const sourceTools = new Set(facts.map((fact) => fact.toolId)).size;

  if (locale === "ru") {
    const modeLabel =
      executionMode === "bridge"
        ? "Bridge-результаты получены в приложении"
        : "Результаты сканирования готовы";
    return `${modeLabel}: ${facts.length} подтверждённых фактов из ${sourceTools} инструментов. Критично: ${totals.critical}, предупреждения: ${totals.warning}, информация: ${totals.info}, ошибки: ${totals.errors}.`;
  }

  if (executionMode === "bridge") {
    return `Bridge results received in the app: ${facts.length} confirmed facts from ${sourceTools} tool(s). Critical: ${totals.critical}, warning: ${totals.warning}, info: ${totals.info}, errors: ${totals.errors}.`;
  }

  return `Scan results are ready: ${facts.length} confirmed facts from ${sourceTools} tool(s). Critical: ${totals.critical}, warning: ${totals.warning}, info: ${totals.info}, errors: ${totals.errors}.`;
}

function buildFallbackReport(
  executionMode: AuditExecutionMode,
  report: RuntimeAuditReport | null,
  scanContext: RuntimeScanContext | null,
  bridgeFacts: RuntimeScanFact[],
  locale: SupportedLocale,
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
    summary: summarizeFacts(executionMode, factsSource, locale),
    nextStep:
      locale === "ru"
        ? executionMode === "native"
          ? "Попросите приоритетную интерпретацию после завершения текущего сканирования."
          : "Завершите обсуждение в Claude Desktop, затем экспортируйте отчёт, если нужен статический артефакт."
        : executionMode === "native"
          ? "Ask for a priority-ordered interpretation once the current scan is complete."
          : "Finish the conversation in Claude Desktop, then export the report if you need a static artifact.",
    confirmedFacts,
    expertHypotheses: [],
  };
}

export default function AnalysisPanel({
  executionMode,
  nativeScanState,
  runtimeReport,
  bridgeState,
  bridgeFacts,
  scanContext,
  localSummary,
}: AnalysisPanelProps) {
  const { t, i18n } = useTranslation();
  const locale: SupportedLocale = i18n.resolvedLanguage === "ru" ? "ru" : "en";
  const [secondScreenOpen, setSecondScreenOpen] = useState(false);
  const [exportStatus, setExportStatus] = useState<string | null>(null);
  const hasStarted =
    executionMode === "native"
      ? nativeScanState !== "idle"
      : Boolean(bridgeState);

  const effectiveReport = useMemo(
    () =>
      buildFallbackReport(
        executionMode,
        runtimeReport,
        scanContext,
        bridgeFacts,
        locale,
      ),
    [bridgeFacts, executionMode, locale, runtimeReport, scanContext],
  );

  const totals =
    executionMode === "native"
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
  const visibleMetricCards = [
    {
      label: t("analysisPanel.metrics.critical", {
        defaultValue: "Critical",
      }),
      value: totals.critical,
      accent: "text-red-600",
    },
    {
      label: t("analysisPanel.metrics.warning", {
        defaultValue: "Warning",
      }),
      value: totals.warning,
      accent: "text-orange-700",
    },
    {
      label: t("analysisPanel.metrics.info", { defaultValue: "Info" }),
      value: totals.info,
      accent: "text-emerald-600",
    },
    {
      label: t("analysisPanel.metrics.errors", {
        defaultValue: "Errors",
      }),
      value: totals.errors,
      accent: "text-outline-900/70",
    },
  ].filter((metric) => metric.value > 0);
  const phaseLabels = [
    effectiveReport
      ? t("analysisPanel.phases.facts", { defaultValue: "facts" })
      : null,
    effectiveReport?.expertHypotheses.length
      ? t("analysisPanel.phases.hypotheses", { defaultValue: "hypotheses" })
      : null,
    effectiveReport
      ? t("analysisPanel.phases.priority", { defaultValue: "priority" })
      : null,
    effectiveReport
      ? t("analysisPanel.phases.export", { defaultValue: "export" })
      : null,
  ].filter(Boolean);

  useEffect(() => {
    if (!secondScreenOpen || !effectiveReport) return;
    void window.toraseo.runtime.openReportWindow(effectiveReport);
  }, [effectiveReport, secondScreenOpen]);

  if (!hasStarted) {
    return (
      <section className="bg-transparent py-6">
        <p className="rounded-lg border border-orange-100 bg-white/70 px-5 py-4 text-sm text-outline-900/65 shadow-sm">
          {t("analysisPanel.startHint", {
            defaultValue:
              "Enter a site URL, select tools, and click Scan.",
          })}
        </p>
      </section>
    );
  }

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

  const handleExportDocument = async () => {
    if (!effectiveReport) return;
    const result =
      await window.toraseo.runtime.exportReportDocument(effectiveReport);
    if (result.ok) {
      setExportStatus(result.filePath ?? "Exported");
    } else if (result.error !== "cancelled") {
      setExportStatus(result.error ?? "Export failed");
    }
  };

  const handleExportPresentation = async () => {
    if (!effectiveReport) return;
    const result =
      await window.toraseo.runtime.exportReportPresentation(effectiveReport);
    if (result.ok) {
      setExportStatus(result.filePath ?? "Exported");
    } else if (result.error !== "cancelled") {
      setExportStatus(result.error ?? "Export failed");
    }
  };

  return (
    <section className="flex min-w-0 flex-col bg-transparent">
      <header className="flex items-center justify-between px-1 py-3">
        <div>
          <h2 className="text-sm font-semibold text-orange-900">
            {t("analysisPanel.title", { defaultValue: "Analysis Results" })}
          </h2>
          {phaseLabels.length > 0 && (
            <p className="text-xs text-orange-700/70">
              {phaseLabels.join(", ")}
            </p>
          )}
        </div>
        <span className="rounded-full bg-orange-50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-orange-700">
          {executionMode === "native"
            ? t("analysisPanel.mode.native", { defaultValue: "Native mode" })
            : t("analysisPanel.mode.bridge", { defaultValue: "Bridge mode" })}
        </span>
      </header>

      <div className="space-y-4 py-4">
        {visibleMetricCards.length > 0 && (
          <div className="grid grid-cols-2 gap-3">
            {visibleMetricCards.map((metric) => (
              <MetricCard
                key={metric.label}
                label={metric.label}
                value={metric.value}
                accent={metric.accent}
              />
            ))}
          </div>
        )}

        {effectiveReport && (
        <div className="rounded-xl border border-orange-200 bg-white p-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-orange-700">
            {t("analysisPanel.overview", { defaultValue: "Overview" })}
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-orange-950/80">
            {effectiveReport?.summary ??
              (bridgeState?.error?.message ??
                t("analysisPanel.emptyOverview", {
                  defaultValue: "Run a scan to populate the analysis panel.",
                }))}
          </p>
        </div>
        )}

        {effectiveReport && (
        <SectionCard
          title={t("analysisPanel.confirmedFacts", {
            defaultValue: "Confirmed facts",
          })}
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
                      {t(`analysisPanel.priority.${fact.priority}`, {
                        defaultValue: fact.priority,
                      })}
                    </span>
                  </div>
                  <p className="text-sm leading-relaxed text-orange-950/80">
                    {fact.detail}
                  </p>
                  <p className="mt-2 text-[11px] uppercase tracking-wide text-orange-700/70">
                    {t("analysisPanel.sources", { defaultValue: "Sources" })}:{" "}
                    {fact.sourceToolIds.join(", ")}
                  </p>
                </article>
              ))}
            </div>
          ) : (
            <EmptyMessage
              text={t("analysisPanel.noFacts", {
                defaultValue: "No confirmed facts yet.",
              })}
            />
          )}
        </SectionCard>
        )}

        {effectiveReport && (
        <SectionCard
          title={t("analysisPanel.expertHypotheses", {
            defaultValue: "Expert hypotheses",
          })}
          icon={<Sparkles className="h-4 w-4" />}
        >
          {effectiveReport?.expertHypotheses.length ? (
            <div className="space-y-3">
              {effectiveReport.expertHypotheses.map((item, index) => (
                <HypothesisCard
                  key={`${item.title}-${index}`}
                  item={item}
                  locale={locale}
                />
              ))}
            </div>
          ) : (
            <EmptyMessage
              text={t("analysisPanel.noHypotheses", {
                defaultValue:
                  "No hypotheses are available for the current report.",
              })}
            />
          )}
        </SectionCard>
        )}

        {effectiveReport && (
        <div className="rounded-xl border border-orange-200 bg-white p-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-orange-700">
            {t("analysisPanel.validationMethod", {
              defaultValue: "Validation method",
            })}
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-orange-950/80">
            {effectiveReport?.expertHypotheses[0]?.validationMethod ??
              effectiveReport?.nextStep ??
              t("analysisPanel.noReport", {
                defaultValue: "No report has been generated yet.",
              })}
          </p>
        </div>
        )}
      </div>

      {effectiveReport && (
      <footer className="space-y-2 border-t border-orange-100 bg-white px-5 py-3">
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={handleToggleSecondScreen}
            disabled={!effectiveReport}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-orange-200 bg-white px-4 py-2 text-sm font-medium text-orange-700 transition-colors hover:bg-orange-50 disabled:opacity-50"
          >
            <ExternalLink size={14} />
            <span>
              {secondScreenOpen
                ? t("analysisPanel.actions.closeDetails", {
                    defaultValue: "Close details",
                  })
                : t("analysisPanel.actions.details", {
                    defaultValue: "Details",
                  })}
            </span>
          </button>
          <button
            type="button"
            onClick={handleExportPdf}
            disabled={!effectiveReport}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-orange-600 disabled:bg-orange-300"
          >
            <FileDown size={14} />
            <span>
              {t("analysisPanel.actions.exportPdf", {
                defaultValue: "Export PDF",
              })}
            </span>
          </button>
          {executionMode === "native" && (
            <>
              <button
                type="button"
                onClick={handleExportDocument}
                disabled={!effectiveReport}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-orange-200 bg-white px-4 py-2 text-sm font-medium text-orange-700 transition-colors hover:bg-orange-50 disabled:opacity-50"
              >
                <FileText size={14} />
                <span>
                  {t("analysisPanel.actions.document", {
                    defaultValue: "Document",
                  })}
                </span>
              </button>
              <button
                type="button"
                onClick={handleExportPresentation}
                disabled={!effectiveReport}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-orange-200 bg-white px-4 py-2 text-sm font-medium text-orange-700 transition-colors hover:bg-orange-50 disabled:opacity-50"
              >
                <Presentation size={14} />
                <span>
                  {t("analysisPanel.actions.presentation", {
                    defaultValue: "Presentation",
                  })}
                </span>
              </button>
            </>
          )}
        </div>
        {exportStatus && (
          <p className="text-xs text-orange-700/70">{exportStatus}</p>
        )}
      </footer>
      )}
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

function HypothesisCard({
  item,
  locale,
}: {
  item: RuntimeExpertHypothesis;
  locale: SupportedLocale;
}) {
  const expectedImpactLabel =
    locale === "ru" ? "Ожидаемый эффект" : "Expected impact";
  const validationLabel = locale === "ru" ? "Проверка" : "Validation";

  return (
    <article className="rounded-lg border border-orange-100 bg-orange-50/30 p-3">
      <div className="mb-1 flex items-start justify-between gap-3">
        <h4 className="text-sm font-medium text-orange-950">{item.title}</h4>
        <span className={`text-xs font-semibold uppercase ${priorityClass(item.priority)}`}>
          {locale === "ru"
            ? item.priority === "high"
              ? "высокий"
              : item.priority === "medium"
                ? "средний"
                : "низкий"
            : item.priority}
        </span>
      </div>
      <p className="text-sm leading-relaxed text-orange-950/80">{item.detail}</p>
      <p className="mt-2 text-xs text-orange-800">
        <strong>{expectedImpactLabel}:</strong> {item.expectedImpact}
      </p>
      <p className="mt-1 text-xs text-orange-800">
        <strong>{validationLabel}:</strong> {item.validationMethod}
      </p>
    </article>
  );
}

function EmptyMessage({ text }: { text: string }) {
  return <p className="text-sm text-orange-950/60">{text}</p>;
}
