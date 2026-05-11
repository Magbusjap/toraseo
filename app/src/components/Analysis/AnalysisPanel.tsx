import { useEffect, useMemo, useState } from "react";
import {
  ExternalLink,
  FileDown,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import type { AnalysisTypeId } from "../../config/analysisTypes";
import {
  DEFAULT_ANALYSIS_VERSION,
  getAnalysisVersionText,
} from "../../config/versions";
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

type DisplayStatus = "critical" | "warning" | "info" | "passed";

interface DisplayFact {
  title: string;
  detail: string;
  priority: RuntimeConfirmedFact["priority"];
  status: DisplayStatus;
  sourceToolIds: string[];
}

function toolLabel(toolId: string): string {
  const en: Record<string, string> = {
    scan_site_minimal: "Basic scan",
    analyze_indexability: "Indexability",
    check_robots_txt: "Robots.txt",
    analyze_sitemap: "Sitemap",
    check_redirects: "Redirects",
    analyze_meta: "Meta tags",
    analyze_canonical: "Canonical",
    analyze_headings: "Headings",
    analyze_content: "Content",
    analyze_links: "Links",
    detect_stack: "Site stack",
  };
  return en[toolId] ?? toolId;
}

function readableTitle(title: string): string {
  return title
    .replace(/^Meta tags:/i, "Meta tags:")
    .replace(/^Headings:/i, "Headings:")
    .replace(/^Content:/i, "Content:")
    .replace(/^Redirects:/i, "Redirects:")
    .replace(/^Indexability:/i, "Indexability:");
}

function readableDetail(detail: string): string {
  const normalized = detail.toLowerCase();
  if (normalized.includes("http 200")) {
    return detail.replace(/^HTTP 200/i, "HTTP 200");
  }
  if (normalized.includes("detected likely stack signals")) {
    return detail.replace(
      /^Detected likely stack signals:/i,
      "Detected likely technology signals:",
    );
  }
  return detail;
}

function dedupeKey(fact: RuntimeConfirmedFact): string {
  const text = `${fact.title} ${fact.detail}`.toLowerCase();
  if (text.includes("canonical")) return "canonical_missing";
  if (text.includes("meta description")) return "meta_description_missing";
  if (text.includes("no sitemap") || text.includes("sitemap not found")) return "sitemap_missing";
  if (text.includes("thin content")) return "thin_content";
  if (text.includes("open graph") || text.includes("og missing")) return "open_graph_missing";
  if (text.includes("twitter")) return "twitter_card_missing";
  if (text.includes("title too short")) return "title_too_short";
  if (text.includes("heading level skip")) return "heading_level_skip";
  if (text.includes("no redirects")) return "redirects_ok";
  if (text.includes("indexability clear")) return "indexability_ok";
  if (text.includes("robots") && text.includes("completed")) return "robots_ok";
  if (text.includes("minimal scan completed")) return "basic_scan_ok";
  if (text.includes("links checked")) return "links_checked";
  return fact.title.toLowerCase().replace(/[^a-z0-9]+/giu, "_");
}

function statusFromFact(fact: RuntimeConfirmedFact): DisplayStatus {
  const text = `${fact.title} ${fact.detail}`.toLowerCase();
  const key = dedupeKey(fact);
  if (key === "meta_description_missing" || key === "title_too_short") {
    return "warning";
  }
  if (
    key === "canonical_missing" ||
    key === "heading_level_skip" ||
    key === "links_checked"
  ) {
    return "info";
  }
  if (key === "thin_content" || key === "sitemap_missing") {
    return "critical";
  }
  const passed =
    text.includes("completed") ||
    text.includes("clear") ||
    text.includes("no redirects") ||
    text.includes("links checked") ||
    text.includes("crawling is allowed");
  if (passed && fact.priority === "low") return "passed";
  if (fact.priority === "high") return "critical";
  if (fact.priority === "medium") return "warning";
  return "info";
}

function aggregateFacts(
  facts: RuntimeConfirmedFact[],
): DisplayFact[] {
  const byKey = new Map<string, DisplayFact>();
  for (const fact of facts) {
    const key = dedupeKey(fact);
    const existing = byKey.get(key);
    const next: DisplayFact = {
      title: readableTitle(fact.title),
      detail: readableDetail(fact.detail),
      priority: fact.priority,
      status: statusFromFact(fact),
      sourceToolIds: fact.sourceToolIds,
    };
    if (!existing) {
      byKey.set(key, next);
      continue;
    }
    existing.sourceToolIds = Array.from(
      new Set([...existing.sourceToolIds, ...fact.sourceToolIds]),
    );
    if (fact.priority === "high" || existing.priority === "low") {
      existing.priority = fact.priority;
      existing.status = statusFromFact(fact);
    }
  }
  return [...byKey.values()].sort(
    (a, b) => statusWeight(a.status) - statusWeight(b.status),
  );
}

function statusWeight(status: DisplayStatus): number {
  if (status === "critical") return 0;
  if (status === "warning") return 1;
  if (status === "info") return 2;
  return 3;
}

function summarizeFacts(
  executionMode: AuditExecutionMode,
  facts: RuntimeScanFact[],
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

  return `Site check complete: ${totals.critical} critical issues, ${totals.warning} warnings, ${totals.info} informational results. Completed directions: ${sourceTools}.`;
}

function buildFallbackReport(
  executionMode: AuditExecutionMode,
  report: RuntimeAuditReport | null,
  bridgeFacts: RuntimeScanFact[],
  locale: SupportedLocale,
): RuntimeAuditReport | null {
  if (report?.analysisType === "site_by_url") {
    return report.locale === locale ? report : { ...report, locale };
  }

  if (executionMode === "native") {
    return null;
  }

  const factsSource =
    bridgeFacts;
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
    analysisType: "site_by_url",
    analysisVersion: DEFAULT_ANALYSIS_VERSION,
    locale,
    mode: "strict_audit",
    providerId: executionMode === "native" ? "openrouter" : "openrouter",
    model: executionMode === "native" ? "pending-ai-chat" : "bridge-facts-only",
    generatedAt: new Date().toISOString(),
    summary: summarizeFacts(executionMode, factsSource),
    nextStep: "Fix the priority issues in the report and run the scan again.",
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
  const activeAnalysisType = (bridgeState?.analysisType ??
    "site_by_url") as AnalysisTypeId;
  const hasStarted =
    executionMode === "native"
      ? nativeScanState !== "idle"
      : Boolean(bridgeState);

  const effectiveReport = useMemo(
    () =>
      buildFallbackReport(
        executionMode,
        runtimeReport,
        bridgeFacts,
        locale,
      ),
    [bridgeFacts, executionMode, locale, runtimeReport],
  );
  const displayFacts = useMemo(
    () =>
      effectiveReport
        ? aggregateFacts(effectiveReport.confirmedFacts)
        : [],
    [effectiveReport, locale],
  );
  const displayTotals = displayFacts.reduce(
    (acc, fact) => {
      if (fact.status === "critical") acc.critical += 1;
      else if (fact.status === "warning") acc.warning += 1;
      else if (fact.status === "info") acc.info += 1;
      else acc.passed += 1;
      return acc;
    },
    { critical: 0, warning: 0, info: 0, passed: 0 },
  );
  const priorityFixes = displayFacts
    .filter((fact) => fact.status === "critical" || fact.status === "warning")
    .slice(0, 5);
  const passedFacts = displayFacts.filter((fact) => fact.status === "passed");
  const detailFacts = displayFacts.filter((fact) => fact.status !== "passed");
  const nextStep =
    priorityFixes.length > 0
      ? t("analysisPanel.nextStepFix", {
          items: priorityFixes
            .slice(0, 3)
            .map((fact) => fact.title)
            .join(", "),
          defaultValue: "Fix first: {{items}}. Run the scan again after edits.",
        })
      : t("analysisPanel.nextStepClean", {
          defaultValue:
            "No critical issues found. Review informational notes and run the scan again after edits.",
        });

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
      value: displayFacts.length > 0 ? displayTotals.critical : totals.critical,
      accent: "text-red-600",
    },
    {
      label: t("analysisPanel.metrics.warning", {
        defaultValue: "Warning",
      }),
      value: displayFacts.length > 0 ? displayTotals.warning : totals.warning,
      accent: "text-orange-700",
    },
    {
      label: t("analysisPanel.metrics.info", { defaultValue: "Info" }),
      value: displayFacts.length > 0 ? displayTotals.info : totals.info,
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
            defaultValue: "Enter a site URL, select tools, and click Scan.",
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
        {effectiveReport && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleToggleSecondScreen}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-orange-200 bg-white px-3 py-2 text-sm font-medium text-orange-700 transition-colors hover:bg-orange-50"
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
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-orange-500 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-orange-600"
            >
              <FileDown size={14} />
              <span>
                {t("analysisPanel.actions.exportPdf", {
                  defaultValue: "Export PDF",
                })}
              </span>
            </button>
          </div>
        )}
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
          title={t("analysisPanel.priorityFixes", {
            defaultValue: "What to fix first",
          })}
          icon={<ShieldCheck className="h-4 w-4" />}
        >
          {priorityFixes.length ? (
            <div className="space-y-3">
              {priorityFixes.map((fact, index) => (
                <DisplayFactCard
                  key={`${fact.title}-${index}`}
                  fact={fact}
                  index={index + 1}
                />
              ))}
            </div>
          ) : (
            <EmptyMessage
              text={t("analysisPanel.noPriorityFixes", {
                defaultValue: "No critical actions yet.",
              })}
            />
          )}
        </SectionCard>
        )}

        {effectiveReport && detailFacts.length > 0 && (
        <SectionCard
          title={t("analysisPanel.checkResults", {
            defaultValue: "Check results",
          })}
          icon={<ShieldCheck className="h-4 w-4" />}
        >
          <div className="space-y-3">
            {detailFacts.map((fact, index) => (
              <DisplayFactCard
                key={`${fact.title}-${index}`}
                fact={fact}
              />
            ))}
          </div>
        </SectionCard>
        )}

        {effectiveReport && passedFacts.length > 0 && (
        <SectionCard
          title={t("analysisPanel.passedChecks", {
            defaultValue: "Passed checks",
          })}
          icon={<ShieldCheck className="h-4 w-4" />}
        >
          <div className="space-y-2">
            {passedFacts.map((fact) => (
              <div
                key={fact.title}
                className="rounded-lg border border-emerald-100 bg-emerald-50/70 px-3 py-2 text-sm text-emerald-900"
              >
                {fact.title}
              </div>
            ))}
          </div>
        </SectionCard>
        )}

        {effectiveReport && effectiveReport.expertHypotheses.length > 0 && (
        <SectionCard
          title={t("analysisPanel.expertHypotheses", {
            defaultValue: "Expert hypotheses",
          })}
          icon={<Sparkles className="h-4 w-4" />}
        >
          <div className="space-y-3">
            {effectiveReport.expertHypotheses.map((item, index) => (
              <HypothesisCard
                key={`${item.title}-${index}`}
                item={item}
              />
            ))}
          </div>
        </SectionCard>
        )}

        {effectiveReport && (
        <div className="rounded-xl border border-orange-200 bg-white p-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-orange-700">
            {t("analysisPanel.nextStep", {
              defaultValue: "Next step",
            })}
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-orange-950/80">
            {nextStep}
          </p>
        </div>
        )}
      </div>

      {effectiveReport && (
      <footer className="border-t border-orange-100 bg-white px-5 py-3">
        {exportStatus && (
          <p className="text-xs text-orange-700/70">{exportStatus}</p>
        )}
        <ReportVersionLine
          locale={locale}
          analysisType={activeAnalysisType}
          analysisVersion={effectiveReport?.analysisVersion}
        />
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

function ReportVersionLine({
  locale,
  analysisType,
  analysisVersion,
}: {
  locale: SupportedLocale;
  analysisType: AnalysisTypeId;
  analysisVersion?: string;
}) {
  return (
    <p className="mt-1 text-[11px] leading-relaxed text-outline-900/45">
      {getAnalysisVersionText(analysisType, locale, analysisVersion)}
    </p>
  );
}

function DisplayFactCard({
  fact,
  index,
}: {
  fact: DisplayFact;
  index?: number;
}) {
  const { t } = useTranslation();
  const statusLabel = t(`analysisPanel.status.${fact.status}`, {
    defaultValue: fact.status,
  });
  const statusClass =
    fact.status === "critical"
      ? "text-red-600"
      : fact.status === "warning"
        ? "text-orange-700"
        : fact.status === "passed"
          ? "text-emerald-600"
          : "text-outline-900/60";
  return (
    <article className="rounded-lg border border-orange-100 bg-orange-50/30 p-3">
      <div className="mb-1 flex items-start justify-between gap-3">
        <h4 className="text-sm font-medium text-orange-950">
          {index ? `${index}. ` : ""}
          {fact.title}
        </h4>
        <span className={`text-xs font-semibold uppercase ${statusClass}`}>
          {statusLabel}
        </span>
      </div>
      <p className="text-sm leading-relaxed text-orange-950/80">{fact.detail}</p>
      <p className="mt-2 text-[11px] uppercase tracking-wide text-orange-700/70">
        {t("analysisPanel.checks", { defaultValue: "Checks" })}:{" "}
        {fact.sourceToolIds.map((toolId) => toolLabel(toolId)).join(", ")}
      </p>
    </article>
  );
}

function HypothesisCard({
  item,
}: {
  item: RuntimeExpertHypothesis;
}) {
  const { t } = useTranslation();
  const expectedImpactLabel = t("analysisPanel.expectedImpact", {
    defaultValue: "Expected impact",
  });
  const validationLabel = t("analysisPanel.validation", {
    defaultValue: "Validation",
  });
  const priorityLabel = t(`analysisPanel.priority.${item.priority}`, {
    defaultValue: item.priority,
  });

  return (
    <article className="rounded-lg border border-orange-100 bg-orange-50/30 p-3">
      <div className="mb-1 flex items-start justify-between gap-3">
        <h4 className="text-sm font-medium text-orange-950">{item.title}</h4>
        <span className={`text-xs font-semibold uppercase ${priorityClass(item.priority)}`}>
          {priorityLabel}
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
