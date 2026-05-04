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
import type {
  AuditExecutionMode,
  RuntimeArticleTextAnnotation,
  RuntimeArticleTextDimension,
  RuntimeArticleTextDimensionStatus,
  RuntimeArticleTextMetric,
  RuntimeArticleTextPriority,
  RuntimeArticleTextSummary,
  RuntimeArticleTextVerdict,
  RuntimeAuditReport,
  RuntimeConfirmedFact,
} from "../../types/runtime";
import type { CurrentScanState, ToolBufferEntry } from "../../types/ipc";
import sleepingMascot from "@branding/mascots/tora-sleeping.svg";

interface PlannedAnalysisViewProps {
  analysisType: AnalysisTypeId;
  executionMode: AuditExecutionMode;
  selectedToolIds: AnalysisToolId[];
  activeRun: ArticleTextAction | null;
  completedArticleTextAction: ArticleTextAction | null;
  completedTools: number;
  totalTools: number;
  bridgeState: CurrentScanState | null;
  articleTextState: CurrentScanState | null;
  runtimeReport: RuntimeAuditReport | null;
  scanStartedOnce: boolean;
  solutionProvidedOnce: boolean;
  bridgeUnavailable: boolean;
  bridgeUnavailableAppName: string;
  bridgeTargetAppName: string;
  onArticleTextRun: (
    action: ArticleTextAction,
    data: ArticleTextPromptData,
  ) => Promise<boolean>;
  onArticleTextCancel: () => void;
}

