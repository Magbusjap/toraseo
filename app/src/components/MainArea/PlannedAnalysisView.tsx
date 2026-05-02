import {
  FileText,
  Film,
  Globe,
  Image,
  ListChecks,
  Music2,
  PanelTop,
  ScanEye,
  SlidersHorizontal,
  Type,
  Video,
} from "lucide-react";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  ANALYSIS_TYPES,
  type AnalysisTypeId,
} from "../../config/analysisTypes";
import type { AnalysisToolId } from "../../config/analysisTools";
import type { ToolId } from "../../config/tools";
import type { AuditExecutionMode, RuntimeAuditReport } from "../../types/runtime";
import type { CurrentScanState, ToolBufferEntry } from "../../types/ipc";
import sleepingMascot from "@branding/mascots/tora-sleeping.svg";

interface PlannedAnalysisViewProps {
  analysisType: AnalysisTypeId;
  executionMode: AuditExecutionMode;
  selectedToolIds: AnalysisToolId[];
  activeRun: ArticleTextAction | null;
  completedTools: number;
  totalTools: number;
  bridgeState: CurrentScanState | null;
  scanStartedOnce: boolean;
  bridgeUnavailable: boolean;
  bridgeUnavailableAppName: string;
  bridgeTargetAppName: string;
  onArticleTextRun: (
    action: ArticleTextAction,
    data: ArticleTextPromptData,
  ) => Promise<void>;
  onArticleTextCancel: () => void;
}

export default function PlannedAnalysisView({
  analysisType,
  executionMode,
  selectedToolIds,
  activeRun,
  completedTools,
  totalTools,
  bridgeState,
  scanStartedOnce,
  bridgeUnavailable,
  bridgeUnavailableAppName,
  bridgeTargetAppName,
  onArticleTextRun,
  onArticleTextCancel,
}: PlannedAnalysisViewProps) {
  const { t } = useTranslation();
  const meta = ANALYSIS_TYPES.find((item) => item.id === analysisType);
  const key = meta?.i18nKeyBase ?? "siteByUrl";
  const title = t(`modeSelection.analysisTypes.${key}.title`);
  const subtitle = t(`modeSelection.analysisTypes.${key}.subtitle`);

  return (
    <div className="h-full overflow-auto px-8 py-7">
      <div className="mx-auto max-w-7xl">
        <header className="flex flex-wrap items-start justify-between gap-5 border-b border-outline/10 pb-6">
          <div className="flex min-w-0 items-start gap-4">
            <span className="rounded-lg bg-primary/10 p-3 text-primary">
              {iconForAnalysis(analysisType)}
            </span>
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wider text-outline-900/45">
                {t("plannedAnalysis.version", { defaultValue: "0.0.9 setup" })}
              </p>
              <h1 className="mt-1 font-display text-2xl font-semibold text-outline-900">
                {title}
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-outline-900/65">
                {subtitle}
              </p>
            </div>
          </div>
          <span className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-orange-50 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-outline-900/55">
            <SlidersHorizontal size={14} />
            {t("plannedAnalysis.status", { defaultValue: "Formula draft" })}
          </span>
        </header>

        <section className="py-6">
          <PlannedAnalysisStatusHero
            executionMode={executionMode}
            running={activeRun !== null}
            completedTools={completedTools}
            totalTools={totalTools}
          />
        </section>

        <section className="grid gap-5 pb-6 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-4">
            {renderInputSurface(
              analysisType,
              t,
              onArticleTextRun,
              onArticleTextCancel,
              activeRun,
              bridgeState,
              scanStartedOnce,
              bridgeUnavailable,
              bridgeUnavailableAppName,
              bridgeTargetAppName,
            )}
          </div>

          <aside className="space-y-4">
            <div className="rounded-lg border border-outline/10 bg-white p-4">
              <h2 className="font-display text-base font-semibold text-outline-900">
                {t("plannedAnalysis.policyTitle", {
                  defaultValue: "Formula policy",
                })}
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-outline-900/65">
                {t("plannedAnalysis.policyBody", {
                  defaultValue:
                    "The standard score remains 0-100%. The dynamic formula changes the evaluation criteria according to selected tools, but it does not pretend that a larger formula automatically means a cleaner or higher score.",
                })}
              </p>
            </div>

            <div className="rounded-lg border border-outline/10 bg-white p-4">
              <h2 className="font-display text-base font-semibold text-outline-900">
                {t("plannedAnalysis.executionTitle", {
                  defaultValue: "Execution boundary",
                })}
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-outline-900/65">
                {t("plannedAnalysis.executionBody", {
                  defaultValue:
                    "This screen is selectable in 0.0.9 so the workflow shape is visible. The analysis run button stays locked until the dedicated tools, prompts, and scoring contract are connected.",
                })}
              </p>
            </div>
          </aside>
        </section>

        {analysisType === "article_text" && (
          <section className="pb-8">
            <ArticleTextResultsDashboard state={bridgeState} />
          </section>
        )}
      </div>
    </div>
  );
}

function PlannedAnalysisStatusHero({
  executionMode,
  running,
  completedTools,
  totalTools,
}: {
  executionMode: AuditExecutionMode;
  running: boolean;
  completedTools: number;
  totalTools: number;
}) {
  const { t } = useTranslation();
  const visualProgress =
    totalTools > 0
      ? Math.max(running ? 8 : 0, Math.round((completedTools / totalTools) * 100))
      : running
        ? 8
        : 0;

  return (
    <section className="rounded-lg border border-orange-100 bg-white px-5 py-4 shadow-sm">
      <div className="flex items-center gap-4">
        <img
          src={sleepingMascot}
          alt={t("app.altMascotSleeping")}
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
              <h2 className="mt-1 text-lg font-semibold text-outline-900">
                {running
                  ? t("analysisHero.scanning", {
                      defaultValue: "Analysis in progress",
                    })
                  : t("analysisHero.ready", {
                      defaultValue: "Ready to scan",
                    })}
              </h2>
            </div>
            <span className="rounded-full border border-orange-200 bg-orange-50 px-2.5 py-1 font-mono text-xs font-semibold text-outline-900/55">
              {completedTools} / {totalTools}
            </span>
          </div>

          <div
            className="mt-3 h-2 overflow-hidden rounded-full bg-outline-900/10"
            role="progressbar"
            aria-valuenow={0}
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
        </div>
      </div>
    </section>
  );
}

