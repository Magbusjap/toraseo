import { AnalysisPanel } from "../Analysis";
import {
  Activity,
  CheckCircle2,
  Gauge,
  Globe,
  ListChecks,
  ShieldAlert,
  SlidersHorizontal,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import { getToolI18nKeyBase, type ToolId } from "../../config/tools";
import {
  getAnalysisVersionText,
} from "../../config/versions";
import type { CurrentScanState, ScanComplete } from "../../types/ipc";
import type { ScanState } from "../../hooks/useScan";
import type {
  AuditExecutionMode,
  RuntimeAuditReport,
  RuntimeScanContext,
  RuntimeScanFact,
} from "../../types/runtime";
import focusedMascot from "@branding/mascots/tora-focused.svg";
import happyMascot from "@branding/mascots/tora-happy.svg";
import neutralMascot from "@branding/mascots/tora-neutral.svg";
import surprisedMascot from "@branding/mascots/tora-surprised.svg";
import championMascot from "@branding/mascots/tora-champion.svg";

interface NativeLayoutProps {
  executionMode: AuditExecutionMode;
  nativeScanState: ScanState;
  runtimeScanContext: RuntimeScanContext | null;
  runtimeReport: RuntimeAuditReport | null;
  bridgeState: CurrentScanState | null;
  bridgeFacts: RuntimeScanFact[];
  localSummary: ScanComplete | null;
}

export default function NativeLayout({
  executionMode,
  nativeScanState,
  runtimeScanContext,
  runtimeReport,
  bridgeState,
  bridgeFacts,
  localSummary,
}: NativeLayoutProps) {
  const { t } = useTranslation();

  return (
    <div className="flex h-full min-w-[720px] flex-1 overflow-hidden">
      <div className="flex min-w-0 flex-1 justify-center overflow-auto bg-orange-50/20">
        <div className="flex w-full max-w-4xl flex-col gap-4 p-4">
          <header className="flex flex-wrap items-start justify-between gap-5 border-b border-outline/10 pb-6">
            <div className="flex min-w-0 items-start gap-4">
              <span className="rounded-lg bg-primary/10 p-3 text-primary">
                <Globe size={24} strokeWidth={1.8} />
              </span>
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wider text-outline-900/45">
                  {t("plannedAnalysis.version", {
                    defaultValue: "0.1.0 setup",
                  })}
                </p>
                <h1 className="mt-1 font-display text-2xl font-semibold text-outline-900">
                  {t("modeSelection.analysisTypes.siteByUrl.title", {
                    defaultValue: "Site by URL",
                  })}
                </h1>
                <p className="mt-2 max-w-2xl text-sm leading-relaxed text-outline-900/65">
                  {t("modeSelection.analysisTypes.siteByUrl.subtitle", {
                    defaultValue: "Classic audit",
                  })}
                </p>
              </div>
            </div>
            <span className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-orange-50 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-outline-900/55">
              <SlidersHorizontal size={14} />
              {t("plannedAnalysis.status", {
                defaultValue: "Formula draft",
              })}
            </span>
          </header>

          <AuditStatusHero
            executionMode={executionMode}
            nativeScanState={nativeScanState}
            scanContext={runtimeScanContext}
            bridgeState={bridgeState}
            bridgeFacts={bridgeFacts}
            localSummary={localSummary}
          />
          <SiteDashboardBoard
            executionMode={executionMode}
            nativeScanState={nativeScanState}
            scanContext={runtimeScanContext}
            bridgeState={bridgeState}
            bridgeFacts={bridgeFacts}
            localSummary={localSummary}
          />
          <AnalysisPanel
            executionMode={executionMode}
            nativeScanState={nativeScanState}
            runtimeReport={runtimeReport}
            bridgeState={bridgeState}
            bridgeFacts={bridgeFacts}
            scanContext={runtimeScanContext}
            localSummary={localSummary}
          />
          <AnalysisVersionBadge />
        </div>
      </div>
    </div>
  );
}

function AuditStatusHero({
  executionMode,
  nativeScanState,
  scanContext,
  bridgeState,
  bridgeFacts,
  localSummary,
}: {
  executionMode: AuditExecutionMode;
  nativeScanState: ScanState;
  scanContext: RuntimeScanContext | null;
  bridgeState: CurrentScanState | null;
  bridgeFacts: RuntimeScanFact[];
  localSummary: ScanComplete | null;
}) {
  const { t } = useTranslation();
  const selectedTotal =
    executionMode === "native"
      ? scanContext?.selectedTools.length ?? 0
      : bridgeState?.selectedTools.length ?? 0;
  const completedTotal =
    executionMode === "native"
      ? scanContext?.completedTools.length ?? 0
      : countBridgeCompletedTools(bridgeState);
  const running =
    executionMode === "native"
      ? nativeScanState === "scanning"
      : bridgeState?.status === "awaiting_handshake" ||
        bridgeState?.status === "in_progress";
  const complete =
    executionMode === "native"
      ? nativeScanState === "complete"
      : bridgeState?.status === "complete";
  const totals =
    executionMode === "native"
      ? localSummary?.totals ?? scanContext?.totals
      : totalsFromBridgeState(bridgeState, bridgeFacts);
  const hasError = bridgeState?.status === "error" || (totals?.errors ?? 0) > 0;
  const visibleMetrics = totals
    ? [
        {
          label: t("analysisPanel.metrics.critical", {
            defaultValue: "Critical",
          }),
          value: totals.critical,
          tone: "red" as const,
        },
        {
          label: t("analysisPanel.metrics.warnings", {
            defaultValue: "Warnings",
          }),
          value: totals.warning,
          tone: "orange" as const,
        },
        {
          label: t("analysisPanel.metrics.info", {
            defaultValue: "Info",
          }),
          value: totals.info,
          tone: "muted" as const,
        },
        {
          label: t("analysisPanel.metrics.errors", {
            defaultValue: "Errors",
          }),
          value: totals.errors,
          tone: "red" as const,
        },
      ].filter((metric) => metric.value > 0)
    : [];
  const progress =
    selectedTotal > 0
      ? Math.min(100, Math.round((completedTotal / selectedTotal) * 100))
      : complete
        ? 100
        : 0;
  const visualProgress = running ? Math.max(progress, 8) : progress;
  const mascot = pickMascot({
    running,
    complete,
    hasError,
    totals,
    t,
  });
  const statusLabel = hasError
    ? t("analysisHero.error", { defaultValue: "Error" })
    : running
    ? t("analysisHero.scanning", { defaultValue: "Analysis in progress" })
    : complete
      ? totals && (totals.critical > 0 || totals.errors > 0)
        ? t("analysisHero.issues", { defaultValue: "Issues found" })
        : totals && totals.warning > 0
          ? t("analysisHero.warnings", { defaultValue: "Warnings found" })
          : t("analysisHero.topReady", { defaultValue: "Top-ready result" })
      : t("analysisHero.ready", { defaultValue: "Ready for analysis" });
  const dotClass = hasError
    ? "bg-red-600"
    : running
      ? "bg-status-working animate-pulse"
      : "bg-status-complete";

  return (
    <section className="rounded-lg border border-orange-100 bg-white px-5 py-4 shadow-sm">
      <div className="flex items-center gap-4">
        <img
          src={mascot.src}
          alt={mascot.alt}
          className="h-20 w-20 shrink-0"
          draggable={false}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-orange-600">
                {t("analysisHero.auditMethod", {
                  defaultValue: "Validation method",
                })}
              </p>
              <div className="mt-1 flex items-center gap-2">
                <span className={`h-2.5 w-2.5 rounded-full ${dotClass}`} />
                <h1 className="text-lg font-semibold text-outline-900">
                  {statusLabel}
                </h1>
              </div>
            </div>
            <span className="rounded-full border border-orange-200 bg-orange-50 px-2.5 py-1 font-mono text-xs font-semibold text-outline-900/55">
              {completedTotal} / {selectedTotal}
            </span>
          </div>

          <div
            className="mt-3 h-2 overflow-hidden rounded-full bg-outline-900/10"
            role="progressbar"
            aria-valuenow={progress}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className={`h-full rounded-full transition-all duration-300 ${
                hasError ? "bg-red-600" : "bg-primary"
              } ${
                running ? "toraseo-progress-stripes" : ""
              }`}
              style={{ width: `${visualProgress}%` }}
            />
          </div>

          {visibleMetrics.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2 text-xs text-outline-900/60">
              {visibleMetrics.map((metric) => (
                <Metric
                  key={metric.label}
                  label={metric.label}
                  value={metric.value}
                  tone={metric.tone}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function SiteDashboardBoard({
  executionMode,
  nativeScanState,
  scanContext,
  bridgeState,
  bridgeFacts,
  localSummary,
}: {
  executionMode: AuditExecutionMode;
  nativeScanState: ScanState;
  scanContext: RuntimeScanContext | null;
  bridgeState: CurrentScanState | null;
  bridgeFacts: RuntimeScanFact[];
  localSummary: ScanComplete | null;
}) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language.startsWith("ru") ? "ru" : "en";
  const selectedTools =
    executionMode === "native"
      ? scanContext?.selectedTools ?? []
      : bridgeState?.selectedTools ?? [];
  const completedTools =
    executionMode === "native"
      ? scanContext?.completedTools ?? []
      : getBridgeCompletedTools(bridgeState);
  const totals =
    executionMode === "native"
      ? localSummary?.totals ?? scanContext?.totals
      : totalsFromBridgeState(bridgeState, bridgeFacts);
  const facts =
    executionMode === "native" ? scanContext?.facts ?? [] : bridgeFacts;
  const hasRun =
    executionMode === "native"
      ? nativeScanState !== "idle"
      : Boolean(bridgeState);
  const complete =
    executionMode === "native"
      ? nativeScanState === "complete"
      : bridgeState?.status === "complete";
  const findingsTotal = totals
    ? totals.critical + totals.warning + totals.info + totals.errors
    : 0;
  const cleanTools = countCleanTools(selectedTools, completedTools, facts);
  const healthScore =
    complete && totals
      ? calculateAuditHealthScore(totals, selectedTools.length)
      : null;
  const healthMeta = getHealthMeta(healthScore, t);
  const coverage =
    selectedTools.length > 0
      ? Math.round((completedTools.length / selectedTools.length) * 100)
      : 0;
  const categories = buildToolCategories(
    selectedTools,
    completedTools,
    facts,
    t,
  );
  const topSignals = [...facts]
    .sort((a, b) => severityWeight(b.severity) - severityWeight(a.severity))
    .slice(0, 4);

  return (
    <section className="grid gap-4">
      <div className="grid gap-3 lg:grid-cols-4">
        <DashboardMetricCard
          icon={<Gauge size={17} />}
          label={t("siteDashboard.health", {
            defaultValue: "SEO readiness",
          })}
          value={healthScore === null ? "--" : `${healthScore}%`}
          detail={healthMeta.label}
          tone={healthMeta.tone}
          ringValue={healthScore}
        />
        <DashboardMetricCard
          icon={<Activity size={17} />}
          label={t("siteDashboard.coverage", {
            defaultValue: "Audit coverage",
          })}
          value={hasRun ? `${coverage}%` : "--"}
          detail={t("siteDashboard.coverageDetail", {
            completed: completedTools.length,
            total: selectedTools.length,
            defaultValue: `${completedTools.length}/${selectedTools.length} tools`,
          })}
          tone={coverage >= 100 ? "green" : hasRun ? "orange" : "muted"}
          ringValue={hasRun ? coverage : null}
        />
        <DashboardMetricCard
          icon={<CheckCircle2 size={17} />}
          label={t("siteDashboard.cleanTools", {
            defaultValue: "{{completed}}/{{total}} tools",
          })}
          value={hasRun ? String(cleanTools) : "--"}
          detail={t("siteDashboard.cleanToolsDetail", {
            defaultValue: "completed without blocking issues",
          })}
          tone={cleanTools > 0 ? "green" : "muted"}
        />
        <DashboardMetricCard
          icon={<ShieldAlert size={17} />}
          label={t("siteDashboard.findings", {
            defaultValue: "Issues found",
          })}
          value={hasRun ? String(findingsTotal) : "--"}
          detail={t("siteDashboard.findingsDetail", {
            defaultValue: "critical, warnings, info, errors",
          })}
          tone={findingsTotal > 0 ? "orange" : hasRun ? "green" : "muted"}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-lg border border-orange-100 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-outline-900">
                {t("siteDashboard.issueDistribution", {
                  defaultValue: "Status distribution",
                })}
              </h2>
              <p className="mt-1 text-xs leading-relaxed text-outline-900/55">
                {t("siteDashboard.healthNote", {
                  defaultValue: "This is a score for selected checks, not a traffic, popularity, or ranking metric.",
                })}
              </p>
            </div>
            <span className="rounded-full bg-orange-50 px-2.5 py-1 text-xs font-semibold text-outline-900/60">
              {complete
                ? t("siteDashboard.complete", { defaultValue: "Ready" })
                : hasRun
                  ? t("siteDashboard.inProgress", {
                      defaultValue: "In progress",
                    })
                  : t("siteDashboard.waiting", {
                      defaultValue: "Waiting",
                    })}
            </span>
          </div>
          <IssueDistributionBar totals={totals} />
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
            <DistributionLegend
              label={t("analysisPanel.metrics.critical", {
                defaultValue: "Critical",
              })}
              value={totals?.critical ?? 0}
              className="bg-red-500"
            />
            <DistributionLegend
              label={t("analysisPanel.metrics.warnings", {
                defaultValue: "Warnings",
              })}
              value={totals?.warning ?? 0}
              className="bg-orange-500"
            />
            <DistributionLegend
              label={t("analysisPanel.metrics.info", {
                defaultValue: "Info",
              })}
              value={totals?.info ?? 0}
              className="bg-blue-400"
            />
            <DistributionLegend
              label={t("analysisPanel.metrics.errors", {
                defaultValue: "Errors",
              })}
              value={totals?.errors ?? 0}
              className="bg-outline-900"
            />
          </div>
        </div>

        <div className="rounded-lg border border-orange-100 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <ListChecks size={16} className="text-primary" />
            <h2 className="text-sm font-semibold text-outline-900">
              {t("siteDashboard.toolGroups", {
                defaultValue: "Audit directions",
              })}
            </h2>
          </div>
          <div className="space-y-2">
            {categories.map((category) => (
              <ToolCategoryRow key={category.id} category={category} />
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-orange-100 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-outline-900">
          {t("siteDashboard.topSignals", {
            defaultValue: "Fix first",
          })}
        </h2>
        {topSignals.length > 0 ? (
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            {topSignals.map((fact, index) => (
              <SignalCard key={`${fact.toolId}-${fact.title}-${index}`} fact={fact} />
            ))}
          </div>
        ) : (
          <p className="mt-2 text-sm text-outline-900/55">
            {hasRun
              ? t("siteDashboard.noSignalsYet", {
                  defaultValue: "Signals will appear here as tools return structured facts.",
                })
              : t("siteDashboard.startPrompt", {
                  defaultValue: "Run the default audit preset to fill this board with site facts, metrics, and next actions.",
                })}
          </p>
        )}
      </div>
    </section>
  );
}

function AnalysisVersionBadge() {
  const { i18n } = useTranslation();
  const isRu = i18n.language.startsWith("ru");
  const locale = isRu ? "ru" : "en";
  return (
    <div className="rounded-lg border border-orange-100 bg-white px-4 py-3 text-xs font-semibold uppercase tracking-wider text-outline-900/45 shadow-sm">
      {getAnalysisVersionText("site_by_url", locale)}
    </div>
  );
}

function DashboardMetricCard({
  icon,
  label,
  value,
  detail,
  tone,
  ringValue,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  detail: string;
  tone: "green" | "orange" | "red" | "muted";
  ringValue?: number | null;
}) {
  const toneClass =
    tone === "green"
      ? "text-emerald-600"
      : tone === "orange"
        ? "text-orange-600"
        : tone === "red"
          ? "text-red-600"
          : "text-outline-900/55";
  return (
    <div className="rounded-lg border border-orange-100 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <span className="rounded-md bg-orange-50 p-2 text-primary">
          {icon}
        </span>
        {typeof ringValue === "number" ? (
          <ScoreRing value={ringValue} className={toneClass} />
        ) : (
          <span className={`font-mono text-2xl font-semibold ${toneClass}`}>
            {value}
          </span>
        )}
      </div>
      <h2 className="mt-3 text-sm font-semibold text-outline-900">{label}</h2>
      <p className="mt-1 text-xs leading-relaxed text-outline-900/55">
        {detail}
      </p>
    </div>
  );
}

function ScoreRing({
  value,
  className,
}: {
  value: number;
  className: string;
}) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <span
      className={`grid h-14 w-14 place-items-center rounded-full ${className}`}
      style={{
        background: `conic-gradient(currentColor ${clamped * 3.6}deg, rgba(120, 72, 42, 0.12) 0deg)`,
      }}
    >
      <span className="grid h-10 w-10 place-items-center rounded-full bg-white">
        <span className={`font-mono text-sm font-semibold ${className}`}>
          {clamped}
        </span>
      </span>
    </span>
  );
}

function IssueDistributionBar({
  totals,
}: {
  totals:
    | {
        critical: number;
        warning: number;
        info: number;
        errors: number;
      }
    | undefined;
}) {
  const critical = totals?.critical ?? 0;
  const warning = totals?.warning ?? 0;
  const info = totals?.info ?? 0;
  const errors = totals?.errors ?? 0;
  const total = critical + warning + info + errors;
  if (total === 0) {
    return (
      <div className="h-4 overflow-hidden rounded-full bg-emerald-100">
        <div className="h-full w-full rounded-full bg-emerald-500 transition-all duration-700" />
      </div>
    );
  }

  return (
    <div className="flex h-4 overflow-hidden rounded-full bg-outline-900/10">
      <BarSegment value={critical} total={total} className="bg-red-500" />
      <BarSegment value={warning} total={total} className="bg-orange-500" />
      <BarSegment value={info} total={total} className="bg-blue-400" />
      <BarSegment value={errors} total={total} className="bg-outline-900" />
    </div>
  );
}

function BarSegment({
  value,
  total,
  className,
}: {
  value: number;
  total: number;
  className: string;
}) {
  if (value <= 0) return null;
  return (
    <div
      className={`h-full transition-all duration-700 ${className}`}
      style={{ width: `${(value / total) * 100}%` }}
    />
  );
}

function DistributionLegend({
  label,
  value,
  className,
}: {
  label: string;
  value: number;
  className: string;
}) {
  return (
    <div className="flex items-center gap-2 rounded-md bg-orange-50/60 px-2 py-1.5 text-outline-900/65">
      <span className={`h-2.5 w-2.5 rounded-full ${className}`} />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <span className="font-mono font-semibold text-outline-900">{value}</span>
    </div>
  );
}

interface ToolCategory {
  id: string;
  label: string;
  completed: number;
  total: number;
  issues: number;
  severity: RuntimeScanFact["severity"] | "pending";
}

function ToolCategoryRow({ category }: { category: ToolCategory }) {
  const { t } = useTranslation();
  const progress =
    category.total > 0
      ? Math.round((category.completed / category.total) * 100)
      : 0;
  const meta = getCategoryMeta(category.severity, progress);
  const issueText = t("siteDashboard.categoryIssues", {
    count: category.issues,
    defaultValue: "{{count}} issues",
  });
  const completedText = t("siteDashboard.categoryCompletedChecks", {
    completed: category.completed,
    total: category.total,
    defaultValue: "{{completed}}/{{total}} checks completed",
  });
  return (
    <div className="rounded-md border border-orange-100 bg-orange-50/30 px-3 py-2">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-outline-900">
          {category.label}
        </span>
        <span className={`text-xs font-semibold ${meta.textClass}`}>
          {category.issues > 0 ? issueText : `${category.completed}/${category.total}`}
        </span>
      </div>
      <p className="mt-1 text-xs text-outline-900/50">
        {completedText}
      </p>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-outline-900/10">
        <div
          className={`h-full rounded-full transition-all duration-500 ${meta.barClass}`}
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}

function SignalCard({ fact }: { fact: RuntimeScanFact }) {
  const meta = getSeverityMeta(fact.severity);
  return (
    <article className="rounded-md border border-orange-100 bg-orange-50/30 p-3">
      <div className="flex items-start justify-between gap-3">
        <h3 className="min-w-0 text-sm font-medium text-outline-900">
          {formatFactTitle(fact)}
        </h3>
        <span className={`text-xs font-semibold uppercase ${meta.className}`}>
          {meta.label}
        </span>
      </div>
      <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-outline-900/65">
        {formatFactDetail(fact.detail)}
      </p>
    </article>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "red" | "orange" | "muted";
}) {
  const toneClass =
    tone === "red"
      ? "text-red-600"
      : tone === "orange"
        ? "text-orange-600"
        : "text-outline-900/55";
  return (
    <span className="rounded-full bg-orange-50 px-2 py-1">
      <span className={`font-mono font-semibold ${toneClass}`}>{value}</span>{" "}
      {label}
    </span>
  );
}

function totalsFromBridgeFacts(facts: RuntimeScanFact[]) {
  return facts.reduce(
    (acc, fact) => {
      if (fact.severity === "critical") acc.critical += 1;
      if (fact.severity === "warning") acc.warning += 1;
      if (fact.severity === "ok") acc.info += 1;
      if (fact.severity === "error") acc.errors += 1;
      return acc;
    },
    { critical: 0, warning: 0, info: 0, errors: 0 },
  );
}

function getBridgeCompletedTools(state: CurrentScanState | null): ToolId[] {
  if (!state) return [];
  return state.selectedTools.filter((toolId) => {
    const entry = state.buffer[toolId];
    return entry?.status === "complete" || entry?.status === "error";
  });
}

function countBridgeCompletedTools(state: CurrentScanState | null): number {
  return getBridgeCompletedTools(state).length;
}

function totalsFromBridgeState(
  state: CurrentScanState | null,
  facts: RuntimeScanFact[],
):
  | {
      critical: number;
      warning: number;
      info: number;
      errors: number;
    }
  | undefined {
  if (!state) return facts.length > 0 ? totalsFromBridgeFacts(facts) : undefined;

  const totals = { critical: 0, warning: 0, info: 0, errors: 0 };
  let hasAnyCompleted = false;
  for (const toolId of state.selectedTools) {
    const entry = state.buffer[toolId];
    if (!entry) continue;
    if (entry.status === "error") {
      totals.errors += 1;
      hasAnyCompleted = true;
      continue;
    }
    if (entry.status !== "complete") continue;
    hasAnyCompleted = true;
    totals.critical += entry.summary?.critical ?? 0;
    totals.warning += entry.summary?.warning ?? 0;
    totals.info += entry.summary?.info ?? 0;
  }

  return hasAnyCompleted ? totals : undefined;
}

function calculateAuditHealthScore(
  totals: {
    critical: number;
    warning: number;
    info: number;
    errors: number;
  },
  selectedToolsCount: number,
): number {
  const toolFloor = Math.max(1, selectedToolsCount);
  const penalty =
    totals.errors * 18 +
    totals.critical * 14 +
    totals.warning * 6 +
    totals.info * 1;
  const normalizedPenalty = Math.round(penalty / Math.sqrt(toolFloor));
  return Math.max(0, Math.min(100, 100 - normalizedPenalty));
}

function getHealthMeta(
  score: number | null,
  t: ReturnType<typeof useTranslation>["t"],
): { label: string; tone: "green" | "orange" | "red" | "muted" } {
  if (score === null) {
    return {
      label: t("siteDashboard.notScored", { defaultValue: "not scored yet" }),
      tone: "muted",
    };
  }
  if (score >= 90) {
    return {
      label: t("siteDashboard.healthExcellent", {
        defaultValue: "technical baseline looks clean",
      }),
      tone: "green",
    };
  }
  if (score >= 70) {
    return {
      label: t("siteDashboard.healthGood", {
        defaultValue: "usable with fixes",
      }),
      tone: "green",
    };
  }
  if (score >= 45) {
    return {
      label: t("siteDashboard.healthNeedsWork", {
        defaultValue: "needs focused repair",
      }),
      tone: "orange",
    };
  }
  return {
    label: t("siteDashboard.healthPoor", {
      defaultValue: "blocking issues likely",
    }),
    tone: "red",
  };
}

function buildToolCategories(
  selectedTools: ToolId[],
  completedTools: ToolId[],
  facts: RuntimeScanFact[],
  t: ReturnType<typeof useTranslation>["t"],
): ToolCategory[] {
  const groups: Array<{ id: string; label: string; tools: ToolId[] }> = [
    {
      id: "indexability",
      label: t("siteDashboard.groups.indexability", {
        defaultValue: "Indexability",
      }),
      tools: ["analyze_indexability", "check_robots_txt"],
    },
    {
      id: "metadata",
      label: t("siteDashboard.groups.metadata", {
        defaultValue: "Metadata and canonical",
      }),
      tools: ["analyze_meta", "analyze_canonical"],
    },
    {
      id: "structure",
      label: t("siteDashboard.groups.structure", {
        defaultValue: "Structure and links",
      }),
      tools: ["analyze_headings", "analyze_links"],
    },
    {
      id: "content",
      label: t("siteDashboard.groups.content", {
        defaultValue: "Content readiness",
      }),
      tools: ["analyze_content"],
    },
    {
      id: "crawl",
      label: t("siteDashboard.groups.crawl", {
        defaultValue: "Sitemap and redirects",
      }),
      tools: ["analyze_sitemap", "check_redirects"],
    },
    {
      id: "technical",
      label: t("siteDashboard.groups.technical", {
        defaultValue: "Technical signals",
      }),
      tools: ["scan_site_minimal", "detect_stack"],
    },
  ];

  return groups.map((group) => {
    const selected = group.tools.filter((toolId) =>
      selectedTools.includes(toolId),
    );
    const completed = selected.filter((toolId) =>
      completedTools.includes(toolId),
    );
    const severity = worstSeverityForTools(selected, facts);
    const issues = facts.filter(
      (fact) =>
        selected.includes(fact.toolId) &&
        (fact.severity === "critical" ||
          fact.severity === "warning" ||
          fact.severity === "error"),
    ).length;
    return {
      id: group.id,
      label: group.label,
      completed: completed.length,
      total: selected.length,
      issues,
      severity: completed.length === 0 ? "pending" : severity,
    };
  });
}

function worstSeverityForTools(
  tools: ToolId[],
  facts: RuntimeScanFact[],
): RuntimeScanFact["severity"] {
  return facts
    .filter((fact) => tools.includes(fact.toolId))
    .reduce<RuntimeScanFact["severity"]>(
      (worst, fact) =>
        severityWeight(fact.severity) > severityWeight(worst)
          ? fact.severity
          : worst,
      "ok",
    );
}

function countCleanTools(
  selectedTools: ToolId[],
  completedTools: ToolId[],
  facts: RuntimeScanFact[],
): number {
  return completedTools.filter((toolId) => {
    if (!selectedTools.includes(toolId)) return false;
    return !facts.some(
      (fact) =>
        fact.toolId === toolId &&
        (fact.severity === "critical" ||
          fact.severity === "warning" ||
          fact.severity === "error"),
    );
  }).length;
}

function severityWeight(severity: RuntimeScanFact["severity"]): number {
  if (severity === "error") return 4;
  if (severity === "critical") return 3;
  if (severity === "warning") return 2;
  return 1;
}

function getCategoryMeta(
  severity: RuntimeScanFact["severity"] | "pending",
  progress: number,
) {
  if (severity === "error" || severity === "critical") {
    return { textClass: "text-red-600", barClass: "bg-red-500" };
  }
  if (severity === "warning") {
    return { textClass: "text-orange-600", barClass: "bg-orange-500" };
  }
  if (progress >= 100) {
    return { textClass: "text-emerald-600", barClass: "bg-emerald-500" };
  }
  return { textClass: "text-outline-900/55", barClass: "bg-primary" };
}

function getSeverityMeta(severity: RuntimeScanFact["severity"]) {
  if (severity === "error") {
    return { label: "error", className: "text-red-700" };
  }
  if (severity === "critical") {
    return { label: "critical", className: "text-red-600" };
  }
  if (severity === "warning") {
    return { label: "warning", className: "text-orange-600" };
  }
  return { label: "ok", className: "text-emerald-600" };
}

function formatFactTitle(fact: RuntimeScanFact): string {
  const keyBase = getToolI18nKeyBase(fact.toolId);
  if (fact.title === keyBase) return keyBase;
  return fact.title;
}

function formatFactDetail(detail: string): string {
  const normalized = detail.toLowerCase();
  if (normalized.includes("http 200")) return detail.replace(/^HTTP 200/i, "HTTP 200");
  return detail.replace(/^Detected likely stack signals:/i, "Detected likely technology signals:");
}

function pickMascot({
  running,
  complete,
  hasError,
  totals,
  t,
}: {
  running: boolean;
  complete: boolean;
  hasError: boolean;
  totals:
    | {
        critical: number;
        warning: number;
        info: number;
        errors: number;
      }
    | undefined;
  t: ReturnType<typeof useTranslation>["t"];
}) {
  if (hasError) {
    return {
      src: surprisedMascot,
      alt: t("app.altMascotSurprised", {
        defaultValue: "ToraSEO mascot surprised by issues",
      }),
    };
  }
  if (running) {
    return {
      src: focusedMascot,
      alt: t("app.altMascotFocused"),
    };
  }
  if (complete && totals) {
    if (totals.errors > 0) {
      return {
        src: surprisedMascot,
        alt: t("app.altMascotSurprised", {
          defaultValue: "ToraSEO mascot focused on the analysis",
        }),
      };
    }
    return {
      src: happyMascot,
      alt: t("app.altMascotHappy"),
    };
  }
  if (totals && (totals.critical > 0 || totals.warning > 0 || totals.errors > 0)) {
    return {
      src: happyMascot,
      alt: t("app.altMascotHappy"),
    };
  }
  return {
    src: neutralMascot,
    alt: t("app.altMascotNeutral", {
      defaultValue: "ToraSEO mascot - analysis complete",
    }),
  };
}