export default function PlannedAnalysisView({
  analysisType,
  executionMode,
  selectedToolIds,
  activeRun,
  completedArticleTextAction,
  completedTools,
  totalTools,
  bridgeState,
  articleTextState,
  runtimeReport,
  scanStartedOnce,
  solutionProvidedOnce,
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
            completedArticleTextAction={completedArticleTextAction}
            completedTools={completedTools}
            totalTools={totalTools}
          />
        </section>

        <section className="grid gap-5 pb-6 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-4">
            {renderInputSurface(
              analysisType,
              t,
              executionMode,
              onArticleTextRun,
              onArticleTextCancel,
              activeRun,
              bridgeState,
              scanStartedOnce,
              solutionProvidedOnce,
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

        {analysisType === "article_text" &&
          (articleTextState || runtimeReport || activeRun === "scan") &&
          articleTextState?.input?.action !== "solution" && (
          <section className="pb-8">
            {articleTextState ? (
              <ArticleTextResultsDashboard state={articleTextState} />
            ) : (
              <ApiArticleTextReportPanel
                report={runtimeReport}
                completedTools={completedTools}
                totalTools={totalTools}
              />
            )}
          </section>
        )}
      </div>
    </div>
  );
}

function PlannedAnalysisStatusHero({
  executionMode,
  running,
  completedArticleTextAction,
  completedTools,
  totalTools,
}: {
  executionMode: AuditExecutionMode;
  running: boolean;
  completedArticleTextAction: ArticleTextAction | null;
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
  const statusTitle = running
    ? t("analysisHero.scanning", {
        defaultValue: "Analysis in progress",
      })
    : completedArticleTextAction === "solution"
      ? t("analysisHero.solutionProvided", {
          defaultValue: "Answer provided in chat",
        })
      : completedArticleTextAction === "scan"
        ? t("analysisHero.reportReady", {
            defaultValue: "Report formed",
          })
        : t("analysisHero.ready", {
            defaultValue: "Ready to scan",
          });

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
                {statusTitle}
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
  executionMode: AuditExecutionMode,
  onArticleTextAction: (
    action: ArticleTextAction,
    data: ArticleTextPromptData,
  ) => Promise<boolean>,
  onArticleTextCancel: () => void,
  activeRun: ArticleTextAction | null,
  bridgeState: CurrentScanState | null,
  scanStartedOnce: boolean,
  solutionProvidedOnce: boolean,
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
          executionMode={executionMode}
          scanStartedOnce={scanStartedOnce}
          solutionProvidedOnce={solutionProvidedOnce}
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
  executionMode,
  scanStartedOnce,
  solutionProvidedOnce,
  bridgeUnavailable,
  bridgeUnavailableAppName,
  bridgeTargetAppName,
}: {
  onRun: (
    action: ArticleTextAction,
    data: ArticleTextPromptData,
  ) => Promise<boolean>;
  onCancel: () => void;
  activeRun: ArticleTextAction | null;
  executionMode: AuditExecutionMode;
  scanStartedOnce: boolean;
  solutionProvidedOnce: boolean;
  bridgeUnavailable: boolean;
  bridgeUnavailableAppName: string;
  bridgeTargetAppName: string;
}) {
  const { t } = useTranslation();
  const topicRef = useRef("");
  const bodyRef = useRef("");
  const [topicStats, setTopicStats] = useState("");
  const [bodyStats, setBodyStats] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [shake, setShake] = useState(false);
  const [busy, setBusy] = useState(false);
  const hasAnySolutionContext =
    topicStats.trim().length > 0 || bodyStats.trim().length > 0;
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

    if (
      action === "solution" &&
      data.body.trim().length === 0 &&
      data.topic.trim().length === 0
    ) {
      setNotice(
        t("plannedAnalysis.forms.aiDraftNeedContext", {
          defaultValue:
            "Добавьте хотя бы тему, запрос или короткую заготовку текста, чтобы ИИ мог предложить решение.",
        }),
      );
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
      const ok = await onRun(action, data);
      if (!ok) {
        return;
      }
      setNotice(
        executionMode === "native"
          ? action === "solution"
            ? t("plannedAnalysis.forms.aiDraftSentToApiChat", {
                defaultValue:
                  "Запрос отправлен в API + AI Chat, чтобы ИИ смог предоставить вам решение.",
              })
            : t("plannedAnalysis.forms.scanSentToApiChat", {
                defaultValue:
                  "Текст отправлен в API + AI Chat, чтобы ИИ проанализировал его.",
              })
          : action === "solution"
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
    } catch (err) {
      console.warn("[article-text] run failed:", err);
      setNotice(
        executionMode === "native"
          ? t("plannedAnalysis.forms.aiChatOpenFailed", {
              defaultValue:
                "Не удалось открыть API + AI Chat. Проверьте провайдера и попробуйте снова.",
            })
          : t("plannedAnalysis.forms.bridgeRunFailed", {
              defaultValue:
                "Не удалось запустить анализ. Проверьте режим MCP + Instructions и попробуйте снова.",
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
                  : hasAnySolutionContext && !isRunning
                    ? "border-primary/30 bg-white text-primary hover:bg-orange-50"
                    : "border-outline/15 bg-outline-900/10 text-outline-900/40"
              } ${shake ? "toraseo-shake" : ""}`}
            >
              {isSolutionRunning
                ? t("sidebar.cancel", { defaultValue: "Отменить" })
                : solutionProvidedOnce
                  ? t("plannedAnalysis.forms.aiDraftAgainAction", {
                      defaultValue: "Предложить решение повторно",
                    })
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
          setTopicStats(value);
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

interface TextIssueResult {
  severity: "critical" | "warning" | "info";
  code: string;
  message: string;
}

interface TextAnnotationResult {
  category?: string;
  severity?: "critical" | "warning" | "info";
  marker?: RuntimeArticleTextAnnotation["marker"];
  paragraphId?: string;
  quote?: string;
  title?: string;
  shortMessage?: string;
  recommendation?: string;
  confidence?: number;
  global?: boolean;
}

interface TextToolResult {
  tool: string;
  summary?: Record<string, unknown>;
  issues?: TextIssueResult[];
  recommendations?: string[];
  annotations?: TextAnnotationResult[];
}

const ARTICLE_TEXT_METRIC_ORDER = new Map(
  ["uniqueness", "syntax", "logic", "naturalness", "ai"].map((id, index) => [
    id,
    index,
  ]),
);

function orderArticleMetrics(
  metrics: RuntimeArticleTextMetric[],
): RuntimeArticleTextMetric[] {
  return [...metrics].sort(
    (left, right) =>
      (ARTICLE_TEXT_METRIC_ORDER.get(left.id) ?? 99) -
      (ARTICLE_TEXT_METRIC_ORDER.get(right.id) ?? 99),
  );
}

function ApiArticleTextReportPanel({
  report,
  completedTools,
  totalTools,
}: {
  report: RuntimeAuditReport | null;
  completedTools: number;
  totalTools: number;
}) {
  const { t } = useTranslation();
  const [exportStatus, setExportStatus] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);

  if (!report) {
    return (
      <section className="rounded-lg border border-dashed border-orange-200 bg-white p-5">
        <h2 className="font-display text-lg font-semibold text-outline-900">
          {t("plannedAnalysis.results.waitingAiReportTitle", {
            defaultValue: "Ожидаем отчет от ИИ",
          })}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-outline-900/60">
          {t("plannedAnalysis.results.waitingAiReportBody", {
            defaultValue:
              "В API-режиме структурированный отчет формирует выбранная модель. ToraSEO покажет результат здесь после ответа AI Chat.",
          })}
        </p>
      </section>
    );
  }
  const article = report.articleText;
  const reportComplete = Boolean(
    report &&
      completedTools >= totalTools &&
      (!article || article.coverage.completed >= article.coverage.total),
  );
  const highlightFacts =
    article && article.priorities.length > 0
      ? article.priorities.slice(0, 4)
      : report.confirmedFacts.slice(0, 6);
  const hiddenSourceCount =
    article && article.priorities.length > 0
      ? article.priorities.length
      : report.confirmedFacts.length;
  const hiddenFactCount = Math.max(
    0,
    hiddenSourceCount - highlightFacts.length,
  );
  const visibleEvidenceFacts = report.confirmedFacts;

  const openDetails = () => {
    if (!reportComplete) return;
    void window.toraseo.runtime.openReportWindow(report);
  };

  const exportReport = async () => {
    if (!reportComplete) return;
    setExportStatus(null);
    setCopyStatus(null);
    const result = await window.toraseo.runtime.exportReportPdf(report);
    if (result.ok) {
      setExportStatus(
        t("plannedAnalysis.results.exportReady", {
          defaultValue: "Отчет экспортирован.",
        }),
      );
      return;
    }
    if (result.error === "cancelled") {
      setExportStatus(
        t("plannedAnalysis.results.exportCancelled", {
          defaultValue: "Экспорт отменен.",
        }),
      );
      return;
    }
    const fallback = t("plannedAnalysis.results.exportFailed", {
      defaultValue: "Не удалось экспортировать отчет.",
    });
    setExportStatus(result.error ? `${fallback} ${result.error}` : fallback);
  };

  const copyOriginalText = async () => {
    if (!reportComplete) return;
    setExportStatus(null);
    setCopyStatus(null);
    const result = await window.toraseo.runtime.copyArticleSourceText(report);
    if (result.ok) {
      setCopyStatus(
        t("plannedAnalysis.results.copySourceReady", {
          defaultValue: "Исходный текст скопирован.",
        }),
      );
      return;
    }
    const fallback = t("plannedAnalysis.results.copySourceFailed", {
      defaultValue: "Не удалось скопировать исходный текст.",
    });
    setCopyStatus(result.error ? `${fallback} ${result.error}` : fallback);
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
            {report.summary}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-orange-200 bg-orange-50 px-2.5 py-1 font-mono text-xs font-semibold text-outline-900/55">
            {completedTools} / {totalTools}
          </span>
          <button
            type="button"
            onClick={openDetails}
            disabled={!reportComplete}
            className="rounded-md border border-outline/15 bg-white px-3 py-1.5 text-xs font-semibold text-outline-900/70 transition hover:border-primary/40 hover:bg-orange-50 disabled:cursor-not-allowed disabled:opacity-45"
          >
            {t("analysisPanel.actions.details", { defaultValue: "Подробнее" })}
          </button>
          <button
            type="button"
            onClick={() => void exportReport()}
            disabled={!reportComplete}
            className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-primary-600 disabled:cursor-not-allowed disabled:bg-outline-900/15 disabled:text-outline-900/45"
          >
            {t("plannedAnalysis.results.export", {
              defaultValue: "Экспортировать",
            })}
          </button>
          <button
            type="button"
            onClick={() => void copyOriginalText()}
            disabled={!reportComplete}
            className="rounded-md border border-primary/25 bg-orange-50 px-3 py-1.5 text-xs font-semibold text-primary transition hover:border-primary/45 hover:bg-orange-100 disabled:cursor-not-allowed disabled:border-outline/10 disabled:bg-outline-900/5 disabled:text-outline-900/35"
          >
            {t("plannedAnalysis.results.copySourceText", {
              defaultValue: "Копировать исходный текст",
            })}
          </button>
        </div>
      </div>
      {(exportStatus || copyStatus) && (
        <p className="mt-3 text-xs font-medium text-orange-700/75">
          {copyStatus ?? exportStatus}
        </p>
      )}

      {article && (
        <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <article
            className={`rounded-lg border p-4 ${
              article.verdict === "high_risk"
                ? "border-red-200 bg-red-50/45"
                : article.verdict === "needs_revision"
                  ? "border-amber-200 bg-amber-50/45"
                  : "border-emerald-200 bg-emerald-50/45"
            }`}
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-outline-900/45">
              {t("plannedAnalysis.results.readiness", {
                defaultValue: "Готовность к публикации",
              })}
            </p>
            <h3 className="mt-1 text-base font-semibold text-outline-900">
              {article.verdictLabel}
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-outline-900/65">
              {article.verdictDetail}
            </p>
          </article>
          <article className="rounded-lg border border-orange-100 bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-outline-900/45">
              {t("plannedAnalysis.results.coverage", {
                defaultValue: "Покрытие инструментами",
              })}
            </p>
            <p className="mt-2 text-3xl font-semibold text-outline-900">
              {article.coverage.percent}
              <span className="ml-1 text-sm">%</span>
            </p>
            <p className="mt-2 text-sm text-outline-900/60">
              {article.coverage.completed} / {article.coverage.total}
            </p>
          </article>
        </div>
      )}

      {article && article.metrics.length > 0 && (
        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {orderArticleMetrics(article.metrics).map((metric) => (
            <MetricCard key={metric.id} metric={metric} />
          ))}
        </div>
      )}

      {article && (
        <>
          <div className="mt-5 rounded-lg border border-outline/10 bg-white p-4">
            <div className="grid gap-3 lg:grid-cols-2">
              <InsightList
                title={t("plannedAnalysis.results.strengths", {
                  defaultValue: "Сильные стороны",
                })}
                items={article.strengths}
                emptyText={t("plannedAnalysis.results.strengthsEmpty", {
                  defaultValue:
                    "Сильные стороны появятся после завершения проверок.",
                })}
                tone="good"
              />
              <InsightList
                title={t("plannedAnalysis.results.weaknesses", {
                  defaultValue: "Слабые стороны",
                })}
                items={article.weaknesses}
                emptyText={t("plannedAnalysis.results.weaknessesEmpty", {
                  defaultValue:
                    "Явных слабых сторон по текущим инструментам не найдено.",
                })}
                tone="warn"
              />
            </div>
            <WarningSummaryPanel articleSummary={article} />
          </div>

          <IntentForecastPanel articleSummary={article} />

          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            {article.dimensions.map((dimension) => (
              <DimensionCard key={dimension.id} dimension={dimension} />
            ))}
          </div>

          <section className="mt-4 rounded-lg border border-outline/10 bg-white p-4">
            <h3 className="text-center text-sm font-semibold text-outline-900">
              {t("plannedAnalysis.results.priorityTitle", {
                defaultValue: "Что исправить сначала",
              })}
            </h3>
            <div className="mt-3 grid gap-2 lg:grid-cols-2">
              {highlightFacts.map((item) => (
                <PriorityRow key={`${item.title}-${item.detail}`} item={item} />
              ))}
            </div>
            {hiddenFactCount > 0 && (
              <p className="mt-3 text-xs leading-relaxed text-outline-900/50">
                {t("plannedAnalysis.results.hiddenAiReportItems", {
                  count: hiddenFactCount,
                  defaultValue:
                    "Еще {{count}} пунктов доступны в подробном отчете, но здесь показаны только ключевые приоритеты.",
                })}
              </p>
            )}
          </section>

          {visibleEvidenceFacts.length > 0 && (
            <>
              <div className="mt-5">
                <h3 className="text-center text-sm font-semibold text-outline-900">
                  {t("plannedAnalysis.results.toolEvidenceTitle", {
                    defaultValue: "Данные инструментов",
                  })}
                </h3>
              </div>
              <div className="mt-5 grid gap-3 xl:grid-cols-2">
                {visibleEvidenceFacts.map((fact, index) => (
                  <ApiFactRow
                    key={`${fact.sourceToolIds.join(",")}-${fact.title}-${index}`}
                    fact={fact}
                  />
                ))}
              </div>
            </>
          )}
        </>
      )}

      <p className="mt-5 text-sm font-medium text-outline-900">
        {report.nextStep}
      </p>
    </section>
  );
}

function ArticleTextResultsDashboard({
  state,
}: {
  state: CurrentScanState | null;
}) {
  const { t } = useTranslation();
  const [exportStatus, setExportStatus] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
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
  const articleSummary = buildArticleTextSummary(state, t);
  const report = buildArticleTextReport(state, t, articleSummary);
  const canUseReport = report !== null && completedCount > 0;
  const canCopySourceText =
    report !== null &&
    Boolean(
      articleSummary.document.text.trim() || articleSummary.document.sourceFile,
    );
  const evidenceEntries = entries;

  const openDetails = () => {
    if (!report) return;
    void window.toraseo.runtime.openReportWindow(report);
  };

  const exportReport = async () => {
    if (!report) return;
    setExportStatus(null);
    setCopyStatus(null);
    const result = await window.toraseo.runtime.exportReportPdf(report);
    if (result.ok) {
      setExportStatus(
        t("plannedAnalysis.results.exportReady", {
          defaultValue: "Отчет экспортирован.",
        }),
      );
      return;
    }
    if (result.error === "cancelled") {
      setExportStatus(
        t("plannedAnalysis.results.exportCancelled", {
          defaultValue: "Экспорт отменён.",
        }),
      );
      return;
    }
    const fallback = t("plannedAnalysis.results.exportFailed", {
      defaultValue: "Не удалось экспортировать отчет.",
    });
    setExportStatus(result.error ? `${fallback} ${result.error}` : fallback);
  };

  const copyOriginalText = async () => {
    if (!report) return;
    setExportStatus(null);
    setCopyStatus(null);
    const result = await window.toraseo.runtime.copyArticleSourceText(report);
    if (result.ok) {
      setCopyStatus(
        t("plannedAnalysis.results.copySourceReady", {
          defaultValue: "Исходный текст скопирован.",
        }),
      );
      return;
    }
    const fallback = t("plannedAnalysis.results.copySourceFailed", {
      defaultValue: "Не удалось скопировать исходный текст.",
    });
    setCopyStatus(result.error ? `${fallback} ${result.error}` : fallback);
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
          <button
            type="button"
            onClick={() => void copyOriginalText()}
            disabled={!canCopySourceText}
            className="rounded-md border border-primary/25 bg-orange-50 px-3 py-1.5 text-xs font-semibold text-primary transition hover:border-primary/45 hover:bg-orange-100 disabled:cursor-not-allowed disabled:border-outline/10 disabled:bg-outline-900/5 disabled:text-outline-900/35"
          >
            {t("plannedAnalysis.results.copySourceText", {
              defaultValue: "Копировать исходный текст",
            })}
          </button>
        </div>
      </div>
      {(exportStatus || copyStatus) && (
        <p className="mt-3 text-xs font-medium text-orange-700/75">
          {copyStatus ?? exportStatus}
        </p>
      )}

      <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className={`rounded-lg border p-4 ${verdictPanelClass(articleSummary.verdict)}`}>
          <p className="text-xs font-semibold uppercase tracking-wider text-outline-900/50">
            {t("plannedAnalysis.results.verdictEyebrow", {
              defaultValue: "Publish readiness",
            })}
          </p>
          <h3 className="mt-2 font-display text-2xl font-semibold text-outline-900">
            {articleSummary.verdictLabel}
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-outline-900/65">
            {articleSummary.verdictDetail}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {articleSummary.nextActions.slice(0, 3).map((action) => (
              <span
                key={action}
                className="rounded-full border border-outline/10 bg-white/75 px-2.5 py-1 text-xs font-medium text-outline-900/65"
              >
                {action}
              </span>
            ))}
            {articleSummary.warningCount > 0 && (
              <span className="rounded-full border border-red-200 bg-red-50/90 px-2.5 py-1 text-xs font-semibold text-red-700">
                {t("plannedAnalysis.results.warningCountChip", {
                  count: articleSummary.warningCount,
                  defaultValue: "Предупреждения: {{count}}",
                })}
              </span>
            )}
          </div>
        </div>

        <div className="rounded-lg border border-outline/10 bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-outline-900/50">
            {t("plannedAnalysis.results.evidenceCoverage", {
              defaultValue: "Evidence coverage",
            })}
          </p>
          <div className="mt-3 flex items-end gap-2">
            <span className="text-4xl font-semibold text-outline-900">
              {articleSummary.coverage.percent}
            </span>
            <span className="pb-1 text-sm font-semibold text-outline-900/45">
              %
            </span>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-outline-900/10">
            <div
              className="h-full rounded-full bg-primary transition-all duration-500"
              style={{ width: `${articleSummary.coverage.percent}%` }}
            />
          </div>
          <p className="mt-3 text-xs leading-relaxed text-outline-900/55">
            {articleSummary.coverage.completed} / {articleSummary.coverage.total}{" "}
            {t("plannedAnalysis.results.coverageTools", {
              defaultValue: "tools completed. Coverage is not a quality score.",
            })}
          </p>
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {orderArticleMetrics(articleSummary.metrics).map((metric) => (
          <MetricCard key={metric.id} metric={metric} />
        ))}
      </div>

      <div className="mt-5 rounded-lg border border-outline/10 bg-white p-4">
        <div className="grid gap-3 lg:grid-cols-2">
          <InsightList
            title={t("plannedAnalysis.results.strengths", {
              defaultValue: "Сильные стороны",
            })}
            items={articleSummary.strengths}
            emptyText={t("plannedAnalysis.results.strengthsEmpty", {
              defaultValue: "Сильные стороны появятся после завершения проверок.",
            })}
            tone="good"
          />
          <InsightList
            title={t("plannedAnalysis.results.weaknesses", {
              defaultValue: "Слабые стороны",
            })}
            items={articleSummary.weaknesses}
            emptyText={t("plannedAnalysis.results.weaknessesEmpty", {
              defaultValue: "Явных слабых сторон по текущим инструментам не найдено.",
            })}
            tone="warn"
          />
        </div>
        <WarningSummaryPanel articleSummary={articleSummary} />
      </div>

      {articleSummary.intentForecast && (
        <div className="mt-5 rounded-lg border border-orange-200/70 bg-orange-100/50 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-outline-900/50">
                {t("plannedAnalysis.results.intentForecast.title", {
                  defaultValue: "Прогноз интента и SEO-пакет",
                })}
              </p>
              <h3 className="mt-1 font-display text-lg font-semibold text-outline-900">
                {articleSummary.intentForecast.intentLabel}
              </h3>
              <p className="mt-1 text-xs leading-relaxed text-outline-900/55">
                {articleSummary.intentForecast.internetDemandAvailable
                  ? articleSummary.intentForecast.internetDemandSource
                  : t("plannedAnalysis.results.intentForecast.noInternet", {
                      defaultValue:
                        "Это локальный прогноз без SERP и соцданных. Интернет-сверку позже можно подключить отдельным внешним источником.",
                    })}
              </p>
            </div>
            <div className="grid min-w-[260px] grid-cols-3 gap-2 text-center">
              {[
                {
                  label: t("plannedAnalysis.results.intentForecast.hook", {
                    defaultValue: "Хук",
                  }),
                  value: articleSummary.intentForecast.hookScore,
                  tooltip: t("plannedAnalysis.results.intentForecast.hookTooltip", {
                    defaultValue:
                      "Хук показывает, насколько первые строки цепляют читателя: видна ли боль, польза или обещание результата.",
                  }),
                },
                {
                  label: t("plannedAnalysis.results.intentForecast.ctr", {
                    defaultValue: "CTR",
                  }),
                  value: articleSummary.intentForecast.ctrPotential,
                  tooltip: t("plannedAnalysis.results.intentForecast.ctrTooltip", {
                    defaultValue:
                      "CTR — локальная оценка кликабельности заголовка и описания. Это не реальная статистика выдачи.",
                  }),
                },
                {
                  label: t("plannedAnalysis.results.intentForecast.trend", {
                    defaultValue: "Тренд",
                  }),
                  value: articleSummary.intentForecast.trendPotential,
                  tooltip: t("plannedAnalysis.results.intentForecast.trendTooltip", {
                    defaultValue:
                      "Тренд — примерная локальная оценка потенциала темы по формулировкам текста. Интернет-спрос здесь не проверяется.",
                  }),
                },
              ].map(({ label, value, tooltip }) => (
                <div
                  key={String(label)}
                  className="group relative rounded-md bg-white p-2 shadow-sm"
                  aria-label={String(tooltip)}
                >
                  <div className="text-xl font-semibold text-outline-900">
                    {typeof value === "number" ? value : "—"}
                  </div>
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-outline-900/45">
                    {label}
                  </div>
                  <div className="pointer-events-none absolute bottom-[calc(100%+10px)] left-1/2 z-20 hidden w-64 -translate-x-1/2 rounded-lg border border-outline/10 bg-white px-3 py-2 text-left text-xs font-medium leading-relaxed text-outline-900/75 shadow-xl group-hover:block">
                    {tooltip}
                    <span className="absolute -bottom-1.5 left-1/2 h-3 w-3 -translate-x-1/2 rotate-45 border-b border-r border-outline/10 bg-white" />
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            <div className="rounded-md border border-orange-200/70 bg-orange-50/80 p-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-outline-900/50">
                {t("plannedAnalysis.results.intentForecast.cmsPackage", {
                  defaultValue: "Для WordPress / Laravel CMS",
                })}
              </p>
              <dl className="mt-2 grid gap-2 text-xs text-outline-900/65">
                <div>
                  <dt className="font-semibold text-outline-900">
                    {t("plannedAnalysis.results.intentForecast.seoTitle", {
                      defaultValue: "SEO-title",
                    })}
                  </dt>
                  <dd>{articleSummary.intentForecast.seoPackage.seoTitle || "—"}</dd>
                </div>
                <div>
                  <dt className="font-semibold text-outline-900">
                    {t("plannedAnalysis.results.intentForecast.description", {
                      defaultValue: "Описание",
                    })}
                  </dt>
                  <dd>{articleSummary.intentForecast.seoPackage.metaDescription || "—"}</dd>
                </div>
                <div>
                  <dt className="font-semibold text-outline-900">
                    {t("plannedAnalysis.results.intentForecast.keywords", {
                      defaultValue: "Ключевые слова",
                    })}
                  </dt>
                  <dd>
                    {articleSummary.intentForecast.seoPackage.keywords.join(", ") ||
                      "—"}
                  </dd>
                </div>
                <div>
                  <dt className="font-semibold text-outline-900">
                    {t("plannedAnalysis.results.intentForecast.taxonomy", {
                      defaultValue: "Категория / метки",
                    })}
                  </dt>
                  <dd>
                    {articleSummary.intentForecast.seoPackage.category}
                    {articleSummary.intentForecast.seoPackage.tags.length > 0
                      ? ` · ${articleSummary.intentForecast.seoPackage.tags.join(", ")}`
                      : ""}
                  </dd>
                </div>
                <div>
                  <dt className="font-semibold text-outline-900">
                    {t("plannedAnalysis.results.intentForecast.slug", {
                      defaultValue: "URL-slug",
                    })}
                  </dt>
                  <dd>{articleSummary.intentForecast.seoPackage.slug || "—"}</dd>
                </div>
              </dl>
            </div>
            <div className="rounded-md border border-orange-200/70 bg-orange-50/80 p-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-outline-900/50">
                {t("plannedAnalysis.results.intentForecast.hooksTitle", {
                  defaultValue: "Цепляющие хуки",
                })}
              </p>
              <ul className="mt-2 grid gap-2 text-xs leading-relaxed text-outline-900/65">
                {articleSummary.intentForecast.hookIdeas.map((hook) => (
                  <li key={hook}>• {hook}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      <div className="hidden">
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
              defaultValue: "Логическая связность",
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

      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        {articleSummary.dimensions.map((dimension) => (
          <DimensionCard key={dimension.id} dimension={dimension} />
        ))}
      </div>

      <section className="mt-4 rounded-lg border border-outline/10 bg-white p-4">
        <h3 className="text-center text-sm font-semibold text-outline-900">
          {t("plannedAnalysis.results.priorityTitle", {
            defaultValue: "What to fix first",
          })}
        </h3>
        <div className="mt-3 grid gap-2 lg:grid-cols-2">
          {articleSummary.priorities.slice(0, 4).map((item) => (
            <PriorityRow key={`${item.title}-${item.detail}`} item={item} />
          ))}
        </div>
      </section>

      <div className="mt-5">
        <h3 className="text-center text-sm font-semibold text-outline-900">
          {t("plannedAnalysis.results.toolEvidenceTitle", {
            defaultValue: "Tool evidence",
          })}
        </h3>
      </div>

      <div className="mt-5 grid gap-3 xl:grid-cols-2">
        {evidenceEntries.map(([toolId, entry]) => (
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

function IntentForecastPanel({
  articleSummary,
}: {
  articleSummary: RuntimeArticleTextSummary;
}) {
  const { t } = useTranslation();
  const forecast = articleSummary.intentForecast;
  if (!forecast) return null;

  return (
    <div className="mt-5 rounded-lg border border-orange-200/70 bg-orange-100/50 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-outline-900/50">
            {t("plannedAnalysis.results.intentForecast.title", {
              defaultValue: "Прогноз интента и SEO-пакет",
            })}
          </p>
          <h3 className="mt-1 font-display text-lg font-semibold text-outline-900">
            {forecast.intentLabel}
          </h3>
          <p className="mt-1 text-xs leading-relaxed text-outline-900/55">
            {forecast.internetDemandAvailable
              ? forecast.internetDemandSource
              : t("plannedAnalysis.results.intentForecast.noInternet", {
                  defaultValue:
                    "Это локальный прогноз без SERP и соцданных. Интернет-сверку позже можно подключить отдельным внешним источником.",
                })}
          </p>
        </div>
        <div className="grid min-w-[260px] grid-cols-3 gap-2 text-center">
          {[
            {
              label: t("plannedAnalysis.results.intentForecast.hook", {
                defaultValue: "Хук",
              }),
              value: forecast.hookScore,
              tooltip: t("plannedAnalysis.results.intentForecast.hookTooltip", {
                defaultValue:
                  "Хук показывает, насколько первые строки цепляют читателя: видна ли боль, польза или обещание результата.",
              }),
            },
            {
              label: t("plannedAnalysis.results.intentForecast.ctr", {
                defaultValue: "CTR",
              }),
              value: forecast.ctrPotential,
              tooltip: t("plannedAnalysis.results.intentForecast.ctrTooltip", {
                defaultValue:
                  "CTR — локальная оценка кликабельности заголовка и описания. Это не реальная статистика выдачи.",
              }),
            },
            {
              label: t("plannedAnalysis.results.intentForecast.trend", {
                defaultValue: "Тренд",
              }),
              value: forecast.trendPotential,
              tooltip: t("plannedAnalysis.results.intentForecast.trendTooltip", {
                defaultValue:
                  "Тренд — примерная локальная оценка потенциала темы по формулировкам текста. Интернет-спрос здесь не проверяется.",
              }),
            },
          ].map(({ label, value, tooltip }) => (
            <div
              key={String(label)}
              className="group relative rounded-md bg-white p-2 shadow-sm"
              aria-label={String(tooltip)}
            >
              <div className="text-xl font-semibold text-outline-900">
                {typeof value === "number" ? value : "—"}
              </div>
              <div className="text-[10px] font-semibold uppercase tracking-wide text-outline-900/45">
                {label}
              </div>
              <div className="pointer-events-none absolute bottom-[calc(100%+10px)] left-1/2 z-20 hidden w-64 -translate-x-1/2 rounded-lg border border-outline/10 bg-white px-3 py-2 text-left text-xs font-medium leading-relaxed text-outline-900/75 shadow-xl group-hover:block">
                {tooltip}
                <span className="absolute -bottom-1.5 left-1/2 h-3 w-3 -translate-x-1/2 rotate-45 border-b border-r border-outline/10 bg-white" />
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <div className="rounded-md border border-orange-200/70 bg-orange-50/80 p-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-outline-900/50">
            {t("plannedAnalysis.results.intentForecast.cmsPackage", {
              defaultValue: "Для WordPress / Laravel CMS",
            })}
          </p>
          <dl className="mt-2 grid gap-2 text-xs text-outline-900/65">
            <div>
              <dt className="font-semibold text-outline-900">
                {t("plannedAnalysis.results.intentForecast.seoTitle", {
                  defaultValue: "SEO-title",
                })}
              </dt>
              <dd>{forecast.seoPackage.seoTitle || "—"}</dd>
            </div>
            <div>
              <dt className="font-semibold text-outline-900">
                {t("plannedAnalysis.results.intentForecast.description", {
                  defaultValue: "Описание",
                })}
              </dt>
              <dd>{forecast.seoPackage.metaDescription || "—"}</dd>
            </div>
            <div>
              <dt className="font-semibold text-outline-900">
                {t("plannedAnalysis.results.intentForecast.keywords", {
                  defaultValue: "Ключевые слова",
                })}
              </dt>
              <dd>{forecast.seoPackage.keywords.join(", ") || "—"}</dd>
            </div>
            <div>
              <dt className="font-semibold text-outline-900">
                {t("plannedAnalysis.results.intentForecast.taxonomy", {
                  defaultValue: "Категория / метки",
                })}
              </dt>
              <dd>
                {forecast.seoPackage.category}
                {forecast.seoPackage.tags.length > 0
                  ? ` · ${forecast.seoPackage.tags.join(", ")}`
                  : ""}
              </dd>
            </div>
            <div>
              <dt className="font-semibold text-outline-900">
                {t("plannedAnalysis.results.intentForecast.slug", {
                  defaultValue: "URL-slug",
                })}
              </dt>
              <dd>{forecast.seoPackage.slug || "—"}</dd>
            </div>
          </dl>
        </div>
        <div className="rounded-md border border-orange-200/70 bg-orange-50/80 p-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-outline-900/50">
            {t("plannedAnalysis.results.intentForecast.hooksTitle", {
              defaultValue: "Цепляющие хуки",
            })}
          </p>
          <ul className="mt-2 grid gap-2 text-xs leading-relaxed text-outline-900/65">
            {forecast.hookIdeas.map((hook) => (
              <li key={hook}>• {hook}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function ApiFactRow({ fact }: { fact: RuntimeConfirmedFact }) {
  const { i18n, t } = useTranslation();
  const isRu = i18n.language.startsWith("ru");
  const toolId = fact.sourceToolIds[0] ?? "";
  const normalizedDetail = fact.detail
    .replace(/^Ключевые данные:\s*/gim, "")
    .replace(/^Что найдено:\s*/gim, "")
    .replace(/^Что сделать:\s*/gim, "");
  const chunks = normalizedDetail
    .split(/\n{2,}/)
    .map((item) => item.trim())
    .filter(Boolean);
  const keyData = chunks[0] ?? fact.detail;
  const found = chunks[1] ?? "";
  const todo = chunks.slice(2).join("\n\n");
  const findingText = found || keyData;
  const titledFinding =
    fact.title && !findingText.toLowerCase().includes(fact.title.toLowerCase())
      ? `${localizeArticleUiText(fact.title, isRu)}: ${localizeArticleUiText(
          findingText,
          isRu,
        )}`
      : localizeArticleUiText(findingText, isRu);
  const chips =
    keyData.includes(";") && keyData.length <= 260
      ? keyData
          .split(/;\s*/)
          .map((item) => item.trim())
          .filter(Boolean)
          .slice(0, 6)
      : [];

  return (
    <article className="rounded-lg border border-outline/10 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="rounded-md bg-orange-100 p-2 text-primary">
            <ListChecks className="h-4 w-4" strokeWidth={2} />
          </span>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-outline-900">
              {textToolLabel(t, toolId)}
            </h3>
            <p className="text-xs text-outline-900/45">
              {resultDescription(t, toolId)}
            </p>
          </div>
        </div>
        <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-800">
          {t("plannedAnalysis.results.statusComplete", {
            defaultValue: "Готово",
          })}
        </span>
      </div>

      {chips.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-outline-900/45">
            {t("plannedAnalysis.results.keyFacts", {
              defaultValue: "Ключевые данные",
            })}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {chips.map((chip) => (
              <span
                key={chip}
                className="rounded-full border border-orange-200/70 bg-orange-100 px-2.5 py-1 text-xs text-outline-900/75"
              >
                {localizeArticleUiText(chip, isRu)}
              </span>
            ))}
          </div>
        </div>
      )}

      {(found || chips.length === 0) && (
        <div className="mt-4 rounded-md border border-orange-200/75 bg-orange-50/90 px-3 py-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-orange-800/75">
            {t("plannedAnalysis.results.findings", {
              defaultValue: "Что найдено",
            })}
          </p>
          <p className="mt-1 text-sm leading-relaxed text-outline-900/70">
            {titledFinding}
          </p>
        </div>
      )}

      {todo && (
        <div className="mt-4 rounded-md border border-orange-200/75 bg-orange-100/70 px-3 py-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-orange-800/75">
            {t("plannedAnalysis.results.recommendation", {
              defaultValue: "Что сделать",
            })}
          </p>
          <p className="mt-1 text-sm leading-relaxed text-outline-900/70">
            {localizeArticleUiText(todo, isRu)}
          </p>
        </div>
      )}
    </article>
  );
}

function ScoreDial({
  value,
  emptyLabel,
}: {
  value: number | null;
  emptyLabel: string;
}) {
  const score = Math.max(0, Math.min(100, Math.round(value ?? 0)));
  return (
    <div
      className="grid h-36 w-36 place-items-center rounded-full"
      style={{
        background: scoreDialBackground(score),
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
  metric,
  label,
  value,
  suffix,
  tone,
  description,
}: {
  metric?: RuntimeArticleTextMetric;
  label?: string;
  value?: number | null;
  suffix?: string;
  tone?: "good" | "warn" | "bad" | "pending";
  description?: string;
}) {
  const resolvedLabel = metric?.label ?? label ?? "";
  const resolvedValue = metric?.value ?? value ?? null;
  const resolvedSuffix = metric?.suffix ?? suffix ?? "";
  const resolvedTone = metric?.tone ?? tone ?? "pending";
  const resolvedDescription = metric?.description ?? description ?? "";

  return (
    <div className="rounded-lg border border-orange-200/80 bg-orange-50/70 p-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-outline-900/65">
        {resolvedLabel}
      </p>
      <div className="mt-4 flex items-center justify-center">
        <ScoreDial
          value={resolvedValue}
          emptyLabel="..."
        />
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-outline-900/10">
        <div
          className={`h-full rounded-full ${metricToneClass(resolvedTone)}`}
          style={{ width: `${resolvedValue ?? 0}%` }}
        />
      </div>
      {resolvedDescription && (
        <p className="mt-4 text-center text-xs leading-relaxed text-outline-900/70">
          {resolvedDescription}
        </p>
      )}
    </div>
  );
}

function scoreDialBackground(score: number): string {
  const value = Math.max(0, Math.min(100, score));
  const angle = value * 3.6;
  const track = "#f2e6dc";
  if (value <= 0) return `conic-gradient(from -90deg, ${track} 0deg 360deg)`;
  const warmStop = Math.max(4, angle * 0.38);
  const goldStop = Math.max(warmStop + 4, angle * 0.68);
  return `conic-gradient(from -90deg, #ef4444 0deg, #fb6a3a ${warmStop}deg, #f59e0b ${goldStop}deg, #10b981 ${angle}deg, ${track} ${angle}deg 360deg)`;
}

function InsightList({
  title,
  items,
  emptyText,
  tone,
}: {
  title: string;
  items: RuntimeArticleTextSummary["strengths"];
  emptyText: string;
  tone: "good" | "warn";
}) {
  return (
    <div
      className={`rounded-lg border p-4 ${
        tone === "good"
          ? "border-emerald-200/80 bg-emerald-50/70"
          : "border-amber-200/80 bg-amber-50/70"
      }`}
    >
      <p className="text-xs font-semibold uppercase tracking-wider text-outline-900/65">
        {title}
      </p>
      {items.length === 0 ? (
        <p className="mt-3 text-sm leading-relaxed text-outline-900/55">
          {emptyText}
        </p>
      ) : (
        <div className="mt-3 grid gap-2">
          {items.slice(0, 5).map((item) => (
            <article
              key={`${item.title}-${item.sourceToolIds.join(",")}`}
              className="border-t border-outline/10 pt-2 first:border-t-0 first:pt-0"
            >
              <strong className="text-sm text-outline-900">{item.title}</strong>
              <p className="mt-1 text-xs leading-relaxed text-outline-900/60">
                {item.detail}
              </p>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

function WarningSummaryPanel({
  articleSummary,
}: {
  articleSummary: RuntimeArticleTextSummary;
}) {
  const { i18n, t } = useTranslation();
  const isRu = i18n.language.startsWith("ru");
  const warningItems = articleSummary.annotations.filter(
    (item) =>
      item.sourceToolIds.includes("safety_science_review") &&
      (item.severity === "critical" ||
        item.severity === "warning" ||
        item.kind === "issue"),
  );

  if (articleSummary.warningCount <= 0 && warningItems.length === 0) {
    return null;
  }

  return (
    <div className="mt-3 rounded-lg border border-red-200/75 bg-red-50/70 p-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-red-800/80">
        {t("plannedAnalysis.results.warningDetailsTitle", {
          defaultValue: "Риски и ограничения проверки",
        })}
      </p>
      <div className="mt-3 grid gap-2">
        {warningItems.length > 0 ? (
          warningItems.map((item) => (
            <article
              key={`${item.id}-${item.sourceToolIds.join(",")}`}
              className="border-t border-red-200/70 pt-2 first:border-t-0 first:pt-0"
            >
              <strong className="text-sm text-outline-900">
                {localizeArticleUiText(item.title || item.label, isRu)}
              </strong>
              <p className="mt-1 text-xs leading-relaxed text-outline-900/70">
                {localizeArticleUiText(item.shortMessage || item.detail, isRu)}
              </p>
            </article>
          ))
        ) : (
          <p className="text-sm leading-relaxed text-outline-900/65">
            {t("plannedAnalysis.results.warningDetailsFallback", {
              count: articleSummary.warningCount,
              defaultValue:
                "Найдены предупреждения: {{count}}. Проверьте блок безопасности и экспертной проверки перед публикацией.",
            })}
          </p>
        )}
      </div>
      <p className="mt-3 text-xs leading-relaxed text-red-900/60">
        {t("plannedAnalysis.results.warningAiLimitation", {
          defaultValue:
            "Это риск-флаг, а не экспертное заключение: ИИ может ошибаться, поэтому юридические, медицинские, инвестиционные, научные, технические и расчётные утверждения нужно проверять вручную.",
        })}
      </p>
    </div>
  );
}

function localizeArticleUiText(value: string, isRu: boolean): string {
  if (!isRu) return value;
  const replacements: Array<[RegExp, string]> = [
    [/^Risk check$/i, "Проверка риска"],
    [/^Repeated sentence$/i, "Повторяющееся предложение"],
    [/^Intent and promotion forecast$/i, "Прогноз интента и продвижения"],
    [/^This word often makes the sentence sound mechanical or bureaucratic\.$/i, "Это слово часто делает фразу механической или канцелярской."],
    [/^The tone is cautious and expert-oriented; keep warnings precise, not defensive\.$/i, "Тон осторожный и экспертный; оставляйте предупреждения точными, а не оборонительными."],
    [/^Check that examples, terms, and explanation depth match the intended reader\.$/i, "Проверьте, что примеры, термины и глубина объяснения подходят целевому читателю."],
    [/^The text contains legal-sensitive claims\. It should not be presented as legal advice without review\.$/i, "В тексте есть юридически чувствительные формулировки. Их нельзя подавать как юридическую консультацию без проверки."],
    [/^The text contains medical or health-sensitive claims\. It should not replace clinician review or source verification\.$/i, "В тексте есть медицинские или health-sensitive утверждения. Они не должны заменять проверку врачом или источниками."],
    [/^The text contains investment-sensitive claims\. It should not be presented as personal investment advice\.$/i, "В тексте есть инвестиционно чувствительные формулировки. Их нельзя подавать как индивидуальную инвестиционную рекомендацию."],
    [/^The text contains technical or engineering claims that may need expert verification, drawings, standards, or manufacturer documentation\.$/i, "В тексте есть технические или конструкторские утверждения: проверьте их по документации, стандартам, чертежам или у специалиста."],
    [/^The text contains research or scientific-method claims that may need methodology, sources, or calculation review\.$/i, "В тексте есть научные или исследовательские утверждения: проверьте методику, источники и расчёты."],
    [/^The text contains several numeric or formula-like fragments; calculations may need a dedicated check\.$/i, "В тексте есть несколько чисел или формул: расчёты лучше вынести в отдельную проверку."],
    [/^External source, jurisdiction, platform, SERP, or analytics verification was not performed by this local text scan\.$/i, "Внешняя проверка источников, правил площадки, страны, SERP или аналитики в этом локальном анализе не выполнялась."],
  ];
  for (const [pattern, replacement] of replacements) {
    if (pattern.test(value)) return value.replace(pattern, replacement);
  }
  return value;
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
          <span className="rounded-md bg-orange-100 p-2 text-primary">
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
                    className="rounded-full border border-orange-200/70 bg-orange-100 px-2.5 py-1 text-xs text-outline-900/75"
                  >
                    {summaryLabel(t, key)}: {formatSummaryValue(t, key, value)}
                  </span>
                ))}
              </div>
            </div>
          )}
          {issues.length > 0 && (
            <div className="mt-4 rounded-md border border-orange-200/75 bg-orange-50/90 px-3 py-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-orange-800/75">
                {t("plannedAnalysis.results.findings", {
                  defaultValue: "Что найдено",
                })}
              </p>
              <ul className="mt-2 space-y-1.5 text-sm leading-relaxed text-outline-900/75">
                {issues.slice(0, 3).map((issue) => (
                  <li key={`${issue.code}-${issue.message}`} className="flex gap-2">
                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/70" />
                    <span>{textIssueMessage(t, issue)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {recommendations.length > 0 && (
            <div className="mt-4 rounded-md border border-orange-200/75 bg-orange-100/70 px-3 py-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-orange-800/75">
                {t("plannedAnalysis.results.recommendation", {
                  defaultValue: "Что сделать",
                })}
              </p>
              <p className="mt-1 text-sm leading-relaxed text-outline-900/70">
                {textRecommendation(t, toolId, recommendations[0])}
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

function verdictPanelClass(verdict: RuntimeArticleTextVerdict): string {
  if (verdict === "ready") return "border-emerald-200 bg-emerald-50/80";
  if (verdict === "high_risk") return "border-red-200 bg-red-50/85";
  return "border-amber-200 bg-amber-50/85";
}

function dimensionClass(status: RuntimeArticleTextDimensionStatus): string {
  if (status === "healthy") return "border-emerald-200 bg-emerald-100/45";
  if (status === "problem") return "border-red-200 bg-red-100/45";
  return "border-amber-200 bg-amber-100/45";
}

function dimensionBadgeClass(status: RuntimeArticleTextDimensionStatus): string {
  if (status === "healthy") return "bg-emerald-600 text-white shadow-sm";
  if (status === "problem") return "bg-red-600 text-white shadow-sm";
  return "bg-amber-600 text-white shadow-sm";
}

function dimensionStatusLabel(
  t: ReturnType<typeof useTranslation>["t"],
  status: RuntimeArticleTextDimensionStatus,
): string {
  if (status === "healthy") {
    return t("plannedAnalysis.results.dimensionStatus.healthy", {
      defaultValue: "Норма",
    });
  }
  if (status === "problem") {
    return t("plannedAnalysis.results.dimensionStatus.problem", {
      defaultValue: "Проблема",
    });
  }
  return t("plannedAnalysis.results.dimensionStatus.watch", {
    defaultValue: "Нужно проверить",
  });
}

function DimensionCard({
  dimension,
}: {
  dimension: RuntimeArticleTextDimension;
}) {
  const { t } = useTranslation();
  return (
    <article className={`rounded-lg border p-4 ${dimensionClass(dimension.status)}`}>
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-semibold text-outline-900">
          {dimension.label}
        </h3>
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${dimensionBadgeClass(
            dimension.status,
          )}`}
        >
          {dimensionStatusLabel(t, dimension.status)}
        </span>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-outline-900/60">
        {dimension.detail}
      </p>
      <p className="mt-3 text-xs font-medium leading-relaxed text-outline-900/70">
        {dimension.recommendation}
      </p>
    </article>
  );
}

function PriorityRow({ item }: { item: RuntimeArticleTextPriority }) {
  const { t } = useTranslation();
  const firstToolId = item.sourceToolIds[0] ?? "";
  const toolTitle = firstToolId ? textToolLabel(t, firstToolId) : "";
  const title = toolTitle && toolTitle !== firstToolId ? toolTitle : item.title;
  const tone =
    item.priority === "high"
      ? "border-red-100 bg-red-50/45"
      : item.priority === "low"
        ? "border-emerald-100 bg-emerald-50/45"
        : "border-amber-100 bg-amber-50/45";

  return (
    <article className={`rounded-md border px-3 py-2 ${tone}`}>
      <div className="flex items-start justify-between gap-3">
        <h4 className="text-sm font-semibold text-outline-900">{title}</h4>
        <span className="shrink-0 rounded-full bg-white/80 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-outline-900/50">
          {priorityUiLabel(t, item.priority)}
        </span>
      </div>
      <p className="mt-1 text-xs leading-relaxed text-outline-900/65">
        {item.detail}
      </p>
    </article>
  );
}

function priorityUiLabel(
  t: ReturnType<typeof useTranslation>["t"],
  priority: RuntimeArticleTextPriority["priority"],
): string {
  if (priority === "high") {
    return t("plannedAnalysis.results.priority.high", { defaultValue: "Важно" });
  }
  if (priority === "low") {
    return t("plannedAnalysis.results.priority.low", { defaultValue: "Низко" });
  }
  return t("plannedAnalysis.results.priority.medium", { defaultValue: "Средне" });
}

function statusClass(entry: ToolBufferEntry): string {
  if (entry.status === "running") return "bg-blue-100 text-blue-800";
  if (entry.status === "error") return "bg-red-100 text-red-800";
  if (entry.verdict === "critical") return "bg-red-100 text-red-800";
  if (entry.verdict === "warning") return "bg-amber-100 text-amber-800";
  return "bg-emerald-100 text-emerald-800";
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
    platform: t("plannedAnalysis.results.summary.platform", {
      defaultValue: "Платформа",
    }),
    intent: t("plannedAnalysis.results.summary.intent", {
      defaultValue: "Интент",
    }),
    intentLabel: t("plannedAnalysis.results.summary.intentLabel", {
      defaultValue: "Тип интента",
    }),
    hookType: t("plannedAnalysis.results.summary.hookType", {
      defaultValue: "Тип хука",
    }),
    hookScore: t("plannedAnalysis.results.summary.hookScore", {
      defaultValue: "Хук",
    }),
    ctrPotential: t("plannedAnalysis.results.summary.ctrPotential", {
      defaultValue: "CTR",
    }),
    trendPotential: t("plannedAnalysis.results.summary.trendPotential", {
      defaultValue: "Тренд",
    }),
    internetDemandAvailable: t("plannedAnalysis.results.summary.internetDemandAvailable", {
      defaultValue: "Интернет-сверка",
    }),
    internetDemandSource: t("plannedAnalysis.results.summary.internetDemandSource", {
      defaultValue: "Источник спроса",
    }),
    warningCount: t("plannedAnalysis.results.summary.warningCount", {
      defaultValue: "Предупреждения",
    }),
    jurisdictionContext: t("plannedAnalysis.results.summary.jurisdictionContext", {
      defaultValue: "Правовой контекст",
    }),
    externalSourcesUsed: t("plannedAnalysis.results.summary.externalSourcesUsed", {
      defaultValue: "Внешние источники",
    }),
    externalVerificationNeeded: t(
      "plannedAnalysis.results.summary.externalVerificationNeeded",
      { defaultValue: "Нужна внешняя проверка" },
    ),
    medicalSignals: t("plannedAnalysis.results.summary.medicalSignals", {
      defaultValue: "Медицина",
    }),
    investmentSignals: t("plannedAnalysis.results.summary.investmentSignals", {
      defaultValue: "Инвестиции",
    }),
    technicalEngineeringSignals: t(
      "plannedAnalysis.results.summary.technicalEngineeringSignals",
      { defaultValue: "Техника / инженерия" },
    ),
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

function formatSummaryValue(
  t: ReturnType<typeof useTranslation>["t"],
  key: string,
  value: unknown,
): string {
  if (typeof value === "number") {
    return Number.isInteger(value) ? String(value) : value.toFixed(2);
  }
  if (Array.isArray(value)) return value.join(", ") || "-";
  if (typeof value === "boolean") return value ? "да" : "нет";
  if (typeof value === "string") {
    if (key === "inferredPlatform" || key === "platform") {
      return platformLabel(t, value);
    }
    if (key === "intent") return intentValueLabel(t, value);
    if (key === "hookType") return hookTypeLabel(t, value);
    if (key === "jurisdictionContext") return jurisdictionContextLabel(t, value);
    if (key === "detectedStyle") return styleLabel(t, value);
    if (key === "detectedTone") return toneLabel(t, value);
    if (key === "action") return actionLabel(t, value);
    if (key === "dominantScript") return scriptLabel(t, value);
    if (key === "method") return methodLabel(t, value);
    return value;
  }
  return "-";
}

function platformLabel(
  t: ReturnType<typeof useTranslation>["t"],
  key: string,
): string {
  const labels: Record<string, string> = {
    site_article: t("plannedAnalysis.platformLabels.site_article", {
      defaultValue: "Статья для сайта",
    }),
    markdown_article: t("plannedAnalysis.platformLabels.markdown_article", {
      defaultValue: "Markdown-статья",
    }),
    short_social_post: t("plannedAnalysis.platformLabels.short_social_post", {
      defaultValue: "Короткий пост",
    }),
    short_article_or_long_social_post: t(
      "plannedAnalysis.platformLabels.short_article_or_long_social_post",
      { defaultValue: "Короткая статья или длинный пост" },
    ),
    x_short: t("plannedAnalysis.platforms.xShort", { defaultValue: "X: короткий пост" }),
    x_long: t("plannedAnalysis.platforms.xLong", { defaultValue: "X: длинный пост" }),
    facebook: t("plannedAnalysis.platforms.facebook", { defaultValue: "Facebook" }),
    linkedin: t("plannedAnalysis.platforms.linkedin", { defaultValue: "LinkedIn" }),
    habr: t("plannedAnalysis.platforms.habr", { defaultValue: "Хабр" }),
    reddit: t("plannedAnalysis.platforms.reddit", { defaultValue: "Reddit" }),
    custom: t("plannedAnalysis.platforms.custom", { defaultValue: "Своя платформа" }),
  };
  return labels[key] ?? key;
}

function intentValueLabel(
  t: ReturnType<typeof useTranslation>["t"],
  key: string,
): string {
  const labels: Record<string, string> = {
    informational_how_to: t("plannedAnalysis.intentValues.informationalHowTo", {
      defaultValue: "Информационный / решение проблемы",
    }),
    commercial: t("plannedAnalysis.intentValues.commercial", {
      defaultValue: "Коммерческий",
    }),
    expert_opinion: t("plannedAnalysis.intentValues.expertOpinion", {
      defaultValue: "Экспертное мнение",
    }),
    social_engagement: t("plannedAnalysis.intentValues.socialEngagement", {
      defaultValue: "Социальное вовлечение",
    }),
    informational: t("plannedAnalysis.intentValues.informational", {
      defaultValue: "Информационный",
    }),
    informational_problem_solution: t("plannedAnalysis.intentValues.problemSolution", {
      defaultValue: "Информационный / решение проблемы",
    }),
    educational_guide: t("plannedAnalysis.intentValues.educationalGuide", {
      defaultValue: "Обучающий материал",
    }),
    opinion_discussion: t("plannedAnalysis.intentValues.opinionDiscussion", {
      defaultValue: "Мнение / обсуждение",
    }),
    promotion_or_conversion: t("plannedAnalysis.intentValues.promotionConversion", {
      defaultValue: "Продвижение / конверсия",
    }),
  };
  return labels[key] ?? key;
}

function hookTypeLabel(
  t: ReturnType<typeof useTranslation>["t"],
  key: string,
): string {
  const labels: Record<string, string> = {
    question_problem: t("plannedAnalysis.hookTypes.questionProblem", {
      defaultValue: "Вопрос / проблема",
    }),
    statement: t("plannedAnalysis.hookTypes.statement", {
      defaultValue: "Прямое утверждение",
    }),
    list_or_steps: t("plannedAnalysis.hookTypes.listSteps", {
      defaultValue: "Список / шаги",
    }),
    story_context: t("plannedAnalysis.hookTypes.storyContext", {
      defaultValue: "История / контекст",
    }),
    weak_or_missing: t("plannedAnalysis.hookTypes.weakMissing", {
      defaultValue: "Слабый или отсутствует",
    }),
  };
  return labels[key] ?? key;
}

function jurisdictionContextLabel(
  t: ReturnType<typeof useTranslation>["t"],
  key: string,
): string {
  const labels: Record<string, string> = {
    ru_language_assumed: t("plannedAnalysis.jurisdiction.ruLanguageAssumed", {
      defaultValue: "Русский язык: нужна проверка применимой страны",
    }),
    ru_law_context: t("plannedAnalysis.jurisdiction.ruLawContext", {
      defaultValue: "Вероятен российский правовой контекст",
    }),
    ru_language_international_platform: t(
      "plannedAnalysis.jurisdiction.ruLanguageInternationalPlatform",
      {
        defaultValue:
          "Русский текст для международной платформы: нужны правила площадки и страны публикации",
      },
    ),
    platform_rules_first: t("plannedAnalysis.jurisdiction.platformRulesFirst", {
      defaultValue: "Сначала проверить правила площадки",
    }),
    unspecified: t("plannedAnalysis.jurisdiction.unspecified", {
      defaultValue: "Страна и правила не определены",
    }),
  };
  return labels[key] ?? key;
}

function platformDetail(
  t: ReturnType<typeof useTranslation>["t"],
  key: string,
): string {
  const details: Record<string, string> = {
    site_article: t("plannedAnalysis.platformDetails.site_article", {
      defaultValue:
        "Подходит для длинного материала с заголовком, разделами и поисковым интентом.",
    }),
    markdown_article: t("plannedAnalysis.platformDetails.markdown_article", {
      defaultValue:
        "Текст похож на статью с Markdown-разметкой: важно сохранить структуру заголовков.",
    }),
    short_social_post: t("plannedAnalysis.platformDetails.short_social_post", {
      defaultValue:
        "Похоже на короткий пост: заголовок обычно не нужен, важны ясность и быстрый смысл.",
    }),
    short_article_or_long_social_post: t(
      "plannedAnalysis.platformDetails.short_article_or_long_social_post",
      {
        defaultValue:
          "Формат на границе статьи и длинного поста: упаковка зависит от площадки публикации.",
      },
    ),
  };
  return details[key] ??
    t("plannedAnalysis.platformDetails.default", {
      defaultValue: "Формат определен по текущему тексту и выбранным инструментам.",
    });
}

function styleLabel(t: ReturnType<typeof useTranslation>["t"], key: string): string {
  const labels: Record<string, string> = {
    personal: t("plannedAnalysis.styles.personal", { defaultValue: "Личный" }),
    analytical: t("plannedAnalysis.styles.analytical", { defaultValue: "Аналитический" }),
    educational: t("plannedAnalysis.styles.educational", { defaultValue: "Обучающий" }),
    business: t("plannedAnalysis.styles.business", { defaultValue: "Деловой" }),
    informational: t("plannedAnalysis.styles.informational", { defaultValue: "Информационный" }),
  };
  return labels[key] ?? key;
}

function toneLabel(t: ReturnType<typeof useTranslation>["t"], key: string): string {
  const labels: Record<string, string> = {
    cautious_expert: t("plannedAnalysis.tones.cautiousExpert", {
      defaultValue: "Осторожный экспертный",
    }),
    energetic: t("plannedAnalysis.tones.energetic", { defaultValue: "Энергичный" }),
    personal: t("plannedAnalysis.tones.personal", { defaultValue: "Личный" }),
    neutral_explaining: t("plannedAnalysis.tones.neutralExplaining", {
      defaultValue: "Нейтрально-объясняющий",
    }),
  };
  return labels[key] ?? key;
}

function actionLabel(t: ReturnType<typeof useTranslation>["t"], key: string): string {
  if (key === "solution") {
    return t("plannedAnalysis.actionLabels.solution", {
      defaultValue: "Предложить решение",
    });
  }
  return t("plannedAnalysis.actionLabels.scan", {
    defaultValue: "Сканировать текст",
  });
}

function scriptLabel(t: ReturnType<typeof useTranslation>["t"], key: string): string {
  if (key === "cyrillic") {
    return t("plannedAnalysis.scriptLabels.cyrillic", { defaultValue: "Кириллица" });
  }
  if (key === "latin") {
    return t("plannedAnalysis.scriptLabels.latin", { defaultValue: "Латиница" });
  }
  return key;
}

function methodLabel(t: ReturnType<typeof useTranslation>["t"], key: string): string {
  const labels: Record<string, string> = {
    local_repetition_risk: t("plannedAnalysis.methodLabels.local_repetition_risk", {
      defaultValue: "Локальные повторы",
    }),
    heuristic_style_probability: t(
      "plannedAnalysis.methodLabels.heuristic_style_probability",
      { defaultValue: "Эвристика ИИ-стиля" },
    ),
    claim_risk_heuristic: t("plannedAnalysis.methodLabels.claim_risk_heuristic", {
      defaultValue: "Риск фактических утверждений",
    }),
    internal_logic_heuristic: t("plannedAnalysis.methodLabels.internal_logic_heuristic", {
      defaultValue: "Внутренняя логика",
    }),
    ai_claim_hallucination_heuristic: t(
      "plannedAnalysis.methodLabels.ai_claim_hallucination_heuristic",
      { defaultValue: "Риск ИИ-деталей" },
    ),
  };
  return labels[key] ?? key;
}

function annotationStatusLabel(
  t: ReturnType<typeof useTranslation>["t"],
  annotations: RuntimeArticleTextAnnotation[],
): string {
  const issueCount = annotations.filter((item) => item.kind === "issue").length;
  const styleCount = annotations.filter((item) => item.kind === "style").length;
  const recommendationCount = annotations.filter(
    (item) => item.kind === "recommendation",
  ).length;
  if (issueCount > 0 && recommendationCount > 0) {
    return t("plannedAnalysis.results.annotationStatus.issuesAndRecommendations", {
      defaultValue: "Есть замечания и рекомендации",
    });
  }
  if (styleCount > 0) {
    return t("plannedAnalysis.results.annotationStatus.styleIssues", {
      defaultValue: "Есть нарушения стиля",
    });
  }
  if (recommendationCount > 0) {
    return t("plannedAnalysis.results.annotationStatus.recommendations", {
      defaultValue: "Есть рекомендации",
    });
  }
  return t("plannedAnalysis.results.annotationStatus.almostClean", {
    defaultValue: "Почти нет замечаний и рекомендаций",
  });
}

function annotationKindLabel(
  t: ReturnType<typeof useTranslation>["t"],
  kind: RuntimeArticleTextAnnotation["kind"],
): string {
  if (kind === "issue") {
    return t("plannedAnalysis.results.annotationKinds.issue", {
      defaultValue: "Ошибка",
    });
  }
  if (kind === "style") {
    return t("plannedAnalysis.results.annotationKinds.style", {
      defaultValue: "Стиль",
    });
  }
  if (kind === "note") {
    return t("plannedAnalysis.results.annotationKinds.note", {
      defaultValue: "Примечание",
    });
  }
  return t("plannedAnalysis.results.annotationKinds.recommendation", {
    defaultValue: "Рекомендация",
  });
}

function textIssueMessage(
  t: ReturnType<typeof useTranslation>["t"],
  issue: TextIssueResult,
): string {
  const labels: Record<string, string> = {
    thin_text: t("plannedAnalysis.results.issueMessages.thin_text", {
      defaultValue:
        "Текст коротковат для поисковой статьи: стоит раскрыть ответ полезнее перед оптимизацией.",
    }),
    low_paragraph_structure: t(
      "plannedAnalysis.results.issueMessages.low_paragraph_structure",
      {
        defaultValue:
          "В тексте мало чётких абзацев, поэтому его сложнее быстро просмотреть.",
      },
    ),
    weak_heading_structure: t(
      "plannedAnalysis.results.issueMessages.weak_heading_structure",
      {
        defaultValue:
          "Добавьте понятные разделы или подзаголовки, чтобы структура быстрее считывалась.",
      },
    ),
    long_sentences: t("plannedAnalysis.results.issueMessages.long_sentences", {
      defaultValue:
        "Средняя длина предложения высокая: плотные фразы лучше разделить.",
    }),
    formal_phrasing: t("plannedAnalysis.results.issueMessages.formal_phrasing", {
      defaultValue:
        "Есть формальные или механические формулировки: ключевые объяснения лучше сделать прямее.",
    }),
    tone_review: t("plannedAnalysis.results.issueMessages.tone_review", {
      defaultValue:
        "Тон нужно держать в рамках темы и риска: предупреждения должны помогать, а не утяжелять весь текст.",
    }),
    audience_fit: t("plannedAnalysis.results.issueMessages.audience_fit", {
      defaultValue:
        "Проверьте, что примеры, термины и уровень объяснения подходят целевому читателю.",
    }),
    media_markers_present: t(
      "plannedAnalysis.results.issueMessages.media_markers_present",
      {
        defaultValue:
          "Медиа-метки уже есть в тексте: держите их рядом с соответствующими объяснениями.",
      },
    ),
    no_media_markers: t("plannedAnalysis.results.issueMessages.no_media_markers", {
      defaultValue:
        "Медиа-метки не найдены. Добавляйте их только там, где изображение, видео, анимация или аудио помогают понять текст.",
    }),
    uniqueness_risk: t("plannedAnalysis.results.issueMessages.uniqueness_risk", {
      defaultValue:
        "Есть риск локальных повторов или шаблонности. Это не интернет-проверка плагиата.",
    }),
    duplicate_sentences: t("plannedAnalysis.results.issueMessages.duplicate_sentences", {
      defaultValue: "Некоторые предложения почти дословно повторяются внутри текста.",
    }),
    syntax_risk: t("plannedAnalysis.results.issueMessages.syntax_risk", {
      defaultValue:
        "Есть заметные синтаксические или пунктуационные риски, которые стоит проверить перед публикацией.",
    }),
    dense_sentences: t("plannedAnalysis.results.issueMessages.dense_sentences", {
      defaultValue:
        "Некоторые предложения плотные: грамматика может быть нормальной, но читаемость страдает.",
    }),
    ai_style_probability: t(
      "plannedAnalysis.results.issueMessages.ai_style_probability",
      {
        defaultValue:
          "Текст содержит признаки ИИ-стиля: шаблонные переходы, ровный ритм или повторяющиеся слова.",
      },
    ),
    fact_distortion_risk: t(
      "plannedAnalysis.results.issueMessages.fact_distortion_risk",
      {
        defaultValue:
          "В тексте есть фактически чувствительные утверждения, которым может понадобиться проверка источников.",
      },
    ),
    absolute_claims: t("plannedAnalysis.results.issueMessages.absolute_claims", {
      defaultValue:
        "Категоричные формулировки могут искажать смысл, если текст их не доказывает.",
    }),
    sensitive_claims_without_sources: t(
      "plannedAnalysis.results.issueMessages.sensitive_claims_without_sources",
      {
        defaultValue:
          "Медицинские, юридические, финансовые или технические утверждения лучше поддержать источниками или осторожной формулировкой.",
      },
    ),
    possible_internal_contradiction: t(
      "plannedAnalysis.results.issueMessages.possible_internal_contradiction",
      { defaultValue: "В тексте могут быть утверждения, которые тянут выводы в разные стороны." },
    ),
    unsupported_causality: t(
      "plannedAnalysis.results.issueMessages.unsupported_causality",
      {
        defaultValue:
          "Некоторые причинно-следственные переходы могут требовать примера, данных или промежуточного объяснения.",
      },
    ),
    hallucination_risk: t("plannedAnalysis.results.issueMessages.hallucination_risk", {
      defaultValue:
        "Есть признаки, что фактические детали, созданные или обработанные ИИ, нужно перепроверить.",
    }),
    vague_authorities: t("plannedAnalysis.results.issueMessages.vague_authorities", {
      defaultValue:
        "Фразы вроде «эксперты считают» или «исследования показывают» лучше привязать к конкретному источнику.",
    }),
    low_ctr_potential: t("plannedAnalysis.results.issueMessages.low_ctr_potential", {
      defaultValue:
        "Заголовок и начало текста могут недостаточно ясно показывать пользу для выдачи или ленты.",
    }),
    weak_hook: t("plannedAnalysis.results.issueMessages.weak_hook", {
      defaultValue:
        "Первый хук можно усилить: раньше показать проблему читателя, конфликт или понятную выгоду.",
    }),
    unsafe_or_evasion_intent: t(
      "plannedAnalysis.results.issueMessages.unsafe_or_evasion_intent",
      {
        defaultValue:
          "В тексте есть риск опасных инструкций, обхода правил платформы или незаконного применения.",
      },
    ),
    legal_review_needed: t("plannedAnalysis.results.issueMessages.legal_review_needed", {
      defaultValue:
        "В тексте есть юридически чувствительные формулировки. Их нельзя подавать как юридическую консультацию без проверки.",
    }),
    medical_review_needed: t("plannedAnalysis.results.issueMessages.medical_review_needed", {
      defaultValue:
        "В тексте есть медицинские или health-sensitive утверждения. Они не должны заменять проверку врачом или источниками.",
    }),
    investment_review_needed: t(
      "plannedAnalysis.results.issueMessages.investment_review_needed",
      {
        defaultValue:
          "В тексте есть инвестиционно чувствительные формулировки. Их нельзя подавать как индивидуальную инвестиционную рекомендацию.",
      },
    ),
    technical_engineering_review_needed: t(
      "plannedAnalysis.results.issueMessages.technical_engineering_review_needed",
      {
        defaultValue:
          "В тексте есть технические или конструкторские утверждения: проверьте их по документации, стандартам, чертежам или у специалиста.",
      },
    ),
    scientific_review_needed: t(
      "plannedAnalysis.results.issueMessages.scientific_review_needed",
      {
        defaultValue:
          "В тексте есть научные или исследовательские утверждения: проверьте методику, источники и расчёты.",
      },
    ),
    calculation_review_needed: t(
      "plannedAnalysis.results.issueMessages.calculation_review_needed",
      {
        defaultValue:
          "В тексте есть числа или формулы: расчёты лучше вынести в отдельную проверку.",
      },
    ),
    custom_resource_rules_needed: t(
      "plannedAnalysis.results.issueMessages.custom_resource_rules_needed",
      {
        defaultValue:
          "Ресурс публикации задан пользователем: правила площадки, модерацию и доступные реакции аудитории нужно проверить отдельно.",
      },
    ),
    external_verification_needed: t(
      "plannedAnalysis.results.issueMessages.external_verification_needed",
      {
        defaultValue:
          "Внешняя проверка источников, правил площадки, страны, SERP или соцаналитики в этом локальном анализе не выполнялась.",
      },
    ),
    repeated_terms: issue.message.replace(
      /^Repeated terms may make the text feel mechanical:\s*/i,
      t("plannedAnalysis.results.issueMessages.repeated_termsPrefix", {
        defaultValue:
          "Повторяющиеся термины могут делать текст механическим: ",
      }),
    ),
  };
  return labels[issue.code] ?? issue.message;
}

function textRecommendation(
  t: ReturnType<typeof useTranslation>["t"],
  toolId: string,
  fallback: string,
): string {
  const recommendations: Record<string, string> = {
    detect_text_platform: t("plannedAnalysis.results.recommendations.platform", {
      defaultValue:
        "Держите служебные элементы площадки отдельно от тела текста: название, описание, теги и превью.",
    }),
    analyze_text_structure: t("plannedAnalysis.results.recommendations.structure", {
      defaultValue:
        "Соберите один понятный главный заголовок и сгруппируйте разделы по интенту.",
    }),
    analyze_text_style: t("plannedAnalysis.results.recommendations.style", {
      defaultValue:
        "Добавьте конкретные глаголы, более короткие предложения и примеры там, где читатель может остановиться.",
    }),
    analyze_tone_fit: t("plannedAnalysis.results.recommendations.tone", {
      defaultValue:
        "Оставляйте предупреждения точечно: они должны защищать читателя, а не делать весь текст оборонительным.",
    }),
    language_audience_fit: t("plannedAnalysis.results.recommendations.audience", {
      defaultValue:
        "Назовите целевого читателя во вступлении, если тема подходит нескольким аудиториям.",
    }),
    media_placeholder_review: t("plannedAnalysis.results.recommendations.media", {
      defaultValue:
        "Размещайте медиа-метки внутри подходящих разделов, а не в конце текста.",
    }),
    article_uniqueness: t("plannedAnalysis.results.recommendations.uniqueness", {
      defaultValue:
        "Повторяющиеся фрагменты лучше переписать через новые примеры, более узкие тезисы или переходы.",
    }),
    language_syntax: t("plannedAnalysis.results.recommendations.syntax", {
      defaultValue:
        "Сделайте финальную ручную вычитку пунктуации, границ предложений и перегруженных фраз.",
    }),
    ai_writing_probability: t("plannedAnalysis.results.recommendations.ai", {
      defaultValue:
        "Чтобы текст звучал авторски, добавьте специфичные примеры, контекст и разнообразьте ритм фраз.",
    }),
    naturalness_indicators: t("plannedAnalysis.results.recommendations.naturalness", {
      defaultValue:
        "Разнообразьте начала предложений и уберите служебные фразы, которые не добавляют смысла.",
    }),
    logic_consistency_check: t("plannedAnalysis.results.recommendations.logic", {
      defaultValue:
        "Проверьте места с «поэтому», «потому что», «всегда» и «никогда»: там должно хватать обоснования.",
    }),
    fact_distortion_check: t("plannedAnalysis.results.recommendations.facts", {
      defaultValue:
        "Перепроверьте числа, имена и чувствительные утверждения; смягчите то, что нельзя уверенно подтвердить.",
    }),
    ai_hallucination_check: t("plannedAnalysis.results.recommendations.hallucination", {
      defaultValue:
        "Замените расплывчатые источники конкретными или удалите детали, которые нельзя проверить.",
    }),
    intent_seo_forecast: t("plannedAnalysis.results.recommendations.intentSeo", {
      defaultValue:
        "Усилите первую строку, понятную пользу для читателя и SEO-пакет перед публикацией.",
    }),
    safety_science_review: t("plannedAnalysis.results.recommendations.safetyScience", {
      defaultValue:
        "Проверьте юридические, медицинские, инвестиционные, технические, научные и страновые чувствительные места по экспертам, правилам площадки или официальным источникам.",
    }),
  };
  return recommendations[toolId] ?? fallback;
}

function buildArticleAnnotations(
  state: CurrentScanState,
  t: ReturnType<typeof useTranslation>["t"],
): RuntimeArticleTextAnnotation[] {
  const annotations: RuntimeArticleTextAnnotation[] = [];
  for (const toolId of state.selectedTools) {
    const entry = state.buffer[toolId];
    if (!entry) continue;
    if (entry.status === "error") {
      annotations.push({
        id: annotations.length + 1,
        kind: "issue",
        label: annotationKindLabel(t, "issue"),
        detail: entry.errorMessage ?? entry.errorCode ?? "Tool failed.",
        sourceToolIds: [toolId],
      });
      continue;
    }
    const data = parseTextResult(entry.data);
    const hasInternalMediaPlaceholders =
      toolId === "media_placeholder_review" &&
      typeof data?.summary?.markers === "number" &&
      data.summary.markers > 0;
    if (hasInternalMediaPlaceholders) {
      continue;
    }
    for (const item of data?.annotations ?? []) {
      const kind =
        item.severity === "info"
          ? item.category === "style"
            ? "style"
            : "note"
          : item.severity === "critical" || item.severity === "warning"
            ? "issue"
            : "recommendation";
      annotations.push({
        id: annotations.length + 1,
        kind,
        label: annotationKindLabel(t, kind),
        detail:
          item.shortMessage ??
          item.recommendation ??
          item.title ??
          textRecommendation(t, toolId, ""),
        sourceToolIds: [toolId],
        category: item.category,
        severity: item.severity,
        marker: item.marker,
        paragraphId: item.paragraphId,
        quote: item.quote,
        title: item.title,
        shortMessage: item.shortMessage,
        confidence: item.confidence,
        global: item.global,
      });
    }
    for (const issue of data?.issues ?? []) {
      if (issue.code === "platform_inferred") continue;
      const alreadyStructured = (data?.annotations ?? []).some(
        (item) => item.category === issue.code || item.shortMessage === issue.message,
      );
      if (alreadyStructured) continue;
      annotations.push({
        id: annotations.length + 1,
        kind: issue.severity === "info" ? "style" : "issue",
        label: annotationKindLabel(t, issue.severity === "info" ? "style" : "issue"),
        detail: textIssueMessage(t, issue),
        sourceToolIds: [toolId],
      });
    }
    for (const recommendation of (data?.recommendations ?? []).slice(0, 1)) {
      annotations.push({
        id: annotations.length + 1,
        kind: "recommendation",
        label: annotationKindLabel(t, "recommendation"),
        detail: textRecommendation(t, toolId, recommendation),
        sourceToolIds: [toolId],
      });
    }
  }
  return annotations.slice(0, 48).map((item, index) => ({
    ...item,
    id: index + 1,
  }));
}

function inferArticleTitle(
  t: ReturnType<typeof useTranslation>["t"],
  text: string,
  topic: string | undefined,
  platformKey: string,
): { title: string; titleNote: string | null } {
  if (topic?.trim()) {
    return { title: topic.trim(), titleNote: null };
  }
  const titleCandidate = firstExplicitArticleTitleLine(text, 120);
  if (titleCandidate && platformKey !== "short_social_post") {
    return { title: titleCandidate, titleNote: null };
  }
  return {
    title: t("plannedAnalysis.results.untitled", { defaultValue: "Без названия" }),
    titleNote:
      platformKey === "short_social_post"
        ? null
        : t("plannedAnalysis.results.titleMissingNote", {
            defaultValue:
              "Название не найдено в тексте. В будущей версии ИИ сможет предложить вариант справа от заголовка.",
          }),
  };
}

function stripArticleHeadingMarker(value: string): string {
  return value.trim().replace(/^#{1,6}\s+/, "");
}

function stripArticleListMarker(value: string): string {
  return value
    .trim()
    .replace(/^[-*•]\s+/, "")
    .replace(/^\d+[.)]\s+/, "")
    .trim();
}

function isLowercaseStart(value: string): boolean {
  return /^[a-zа-яё]/u.test(value.trim());
}

function isArticleListLeadInLine(value: string): boolean {
  const line = stripArticleHeadingMarker(value).trim();
  if (!line) return false;
  if (/[:：]\s*$/.test(line)) return true;
  return /^(?:эта статья поможет понять|в этой статье|вы узнаете|разбер[её]м|ниже разбер[её]м|практически|важно(?:\s+помнить)?|this article|in this article|you will learn|we will cover)\b/iu.test(
    line,
  );
}

function isArticleListContinuationLine(value: string, previousMeaningfulLine = ""): boolean {
  const raw = stripArticleHeadingMarker(value).trim();
  const line = stripArticleListMarker(raw);
  if (!line) return false;
  if (/^[-*•]\s+/.test(raw)) return true;
  if (previousMeaningfulLine && isArticleListLeadInLine(previousMeaningfulLine)) return true;
  const previousLine = stripArticleListMarker(previousMeaningfulLine);
  if (
    previousLine &&
    isLowercaseStart(previousLine) &&
    isLowercaseStart(line) &&
    line.split(/\s+/).length <= 12
  ) {
    return true;
  }
  if (isLowercaseStart(line) && line.split(/\s+/).length <= 12 && /[,;]$/.test(line)) return true;
  return isLowercaseStart(line) && line.split(/\s+/).length <= 8 && !/[.!?…]$/.test(line);
}

function isArticleServiceLine(value: string): boolean {
  const line = value.trim();
  return (
    isServiceSeoValue(line) ||
    /^[-–—_]{5,}/u.test(line) ||
    /место\s+для\s+(?:изображения|анимации|видео|аудио)|placeholder/iu.test(line)
  );
}

function isLikelyArticleTitleLine(value: string, maxLength: number): boolean {
  const line = stripArticleHeadingMarker(value).trim();
  if (line.length < 4 || line.length > maxLength) return false;
  if (isArticleServiceLine(line)) return false;
  if (isArticleListLeadInLine(line)) return false;
  if (isLowercaseStart(stripArticleListMarker(line))) return false;
  if (/\[[0-9]+\]/.test(line)) return false;
  if (/[.!?…,:;\]]$/.test(line)) return false;
  return line.split(/\s+/).length <= 14;
}

function firstExplicitArticleTitleLine(text: string, maxLength: number): string {
  let previousMeaningfulLine = "";
  let sawIntroFlowBeforeTitle = false;
  for (const rawLine of text.split(/\r?\n/g)) {
    const line = stripArticleHeadingMarker(rawLine).trim();
    if (!line) continue;
    if (isArticleServiceLine(line)) {
      if (/место\s+для|placeholder|[-–—_]{5,}/iu.test(line)) break;
      previousMeaningfulLine = line;
      continue;
    }
    if (
      isArticleListLeadInLine(line) ||
      isArticleListContinuationLine(line, previousMeaningfulLine)
    ) {
      sawIntroFlowBeforeTitle = true;
      previousMeaningfulLine = line;
      continue;
    }
    if (sawIntroFlowBeforeTitle) break;
    if (isLikelyArticleTitleLine(line, maxLength)) return line;
    break;
  }
  return "";
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
    intent_seo_forecast: t("plannedAnalysis.results.descriptions.intent", {
      defaultValue: "Оценивает интент, первую подачу и SEO-пакет.",
    }),
    safety_science_review: t("plannedAnalysis.results.descriptions.safety", {
      defaultValue:
        "Ищет юридические, медицинские, научные и технические риски.",
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

function stringArrayValue(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function isServiceSeoValue(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return (
    !normalized ||
    /^\d{1,3}$/.test(normalized) ||
    /^часть\s+\d{1,3}$/iu.test(normalized) ||
    /^(?:загрузить|скачать)\s+pdf$/iu.test(normalized) ||
    /^(?:download|get)\s+pdf$/iu.test(normalized)
  );
}

function isWeakSeoCategory(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return isServiceSeoValue(value) || normalized === "статьи" || normalized === "articles";
}

function inferCategoryFromKeywords(keywords: string[]): string {
  const joined = keywords.join(" ");
  if (/seo|cms|laravel|wordpress|api|код|разработ|техн|python|css|html/i.test(joined)) {
    return "Технологии";
  }
  if (/здоров|организм|диабет|трениров|питани|медиц|гликоген|глюкоз|углевод|спорт|упражнен|health|diet|fitness/i.test(joined)) {
    return "Здоровье и спорт";
  }
  if (/бизнес|продаж|маркет|клиент|conversion|sales/i.test(joined)) {
    return "Бизнес";
  }
  return "Полезные материалы";
}

function inferSeoTitleFromInput(text: string, topic?: string): string {
  const topicTitle = topic?.trim() ?? "";
  if (topicTitle && !isServiceSeoValue(topicTitle)) return topicTitle;
  return firstExplicitArticleTitleLine(text, 90);
}

function isWeakSeoTitleValue(value: string): boolean {
  const line = value.trim();
  return (
    isServiceSeoValue(line) ||
    isArticleListLeadInLine(line) ||
    isLowercaseStart(stripArticleListMarker(line)) ||
    /[,:;]$/.test(line)
  );
}

function capitalizeTitleStart(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  return `${trimmed[0]?.toUpperCase() ?? ""}${trimmed.slice(1)}`;
}

function fallbackSeoTitleFromKeywords(text: string, keywords: string[]): string {
  const lowered = text.toLowerCase();
  if (/гликоген/u.test(lowered) && /трениров|упражнен|нагруз/u.test(lowered)) {
    return "Восстановление гликогена после тренировки";
  }
  if (keywords.length >= 3) {
    return `${capitalizeTitleStart(keywords.slice(0, 3).join(" "))}: что важно знать`;
  }
  if (keywords[0]) return `${capitalizeTitleStart(keywords[0])}: что важно знать`;
  return "";
}

function inferMetaDescriptionFromInput(text: string): string {
  const cleaned = text
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .filter((line) => line && !isServiceSeoValue(line))
    .join(" ");
  const sentence = cleaned
    .split(/[.!?…]+/g)
    .map((item) => item.trim())
    .find((item) => item.length >= 45);
  if (!sentence) return "";
  return sentence.length <= 155 ? sentence : `${sentence.slice(0, 154).trim()}…`;
}

function inferKeywordListFromInput(text: string, limit = 10): string[] {
  const stopWords = new Set([
    "это",
    "как",
    "что",
    "для",
    "или",
    "при",
    "если",
    "часть",
    "загрузить",
    "скачать",
    "место",
    "изображения",
    "pdf",
  ]);
  const counts = new Map<string, number>();
  for (const match of text.toLowerCase().matchAll(/[\p{L}\p{N}]{4,}/gu)) {
    const word = match[0] ?? "";
    if (!word || stopWords.has(word) || /^\d+$/.test(word)) continue;
    counts.set(word, (counts.get(word) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1])
    .map(([word]) => word)
    .slice(0, limit);
}

const CYRILLIC_SLUG_MAP: Record<string, string> = {
  а: "a",
  б: "b",
  в: "v",
  г: "g",
  д: "d",
  е: "e",
  ё: "e",
  ж: "zh",
  з: "z",
  и: "i",
  й: "y",
  к: "k",
  л: "l",
  м: "m",
  н: "n",
  о: "o",
  п: "p",
  р: "r",
  с: "s",
  т: "t",
  у: "u",
  ф: "f",
  х: "h",
  ц: "ts",
  ч: "ch",
  ш: "sh",
  щ: "sch",
  ъ: "",
  ы: "y",
  ь: "",
  э: "e",
  ю: "yu",
  я: "ya",
};

function toLatinSlug(value: string): string {
  return value
    .toLowerCase()
    .split("")
    .map((char) => CYRILLIC_SLUG_MAP[char] ?? char)
    .join("")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 72);
}

function buildIntentForecast(
  state: CurrentScanState,
): RuntimeArticleTextSummary["intentForecast"] {
  const summary = parseTextResult(state.buffer.intent_seo_forecast?.data)?.summary;
  if (!summary) return undefined;
  const seoPackage =
    typeof summary.seoPackage === "object" && summary.seoPackage !== null
      ? (summary.seoPackage as Record<string, unknown>)
      : {};
  const inputText = state.input?.text ?? "";
  const inferredSeoTitle = inferSeoTitleFromInput(inputText, state.input?.topic);
  const rawSeoTitle = String(seoPackage.seoTitle ?? "");
  const rawMetaDescription = String(seoPackage.metaDescription ?? "");
  const rawSlug = String(seoPackage.slug ?? "");
  const rawKeywords = stringArrayValue(seoPackage.keywords).filter(
    (item) => !isServiceSeoValue(item),
  );
  const fallbackKeywords = inferKeywordListFromInput(inputText);
  const keywords = rawKeywords.length > 0 ? rawKeywords : fallbackKeywords;
  const seoTitle = isWeakSeoTitleValue(rawSeoTitle)
    ? inferredSeoTitle || fallbackSeoTitleFromKeywords(inputText, keywords)
    : rawSeoTitle;
  const slugSource =
    rawSlug || seoTitle || inferredSeoTitle || keywords.slice(0, 5).join(" ");
  return {
    intent: String(summary.intent ?? ""),
    intentLabel: String(summary.intentLabel ?? summary.intent ?? ""),
    hookType: String(summary.hookType ?? ""),
    hookScore:
      typeof summary.hookScore === "number" ? Math.round(summary.hookScore) : null,
    ctrPotential:
      typeof summary.ctrPotential === "number"
        ? Math.round(summary.ctrPotential)
        : null,
    trendPotential:
      typeof summary.trendPotential === "number"
        ? Math.round(summary.trendPotential)
        : null,
    internetDemandAvailable: summary.internetDemandAvailable === true,
    internetDemandSource: String(summary.internetDemandSource ?? ""),
    hookIdeas: stringArrayValue(summary.hookIdeas),
    seoPackage: {
      seoTitle,
      metaDescription:
        rawMetaDescription.length < 50
          ? inferMetaDescriptionFromInput(inputText)
          : rawMetaDescription,
      primaryKeyword: isServiceSeoValue(String(seoPackage.primaryKeyword ?? ""))
        ? (keywords[0] ?? "")
        : String(seoPackage.primaryKeyword ?? ""),
      secondaryKeywords: stringArrayValue(seoPackage.secondaryKeywords).filter(
        (item) => !isServiceSeoValue(item),
      ),
      keywords,
      category: isWeakSeoCategory(String(seoPackage.category ?? ""))
        ? inferCategoryFromKeywords(keywords)
        : String(seoPackage.category ?? ""),
      tags: stringArrayValue(seoPackage.tags).filter((item) => !isServiceSeoValue(item)),
      slug: toLatinSlug(slugSource),
    },
  };
}

function buildArticleStrengths(
  t: ReturnType<typeof useTranslation>["t"],
  dimensions: RuntimeArticleTextDimension[],
  metrics: RuntimeArticleTextMetric[],
): RuntimeArticleTextSummary["strengths"] {
  const strengths = dimensions
    .filter((dimension) => dimension.status === "healthy")
    .slice(0, 4)
    .map((dimension) => ({
      title: dimension.label,
      detail: dimension.recommendation,
      sourceToolIds: dimension.sourceToolIds,
    }));
  const strongMetric = metrics.find(
    (metric) => metric.tone === "good" && typeof metric.value === "number",
  );
  if (strongMetric && strengths.length < 5) {
    strengths.push({
      title: strongMetric.label,
      detail: t("plannedAnalysis.results.strengthMetricDetail", {
        defaultValue:
          "Этот показатель выглядит сильным по текущим инструментам анализа.",
      }),
      sourceToolIds: [strongMetric.id],
    });
  }
  return strengths;
}

function buildArticleWeaknesses(
  dimensions: RuntimeArticleTextDimension[],
  priorities: RuntimeArticleTextPriority[],
): RuntimeArticleTextSummary["weaknesses"] {
  const fromPriorities = priorities
    .filter((item) => item.priority !== "low")
    .slice(0, 5)
    .map((item) => ({
      title: item.title,
      detail: item.detail,
      sourceToolIds: item.sourceToolIds,
    }));
  if (fromPriorities.length > 0) return fromPriorities;
  return dimensions
    .filter((dimension) => dimension.status !== "healthy")
    .slice(0, 5)
    .map((dimension) => ({
      title: dimension.label,
      detail: dimension.recommendation,
      sourceToolIds: dimension.sourceToolIds,
    }));
}

function buildArticleTextSummary(
  state: CurrentScanState,
  t: ReturnType<typeof useTranslation>["t"],
): RuntimeArticleTextSummary {
  const entries = state.selectedTools
    .map((toolId) => [toolId, state.buffer[toolId]] as const)
    .filter(([, entry]) => entry);
  const completed = entries.filter(
    ([, entry]) => entry?.status === "complete" || entry?.status === "error",
  ).length;
  const total = Math.max(1, state.selectedTools.length);
  const coveragePercent = Math.round((completed / total) * 100);

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
  const naturalness =
    typeof naturalnessWarnings === "number"
      ? Math.max(0, 100 - naturalnessWarnings * 18)
      : null;
  const platformKey = String(
    state.input?.textPlatform && state.input.textPlatform !== "auto"
      ? state.input.textPlatform
      : parseTextResult(state.buffer.detect_text_platform?.data)?.summary
          ?.inferredPlatform ?? "site_article",
  );
  const sourceText = state.input?.text?.trim() ?? "";
  const structureSummary =
    parseTextResult(state.buffer.analyze_text_structure?.data)?.summary ?? {};
  const wordCount =
    typeof structureSummary.wordCount === "number"
      ? Math.round(structureSummary.wordCount)
      : typeof parseTextResult(state.buffer.detect_text_platform?.data)?.summary
            ?.wordCount === "number"
        ? Math.round(
            Number(
              parseTextResult(state.buffer.detect_text_platform?.data)?.summary
                ?.wordCount,
            ),
          )
        : null;
  const paragraphCount =
    typeof structureSummary.paragraphCount === "number"
      ? Math.round(structureSummary.paragraphCount)
      : null;
  const title = inferArticleTitle(t, sourceText, state.input?.topic, platformKey);
  const annotations = buildArticleAnnotations(state, t);
  const intentForecast = buildIntentForecast(state);
  const warningCount =
    metricValue(state, "safety_science_review", "warningCount") ?? 0;

  const dimensions: RuntimeArticleTextDimension[] = [
    {
      id: "safety",
      label: t("plannedAnalysis.results.dimensions.safety", {
        defaultValue: "Безопасность и проверка",
      }),
      status: dimensionStatus([
        warningCount > 1 ? "problem" : warningCount > 0 ? "watch" : "healthy",
        entryStatus(state, "safety_science_review"),
      ]),
      detail: t("plannedAnalysis.results.dimensions.safetyDetail", {
        defaultValue:
          "Риски запрещённого контента, обхода правил, юридических, медицинских, инвестиционных, технических, научных выводов, расчётов и внешней сверки.",
      }),
      recommendation:
        warningCount > 0
          ? t("plannedAnalysis.results.dimensions.safetyFix", {
              defaultValue:
                "Проверьте предупреждения перед публикацией; ИИ не заменяет юриста, врача, инвестиционного консультанта, инженера, научного эксперта или ручную проверку источников.",
            })
          : t("plannedAnalysis.results.dimensions.safetyKeep", {
              defaultValue:
                "Блокирующих предупреждений по безопасности и экспертной проверке не найдено.",
            }),
      sourceToolIds: ["safety_science_review"],
    },
    {
      id: "intent",
      label: t("plannedAnalysis.results.dimensions.intent", {
        defaultValue: "Интент и продвижение",
      }),
      status: dimensionStatus([
        scoreStatus(intentForecast?.ctrPotential ?? null, false),
        scoreStatus(intentForecast?.hookScore ?? null, false),
      ]),
      detail: t("plannedAnalysis.results.dimensions.intentDetail", {
        defaultValue:
          "Насколько понятно, зачем читать текст, какой интент он закрывает и насколько сильна первая подача.",
      }),
      recommendation:
        intentForecast && (intentForecast.ctrPotential ?? 0) >= 70
          ? t("plannedAnalysis.results.dimensions.intentKeep", {
              defaultValue:
                "Сохраните текущий интент и используйте SEO-пакет как черновик для CMS.",
            })
          : t("plannedAnalysis.results.dimensions.intentFix", {
              defaultValue:
                "Усилите первую строку, пользу для читателя и SEO-title перед публикацией.",
            }),
      sourceToolIds: ["intent_seo_forecast"],
    },
    {
      id: "originality",
      label: t("plannedAnalysis.results.dimensions.originality", {
        defaultValue: "Originality",
      }),
      status: dimensionStatus([
        scoreStatus(uniqueness, false),
        scoreStatus(aiProbability, true),
        naturalnessWarnings >= 2
          ? "problem"
          : naturalnessWarnings >= 1
            ? "watch"
            : "healthy",
      ]),
      detail: t("plannedAnalysis.results.dimensions.originalityDetail", {
        defaultValue:
          "Local repetition, template risk, naturalness, and AI-style signals.",
      }),
      recommendation:
        uniqueness !== null && uniqueness < 80
          ? t("plannedAnalysis.results.dimensions.originalityFix", {
              defaultValue:
                "Rewrite repeated fragments with fresher examples and less uniform phrasing.",
            })
          : t("plannedAnalysis.results.dimensions.originalityKeep", {
              defaultValue:
                "Keep the specific examples and avoid adding generic filler in later edits.",
            }),
      sourceToolIds: [
        "article_uniqueness",
        "ai_writing_probability",
        "naturalness_indicators",
      ],
    },
    {
      id: "clarity",
      label: t("plannedAnalysis.results.dimensions.clarity", {
        defaultValue: "Clarity",
      }),
      status: dimensionStatus([
        scoreStatus(syntax, false),
        entryStatus(state, "analyze_text_structure"),
        entryStatus(state, "analyze_text_style"),
      ]),
      detail: t("plannedAnalysis.results.dimensions.clarityDetail", {
        defaultValue:
          "Syntax, sentence density, structure, headings, and scanability.",
      }),
      recommendation:
        syntax !== null && syntax < 80
          ? t("plannedAnalysis.results.dimensions.clarityFix", {
              defaultValue:
                "Shorten dense sentences and add clearer section breaks before polishing style.",
            })
          : t("plannedAnalysis.results.dimensions.clarityKeep", {
              defaultValue:
                "Use the current structure as the base and polish only the weak sections.",
            }),
      sourceToolIds: [
        "language_syntax",
        "analyze_text_structure",
        "analyze_text_style",
      ],
    },
    {
      id: "logic",
      label: t("plannedAnalysis.results.dimensions.logic", {
        defaultValue: "Logic",
      }),
      status: dimensionStatus([
        scoreStatus(logicScore, false),
        entryStatus(state, "logic_consistency_check"),
      ]),
      detail: t("plannedAnalysis.results.dimensions.logicDetail", {
        defaultValue:
          "Internal contradictions, weak transitions, and unsupported conclusions.",
      }),
      recommendation:
        logicScore !== null && logicScore < 80
          ? t("plannedAnalysis.results.dimensions.logicFix", {
              defaultValue:
                "Add missing intermediate reasoning where the text jumps from claim to conclusion.",
            })
          : t("plannedAnalysis.results.dimensions.logicKeep", {
              defaultValue:
                "Preserve the current argument chain and verify new claims after editing.",
            }),
      sourceToolIds: ["logic_consistency_check"],
    },
    {
      id: "trust",
      label: t("plannedAnalysis.results.dimensions.trust", {
        defaultValue: "Trust risk",
      }),
      status: dimensionStatus([
        riskStatus(metricValue(state, "fact_distortion_check", "risk")),
        riskStatus(
          metricValue(state, "ai_hallucination_check", "hallucinationRisk"),
        ),
        entryStatus(state, "fact_distortion_check"),
        entryStatus(state, "ai_hallucination_check"),
      ]),
      detail: t("plannedAnalysis.results.dimensions.trustDetail", {
        defaultValue:
          "Fact-sensitive claims, vague authorities, exact numbers, and hallucination risk.",
      }),
      recommendation:
        state.buffer.fact_distortion_check || state.buffer.ai_hallucination_check
          ? t("plannedAnalysis.results.dimensions.trustFix", {
              defaultValue:
                "Verify exact numbers and soften claims that are not supported by concrete evidence.",
            })
          : t("plannedAnalysis.results.dimensions.trustOptional", {
              defaultValue:
                "Run optional trust checks for claim-heavy medical, legal, finance, or technical articles.",
            }),
      sourceToolIds: ["fact_distortion_check", "ai_hallucination_check"],
    },
    {
      id: "platform",
      label: t("plannedAnalysis.results.dimensions.platform", {
        defaultValue: "Platform fit",
      }),
      status: dimensionStatus([
        entryStatus(state, "detect_text_platform"),
        entryStatus(state, "analyze_tone_fit"),
        entryStatus(state, "language_audience_fit"),
        entryStatus(state, "media_placeholder_review"),
      ]),
      detail: t("plannedAnalysis.results.dimensions.platformDetail", {
        defaultValue:
          "Publishing context, tone, audience, language, and media placement.",
      }),
      recommendation:
        entryStatus(state, "media_placeholder_review") !== "healthy"
          ? t("plannedAnalysis.results.dimensions.platformFix", {
              defaultValue:
                "Add media markers only where they clarify the article, not as decoration.",
            })
          : t("plannedAnalysis.results.dimensions.platformKeep", {
              defaultValue:
                "Keep platform-specific packaging separate from the article body.",
            }),
      sourceToolIds: [
        "detect_text_platform",
        "analyze_tone_fit",
        "language_audience_fit",
        "media_placeholder_review",
      ],
    },
  ];

  const priorities = buildArticleTextPriorities(state, t, dimensions);
  const verdict = articleVerdict(dimensions, priorities, coveragePercent);

  return {
    verdict,
    verdictLabel: verdictLabel(t, verdict),
    verdictDetail: verdictDetail(t, verdict, coveragePercent),
    coverage: {
      completed,
      total,
      percent: coveragePercent,
    },
    platform: {
      key: platformKey,
      label: platformLabel(t, platformKey),
      detail: platformDetail(t, platformKey),
    },
    document: {
      title: title.title,
      titleNote: title.titleNote,
      text: sourceText,
      sourceFile: state.workspace?.inputFile,
      wordCount,
      paragraphCount,
    },
    annotationStatus: annotationStatusLabel(t, annotations),
    annotations,
    dimensions,
    priorities,
    warningCount,
    strengths: buildArticleStrengths(t, dimensions, []),
    weaknesses: buildArticleWeaknesses(dimensions, priorities),
    intentForecast,
    metrics: [
      {
        id: "uniqueness",
        label: t("plannedAnalysis.results.uniquenessTitle", {
          defaultValue: "Article uniqueness",
        }),
        value: uniqueness,
        suffix: "%",
        tone: scoreTone(uniqueness),
        description: t("plannedAnalysis.results.uniquenessHint", {
          defaultValue:
            "Локальная оценка повторов и шаблонности. Это не интернет-проверка плагиата.",
        }),
      },
      {
        id: "syntax",
        label: t("plannedAnalysis.results.syntaxTitle", {
          defaultValue: "Language syntax",
        }),
        value: syntax,
        suffix: "%",
        tone: scoreTone(syntax),
        description: t("plannedAnalysis.results.syntaxHint", {
          defaultValue:
            "Показывает риск пунктуации, границ предложений и перегруженных фраз.",
        }),
      },
      {
        id: "ai",
        label: t("plannedAnalysis.results.aiProbabilityTitle", {
          defaultValue: "AI writing probability",
        }),
        value: aiProbability,
        suffix: "%",
        tone: inverseScoreTone(aiProbability),
        description: t("plannedAnalysis.results.aiProbabilityHint", {
          defaultValue:
            "Оценивает, насколько текст звучит как ИИ-черновик по ритму и шаблонам.",
        }),
      },
      {
        id: "logic",
        label: t("plannedAnalysis.results.logicTitle", {
          defaultValue: "Logic consistency",
        }),
        value: logicScore,
        suffix: "%",
        tone: scoreTone(logicScore),
        description: t("plannedAnalysis.results.logicHint", {
          defaultValue:
            "Проверяет противоречия, скачки вывода и слабые причинно-следственные переходы.",
        }),
      },
      {
        id: "naturalness",
        label: t("plannedAnalysis.results.naturalnessTitle", {
          defaultValue: "Naturalness",
        }),
        value: naturalness,
        suffix: "%",
        tone: scoreTone(naturalness),
        description: t("plannedAnalysis.results.naturalnessHint", {
          defaultValue:
            "Показывает риск механических формулировок, повторов и однообразного ритма.",
        }),
      },
    ],
    nextActions: [
      t("plannedAnalysis.results.nextActionFix", {
        defaultValue: "Fix top priorities",
      }),
      t("plannedAnalysis.results.nextActionRewrite", {
        defaultValue: "Ask AI for a bounded rewrite",
      }),
      t("plannedAnalysis.results.nextActionRerun", {
        defaultValue: "Re-run after edits",
      }),
    ],
  };
}

function scoreStatus(
  value: number | null,
  inverse: boolean,
): RuntimeArticleTextDimensionStatus {
  if (value === null) return "healthy";
  if (inverse) {
    if (value >= 65) return "problem";
    if (value >= 40) return "watch";
    return "healthy";
  }
  if (value < 60) return "problem";
  if (value < 80) return "watch";
  return "healthy";
}

function riskStatus(value: number | null): RuntimeArticleTextDimensionStatus {
  if (value === null) return "healthy";
  if (value >= 60) return "problem";
  if (value >= 35) return "watch";
  return "healthy";
}

function entryStatus(
  state: CurrentScanState,
  toolId: string,
): RuntimeArticleTextDimensionStatus {
  const entry = state.buffer[toolId];
  if (!entry) return "healthy";
  if (entry.status === "error" || entry.verdict === "critical") return "problem";
  if (entry.verdict === "warning") return "watch";
  return "healthy";
}

function dimensionStatus(
  statuses: RuntimeArticleTextDimensionStatus[],
): RuntimeArticleTextDimensionStatus {
  if (statuses.includes("problem")) return "problem";
  if (statuses.includes("watch")) return "watch";
  return "healthy";
}

function articleVerdict(
  dimensions: RuntimeArticleTextDimension[],
  priorities: RuntimeArticleTextPriority[],
  coveragePercent: number,
): RuntimeArticleTextVerdict {
  const problems = dimensions.filter((item) => item.status === "problem").length;
  const highPriorities = priorities.filter((item) => item.priority === "high").length;
  if (highPriorities > 0 || problems >= 2) return "high_risk";
  if (problems > 0 || dimensions.some((item) => item.status === "watch")) {
    return "needs_revision";
  }
  return coveragePercent >= 80 ? "ready" : "needs_revision";
}

function verdictLabel(
  t: ReturnType<typeof useTranslation>["t"],
  verdict: RuntimeArticleTextVerdict,
): string {
  if (verdict === "ready") {
    return t("plannedAnalysis.results.verdict.ready", {
      defaultValue: "Ready to publish",
    });
  }
  if (verdict === "high_risk") {
    return t("plannedAnalysis.results.verdict.highRisk", {
      defaultValue: "Needs review before publishing",
    });
  }
  return t("plannedAnalysis.results.verdict.needsRevision", {
    defaultValue: "Needs revision before publish",
  });
}

function verdictDetail(
  t: ReturnType<typeof useTranslation>["t"],
  verdict: RuntimeArticleTextVerdict,
  coveragePercent: number,
): string {
  if (verdict === "ready") {
    return t("plannedAnalysis.results.verdict.readyDetail", {
      defaultValue:
        "The available tool evidence does not show blocking problems. Final human review is still recommended.",
    });
  }
  if (verdict === "high_risk") {
    return t("plannedAnalysis.results.verdict.highRiskDetail", {
      defaultValue:
        "One or more core dimensions show serious risk. Fix the priority items before publishing.",
    });
  }
  if (coveragePercent < 80) {
    return t("plannedAnalysis.results.verdict.lowCoverageDetail", {
      defaultValue:
        "The analysis has useful signals, but evidence coverage is partial. Treat the result as a guided editing pass.",
    });
  }
  return t("plannedAnalysis.results.verdict.needsRevisionDetail", {
    defaultValue:
      "The article can improve materially if the highlighted issues are fixed before publication.",
  });
}

function buildArticleTextPriorities(
  state: CurrentScanState,
  t: ReturnType<typeof useTranslation>["t"],
  dimensions: RuntimeArticleTextDimension[],
): RuntimeArticleTextPriority[] {
  const toolPriorities = state.selectedTools.flatMap((toolId) => {
    const entry = state.buffer[toolId];
    if (!entry) return [];
    if (entry.status === "error") {
      return [
        {
          title: textToolLabel(t, toolId),
          detail: entry.errorMessage ?? entry.errorCode ?? "Tool failed.",
          priority: "high" as const,
          sourceToolIds: [toolId],
        },
      ];
    }
    const data = parseTextResult(entry.data);
    return (data?.issues ?? [])
      .filter((issue) => issue.severity !== "info")
      .map((issue) => ({
        title: textToolLabel(t, toolId),
        detail: textIssueMessage(t, issue),
        priority:
          issue.severity === "critical"
            ? "high" as const
            : "medium" as const,
        sourceToolIds: [toolId],
      }));
  });

  if (toolPriorities.length > 0) {
    return toolPriorities.sort((left, right) => {
      const rank = { high: 0, medium: 1, low: 2 };
      return rank[left.priority] - rank[right.priority];
    });
  }

  return [
    {
      title: t("plannedAnalysis.results.priorityDefaultTitle", {
        defaultValue: "Keep the result stable",
      }),
      detail: t("plannedAnalysis.results.priorityDefaultDetail", {
        defaultValue:
          "No blocking findings were detected. Keep edits focused and re-run analysis after the final draft.",
      }),
      priority: "low",
      sourceToolIds: dimensions.flatMap((dimension) => dimension.sourceToolIds),
    },
  ];
}

function buildArticleTextReport(
  state: CurrentScanState,
  t: ReturnType<typeof useTranslation>["t"],
  articleSummary: RuntimeArticleTextSummary,
): RuntimeAuditReport | null {
  const entries = state.selectedTools
    .map((toolId) => [toolId, state.buffer[toolId]] as const)
    .filter(([, entry]) => entry);
  if (entries.length === 0) return null;

  const confirmedFacts = entries.map(([toolId, entry]) => {
    const data = parseTextResult(entry!.data);
    return {
      title: textToolLabel(t, toolId),
      detail: textResultDetail(t, data, entry!, toolId),
      priority: entry!.verdict === "critical" ? "high" : "medium",
      sourceToolIds: [toolId],
    };
  });

  const expertHypotheses = entries.flatMap(([toolId, entry]) => {
    const data = parseTextResult(entry!.data);
    return (data?.recommendations ?? []).slice(0, 2).map((recommendation) => ({
      title: textToolLabel(t, toolId),
      detail: textRecommendation(t, toolId, recommendation),
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
    articleText: {
      ...articleSummary,
      metrics: orderArticleMetrics(articleSummary.metrics),
    },
  };
}

function textResultDetail(
  t: ReturnType<typeof useTranslation>["t"],
  data: TextToolResult | null,
  entry: ToolBufferEntry,
  toolId: string,
): string {
  if (entry.status === "error") {
    return entry.errorMessage ?? entry.errorCode ?? "Tool failed.";
  }
  const chunks: string[] = [];
  const summary = data?.summary ?? {};
  const summaryText = Object.entries(summary)
    .filter(([key]) => shouldShowSummaryKey(key))
    .slice(0, 6)
    .map(([key, value]) => `${summaryLabel(t, key)}: ${formatSummaryValue(t, key, value)}`)
    .join("; ");
  if (summaryText) chunks.push(summaryText);
  const issueText = (data?.issues ?? [])
    .slice(0, 3)
    .map((issue) => textIssueMessage(t, issue))
    .join(" ");
  if (issueText) chunks.push(issueText);
  const recommendation = data?.recommendations?.[0];
  if (recommendation) chunks.push(textRecommendation(t, toolId, recommendation));
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
      defaultValue: "Проверка логики",
    }),
    ai_hallucination_check: t("analysisTools.ai_hallucination_check.label", {
      defaultValue: "Проверка наличия ИИ и его галлюцинаций",
    }),
    naturalness_indicators: t("analysisTools.naturalness_indicators.label", {
      defaultValue: "Естественность",
    }),
    intent_seo_forecast: t("analysisTools.intent_seo_forecast.label", {
      defaultValue: "Прогноз интента и продвижения",
    }),
    safety_science_review: t("analysisTools.safety_science_review.label", {
      defaultValue: "Проверка рисков",
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
