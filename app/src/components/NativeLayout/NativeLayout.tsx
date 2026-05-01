import { AnalysisPanel } from "../Analysis";
import { Globe, SlidersHorizontal } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { CurrentScanState, ScanComplete } from "../../types/ipc";
import type { ScanState } from "../../hooks/useScan";
import type {
  AuditExecutionMode,
  RuntimeAuditReport,
  RuntimeScanContext,
  RuntimeScanFact,
} from "../../types/runtime";
import sleepingMascot from "@branding/mascots/tora-sleeping.svg";
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
                    defaultValue: "0.0.9 setup",
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
          <AnalysisPanel
            executionMode={executionMode}
            nativeScanState={nativeScanState}
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
      : bridgeFacts.length;
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
      : bridgeFacts.length > 0
        ? totalsFromBridgeFacts(bridgeFacts)
        : undefined;
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
    totals,
    t,
  });
  const statusLabel = running
    ? t("analysisHero.scanning", { defaultValue: "Analysis in progress" })
    : complete
      ? totals && (totals.critical > 0 || totals.errors > 0)
        ? t("analysisHero.issues", { defaultValue: "Issues found" })
        : totals && totals.warning > 0
          ? t("analysisHero.warnings", { defaultValue: "Warnings found" })
          : t("analysisHero.topReady", { defaultValue: "Top-ready result" })
      : t("analysisHero.ready", { defaultValue: "Ready to scan" });

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
                {executionMode === "native"
                  ? t("analysisHero.nativeMode", {
                      defaultValue: "API + AI Chat",
                    })
                  : t("analysisHero.bridgeMode", {
                      defaultValue: "MCP + Instructions",
                    })}
              </p>
              <h1 className="mt-1 text-lg font-semibold text-outline-900">
                {statusLabel}
              </h1>
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
              className={`h-full rounded-full bg-primary transition-all duration-300 ${
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

function pickMascot({
  running,
  complete,
  totals,
  t,
}: {
  running: boolean;
  complete: boolean;
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
  if (running) {
    return {
      src: focusedMascot,
      alt: t("app.altMascotFocused"),
    };
  }
  if (complete && totals) {
    if (totals.critical > 0 || totals.errors > 0) {
      return {
        src: surprisedMascot,
        alt: t("app.altMascotSurprised", {
          defaultValue: "ToraSEO mascot surprised by issues",
        }),
      };
    }
    if (totals.warning > 0) {
      return {
        src: neutralMascot,
        alt: t("app.altMascotNeutral", {
          defaultValue: "ToraSEO mascot reviewing warnings",
        }),
      };
    }
    return {
      src: championMascot,
      alt: t("app.altMascotChampion", {
        defaultValue: "ToraSEO champion mascot",
      }),
    };
  }
  if (totals && (totals.critical > 0 || totals.warning > 0 || totals.errors > 0)) {
    return {
      src: happyMascot,
      alt: t("app.altMascotHappy"),
    };
  }
  return {
    src: sleepingMascot,
    alt: t("app.altMascotSleeping"),
  };
}
