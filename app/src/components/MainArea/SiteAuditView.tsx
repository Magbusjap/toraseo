import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { TOOLS, type ToolId, getToolI18nKeyBase } from "../../config/tools";
import type { ScanComplete } from "../../types/ipc";
import type { ScanState, StagesMap, StageState } from "../../hooks/useScan";
import Mascot, { type MascotMood } from "../Mascot/Mascot";

interface SiteAuditViewProps {
  url: string;
  scanState: ScanState;
  selectedTools: Set<ToolId>;
  stages: StagesMap;
  summary: ScanComplete | null;
}

/**
 * SiteAuditView — main area in Site Audit mode.
 *
 * Three visual sections:
 *   1. Header (logo + status indicator + mascot + URL)
 *   2. Progress bar (X / N stages completed)
 *   3. List of selected tools with statuses and verdict counters
 *
 * After the scan finishes, a "Summary" block shows aggregate
 * counts (critical / warning / info / errors).
 *
 * The detailed expandable per-tool report is the next iteration
 * (step 7 in the roadmap). Today the user sees "X warnings, Y
 * critical" next to each stage but without the full breakdown.
 */
export default function SiteAuditView({
  url,
  scanState,
  selectedTools,
  stages,
  summary,
}: SiteAuditViewProps) {
  const { t } = useTranslation();
  const trimmedUrl = url.trim();
  const orderedSelectedTools = TOOLS.filter((tool) => selectedTools.has(tool.id));
  const totalSelected = orderedSelectedTools.length;
  const finishedCount = orderedSelectedTools.filter((tool) =>
    isFinished(stages[tool.id]?.status),
  ).length;

  // For the mascot picture we want the OVERALL feel of the run.
  const mascotState = pickMascotState(scanState, summary, t);

  return (
    <div className="flex h-full flex-col px-8 py-8">
      {/* Header — logo + status + URL */}
      <header className="mb-6 flex flex-col items-center gap-3 text-center">
        <h1 className="font-display text-2xl font-bold tracking-tight text-outline-900">
          {t("app.name")}
        </h1>
        <StatusIndicator scanState={scanState} summary={summary} />
        <Mascot mood={mascotState.mood} className="h-32 w-32" />
        {trimmedUrl ? (
          <p className="font-mono text-sm text-outline-900/70">{trimmedUrl}</p>
        ) : (
          <p className="text-sm text-outline-900/50">
            {t("siteAudit.enterUrl")}
          </p>
        )}
      </header>

      {/* Stage list — only when there's something to show */}
      {totalSelected > 0 && (
        <section className="mx-auto w-full max-w-2xl">
          {/* Progress meta */}
          {scanState === "scanning" && (
            <div className="mb-3 flex items-center justify-between text-sm text-outline-900/70">
              <span>{t("siteAudit.scanStarted")}</span>
              <span className="font-mono">
                {finishedCount} / {totalSelected}
              </span>
            </div>
          )}
          {scanState === "scanning" && (
            <div
              className="mb-5 h-1.5 overflow-hidden rounded-full bg-outline-900/10"
              role="progressbar"
              aria-valuenow={finishedCount}
              aria-valuemin={0}
              aria-valuemax={totalSelected}
            >
              <div
                className="h-full bg-primary transition-all duration-300"
                style={{
                  width: `${(finishedCount / totalSelected) * 100}%`,
                }}
              />
            </div>
          )}

          {/* Stages */}
          <ul className="space-y-1.5">
            {orderedSelectedTools.map((tool) => (
              <StageRow
                key={tool.id}
                toolId={tool.id}
                label={t(`tools.${getToolI18nKeyBase(tool.id)}.label`)}
                state={stages[tool.id]}
                scanState={scanState}
              />
            ))}
          </ul>
        </section>
      )}

      {/* Summary — only after a scan completes */}
      {scanState === "complete" && summary && (
        <SummaryBlock summary={summary} />
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------
 * Status indicator (top of the page)
 * ------------------------------------------------------------------------- */

interface StatusIndicatorProps {
  scanState: ScanState;
  summary: ScanComplete | null;
}

function StatusIndicator({ scanState, summary }: StatusIndicatorProps) {
  const { t } = useTranslation();
  const meta = getStatusMeta(scanState, summary, t);
  return (
    <div className="flex items-center gap-2 text-sm text-outline-900/70">
      <span
        className={`h-2.5 w-2.5 rounded-full ${meta.dotClass}`}
        aria-hidden="true"
      />
      <span>{meta.label}</span>
    </div>
  );
}

function getStatusMeta(
  scanState: ScanState,
  summary: ScanComplete | null,
  t: TFunction,
): { dotClass: string; label: string } {
  switch (scanState) {
    case "idle":
      return { dotClass: "bg-status-complete", label: t("siteAudit.status.ready") };
    case "scanning":
      return {
        dotClass: "bg-status-working animate-pulse",
        label: t("siteAudit.status.scanning"),
      };
    case "complete":
      if (!summary) {
        return {
          dotClass: "bg-status-complete",
          label: t("siteAudit.status.completed"),
        };
      }
      if (summary.totals.errors > 0) {
        return {
          dotClass: "bg-red-600",
          label: t("siteAudit.status.executionErrors"),
        };
      }
      if (summary.totals.critical > 0) {
        return {
          dotClass: "bg-red-600",
          label: t("siteAudit.status.issuesFound"),
        };
      }
      if (summary.totals.warning > 0) {
        return {
          dotClass: "bg-status-issues",
          label: t("siteAudit.status.warnings"),
        };
      }
      return {
        dotClass: "bg-status-complete",
        label: t("siteAudit.status.allClean"),
      };
  }
}

/* -------------------------------------------------------------------------
 * One stage row
 * ------------------------------------------------------------------------- */

interface StageRowProps {
  toolId: ToolId;
  label: string;
  state: StageState | undefined;
  scanState: ScanState;
}

function StageRow({ toolId, label, state, scanState }: StageRowProps) {
  const { t } = useTranslation();
  // Idle: never started a scan yet — show muted "ready to run" state.
  // Otherwise reflect the per-tool status from useScan.
  const status = state?.status ?? (scanState === "idle" ? "pending" : "pending");
  const visual = getStageVisual(status, t);

  // Build a short "issues badge" only when finished with verdicts.
  const summary = state?.summary;
  const showSummary =
    summary !== undefined &&
    (status === "ok" ||
      status === "warning" ||
      status === "critical");

  return (
    <li
      key={toolId}
      className={`flex flex-col gap-1 rounded-md px-3 py-2.5 text-sm transition ${visual.bgClass}`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span
            className={`inline-flex h-5 w-5 items-center justify-center text-xs ${visual.iconClass}`}
            aria-hidden="true"
          >
            {visual.icon}
          </span>
          <span className="text-outline-900">{label}</span>
        </div>

        <div className="flex items-center gap-2 text-xs text-outline-900/60">
          {status === "error" && state?.errorCode ? (
            <span
              className="font-mono text-status-issues"
              title={state.errorMessage}
            >
              {state.errorCode}
            </span>
          ) : showSummary && summary ? (
            <IssuesBadge
              critical={summary.critical}
              warning={summary.warning}
              info={summary.info}
            />
          ) : (
            <span>{visual.label}</span>
          )}
        </div>
      </div>
      {/* Error detail — visible inline so the user doesn't need to
          hover the small badge to read what went wrong. */}
      {status === "error" && state?.errorMessage && (
        <p className="pl-8 font-mono text-[11px] text-red-700/80">
          {state.errorMessage}
        </p>
      )}
    </li>
  );
}

interface StageVisual {
  icon: string;
  iconClass: string;
  bgClass: string;
  label: string;
}

function getStageVisual(status: StageState["status"], t: TFunction): StageVisual {
  switch (status) {
    case "pending":
      return {
        icon: "○",
        iconClass: "text-outline-900/30",
        bgClass: "bg-white/40",
        label: t("siteAudit.stage.pending"),
      };
    case "running":
      return {
        icon: "⚙",
        iconClass: "text-status-working animate-spin",
        bgClass: "bg-blue-50/40",
        label: t("siteAudit.stage.running"),
      };
    case "ok":
      return {
        icon: "✓",
        iconClass: "text-status-complete",
        bgClass: "bg-green-50/40",
        label: t("siteAudit.stage.ok"),
      };
    case "warning":
      return {
        icon: "⚠",
        iconClass: "text-status-issues",
        bgClass: "bg-orange-50/60",
        label: t("siteAudit.stage.warning"),
      };
    case "critical":
      return {
        icon: "✗",
        iconClass: "text-red-600",
        bgClass: "bg-red-50/60",
        label: t("siteAudit.stage.critical"),
      };
    case "error":
      return {
        icon: "!",
        iconClass: "text-red-700",
        bgClass: "bg-red-50/60",
        label: t("siteAudit.stage.error"),
      };
  }
}

/* -------------------------------------------------------------------------
 * Issues badge — small inline counters
 * ------------------------------------------------------------------------- */

interface IssuesBadgeProps {
  critical: number;
  warning: number;
  info: number;
}

function IssuesBadge({ critical, warning, info }: IssuesBadgeProps) {
  const { t } = useTranslation();
  if (critical === 0 && warning === 0 && info === 0) {
    return <span className="text-status-complete">{t("siteAudit.issues.clean")}</span>;
  }
  return (
    <div className="flex items-center gap-2 font-mono">
      {critical > 0 && (
        <span className="text-red-600" title={t("siteAudit.issues.criticalTitle")}>
          ✗ {critical}
        </span>
      )}
      {warning > 0 && (
        <span className="text-status-issues" title={t("siteAudit.issues.warningTitle")}>
          ⚠ {warning}
        </span>
      )}
      {info > 0 && (
        <span className="text-outline-900/50" title={t("siteAudit.issues.infoTitle")}>
          ℹ {info}
        </span>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------
 * Summary block (after completion)
 * ------------------------------------------------------------------------- */

function SummaryBlock({ summary }: { summary: ScanComplete }) {
  const { t } = useTranslation();
  const { totals, durationMs } = summary;
  const seconds = (durationMs / 1000).toFixed(1);

  return (
    <section className="mx-auto mt-6 w-full max-w-2xl rounded-lg border border-outline/10 bg-white px-5 py-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-outline-900">
          {t("siteAudit.summary.title")}
        </h2>
        <span className="font-mono text-xs text-outline-900/60">
          {t("siteAudit.summary.seconds", { seconds })}
        </span>
      </div>
      <div className="grid grid-cols-4 gap-3 text-center">
        <SummaryTile
          label="Critical"
          value={totals.critical}
          accentClass="text-red-600"
        />
        <SummaryTile
          label="Warning"
          value={totals.warning}
          accentClass="text-status-issues"
        />
        <SummaryTile
          label="Info"
          value={totals.info}
          accentClass="text-outline-900/60"
        />
        <SummaryTile
          label={t("siteAudit.summary.errors")}
          value={totals.errors}
          accentClass="text-red-700"
        />
      </div>
    </section>
  );
}

function SummaryTile({
  label,
  value,
  accentClass,
}: {
  label: string;
  value: number;
  accentClass: string;
}) {
  return (
    <div className="rounded-md bg-orange-50/40 py-2.5">
      <div className={`font-mono text-xl font-semibold ${accentClass}`}>
        {value}
      </div>
      <div className="text-[11px] uppercase tracking-wider text-outline-900/50">
        {label}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------
 * Helpers
 * ------------------------------------------------------------------------- */

function isFinished(status: StageState["status"] | undefined): boolean {
  return (
    status === "ok" ||
    status === "warning" ||
    status === "critical" ||
    status === "error"
  );
}

interface MascotPick {
  mood: MascotMood;
}

function pickMascotState(
  scanState: ScanState,
  summary: ScanComplete | null,
  _t: TFunction,
): MascotPick {
  if (scanState === "scanning") {
    return { mood: "focused" };
  }
  if (scanState === "complete" && summary) {
    return {
      mood: summary.totals.errors > 0
        ? "surprised"
        : "happy",
    };
  }
  return {
    mood: "neutral",
  };
}