function renderInputSurface(
  analysisType: AnalysisTypeId,
  t: ReturnType<typeof useTranslation>["t"],
  onArticleTextAction: (
    action: ArticleTextAction,
    data: ArticleTextPromptData,
  ) => Promise<void>,
  onArticleTextCancel: () => void,
  activeRun: ArticleTextAction | null,
  bridgeState: CurrentScanState | null,
  scanStartedOnce: boolean,
  bridgeUnavailable: boolean,
  bridgeUnavailableAppName: string,
  bridgeTargetAppName: string,
) {
  switch (analysisType) {
    case "page_by_url":
      return (
        <InputPanel
          title={t("plannedAnalysis.forms.pageByUrl.title", {
            defaultValue: "Page source",
          })}
          actionLabel={t("plannedAnalysis.actionLocked", {
            defaultValue: "Execution is being prepared",
          })}
        >
          <TextInput
            label={t("plannedAnalysis.forms.url", { defaultValue: "URL" })}
            placeholder="https://example.com/article"
          />
          <TextArea
            label={t("plannedAnalysis.forms.optionalTextBlock", {
              defaultValue: "Optional text block",
            })}
            placeholder={t("plannedAnalysis.forms.optionalTextBlockPlaceholder", {
              defaultValue:
                "Paste a specific fragment if only part of the page should be analyzed.",
            })}
            rows={7}
            actionLabel={t("plannedAnalysis.forms.textBlockAction", {
              defaultValue: "Text block",
            })}
            actionMarker={t("plannedAnalysis.forms.textBlockMarker", {
              defaultValue: "------------------------- text block -------------------------",
            })}
          />
        </InputPanel>
      );
    case "article_text":
      return (
        <ArticleTextPanel
          onRun={onArticleTextAction}
          onCancel={onArticleTextCancel}
          activeRun={activeRun}
          scanStartedOnce={scanStartedOnce}
          bridgeUnavailable={bridgeUnavailable}
          bridgeUnavailableAppName={bridgeUnavailableAppName}
          bridgeTargetAppName={bridgeTargetAppName}
        />
      );
    case "article_compare":
      return (
        <InputPanel
          title={t("plannedAnalysis.forms.articleCompare.title", {
            defaultValue: "Two article versions",
          })}
          actionLabel={t("plannedAnalysis.actionLocked", {
            defaultValue: "Execution is being prepared",
          })}
        >
          <TextArea
            label={t("plannedAnalysis.forms.compareGoal", {
              defaultValue: "Analysis goal",
            })}
            placeholder={t("plannedAnalysis.forms.compareGoalPlaceholder", {
              defaultValue:
                "For example: find weaknesses in article B, explain how to improve my text, or compare both versions neutrally.",
            })}
            rows={4}
          />
          <CompareRoleSelect label={t("plannedAnalysis.forms.articleARole")} />
          <TextArea
            label={t("plannedAnalysis.forms.articleA", {
              defaultValue: "Article A",
            })}
            placeholder={t("plannedAnalysis.forms.articlePlaceholder", {
              defaultValue: "Paste the article text here",
            })}
            rows={9}
            mediaToolbar
          />
          <CompareRoleSelect label={t("plannedAnalysis.forms.articleBRole")} />
          <TextArea
            label={t("plannedAnalysis.forms.articleB", {
              defaultValue: "Article B",
            })}
            placeholder={t("plannedAnalysis.forms.articlePlaceholder", {
              defaultValue: "Paste the article text here",
            })}
            rows={9}
            mediaToolbar
          />
        </InputPanel>
      );
    case "site_compare":
      return (
        <InputPanel
          title={t("plannedAnalysis.forms.siteCompare.title", {
            defaultValue: "Comparable sites",
          })}
          actionLabel={t("plannedAnalysis.actionLocked", {
            defaultValue: "Execution is being prepared",
          })}
        >
          <TextInput label="URL 1" placeholder="https://example.com" />
          <TextInput label="URL 2" placeholder="https://competitor.com" />
          <TextInput label="URL 3" placeholder="https://optional-site.com" />
        </InputPanel>
      );
    case "site_design_by_url":
      return (
        <InputPanel
          title={t("plannedAnalysis.forms.siteDesignByUrl.title", {
            defaultValue: "Design and content source",
          })}
          actionLabel={t("plannedAnalysis.actionLocked", {
            defaultValue: "Execution is being prepared",
          })}
        >
          <TextInput
            label={t("plannedAnalysis.forms.url", { defaultValue: "URL" })}
            placeholder="https://example.com"
          />
          <TextArea
            label={t("plannedAnalysis.forms.designFocus", {
              defaultValue: "Review focus",
            })}
            placeholder={t("plannedAnalysis.forms.designFocusPlaceholder", {
              defaultValue:
                "Conversion, readability, page trust, visual hierarchy, or content UX",
            })}
            rows={5}
          />
        </InputPanel>
      );
    case "site_by_url":
      return null;
  }
}

function InputPanel({
  title,
  actionLabel,
  footer,
  children,
}: {
  title: string;
  actionLabel?: string;
  footer?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-outline/10 bg-white p-5">
      <h2 className="font-display text-lg font-semibold text-outline-900">
        {title}
      </h2>
      <div className="mt-4 space-y-4">{children}</div>
      {footer ?? (
      <div className="mt-5 flex justify-end">
        <button
          type="button"
          disabled
          className="rounded-md bg-outline-900/15 px-4 py-2 text-sm font-medium text-outline-900/45"
        >
          {actionLabel}
        </button>
      </div>
      )}
    </section>
  );
}

export type ArticleTextAction = "scan" | "solution";

export interface ArticleTextPromptData {
  topic: string;
  body: string;
}

function ArticleTextPanel({
  onRun,
  onCancel,
  activeRun,
  scanStartedOnce,
  bridgeUnavailable,
  bridgeUnavailableAppName,
  bridgeTargetAppName,
}: {
  onRun: (action: ArticleTextAction, data: ArticleTextPromptData) => Promise<void>;
  onCancel: () => void;
  activeRun: ArticleTextAction | null;
  scanStartedOnce: boolean;
  bridgeUnavailable: boolean;
  bridgeUnavailableAppName: string;
  bridgeTargetAppName: string;
}) {
  const { t } = useTranslation();
  const topicRef = useRef("");
  const bodyRef = useRef("");
  const [bodyStats, setBodyStats] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [shake, setShake] = useState(false);
  const [busy, setBusy] = useState(false);
  const readyForAiDraft = isReadyForAiDraft(bodyStats);
  const isRunning = activeRun !== null;
  const isSolutionRunning = activeRun === "solution";
  const isScanRunning = activeRun === "scan";

  const runAction = async (action: ArticleTextAction) => {
    if (activeRun === action) {
      onCancel();
      setNotice(
        t("plannedAnalysis.forms.scanCancelled", {
          defaultValue: "Анализ отменён.",
        }),
      );
      return;
    }

    if (activeRun !== null) {
      return;
    }

    if (bridgeUnavailable) {
      setNotice(
        t("plannedAnalysis.forms.bridgeUnavailable", {
          defaultValue:
            "{{appName}} закрыт. Запустите его снова или вернитесь на главную и выберите API + AI Chat.",
          appName: bridgeUnavailableAppName,
        }),
      );
      return;
    }

    const data = {
      topic: topicRef.current,
      body: bodyRef.current,
    };

    if (action === "solution" && !isReadyForAiDraft(data.body)) {
      setNotice(t("plannedAnalysis.forms.aiDraftNeedMore"));
      setShake(true);
      window.setTimeout(() => setShake(false), 420);
      return;
    }

    if (action === "scan" && data.body.trim().length === 0) {
      setNotice(
        t("plannedAnalysis.forms.scanNeedText", {
          defaultValue: "Добавьте текст статьи, чтобы подготовить промпт анализа.",
        }),
      );
      return;
    }

    setBusy(true);
    try {
      await onRun(action, data);
      setNotice(
        action === "solution"
          ? t("plannedAnalysis.forms.aiDraftPromptCopied", {
              appName: bridgeTargetAppName,
              defaultValue:
                "Промпт скопирован. Вставьте его в чат {{appName}}, чтобы ИИ продолжил работу по этому анализу.",
            })
          : t("plannedAnalysis.forms.scanPromptCopied", {
              appName: bridgeTargetAppName,
              defaultValue:
                "Промпт скопирован. Вставьте его в чат {{appName}}, чтобы ИИ продолжил работу по этому анализу.",
            }),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <InputPanel
      title={t("plannedAnalysis.forms.articleText.title", {
        defaultValue: "Article draft",
      })}
      footer={
        <div className="mt-5 space-y-2">
          <div className="flex flex-wrap justify-between gap-3">
            <button
              type="button"
              onClick={() => void runAction("solution")}
              disabled={busy || (isRunning && !isSolutionRunning)}
              className={`rounded-md border px-4 py-2 text-sm font-medium transition ${
                isSolutionRunning
                  ? "border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
                  : readyForAiDraft && !isRunning
                    ? "border-primary/30 bg-white text-primary hover:bg-orange-50"
                    : "border-outline/15 bg-outline-900/10 text-outline-900/40"
              } ${shake ? "toraseo-shake" : ""}`}
            >
              {isSolutionRunning
                ? t("sidebar.cancel", { defaultValue: "Отменить" })
                : t("plannedAnalysis.forms.aiDraftAction")}
            </button>
            <button
              type="button"
              onClick={() => void runAction("scan")}
              disabled={busy || (isRunning && !isScanRunning)}
              className={
                isScanRunning
                  ? "rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-outline-900/15 disabled:text-outline-900/45"
                  : "rounded-md bg-primary px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-600 disabled:cursor-not-allowed disabled:bg-outline-900/15 disabled:text-outline-900/45"
              }
            >
              {isScanRunning
                ? t("sidebar.cancel", { defaultValue: "Отменить" })
                : scanStartedOnce
                  ? t("plannedAnalysis.forms.scanReadyTextAgainAction", {
                      defaultValue: "Сканировать текст повторно",
                    })
                  : t("plannedAnalysis.forms.scanReadyTextAction")}
            </button>
          </div>
          {notice && (
            <p className="text-xs leading-relaxed text-outline-900/55">
              {notice}
            </p>
          )}
        </div>
      }
    >
      <TextInput
        label={t("plannedAnalysis.forms.textTopic", {
          defaultValue: "Text topic (optional)",
        })}
        placeholder={t("plannedAnalysis.forms.textTopicPlaceholder", {
          defaultValue:
            "Topic, title, or intent. If the body has its own title, the body title wins.",
        })}
        onValueChange={(value) => {
          topicRef.current = value;
        }}
      />
      <TextArea
        label={t("plannedAnalysis.forms.article", {
          defaultValue: "Article text",
        })}
        placeholder={t("plannedAnalysis.forms.articlePlaceholder", {
          defaultValue: "Paste the article text here",
        })}
        rows={16}
        mediaToolbar
        onValueChange={(value) => {
          bodyRef.current = value;
          setBodyStats(value);
        }}
      />
    </InputPanel>
  );
}

function isReadyForAiDraft(value: string): boolean {
  const paragraphs = value
    .split(/\n\s*\n/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 40);
  return value.trim().length >= 220 && paragraphs.length >= 2;
}

interface TextIssueResult {
  severity: "critical" | "warning" | "info";
  code: string;
  message: string;
}

interface TextToolResult {
  tool: string;
  summary?: Record<string, unknown>;
  issues?: TextIssueResult[];
  recommendations?: string[];
}

function ArticleTextResultsDashboard({
  state,
}: {
  state: CurrentScanState | null;
}) {
  const { t } = useTranslation();
  const [exportStatus, setExportStatus] = useState<string | null>(null);
  if (state?.analysisType !== "article_text") return null;

  const entries = state.selectedTools
    .map((toolId) => [toolId, state.buffer[toolId]] as const)
    .filter(([, entry]) => entry);
  if (entries.length === 0) return null;

  const completedCount = entries.filter(
    ([, entry]) => entry?.status === "complete" || entry?.status === "error",
  ).length;
  const uniqueness = metricValue(state, "article_uniqueness", "score");
  const syntax = metricValue(state, "language_syntax", "score");
  const aiProbability = metricValue(
    state,
    "ai_writing_probability",
    "probability",
  );
  const logicScore = metricValue(state, "logic_consistency_check", "score");
  const naturalnessWarnings =
    state.buffer.naturalness_indicators?.summary?.warning ?? 0;
  const report = buildArticleTextReport(state, t);
  const canUseReport = report !== null && completedCount > 0;

  const openDetails = () => {
    if (!report) return;
    void window.toraseo.runtime.openReportWindow(report);
  };

  const exportReport = async () => {
    if (!report) return;
    setExportStatus(null);
    const result = await window.toraseo.runtime.exportReportDocument(report);
    setExportStatus(
      result.ok
        ? t("plannedAnalysis.results.exportReady", {
            defaultValue: "Отчет экспортирован.",
          })
        : t("plannedAnalysis.results.exportFailed", {
            defaultValue: "Не удалось экспортировать отчет.",
          }),
    );
  };

  return (
    <section className="rounded-lg border border-outline/10 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold text-outline-900">
            {t("plannedAnalysis.results.title", {
              defaultValue: "Результаты анализа",
            })}
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-outline-900/60">
            {t("plannedAnalysis.results.body", {
              defaultValue:
                "Здесь отображаются MCP-результаты текущего анализа текста. Ответ в чате может быть короче, но приложение хранит структурные пункты ниже.",
            })}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-orange-200 bg-orange-50 px-2.5 py-1 font-mono text-xs font-semibold text-outline-900/55">
            {completedCount} / {state.selectedTools.length}
          </span>
          <button
            type="button"
            onClick={openDetails}
            disabled={!canUseReport}
            className="rounded-md border border-outline/15 bg-white px-3 py-1.5 text-xs font-semibold text-outline-900/70 transition hover:border-primary/40 hover:bg-orange-50 disabled:cursor-not-allowed disabled:opacity-45"
          >
            {t("analysisPanel.actions.details", { defaultValue: "Подробнее" })}
          </button>
          <button
            type="button"
            onClick={() => void exportReport()}
            disabled={!canUseReport}
            className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-primary-600 disabled:cursor-not-allowed disabled:bg-outline-900/15 disabled:text-outline-900/45"
          >
            {t("plannedAnalysis.results.export", {
              defaultValue: "Экспортировать",
            })}
          </button>
        </div>
      </div>
      {exportStatus && (
        <p className="mt-3 text-xs font-medium text-orange-700/75">
          {exportStatus}
        </p>
      )}

      <div className="mt-5 grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
        <div className="rounded-lg border border-orange-100 bg-orange-50/40 p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-outline-900/50">
            {t("plannedAnalysis.results.uniquenessTitle", {
              defaultValue: "Уникальность статьи",
            })}
          </p>
          <div className="mt-4 flex items-center justify-center">
            <ScoreDial
              value={uniqueness}
              emptyLabel={t("plannedAnalysis.results.waitingMetric", {
                defaultValue: "ожидаем",
              })}
            />
          </div>
          <p className="mt-4 text-center text-xs leading-relaxed text-outline-900/55">
            {t("plannedAnalysis.results.uniquenessHint", {
              defaultValue:
                "Локальная оценка повторов и шаблонности. Это не интернет-проверка плагиата.",
            })}
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label={t("plannedAnalysis.results.syntaxTitle", {
              defaultValue: "Синтаксис языка",
            })}
            value={syntax}
            suffix="%"
            tone={scoreTone(syntax)}
          />
          <MetricCard
            label={t("plannedAnalysis.results.aiProbabilityTitle", {
              defaultValue: "Вероятность написания ИИ",
            })}
            value={aiProbability}
            suffix="%"
            tone={inverseScoreTone(aiProbability)}
          />
          <MetricCard
            label={t("plannedAnalysis.results.logicTitle", {
              defaultValue: "Нарушение логики",
            })}
            value={logicScore}
            suffix="%"
            tone={scoreTone(logicScore)}
          />
          <MetricCard
            label={t("plannedAnalysis.results.naturalnessTitle", {
              defaultValue: "Естественность",
            })}
            value={
              typeof naturalnessWarnings === "number"
                ? Math.max(0, 100 - naturalnessWarnings * 18)
                : null
            }
            suffix="%"
            tone={scoreTone(
              typeof naturalnessWarnings === "number"
                ? Math.max(0, 100 - naturalnessWarnings * 18)
                : null,
            )}
          />
        </div>
      </div>

      <div className="mt-5 grid gap-3 xl:grid-cols-2">
        {entries.map(([toolId, entry]) => (
          <ResultRow
            key={toolId}
            toolId={toolId}
            entry={entry!}
            label={textToolLabel(t, toolId)}
          />
        ))}
      </div>
    </section>
  );
}

function ScoreDial({
  value,
  emptyLabel,
}: {
  value: number | null;
  emptyLabel: string;
}) {
  const score = value ?? 0;
  return (
    <div
      className="grid h-36 w-36 place-items-center rounded-full"
      style={{
        background: `conic-gradient(#ff6f39 ${score * 3.6}deg, #f2e6dc 0deg)`,
      }}
    >
      <div className="grid h-24 w-24 place-items-center rounded-full bg-white text-center shadow-sm">
        {value === null ? (
          <span className="text-xs font-semibold uppercase tracking-wider text-outline-900/40">
            {emptyLabel}
          </span>
        ) : (
          <span>
            <strong className="block text-3xl font-semibold text-outline-900">
              {value}
            </strong>
            <span className="text-xs font-semibold text-outline-900/45">%</span>
          </span>
        )}
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  suffix,
  tone,
}: {
  label: string;
  value: number | null;
  suffix: string;
  tone: "good" | "warn" | "bad" | "pending";
}) {
  return (
    <div className="rounded-lg border border-outline/10 bg-white p-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-outline-900/50">
        {label}
      </p>
      <div className="mt-3 flex items-end gap-1">
        <span className="text-3xl font-semibold text-outline-900">
          {value ?? "..."}
        </span>
        {value !== null && (
          <span className="pb-1 text-sm font-semibold text-outline-900/45">
            {suffix}
          </span>
        )}
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-outline-900/10">
        <div
          className={`h-full rounded-full ${metricToneClass(tone)}`}
          style={{ width: `${value ?? 0}%` }}
        />
      </div>
    </div>
  );
}

function ResultRow({
  toolId,
  entry,
  label,
}: {
  toolId: string;
  entry: ToolBufferEntry;
  label: string;
}) {
  const { t } = useTranslation();
  const data = parseTextResult(entry.data);
  const issues = data?.issues ?? [];
  const recommendations = data?.recommendations ?? [];
  const summary = data?.summary ?? {};
  const isError = entry.status === "error";
  const visibleSummary = Object.entries(summary).filter(([key]) =>
    shouldShowSummaryKey(key),
  );

  return (
    <article className="rounded-lg border border-outline/10 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="rounded-md bg-orange-50 p-2 text-primary">
            <ListChecks className="h-4 w-4" strokeWidth={2} />
          </span>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-outline-900">{label}</h3>
            <p className="text-xs text-outline-900/45">
              {resultDescription(t, toolId)}
            </p>
          </div>
        </div>
        <span
          className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass(
            entry,
          )}`}
        >
          {statusLabel(t, entry.status)}
        </span>
      </div>

      {isError && (
        <p className="mt-3 text-sm leading-relaxed text-red-700">
          {entry.errorMessage ?? entry.errorCode}
        </p>
      )}

      {!isError && (
        <>
          {visibleSummary.length > 0 && (
            <div className="mt-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-outline-900/45">
                {t("plannedAnalysis.results.keyFacts", {
                  defaultValue: "Ключевые данные",
                })}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {visibleSummary.slice(0, 6).map(([key, value]) => (
                  <span
                    key={key}
                    className="rounded-full bg-orange-50 px-2.5 py-1 text-xs text-outline-900/65"
                  >
                    {summaryLabel(t, key)}: {formatSummaryValue(value)}
                  </span>
                ))}
              </div>
            </div>
          )}
          {issues.length > 0 && (
            <div className="mt-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-outline-900/45">
                {t("plannedAnalysis.results.findings", {
                  defaultValue: "Что найдено",
                })}
              </p>
              <ul className="mt-2 space-y-1.5 text-sm leading-relaxed text-outline-900/70">
                {issues.slice(0, 3).map((issue) => (
                  <li key={`${issue.code}-${issue.message}`} className="flex gap-2">
                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/70" />
                    <span>{issue.message}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {recommendations.length > 0 && (
            <div className="mt-4 rounded-md bg-orange-50/70 px-3 py-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-outline-900/45">
                {t("plannedAnalysis.results.recommendation", {
                  defaultValue: "Что сделать",
                })}
              </p>
              <p className="mt-1 text-sm leading-relaxed text-outline-900/65">
                {recommendations[0]}
              </p>
            </div>
          )}
          {visibleSummary.length === 0 &&
            issues.length === 0 &&
            recommendations.length === 0 && (
              <p className="mt-3 text-sm leading-relaxed text-outline-900/55">
                {t("plannedAnalysis.results.noDetails", {
                  defaultValue:
                    "Проверка завершилась без дополнительных замечаний.",
                })}
              </p>
            )}
        </>
      )}
    </article>
  );
}

function parseTextResult(value: unknown): TextToolResult | null {
  if (!value || typeof value !== "object") return null;
  return value as TextToolResult;
}

function metricValue(
  state: CurrentScanState,
  toolId: string,
  summaryKey: string,
): number | null {
  const data = parseTextResult(state.buffer[toolId]?.data);
  const raw = data?.summary?.[summaryKey];
  return typeof raw === "number" ? Math.round(raw) : null;
}

function scoreTone(value: number | null): "good" | "warn" | "bad" | "pending" {
  if (value === null) return "pending";
  if (value >= 80) return "good";
  if (value >= 60) return "warn";
  return "bad";
}

function inverseScoreTone(
  value: number | null,
): "good" | "warn" | "bad" | "pending" {
  if (value === null) return "pending";
  if (value <= 35) return "good";
  if (value <= 60) return "warn";
  return "bad";
}

function metricToneClass(tone: "good" | "warn" | "bad" | "pending"): string {
  switch (tone) {
    case "good":
      return "bg-emerald-500";
    case "warn":
      return "bg-amber-500";
    case "bad":
      return "bg-red-500";
    case "pending":
      return "bg-outline-900/15";
  }
}

function statusClass(entry: ToolBufferEntry): string {
  if (entry.status === "running") return "bg-blue-50 text-blue-700";
  if (entry.status === "error") return "bg-red-50 text-red-700";
  if (entry.verdict === "critical") return "bg-red-50 text-red-700";
  if (entry.verdict === "warning") return "bg-amber-50 text-amber-700";
  return "bg-emerald-50 text-emerald-700";
}

function statusLabel(
  t: ReturnType<typeof useTranslation>["t"],
  status: ToolBufferEntry["status"],
): string {
  if (status === "complete") {
    return t("plannedAnalysis.results.statusComplete", {
      defaultValue: "Готово",
    });
  }
  if (status === "running") {
    return t("plannedAnalysis.results.statusRunning", {
      defaultValue: "В процессе",
    });
  }
  if (status === "error") {
    return t("plannedAnalysis.results.statusError", {
      defaultValue: "Ошибка",
    });
  }
  return t("plannedAnalysis.results.statusPending", {
    defaultValue: "Ожидает",
  });
}

function shouldShowSummaryKey(key: string): boolean {
  return !["tool", "method"].includes(key);
}

function summaryLabel(
  t: ReturnType<typeof useTranslation>["t"],
  key: string,
): string {
  const labels: Record<string, string> = {
    topic: t("plannedAnalysis.results.summary.topic", {
      defaultValue: "Тема",
    }),
    analysisRole: t("plannedAnalysis.results.summary.analysisRole", {
      defaultValue: "Роль",
    }),
    wordCount: t("plannedAnalysis.results.summary.wordCount", {
      defaultValue: "Слов",
    }),
    paragraphCount: t("plannedAnalysis.results.summary.paragraphCount", {
      defaultValue: "Абзацев",
    }),
    headingCount: t("plannedAnalysis.results.summary.headingCount", {
      defaultValue: "Заголовков",
    }),
    hasMarkdown: t("plannedAnalysis.results.summary.hasMarkdown", {
      defaultValue: "Markdown",
    }),
    inferredPlatform: t("plannedAnalysis.results.summary.platform", {
      defaultValue: "Платформа",
    }),
    detectedStyle: t("plannedAnalysis.results.summary.style", {
      defaultValue: "Стиль",
    }),
    detectedTone: t("plannedAnalysis.results.summary.tone", {
      defaultValue: "Тон",
    }),
    score: t("plannedAnalysis.results.summary.score", {
      defaultValue: "Оценка",
    }),
    probability: t("plannedAnalysis.results.summary.probability", {
      defaultValue: "Вероятность",
    }),
    uniqueWordRatio: t("plannedAnalysis.results.summary.uniqueWordRatio", {
      defaultValue: "Уникальные слова",
    }),
    duplicateSentenceRate: t("plannedAnalysis.results.summary.duplicates", {
      defaultValue: "Повторы",
    }),
    suspectedIssues: t("plannedAnalysis.results.summary.suspectedIssues", {
      defaultValue: "Подозрения",
    }),
    warning: t("plannedAnalysis.results.summary.warning", {
      defaultValue: "Предупреждения",
    }),
    markers: t("plannedAnalysis.results.summary.markers", {
      defaultValue: "Метки медиа",
    }),
    suggestedMarkerTypes: t("plannedAnalysis.results.summary.markerTypes", {
      defaultValue: "Типы медиа",
    }),
  };
  return labels[key] ?? key;
}

function formatSummaryValue(value: unknown): string {
  if (typeof value === "number") {
    return Number.isInteger(value) ? String(value) : value.toFixed(2);
  }
  if (Array.isArray(value)) return value.join(", ") || "-";
  if (typeof value === "boolean") return value ? "да" : "нет";
  if (typeof value === "string") return value;
  return "-";
}

function resultDescription(
  t: ReturnType<typeof useTranslation>["t"],
  toolId: string,
): string {
  const descriptions: Record<string, string> = {
    detect_text_platform: t("plannedAnalysis.results.descriptions.platform", {
      defaultValue: "Определяет площадку и контекст публикации.",
    }),
    analyze_text_structure: t("plannedAnalysis.results.descriptions.structure", {
      defaultValue: "Проверяет заголовки, абзацы и каркас статьи.",
    }),
    analyze_text_style: t("plannedAnalysis.results.descriptions.style", {
      defaultValue: "Определяет стиль текста и его слабые места.",
    }),
    analyze_tone_fit: t("plannedAnalysis.results.descriptions.tone", {
      defaultValue: "Смотрит, подходит ли тон теме и аудитории.",
    }),
    language_audience_fit: t("plannedAnalysis.results.descriptions.audience", {
      defaultValue: "Проверяет язык, аудиторию и уровень объяснения.",
    }),
    media_placeholder_review: t("plannedAnalysis.results.descriptions.media", {
      defaultValue: "Проверяет, где и как размещены медиа-метки.",
    }),
    article_uniqueness: t("plannedAnalysis.results.descriptions.uniqueness", {
      defaultValue: "Оценивает локальные повторы и шаблонность.",
    }),
    language_syntax: t("plannedAnalysis.results.descriptions.syntax", {
      defaultValue: "Проверяет синтаксис и явные языковые риски.",
    }),
    ai_writing_probability: t("plannedAnalysis.results.descriptions.ai", {
      defaultValue: "Оценивает признаки ИИ-стиля в тексте.",
    }),
    naturalness_indicators: t("plannedAnalysis.results.descriptions.naturalness", {
      defaultValue: "Ищет механические формулировки и повторы.",
    }),
    logic_consistency_check: t("plannedAnalysis.results.descriptions.logic", {
      defaultValue: "Проверяет противоречия и скачки вывода.",
    }),
    fact_distortion_check: t("plannedAnalysis.results.descriptions.facts", {
      defaultValue: "Ищет спорные факты и слишком уверенные утверждения.",
    }),
    ai_hallucination_check: t("plannedAnalysis.results.descriptions.hallucination", {
      defaultValue: "Ищет признаки выдуманных деталей и ИИ-галлюцинаций.",
    }),
  };
  return descriptions[toolId] ??
    t("plannedAnalysis.results.descriptions.default", {
      defaultValue: "Проверка текста ToraSEO.",
    });
}

function buildArticleTextReport(
  state: CurrentScanState,
  t: ReturnType<typeof useTranslation>["t"],
): RuntimeAuditReport | null {
  const entries = state.selectedTools
    .map((toolId) => [toolId, state.buffer[toolId]] as const)
    .filter(([, entry]) => entry);
  if (entries.length === 0) return null;

  const confirmedFacts = entries.map(([toolId, entry]) => {
    const data = parseTextResult(entry!.data);
    return {
      title: textToolLabel(t, toolId),
      detail: textResultDetail(data, entry!),
      priority: entry!.verdict === "critical" ? "high" : "medium",
      sourceToolIds: [toolId as ToolId],
    };
  });

  const expertHypotheses = entries.flatMap(([toolId, entry]) => {
    const data = parseTextResult(entry!.data);
    return (data?.recommendations ?? []).slice(0, 2).map((recommendation) => ({
      title: textToolLabel(t, toolId),
      detail: recommendation,
      priority: entry!.verdict === "critical" ? "high" : "medium",
      expectedImpact: t("plannedAnalysis.results.reportExpectedImpact", {
        defaultValue: "Повысить понятность, доверие и SEO-качество текста.",
      }),
      validationMethod: t("plannedAnalysis.results.reportValidationMethod", {
        defaultValue:
          "Перепроверить текст после правок повторным анализом ToraSEO.",
      }),
    }));
  });

  return {
    mode: "audit_plus_ideas",
    providerId: "local",
    model: "ToraSEO MCP + Instructions",
    generatedAt: new Date().toISOString(),
    summary: t("plannedAnalysis.results.reportSummary", {
      defaultValue:
        "Структурированный отчет по анализу текста статьи в ToraSEO.",
    }),
    nextStep: t("plannedAnalysis.results.reportNextStep", {
      defaultValue:
        "Открыть рекомендации, выбрать приоритетные правки и повторить сканирование текста.",
    }),
    confirmedFacts,
    expertHypotheses,
  };
}

function textResultDetail(
  data: TextToolResult | null,
  entry: ToolBufferEntry,
): string {
  if (entry.status === "error") {
    return entry.errorMessage ?? entry.errorCode ?? "Tool failed.";
  }
  const chunks: string[] = [];
  const summary = data?.summary ?? {};
  const summaryText = Object.entries(summary)
    .filter(([key]) => shouldShowSummaryKey(key))
    .slice(0, 6)
    .map(([key, value]) => `${key}: ${formatSummaryValue(value)}`)
    .join("; ");
  if (summaryText) chunks.push(summaryText);
  const issueText = (data?.issues ?? [])
    .slice(0, 3)
    .map((issue) => issue.message)
    .join(" ");
  if (issueText) chunks.push(issueText);
  const recommendation = data?.recommendations?.[0];
  if (recommendation) chunks.push(recommendation);
  return chunks.join("\n\n") || "Проверка завершилась без дополнительных замечаний.";
}

function textToolLabel(
  t: ReturnType<typeof useTranslation>["t"],
  toolId: string,
): string {
  const labels: Record<string, string> = {
    article_uniqueness: t("analysisTools.article_uniqueness.label", {
      defaultValue: "Уникальность статьи",
    }),
    language_syntax: t("analysisTools.language_syntax.label", {
      defaultValue: "Синтаксис языка",
    }),
    ai_writing_probability: t("analysisTools.ai_writing_probability.label", {
      defaultValue: "Вероятность написания ИИ",
    }),
    fact_distortion_check: t("analysisTools.fact_distortion_check.label", {
      defaultValue: "Искажение фактов",
    }),
    logic_consistency_check: t("analysisTools.logic_consistency_check.label", {
      defaultValue: "Нарушение логики",
    }),
    ai_hallucination_check: t("analysisTools.ai_hallucination_check.label", {
      defaultValue: "Проверка наличия ИИ и его галлюцинаций",
    }),
  };
  return (
    labels[toolId] ??
    t(`analysisTools.${toolId}.label`, {
      defaultValue: toolId,
    })
  );
}

function TextInput({
  label,
  placeholder,
  onValueChange,
}: {
  label: string;
  placeholder: string;
  onValueChange?: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase tracking-wider text-outline-900/50">
        {label}
      </span>
      <input
        type="text"
        placeholder={placeholder}
        onChange={(event) => onValueChange?.(event.target.value)}
        className="mt-2 w-full rounded-md border border-outline/15 bg-white px-3 py-2 text-sm text-outline-900 outline-none transition placeholder:text-outline-900/35 focus:border-primary focus:ring-2 focus:ring-primary/15"
      />
    </label>
  );
}

function TextArea({
  label,
  placeholder,
  rows,
  actionLabel,
  actionMarker,
  mediaToolbar,
  onValueChange,
}: {
  label: string;
  placeholder: string;
  rows: number;
  actionLabel?: string;
  actionMarker?: string;
  mediaToolbar?: boolean;
  onValueChange?: (value: string) => void;
}) {
  const { t } = useTranslation();
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const insertMarker = (marker: string) => {
    if (!marker) return;
    const textarea = textareaRef.current;
    const currentValue = textarea?.value ?? "";
    const start = textarea?.selectionStart ?? currentValue.length;
    const end = textarea?.selectionEnd ?? currentValue.length;
    const prefix =
      start > 0 && !currentValue.slice(0, start).endsWith("\n") ? "\n\n" : "";
    const suffix = currentValue.slice(end).startsWith("\n") ? "" : "\n\n";
    const insertion = `${prefix}${marker}${suffix}`;
    const nextValue = `${currentValue.slice(0, start)}${insertion}${currentValue.slice(end)}`;
    const nextCursor = start + insertion.length;
    if (textarea) {
      textarea.value = nextValue;
    }
    onValueChange?.(nextValue);
    window.requestAnimationFrame(() => {
      textarea?.focus();
      textarea?.setSelectionRange(nextCursor, nextCursor);
    });
  };

  const handlePaste = (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const htmlPaste = convertHtmlPasteToText(event.clipboardData, t);
    if (htmlPaste?.hasMedia) {
      event.preventDefault();
      insertMarker(htmlPaste.text);
      return;
    }

    const mediaMarkers = extractFileMediaMarkers(event.clipboardData, t);
    if (mediaMarkers.length === 0) return;
    event.preventDefault();
    const text = event.clipboardData.getData("text/plain").trim();
    insertMarker([text, ...mediaMarkers].filter(Boolean).join("\n\n"));
  };

  return (
    <div className="block">
      <span className="flex items-center justify-between gap-3">
        <span className="text-xs font-semibold uppercase tracking-wider text-outline-900/50">
          {label}
        </span>
        {actionLabel && (
          <button
            type="button"
            onClick={() => insertMarker(actionMarker ?? "")}
            disabled={!actionMarker}
            className="inline-flex items-center gap-1.5 rounded-md border border-outline/15 px-2 py-1 text-xs font-medium text-outline-900/60 transition hover:bg-orange-50 hover:text-outline-900"
          >
            <Type className="h-3.5 w-3.5" strokeWidth={2} />
            {actionLabel}
          </button>
        )}
      </span>
      {mediaToolbar && (
        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-t-md border border-b-0 border-outline/15 bg-orange-50/55 px-2 py-2">
          <span className="text-xs font-medium text-outline-900/55">
            {t("plannedAnalysis.forms.mediaToolbarLabel", {
              defaultValue: "Поставить метку:",
            })}
          </span>
          <MediaButton
            icon={<Image className="h-3.5 w-3.5" strokeWidth={2} />}
            label={t("plannedAnalysis.forms.mediaImage")}
            onClick={() => insertMarker(t("plannedAnalysis.forms.mediaMarkerImage"))}
          />
          <MediaButton
            icon={<Film className="h-3.5 w-3.5" strokeWidth={2} />}
            label={t("plannedAnalysis.forms.mediaAnimation")}
            onClick={() =>
              insertMarker(t("plannedAnalysis.forms.mediaMarkerAnimation"))
            }
          />
          <MediaButton
            icon={<Video className="h-3.5 w-3.5" strokeWidth={2} />}
            label={t("plannedAnalysis.forms.mediaVideo")}
            onClick={() => insertMarker(t("plannedAnalysis.forms.mediaMarkerVideo"))}
          />
          <MediaButton
            icon={<Music2 className="h-3.5 w-3.5" strokeWidth={2} />}
            label={t("plannedAnalysis.forms.mediaAudio")}
            onClick={() => insertMarker(t("plannedAnalysis.forms.mediaMarkerAudio"))}
          />
        </div>
      )}
      <textarea
        ref={textareaRef}
        onChange={(event) => {
          onValueChange?.(event.target.value);
        }}
        onPaste={handlePaste}
        rows={rows}
        placeholder={placeholder}
        aria-label={label}
        className={`w-full resize-y border border-outline/15 bg-white px-3 py-2 text-sm leading-relaxed text-outline-900 outline-none transition placeholder:text-outline-900/35 focus:border-primary focus:ring-2 focus:ring-primary/15 ${
          mediaToolbar ? "rounded-b-md rounded-t-none" : "mt-2 rounded-md"
        }`}
      />
    </div>
  );
}

function CompareRoleSelect({ label }: { label: string }) {
  const { t } = useTranslation();
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase tracking-wider text-outline-900/50">
        {label}
      </span>
      <select className="mt-2 w-full rounded-md border border-outline/15 bg-white px-3 py-2 text-sm text-outline-900 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15">
        <option value="auto">{t("plannedAnalysis.forms.articleRoleAuto")}</option>
        <option value="own">{t("plannedAnalysis.forms.articleRoleOwn")}</option>
        <option value="competitor">
          {t("plannedAnalysis.forms.articleRoleCompetitor")}
        </option>
      </select>
    </label>
  );
}

function extractFileMediaMarkers(
  clipboardData: DataTransfer,
  t: ReturnType<typeof useTranslation>["t"],
): string[] {
  const markers = new Set<string>();

  Array.from(clipboardData.files).forEach((file) => {
    if (file.type === "image/gif") {
      markers.add(t("plannedAnalysis.forms.mediaMarkerAnimation"));
    } else if (file.type.startsWith("image/")) {
      markers.add(t("plannedAnalysis.forms.mediaMarkerImage"));
    } else if (file.type.startsWith("video/")) {
      markers.add(t("plannedAnalysis.forms.mediaMarkerVideo"));
    } else if (file.type.startsWith("audio/")) {
      markers.add(t("plannedAnalysis.forms.mediaMarkerAudio"));
    }
  });

  return Array.from(markers);
}

function convertHtmlPasteToText(
  clipboardData: DataTransfer,
  t: ReturnType<typeof useTranslation>["t"],
): { text: string; hasMedia: boolean } | null {
  const html = clipboardData.getData("text/html");
  if (!html) return null;

  const doc = new DOMParser().parseFromString(html, "text/html");
  let hasMedia = false;
  const chunks: string[] = [];

  const appendText = (text: string) => {
    const normalized = text.replace(/\s+/g, " ");
    if (!normalized.trim()) return;
    const previous = chunks[chunks.length - 1] ?? "";
    if (previous && !previous.endsWith("\n") && !previous.endsWith(" ")) {
      chunks.push(" ");
    }
    chunks.push(normalized);
  };

  const appendBreak = () => {
    const current = chunks.join("");
    if (!current || current.endsWith("\n\n")) return;
    chunks.push(current.endsWith("\n") ? "\n" : "\n\n");
  };

  const appendMarker = (marker: string) => {
    hasMedia = true;
    appendBreak();
    chunks.push(marker);
    appendBreak();
  };

  const visit = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      appendText(node.textContent ?? "");
      return;
    }

    if (!(node instanceof HTMLElement)) return;

    const tag = node.tagName.toLowerCase();
    if (tag === "script" || tag === "style" || tag === "noscript") return;

    if (tag === "br") {
      chunks.push("\n");
      return;
    }

    if (tag === "img") {
      const src = node.getAttribute("src") ?? "";
      appendMarker(
        src.toLowerCase().includes(".gif")
          ? t("plannedAnalysis.forms.mediaMarkerAnimation")
          : t("plannedAnalysis.forms.mediaMarkerImage"),
      );
      return;
    }

    if (tag === "video") {
      appendMarker(t("plannedAnalysis.forms.mediaMarkerVideo"));
      return;
    }

    if (tag === "audio") {
      appendMarker(t("plannedAnalysis.forms.mediaMarkerAudio"));
      return;
    }

    const isBlock = HTML_BLOCK_TAGS.has(tag);
    if (isBlock) appendBreak();
    node.childNodes.forEach(visit);
    if (isBlock) appendBreak();
  };

  doc.body.childNodes.forEach(visit);

  return {
    text: normalizePastedContent(chunks.join("")),
    hasMedia,
  };
}

const HTML_BLOCK_TAGS = new Set([
  "address",
  "article",
  "aside",
  "blockquote",
  "div",
  "figcaption",
  "figure",
  "footer",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "header",
  "li",
  "main",
  "nav",
  "ol",
  "p",
  "section",
  "table",
  "tbody",
  "td",
  "tfoot",
  "th",
  "thead",
  "tr",
  "ul",
]);

function normalizePastedContent(text: string): string {
  return text
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function MediaButton({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-md border border-outline/15 bg-white px-2.5 py-1.5 text-xs font-medium text-outline-900/70 transition hover:border-primary/40 hover:bg-white hover:text-outline-900"
    >
      {icon}
      {label}
    </button>
  );
}

function iconForAnalysis(id: AnalysisTypeId): React.ReactNode {
  switch (id) {
    case "site_by_url":
      return <Globe className="h-6 w-6" strokeWidth={1.7} />;
    case "page_by_url":
      return <PanelTop className="h-6 w-6" strokeWidth={1.7} />;
    case "article_text":
      return <FileText className="h-6 w-6" strokeWidth={1.7} />;
    case "article_compare":
      return <CompareTextIcon className="h-6 w-6" />;
    case "site_compare":
      return (
        <span className="relative inline-flex h-6 w-8 items-center justify-center">
          <Globe className="absolute left-0 h-5 w-5" strokeWidth={1.7} />
          <Globe className="absolute right-0 h-5 w-5" strokeWidth={1.7} />
        </span>
      );
    case "site_design_by_url":
      return <ScanEye className="h-6 w-6" strokeWidth={1.7} />;
  }
}

function CompareTextIcon({ className }: { className: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      className={className}
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M13.8 3H22L27 8V23.2Q27 25 25.2 25H13.8Q12 25 12 23.2V4.8Q12 3 13.8 3Z"
        fill="#fff"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
        opacity="0.65"
      />
      <path
        d="M22 3V8H27"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.65"
      />
      <path
        d="M7.8 8H18L24 14V27.2Q24 29 22.2 29H7.8Q6 29 6 27.2V9.8Q6 8 7.8 8Z"
        fill="#fff"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinejoin="round"
      />
      <path
        d="M18 8V14H24"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M10 16H18" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
      <path d="M10 20H20" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
      <path d="M10 24H18" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    </svg>
  );
}
