import {
  FileText,
  Film,
  Globe,
  Image,
  Info,
  ListChecks,
  Music2,
  PanelTop,
  ScanEye,
  SlidersHorizontal,
  Type,
  Video,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  ANALYSIS_TYPES,
  type AnalysisTypeId,
} from "../../config/analysisTypes";
import type { AnalysisToolId } from "../../config/analysisTools";
import {
  DEFAULT_ANALYSIS_VERSION,
  getAnalysisVersionText,
} from "../../config/versions";
import type {
  AuditExecutionMode,
  RuntimeArticleTextAnnotation,
  RuntimeArticleCompareGoalMode,
  RuntimeArticleCompareMetric,
  RuntimeArticleCompareRole,
  RuntimeArticleCompareSummary,
  RuntimeArticleCompareTextSide,
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
import Mascot, { type MascotMood } from "../Mascot/Mascot";

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
  articleCompareInput: ArticleComparePromptData | null;
  siteCompareInput: SiteComparePromptData | null;
  scanStartedOnce: boolean;
  pageByUrlStartedOnce: boolean;
  compareStartedOnce: boolean;
  siteCompareStartedOnce: boolean;
  solutionProvidedOnce: boolean;
  bridgeUnavailable: boolean;
  bridgeUnavailableAppName: string;
  bridgeTargetAppName: string;
  onArticleTextRun: (
    action: ArticleTextAction,
    data: ArticleTextPromptData,
  ) => Promise<boolean>;
  onArticleTextCancel: () => void;
  onPageByUrlRun: (data: PageByUrlPromptData) => Promise<boolean | "fallback">;
  onPageByUrlCancel: () => void;
  onArticleCompareRun: (
    data: ArticleComparePromptData,
  ) => Promise<boolean | "fallback">;
  onArticleCompareCancel: () => void;
  onSiteCompareRun: (data: SiteComparePromptData) => Promise<boolean | "fallback">;
  onSiteCompareCancel: () => void;
  onOpenFormulas: () => void;
  showArticleTextToraRank: boolean;
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
  articleCompareInput,
  siteCompareInput,
  scanStartedOnce,
  pageByUrlStartedOnce,
  compareStartedOnce,
  siteCompareStartedOnce,
  solutionProvidedOnce,
  bridgeUnavailable,
  bridgeUnavailableAppName,
  bridgeTargetAppName,
  onArticleTextRun,
  onArticleTextCancel,
  onPageByUrlRun,
  onPageByUrlCancel,
  onArticleCompareRun,
  onArticleCompareCancel,
  onSiteCompareRun,
  onSiteCompareCancel,
  onOpenFormulas,
  showArticleTextToraRank,
}: PlannedAnalysisViewProps) {
  const { t } = useTranslation();
  const meta = ANALYSIS_TYPES.find((item) => item.id === analysisType);
  const siteCompareResultsRef = useRef<HTMLElement | null>(null);
  const key = meta?.i18nKeyBase ?? "siteByUrl";
  const title = t(`modeSelection.analysisTypes.${key}.title`);
  const subtitle = t(`modeSelection.analysisTypes.${key}.subtitle`);

  useEffect(() => {
    if (analysisType !== "site_compare" || !siteCompareStartedOnce) return;
    const handle = window.setTimeout(() => {
      siteCompareResultsRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 50);
    return () => window.clearTimeout(handle);
  }, [analysisType, siteCompareStartedOnce]);

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
            hasError={
              hasAnalysisStateError(articleTextState) ||
              hasAnalysisStateError(bridgeState)
            }
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
              onPageByUrlRun,
              onPageByUrlCancel,
              onArticleCompareRun,
              onArticleCompareCancel,
              onSiteCompareRun,
              onSiteCompareCancel,
              activeRun,
              bridgeState,
              scanStartedOnce,
              pageByUrlStartedOnce,
              compareStartedOnce,
              siteCompareStartedOnce,
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
                  defaultValue: "The standard score remains 0-100%. The dynamic formula changes the evaluation criteria according to selected tools, but it does not pretend that a larger formula automatically means a cleaner or higher score.",
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
                  defaultValue: "This screen is selectable in 0.0.9 so the workflow shape is visible. The analysis run button stays locked until the dedicated tools, prompts, and scoring contract are connected.",
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
              <ArticleTextResultsDashboard
                state={articleTextState}
                onOpenFormulas={onOpenFormulas}
                showToraRank={showArticleTextToraRank}
              />
            ) : (
              <ApiArticleTextReportPanel
                report={runtimeReport}
                completedTools={completedTools}
                totalTools={totalTools}
              />
            )}
          </section>
        )}

        {analysisType === "page_by_url" &&
          (articleTextState || runtimeReport || activeRun === "scan" || pageByUrlStartedOnce) && (
          <section className="pb-8">
            {articleTextState ? (
              <ArticleTextResultsDashboard
                state={articleTextState}
                onOpenFormulas={onOpenFormulas}
                showToraRank={showArticleTextToraRank}
              />
            ) : (
              <ApiArticleTextReportPanel
                report={runtimeReport}
                completedTools={completedTools}
                totalTools={totalTools}
              />
            )}
          </section>
        )}

        {analysisType === "article_compare" &&
          (runtimeReport || activeRun === "scan" || compareStartedOnce) && (
          <section className="pb-8">
            <ArticleCompareResultsDashboard
              report={runtimeReport}
              bridgeState={bridgeState}
              input={articleCompareInput}
              completedTools={completedTools}
              totalTools={totalTools}
            />
          </section>
        )}

        {analysisType === "site_compare" &&
          (activeRun === "scan" || siteCompareStartedOnce) && (
          <section ref={siteCompareResultsRef} className="pb-8">
            <SiteCompareResultsDashboard
              bridgeState={bridgeState}
              input={siteCompareInput}
              runtimeReport={runtimeReport}
              completedTools={completedTools}
              totalTools={totalTools}
            />
          </section>
        )}
      </div>
    </div>
  );
}

function PlannedAnalysisStatusHero({
  executionMode,
  running,
  hasError,
  completedArticleTextAction,
  completedTools,
  totalTools,
}: {
  executionMode: AuditExecutionMode;
  running: boolean;
  hasError: boolean;
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
  const statusTitle = hasError
    ? t("analysisHero.error", {
        defaultValue: "Error",
      })
    : running
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
            defaultValue: "Ready for analysis",
          });
  const mascotMood = analysisHeroMascotMood({
    running,
    hasError,
    completedArticleTextAction,
  });
  const dotClass = hasError
    ? "bg-red-600"
    : running
      ? "bg-status-working animate-pulse"
      : "bg-status-complete";

  return (
    <section className="rounded-lg border border-orange-100 bg-white px-5 py-4 shadow-sm">
      <div className="flex items-center gap-4">
        <Mascot mood={mascotMood} className="h-20 w-20 shrink-0" />
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
              <div className="mt-1 flex items-center gap-2">
                <span className={`h-2.5 w-2.5 rounded-full ${dotClass}`} />
                <h2 className="text-lg font-semibold text-outline-900">
                  {statusTitle}
                </h2>
              </div>
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
              className={`h-full rounded-full transition-all duration-300 ${
                hasError ? "bg-red-600" : "bg-primary"
              } ${
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

function hasAnalysisStateError(state: CurrentScanState | null): boolean {
  if (!state) return false;
  if (state.status === "error") return true;
  return Object.values(state.buffer).some((entry) => entry?.status === "error");
}

function analysisHeroMascotMood({
  running,
  hasError,
  completedArticleTextAction,
}: {
  running: boolean;
  hasError: boolean;
  completedArticleTextAction: ArticleTextAction | null;
}): MascotMood {
  if (hasError) return "surprised";
  if (running) return "focused";
  if (completedArticleTextAction === "scan") return "happy";
  if (completedArticleTextAction === "solution") return "happy";
  return "neutral";
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
  onPageByUrlRun: (data: PageByUrlPromptData) => Promise<boolean | "fallback">,
  onPageByUrlCancel: () => void,
  onArticleCompareRun: (data: ArticleComparePromptData) => Promise<boolean | "fallback">,
  onArticleCompareCancel: () => void,
  onSiteCompareRun: (data: SiteComparePromptData) => Promise<boolean | "fallback">,
  onSiteCompareCancel: () => void,
  activeRun: ArticleTextAction | null,
  bridgeState: CurrentScanState | null,
  scanStartedOnce: boolean,
  pageByUrlStartedOnce: boolean,
  compareStartedOnce: boolean,
  siteCompareStartedOnce: boolean,
  solutionProvidedOnce: boolean,
  bridgeUnavailable: boolean,
  bridgeUnavailableAppName: string,
  bridgeTargetAppName: string,
) {
  switch (analysisType) {
    case "page_by_url":
      return (
        <PageByUrlPanel
          onRun={onPageByUrlRun}
          onCancel={onPageByUrlCancel}
          active={activeRun === "scan"}
          executionMode={executionMode}
          startedOnce={pageByUrlStartedOnce}
          bridgeUnavailable={bridgeUnavailable}
          bridgeUnavailableAppName={bridgeUnavailableAppName}
        />
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
        <ArticleComparePanel
          onRun={onArticleCompareRun}
          onCancel={onArticleCompareCancel}
          active={activeRun === "scan"}
          executionMode={executionMode}
          compareStartedOnce={compareStartedOnce}
          bridgeUnavailable={bridgeUnavailable}
          bridgeUnavailableAppName={bridgeUnavailableAppName}
        />
      );
    case "site_compare":
      return (
        <SiteComparePanel
          onRun={onSiteCompareRun}
          onCancel={onSiteCompareCancel}
          active={activeRun === "scan"}
          executionMode={executionMode}
          startedOnce={siteCompareStartedOnce}
          bridgeUnavailable={bridgeUnavailable}
          bridgeUnavailableAppName={bridgeUnavailableAppName}
        />
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
              defaultValue: "Conversion, readability, page trust, visual hierarchy, or content UX",
            })}
            rows={5}
          />
        </InputPanel>
      );
    case "image_analysis":
      return (
        <InputPanel
          title={t("plannedAnalysis.forms.imageAnalysis.title", {
            defaultValue: "Image analysis",
          })}
          actionLabel={t("plannedAnalysis.actionLocked", {
            defaultValue: "Execution is being prepared",
          })}
        >
          <div className="flex min-h-[170px] items-center justify-center rounded-lg border border-dashed border-outline/20 bg-white/60 px-4 text-center text-sm leading-relaxed text-outline-900/55">
            {t("plannedAnalysis.forms.imageAnalysis.body", {
              defaultValue: "Image upload, OCR, visual content checks, and media SEO recommendations are in development.",
            })}
          </div>
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

export interface PageByUrlPromptData {
  url: string;
  textBlock: string;
}

export interface ArticleComparePromptData {
  goal: string;
  goalMode: RuntimeArticleCompareGoalMode;
  roleA: RuntimeArticleCompareRole;
  roleB: RuntimeArticleCompareRole;
  textA: string;
  textB: string;
}

export interface SiteComparePromptData {
  urls: string[];
  focus: string;
}

export function inferArticleCompareGoalMode(
  goal: string,
): RuntimeArticleCompareGoalMode {
  const normalized = goal.trim().toLowerCase();
  if (!normalized) return "standard_comparison";

  const mentionsA =
    /(?:\ba\b|text\s*a|article\s*a|текст\s*a|стать[яиею]\s*a)/iu.test(
      normalized,
    );
  const mentionsB =
    /(?:\bb\b|text\s*b|article\s*b|текст\s*b|стать[яиею]\s*b)/iu.test(
      normalized,
    );

  if (
    /похож|копир|плагиат|уникальн|заимств|similar|copy|plagiar|overlap/iu.test(
      normalized,
    )
  ) {
    return "similarity_check";
  }
  if (/стил|тон|ритм|подраж|похожим стил|style|tone|voice|imitat/iu.test(normalized)) {
    return "style_match";
  }
  if (
    /верс|вариант|до\s+и\s+после|что\s+стало|version|variant|before|after/iu.test(
      normalized,
    )
  ) {
    return "version_compare";
  }
  if (/\bab\b|a\/b|пост|хук|hook|cta|соцсет|social/iu.test(normalized)) {
    return "ab_post";
  }
  if (
    /конкур|обогн|лучше\s+конкур|топ|top|competitor|beat|outrank/iu.test(
      normalized,
    )
  ) {
    return "beat_competitor";
  }
  if (mentionsB && !mentionsA) return "focus_text_b";
  if (mentionsA && !mentionsB) return "focus_text_a";
  return "standard_comparison";
}

function PageByUrlPanel({
  onRun,
  onCancel,
  active,
  executionMode,
  startedOnce,
  bridgeUnavailable,
  bridgeUnavailableAppName,
}: {
  onRun: (data: PageByUrlPromptData) => Promise<boolean | "fallback">;
  onCancel: () => void;
  active: boolean;
  executionMode: AuditExecutionMode;
  startedOnce: boolean;
  bridgeUnavailable: boolean;
  bridgeUnavailableAppName: string;
}) {
  const { t, i18n } = useTranslation();
  const statsLocale = i18n.resolvedLanguage === "ru" ? "ru" : "en";
  const urlRef = useRef("");
  const textBlockRef = useRef("");
  const [stats, setStats] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async () => {
    if (active) {
      onCancel();
      setNotice(
        t("plannedAnalysis.forms.scanCancelled", {
          defaultValue: "Analysis cancelled.",
        }),
      );
      return;
    }

    if (bridgeUnavailable) {
      setNotice(
        t("plannedAnalysis.forms.bridgeUnavailable", {
          defaultValue:
            "{{appName}} is closed. Start it again or choose API + AI Chat on the home screen.",
          appName: bridgeUnavailableAppName,
        }),
      );
      return;
    }

    const data: PageByUrlPromptData = {
      url: urlRef.current.trim(),
      textBlock: textBlockRef.current,
    };
    if (!/^https?:\/\//i.test(data.url)) {
      setNotice(
        t("plannedAnalysis.forms.pageByUrlNeedUrl", {
          defaultValue: "Enter the full page URL: https://...",
        }),
      );
      return;
    }

    setBusy(true);
    try {
      const ok = await onRun(data);
      if (ok) {
        setNotice(
          executionMode === "native"
            ? t("plannedAnalysis.forms.pageByUrlSentToApiChat", {
                defaultValue: "Page by URL analysis started in API + AI Chat. The report will appear here after the model responds.",
              })
            : ok === "fallback"
            ? t("plannedAnalysis.forms.pageByUrlSkillFallbackPromptCopied", {
                appName: bridgeUnavailableAppName,
                defaultValue: "Prompt copied. Paste it into {{appName}} so AI can analyze the page through Skill while MCP or the app is unavailable.",
              })
            : t("plannedAnalysis.forms.pageByUrlPromptCopied", {
                defaultValue: "Page by URL analysis started through MCP + Instructions. Results will appear here after the tools finish.",
              }),
        );
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-lg border border-outline/10 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold text-outline-900">
            {t("plannedAnalysis.forms.pageByUrl.title", {
              defaultValue: "Page source",
            })}
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-outline-900/60">
            {t("plannedAnalysis.forms.pageByUrl.body", {
              defaultValue: "ToraSEO will extract the main article text from HTML, skip ads and service blocks, then run checks like text analysis.",
            })}
          </p>
        </div>
        <span className="rounded-full border border-orange-200 bg-orange-50 px-2.5 py-1 text-xs font-semibold text-outline-900/55">
          {executionMode === "native" ? "API + AI Chat" : "MCP + Instructions"}
        </span>
      </div>

      <div className="mt-4">
        <TextInput
          label={t("plannedAnalysis.forms.url", { defaultValue: "URL" })}
          placeholder="https://example.com/article"
          onValueChange={(value) => {
            urlRef.current = value;
          }}
        />
      </div>

      <div className="mt-4">
        <TextArea
          label={t("plannedAnalysis.forms.optionalTextBlock", {
            defaultValue: "Optional text block",
          })}
          placeholder={t("plannedAnalysis.forms.optionalTextBlockPlaceholder", {
            defaultValue: "Paste a specific fragment if only part of the page should be analyzed.",
          })}
          rows={8}
          actionLabel={t("plannedAnalysis.forms.textBlockAction", {
            defaultValue: "Text block",
          })}
          actionMarker={t("plannedAnalysis.forms.textBlockMarker", {
            defaultValue: "------------------------- text block -------------------------",
          })}
          onValueChange={(value) => {
            textBlockRef.current = value;
            setStats(formatTextStats(value, statsLocale));
          }}
        />
        <p className="mt-2 text-xs text-outline-900/50">{stats}</p>
      </div>

      {notice && (
        <p className="mt-4 rounded-md border border-orange-200 bg-orange-50 px-3 py-2 text-sm text-orange-800">
          {notice}
        </p>
      )}

      <div className="mt-5 flex justify-end">
        <button
          type="button"
          onClick={() => void run()}
          disabled={busy}
          className={`rounded-md px-4 py-2 text-sm font-semibold transition ${
            active
              ? "border border-orange-300 bg-white text-orange-800 hover:bg-orange-50"
              : "bg-primary text-white hover:bg-primary-600 disabled:bg-outline-900/15 disabled:text-outline-900/45"
          }`}
        >
          {active
            ? t("sidebar.cancel", { defaultValue: "Cancel" })
            : startedOnce
              ? t("plannedAnalysis.forms.pageByUrlRunAgain", {
                  defaultValue: "Analyze page again",
                })
              : t("plannedAnalysis.forms.pageByUrlRun", {
                  defaultValue: "Analyze page",
                })}
        </button>
      </div>
    </section>
  );
}

function ArticleComparePanel({
  onRun,
  onCancel,
  active,
  executionMode,
  compareStartedOnce,
  bridgeUnavailable,
  bridgeUnavailableAppName,
}: {
  onRun: (data: ArticleComparePromptData) => Promise<boolean | "fallback">;
  onCancel: () => void;
  active: boolean;
  executionMode: AuditExecutionMode;
  compareStartedOnce: boolean;
  bridgeUnavailable: boolean;
  bridgeUnavailableAppName: string;
}) {
  const { t, i18n } = useTranslation();
  const statsLocale = i18n.resolvedLanguage === "ru" ? "ru" : "en";
  const goalRef = useRef("");
  const textARef = useRef("");
  const textBRef = useRef("");
  const [roleA, setRoleA] = useState<RuntimeArticleCompareRole>("own");
  const [roleB, setRoleB] = useState<RuntimeArticleCompareRole>("competitor");
  const [textAStats, setTextAStats] = useState("");
  const [textBStats, setTextBStats] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async () => {
    if (active) {
      onCancel();
      setNotice(
        t("plannedAnalysis.forms.scanCancelled", {
          defaultValue: "Analysis cancelled.",
        }),
      );
      return;
    }

    if (bridgeUnavailable) {
      setNotice(
        t("plannedAnalysis.forms.bridgeUnavailable", {
          defaultValue:
            "{{appName}} is closed. Start it again or choose API + AI Chat on the home screen.",
          appName: bridgeUnavailableAppName,
        }),
      );
      return;
    }

    const goal = goalRef.current.trim();
    const data: ArticleComparePromptData = {
      goal,
      goalMode: inferArticleCompareGoalMode(goal),
      roleA,
      roleB,
      textA: textARef.current,
      textB: textBRef.current,
    };

    if (!data.textA.trim() || !data.textB.trim()) {
      setNotice(
        t("plannedAnalysis.forms.compareNeedTexts", {
          defaultValue: "Add both texts before starting comparison.",
        }),
      );
      return;
    }

    setBusy(true);
    try {
      const ok = await onRun(data);
      if (ok) {
        setNotice(
          executionMode === "native"
            ? t("plannedAnalysis.forms.compareSentToApiChat", {
                defaultValue: "Comparison started in API + AI Chat. The report will appear here after the model responds.",
              })
            : ok === "fallback"
            ? t("plannedAnalysis.forms.compareSkillFallbackPromptCopied", {
                appName: bridgeUnavailableAppName,
                defaultValue: "Prompt copied. Paste it into {{appName}} chat: the Skill will compare the two texts directly in chat while MCP or the app is unavailable.",
              })
            : t("plannedAnalysis.forms.compareBridgeUnavailable", {
                defaultValue: "Two-text comparison started through MCP + Instructions. Results will appear here after the tools finish.",
              }),
        );
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-lg border border-outline/10 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold text-outline-900">
            {t("plannedAnalysis.forms.articleCompare.title", {
              defaultValue: "Two article versions",
            })}
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-outline-900/60">
            {t("plannedAnalysis.forms.articleCompare.body", {
              defaultValue: "Compare two texts by intent, structure, completeness, style, trust, similarity risk, and improvement plan.",
            })}
          </p>
        </div>
        <span className="rounded-full border border-orange-200 bg-orange-50 px-2.5 py-1 text-xs font-semibold text-outline-900/55">
          {executionMode === "native" ? "API + AI Chat" : "MCP + Instructions"}
        </span>
      </div>

      <div className="mt-4">
        <TextArea
          label={t("plannedAnalysis.forms.compareGoal", {
            defaultValue: "Analysis goal",
          })}
          placeholder={t("plannedAnalysis.forms.compareGoalPlaceholder", {
            defaultValue: "For example: find weaknesses in article B, improve my text, or compare both versions neutrally.",
          })}
          rows={3}
          onValueChange={(value) => {
            goalRef.current = value;
          }}
        />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <div className="rounded-lg border border-outline/10 bg-orange-50/35 p-4">
          <CompareRoleSelect
            label={t("plannedAnalysis.forms.articleARole")}
            value={roleA}
            onValueChange={setRoleA}
          />
          <div className="mt-3">
            <TextArea
              label={t("plannedAnalysis.forms.articleA", {
                defaultValue: "Article A role",
              })}
              placeholder={t("plannedAnalysis.forms.articlePlaceholder", {
                defaultValue: "Paste the article text here",
              })}
              rows={14}
              mediaToolbar
              onValueChange={(value) => {
                textARef.current = value;
                setTextAStats(formatTextStats(value, statsLocale));
              }}
            />
          </div>
          <p className="mt-2 text-xs text-outline-900/50">{textAStats}</p>
        </div>

        <div className="rounded-lg border border-outline/10 bg-orange-50/35 p-4">
          <CompareRoleSelect
            label={t("plannedAnalysis.forms.articleBRole")}
            value={roleB}
            onValueChange={setRoleB}
          />
          <div className="mt-3">
            <TextArea
              label={t("plannedAnalysis.forms.articleB", {
                defaultValue: "Article B role",
              })}
              placeholder={t("plannedAnalysis.forms.articlePlaceholder", {
                defaultValue: "Paste the article text here",
              })}
              rows={14}
              mediaToolbar
              onValueChange={(value) => {
                textBRef.current = value;
                setTextBStats(formatTextStats(value, statsLocale));
              }}
            />
          </div>
          <p className="mt-2 text-xs text-outline-900/50">{textBStats}</p>
        </div>
      </div>

      {notice && (
        <p className="mt-4 rounded-md border border-orange-200 bg-orange-50 px-3 py-2 text-sm text-orange-800">
          {notice}
        </p>
      )}

      <div className="mt-5 flex justify-end">
        <button
          type="button"
          onClick={() => void run()}
          disabled={busy}
          className={`rounded-md px-4 py-2 text-sm font-semibold transition ${
            active
              ? "border border-orange-300 bg-white text-orange-800 hover:bg-orange-50"
              : "bg-primary text-white hover:bg-primary-600 disabled:bg-outline-900/15 disabled:text-outline-900/45"
          }`}
        >
          {active
            ? t("sidebar.cancel", { defaultValue: "Cancel" })
            : compareStartedOnce
              ? t("plannedAnalysis.forms.compareRunAgain", {
                  defaultValue: "Compare texts again",
                })
              : t("plannedAnalysis.forms.compareRun", {
                  defaultValue: "Compare texts",
                })}
        </button>
      </div>
    </section>
  );
}

function SiteComparePanel({
  onRun,
  onCancel,
  active,
  executionMode,
  startedOnce,
  bridgeUnavailable,
  bridgeUnavailableAppName,
}: {
  onRun: (data: SiteComparePromptData) => Promise<boolean | "fallback">;
  onCancel: () => void;
  active: boolean;
  executionMode: AuditExecutionMode;
  startedOnce: boolean;
  bridgeUnavailable: boolean;
  bridgeUnavailableAppName: string;
}) {
  const { t } = useTranslation();
  const urlRefs = useRef(["", "", ""]);
  const focusRef = useRef("");
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async () => {
    if (active) {
      onCancel();
      setNotice(t("plannedAnalysis.forms.scanCancelled", { defaultValue: "Analysis cancelled." }));
      return;
    }
    if (executionMode === "bridge" && bridgeUnavailable) {
      setNotice(
        t("plannedAnalysis.forms.bridgeUnavailable", {
          appName: bridgeUnavailableAppName,
          defaultValue: "{{appName}} is unavailable. Open it before starting bridge analysis.",
        }),
      );
      return;
    }
    const urls = Array.from(new Set(urlRefs.current.map((url) => url.trim()).filter(Boolean)));
    if (urls.length < 2) {
      setNotice(
        t("plannedAnalysis.forms.siteCompareNeedUrls", {
          defaultValue: "Add at least two URLs for comparison.",
        }),
      );
      return;
    }
    setBusy(true);
    try {
      const ok = await onRun({ urls: urls.slice(0, 3), focus: focusRef.current.trim() });
      if (ok) {
        setNotice(
          executionMode === "native"
            ? t("plannedAnalysis.forms.siteCompareApiStarted", {
                defaultValue: "AI Chat opened. ToraSEO is scanning the sites, then AI will form the comparison report.",
              })
            : t("plannedAnalysis.forms.siteCompareStarted", {
                defaultValue: "Comparison started through MCP + Instructions. The result will appear below as one comparative dashboard.",
              }),
        );
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-lg border border-outline/10 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold text-outline-900">
            {t("plannedAnalysis.forms.siteCompare.title", {
              defaultValue: "Comparable sites",
            })}
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-outline-900/60">
            {t("plannedAnalysis.forms.siteCompare.body", {
              defaultValue: "Compare up to three sites through one dashboard: who is stronger, why, where the gap is, and what to fix first.",
            })}
          </p>
        </div>
        <span className="rounded-full border border-orange-200 bg-orange-50 px-2.5 py-1 text-xs font-semibold text-outline-900/55">
          {executionMode === "native" ? "API + AI Chat" : "MCP + Instructions"}
        </span>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        {[0, 1, 2].map((index) => (
          <TextInput
            key={index}
            label={`URL ${index + 1}${index === 2 ? " (optional)" : ""}`}
            placeholder={
              index === 0
                ? "https://example.com"
                : index === 1
                  ? "https://competitor.com"
                  : "https://optional-site.com"
            }
            onValueChange={(value) => {
              urlRefs.current[index] = value;
            }}
          />
        ))}
      </div>

      <div className="mt-4">
        <TextArea
          label={t("plannedAnalysis.forms.siteCompareFocus", {
            defaultValue: "Comparison focus",
          })}
          placeholder={t("plannedAnalysis.forms.siteCompareFocusPlaceholder", {
            defaultValue: "Example: compare my site with competitors, find metadata and content gaps, and understand what to borrow from the leader.",
          })}
          rows={3}
          onValueChange={(value) => {
            focusRef.current = value;
          }}
        />
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-4">
        {[
          ["summary", "Summary"],
          ["siteCards", "Site cards"],
          ["heatmap", "Heatmap"],
          ["insights", "Insights"],
        ].map(([key, title]) => (
          <div key={title} className="rounded-lg border border-orange-100 bg-orange-50/40 p-3">
            <p className="text-sm font-semibold text-outline-900">
              {t(`plannedAnalysis.forms.siteComparePreview.${key}.title`, {
                defaultValue: title,
              })}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-outline-900/55">
              {t(`plannedAnalysis.forms.siteComparePreview.${key}.detail`)}
            </p>
          </div>
        ))}
      </div>

      {notice && (
        <p className="mt-4 rounded-md border border-orange-200 bg-orange-50 px-3 py-2 text-sm text-orange-800">
          {notice}
        </p>
      )}

      <div className="mt-5 flex justify-end">
        <button
          type="button"
          onClick={() => void run()}
          disabled={busy}
          className={`rounded-md px-4 py-2 text-sm font-semibold transition ${
            active
              ? "border border-orange-300 bg-white text-orange-800 hover:bg-orange-50"
              : "bg-primary text-white hover:bg-primary-600 disabled:bg-outline-900/15 disabled:text-outline-900/45"
          }`}
        >
          {active
            ? t("sidebar.cancel", { defaultValue: "Cancel" })
            : startedOnce
              ? t("plannedAnalysis.forms.siteCompareRunAgain", {
                  defaultValue: "Compare sites again",
                })
              : t("plannedAnalysis.forms.siteCompareRun", {
                  defaultValue: "Compare sites",
                })}
        </button>
      </div>
    </section>
  );
}

type SiteCompareStatus = "good" | "warn" | "bad" | "pending";

interface SiteCompareCardData {
  url: string;
  hasData: boolean;
  score: number;
  critical: number;
  warning: number;
  metadata: number;
  content: number;
  indexability: number;
}

interface BufferedSiteCompareResult {
  url?: string;
  status?: "complete" | "error";
  summary?: { critical?: number; warning?: number; info?: number };
}

function SiteCompareResultsDashboard({
  bridgeState,
  input,
  runtimeReport,
  completedTools,
  totalTools,
}: {
  bridgeState: CurrentScanState | null;
  input: SiteComparePromptData | null;
  runtimeReport: RuntimeAuditReport | null;
  completedTools: number;
  totalTools: number;
}) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language === "en" ? "en" : "ru";
  const urls = input?.urls ?? bridgeState?.input?.siteUrls ?? [];
  const reportCompare =
    runtimeReport?.analysisType === "site_compare"
      ? runtimeReport.siteCompare
      : null;
  if (urls.length < 2) {
    return (
      <section className="rounded-lg border border-dashed border-orange-200 bg-white p-5">
        <h2 className="font-display text-lg font-semibold text-outline-900">
          {locale === "ru" ? "Ожидаем сайты для сравнения" : "Waiting for sites to compare"}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-outline-900/60">
          {locale === "ru"
            ? "Добавьте минимум два URL. Итоговый экран покажет общий dashboard, а не три полных аудита рядом."
            : "Add at least two URLs. The final screen will show one shared dashboard, not three full audits side by side."}
        </p>
      </section>
    );
  }

  const cards = reportCompare
    ? reportCompare.sites.map((site) => ({
        ...site,
        hasData: true,
      }))
    : buildSiteCompareCards(urls, bridgeState);
  const winner = cards.some((card) => card.hasData)
    ? cards.slice().sort((a, b) => b.score - a.score)[0]
    : null;
  const reportReady =
    Boolean(reportCompare) || (completedTools >= totalTools && totalTools > 0);
  const directions = [
    { label: "Robots", tool: "check_robots_txt" },
    { label: "Sitemap", tool: "analyze_sitemap" },
    { label: "Metadata", tool: "analyze_meta" },
    { label: "Canonical", tool: "analyze_canonical" },
    { label: "Content", tool: "analyze_content" },
    { label: "Redirects", tool: "check_redirects" },
    { label: "Stack", tool: "detect_stack" },
  ];
  const metrics = [
    { label: "Metadata", key: "metadata" as const },
    { label: "Content", key: "content" as const },
    { label: "Indexability", key: "indexability" as const },
    { label: "Overall SEO", key: "score" as const },
  ];
  if (!reportCompare && !bridgeState) {
    return (
      <section className="rounded-lg border border-dashed border-orange-200 bg-white p-5">
        <h2 className="font-display text-lg font-semibold text-outline-900">
          {locale === "ru" ? "API + AI Chat выполняет сравнение" : "API + AI Chat is running the comparison"}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-outline-900/60">
          {locale === "ru"
            ? "Чат открыт отдельно. ToraSEO сначала собирает публичные URL-проверки по каждому сайту, затем ИИ формирует единый сравнительный dashboard."
            : "The chat is open separately. ToraSEO first collects public URL checks for each site, then AI forms one comparative dashboard."}
        </p>
        <p className="mt-3 text-xs font-semibold text-outline-900/45">
          {getAnalysisVersionText("site_compare", locale)}
        </p>
      </section>
    );
  }
  const openDetails = () => {
    const detailsReport = runtimeReport?.siteCompare
      ? runtimeReport.locale === locale
        ? runtimeReport
        : { ...runtimeReport, locale }
      : buildSiteCompareRuntimeReport({
          bridgeState,
          input,
          locale,
          cards,
          winnerUrl: winner?.url ?? null,
          completedTools,
          totalTools,
          directions,
          metrics,
        });
    void window.toraseo.runtime.openReportWindow(
      detailsReport,
    );
  };

  return (
    <section className="space-y-5">
      <div className="rounded-lg border border-outline/10 bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-outline-900/45">
              Competitive comparison dashboard
            </p>
            <h2 className="mt-1 font-display text-xl font-semibold text-outline-900">
              {locale === "ru" ? "Сравнение сайтов по URL" : "Site comparison by URL"}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-outline-900/60">
              {locale === "ru" ? "Победитель" : "Winner"}:{" "}
              <strong>{winner?.url ?? (locale === "ru" ? "ожидаем данные" : "waiting for data")}</strong>.
              {" "}
              {locale === "ru"
                ? "Главная задача экрана — быстро ответить: кто лучше, почему и что делать дальше."
                : "The screen is meant to answer quickly: who is stronger, why, and what to do next."}
            </p>
            <p className="mt-2 text-xs font-semibold text-outline-900/45">
              {getAnalysisVersionText("site_compare", locale)}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-orange-200 bg-orange-50 px-3 py-1.5 text-xs font-semibold text-outline-900/55">
              {reportCompare
                ? `${reportCompare.completed}/${reportCompare.total} ${locale === "ru" ? "проверок" : "checks"}`
                : `${completedTools}/${totalTools} ${locale === "ru" ? "проверок" : "checks"}`}
            </span>
            <button
              type="button"
              onClick={openDetails}
              disabled={urls.length < 2}
              className="rounded-md border border-orange-200 bg-white px-3 py-1.5 text-xs font-semibold text-orange-800 transition hover:bg-orange-50 disabled:cursor-not-allowed disabled:opacity-45"
            >
              {t("analysisPanel.actions.details", { defaultValue: "Details" })}
            </button>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {cards.map((card, index) => (
          <article key={card.url} className="rounded-lg border border-outline/10 bg-white p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wider text-outline-900/45">
                  Site {index + 1}
                </p>
                <h3 className="mt-1 truncate text-base font-semibold text-outline-900">
                  {card.url}
                </h3>
              </div>
              {winner?.url === card.url && (
                <span className="rounded-full bg-primary/10 px-2 py-1 text-xs font-semibold text-primary">
                  {locale === "ru" ? "Победитель" : "Winner"}
                </span>
              )}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <SiteCompareKpi label="SEO" value={card.score} suffix="/100" />
              <SiteCompareKpi label="Issues" value={card.critical + card.warning} />
              <SiteCompareKpi label="Content" value={card.content} suffix="/100" />
              <SiteCompareKpi label="Metadata" value={card.metadata} suffix="/100" />
            </div>
          </article>
        ))}
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="rounded-lg border border-outline/10 bg-white p-5">
          <h3 className="font-display text-lg font-semibold text-outline-900">
            {locale === "ru" ? "Сравнительные метрики" : "Comparative metrics"}
          </h3>
          <div className="mt-4 space-y-4">
            {metrics.map(({ label, key }) => (
              <div key={key}>
                <p className="mb-2 text-sm font-semibold text-outline-900">{label}</p>
                <div className="space-y-2">
                  {cards.map((card) => {
                    const value = card[key] as number;
                    return (
                      <div key={`${key}-${card.url}`} className="grid grid-cols-[120px_minmax(0,1fr)_42px] items-center gap-2 text-xs">
                        <span className="truncate text-outline-900/60">{card.url}</span>
                        <span className="h-2 overflow-hidden rounded-full bg-outline-900/10">
                          <span className="block h-full rounded-full bg-primary" style={{ width: `${value}%` }} />
                        </span>
                        <strong className="text-right text-outline-900">{value}</strong>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-lg border border-outline/10 bg-white p-5">
          <h3 className="font-display text-lg font-semibold text-outline-900">
            Radar profile
          </h3>
          <div className="mt-4">
            <SiteCompareRadar cards={cards} />
          </div>
        </section>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="rounded-lg border border-outline/10 bg-white p-5">
          <h3 className="font-display text-lg font-semibold text-outline-900">
            {locale === "ru" ? "Delta к лидеру" : "Delta to leader"}
          </h3>
          <div className="mt-4 space-y-3">
            {cards.map((card) => {
              const delta = winner ? card.score - winner.score : 0;
              return (
                <div key={`delta-${card.url}`} className="grid grid-cols-[140px_minmax(0,1fr)_48px] items-center gap-3 text-xs">
                  <span className="truncate text-outline-900/60">{card.url}</span>
                  <span className="h-2 overflow-hidden rounded-full bg-outline-900/10">
                    <span
                      className={`block h-full rounded-full ${delta >= 0 ? "bg-emerald-500" : "bg-orange-400"}`}
                      style={{ width: `${Math.max(4, Math.min(100, Math.abs(delta)))}%` }}
                    />
                  </span>
                  <strong className="text-right text-outline-900">{delta}</strong>
                </div>
              );
            })}
          </div>
        </section>

        <section className="rounded-lg border border-outline/10 bg-white p-5">
          <h3 className="font-display text-lg font-semibold text-outline-900">
            {locale === "ru" ? "Что делать" : "What to do"}
          </h3>
          <div className="mt-4 space-y-3 text-sm text-outline-900/70">
            <p>
              <strong>{locale === "ru" ? "Что перенять у лидера:" : "What to borrow from the leader:"}</strong>{" "}
              {locale === "ru"
                ? "стабильные направления без критичных замечаний, полный metadata-пакет и более глубокий контент."
                : "stable directions without critical findings, a complete metadata package, and deeper content."}
            </p>
            <p>
              <strong>{locale === "ru" ? "Что исправить первым:" : "What to fix first:"}</strong>{" "}
              {locale === "ru"
                ? "красные ячейки в матрице, затем самые большие разрывы по Metadata, Content и Indexability."
                : "red cells in the matrix, then the largest gaps in Metadata, Content, and Indexability."}
            </p>
            <p className="rounded-md bg-orange-50 px-3 py-2 text-xs text-outline-900/55">
              {reportReady
                ? locale === "ru"
                  ? "Сравнение завершено. Можно открывать детали по направлениям и запускать повторный прогон после правок."
                  : "Comparison is complete. You can open direction details and rerun after edits."
                : locale === "ru"
                  ? "Пока идёт сбор данных. Dashboard уже показывает поступающие сигналы компактно."
                  : "Data is still being collected. The dashboard already shows incoming signals compactly."}
            </p>
          </div>
        </section>
      </div>

      <section className="rounded-lg border border-outline/10 bg-white p-5">
        <h3 className="font-display text-lg font-semibold text-outline-900">
          {locale === "ru" ? "Heatmap / матрица направлений" : "Heatmap / direction matrix"}
        </h3>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="text-xs uppercase tracking-wider text-outline-900/45">
              <tr>
                <th className="py-2 pr-3">{locale === "ru" ? "Направление" : "Direction"}</th>
                {cards.map((card) => (
                  <th key={card.url} className="px-3 py-2">{card.url}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-outline/10">
              {(reportCompare?.directions ?? directions).map((direction) => (
                <tr key={"tool" in direction ? direction.tool : direction.label}>
                  <td className="py-3 pr-3 font-medium text-outline-900">{direction.label}</td>
                  {"values" in direction
                    ? direction.values.map((item) => (
                        <td key={`${direction.label}-${item.url}`} className="px-3 py-3">
                          <SiteCompareStatusPill status={item.status} locale={locale} />
                        </td>
                      ))
                    : cards.map((card) => (
                        <td key={`${direction.tool}-${card.url}`} className="px-3 py-3">
                          <SiteCompareStatusPill status={statusForSiteTool(bridgeState, direction.tool, card.url)} locale={locale} />
                        </td>
                      ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-outline-900/35">
        {getAnalysisVersionText("site_compare", locale)}
      </p>
    </section>
  );
}

function SiteCompareKpi({
  label,
  value,
  suffix = "",
}: {
  label: string;
  value: number;
  suffix?: string;
}) {
  return (
    <div className="rounded-md bg-orange-50/50 px-3 py-2">
      <p className="text-xs font-semibold uppercase tracking-wider text-outline-900/45">{label}</p>
      <p className="mt-1 text-lg font-semibold text-outline-900">{value}{suffix}</p>
    </div>
  );
}

function SiteCompareStatusPill({
  status,
  locale,
}: {
  status: SiteCompareStatus;
  locale: "ru" | "en";
}) {
  const map: Record<SiteCompareStatus, { label: string; className: string }> = {
    good: { label: "OK", className: "bg-emerald-50 text-emerald-700" },
    warn: {
      label: locale === "ru" ? "Проверить" : "Review",
      className: "bg-amber-50 text-amber-700",
    },
    bad: {
      label: locale === "ru" ? "Проблема" : "Problem",
      className: "bg-red-50 text-red-700",
    },
    pending: {
      label: locale === "ru" ? "Ожидаем" : "Waiting",
      className: "bg-outline-900/5 text-outline-900/45",
    },
  };
  const item = map[status];
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${item.className}`}>
      {item.label}
    </span>
  );
}

function SiteCompareRadar({ cards }: { cards: SiteCompareCardData[] }) {
  const axes = [
    { key: "score" as const, label: "SEO" },
    { key: "metadata" as const, label: "Meta" },
    { key: "content" as const, label: "Content" },
    { key: "indexability" as const, label: "Index" },
  ];
  const colors = ["#ff6b35", "#2563eb", "#059669"];
  const center = 84;
  const radius = 58;
  const pointsFor = (card: SiteCompareCardData) =>
    axes
      .map((axis, index) => {
        const angle = -Math.PI / 2 + (Math.PI * 2 * index) / axes.length;
        const value = Math.max(0, Math.min(100, Number(card[axis.key]) || 0));
        const r = (value / 100) * radius;
        return `${center + Math.cos(angle) * r},${center + Math.sin(angle) * r}`;
      })
      .join(" ");

  return (
    <div>
      <svg viewBox="0 0 168 168" className="mx-auto h-48 w-full max-w-[260px]">
        {[0.25, 0.5, 0.75, 1].map((scale) => (
          <polygon
            key={scale}
            points={axes
              .map((_, index) => {
                const angle = -Math.PI / 2 + (Math.PI * 2 * index) / axes.length;
                const r = radius * scale;
                return `${center + Math.cos(angle) * r},${center + Math.sin(angle) * r}`;
              })
              .join(" ")}
            fill="none"
            stroke="#f3d8c5"
            strokeWidth="1"
          />
        ))}
        {axes.map((axis, index) => {
          const angle = -Math.PI / 2 + (Math.PI * 2 * index) / axes.length;
          const x = center + Math.cos(angle) * (radius + 18);
          const y = center + Math.sin(angle) * (radius + 18);
          return (
            <g key={axis.key}>
              <line
                x1={center}
                y1={center}
                x2={center + Math.cos(angle) * radius}
                y2={center + Math.sin(angle) * radius}
                stroke="#f3d8c5"
                strokeWidth="1"
              />
              <text x={x} y={y} textAnchor="middle" dominantBaseline="middle" fontSize="8" fill="#7c5b4a">
                {axis.label}
              </text>
            </g>
          );
        })}
        {cards.map((card, index) => (
          <polygon
            key={card.url}
            points={pointsFor(card)}
            fill={colors[index % colors.length]}
            fillOpacity="0.12"
            stroke={colors[index % colors.length]}
            strokeWidth="2"
          />
        ))}
      </svg>
      <div className="mt-2 flex flex-wrap gap-2">
        {cards.map((card, index) => (
          <span key={card.url} className="inline-flex items-center gap-1.5 text-xs text-outline-900/60">
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: colors[index % colors.length] }}
            />
            {card.url}
          </span>
        ))}
      </div>
    </div>
  );
}

function buildSiteCompareRuntimeReport({
  bridgeState,
  input,
  locale,
  cards,
  winnerUrl,
  completedTools,
  totalTools,
  directions,
  metrics,
}: {
  bridgeState: CurrentScanState | null;
  input: SiteComparePromptData | null;
  locale: "ru" | "en";
  cards: SiteCompareCardData[];
  winnerUrl: string | null;
  completedTools: number;
  totalTools: number;
  directions: Array<{ label: string; tool: string }>;
  metrics: Array<{ label: string; key: "metadata" | "content" | "indexability" | "score" }>;
}): RuntimeAuditReport {
  const directionRows = directions.map((direction) => ({
    label: direction.label,
    values: cards.map((card) => ({
      url: card.url,
      status: statusForSiteTool(bridgeState, direction.tool, card.url),
    })),
  }));
  const metricRows = metrics.map((metric) => ({
    id: metric.key,
    label: metric.label,
    values: cards.map((card) => ({ url: card.url, value: Number(card[metric.key]) || 0 })),
  }));
  const isRu = locale === "ru";
  const insights = isRu
    ? [
        winnerUrl
          ? `Лучший общий SEO-профиль по выбранным публичным проверкам: ${winnerUrl}.`
          : "Победитель пока не определён: дождитесь завершения проверок.",
        "Сначала исправляйте красные направления в heatmap, затем самые большие разрывы по Metadata, Content и Indexability.",
        "Не воспринимайте сравнение как SERP-истину: это публичные технические и контентные сигналы без Search Console, GA4 и внешних ссылок.",
      ]
    : [
        winnerUrl
          ? `Best overall SEO profile from the selected public checks: ${winnerUrl}.`
          : "Winner is not determined yet: wait until the checks finish.",
        "Fix red directions in the heatmap first, then the largest gaps in Metadata, Content, and Indexability.",
        "Do not treat the comparison as SERP truth: these are public technical and content signals without Search Console, GA4, or backlink data.",
      ];
  return {
    analysisType: "site_compare",
    analysisVersion: DEFAULT_ANALYSIS_VERSION,
    locale,
    mode: "strict_audit",
    providerId: "openrouter",
    model: "MCP + Instructions",
    generatedAt: new Date().toISOString(),
    summary: winnerUrl
      ? isRu
        ? `Сравнение сайтов по URL завершено. Победитель: ${winnerUrl}.`
        : `Site comparison by URL is complete. Winner: ${winnerUrl}.`
      : isRu
        ? "Сравнение сайтов по URL ожидает данные."
        : "Site comparison by URL is waiting for data.",
    nextStep: isRu
      ? "Откройте матрицу направлений, исправьте красные блоки и повторите сравнение."
      : "Open the direction matrix, fix the red blocks, and run the comparison again.",
    confirmedFacts: insights.map((detail, index) => ({
      title: isRu
        ? index === 0
          ? "Сравнительный итог"
          : index === 1
            ? "Приоритет правок"
            : "Граница анализа"
        : index === 0
          ? "Comparison result"
          : index === 1
            ? "Fix priority"
            : "Analysis boundary",
      detail,
      priority: index === 1 ? "high" : "medium",
      sourceToolIds: bridgeState?.selectedTools ?? [],
    })),
    expertHypotheses: [],
    siteCompare: {
      focus: input?.focus ?? bridgeState?.input?.topic ?? "",
      winnerUrl,
      completed: completedTools,
      total: totalTools,
      sites: cards.map((card) => ({
        url: card.url,
        score: card.score,
        critical: card.critical,
        warning: card.warning,
        metadata: card.metadata,
        content: card.content,
        indexability: card.indexability,
      })),
      metrics: metricRows,
      directions: directionRows,
      insights,
    },
  };
}

function buildSiteCompareCards(
  urls: string[],
  bridgeState: CurrentScanState | null,
): SiteCompareCardData[] {
  return urls.map((url) => {
    const hasData = hasBufferedSiteData(bridgeState, url);
    const critical = countSiteIssues(bridgeState, url, "critical");
    const warning = countSiteIssues(bridgeState, url, "warning");
    const metadata = directionalScore(bridgeState, url, ["analyze_meta", "analyze_canonical"]);
    const content = directionalScore(bridgeState, url, ["analyze_content", "analyze_links"]);
    const indexability = directionalScore(bridgeState, url, [
      "analyze_indexability",
      "check_robots_txt",
      "analyze_sitemap",
    ]);
    return {
      url,
      hasData,
      critical,
      warning,
      score: hasData
        ? Math.max(0, Math.min(100, 100 - critical * 12 - warning * 6))
        : 0,
      metadata,
      content,
      indexability,
    };
  });
}

function hasBufferedSiteData(
  bridgeState: CurrentScanState | null,
  url: string,
): boolean {
  if (!bridgeState) return false;
  return Object.values(bridgeState.buffer).some((entry) =>
    Boolean(findBufferedSite(entry, url)),
  );
}

function countSiteIssues(
  bridgeState: CurrentScanState | null,
  url: string,
  severity: "critical" | "warning",
): number {
  if (!bridgeState) return 0;
  return Object.values(bridgeState.buffer).reduce((sum, entry) => {
    const site = findBufferedSite(entry, url);
    return sum + (site?.summary?.[severity] ?? 0);
  }, 0);
}

function directionalScore(
  bridgeState: CurrentScanState | null,
  url: string,
  toolIds: string[],
): number {
  if (!bridgeState) return 0;
  let critical = 0;
  let warning = 0;
  let found = false;
  for (const toolId of toolIds) {
    const site = findBufferedSite(bridgeState.buffer[toolId], url);
    if (!site) continue;
    found = true;
    critical += site.summary?.critical ?? 0;
    warning += site.summary?.warning ?? 0;
  }
  if (!found) return 0;
  return Math.max(0, Math.min(100, 100 - critical * 18 - warning * 9));
}

function statusForSiteTool(
  bridgeState: CurrentScanState | null,
  toolId: string,
  url: string,
): SiteCompareStatus {
  const site = bridgeState ? findBufferedSite(bridgeState.buffer[toolId], url) : null;
  if (!site) return "pending";
  if (site.status === "error") return "bad";
  if ((site.summary?.critical ?? 0) > 0) return "bad";
  if ((site.summary?.warning ?? 0) > 0) return "warn";
  return "good";
}

function findBufferedSite(
  entry: ToolBufferEntry | undefined,
  url: string,
): BufferedSiteCompareResult | null {
  const sites = (entry?.data as { sites?: unknown[] } | undefined)?.sites;
  if (!Array.isArray(sites)) return null;
  const normalize = (value: string) => value.replace(/^https?:\/\//i, "").replace(/\/$/, "");
  const target = normalize(url);
  const site = sites.find((item) => {
    const candidate = (item as { url?: string }).url;
    return candidate ? normalize(candidate) === target : false;
  });
  return (site as BufferedSiteCompareResult | undefined) ?? null;
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
          defaultValue: "Analysis cancelled.",
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
          defaultValue: "{{appName}} is unavailable. Open it before starting bridge analysis.",
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
          defaultValue: "Add at least a topic, query, or short text draft so AI can suggest a useful solution.",
        }),
      );
      setShake(true);
      window.setTimeout(() => setShake(false), 420);
      return;
    }

    if (action === "scan" && data.body.trim().length === 0) {
      setNotice(
        t("plannedAnalysis.forms.scanNeedText", {
          defaultValue: "Add article text to prepare the analysis prompt.",
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
                defaultValue: "Request sent to API + AI Chat so AI can provide a solution.",
              })
            : t("plannedAnalysis.forms.scanSentToApiChat", {
                defaultValue: "Report formed, and the text was sent to API + AI Chat for a short explanation.",
              })
          : action === "solution"
          ? t("plannedAnalysis.forms.aiDraftPromptCopied", {
              appName: bridgeTargetAppName,
              defaultValue: "Prompt copied. Paste it into {{appName}} chat so AI can provide a solution.",
            })
          : t("plannedAnalysis.forms.scanPromptCopied", {
              appName: bridgeTargetAppName,
              defaultValue: "Prompt copied. Paste it into {{appName}} chat so AI can continue this analysis.",
            }),
      );
    } catch (err) {
      console.warn("[article-text] run failed:", err);
      setNotice(
        executionMode === "native"
          ? t("plannedAnalysis.forms.aiChatOpenFailed", {
              defaultValue: "Could not open API + AI Chat. Check the provider and try again.",
            })
          : t("plannedAnalysis.forms.bridgeRunFailed", {
              defaultValue: "Could not start analysis. Check MCP + Instructions mode and try again.",
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
                ? t("sidebar.cancel", { defaultValue: "Cancel" })
                : solutionProvidedOnce
                  ? t("plannedAnalysis.forms.aiDraftAgainAction", {
                      defaultValue: "Suggest solution again",
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
                ? t("sidebar.cancel", { defaultValue: "Cancel" })
                : scanStartedOnce
                  ? t("plannedAnalysis.forms.scanReadyTextAgainAction", {
                      defaultValue: "Scan text again",
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
          defaultValue: "Scan text",
        })}
        placeholder={t("plannedAnalysis.forms.textTopicPlaceholder", {
          defaultValue: "Topic, title, or intent. If the body has its own title, the body title wins.",
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

function isEvalLabEnabled(): boolean {
  try {
    return window.localStorage.getItem("toraseo.evalLab") === "1";
  } catch {
    return false;
  }
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
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage === "ru" ? "ru" : "en";
  const [exportStatus, setExportStatus] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const evalLabEnabled = isEvalLabEnabled();

  if (!report) {
    return (
      <section className="rounded-lg border border-dashed border-orange-200 bg-white p-5">
        <h2 className="font-display text-lg font-semibold text-outline-900">
          {t("plannedAnalysis.results.waitingAiReportTitle", {
            defaultValue: "Waiting for the AI report",
          })}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-outline-900/60">
          {t("plannedAnalysis.results.waitingAiReportBody", {
            defaultValue: "In API mode, the selected model forms the structured report. ToraSEO will show it here after the AI Chat response.",
          })}
        </p>
      </section>
    );
  }
  const localizedReport: RuntimeAuditReport =
    report.locale === locale ? report : { ...report, locale };
  const article = localizedReport.articleText;
  const reportAnalysisType = (localizedReport.analysisType ??
    "article_text") as AnalysisTypeId;
  const reportComplete = Boolean(
    localizedReport &&
      completedTools >= totalTools &&
      (!article || article.coverage.completed >= article.coverage.total),
  );
  const highlightFacts =
    article && article.priorities.length > 0
      ? article.priorities.slice(0, 4)
      : localizedReport.confirmedFacts.slice(0, 6);
  const hiddenSourceCount =
    article && article.priorities.length > 0
      ? article.priorities.length
      : localizedReport.confirmedFacts.length;
  const hiddenFactCount = Math.max(
    0,
    hiddenSourceCount - highlightFacts.length,
  );
  const visibleEvidenceFacts = localizedReport.confirmedFacts;

  const openDetails = () => {
    if (!reportComplete) return;
    void window.toraseo.runtime.openReportWindow(localizedReport);
  };

  const exportReport = async () => {
    if (!reportComplete) return;
    setExportStatus(null);
    setCopyStatus(null);
    const result = await window.toraseo.runtime.exportReportPdf(localizedReport);
    if (result.ok) {
      setExportStatus(
        t("plannedAnalysis.results.exportReady", {
          defaultValue: "Report exported.",
        }),
      );
      return;
    }
    if (result.error === "cancelled") {
      setExportStatus(
        t("plannedAnalysis.results.exportCancelled", {
          defaultValue: "Export cancelled.",
        }),
      );
      return;
    }
    const fallback = t("plannedAnalysis.results.exportFailed", {
      defaultValue: "Failed to export the report.",
    });
    setExportStatus(result.error ? `${fallback} ${result.error}` : fallback);
  };

  const copyOriginalText = async () => {
    if (!reportComplete) return;
    setExportStatus(null);
    setCopyStatus(null);
    const result =
      await window.toraseo.runtime.copyArticleSourceText(localizedReport);
    if (result.ok) {
      setCopyStatus(
        t("plannedAnalysis.results.copySourceReady", {
          defaultValue: "Source text copied.",
        }),
      );
      return;
    }
    const fallback = t("plannedAnalysis.results.copySourceFailed", {
      defaultValue: "Could not copy the source text.",
    });
    setCopyStatus(result.error ? `${fallback} ${result.error}` : fallback);
  };

  const exportQaJson = async () => {
    if (!reportComplete) return;
    setExportStatus(null);
    setCopyStatus(null);
    const result =
      await window.toraseo.runtime.exportReportJson(localizedReport);
    if (result.ok) {
      setExportStatus(
        t("plannedAnalysis.results.exportJsonReady", {
          defaultValue: "QA JSON exported.",
        }),
      );
      return;
    }
    if (result.error === "cancelled") {
      setExportStatus(
        t("plannedAnalysis.results.exportCancelled", {
          defaultValue: "Export cancelled.",
        }),
      );
      return;
    }
    const fallback = t("plannedAnalysis.results.exportFailed", {
      defaultValue: "Failed to export the report.",
    });
    setExportStatus(result.error ? `${fallback} ${result.error}` : fallback);
  };

  return (
    <section className="rounded-lg border border-outline/10 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold text-outline-900">
            {t("plannedAnalysis.results.title", {
              defaultValue: "Analysis results",
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
            {t("analysisPanel.actions.details", { defaultValue: "Details" })}
          </button>
          <button
            type="button"
            onClick={() => void exportReport()}
            disabled={!reportComplete}
            className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-primary-600 disabled:cursor-not-allowed disabled:bg-outline-900/15 disabled:text-outline-900/45"
          >
            {t("plannedAnalysis.results.export", {
              defaultValue: "Export",
            })}
          </button>
          <button
            type="button"
            onClick={() => void copyOriginalText()}
            disabled={!reportComplete}
            className="rounded-md border border-primary/25 bg-orange-50 px-3 py-1.5 text-xs font-semibold text-primary transition hover:border-primary/45 hover:bg-orange-100 disabled:cursor-not-allowed disabled:border-outline/10 disabled:bg-outline-900/5 disabled:text-outline-900/35"
          >
            {t("plannedAnalysis.results.copySourceText", {
              defaultValue: "Copy source text",
            })}
          </button>
          {evalLabEnabled && (
            <button
              type="button"
              onClick={() => void exportQaJson()}
              disabled={!reportComplete}
              className="rounded-md border border-outline/15 bg-white px-3 py-1.5 text-xs font-semibold text-outline-900/60 transition hover:border-primary/40 hover:bg-orange-50 disabled:cursor-not-allowed disabled:opacity-45"
            >
              QA JSON
            </button>
          )}
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
                defaultValue: "Publish readiness",
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
                defaultValue: "Tool coverage",
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
                  defaultValue: "Strengths",
                })}
                items={article.strengths}
                emptyText={t("plannedAnalysis.results.strengthsEmpty", {
                  defaultValue: "Strengths will appear after checks finish.",
                })}
                tone="good"
              />
              <InsightList
                title={t("plannedAnalysis.results.weaknesses", {
                  defaultValue: "Weaknesses",
                })}
                items={article.weaknesses}
                emptyText={t("plannedAnalysis.results.weaknessesEmpty", {
                  defaultValue: "No clear weaknesses were found by the current tools.",
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
                defaultValue: "What to fix first",
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
                  defaultValue: "{{count}} more items are available in the detailed report; only key priorities are shown here.",
                })}
              </p>
            )}
          </section>

          {visibleEvidenceFacts.length > 0 && (
            <>
              <div className="mt-5">
                <h3 className="text-center text-sm font-semibold text-outline-900">
                  {t("plannedAnalysis.results.toolEvidenceTitle", {
                    defaultValue: "Tool evidence",
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
      <p className="mt-4 text-[11px] font-semibold uppercase tracking-wide text-outline-900/35">
        {getAnalysisVersionText(
          reportAnalysisType,
          locale,
          report.analysisVersion,
        )}
      </p>
    </section>
  );
}

interface LocalTextStats {
  wordCount: number;
  paragraphCount: number;
  headingCount: number;
  sentenceCount: number;
  averageSentenceWords: number | null;
  questionCount: number;
  listMarkerCount: number;
  numberCount: number;
}

function splitParagraphs(text: string): string[] {
  return text
    .split(/\n{2,}/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function wordTokens(text: string): string[] {
  return Array.from(text.toLowerCase().matchAll(/[\p{L}\p{N}]+/gu)).map(
    (match) => match[0],
  );
}

function computeTextStats(text: string): LocalTextStats {
  const paragraphs = splitParagraphs(text);
  const words = wordTokens(text);
  const sentences = text
    .split(/[.!?…]+/u)
    .map((item) => item.trim())
    .filter(Boolean);
  const headingCount = text
    .split(/\n/)
    .filter((line) => /^(#{1,6}\s+|[А-ЯA-Z0-9][^.!?]{2,80}:?$)/u.test(line.trim()))
    .length;
  return {
    wordCount: words.length,
    paragraphCount: paragraphs.length,
    headingCount,
    sentenceCount: sentences.length,
    averageSentenceWords:
      sentences.length > 0 ? Math.round(words.length / sentences.length) : null,
    questionCount: (text.match(/\?/g) ?? []).length,
    listMarkerCount: text
      .split(/\n/)
      .filter((line) => /^\s*(?:[-*•]|\d+[.)])\s+/.test(line))
      .length,
    numberCount: (text.match(/\b\d+(?:[.,]\d+)?\b/g) ?? []).length,
  };
}

function exactOverlapPercent(textA: string, textB: string): number {
  const buildShingles = (tokens: string[]) => {
    const shingles = new Set<string>();
    for (let index = 0; index <= tokens.length - 4; index += 1) {
      shingles.add(tokens.slice(index, index + 4).join(" "));
    }
    return shingles;
  };
  const a = buildShingles(wordTokens(textA));
  const b = buildShingles(wordTokens(textB));
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const item of a) {
    if (b.has(item)) shared += 1;
  }
  return Math.round((shared / Math.min(a.size, b.size)) * 100);
}

function copyRiskFromOverlap(overlap: number): "low" | "medium" | "high" {
  if (overlap >= 35) return "high";
  if (overlap >= 15) return "medium";
  return "low";
}

function localizeArticleCompareUiText(value: string, locale: "ru" | "en"): string {
  if (locale === "ru" || !value.trim()) return value;
  const exact: Record<string, string> = {
    "Высокий риск": "High risk",
    "Средний риск": "Medium risk",
    "Низкий риск": "Low risk",
    "Нужна проверка": "Needs review",
    "лучше A": "A is stronger",
    "лучше B": "B is stronger",
    "примерно равно": "about equal",
    "риск": "risk",
    "ожидаем": "pending",
    "Текст A": "Text A",
    "Текст B": "Text B",
    "Проверка сравнения завершена.": "Comparison check completed.",
    "Текст A и текст B делают акцент на разных ключевых понятиях, поэтому интент может совпадать не полностью. Перед выводом о том, какой текст сильнее, проверьте, что оба текста отвечают на один и тот же запрос. Если один текст используется как конкурентный ориентир, берите фокус интента, а не формулировки.": "Text A and Text B emphasize different key concepts, so the intent may overlap only partially. Before deciding which text is stronger, check whether both texts answer the same request. If one text is used as a competitive reference, keep the intent focus, not the wording.",
    "Для медицинских, юридических, финансовых, технических и научных утверждений нужны источники, осторожные формулировки и ручная проверка.": "Medical, legal, financial, technical, and scientific claims need sources, careful wording, and human review.",
    "Если нужно приблизиться к стилю, переносите уровень ясности, ритм и плотность примеров, но не фразы и порядок абзацев.": "If you need to move closer to the style, transfer clarity level, rhythm, and example density, not phrases or paragraph order.",
    "Используйте похожую логику только как ориентир: добавьте собственные примеры, выводы и формулировки.": "Use similar logic only as a reference: add your own examples, conclusions, and wording.",
    "Лучше работает заголовок, который прямо называет интент и пользу без кликбейта.": "A title works better when it directly states the intent and benefit without clickbait.",
    "Оценивайте пригодность под выбранную площадку: статьям сайта нужны структура и полнота, соцсетям — хук и короткая польза.": "Evaluate fit for the selected platform: site articles need structure and completeness, while social posts need a hook and concise value.",
    "Используйте сильные стороны как приоритеты редактирования, а не как повод копировать второй текст.": "Use strengths as editing priorities, not as a reason to copy the other text.",
    "Усиливайте более слабый текст добавленной ценностью, а не зеркальными повторениями сильного текста. После правок запустите сравнение снова и проверьте, сократились ли разрывы.": "Strengthen the weaker text with added value, not by mirroring the stronger text. After editing, run the comparison again and check whether the gaps became smaller.",
    "Тексты заметно расходятся по тематическому покрытию; перед правкой проверьте отсутствующие разделы. Что есть у B и может отсутствовать в A: гликогена, углеводов, организм, глюкоза, гипогликемия, кровь, гликоген, запасы. Что есть у A и может отсутствовать в B: боль, боли, если, может, image, placeholder, головной, головную, головную. Используйте отсутствующие темы как подсказки для собственных разделов, примеров или FAQ, а не для копирования второго текста.": "The texts differ noticeably in topical coverage; before editing, check the missing sections. Use absent topics as prompts for your own sections, examples, or FAQ, not as material to copy from the other text.",
    "Для рискованных тем добавьте предупреждения, источники и формулировки с границами применимости.": "For sensitive topics, add warnings, sources, and wording with clear limits of applicability.",
    "Чтобы текст звучал авторски, добавьте конкретный опыт, примеры, контекст и меньше универсальных служебных оборотов.": "To make the text sound more authorial, add concrete experience, examples, context, and fewer generic service phrases.",
    "Если текст кажется механическим, разнообразьте начала предложений, добавьте живые переходы и уберите повторы без смысловой пользы.": "If the text feels mechanical, vary sentence openings, add natural transitions, and remove repetitions that do not add meaning.",
    "В тексте есть причинно-следственные переходы. Их нужно проверять на достаточность объяснения, а не считать ошибками автоматически. Проверьте места с «поэтому», «следовательно», «всегда» и «никогда»: рядом должно быть обоснование.": "The text contains cause-and-effect transitions. They should be checked for sufficient support, not treated as automatic errors. Check places with 'therefore', 'consequently', 'always', and 'never': they need nearby justification.",
    "Это локальный прогноз интента без SERP. Для SEO используйте его как черновой ориентир, а не как доказательство спроса или ранжирования.": "This is a local intent forecast without SERP data. For SEO, use it as a draft direction, not as proof of demand or ranking potential.",
    "Сделайте финальную ручную вычитку пунктуации, границ предложений и перегруженных фраз в обоих текстах.": "Do a final manual pass for punctuation, sentence boundaries, and overloaded phrases in both texts.",
    "Сопоставляйте не только объём и структуру с площадкой: для статьи сайта важны полнота и разделы, для соцсетей — хук, ясность и компактность.": "Compare not only volume and structure against the platform: site articles need completeness and sections, while social posts need a hook, clarity, and compactness.",
  };
  const normalized = value.trim();
  if (exact[normalized]) return value.replace(normalized, exact[normalized]);
  if (value.includes("\n")) {
    return value
      .split("\n")
      .map((line) => localizeArticleCompareUiText(line, locale))
      .join("\n");
  }
  const replacements: Array<[RegExp, string]> = [
    [/^Структура: A — ([^;]+); B — ([^.]+)\. Сравнивайте не только количество заголовков, а путь читателя: проблема, объяснение, шаги, примеры, FAQ и вывод\.$/i, "Structure: A - $1; B - $2. Compare not only the number of headings, but the reader path: problem, explanation, steps, examples, FAQ, and conclusion."],
    [/^Структура: A — ([^;]+); B — ([^.]+)\.$/i, "Structure: A - $1; B - $2."],
    [/^Средняя длина предложения: A — ([^,]+), B — ([^.]+)\. Если нужно приблизиться к стилю, переносите уровень ясности, ритм и плотность примеров, а не фразы и порядок абзацев\.$/i, "Average sentence length: A - $1, B - $2. If you need to move closer to the style, transfer clarity level, rhythm, and example density, not phrases or paragraph order."],
    [/^Средняя длина предложения: A — ([^,]+), B — ([^.]+)\.$/i, "Average sentence length: A - $1, B - $2."],
    [/^Сигналы конкретики: A — ([^,]+), B — ([^.]+)\. Учитываются числа, списки и шаги\. Конкретику стоит добавлять только там, где она точна и полезна\.$/i, "Specificity signals: A - $1, B - $2. Numbers, lists, and steps are counted. Add specificity only where it is accurate and useful."],
    [/^Сигналы конкретики: A — ([^,]+), B — ([^.]+)\.$/i, "Specificity signals: A - $1, B - $2."],
    [/^Конкретика: A — ([^,]+), B — ([^.]+)\.$/i, "Specificity: A - $1, B - $2."],
    [/^Сигналы доверия: A — ([^,]+), B — ([^.]+)\.$/i, "Trust signals: A - $1, B - $2."],
    [/^Черновая оценка заголовка: A — ([^,]+), B — ([^.]+)\.$/i, "Draft title score: A - $1, B - $2."],
    [/^Площадка: ([^.]+)\. Объём: A — ([^,]+), B — ([^.]+)\.$/i, "Platform: $1. Volume: A - $2, B - $3."],
    [/^Площадка: ([^.]+)\. Объём: A — ([^,]+), B — ([^.]+)\. Сопоставляйте объём и структуру с площадкой: для статьи сайта важны полнота и разделы, для соцсетей — хук, ясность и компактность\.$/i, "Platform: $1. Volume: A - $2, B - $3. Compare volume and structure against the platform: site articles need completeness and sections, while social posts need a hook, clarity, and compactness."],
    [/^Локальное дословное совпадение: ([^%]+)%\. Риск копирования: ([^.]+)\.$/i, "Local exact phrase overlap: $1%. Copying risk: $2."],
    [/^Локальное дословное совпадение: ([^%]+)%\. Это проверка совпавших 4-словных фрагментов внутри ToraSEO, а не внешняя база плагиата\. Смысловую похожесть нужно оценивать по разрывам и данным инструментов ниже\.$/i, "Local exact phrase overlap: $1%. This checks matching 4-word fragments inside ToraSEO, not an external plagiarism database. Semantic similarity should be evaluated through gaps and the tool data below."],
    [/^Пересечение ключевых понятий: ([^%]+)%\.$/i, "Key concept overlap: $1%."],
    [/^Пересечение ключевых понятий: ([^%]+)%\. Усильте смысловое покрытие через недостающие понятия, но добавляйте собственные объяснения и примеры\.$/i, "Key concept overlap: $1%. Strengthen semantic coverage through missing concepts, but add your own explanations and examples."],
    [/^Что есть у B и может отсутствовать в A: ([^.]+)\. Что есть у A и может отсутствовать в B: ([^.]+)\.$/i, "What B has that A may miss: $1. What A has that B may miss: $2."],
    [/^Локальные ключевые понятия A: ([^.]+)\. Локальные ключевые понятия B: ([^.]+)\. Перед правкой проверьте, какие важные темы есть только в одном тексте, и добавляйте недостающие блоки своими формулировками\.$/i, "Local key concepts in A: $1. Local key concepts in B: $2. Before editing, check which important topics appear only in one text, and add missing blocks in your own wording."],
    [/^Текст A даёт больше сигналов конкретики: ([^.]+)\. Добавляйте конкретные шаги, сценарии, примеры и цифры только там, где они точны и полезны\.$/i, "Text A provides more specificity signals: $1. Add concrete steps, scenarios, examples, and numbers only where they are accurate and useful."],
    [/^Сравнение текстов не заменяет медицинскую, юридическую, финансовую или научную экспертизу\. Для рискованных тем добавьте предупреждения, источники и формулировки с границами применимости\.$/i, "Text comparison does not replace medical, legal, financial, or scientific expertise. For sensitive topics, add warnings, sources, and wording with clear limits of applicability."],
    [/^Сравнение доверия: Для медицинских, юридических, финансовых, технических и научных утверждений нужны источники, осторожные формулировки и ручная проверка\.$/i, "Trust comparison: Medical, legal, financial, technical, and scientific claims need sources, careful wording, and human review."],
    [/^Сравнение стиля: Если нужно приблизиться к стилю, переносите уровень ясности, ритм и плотность примеров, но не фразы и порядок абзацев\.$/i, "Style comparison: If you need to move closer to the style, transfer clarity level, rhythm, and example density, not phrases or paragraph order."],
    [/^Риск похожести: Используйте похожую логику только как ориентир: добавьте собственные примеры, выводы и формулировки\.$/i, "Similarity risk: Use similar logic only as a reference: add your own examples, conclusions, and wording."],
    [/^Оценка заголовка: Лучше работает заголовок, который прямо называет интент и пользу без кликбейта\.$/i, "Title score: A title works better when it directly states the intent and benefit without clickbait."],
    [/^Сравнение под платформу: Оценивайте пригодность под выбранную площадку: статьям сайта нужны структура и полнота, соцсетям — хук и короткая польза\.$/i, "Platform fit comparison: Evaluate fit for the selected platform: site articles need structure and completeness, while social posts need a hook and concise value."],
    [/^Сильные и слабые стороны: Используйте сильные стороны как приоритеты редактирования, а не как повод копировать второй текст\.$/i, "Strengths and weaknesses: Use strengths as editing priorities, not as a reason to copy the other text."],
    [/^План улучшений: Усиливайте более слабый текст добавленной ценностью, а не зеркальными повторениями сильного текста\. После правок запустите сравнение снова и проверьте, сократились ли разрывы\.$/i, "Improvement plan: Strengthen the weaker text with added value, not by mirroring the stronger text. After editing, run the comparison again and check whether the gaps became smaller."],
    [/^Сравнение интента: Текст A и текст B делают акцент на разных ключевых понятиях, поэтому интент может совпадать не полностью\. Перед выводом о том, какой текст сильнее, проверьте, что оба текста отвечают на один и тот же запрос\. Если один текст используется как конкурентный ориентир, берите фокус интента, а не формулировки\.$/i, "Intent comparison: Text A and Text B emphasize different key concepts, so the intent may overlap only partially. Before deciding which text is stronger, check whether both texts answer the same request. If one text is used as a competitive reference, keep the intent focus, not the wording."],
    [/^Разрывы по содержанию: Тексты заметно расходятся по тематическому покрытию; перед правкой проверьте отсутствующие разделы\./i, "Content gap: The texts differ noticeably in topical coverage; before editing, check the missing sections."],
    [/^Смысловое покрытие: Пересечение ключевых понятий: ([^%]+)%\. Усильте смысловое покрытие через недостающие понятия, но добавляйте собственные объяснения и примеры\.$/i, "Semantic coverage: Key concept overlap: $1%. Strengthen semantic coverage through missing concepts, but add your own explanations and examples."],
    [/^Сравнение конкретики: Текст A даёт больше сигналов конкретики: ([^.]+)\. Добавляйте конкретные шаги, сценарии, примеры и цифры только там, где они точны и полезны\.$/i, "Specificity comparison: Text A provides more specificity signals: $1. Add concrete steps, scenarios, examples, and numbers only where they are accurate and useful."],
    [/Оба текста проверены как материалы для выбранной площадки\. Это локальная оценка формата, а не данные SERP\./gi, "Both texts were checked as materials for the selected platform. This is a local format estimate, not SERP data."],
    [/Проверьте, кому адресован каждый текст\. Если аудитория разная, сравнивайте не только качество, но и соответствие ожиданиям читателя\./gi, "Check who each text is addressed to. If the audiences differ, compare not only quality, but also fit with reader expectations."],
    [/У текста A сильнее видимая структура: больше опорных блоков для читателя\./gi, "Text A has stronger visible structure: more support blocks for the reader."],
    [/У текста B сильнее видимая структура: больше опорных блоков для читателя\./gi, "Text B has stronger visible structure: more support blocks for the reader."],
    [/Сравнивайте не только количество заголовков, а путь читателя: проблема, объяснение, шаги, примеры, FAQ и вывод\./gi, "Compare not only the number of headings, but the reader path: problem, explanation, steps, examples, FAQ, and conclusion."],
    [/Тон должен соответствовать риску темы: в медицине, финансах, праве и технике лучше звучит точность, осторожность и ясное ограничение советов\./gi, "Tone should match topic risk: in medicine, finance, law, and technical topics, precision, caution, and clear limits work better."],
    [/В текстах нет явных меток медиа\./gi, "The texts do not contain clear media markers."],
    [/В тексте нет явных меток медиа\./gi, "The text does not contain clear media markers."],
    [/Для длинной статьи стоит проверить, где нужны изображения, схемы или видео\./gi, "For a long article, check where images, diagrams, or video are needed."],
    [/Для сайта полезно отмечать медиа внутри релевантных разделов, а не складывать все изображения в конец текста\./gi, "For a site article, media markers should sit inside relevant sections, not be pushed to the end of the text."],
    [/0% в этой метрике означает отсутствие совпавших 4-словных фрагментов в локальной проверке, а не гарантию абсолютной уникальности\./gi, "0% in this metric means no matching 4-word fragments in the local check, not a guarantee of absolute uniqueness."],
    [/Найдены локальные синтаксические или пунктуационные сигналы, которые стоит вычитать вручную\./gi, "Local syntax or punctuation signals were found and should be manually reviewed."],
    [/В текстах есть причинно-следственные переходы\. Их нужно проверять на достаточность объяснения, а не считать ошибками автоматически\./gi, "The texts contain cause-and-effect transitions. They should be checked for sufficient support, not treated as automatic errors."],
    [/В тексте есть причинно-следственные переходы\. Их нужно проверять на достаточность объяснения, а не считать ошибками автоматически\./gi, "The text contains cause-and-effect transitions. They should be checked for sufficient support, not treated as automatic errors."],
    [/Проверьте места с «поэтому», «следовательно», «всегда» и «никогда»: рядом должно быть обоснование\./gi, "Check places with 'therefore', 'consequently', 'always', and 'never': they need nearby justification."],
    [/Текст A и текст B делают акцент на разных ключевых понятиях, поэтому интент может совпадать не полностью\./gi, "Text A and Text B emphasize different key concepts, so the intent may overlap only partially."],
    [/Перед выводом о том, какой текст сильнее, проверьте, что оба текста отвечают на один и тот же запрос\. Если один текст используется как конкурентный ориентир, берите фокус интента, а не формулировки\./gi, "Before deciding which text is stronger, check whether both texts answer the same request. If one text is used as a competitive reference, keep the intent focus, not the wording."],
    [/Текст A даёт больше сигналов конкретики: ([^.]+)\./gi, "Text A provides more specificity signals: $1."],
    [/Текст B даёт больше сигналов конкретики: ([^.]+)\./gi, "Text B provides more specificity signals: $1."],
    [/цифр, вопросов, списков или практических деталей/gi, "numbers, questions, lists, or practical details"],
    [/цифр, вопросов, списков и практических деталей/gi, "numbers, questions, lists, and practical details"],
    [/Сравнение текстов не заменяет медицинскую, юридическую, финансовую или научную экспертизу\./gi, "Text comparison does not replace medical, legal, financial, or scientific expertise."],
    [/Для медицинских, юридических, финансовых, технических и научных утверждений нужны источники, осторожные формулировки и ручная проверка\./gi, "Medical, legal, financial, technical, and scientific claims need sources, careful wording, and human review."],
    [/Если нужно приблизиться к стилю, переносите уровень ясности, ритм и плотность примеров, но не фразы и порядок абзацев\./gi, "If you need to move closer to the style, transfer clarity level, rhythm, and example density, not phrases or paragraph order."],
    [/Используйте похожую логику только как ориентир; добавьте собственные примеры, выводы и формулировки\./gi, "Use similar logic only as a reference: add your own examples, conclusions, and wording."],
    [/Используйте похожую логику только как ориентир: добавьте собственные примеры, выводы и формулировки\./gi, "Use similar logic only as a reference: add your own examples, conclusions, and wording."],
    [/Лучше работает заголовок, который прямо называет интент и пользу без кликбейта\./gi, "A title works better when it directly states the intent and benefit without clickbait."],
    [/Оценивайте пригодность под выбранную площадку: статьям сайта нужны структура и полнота, соцсетям — хук и короткая польза\./gi, "Evaluate fit for the selected platform: site articles need structure and completeness, while social posts need a hook and concise value."],
    [/Используйте сильные стороны как приоритеты редактирования, а не как повод копировать второй текст\./gi, "Use strengths as editing priorities, not as a reason to copy the other text."],
    [/Усиливайте более слабый текст добавленной ценностью, а не зеркальным повторением сильного текста\. После правок запустите сравнение снова и проверьте, сократились ли разрывы\./gi, "Strengthen the weaker text with added value, not by mirroring the stronger text. After editing, run the comparison again and check whether the gaps became smaller."],
    [/Усиливайте более слабый текст добавленной ценностью, а не зеркальными повторениями сильного текста\. После правок запустите сравнение снова и проверьте, сократились ли разрывы\./gi, "Strengthen the weaker text with added value, not by mirroring the stronger text. After editing, run the comparison again and check whether the gaps became smaller."],
    [/Текст A и текст B делают акцент на разных ключевых понятиях, поэтому интент может совпадать не полностью\. Перед выводом о том, какой текст сильнее, проверьте, что оба текста отвечают на один и тот же запрос\. Если один текст используется как конкурентный ориентир, берите фокус интента, а не формулировки\./gi, "Text A and Text B emphasize different key concepts, so the intent may overlap only partially. Before deciding which text is stronger, check whether both texts answer the same request. If one text is used as a competitive reference, keep the intent focus, not the wording."],
    [/Тексты заметно расходятся по тематическому покрытию; перед правкой проверьте отсутствующие разделы\./gi, "The texts differ noticeably in topical coverage; before editing, check the missing sections."],
    [/Что есть у B и может отсутствовать в A:/gi, "What B has that A may miss:"],
    [/Что есть у A и может отсутствовать в B:/gi, "What A has that B may miss:"],
    [/Используйте отсутствующие темы как подсказки для собственных разделов, примеров или FAQ, а не для копирования второго текста\./gi, "Use missing topics as prompts for your own sections, examples, or FAQ, not as material to copy from the other text."],
    [/Для рискованных тем добавьте предупреждения, источники и формулировки с границами применимости\./gi, "For sensitive topics, add warnings, sources, and wording with clear limits of applicability."],
    [/Добавляйте конкретные шаги, сценарии, примеры и цифры только там, где они точны и полезны\./gi, "Add concrete steps, scenarios, examples, and numbers only where they are accurate and useful."],
    [/[Уу]сильте смысловое покрытие через недостающие понятия, но добавляйте собственные объяснения и примеры\./g, "Strengthen semantic coverage through missing concepts, but add your own explanations and examples."],
    [/Сопоставляйте объём и структуру с площадкой: для статьи сайта важны полнота и разделы, для соцсетей — хук, ясность и компактность\./gi, "Compare volume and structure against the platform: site articles need completeness and sections, while social posts need a hook, clarity, and compactness."],
    [/Учитываются числа, списки и шаги\./gi, "Numbers, lists, and steps are counted."],
    [/Конкретику стоит добавлять только там, где она точна и полезна\./gi, "Add specificity only where it is accurate and useful."],
    [/^Сравнение стиля: /i, "Style comparison: "],
    [/^Сравнение доверия: /i, "Trust comparison: "],
    [/^Риск похожести: /i, "Similarity risk: "],
    [/^Оценка заголовка: /i, "Title score: "],
    [/^Сравнение под платформу: /i, "Platform fit comparison: "],
    [/^Сильные и слабые стороны: /i, "Strengths and weaknesses: "],
    [/^План улучшений: /i, "Improvement plan: "],
    [/^Сравнение структуры: /i, "Structure comparison: "],
    [/^Смысловое покрытие: /i, "Semantic coverage: "],
    [/^Сравнение конкретики: /i, "Specificity comparison: "],
    [/^Сравнение интента: /i, "Intent comparison: "],
    [/^Разрывы по содержанию: /i, "Content gap: "],
    [/\bзаголовков\b/g, "headings"],
    [/\bабзацев\b/g, "paragraphs"],
    [/\bслов\b/g, "words"],
    [/\bчисловых сигналов\b/g, "numeric signals"],
    [/нужна проверка/gi, "needs review"],
    [/низкий/gi, "low"],
    [/средний/gi, "medium"],
    [/высокий/gi, "high"],
  ];
  return replacements.reduce(
    (current, [pattern, replacement]) => current.replace(pattern, replacement),
    value,
  );
}

function localizeArticleCompareFact(
  fact: RuntimeConfirmedFact,
  locale: "ru" | "en",
): RuntimeConfirmedFact {
  return {
    ...fact,
    title: localizeArticleCompareUiText(fact.title, locale),
    detail: localizeArticleCompareUiText(fact.detail, locale),
  };
}

function copyRiskLabel(
  risk: RuntimeArticleCompareSummary["similarity"]["copyRisk"],
  locale: "ru" | "en",
): string {
  if (risk === "high") return locale === "ru" ? "Высокий риск" : "High risk";
  if (risk === "medium") return locale === "ru" ? "Средний риск" : "Medium risk";
  if (risk === "low") return locale === "ru" ? "Низкий риск" : "Low risk";
  return locale === "ru" ? "Нужна проверка" : "Needs review";
}

function parseCompareToolResult(data: unknown): {
  summary?: Record<string, unknown>;
  issues?: Array<{ severity?: string; message?: string }>;
  recommendations?: string[];
} | null {
  return data && typeof data === "object"
    ? (data as {
        summary?: Record<string, unknown>;
        issues?: Array<{ severity?: string; message?: string }>;
        recommendations?: string[];
      })
    : null;
}

function compareSummarySentence(
  toolId: string,
  summary: Record<string, unknown> | undefined,
  _locale: "ru" | "en",
): string {
  if (!summary) return "";
  const value = (key: string) => summary[key];
  const emptyValue = "-";
  switch (toolId) {
    case "article_uniqueness":
    case "similarity_risk":
      return `Local exact phrase overlap: ${value("exactPhraseOverlap") ?? value("exactOverlap") ?? "-"}. Copying risk: ${value("copyRisk") ?? "needs review"}.`;
    case "analyze_text_structure":
    case "compare_article_structure":
      return `Structure: A - ${value("headingsA") ?? emptyValue} headings, ${value("paragraphsA") ?? emptyValue} paragraphs; B - ${value("headingsB") ?? emptyValue} headings, ${value("paragraphsB") ?? emptyValue} paragraphs.`;
    case "compare_content_gap":
      return `What B has that A may miss: ${formatListValue(value("missingInA"), "en")}. What A has that B may miss: ${formatListValue(value("missingInB"), "en")}.`;
    case "compare_semantic_gap":
      return `Key concept overlap: ${value("semanticOverlap") ?? "-"}%.`;
    case "compare_specificity_gap":
      return `Specificity: A - ${value("numbersA") ?? emptyValue} numeric signals, B - ${value("numbersB") ?? emptyValue} numeric signals.`;
    case "compare_trust_gap":
      return `Trust signals: A - ${value("trustSignalsA") ?? emptyValue}, B - ${value("trustSignalsB") ?? emptyValue}.`;
    case "analyze_text_style":
    case "compare_article_style":
      return `Average sentence length: A - ${value("avgSentenceWordsA") ?? emptyValue} words, B - ${value("avgSentenceWordsB") ?? emptyValue} words.`;
    case "compare_title_ctr":
      return `Draft title score: A - ${value("ctrDraftA") ?? emptyValue}, B - ${value("ctrDraftB") ?? emptyValue}.`;
    case "detect_text_platform":
    case "compare_platform_fit":
      return `Platform: ${value("platform") ?? "auto"}. Volume: A - ${value("textAWordCount") ?? emptyValue} words, B - ${value("textBWordCount") ?? emptyValue} words.`;
    default:
      return "";
  }
}

function formatListValue(value: unknown, locale: "ru" | "en" = "en"): string {
  const emptyValue = locale === "ru" ? "не выявлено" : "not detected";
  if (Array.isArray(value)) return value.length > 0 ? value.join(", ") : emptyValue;
  if (typeof value === "string") return value || emptyValue;
  return emptyValue;
}

function buildArticleCompareBridgeReport(
  state: CurrentScanState | null,
  t: ReturnType<typeof useTranslation>["t"],
  locale: "ru" | "en",
): RuntimeAuditReport | null {
  if (state?.analysisType !== "article_compare") return null;
  const entries = Array.from(
    new Set([...state.selectedTools, ...Object.keys(state.buffer)]),
  )
    .filter((toolId) => toolId !== "article_compare_internal")
    .map((toolId) => [toolId, state.buffer[toolId]] as const)
    .filter(([, entry]) => entry);
  if (entries.length === 0) return null;

  const confirmedFacts = entries.map(([toolId, entry]) => {
    const result = parseCompareToolResult(entry!.data);
    const summaryText = compareSummarySentence(toolId, result?.summary, locale);
    const issueText = (result?.issues ?? [])
      .map((issue) => issue.message)
      .filter(Boolean)
      .join(" ");
    const recommendationText = (result?.recommendations ?? []).slice(0, 2).join(" ");
    return {
      title: textToolLabel(t, toolId),
      detail:
        [issueText, summaryText, recommendationText].filter(Boolean).join("\n\n") ||
        (entry!.errorMessage ??
          (locale === "ru"
            ? "Проверка сравнения завершена."
            : "Comparison check completed.")),
      priority:
        entry!.status === "error" || entry!.verdict === "critical"
          ? "high" as const
          : entry!.verdict === "warning"
            ? "medium" as const
            : "low" as const,
      sourceToolIds: [toolId],
    };
  });

  return {
    analysisType: "article_compare",
    analysisVersion: DEFAULT_ANALYSIS_VERSION,
    locale,
    mode: "strict_audit",
    providerId: "local",
    model: "ToraSEO MCP + Instructions",
    generatedAt: new Date().toISOString(),
    summary: t("plannedAnalysis.compare.bridgeSummary", {
      defaultValue: "Structured comparison of two texts based on ToraSEO MCP tool data.",
    }),
    nextStep: t("plannedAnalysis.compare.bridgeNextStep", {
      defaultValue: "Review gaps, similarity risk, and the improvement plan, then strengthen the target text without copying the other one.",
    }),
    confirmedFacts,
    expertHypotheses: [],
  };
}

function topCompareTerms(text: string): string[] {
  const stopWords = new Set([
    "это",
    "как",
    "что",
    "для",
    "или",
    "если",
    "при",
    "они",
    "она",
    "его",
    "the",
    "and",
    "for",
    "that",
    "with",
  ]);
  const counts = new Map<string, number>();
  for (const word of wordTokens(text)) {
    if (word.length < 4 || stopWords.has(word)) continue;
    counts.set(word, (counts.get(word) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 8)
    .map(([word]) => word);
}

function buildLocalArticleCompareFacts(
  input: ArticleComparePromptData,
  t: ReturnType<typeof useTranslation>["t"],
  locale: "ru" | "en",
): RuntimeConfirmedFact[] {
  const statsA = computeTextStats(input.textA);
  const statsB = computeTextStats(input.textB);
  const overlap = exactOverlapPercent(input.textA, input.textB);
  const termsA = topCompareTerms(input.textA);
  const termsB = topCompareTerms(input.textB);
  const facts: RuntimeConfirmedFact[] = [
    {
      title: t("analysisTools.analyze_text_structure.label", {
        defaultValue: "Text structure",
      }),
      detail: `Structure: A - ${statsA.headingCount} headings, ${statsA.paragraphCount} paragraphs; B - ${statsB.headingCount} headings, ${statsB.paragraphCount} paragraphs. Compare not only the number of headings, but the reader path: problem, explanation, steps, examples, FAQ, and conclusion.`,
      priority: "low",
      sourceToolIds: ["analyze_text_structure", "compare_article_structure"],
    },
    {
      title: t("analysisTools.compare_content_gap.label", {
        defaultValue: "Content Gap",
      }),
      detail: `Local key concepts in A: ${formatListValue(termsA, "en")}. Local key concepts in B: ${formatListValue(termsB, "en")}. Before editing, check which important topics appear in only one text, then add missing sections in your own wording.`,
      priority: "medium",
      sourceToolIds: ["compare_content_gap", "compare_semantic_gap"],
    },
    {
      title: t("analysisTools.compare_specificity_gap.label", {
        defaultValue: "Specificity comparison",
      }),
      detail: `Specificity signals: A - ${statsA.numberCount + statsA.listMarkerCount}, B - ${statsB.numberCount + statsB.listMarkerCount}. Numbers, lists, and steps are counted. Add specificity only where it is accurate and useful.`,
      priority: "low",
      sourceToolIds: ["compare_specificity_gap"],
    },
    {
      title: t("analysisTools.analyze_text_style.label", {
        defaultValue: "Text style",
      }),
      detail: `Average sentence length: A - ${statsA.averageSentenceWords ?? "-"} words, B - ${statsB.averageSentenceWords ?? "-"} words. If you need to move closer to the style, transfer clarity level, rhythm, and example density, not phrases or paragraph order.`,
      priority: "low",
      sourceToolIds: ["analyze_text_style", "compare_article_style"],
    },
    {
      title: t("analysisTools.similarity_risk.label", {
        defaultValue: "Similarity risk",
      }),
      detail: `Local exact phrase overlap: ${overlap}%. This checks matching 4-word fragments inside ToraSEO, not an external plagiarism database. Semantic similarity should be evaluated through gaps and the tool data below.`,
      priority: overlap >= 15 ? "medium" : "low",
      sourceToolIds: ["article_uniqueness", "similarity_risk"],
    },
  ];
  return facts.map((fact) => localizeArticleCompareFact(fact, locale));
}

function withLocalArticleCompareFacts(
  report: RuntimeAuditReport,
  input: ArticleComparePromptData,
  t: ReturnType<typeof useTranslation>["t"],
  locale: "ru" | "en",
): RuntimeAuditReport {
  const localizedFacts = report.confirmedFacts.map((fact) =>
    localizeArticleCompareFact(fact, locale),
  );
  const existingSources = new Set(
    localizedFacts.flatMap((fact) => fact.sourceToolIds),
  );
  const localFacts = buildLocalArticleCompareFacts(input, t, locale).filter((fact) =>
    fact.sourceToolIds.every((toolId) => !existingSources.has(toolId)),
  );
  return {
    ...report,
    summary: localizeArticleCompareUiText(report.summary, locale),
    nextStep: localizeArticleCompareUiText(report.nextStep, locale),
    confirmedFacts: [...localizedFacts, ...localFacts],
  };
}

function inferCompareTitle(text: string, fallback: string): string {
  const line = text
    .split(/\n/)
    .map((item) => item.trim().replace(/^#{1,6}\s+/, ""))
    .find((item) => item.length > 0);
  if (!line) return fallback;
  return line.length > 90 ? `${line.slice(0, 87)}...` : line;
}

function factMatchesTool(fact: RuntimeConfirmedFact, toolIds: string[]): boolean {
  return fact.sourceToolIds.some((toolId) => toolIds.includes(toolId));
}

function factsForSide(
  report: RuntimeAuditReport,
  side: "A" | "B",
): RuntimeArticleCompareTextSide["strengths"] {
  const marker = side === "A" ? /\b(A|textA|text A|текст A)\b/i : /\b(B|textB|text B|текст B)\b/i;
  return report.confirmedFacts
    .filter((fact) => marker.test(`${fact.title} ${fact.detail}`))
    .slice(0, 4)
    .map((fact) => ({
      title: fact.title,
      detail: fact.detail,
      sourceToolIds: fact.sourceToolIds,
    }));
}

function generatedSideWeaknesses(
  t: ReturnType<typeof useTranslation>["t"],
  side: "A" | "B",
  statsA: ReturnType<typeof computeTextStats>,
  statsB: ReturnType<typeof computeTextStats>,
): RuntimeArticleTextInsight[] {
  const own = side === "A" ? statsA : statsB;
  const other = side === "A" ? statsB : statsA;
  const label = side === "A" ? "A" : "B";
  const items: RuntimeArticleTextInsight[] = [];
  if (own.headingCount + own.listMarkerCount + 2 < other.headingCount + other.listMarkerCount) {
    items.push({
      title: t("plannedAnalysis.compare.weakStructure", {
        label,
        defaultValue: "Text {{label}}: weaker structure",
      }),
      detail: t("plannedAnalysis.compare.weakStructureDetail", {
        defaultValue: "Fewer visible sections, lists, or support blocks. Check the reader path from problem to solution.",
      }),
      sourceToolIds: ["analyze_text_structure", "compare_article_structure"],
    });
  }
  if (
    own.averageSentenceWords !== null &&
    other.averageSentenceWords !== null &&
    own.averageSentenceWords > other.averageSentenceWords + 3
  ) {
    items.push({
      title: t("plannedAnalysis.compare.weakReadability", {
        label,
        defaultValue: "Text {{label}}: harder to read",
      }),
      detail: t("plannedAnalysis.compare.weakReadabilityDetail", {
        defaultValue: "Average sentence length is higher. This is not always an error, but long sentences should be checked for overload.",
      }),
      sourceToolIds: ["analyze_text_style", "language_audience_fit"],
    });
  }
  if (own.numberCount + own.listMarkerCount + 2 < other.numberCount + other.listMarkerCount) {
    items.push({
      title: t("plannedAnalysis.compare.weakSpecificity", {
        label,
        defaultValue: "Text {{label}}: less specificity",
      }),
      detail: t("plannedAnalysis.compare.weakSpecificityDetail", {
        defaultValue: "Fewer numbers, lists, steps, or practical signals. Add them only where they are accurate and useful.",
      }),
      sourceToolIds: ["compare_specificity_gap"],
    });
  }
  return items;
}

function compareWinner(
  left: number | null,
  right: number | null,
  inverse = false,
): RuntimeArticleCompareMetric["winner"] {
  if (left === null || right === null) return "pending";
  if (Math.abs(left - right) <= 2) return "tie";
  if (inverse) return left < right ? "textA" : "textB";
  return left > right ? "textA" : "textB";
}

function compareGoalModeLabel(
  mode: RuntimeArticleCompareGoalMode,
  t: ReturnType<typeof useTranslation>["t"],
): string {
  const labels: Record<RuntimeArticleCompareGoalMode, string> = {
    standard_comparison: t("plannedAnalysis.compare.goalModes.standard", {
      defaultValue: "Standard comparison",
    }),
    focus_text_a: t("plannedAnalysis.compare.goalModes.focusA", {
      defaultValue: "Focus on text A",
    }),
    focus_text_b: t("plannedAnalysis.compare.goalModes.focusB", {
      defaultValue: "Focus on text B",
    }),
    beat_competitor: t("plannedAnalysis.compare.goalModes.beatCompetitor", {
      defaultValue: "Competitor comparison",
    }),
    style_match: t("plannedAnalysis.compare.goalModes.styleMatch", {
      defaultValue: "Style imitation",
    }),
    similarity_check: t("plannedAnalysis.compare.goalModes.similarity", {
      defaultValue: "Similarity check",
    }),
    version_compare: t("plannedAnalysis.compare.goalModes.version", {
      defaultValue: "Version comparison",
    }),
    ab_post: t("plannedAnalysis.compare.goalModes.abPost", {
      defaultValue: "A/B post analysis",
    }),
  };
  return labels[mode];
}

function compareGoalModeDescription(
  mode: RuntimeArticleCompareGoalMode,
  t: ReturnType<typeof useTranslation>["t"],
): string {
  const descriptions: Record<RuntimeArticleCompareGoalMode, string> = {
    standard_comparison: t("plannedAnalysis.compare.goalDescriptions.standard", {
      defaultValue: "No goal is set: the report shows both texts, key gaps, similarity risk, and an improvement plan.",
    }),
    focus_text_a: t("plannedAnalysis.compare.goalDescriptions.focusA", {
      defaultValue: "The report is focused on text A: the second text is used as comparison context and a source of reference points.",
    }),
    focus_text_b: t("plannedAnalysis.compare.goalDescriptions.focusB", {
      defaultValue: "The report is focused on text B: the second text is used as comparison context and a source of reference points.",
    }),
    beat_competitor: t("plannedAnalysis.compare.goalDescriptions.beatCompetitor", {
      defaultValue: "The report looks for competitor text advantages, gaps in your text, and a plan to strengthen the material without copying.",
    }),
    style_match: t("plannedAnalysis.compare.goalDescriptions.styleMatch", {
      defaultValue: "The report focuses on tone, rhythm, clarity, example density, and transferable style techniques without copying phrases.",
    }),
    similarity_check: t("plannedAnalysis.compare.goalDescriptions.similarity", {
      defaultValue: "The report prioritizes exact overlap, semantic closeness, and copying risk.",
    }),
    version_compare: t("plannedAnalysis.compare.goalDescriptions.version", {
      defaultValue: "The report shows what became stronger or weaker between two text versions.",
    }),
    ab_post: t("plannedAnalysis.compare.goalDescriptions.abPost", {
      defaultValue: "The report evaluates hook, clarity, brevity, platform fit, and reaction potential.",
    }),
  };
  return descriptions[mode];
}

function compareGoalModeFocus(
  mode: RuntimeArticleCompareGoalMode,
): "textA" | "textB" | null {
  if (mode === "focus_text_a") return "textA";
  if (mode === "focus_text_b") return "textB";
  return null;
}

function buildArticleCompareSummary(
  report: RuntimeAuditReport,
  input: ArticleComparePromptData,
  t: ReturnType<typeof useTranslation>["t"],
  completedTools: number,
  totalTools: number,
  locale: "ru" | "en",
): RuntimeArticleCompareSummary {
  const statsA = computeTextStats(input.textA);
  const statsB = computeTextStats(input.textB);
  const overlap = exactOverlapPercent(input.textA, input.textB);
  const copyRisk = copyRiskFromOverlap(overlap);
  const completed = Math.max(completedTools, report.confirmedFacts.length);
  const total = Math.max(1, totalTools);
  const coveragePercent = Math.min(100, Math.round((completed / total) * 100));
  const goalMode = input.goalMode ?? inferArticleCompareGoalMode(input.goal);
  const focusSide = compareGoalModeFocus(goalMode);
  const gapFact =
    report.confirmedFacts.find((fact) =>
      factMatchesTool(fact, [
        "compare_content_gap",
        "compare_semantic_gap",
        "compare_intent_gap",
      ]),
    ) ?? report.confirmedFacts[0];
  const planFacts = report.confirmedFacts.filter((fact) =>
    factMatchesTool(fact, ["compare_improvement_plan"]),
  );
  const priorityFacts =
    planFacts.length > 0
      ? planFacts
      : report.confirmedFacts.filter((fact) => fact.priority !== "low");
  const textAAdvantage =
    report.confirmedFacts.filter((fact) => /\b(A|text A|textA|текст A)\b/i.test(fact.detail))
      .length + (statsA.headingCount > statsB.headingCount ? 1 : 0);
  const textBAdvantage =
    report.confirmedFacts.filter((fact) => /\b(B|text B|textB|текст B)\b/i.test(fact.detail))
      .length + (statsB.headingCount > statsA.headingCount ? 1 : 0);
  const winner =
    Math.abs(textAAdvantage - textBAdvantage) <= 1
      ? "tie"
      : textAAdvantage > textBAdvantage
        ? "textA"
        : "textB";

  return {
    verdict: {
      winner,
      label:
        focusSide === "textA"
          ? t("plannedAnalysis.compare.focusVerdictA", {
              defaultValue: "Report focused on text A",
            })
          : focusSide === "textB"
            ? t("plannedAnalysis.compare.focusVerdictB", {
                defaultValue: "Report focused on text B",
              })
            : goalMode === "similarity_check"
              ? t("plannedAnalysis.compare.similarityVerdict", {
                  defaultValue: "Main finding: similarity and borrowing risk",
                })
              : goalMode === "style_match"
                ? t("plannedAnalysis.compare.styleVerdict", {
                    defaultValue: "Main finding: style and presentation differences",
                  })
                : goalMode === "version_compare"
                  ? t("plannedAnalysis.compare.versionVerdict", {
                      defaultValue: "Main finding: what changed between versions",
                    })
                  : goalMode === "beat_competitor"
                    ? t("plannedAnalysis.compare.competitorVerdict", {
                        defaultValue: "Main finding: text gaps against competitor",
                      })
                    : winner === "textA"
          ? t("plannedAnalysis.compare.winnerA", { defaultValue: "Text A is stronger by text signals" })
          : winner === "textB"
            ? t("plannedAnalysis.compare.winnerB", { defaultValue: "Text B is stronger by text signals" })
            : t("plannedAnalysis.compare.winnerTie", { defaultValue: "The texts are close: category gaps matter more" }),
      detail: localizeArticleCompareUiText(report.summary, locale),
      mainGap:
        (gapFact?.detail
          ? localizeArticleCompareUiText(gapFact.detail, locale)
          : undefined) ??
        t("plannedAnalysis.compare.defaultGap", {
          defaultValue: "The main gap may be intent, completeness, structure, specificity, or trust. Check the categories below before editing.",
        }),
    },
    goal: input.goal,
    goalMode,
    goalLabel: compareGoalModeLabel(goalMode, t),
    goalDescription: compareGoalModeDescription(goalMode, t),
    focusSide,
    platform: {
      key: "compare",
      label: t("plannedAnalysis.compare.platform", {
        defaultValue: "Text comparison",
      }),
      detail: t("plannedAnalysis.compare.platformDetail", {
        defaultValue: "The result compares only text: no domain, links, technical SEO, or live SERP.",
      }),
    },
    coverage: { completed, total, percent: coveragePercent },
    textA: {
      id: "textA",
      label: locale === "ru" ? "Текст A" : "Text A",
      role: input.roleA,
      title: inferCompareTitle(input.textA, locale === "ru" ? "Текст A" : "Text A"),
      text: input.textA,
      ...statsA,
      strengths: factsForSide(report, "A"),
      weaknesses: generatedSideWeaknesses(t, "A", statsA, statsB),
    },
    textB: {
      id: "textB",
      label: locale === "ru" ? "Текст B" : "Text B",
      role: input.roleB,
      title: inferCompareTitle(input.textB, locale === "ru" ? "Текст B" : "Text B"),
      text: input.textB,
      ...statsB,
      strengths: factsForSide(report, "B"),
      weaknesses: generatedSideWeaknesses(t, "B", statsA, statsB),
    },
    metrics: [
      {
        id: "structure",
        label: t("plannedAnalysis.compare.metrics.structure", {
          defaultValue: "Structure",
        }),
        textA: statsA.headingCount + statsA.listMarkerCount,
        textB: statsB.headingCount + statsB.listMarkerCount,
        delta: statsA.headingCount + statsA.listMarkerCount - statsB.headingCount - statsB.listMarkerCount,
        suffix: "",
        winner: compareWinner(
          statsA.headingCount + statsA.listMarkerCount,
          statsB.headingCount + statsB.listMarkerCount,
        ),
        description: t("plannedAnalysis.compare.metrics.structureDetail", {
          defaultValue: "Uses headings and lists as local structure signals. Structure quality matters more than count alone.",
        }),
      },
      {
        id: "specificity",
        label: t("plannedAnalysis.compare.metrics.specificity", {
          defaultValue: "Specificity",
        }),
        textA: statsA.numberCount + statsA.listMarkerCount,
        textB: statsB.numberCount + statsB.listMarkerCount,
        delta: statsA.numberCount + statsA.listMarkerCount - statsB.numberCount - statsB.listMarkerCount,
        suffix: "",
        winner: compareWinner(
          statsA.numberCount + statsA.listMarkerCount,
          statsB.numberCount + statsB.listMarkerCount,
        ),
        description: t("plannedAnalysis.compare.metrics.specificityDetail", {
          defaultValue: "Local signal for numbers, examples, and steps. Specificity helps only when wording is accurate.",
        }),
      },
      {
        id: "readability",
        label: t("plannedAnalysis.compare.metrics.readability", {
          defaultValue: "Readability",
        }),
        textA: statsA.averageSentenceWords,
        textB: statsB.averageSentenceWords,
        delta:
          statsA.averageSentenceWords !== null && statsB.averageSentenceWords !== null
            ? statsA.averageSentenceWords - statsB.averageSentenceWords
            : null,
        suffix: "",
        winner: compareWinner(
          statsA.averageSentenceWords,
          statsB.averageSentenceWords,
          true,
        ),
        description: t("plannedAnalysis.compare.metrics.readabilityDetail", {
          defaultValue: "Shorter sentences are usually easier to scan, but expert text sometimes needs longer explanations.",
        }),
      },
      {
        id: "similarity",
        label: t("plannedAnalysis.compare.metrics.similarity", {
          defaultValue: "Exact overlap",
        }),
        textA: overlap,
        textB: overlap,
        delta: 0,
        suffix: "%",
        winner: copyRisk === "high" ? "risk" : copyRisk === "medium" ? "risk" : "tie",
        description: t("plannedAnalysis.compare.metrics.similarityDetail", {
          defaultValue: "Local check of matching phrases in two texts. This is not an external plagiarism database.",
        }),
      },
    ],
    gaps: report.confirmedFacts
      .filter((fact) =>
        factMatchesTool(fact, [
          "compare_content_gap",
          "compare_semantic_gap",
          "compare_intent_gap",
          "compare_specificity_gap",
          "compare_trust_gap",
        ]),
      )
      .slice(0, 6)
      .map((fact) => ({
        title: localizeArticleCompareUiText(fact.title, locale),
        detail: localizeArticleCompareUiText(fact.detail, locale),
        side: "missing_in_a",
        sourceToolIds: fact.sourceToolIds,
      })),
    priorities: priorityFacts.map((fact) => ({
      title: localizeArticleCompareUiText(fact.title, locale),
      detail: localizeArticleCompareUiText(fact.detail, locale),
      priority: fact.priority,
      sourceToolIds: fact.sourceToolIds,
    })),
    similarity: {
      exactOverlap: overlap,
      semanticSimilarity: null,
      copyRisk,
      detail:
        copyRisk === "high"
          ? t("plannedAnalysis.compare.copyRiskHigh", {
              defaultValue: "Exact overlap is high. Use the stronger text as a reference, but independently rewrite structure, examples, and wording.",
            })
          : copyRisk === "medium"
            ? t("plannedAnalysis.compare.copyRiskMedium", {
                defaultValue: "Some exact overlap exists. Keep useful ideas, but add your own examples and do not repeat phrasing.",
              })
            : t("plannedAnalysis.compare.copyRiskLow", {
                defaultValue: "Local exact phrase overlap is low. This does not guarantee uniqueness: semantic similarity still needs to be evaluated by the findings below.",
              }),
    },
    actionPlan: (priorityFacts.length > 0 ? priorityFacts : report.confirmedFacts)
      .slice(0, 6)
      .map((fact) => ({
        title: localizeArticleCompareUiText(fact.title, locale),
        detail: localizeArticleCompareUiText(fact.detail, locale),
        priority: fact.priority,
        sourceToolIds: fact.sourceToolIds,
      })),
    limitations: [
      t("plannedAnalysis.compare.limitTextOnly", {
        defaultValue: "This is text-only comparison: domain age, links, technical SEO, speed, and behavior signals are not included.",
      }),
      t("plannedAnalysis.compare.limitSimilarity", {
        defaultValue: "Similarity risk is a local heuristic, not an internet plagiarism check.",
      }),
      t("plannedAnalysis.compare.limitFacts", {
        defaultValue: "Fact-sensitive, legal, medical, financial, and technical claims still require sources or expert review.",
      }),
    ],
  };
}

function ArticleCompareResultsDashboard({
  report,
  bridgeState,
  input,
  completedTools,
  totalTools,
}: {
  report: RuntimeAuditReport | null;
  bridgeState: CurrentScanState | null;
  input: ArticleComparePromptData | null;
  completedTools: number;
  totalTools: number;
}) {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage === "ru" ? "ru" : "en";
  const [exportStatus, setExportStatus] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);

  if (!input || !input.textA.trim() || !input.textB.trim()) {
    return (
      <section className="rounded-lg border border-dashed border-orange-200 bg-white p-5">
        <h2 className="font-display text-lg font-semibold text-outline-900">
          {t("plannedAnalysis.compare.waitingInputTitle", {
            defaultValue: "Waiting for two texts",
          })}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-outline-900/60">
          {t("plannedAnalysis.compare.waitingInputBody", {
            defaultValue: "Add text A and text B, then run comparison. The report will be shown in two columns.",
          })}
        </p>
      </section>
    );
  }

  const bridgeReport = buildArticleCompareBridgeReport(bridgeState, t, locale);
  const effectiveReportSource = report ?? bridgeReport;
  const effectiveReport = effectiveReportSource
    ? effectiveReportSource.locale === locale
      ? effectiveReportSource
      : { ...effectiveReportSource, locale }
    : null;

  if (!effectiveReport) {
    return (
      <section className="rounded-lg border border-dashed border-orange-200 bg-white p-5">
        <h2 className="font-display text-lg font-semibold text-outline-900">
          {t("plannedAnalysis.compare.waitingReportTitle", {
            defaultValue: "Waiting for comparison report",
          })}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-outline-900/60">
          {t("plannedAnalysis.compare.waitingReportBody", {
            defaultValue: "The selected mode compares both texts. ToraSEO will show the result here after structured data appears.",
          })}
        </p>
      </section>
    );
  }

  const enrichedReport = withLocalArticleCompareFacts(effectiveReport, input, t, locale);
  const summary = buildArticleCompareSummary(enrichedReport, input, t, completedTools, totalTools, locale);
  const goalFocus = compareGoalFocus(summary.goalMode, summary.goal);
  const reportComplete = completedTools >= totalTools;
  const openDetails = () => {
    if (!reportComplete) return;
    void window.toraseo.runtime.openReportWindow({
      ...enrichedReport,
      articleCompare: summary,
    });
  };
  const exportReport = async () => {
    if (!reportComplete) return;
    setExportStatus(null);
    setCopyStatus(null);
    const result = await window.toraseo.runtime.exportReportPdf({
      ...enrichedReport,
      articleCompare: summary,
    });
    if (result.ok) {
      setExportStatus(
        t("plannedAnalysis.results.exportReady", {
          defaultValue: "Report exported.",
        }),
      );
      return;
    }
    if (result.error === "cancelled") {
      setExportStatus(
        t("plannedAnalysis.results.exportCancelled", {
          defaultValue: "Export cancelled.",
        }),
      );
      return;
    }
    setExportStatus(
      result.error ||
        t("plannedAnalysis.results.exportFailed", {
          defaultValue: "Failed to export the report.",
        }),
    );
  };
  const copyCompareText = async (
    side: RuntimeArticleCompareSummary["textA"] | RuntimeArticleCompareSummary["textB"],
  ) => {
    setExportStatus(null);
    setCopyStatus(null);
    try {
      await navigator.clipboard.writeText(stripMediaPlaceholderLines(side.text));
      setCopyStatus(
        side.id === "textA"
          ? t("plannedAnalysis.compare.copyAReady", {
              defaultValue: "Article A copied.",
            })
          : t("plannedAnalysis.compare.copyBReady", {
              defaultValue: "Article B copied.",
            }),
      );
    } catch {
      setCopyStatus(
        t("plannedAnalysis.compare.copyFailed", {
          defaultValue: "Could not copy the article.",
        }),
      );
    }
  };

  return (
    <section className="rounded-lg border border-outline/10 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold text-outline-900">
            {t("plannedAnalysis.compare.title", {
              defaultValue: "Comparison result",
            })}
          </h2>
          <p className="mt-1 max-w-3xl text-sm leading-relaxed text-outline-900/60">
            {enrichedReport.summary}
          </p>
          <div className="mt-3 max-w-3xl rounded-md border border-orange-200 bg-orange-50/60 px-3 py-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-outline-900/50">
              {t("plannedAnalysis.compare.goalMode", {
                defaultValue: "Goal mode",
              })}
            </p>
            <p className="mt-1 text-sm font-semibold text-outline-900">
              {summary.goalLabel}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-outline-900/60">
              {summary.goalDescription}
            </p>
            {summary.goal.trim() && (
              <p className="mt-2 text-xs leading-relaxed text-outline-900/50">
                {summary.goal}
              </p>
            )}
          </div>
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
            {t("analysisPanel.actions.details", { defaultValue: "Details" })}
          </button>
          <button
            type="button"
            onClick={() => void exportReport()}
            disabled={!reportComplete}
            className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-primary-600 disabled:cursor-not-allowed disabled:bg-outline-900/15 disabled:text-outline-900/45"
          >
            {t("plannedAnalysis.results.export", {
              defaultValue: "Export",
            })}
          </button>
          <button
            type="button"
            onClick={() => void copyCompareText(summary.textA)}
            disabled={!reportComplete}
            className="rounded-md border border-primary/25 bg-orange-50 px-3 py-1.5 text-xs font-semibold text-primary transition hover:border-primary/45 hover:bg-orange-100 disabled:cursor-not-allowed disabled:border-outline/10 disabled:bg-outline-900/5 disabled:text-outline-900/35"
          >
            {t("plannedAnalysis.compare.copyA", {
              defaultValue: "Copy article A",
            })}
          </button>
          <button
            type="button"
            onClick={() => void copyCompareText(summary.textB)}
            disabled={!reportComplete}
            className="rounded-md border border-primary/25 bg-orange-50 px-3 py-1.5 text-xs font-semibold text-primary transition hover:border-primary/45 hover:bg-orange-100 disabled:cursor-not-allowed disabled:border-outline/10 disabled:bg-outline-900/5 disabled:text-outline-900/35"
          >
            {t("plannedAnalysis.compare.copyB", {
              defaultValue: "Copy article B",
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
        <div className="rounded-lg border border-orange-200 bg-orange-50/65 p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-outline-900/50">
            {t("plannedAnalysis.compare.verdict", {
              defaultValue: "Text advantage",
            })}
          </p>
          <h3 className="mt-2 font-display text-2xl font-semibold text-outline-900">
            {summary.verdict.label}
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-outline-900/65">
            {summary.verdict.detail}
          </p>
          <p className="mt-3 rounded-md border border-orange-200 bg-white px-3 py-2 text-xs leading-relaxed text-outline-900/60">
            {summary.verdict.mainGap}
          </p>
        </div>
        <div className="rounded-lg border border-outline/10 bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-outline-900/50">
            {t("plannedAnalysis.compare.similarity", {
              defaultValue: "Similarity risk",
            })}
          </p>
          <p className="mt-3 text-3xl font-semibold text-outline-900">
            {copyRiskLabel(summary.similarity.copyRisk, locale)}
          </p>
          <p className="mt-2 text-sm font-semibold text-outline-900/70">
            {t("plannedAnalysis.compare.exactOverlap", {
              value: summary.similarity.exactOverlap ?? "—",
              defaultValue: "Exact overlap: {{value}}%",
            })}
          </p>
          <p className="mt-2 text-xs leading-relaxed text-outline-900/55">
            {summary.similarity.detail}
          </p>
        </div>
      </div>

      <CompareVisualGraph summary={summary} />

      <div className="mt-5 grid gap-3 xl:grid-cols-4">
        {summary.metrics.map((metric) => (
          <CompareMetricCard key={metric.id} metric={metric} />
        ))}
      </div>

      <CompareSideFindingsBlock summary={summary} goalFocus={goalFocus} />

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <CompareGapList
          title={t("plannedAnalysis.compare.gaps", {
            defaultValue: "Content gaps",
          })}
          description={t("plannedAnalysis.compare.gapsDescription", {
            defaultValue: "Which topics, semantic blocks, and useful elements differ between texts A and B.",
          })}
          gaps={summary.gaps}
        />
        <CompareActionPlan items={summary.actionPlan} />
      </div>

      <section className="mt-5 rounded-lg border border-outline/10 bg-white p-4">
        <h3 className="text-center text-sm font-semibold text-outline-900">
          {t("plannedAnalysis.results.toolEvidenceTitle", {
            defaultValue: "Tool evidence",
          })}
        </h3>
        <div className="mt-4 grid gap-3 xl:grid-cols-2">
          {enrichedReport.confirmedFacts.map((fact, index) => (
            <ApiFactRow
              key={`${fact.sourceToolIds.join(",")}-${fact.title}-${index}`}
              fact={fact}
            />
          ))}
        </div>
      </section>

      <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50/80 p-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-amber-800/70">
          {t("plannedAnalysis.compare.limitationsTitle", {
            defaultValue: "Text-comparison boundary",
          })}
        </p>
        <ul className="mt-2 grid gap-1 text-xs leading-relaxed text-amber-900/75">
          {summary.limitations.map((item) => (
            <li key={item}>• {item}</li>
          ))}
        </ul>
      </div>

      <p className="mt-5 text-sm font-medium text-outline-900">
        {enrichedReport.nextStep}
      </p>
      <p className="mt-4 text-[11px] font-semibold uppercase tracking-wide text-outline-900/35">
        {getAnalysisVersionText(
          "article_compare",
          locale,
          enrichedReport.analysisVersion,
        )}
      </p>
    </section>
  );
}

function compareGoalFocus(
  mode: RuntimeArticleCompareGoalMode,
  goal: string,
): "both" | "textA" | "textB" {
  const modeFocus = compareGoalModeFocus(mode);
  if (modeFocus === "textA") return "textA";
  if (modeFocus === "textB") return "textB";
  const normalized = goal.trim().toLowerCase();
  if (!normalized) return "both";
  const mentionsA = /(?:\ba\b|текст\s*a|стать[ьяи]\s*a|article\s*a)/i.test(normalized);
  const mentionsB = /(?:\bb\b|текст\s*b|стать[ьяи]\s*b|article\s*b)/i.test(normalized);
  if (mentionsB && !mentionsA) return "textB";
  if (mentionsA && !mentionsB) return "textA";
  return "both";
}

function CompareVisualGraph({ summary }: { summary: RuntimeArticleCompareSummary }) {
  const { i18n, t } = useTranslation();
  const locale = i18n.resolvedLanguage === "ru" ? "ru" : "en";
  const maxValue = Math.max(
    1,
    ...summary.metrics.flatMap((metric) => [
      typeof metric.textA === "number" ? Math.abs(metric.textA) : 0,
      typeof metric.textB === "number" ? Math.abs(metric.textB) : 0,
    ]),
  );
  return (
    <section className="mt-5 rounded-lg border border-outline/10 bg-white p-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-outline-900">
            {t("plannedAnalysis.compare.visualGraphTitle", {
              defaultValue: "Visual A/B comparison",
            })}
          </h3>
          <p className="mt-1 text-xs leading-relaxed text-outline-900/55">
            {t("plannedAnalysis.compare.visualGraphBody", {
              defaultValue: "Graphs show relative local signals. This is not a final SEO score, but a quick way to see gaps.",
            })}
          </p>
        </div>
        <div className="flex items-center gap-3 text-xs font-semibold text-outline-900/55">
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-5 rounded-full bg-primary" /> A
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-5 rounded-full bg-orange-300" /> B
          </span>
        </div>
      </div>
      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        {summary.metrics.map((metric) => {
          const valueA = typeof metric.textA === "number" ? Math.abs(metric.textA) : 0;
          const valueB = typeof metric.textB === "number" ? Math.abs(metric.textB) : 0;
          const widthA = Math.max(4, Math.round((valueA / maxValue) * 100));
          const widthB = Math.max(4, Math.round((valueB / maxValue) * 100));
          return (
            <div key={metric.id} className="rounded-md border border-orange-100 bg-orange-50/40 p-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-outline-900/60">
                  {metric.label}
                </p>
                <span className="text-[11px] font-semibold text-outline-900/45">
                  {compareMetricWinnerLabel(metric.winner, locale)}
                </span>
              </div>
              <div className="mt-3 space-y-2">
                <CompareBar label="A" value={metric.textA} suffix={metric.suffix} width={widthA} tone="a" />
                <CompareBar label="B" value={metric.textB} suffix={metric.suffix} width={widthB} tone="b" />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function CompareBar({
  label,
  value,
  suffix,
  width,
  tone,
}: {
  label: string;
  value: number | null;
  suffix: string;
  width: number;
  tone: "a" | "b";
}) {
  return (
    <div className="grid grid-cols-[18px_minmax(0,1fr)_56px] items-center gap-2 text-xs">
      <span className="font-semibold text-outline-900/50">{label}</span>
      <div className="h-2 overflow-hidden rounded-full bg-white">
        <div
          className={`h-full rounded-full ${tone === "a" ? "bg-primary" : "bg-orange-300"}`}
          style={{ width: `${width}%` }}
        />
      </div>
      <span className="text-right font-semibold text-outline-900/60">
        {value ?? "—"}
        {value !== null ? suffix : ""}
      </span>
    </div>
  );
}

function compareMetricWinnerLabel(
  metricWinner: RuntimeArticleCompareMetric["winner"],
  locale: "ru" | "en",
): string {
  if (metricWinner === "textA") return locale === "ru" ? "лучше A" : "A is stronger";
  if (metricWinner === "textB") return locale === "ru" ? "лучше B" : "B is stronger";
  if (metricWinner === "risk") return locale === "ru" ? "риск" : "risk";
  if (metricWinner === "tie") return locale === "ru" ? "примерно равно" : "about equal";
  return locale === "ru" ? "ожидаем" : "pending";
}

function CompareSideFindingsBlock({
  summary,
  goalFocus,
}: {
  summary: RuntimeArticleCompareSummary;
  goalFocus: "both" | "textA" | "textB";
}) {
  const { t } = useTranslation();
  const sides =
    goalFocus === "textA"
      ? [summary.textA]
      : goalFocus === "textB"
        ? [summary.textB]
        : [summary.textA, summary.textB];
  return (
    <section className="mt-5 rounded-lg border border-outline/10 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-outline-900">
            {goalFocus === "both"
              ? t("plannedAnalysis.compare.sideFindingsTitle", {
                  defaultValue: "A/B strengths and weaknesses",
                })
              : t("plannedAnalysis.compare.focusedFindingsTitle", {
                  label: goalFocus === "textA" ? "A" : "B",
                  defaultValue: "Goal focus: text {{label}}",
                })}
          </h3>
          <p className="mt-1 text-xs leading-relaxed text-outline-900/55">
            {goalFocus === "both"
              ? t("plannedAnalysis.compare.sideFindingsBody", {
                  defaultValue: "If no analysis goal is set, ToraSEO shows a standard comparative report for both texts.",
                })
              : t("plannedAnalysis.compare.focusedFindingsBody", {
                  defaultValue: "Because the goal clearly points to one text, the block below primarily shows findings for that text.",
                })}
          </p>
        </div>
      </div>
      <div className={`mt-4 grid gap-4 ${sides.length === 2 ? "lg:grid-cols-2" : ""}`}>
        {sides.map((side) => (
          <div key={side.id} className="rounded-md border border-orange-100 bg-orange-50/35 p-3">
            <h4 className="text-sm font-semibold text-outline-900">{side.label}</h4>
            <div className="mt-3 grid gap-3">
              <InsightList
                title={t("plannedAnalysis.compare.strengths", {
                  defaultValue: "Strengths",
                })}
                items={side.strengths}
                emptyText={t("plannedAnalysis.compare.noStrengths", {
                  defaultValue: "Clear strengths will appear after checks finish.",
                })}
                tone="good"
              />
              <InsightList
                title={t("plannedAnalysis.compare.weaknesses", {
                  defaultValue: "Weaknesses",
                })}
                items={side.weaknesses}
                emptyText={t("plannedAnalysis.compare.noWeaknesses", {
                  defaultValue: "No clear weaknesses were found by the current local signals.",
                })}
                tone="warn"
              />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function CompareTextColumn({ side }: { side: RuntimeArticleCompareTextSide }) {
  const { i18n, t } = useTranslation();
  const locale = i18n.resolvedLanguage === "ru" ? "ru" : "en";
  return (
    <article className="rounded-lg border border-outline/10 bg-white">
      <header className="border-b border-outline/10 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-outline-900/45">
              {side.role === "own"
                ? t("plannedAnalysis.compare.yourText", { defaultValue: "Your text" })
                : side.role === "competitor"
                  ? t("plannedAnalysis.compare.competitorText", { defaultValue: "Competitor text" })
                  : side.id === "textA"
                    ? locale === "ru" ? "Текст A" : "Text A"
                    : locale === "ru" ? "Текст B" : "Text B"}
            </p>
            <h3 className="mt-1 text-lg font-semibold text-outline-900">
              {side.title}
            </h3>
          </div>
          <span className="rounded-full border border-orange-200 bg-orange-50 px-2.5 py-1 text-xs font-semibold text-outline-900/55">
            {t("plannedAnalysis.compare.words", {
              count: side.wordCount,
              defaultValue: "{{count}} words",
            })}
          </span>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs text-outline-900/55">
          <span className="rounded-md bg-orange-50 px-2 py-1">
            {t("plannedAnalysis.compare.paragraphs", {
              count: side.paragraphCount,
              defaultValue: "{{count}} paragraphs",
            })}
          </span>
          <span className="rounded-md bg-orange-50 px-2 py-1">
            {t("plannedAnalysis.compare.headings", {
              count: side.headingCount,
              defaultValue: "{{count}} headings",
            })}
          </span>
          <span className="rounded-md bg-orange-50 px-2 py-1">
            {t("plannedAnalysis.compare.wordsPerSentence", {
              count: side.averageSentenceWords ?? "—",
              defaultValue: "{{count}} words/sent.",
            })}
          </span>
        </div>
      </header>
      <div className="max-h-[520px] overflow-auto p-4 text-sm leading-relaxed text-outline-900/75">
        {splitParagraphs(side.text).map((paragraph, index) => (
          <p key={`${side.id}-${index}`} className="mb-3 last:mb-0">
            {paragraph}
          </p>
        ))}
      </div>
    </article>
  );
}

function CompareMetricCard({ metric }: { metric: RuntimeArticleCompareMetric }) {
  const { i18n } = useTranslation();
  const locale = i18n.resolvedLanguage === "ru" ? "ru" : "en";
  const winnerLabel =
    metric.winner === "textA"
      ? "A"
      : metric.winner === "textB"
        ? "B"
        : metric.winner === "tie"
          ? locale === "ru" ? "равно" : "tie"
        : metric.winner === "risk"
            ? locale === "ru" ? "риск" : "risk"
            : "—";
  return (
    <div className="rounded-lg border border-orange-200/80 bg-orange-50/70 p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-outline-900/65">
          {metric.label}
        </p>
        <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-outline-900/60">
          {winnerLabel}
        </span>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 text-center">
        <div className="rounded-md bg-white p-3">
          <div className="text-xl font-semibold text-outline-900">
            {metric.textA ?? "—"}
            {metric.textA !== null && metric.suffix}
          </div>
          <div className="text-[10px] font-semibold uppercase text-outline-900/45">
            A
          </div>
        </div>
        <div className="rounded-md bg-white p-3">
          <div className="text-xl font-semibold text-outline-900">
            {metric.textB ?? "—"}
            {metric.textB !== null && metric.suffix}
          </div>
          <div className="text-[10px] font-semibold uppercase text-outline-900/45">
            B
          </div>
        </div>
      </div>
      <p className="mt-3 text-xs leading-relaxed text-outline-900/65">
        {metric.description}
      </p>
    </div>
  );
}

function CompareGapList({
  title,
  description,
  gaps,
}: {
  title: string;
  description: string;
  gaps: RuntimeArticleCompareSummary["gaps"];
}) {
  return (
    <section className="rounded-lg border border-outline/10 bg-white p-4">
      <h3 className="text-sm font-semibold text-outline-900">{title}</h3>
      <p className="mt-1 text-xs leading-relaxed text-outline-900/55">
        {description}
      </p>
      <ul className="mt-3 grid gap-2">
        {gaps.slice(0, 6).map((gap) => (
          <li
            key={`${gap.side}-${gap.title}`}
            className="rounded-md border border-outline/10 bg-orange-50/45 px-3 py-2"
          >
            <p className="text-sm font-semibold text-outline-900">{gap.title}</p>
            <p className="mt-1 text-xs leading-relaxed text-outline-900/60">
              {gap.detail}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function CompareActionPlan({ items }: { items: RuntimeArticleTextPriority[] }) {
  const { t } = useTranslation();
  return (
    <section className="rounded-lg border border-outline/10 bg-white p-4">
      <h3 className="text-sm font-semibold text-outline-900">
        {t("plannedAnalysis.compare.actionPlan", {
          defaultValue: "What to improve next",
        })}
      </h3>
      <p className="mt-1 text-xs leading-relaxed text-outline-900/55">
        {t("plannedAnalysis.compare.actionPlanDescription", {
          defaultValue: "Editing priorities: strengthen the target text without copying the second one.",
        })}
      </p>
      <ol className="mt-3 grid gap-2">
        {items.slice(0, 6).map((item, index) => (
          <li
            key={`${item.title}-${index}`}
            className="rounded-md border border-outline/10 bg-white px-3 py-2"
          >
            <p className="text-sm font-semibold text-outline-900">
              {index + 1}. {item.title}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-outline-900/60">
              {item.detail}
            </p>
          </li>
        ))}
      </ol>
    </section>
  );
}

interface ToraRankResult {
  value: number;
  displayValue: string;
  qualityScore: number;
  positiveSignals: number;
  penaltySignals: number;
  evidenceCeiling: number;
  toolDepth: number;
}

function ToraRankHero({
  rank,
  onOpenDetails,
  onOpenFormulas,
}: {
  rank: ToraRankResult;
  onOpenDetails: () => void;
  onOpenFormulas: () => void;
}) {
  const { t } = useTranslation();
  const toneClass = toraRankToneClass(rank);
  return (
    <section className={`mt-5 rounded-lg border bg-gradient-to-r p-4 shadow-sm ${toneClass}`}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">
            Tora Rank
          </p>
          <p className="mt-2 text-sm text-outline-900/60">
            {t("plannedAnalysis.toraRank.scoreLabel", {
              defaultValue: "Score for this analysis:",
            })}{" "}
            <strong className="font-display text-2xl font-semibold text-outline-900">
              {rank.displayValue} cgs
            </strong>
          </p>
          <button
            type="button"
            onClick={onOpenDetails}
            className="mt-3 inline-flex items-center gap-2 rounded-md border border-outline/15 bg-white px-3 py-1.5 text-xs font-semibold text-outline-900/70 transition hover:border-primary/40 hover:bg-orange-50"
          >
            <Info size={14} aria-hidden="true" />
            {t("analysisPanel.actions.details", {
              defaultValue: "Details",
            })}
          </button>
          <p className="mt-2 text-xs leading-relaxed text-outline-900/45">
            {t("plannedAnalysis.toraRank.previewNote", {
              defaultValue: "Early app score: fewer tools lowers the score ceiling.",
            })}
          </p>
        </div>
        <div className="flex justify-end sm:self-end">
          <button
            type="button"
            onClick={onOpenFormulas}
            className="rounded-md px-3 py-1.5 text-xs font-semibold text-primary transition hover:bg-white/80"
          >
            {t("plannedAnalysis.toraRank.about", {
              defaultValue: "About Tora Rank",
            })}
          </button>
        </div>
      </div>
    </section>
  );
}

function toraRankToneClass(rank: ToraRankResult): string {
  const ratio =
    rank.evidenceCeiling > 0 ? rank.value / rank.evidenceCeiling : 0;
  if (ratio >= 0.78) {
    return "border-green-200 from-green-50 via-white to-orange-50";
  }
  if (ratio >= 0.55) {
    return "border-primary/25 from-orange-50 via-white to-amber-50";
  }
  return "border-red-200 from-red-50 via-white to-orange-50";
}

function ToraRankModal({
  rank,
  onClose,
  onOpenFormulas,
}: {
  rank: ToraRankResult;
  onClose: () => void;
  onOpenFormulas: () => void;
}) {
  const { t } = useTranslation();
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);
  const openFormulas = () => {
    onClose();
    onOpenFormulas();
  };
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-outline-900/35 p-4 backdrop-blur-sm"
      role="presentation"
      onMouseDown={onClose}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="tora-rank-modal-title"
        className="max-h-[88vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-outline/10 bg-white p-5 shadow-2xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-primary">
              Tora Rank
            </p>
            <h3
              id="tora-rank-modal-title"
              className="mt-2 font-display text-2xl font-semibold text-outline-900"
            >
              {t("plannedAnalysis.toraRank.modalTitle", {
                defaultValue: "How to read this score",
              })}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-outline/10 bg-white p-2 text-outline-900/55 transition hover:border-primary/30 hover:text-primary"
            aria-label={t("plannedAnalysis.toraRank.close", {
              defaultValue: "Close",
            })}
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>

        <div className="mt-5 rounded-lg border border-orange-200 bg-orange-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-outline-900/50">
            {t("plannedAnalysis.toraRank.currentScore", {
              defaultValue: "Current result",
            })}
          </p>
          <p className="mt-2 font-display text-3xl font-semibold text-outline-900">
            {rank.displayValue} <span className="text-lg text-outline-900/55">cgs</span>
          </p>
        </div>

        <p className="mt-5 text-sm leading-relaxed text-outline-900/70">
          {t("plannedAnalysis.toraRank.modalBody", {
            defaultValue: "Tora Rank shows the total strength of this text-analysis result. It is not a search position and not a traffic guarantee: MCP tools provide metrics, and the app combines them into an early cgs score.",
          })}
        </p>
        <p className="mt-2 text-sm leading-relaxed text-outline-900/60">
          {t("plannedAnalysis.toraRank.chatBoundary", {
            defaultValue: "The AI chat does not calculate Tora Rank as a separate tool. If you ask about the score, it should explain it as an app preview layer above the analysis results.",
          })}
        </p>

        <div className="mt-5 grid gap-3 md:grid-cols-2">
          <div className="rounded-lg border border-green-200 bg-green-50/70 p-4">
            <h4 className="text-sm font-semibold text-outline-900">
              {t("plannedAnalysis.toraRank.raisesTitle", {
                defaultValue: "What raises the score",
              })}
            </h4>
            <ul className="mt-3 space-y-2 text-sm leading-relaxed text-outline-900/65">
              <li>{t("plannedAnalysis.toraRank.raiseStructure", { defaultValue: "clear structure and a logical reader path" })}</li>
              <li>{t("plannedAnalysis.toraRank.raiseIntent", { defaultValue: "clear intent, strong hook, and SEO-ready packaging" })}</li>
              <li>{t("plannedAnalysis.toraRank.raiseOriginality", { defaultValue: "natural style, specificity, and usefulness" })}</li>
            </ul>
          </div>
          <div className="rounded-lg border border-red-200 bg-red-50/70 p-4">
            <h4 className="text-sm font-semibold text-outline-900">
              {t("plannedAnalysis.toraRank.lowersTitle", {
                defaultValue: "What lowers the score",
              })}
            </h4>
            <ul className="mt-3 space-y-2 text-sm leading-relaxed text-outline-900/65">
              <li>{t("plannedAnalysis.toraRank.lowerRepetition", { defaultValue: "watery text, repetition, and template phrases" })}</li>
              <li>{t("plannedAnalysis.toraRank.lowerLogic", { defaultValue: "weak logic, contradictions, and unclear conclusions" })}</li>
              <li>{t("plannedAnalysis.toraRank.lowerRisk", { defaultValue: "risky claims and unchecked facts" })}</li>
            </ul>
          </div>
        </div>

        <div className="mt-5 rounded-lg border border-outline/10 bg-outline-900/[0.03] p-4">
          <p className="font-mono text-sm leading-relaxed text-outline-900/70">
            {t("plannedAnalysis.toraRank.exampleFormula", {
              defaultValue: "text strength + intent + usefulness - penalties = final Tora Rank in cgs",
            })}
          </p>
          <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold text-outline-900/55">
            <span className="rounded-full bg-white px-2.5 py-1">
              +{rank.positiveSignals} {t("plannedAnalysis.toraRank.signalPoints", { defaultValue: "signals" })}
            </span>
            <span className="rounded-full bg-white px-2.5 py-1">
              -{rank.penaltySignals} {t("plannedAnalysis.toraRank.penaltyPoints", { defaultValue: "penalties" })}
            </span>
            <span className="rounded-full bg-white px-2.5 py-1">
              {t("plannedAnalysis.toraRank.ceiling", {
                defaultValue: "ceiling",
              })}: {new Intl.NumberFormat(undefined).format(rank.evidenceCeiling)} cgs
            </span>
            <span className="rounded-full bg-white px-2.5 py-1">
              {t("plannedAnalysis.toraRank.toolDepth", {
                defaultValue: "depth",
              })}: {rank.toolDepth}%
            </span>
          </div>
        </div>

        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={openFormulas}
            className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white transition hover:bg-primary-600"
          >
            {t("plannedAnalysis.toraRank.about", {
              defaultValue: "About Tora Rank",
            })}
          </button>
        </div>
      </section>
    </div>
  );
}

function ArticleTextResultsDashboard({
  state,
  onOpenFormulas,
  showToraRank,
}: {
  state: CurrentScanState | null;
  onOpenFormulas: () => void;
  showToraRank: boolean;
}) {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage === "ru" ? "ru" : "en";
  const isRu = locale === "ru";
  const [exportStatus, setExportStatus] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const [toraRankModalOpen, setToraRankModalOpen] = useState(false);
  const evalLabEnabled = isEvalLabEnabled();
  if (
    state?.analysisType !== "article_text" &&
    state?.analysisType !== "page_by_url"
  ) return null;

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
  const toraRank = buildArticleTextToraRank(articleSummary);
  const report = buildArticleTextReport(state, t, articleSummary, locale);
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
          defaultValue: "Report exported.",
        }),
      );
      return;
    }
    if (result.error === "cancelled") {
      setExportStatus(
        t("plannedAnalysis.results.exportCancelled", {
          defaultValue: "Export cancelled.",
        }),
      );
      return;
    }
    const fallback = t("plannedAnalysis.results.exportFailed", {
      defaultValue: "Failed to export the report.",
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
          defaultValue: "Source text copied.",
        }),
      );
      return;
    }
    const fallback = t("plannedAnalysis.results.copySourceFailed", {
      defaultValue: "Could not copy the source text.",
    });
    setCopyStatus(result.error ? `${fallback} ${result.error}` : fallback);
  };

  const exportQaJson = async () => {
    if (!report) return;
    setExportStatus(null);
    setCopyStatus(null);
    const result = await window.toraseo.runtime.exportReportJson(report);
    if (result.ok) {
      setExportStatus(
        t("plannedAnalysis.results.exportJsonReady", {
          defaultValue: "QA JSON exported.",
        }),
      );
      return;
    }
    if (result.error === "cancelled") {
      setExportStatus(
        t("plannedAnalysis.results.exportCancelled", {
          defaultValue: "Export cancelled.",
        }),
      );
      return;
    }
    const fallback = t("plannedAnalysis.results.exportFailed", {
      defaultValue: "Failed to export the report.",
    });
    setExportStatus(result.error ? `${fallback} ${result.error}` : fallback);
  };

  return (
    <section className="rounded-lg border border-outline/10 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold text-outline-900">
            {t("plannedAnalysis.results.title", {
              defaultValue: "Analysis results",
            })}
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-outline-900/60">
            {t("plannedAnalysis.results.body", {
              defaultValue: "Current structured text-analysis results are shown here. The chat answer may be shorter, but the app keeps the checks below.",
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
            {t("analysisPanel.actions.details", { defaultValue: "Details" })}
          </button>
          <button
            type="button"
            onClick={() => void exportReport()}
            disabled={!canUseReport}
            className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-primary-600 disabled:cursor-not-allowed disabled:bg-outline-900/15 disabled:text-outline-900/45"
          >
            {t("plannedAnalysis.results.export", {
              defaultValue: "Export",
            })}
          </button>
          <button
            type="button"
            onClick={() => void copyOriginalText()}
            disabled={!canCopySourceText}
            className="rounded-md border border-primary/25 bg-orange-50 px-3 py-1.5 text-xs font-semibold text-primary transition hover:border-primary/45 hover:bg-orange-100 disabled:cursor-not-allowed disabled:border-outline/10 disabled:bg-outline-900/5 disabled:text-outline-900/35"
          >
            {t("plannedAnalysis.results.copySourceText", {
              defaultValue: "Copy source text",
            })}
          </button>
          {evalLabEnabled && (
            <button
              type="button"
              onClick={() => void exportQaJson()}
              disabled={!canUseReport}
              className="rounded-md border border-outline/15 bg-white px-3 py-1.5 text-xs font-semibold text-outline-900/60 transition hover:border-primary/40 hover:bg-orange-50 disabled:cursor-not-allowed disabled:opacity-45"
            >
              QA JSON
            </button>
          )}
        </div>
      </div>
      {(exportStatus || copyStatus) && (
        <p className="mt-3 text-xs font-medium text-orange-700/75">
          {copyStatus ?? exportStatus}
        </p>
      )}

      {showToraRank && (
        <ToraRankHero
          rank={toraRank}
          onOpenDetails={() => setToraRankModalOpen(true)}
          onOpenFormulas={onOpenFormulas}
        />
      )}
      {showToraRank && toraRankModalOpen && (
        <ToraRankModal
          rank={toraRank}
          onClose={() => setToraRankModalOpen(false)}
          onOpenFormulas={onOpenFormulas}
        />
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
                  defaultValue: "Warnings: {{count}}",
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
              defaultValue: "Strengths",
            })}
            items={articleSummary.strengths}
            emptyText={t("plannedAnalysis.results.strengthsEmpty", {
              defaultValue: "Strengths will appear after checks finish.",
            })}
            tone="good"
          />
          <InsightList
            title={t("plannedAnalysis.results.weaknesses", {
              defaultValue: "Weaknesses",
            })}
            items={articleSummary.weaknesses}
            emptyText={t("plannedAnalysis.results.weaknessesEmpty", {
              defaultValue: "No clear weaknesses were found by the current tools.",
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
                  defaultValue: "Intent forecast and SEO package",
                })}
              </p>
              <h3 className="mt-1 font-display text-lg font-semibold text-outline-900">
                {localizeArticleUiText(articleSummary.intentForecast.intentLabel, isRu)}
              </h3>
              <p className="mt-1 text-xs leading-relaxed text-outline-900/55">
                {articleSummary.intentForecast.internetDemandAvailable
                  ? localizeArticleUiText(
                      articleSummary.intentForecast.internetDemandSource,
                      isRu,
                    )
                  : t("plannedAnalysis.results.intentForecast.noInternet", {
                      defaultValue: "This is a local forecast without SERP or social-platform data. Internet verification can be connected later through a separate external source.",
                    })}
              </p>
            </div>
            <div className="grid min-w-[260px] grid-cols-3 gap-2 text-center">
              {[
                {
                  label: t("plannedAnalysis.results.intentForecast.hook", {
                    defaultValue: "Hook",
                  }),
                  value: articleSummary.intentForecast.hookScore,
                  tooltip: t("plannedAnalysis.results.intentForecast.hookTooltip", {
                    defaultValue: "The hook shows how strongly the opening lines catch the reader: whether the pain, benefit, or promised result is visible.",
                  }),
                },
                {
                  label: t("plannedAnalysis.results.intentForecast.ctr", {
                    defaultValue: "CTR",
                  }),
                  value: articleSummary.intentForecast.ctrPotential,
                  tooltip: t("plannedAnalysis.results.intentForecast.ctrTooltip", {
                    defaultValue: "CTR is a local estimate of title and description click potential. It is not real search-result statistics.",
                  }),
                },
                {
                  label: t("plannedAnalysis.results.intentForecast.trend", {
                    defaultValue: "Trend",
                  }),
                  value: articleSummary.intentForecast.trendPotential,
                  tooltip: t("plannedAnalysis.results.intentForecast.trendTooltip", {
                    defaultValue: "Trend is an approximate local estimate of topic potential from the text wording. Internet demand is not checked here.",
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
                  defaultValue: "For WordPress / Laravel CMS",
                })}
              </p>
              <dl className="mt-2 grid gap-2 text-xs text-outline-900/65">
                <div>
                  <dt className="font-semibold text-outline-900">
                    {t("plannedAnalysis.results.intentForecast.seoTitle", {
                      defaultValue: "SEO title",
                    })}
                  </dt>
                  <dd>
                    {localizeArticleUiText(
                      articleSummary.intentForecast.seoPackage.seoTitle || "—",
                      isRu,
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="font-semibold text-outline-900">
                    {t("plannedAnalysis.results.intentForecast.description", {
                      defaultValue: "Description",
                    })}
                  </dt>
                  <dd>
                    {localizeArticleUiText(
                      articleSummary.intentForecast.seoPackage.metaDescription || "—",
                      isRu,
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="font-semibold text-outline-900">
                    {t("plannedAnalysis.results.intentForecast.keywords", {
                      defaultValue: "Keywords",
                    })}
                  </dt>
                  <dd>
                    {localizeArticleUiText(
                      articleSummary.intentForecast.seoPackage.keywords.join(", ") ||
                        "—",
                      isRu,
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="font-semibold text-outline-900">
                    {t("plannedAnalysis.results.intentForecast.taxonomy", {
                      defaultValue: "Category / tags",
                    })}
                  </dt>
                  <dd>
                    {localizeArticleUiText(
                      articleSummary.intentForecast.seoPackage.category,
                      isRu,
                    )}
                    {articleSummary.intentForecast.seoPackage.tags.length > 0
                      ? ` · ${localizeArticleUiText(
                          articleSummary.intentForecast.seoPackage.tags.join(", "),
                          isRu,
                        )}`
                      : ""}
                  </dd>
                </div>
                <div>
                  <dt className="font-semibold text-outline-900">
                    {t("plannedAnalysis.results.intentForecast.slug", {
                      defaultValue: "URL slug",
                    })}
                  </dt>
                  <dd>
                    {localizeSeoSlug(
                      articleSummary.intentForecast.seoPackage.slug || "—",
                      isRu,
                    )}
                  </dd>
                </div>
              </dl>
            </div>
            <div className="rounded-md border border-orange-200/70 bg-orange-50/80 p-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-outline-900/50">
                {t("plannedAnalysis.results.intentForecast.hooksTitle", {
                  defaultValue: "Hook ideas",
                })}
              </p>
              <ul className="mt-2 grid gap-2 text-xs leading-relaxed text-outline-900/65">
                {articleSummary.intentForecast.hookIdeas.map((hook) => (
                  <li key={hook}>• {localizeArticleUiText(hook, isRu)}</li>
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
              defaultValue: "Article uniqueness",
            })}
          </p>
          <div className="mt-4 flex items-center justify-center">
            <ScoreDial
              value={uniqueness}
              emptyLabel={t("plannedAnalysis.results.waitingMetric", {
                defaultValue: "waiting",
              })}
            />
          </div>
          <p className="mt-4 text-center text-xs leading-relaxed text-outline-900/55">
            {t("plannedAnalysis.results.uniquenessHint", {
              defaultValue: "Local repetition and template-risk estimate. This is not an internet plagiarism check.",
            })}
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label={t("plannedAnalysis.results.syntaxTitle", {
              defaultValue: "Language syntax",
            })}
            value={syntax}
            suffix="%"
            tone={scoreTone(syntax)}
          />
          <MetricCard
            label={t("plannedAnalysis.results.aiProbabilityTitle", {
              defaultValue: "AI writing probability",
            })}
            value={aiProbability}
            suffix="%"
            tone={inverseScoreTone(aiProbability)}
          />
          <MetricCard
            label={t("plannedAnalysis.results.logicTitle", {
              defaultValue: "Logic consistency",
            })}
            value={logicScore}
            suffix="%"
            tone={scoreTone(logicScore)}
          />
          <MetricCard
            label={t("plannedAnalysis.results.naturalnessTitle", {
              defaultValue: "Naturalness",
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

      {state.analysisType === "page_by_url" && (
        <PageSearchMentionsAccordion state={state} />
      )}

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
      <p className="mt-4 text-[11px] font-semibold uppercase tracking-wide text-outline-900/35">
        {getAnalysisVersionText(state.analysisType, locale, report.analysisVersion)}
      </p>
    </section>
  );
}

function IntentForecastPanel({
  articleSummary,
}: {
  articleSummary: RuntimeArticleTextSummary;
}) {
  const { t, i18n } = useTranslation();
  const isRu = i18n.language.startsWith("ru");
  const forecast = articleSummary.intentForecast;
  if (!forecast) return null;

  return (
    <div className="mt-5 rounded-lg border border-orange-200/70 bg-orange-100/50 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-outline-900/50">
            {t("plannedAnalysis.results.intentForecast.title", {
              defaultValue: "Intent forecast and SEO package",
            })}
          </p>
          <h3 className="mt-1 font-display text-lg font-semibold text-outline-900">
            {localizeArticleUiText(forecast.intentLabel, isRu)}
          </h3>
          <p className="mt-1 text-xs leading-relaxed text-outline-900/55">
            {forecast.internetDemandAvailable
              ? localizeArticleUiText(forecast.internetDemandSource, isRu)
              : t("plannedAnalysis.results.intentForecast.noInternet", {
                  defaultValue: "This is a local forecast without SERP or social-platform data. Internet verification can be connected later through a separate external source.",
                })}
          </p>
        </div>
        <div className="grid min-w-[260px] grid-cols-3 gap-2 text-center">
          {[
            {
              label: t("plannedAnalysis.results.intentForecast.hook", {
                defaultValue: "Hook",
              }),
              value: forecast.hookScore,
              tooltip: t("plannedAnalysis.results.intentForecast.hookTooltip", {
                defaultValue: "The hook shows how strongly the opening lines catch the reader: whether the pain, benefit, or promised result is visible.",
              }),
            },
            {
              label: t("plannedAnalysis.results.intentForecast.ctr", {
                defaultValue: "CTR",
              }),
              value: forecast.ctrPotential,
              tooltip: t("plannedAnalysis.results.intentForecast.ctrTooltip", {
                defaultValue: "CTR is a local estimate of title and description click potential. It is not real search-result statistics.",
              }),
            },
            {
              label: t("plannedAnalysis.results.intentForecast.trend", {
                defaultValue: "Trend",
              }),
              value: forecast.trendPotential,
              tooltip: t("plannedAnalysis.results.intentForecast.trendTooltip", {
                defaultValue: "Trend is an approximate local estimate of topic potential from the text wording. Internet demand is not checked here.",
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
              defaultValue: "For WordPress / Laravel CMS",
            })}
          </p>
          <dl className="mt-2 grid gap-2 text-xs text-outline-900/65">
            <div>
              <dt className="font-semibold text-outline-900">
                {t("plannedAnalysis.results.intentForecast.seoTitle", {
                  defaultValue: "SEO title",
                })}
              </dt>
              <dd>{localizeArticleUiText(forecast.seoPackage.seoTitle || "—", isRu)}</dd>
            </div>
            <div>
              <dt className="font-semibold text-outline-900">
                {t("plannedAnalysis.results.intentForecast.description", {
                  defaultValue: "Description",
                })}
              </dt>
              <dd>
                {localizeArticleUiText(
                  forecast.seoPackage.metaDescription || "—",
                  isRu,
                )}
              </dd>
            </div>
            <div>
              <dt className="font-semibold text-outline-900">
                {t("plannedAnalysis.results.intentForecast.keywords", {
                  defaultValue: "Keywords",
                })}
              </dt>
              <dd>
                {localizeArticleUiText(
                  forecast.seoPackage.keywords.join(", ") || "—",
                  isRu,
                )}
              </dd>
            </div>
            <div>
              <dt className="font-semibold text-outline-900">
                {t("plannedAnalysis.results.intentForecast.taxonomy", {
                  defaultValue: "Category / tags",
                })}
              </dt>
              <dd>
                {localizeArticleUiText(forecast.seoPackage.category, isRu)}
                {forecast.seoPackage.tags.length > 0
                  ? ` · ${localizeArticleUiText(
                      forecast.seoPackage.tags.join(", "),
                      isRu,
                    )}`
                  : ""}
              </dd>
            </div>
            <div>
              <dt className="font-semibold text-outline-900">
                {t("plannedAnalysis.results.intentForecast.slug", {
                  defaultValue: "URL slug",
                })}
              </dt>
              <dd>{localizeSeoSlug(forecast.seoPackage.slug || "—", isRu)}</dd>
            </div>
          </dl>
        </div>
        <div className="rounded-md border border-orange-200/70 bg-orange-50/80 p-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-outline-900/50">
            {t("plannedAnalysis.results.intentForecast.hooksTitle", {
              defaultValue: "Hook ideas",
            })}
          </p>
          <ul className="mt-2 grid gap-2 text-xs leading-relaxed text-outline-900/65">
            {forecast.hookIdeas.map((hook) => (
              <li key={hook}>• {localizeArticleUiText(hook, isRu)}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function PageSearchMentionsAccordion({
  state,
}: {
  state: CurrentScanState;
}) {
  const { i18n, t } = useTranslation();
  const isRu = i18n.resolvedLanguage === "ru";
  const searchEntries = [
    state.buffer.analyze_google_page_search,
    state.buffer.analyze_yandex_page_search,
  ].filter(Boolean);
  if (searchEntries.length === 0) return null;

  const mentionItems = searchEntries.flatMap((entry) => {
    const data = entry?.data as
      | {
          engine?: string;
          mentions?: {
            count?: number | null;
            note?: string;
            items?: Array<{
              source?: string;
              title?: string;
              url?: string;
              mention_context?: string;
            }>;
          };
        }
      | undefined;
    return (data?.mentions?.items ?? []).map((item) => ({
      ...item,
      engine: data?.engine,
    }));
  });
  const notes = searchEntries
    .map((entry) => {
      const data = entry?.data as
        | {
            engine?: string;
            mentions?: { count?: number | null; note?: string };
            owner_metrics?: { note?: string };
          }
        | undefined;
      const engine =
        data?.engine === "yandex"
          ? t("plannedAnalysis.results.yandexEngine", { defaultValue: "Yandex" })
          : "Google";
      const count =
        data?.mentions?.count ??
        t("plannedAnalysis.results.pageMentionsUnavailable", {
          defaultValue: "n/a",
        });
      const countLabel = t("plannedAnalysis.results.pageMentionsCountLabel", {
        defaultValue: "mentions",
      });
      const note = localizeArticleUiText(
        data?.mentions?.note ?? data?.owner_metrics?.note ?? "",
        isRu,
      );
      return `${engine}: ${count} ${countLabel}. ${note}`;
    })
    .filter(Boolean);

  return (
    <details className="mt-4 rounded-lg border border-outline/10 bg-white p-4">
      <summary className="cursor-pointer text-sm font-semibold text-outline-900">
        {t("plannedAnalysis.results.pageMentionsTitle", {
          defaultValue: "Page mentions in search and external resources",
        })}
      </summary>
      <div className="mt-3 space-y-2 text-sm leading-relaxed text-outline-900/65">
        {notes.map((note) => (
          <p key={note}>{localizeArticleUiText(note, isRu)}</p>
        ))}
        {mentionItems.length > 0 ? (
          <div className="grid gap-2">
            {mentionItems.map((item, index) => (
              <a
                key={`${item.url ?? index}-${index}`}
                href={item.url}
                target="_blank"
                rel="noreferrer"
                className="rounded-md border border-outline/10 bg-orange-50/40 p-3 transition hover:border-primary/30"
              >
                <span className="block text-xs font-semibold uppercase tracking-wider text-outline-900/45">
                  {item.engine ?? item.source ?? "source"}
                </span>
                <span className="mt-1 block font-semibold text-outline-900">
                  {item.title || item.url}
                </span>
                {item.mention_context && (
                  <span className="mt-1 block text-xs text-outline-900/55">
                    {item.mention_context}
                  </span>
                )}
              </a>
            ))}
          </div>
        ) : (
          <p>
            {t("plannedAnalysis.results.pageMentionsEmpty", {
              defaultValue: "The link list is empty because public search mentions require a connected search index, SERP API, or owner data.",
            })}
          </p>
        )}
      </div>
    </details>
  );
}

function ApiFactRow({ fact }: { fact: RuntimeConfirmedFact }) {
  const { i18n, t } = useTranslation();
  const isRu = i18n.language.startsWith("ru");
  const locale = isRu ? "ru" : "en";
  const localizeResultText = (value: string) =>
    localizeArticleCompareUiText(localizeArticleUiText(value, isRu), locale);
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
      ? `${localizeResultText(fact.title)}: ${localizeResultText(findingText)}`
      : localizeResultText(findingText);
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
            defaultValue: "Done",
          })}
        </span>
      </div>

      {chips.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-outline-900/45">
            {t("plannedAnalysis.results.keyFacts", {
              defaultValue: "Key facts",
            })}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {chips.map((chip) => (
              <span
                key={chip}
                className="rounded-full border border-orange-200/70 bg-orange-100 px-2.5 py-1 text-xs text-outline-900/75"
              >
                {localizeResultText(chip)}
              </span>
            ))}
          </div>
        </div>
      )}

      {(found || chips.length === 0) && (
        <div className="mt-4 rounded-md border border-orange-200/75 bg-orange-50/90 px-3 py-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-orange-800/75">
            {t("plannedAnalysis.results.findings", {
              defaultValue: "Findings",
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
              defaultValue: "What to do",
            })}
          </p>
          <p className="mt-1 text-sm leading-relaxed text-outline-900/70">
            {localizeResultText(todo)}
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
  const { i18n } = useTranslation();
  const isRu = i18n.language.startsWith("ru");
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
              <strong className="text-sm text-outline-900">
                {localizeArticleUiText(item.title, isRu)}
              </strong>
              <p className="mt-1 text-xs leading-relaxed text-outline-900/60">
                {localizeArticleUiText(item.detail, isRu)}
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
          defaultValue: "Risks and review limits",
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
              defaultValue: "Warnings found: {{count}}. Review safety and expert-check items before publishing.",
            })}
          </p>
        )}
      </div>
      <p className="mt-3 text-xs leading-relaxed text-red-900/60">
        {t("plannedAnalysis.results.warningAiLimitation", {
          defaultValue: "This is a risk flag, not an expert conclusion: AI can be wrong, so legal, medical, investment, scientific, technical, and calculation-heavy claims still need human verification.",
        })}
      </p>
    </div>
  );
}

function localizeArticleUiText(value: string, isRu: boolean): string {
  if (!isRu) {
    const exact: Record<string, string> = {
      "Безопасность и проверка": "Safety and review",
      "Интент и продвижение": "Intent and promotion",
      "Прогноз интента и продвижения": "Intent and promotion forecast",
      "Прогноз интента и SEO-пакет": "Intent forecast and SEO package",
      "Проверка риска": "Risk check",
      "Проверка рисков": "Risk check",
      "Проверка юридического риска": "Legal risk check",
      "Проверка медицинского риска": "Medical risk check",
      "Проверка инвестиционного риска": "Investment risk check",
      "Нужна внешняя проверка": "External review needed",
      "Служебный элемент": "Service element",
      "Механический повтор": "Mechanical repetition",
      "Формальная формулировка": "Formal phrasing",
      "Проверка тона": "Tone check",
      "Соответствие аудитории": "Audience fit",
      "Повторяющееся предложение": "Repeated sentence",
      "Перегруженное предложение": "Overloaded sentence",
      "Информационный / решение проблемы": "Informational / problem solution",
      "Тип интента: Информационный / решение проблемы": "Intent type: Informational / problem solution",
      "SEO-хук заголовка и вступления": "SEO hook for title and intro",
      "Полезные материалы": "Helpful resources",
      "Технологии": "Technology",
      "Здоровье и спорт": "Health and fitness",
      "Бизнес": "Business",
      "Предупреждение!": "Warning!",
      "НЕТ": "no",
      "ДА": "yes",
      "да": "yes",
      "нет": "no",
      "Есть фактически чувствительные утверждения, числа или медицинско-правовые формулировки. Их нельзя подтверждать только сравнением текстов. Перепроверьте числа, источники и категоричные утверждения; смягчите то, что нельзя подтвердить уверенно.": "The text contains fact-sensitive claims, numbers, or medical/legal wording. They cannot be verified by text comparison alone. Recheck numbers, sources, and categorical claims; soften anything that cannot be confirmed with confidence.",
      "Перепроверьте числа, источники и категоричные утверждения; смягчите то, что нельзя подтвердить уверенно.": "Recheck numbers, sources, and categorical claims; soften anything that cannot be confirmed with confidence.",
      "Расплывчатые ссылки на исследования и экспертов лучше заменить конкретными источниками или убрать.": "Vague references to research and experts should be replaced with specific sources or removed.",
      "Текст может выглядеть как попытка нарушить закон, правила платформы или дать опасные инструкции.": "The text may look like an attempt to break the law, evade platform rules, or provide dangerous instructions.",
      "Есть технические или конструкторские утверждения, где ошибка может быть критичной.": "Technical or engineering claims were found where mistakes may be critical.",
      "Первый хук можно усилить: раньше показать проблему читателя, конфликт или понятную выгоду.": "The first hook can be stronger: show the reader's problem, conflict, or clear benefit earlier.",
      "Усилите первую строку, понятную пользу для читателя и SEO-пакет перед публикацией.": "Strengthen the first line, reader benefit, and SEO package before publishing.",
      "Это локальный прогноз без SERP и соцданных. Интернет-сверку позже можно подключить отдельным внешним источником.": "This is a local forecast without SERP or social-platform data. Internet verification can be connected later through a separate external source.",
      "Блокирующих предупреждений по безопасности и экспертной проверке не найдено.": "No blocking safety or expert-review warnings were found.",
      "Есть юридически чувствительные формулировки.": "Legally sensitive wording was found.",
      "Есть медицинские или health-sensitive утверждения.": "Medical or health-sensitive claims were found.",
      "Есть инвестиционно чувствительные формулировки.": "Investment-sensitive wording was found.",
    };
    const normalized = value.trim();
    if (exact[normalized]) return value.replace(normalized, exact[normalized]);
    const metaReplacements: Array<[RegExp, string]> = [
      [/\bСТИЛЬ\b/g, "STYLE"],
      [/\bТОН\b/g, "TONE"],
      [/\bАУДИТОРИЯ\b/g, "AUDIENCE"],
      [/\bЧИТАЕМОСТЬ\b/g, "READABILITY"],
      [/\bНАТУРАЛЬНОСТЬ\b/g, "NATURALNESS"],
      [/\bЛОГИКА\b/g, "LOGIC"],
      [/\bИНТЕНТ\b/g, "INTENT"],
      [/\bЮРИДИЧЕСКИЙ РИСК\b/g, "LEGAL RISK"],
      [/\bМЕДИЦИНСКИЙ РИСК\b/g, "MEDICAL RISK"],
      [/\bИНВЕСТИЦИОННЫЙ РИСК\b/g, "INVESTMENT RISK"],
      [/\bСЛУЖЕБНЫЙ ЭЛЕМЕНТ\b/g, "SERVICE ELEMENT"],
      [/\bПРЕДУПРЕЖДЕНИЕ\b/g, "WARNING"],
      [/\bЗАМЕТКА\b/g, "NOTE"],
      [/\bАБЗАЦ\b/g, "PARAGRAPH"],
    ];
    let localized = metaReplacements.reduce(
      (current, [pattern, replacement]) => current.replace(pattern, replacement),
      value,
    );
    const replacements: Array<[RegExp, string]> = [
      [/Информационный \/ решение проблемы/g, "Informational / problem solution"],
      [/SEO-хук заголовка и вступления/g, "SEO hook for title and intro"],
      [/Полезные материалы/g, "Helpful resources"],
      [/Технологии/g, "Technology"],
      [/Здоровье и спорт/g, "Health and fitness"],
      [/Бизнес/g, "Business"],
      [/что важно знать/gi, "what to know"],
      [/:\s*НЕТ\b/g, ": no"],
      [/:\s*ДА\b/g, ": yes"],
      [/:\s*нет\b/g, ": no"],
      [/:\s*да\b/g, ": yes"],
      [/Есть инвестиционно чувствительные формулировки\./g, "Investment-sensitive wording was found."],
      [/Есть юридически чувствительные формулировки\./g, "Legally sensitive wording was found."],
      [/Есть медицинские или health-sensitive утверждения\./g, "Medical or health-sensitive claims were found."],
      [/Интернет-сверка и проверка внешних источников не выполнялись в этом локальном анализе\./g, "Internet and external-source verification were not performed by this local analysis."],
      [/Интернет-сверка позже можно подключить отдельным внешним источником\./g, "Internet verification can be connected later through a separate external source."],
      [/^Повторяющиеся термины могут делать текст механическим:\s*/i, "Repeated terms may make the text feel mechanical: "],
      [/^Проверьте, что примеры, термины и глубина объяснения подходят целевому читателю\.$/i, "Check that examples, terminology, and explanation depth fit the intended reader."],
      [/^Это предложение несёт много смыслов сразу и может требовать разделения\.$/i, "This sentence carries many ideas at once and may need splitting."],
      [/^Это слово часто делает фразу механической или канцелярской\.$/i, "This word often makes the sentence sound mechanical or bureaucratic."],
      [/^Тон осторожный и экспертный; оставляйте предупреждения точными, а не оборонительными\.$/i, "The tone is cautious and expert-oriented; keep warnings precise, not defensive."],
      [/^Первый экран даёт достаточно локальных сигналов для полезного превью\.$/i, "The first screen gives enough local signals for a useful preview."],
      [/^В тексте есть несколько чисел или формул: расчёты лучше вынести в отдельную проверку\.$/i, "The text contains several numeric or formula-like fragments; calculations may need a dedicated check."],
      [/^В тексте есть технические или конструкторские утверждения: проверьте их по документации, стандартам, чертежам или у специалиста\.$/i, "The text contains technical or engineering claims that may need expert verification, drawings, standards, or manufacturer documentation."],
      [/^В тексте есть научные или исследовательские утверждения: проверьте методику, источники и расчёты\.$/i, "The text contains research or scientific-method claims that may need methodology, sources, or calculation review."],
      [/^Внешняя проверка источников, правил площадки, страны, SERP или аналитики в этом локальном анализе не выполнялась\.$/i, "External source, jurisdiction, platform, SERP, or analytics verification was not performed by this local text scan."],
      [/^В тексте есть юридически чувствительные формулировки\. Их нельзя подавать как юридическую консультацию без проверки\.$/i, "The text contains legally sensitive claims. It should not be presented as legal advice without review."],
      [/^В тексте есть медицинские или health-sensitive утверждения\. Они не должны заменять проверку врачом или источниками\.$/i, "The text contains medical or health-sensitive claims. It should not replace clinician review or source verification."],
      [/^В тексте есть инвестиционно чувствительные формулировки\. Их нельзя подавать как индивидуальную инвестиционную рекомендацию\.$/i, "The text contains investment-sensitive claims. It should not be presented as personal investment advice."],
      [/^Есть фактически чувствительные утверждения, числа или медицинско-правовые формулировки\. Их нельзя подтверждать только сравнением текстов\. Перепроверьте числа, источники и категоричные утверждения; смягчите то, что нельзя подтвердить уверенно\.$/i, "The text contains fact-sensitive claims, numbers, or medical/legal wording. They cannot be verified by text comparison alone. Recheck numbers, sources, and categorical claims; soften anything that cannot be confirmed with confidence."],
      [/^Fact distortion:\s*Перепроверьте числа, источники и категоричные утверждения; смягчите то, что нельзя подтвердить уверенно\.$/i, "Fact distortion: Recheck numbers, sources, and categorical claims; soften anything that cannot be confirmed with confidence."],
      [/^AI and hallucination check:\s*Расплывчатые ссылки на исследования и экспертов лучше заменить конкретными источниками или убрать\.$/i, "AI and hallucination check: Vague references to research and experts should be replaced with specific sources or removed."],
      [/^Первый хук можно усилить:\s*/i, "The first hook can be stronger: "],
      [/^Начните с проблемы читателя:\s*«Почему\s+([^»]+?)\s+мешает получить результат\?»$/i, "Start with the reader's problem: \"Why $1 blocks the result?\""],
      [/^Начните с проблемы читателя:\s*"Почему\s+([^"]+?)\s+мешает получить результат\?"$/i, "Start with the reader's problem: \"Why $1 blocks the result?\""],
      [/^Начните с проблемы читателя:\s*/i, "Start with the reader's problem: "],
      [/^Покажите обещание пользы в первой строке:\s*что человек пойм[её]т или сможет сделать после чтения\.$/i, "Show the benefit promise in the first line: what the reader will understand or be able to do after reading."],
      [/^Покажите обещание пользы в первой строке:\s*что человек поймет и сможет сделать после чтения\.$/i, "Show the payoff in the first line: what the reader will understand and be able to do after reading."],
      [/^Покажите обещание пользы в первой строке:\s*/i, "Show the benefit promise in the first line: "],
      [/^Если это пост или рилс, вынесите конфликт\/боль в первые 1–2 секунды или первую строку\.$/i, "If this is a post or reel, move the conflict/pain into the first 1-2 seconds or first line."],
      [/^Если это пост или рилс,\s*/i, "If this is a post or reel, "],
      [/: что важно знать\b/gi, ": what to know"],
      [/^Риски запрещённого контента, обхода правил, юридических, медицинских, инвестиционных, технических, научных выводов, расчётов и внешней сверки\.$/i, "Risks around prohibited content, rule evasion, legal, medical, investment, technical, scientific, calculation, and external-source review."],
      [/^Насколько понятно, зачем читать текст, какой интент он закрывает и насколько сильна первая подача\.$/i, "How clearly the text explains why to read it, what intent it satisfies, and how strong the opening presentation is."],
      [/^Сохраните текущий интент и используйте SEO-пакет как черновик для CMS\.$/i, "Keep the current intent and use the SEO package as a CMS draft."],
      [/^Для WordPress \/ Laravel CMS$/i, "For WordPress / Laravel CMS"],
      [/^Описание$/i, "Description"],
      [/^Ключевые слова$/i, "Keywords"],
      [/^Категория \/ метки$/i, "Category / tags"],
      [/^Цепляющие хуки$/i, "Hook ideas"],
    ];
    for (const [pattern, replacement] of replacements) {
      localized = localized.replace(pattern, replacement);
    }
    return localized;
  }
  const replacements: Array<[RegExp, string]> = [
    [/:\s*no\b/gi, ": нет"],
    [/:\s*yes\b/gi, ": да"],
    [/^Risk check$/i, "Проверка риска"],
    [/^Helpful resources$/i, "Полезные материалы"],
    [/^Technology$/i, "Технологии"],
    [/^Health and fitness$/i, "Здоровье и спорт"],
    [/^Business$/i, "Бизнес"],
    [/: what to know\b/gi, ": что важно знать"],
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

function localizeSeoSlug(value: string, isRu: boolean): string {
  if (isRu) return value;
  return value.replace(/chto-vazhno-znat/gi, "what-to-know");
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
  const { t, i18n } = useTranslation();
  const isRu = i18n.language.startsWith("ru");
  const locale = isRu ? "ru" : "en";
  const localizeResultText = (value: string) =>
    localizeArticleCompareUiText(localizeArticleUiText(value, isRu), locale);
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
                  defaultValue: "Key facts",
                })}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {visibleSummary.slice(0, 6).map(([key, value]) => (
                  <span
                    key={key}
                    className="rounded-full border border-orange-200/70 bg-orange-100 px-2.5 py-1 text-xs text-outline-900/75"
                  >
                    {summaryLabel(t, key)}:{" "}
                    {localizeResultText(formatSummaryValue(t, key, value))}
                  </span>
                ))}
              </div>
            </div>
          )}
          {issues.length > 0 && (
            <div className="mt-4 rounded-md border border-orange-200/75 bg-orange-50/90 px-3 py-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-orange-800/75">
                {t("plannedAnalysis.results.findings", {
                  defaultValue: "Findings",
                })}
              </p>
              <ul className="mt-2 space-y-1.5 text-sm leading-relaxed text-outline-900/75">
                {issues.slice(0, 3).map((issue) => (
                  <li key={`${issue.code}-${issue.message}`} className="flex gap-2">
                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/70" />
                    <span>
                      {localizeResultText(textIssueMessage(t, issue))}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {recommendations.length > 0 && (
            <div className="mt-4 rounded-md border border-orange-200/75 bg-orange-100/70 px-3 py-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-orange-800/75">
                {t("plannedAnalysis.results.recommendation", {
                  defaultValue: "What to do",
                })}
              </p>
              <p className="mt-1 text-sm leading-relaxed text-outline-900/70">
                {localizeResultText(textRecommendation(t, toolId, recommendations[0]))}
              </p>
            </div>
          )}
          {visibleSummary.length === 0 &&
            issues.length === 0 &&
            recommendations.length === 0 && (
              <p className="mt-3 text-sm leading-relaxed text-outline-900/55">
                {t("plannedAnalysis.results.noDetails", {
                  defaultValue: "The check completed without extra notes.",
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
      defaultValue: "Healthy",
    });
  }
  if (status === "problem") {
    return t("plannedAnalysis.results.dimensionStatus.problem", {
      defaultValue: "Problem",
    });
  }
  return t("plannedAnalysis.results.dimensionStatus.watch", {
    defaultValue: "Watch",
  });
}

function DimensionCard({
  dimension,
}: {
  dimension: RuntimeArticleTextDimension;
}) {
  const { t, i18n } = useTranslation();
  const isRu = i18n.language.startsWith("ru");
  return (
    <article className={`rounded-lg border p-4 ${dimensionClass(dimension.status)}`}>
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-semibold text-outline-900">
          {localizeArticleUiText(dimension.label, isRu)}
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
        {localizeArticleUiText(dimension.detail, isRu)}
      </p>
      <p className="mt-3 text-xs font-medium leading-relaxed text-outline-900/70">
        {localizeArticleUiText(dimension.recommendation, isRu)}
      </p>
    </article>
  );
}

function PriorityRow({ item }: { item: RuntimeArticleTextPriority }) {
  const { t, i18n } = useTranslation();
  const isRu = i18n.language.startsWith("ru");
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
        <h4 className="text-sm font-semibold text-outline-900">
          {localizeArticleUiText(title, isRu)}
        </h4>
        <span className="shrink-0 rounded-full bg-white/80 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-outline-900/50">
          {priorityUiLabel(t, item.priority)}
        </span>
      </div>
      <p className="mt-1 text-xs leading-relaxed text-outline-900/65">
        {localizeArticleUiText(item.detail, isRu)}
      </p>
    </article>
  );
}

function priorityUiLabel(
  t: ReturnType<typeof useTranslation>["t"],
  priority: RuntimeArticleTextPriority["priority"],
): string {
  if (priority === "high") {
    return t("plannedAnalysis.results.priority.high", { defaultValue: "High" });
  }
  if (priority === "low") {
    return t("plannedAnalysis.results.priority.low", { defaultValue: "Low" });
  }
  return t("plannedAnalysis.results.priority.medium", { defaultValue: "Medium" });
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
      defaultValue: "Done",
    });
  }
  if (status === "running") {
    return t("plannedAnalysis.results.statusRunning", {
      defaultValue: "Running",
    });
  }
  if (status === "error") {
    return t("plannedAnalysis.results.statusError", {
      defaultValue: "Error",
    });
  }
  return t("plannedAnalysis.results.statusPending", {
    defaultValue: "Waiting",
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
      defaultValue: "Topic",
    }),
    analysisRole: t("plannedAnalysis.results.summary.analysisRole", {
      defaultValue: "Role",
    }),
    wordCount: t("plannedAnalysis.results.summary.wordCount", {
      defaultValue: "Words",
    }),
    paragraphCount: t("plannedAnalysis.results.summary.paragraphCount", {
      defaultValue: "Paragraphs",
    }),
    headingCount: t("plannedAnalysis.results.summary.headingCount", {
      defaultValue: "Heading-like lines",
    }),
    hasMarkdown: t("plannedAnalysis.results.summary.hasMarkdown", {
      defaultValue: "Markdown",
    }),
    inferredPlatform: t("plannedAnalysis.results.summary.platform", {
      defaultValue: "Platform",
    }),
    platform: t("plannedAnalysis.results.summary.platform", {
      defaultValue: "Platform",
    }),
    intent: t("plannedAnalysis.results.summary.intent", {
      defaultValue: "Intent",
    }),
    intentLabel: t("plannedAnalysis.results.summary.intentLabel", {
      defaultValue: "Intent type",
    }),
    hookType: t("plannedAnalysis.results.summary.hookType", {
      defaultValue: "Hook type",
    }),
    hookScore: t("plannedAnalysis.results.summary.hookScore", {
      defaultValue: "Hook",
    }),
    ctrPotential: t("plannedAnalysis.results.summary.ctrPotential", {
      defaultValue: "CTR",
    }),
    trendPotential: t("plannedAnalysis.results.summary.trendPotential", {
      defaultValue: "Trend",
    }),
    internetDemandAvailable: t("plannedAnalysis.results.summary.internetDemandAvailable", {
      defaultValue: "Internet demand",
    }),
    internetDemandSource: t("plannedAnalysis.results.summary.internetDemandSource", {
      defaultValue: "Demand source",
    }),
    warningCount: t("plannedAnalysis.results.summary.warningCount", {
      defaultValue: "Warnings",
    }),
    jurisdictionContext: t("plannedAnalysis.results.summary.jurisdictionContext", {
      defaultValue: "Legal context",
    }),
    externalSourcesUsed: t("plannedAnalysis.results.summary.externalSourcesUsed", {
      defaultValue: "External sources",
    }),
    externalVerificationNeeded: t(
      "plannedAnalysis.results.summary.externalVerificationNeeded",
      { defaultValue: "Needs external review" },
    ),
    medicalSignals: t("plannedAnalysis.results.summary.medicalSignals", {
      defaultValue: "Medicine",
    }),
    investmentSignals: t("plannedAnalysis.results.summary.investmentSignals", {
      defaultValue: "Investments",
    }),
    technicalEngineeringSignals: t(
      "plannedAnalysis.results.summary.technicalEngineeringSignals",
      { defaultValue: "Technical / engineering" },
    ),
    detectedStyle: t("plannedAnalysis.results.summary.style", {
      defaultValue: "Style",
    }),
    detectedTone: t("plannedAnalysis.results.summary.tone", {
      defaultValue: "Tone",
    }),
    score: t("plannedAnalysis.results.summary.score", {
      defaultValue: "Score",
    }),
    probability: t("plannedAnalysis.results.summary.probability", {
      defaultValue: "Probability",
    }),
    traceScore: t("plannedAnalysis.results.summary.traceScore", {
      defaultValue: "Trace score",
    }),
    genericSignals: t("plannedAnalysis.results.summary.genericSignals", {
      defaultValue: "Generic phrases",
    }),
    formalSignals: t("plannedAnalysis.results.summary.formalSignals", {
      defaultValue: "Formal phrasing",
    }),
    repeatedTerms: t("plannedAnalysis.results.summary.repeatedTerms", {
      defaultValue: "Repeated terms",
    }),
    sentenceLengthVariance: t("plannedAnalysis.results.summary.sentenceLengthVariance",
      { defaultValue: "Phrase variance" },
    ),
    genericnessScore: t("plannedAnalysis.results.summary.genericnessScore", {
      defaultValue: "Genericness",
    }),
    waterySignals: t("plannedAnalysis.results.summary.waterySignals", {
      defaultValue: "Watery phrases",
    }),
    concreteSignals: t("plannedAnalysis.results.summary.concreteSignals", {
      defaultValue: "Concrete details",
    }),
    authorialSignals: t("plannedAnalysis.results.summary.authorialSignals", {
      defaultValue: "Authorial signals",
    }),
    avgSentenceWords: t("plannedAnalysis.results.summary.avgSentenceWords", {
      defaultValue: "Words per sentence",
    }),
    longSentences: t("plannedAnalysis.results.summary.longSentences", {
      defaultValue: "Long sentences",
    }),
    heavyParagraphs: t("plannedAnalysis.results.summary.heavyParagraphs", {
      defaultValue: "Heavy paragraphs",
    }),
    sentenceCount: t("plannedAnalysis.results.summary.sentenceCount", {
      defaultValue: "Sentences",
    }),
    risk: t("plannedAnalysis.results.summary.risk", {
      defaultValue: "Risk",
    }),
    queueSize: t("plannedAnalysis.results.summary.queueSize", {
      defaultValue: "Claims queued",
    }),
    exactNumbers: t("plannedAnalysis.results.summary.exactNumbers", {
      defaultValue: "Numbers",
    }),
    absoluteClaims: t("plannedAnalysis.results.summary.absoluteClaims", {
      defaultValue: "Absolute claims",
    }),
    vagueAuthorities: t("plannedAnalysis.results.summary.vagueAuthorities", {
      defaultValue: "Vague authorities",
    }),
    sensitiveClaims: t("plannedAnalysis.results.summary.sensitiveClaims", {
      defaultValue: "Sensitive claims",
    }),
    sourceSignals: t("plannedAnalysis.results.summary.sourceSignals", {
      defaultValue: "Sources",
    }),
    uniqueWordRatio: t("plannedAnalysis.results.summary.uniqueWordRatio", {
      defaultValue: "Unique words",
    }),
    duplicateSentenceRate: t("plannedAnalysis.results.summary.duplicates", {
      defaultValue: "Duplicates",
    }),
    suspectedIssues: t("plannedAnalysis.results.summary.suspectedIssues", {
      defaultValue: "Suspected issues",
    }),
    warning: t("plannedAnalysis.results.summary.warning", {
      defaultValue: "Warnings",
    }),
    markers: t("plannedAnalysis.results.summary.markers", {
      defaultValue: "Media markers",
    }),
    suggestedMarkerTypes: t("plannedAnalysis.results.summary.markerTypes", {
      defaultValue: "Media types",
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
  if (typeof value === "boolean") return yesNoLabel(t, value);
  if (typeof value === "string") {
    const localizedValue = localizeArticleUiText(value, false);
    const normalizedValue = localizedValue.trim().toLowerCase();
    if (["yes", "true"].includes(normalizedValue)) return yesNoLabel(t, true);
    if (["no", "false"].includes(normalizedValue)) return yesNoLabel(t, false);
    if (key === "inferredPlatform" || key === "platform") {
      return platformLabel(t, value);
    }
    if (key === "intent" || key === "intentLabel") return intentValueLabel(t, value);
    if (key === "hookType") return hookTypeLabel(t, value);
    if (key === "jurisdictionContext") return jurisdictionContextLabel(t, value);
    if (key === "detectedStyle") return styleLabel(t, value);
    if (key === "detectedTone") return toneLabel(t, value);
    if (key === "action") return actionLabel(t, value);
    if (key === "dominantScript") return scriptLabel(t, value);
    if (key === "method") return methodLabel(t, value);
    return localizedValue;
  }
  return "-";
}

function yesNoLabel(
  t: ReturnType<typeof useTranslation>["t"],
  value: boolean,
): string {
  return value
    ? t("common.yes", { defaultValue: "yes" })
    : t("common.no", { defaultValue: "no" });
}

function platformLabel(
  t: ReturnType<typeof useTranslation>["t"],
  key: string,
): string {
  const labels: Record<string, string> = {
    site_article: t("plannedAnalysis.platformLabels.site_article", {
      defaultValue: "Site article",
    }),
    markdown_article: t("plannedAnalysis.platformLabels.markdown_article", {
      defaultValue: "Markdown article",
    }),
    short_social_post: t("plannedAnalysis.platformLabels.short_social_post", {
      defaultValue: "Short post",
    }),
    short_article_or_long_social_post: t("plannedAnalysis.platformLabels.short_article_or_long_social_post",
      { defaultValue: "Short article or long post" },
    ),
    x_short: t("plannedAnalysis.platforms.xShort", { defaultValue: "X / Twitter short post" }),
    x_long: t("plannedAnalysis.platforms.xLong", { defaultValue: "X / Twitter long post" }),
    facebook: t("plannedAnalysis.platforms.facebook", { defaultValue: "Facebook" }),
    linkedin: t("plannedAnalysis.platforms.linkedin", { defaultValue: "LinkedIn" }),
    habr: t("plannedAnalysis.platforms.habr", { defaultValue: "Habr" }),
    reddit: t("plannedAnalysis.platforms.reddit", { defaultValue: "Reddit" }),
    custom: t("plannedAnalysis.platforms.custom", { defaultValue: "Custom" }),
  };
  return labels[key] ?? key;
}

function intentValueLabel(
  t: ReturnType<typeof useTranslation>["t"],
  key: string,
): string {
  const normalizedKey = localizeArticleUiText(key, false);
  const labels: Record<string, string> = {
    informational_how_to: t("plannedAnalysis.intentValues.informationalHowTo", {
      defaultValue: "Informational / problem solution",
    }),
    commercial: t("plannedAnalysis.intentValues.commercial", {
      defaultValue: "Commercial",
    }),
    expert_opinion: t("plannedAnalysis.intentValues.expertOpinion", {
      defaultValue: "Expert opinion",
    }),
    social_engagement: t("plannedAnalysis.intentValues.socialEngagement", {
      defaultValue: "Social engagement",
    }),
    informational: t("plannedAnalysis.intentValues.informational", {
      defaultValue: "Informational",
    }),
    informational_problem_solution: t("plannedAnalysis.intentValues.problemSolution", {
      defaultValue: "Informational / problem solution",
    }),
    "Informational / problem solution": t("plannedAnalysis.intentValues.problemSolution", {
      defaultValue: "Informational / problem solution",
    }),
    educational_guide: t("plannedAnalysis.intentValues.educationalGuide", {
      defaultValue: "Educational material",
    }),
    opinion_discussion: t("plannedAnalysis.intentValues.opinionDiscussion", {
      defaultValue: "Opinion / discussion",
    }),
    promotion_or_conversion: t("plannedAnalysis.intentValues.promotionConversion", {
      defaultValue: "Promotion / conversion",
    }),
  };
  return labels[normalizedKey] ?? labels[key] ?? normalizedKey;
}

function hookTypeLabel(
  t: ReturnType<typeof useTranslation>["t"],
  key: string,
): string {
  const normalizedKey = localizeArticleUiText(key, false);
  const labels: Record<string, string> = {
    question_problem: t("plannedAnalysis.hookTypes.questionProblem", {
      defaultValue: "Question / problem",
    }),
    statement: t("plannedAnalysis.hookTypes.statement", {
      defaultValue: "Direct claim",
    }),
    list_or_steps: t("plannedAnalysis.hookTypes.listSteps", {
      defaultValue: "List / steps",
    }),
    story_context: t("plannedAnalysis.hookTypes.storyContext", {
      defaultValue: "Story / context",
    }),
    weak_or_missing: t("plannedAnalysis.hookTypes.weakMissing", {
      defaultValue: "Weak or missing",
    }),
    "problem-solution": t("plannedAnalysis.hookTypes.problemSolution", {
      defaultValue: "SEO hook for title and intro",
    }),
    problem_solution: t("plannedAnalysis.hookTypes.problemSolution", {
      defaultValue: "SEO hook for title and intro",
    }),
    "SEO hook for title and intro": t("plannedAnalysis.hookTypes.problemSolution", {
      defaultValue: "SEO hook for title and intro",
    }),
  };
  return labels[normalizedKey] ?? labels[key] ?? normalizedKey;
}

function jurisdictionContextLabel(
  t: ReturnType<typeof useTranslation>["t"],
  key: string,
): string {
  const labels: Record<string, string> = {
    ru_language_assumed: t("plannedAnalysis.jurisdiction.ruLanguageAssumed", {
      defaultValue: "Russian language: applicable country needs review",
    }),
    ru_law_context: t("plannedAnalysis.jurisdiction.ruLawContext", {
      defaultValue: "Likely Russian legal context",
    }),
    ru_language_international_platform: t(
      "plannedAnalysis.jurisdiction.ruLanguageInternationalPlatform",
      {
        defaultValue: "Russian text for an international platform: platform and publication-country rules are needed",
      },
    ),
    platform_rules_first: t("plannedAnalysis.jurisdiction.platformRulesFirst", {
      defaultValue: "Check platform rules first",
    }),
    unspecified: t("plannedAnalysis.jurisdiction.unspecified", {
      defaultValue: "Country and rules are unknown",
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
      defaultValue: "Fits a long-form article with a title, sections, and search intent.",
    }),
    markdown_article: t("plannedAnalysis.platformDetails.markdown_article", {
      defaultValue: "The text looks like a Markdown article; preserve heading structure.",
    }),
    short_social_post: t("plannedAnalysis.platformDetails.short_social_post", {
      defaultValue: "Looks like a short post: a title is usually unnecessary, while clarity and fast meaning matter.",
    }),
    short_article_or_long_social_post: t("plannedAnalysis.platformDetails.short_article_or_long_social_post",
      {
        defaultValue: "Sits between article and long-post formats; packaging depends on the publishing platform.",
      },
    ),
  };
  return details[key] ??
    t("plannedAnalysis.platformDetails.default", {
      defaultValue: "The format is inferred from the current text and selected tools.",
    });
}

function styleLabel(t: ReturnType<typeof useTranslation>["t"], key: string): string {
  const labels: Record<string, string> = {
    personal: t("plannedAnalysis.styles.personal", { defaultValue: "Personal" }),
    analytical: t("plannedAnalysis.styles.analytical", { defaultValue: "Analytical" }),
    educational: t("plannedAnalysis.styles.educational", { defaultValue: "Educational" }),
    business: t("plannedAnalysis.styles.business", { defaultValue: "Business" }),
    informational: t("plannedAnalysis.styles.informational", { defaultValue: "Informational" }),
  };
  return labels[key] ?? key;
}

function toneLabel(t: ReturnType<typeof useTranslation>["t"], key: string): string {
  const labels: Record<string, string> = {
    cautious_expert: t("plannedAnalysis.tones.cautiousExpert", {
      defaultValue: "Cautious expert",
    }),
    energetic: t("plannedAnalysis.tones.energetic", { defaultValue: "Energetic" }),
    personal: t("plannedAnalysis.tones.personal", { defaultValue: "Personal" }),
    neutral_explaining: t("plannedAnalysis.tones.neutralExplaining", {
      defaultValue: "Neutral explaining",
    }),
  };
  return labels[key] ?? key;
}

function actionLabel(t: ReturnType<typeof useTranslation>["t"], key: string): string {
  if (key === "solution") {
    return t("plannedAnalysis.actionLabels.solution", {
      defaultValue: "Suggest solution",
    });
  }
  return t("plannedAnalysis.actionLabels.scan", {
    defaultValue: "Scan text",
  });
}

function scriptLabel(t: ReturnType<typeof useTranslation>["t"], key: string): string {
  if (key === "cyrillic") {
    return t("plannedAnalysis.scriptLabels.cyrillic", { defaultValue: "Cyrillic" });
  }
  if (key === "latin") {
    return t("plannedAnalysis.scriptLabels.latin", { defaultValue: "Latin" });
  }
  return key;
}

function methodLabel(t: ReturnType<typeof useTranslation>["t"], key: string): string {
  const labels: Record<string, string> = {
    local_repetition_risk: t("plannedAnalysis.methodLabels.local_repetition_risk", {
      defaultValue: "Local repetition",
    }),
    heuristic_style_probability: t("plannedAnalysis.methodLabels.heuristic_style_probability",
      { defaultValue: "AI-style heuristic" },
    ),
    claim_risk_heuristic: t("plannedAnalysis.methodLabels.claim_risk_heuristic", {
      defaultValue: "Claim-risk heuristic",
    }),
    internal_logic_heuristic: t("plannedAnalysis.methodLabels.internal_logic_heuristic", {
      defaultValue: "Internal logic",
    }),
    ai_claim_hallucination_heuristic: t("plannedAnalysis.methodLabels.ai_claim_hallucination_heuristic",
      { defaultValue: "AI-detail risk" },
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
      defaultValue: "Notes and recommendations found",
    });
  }
  if (styleCount > 0) {
    return t("plannedAnalysis.results.annotationStatus.styleIssues", {
      defaultValue: "Style issues found",
    });
  }
  if (recommendationCount > 0) {
    return t("plannedAnalysis.results.annotationStatus.recommendations", {
      defaultValue: "Recommendations found",
    });
  }
  return t("plannedAnalysis.results.annotationStatus.almostClean", {
    defaultValue: "Almost no notes or recommendations",
  });
}

function annotationKindLabel(
  t: ReturnType<typeof useTranslation>["t"],
  kind: RuntimeArticleTextAnnotation["kind"],
): string {
  if (kind === "issue") {
    return t("plannedAnalysis.results.annotationKinds.issue", {
      defaultValue: "Issue",
    });
  }
  if (kind === "style") {
    return t("plannedAnalysis.results.annotationKinds.style", {
      defaultValue: "Style",
    });
  }
  if (kind === "note") {
    return t("plannedAnalysis.results.annotationKinds.note", {
      defaultValue: "Note",
    });
  }
  return t("plannedAnalysis.results.annotationKinds.recommendation", {
    defaultValue: "Recommendation",
  });
}

function textIssueMessage(
  t: ReturnType<typeof useTranslation>["t"],
  issue: TextIssueResult,
): string {
  const labels: Record<string, string> = {
    thin_text: t("plannedAnalysis.results.issueMessages.thin_text", {
      defaultValue: "The text is short for a search-oriented article; expand the useful answer before optimizing.",
    }),
    low_paragraph_structure: t("plannedAnalysis.results.issueMessages.low_paragraph_structure",
      {
        defaultValue: "The text has too few clear paragraphs, which makes scanning harder.",
      },
    ),
    weak_heading_structure: t("plannedAnalysis.results.issueMessages.weak_heading_structure",
      {
        defaultValue: "Add clear sections or subheadings so structure is easier to read.",
      },
    ),
    long_sentences: t("plannedAnalysis.results.issueMessages.long_sentences", {
      defaultValue: "Average sentence length is high; split dense phrases.",
    }),
    formal_phrasing: t("plannedAnalysis.results.issueMessages.formal_phrasing", {
      defaultValue: "The text contains formal or mechanical phrasing; make key explanations more direct.",
    }),
    tone_review: t("plannedAnalysis.results.issueMessages.tone_review", {
      defaultValue: "Keep tone aligned with topic risk: caveats should help the reader without weighing down every paragraph.",
    }),
    audience_fit: t("plannedAnalysis.results.issueMessages.audience_fit", {
      defaultValue: "Check that examples, terminology, and explanation level fit the intended reader.",
    }),
    media_markers_present: t("plannedAnalysis.results.issueMessages.media_markers_present",
      {
        defaultValue: "Media markers are already present in the body; keep them near the relevant explanation.",
      },
    ),
    no_media_markers: t("plannedAnalysis.results.issueMessages.no_media_markers", {
      defaultValue: "No media markers were found. Add them only where image, video, animation, or audio improves understanding.",
    }),
    uniqueness_risk: t("plannedAnalysis.results.issueMessages.uniqueness_risk", {
      defaultValue: "The text has local repetition or duplicate-pattern risk. This is not an internet plagiarism check.",
    }),
    duplicate_sentences: t("plannedAnalysis.results.issueMessages.duplicate_sentences", {
      defaultValue: "Some sentences repeat almost exactly inside the article.",
    }),
    syntax_risk: t("plannedAnalysis.results.issueMessages.syntax_risk", {
      defaultValue: "The text has visible syntax or punctuation risks that should be checked before publishing.",
    }),
    dense_sentences: t("plannedAnalysis.results.issueMessages.dense_sentences", {
      defaultValue: "Several sentences are dense; grammar may be correct, but readability suffers.",
    }),
    ai_style_probability: t("plannedAnalysis.results.issueMessages.ai_style_probability",
      {
        defaultValue: "The text has AI-style signals: generic transitions, uniform rhythm, or repeated words.",
      },
    ),
    fact_distortion_risk: t("plannedAnalysis.results.issueMessages.fact_distortion_risk",
      {
        defaultValue: "The text contains fact-sensitive claims that may need source verification before publication.",
      },
    ),
    absolute_claims: t("plannedAnalysis.results.issueMessages.absolute_claims", {
      defaultValue: "Absolute wording can distort meaning when the text does not prove the claim.",
    }),
    sensitive_claims_without_sources: t("plannedAnalysis.results.issueMessages.sensitive_claims_without_sources",
      {
        defaultValue: "Medical, legal, financial, or technical claims should be supported by sources or cautious wording.",
      },
    ),
    possible_internal_contradiction: t("plannedAnalysis.results.issueMessages.possible_internal_contradiction",
      { defaultValue: "The text may contain statements that pull conclusions in different directions." },
    ),
    unsupported_causality: t("plannedAnalysis.results.issueMessages.unsupported_causality",
      {
        defaultValue: "Some cause-and-effect transitions may need examples, data, or intermediate reasoning.",
      },
    ),
    hallucination_risk: t("plannedAnalysis.results.issueMessages.hallucination_risk", {
      defaultValue: "Factual details created or processed by AI may need verification.",
    }),
    ai_trace_map_risk: t("plannedAnalysis.results.issueMessages.ai_trace_map_risk", {
      defaultValue: "Several fragments look AI-assisted: generic transitions, formal wording, repetition, or overly even rhythm.",
    }),
    generic_watery_text: t("plannedAnalysis.results.issueMessages.generic_watery_text", {
      defaultValue: "The text may feel watery: it uses broad statements or service phrases instead of concrete evidence.",
    }),
    low_concrete_evidence: t("plannedAnalysis.results.issueMessages.low_concrete_evidence", {
      defaultValue: "The article has few examples, numbers, sources, cases, or practical details for its length.",
    }),
    readability_complexity_risk: t("plannedAnalysis.results.issueMessages.readability_complexity_risk",
      {
        defaultValue: "Dense sentences or heavy paragraphs make the text harder to read than it needs to be.",
      },
    ),
    heavy_paragraphs: t("plannedAnalysis.results.issueMessages.heavy_paragraphs", {
      defaultValue: "One or more paragraphs are heavy enough to slow scanning.",
    }),
    claim_source_queue: t("plannedAnalysis.results.issueMessages.claim_source_queue", {
      defaultValue: "Some claims should enter an editor's source-check queue before publication.",
    }),
    vague_authorities: t("plannedAnalysis.results.issueMessages.vague_authorities", {
      defaultValue: "Phrases like \"experts say\" or \"studies show\" should point to a concrete source.",
    }),
    low_ctr_potential: t("plannedAnalysis.results.issueMessages.low_ctr_potential", {
      defaultValue: "The title or opening does not yet create enough click or reading motivation.",
    }),
    weak_hook: t("plannedAnalysis.results.issueMessages.weak_hook", {
      defaultValue: "The opening hook can be stronger: show the reader problem, conflict, or clear benefit earlier.",
    }),
    unsafe_or_evasion_intent: t("plannedAnalysis.results.issueMessages.unsafe_or_evasion_intent",
      {
        defaultValue: "The text may contain unsafe or rule-evasion intent and needs manual review.",
      },
    ),
    legal_review_needed: t("plannedAnalysis.results.issueMessages.legal_review_needed", {
      defaultValue: "The text contains legally sensitive claims. It should not be presented as legal advice without review.",
    }),
    medical_review_needed: t("plannedAnalysis.results.issueMessages.medical_review_needed", {
      defaultValue: "The text contains medical or health-sensitive claims. It should not replace clinician review or source verification.",
    }),
    investment_review_needed: t("plannedAnalysis.results.issueMessages.investment_review_needed",
      {
        defaultValue: "The text contains investment-sensitive claims. It should not be presented as personal investment advice.",
      },
    ),
    technical_engineering_review_needed: t("plannedAnalysis.results.issueMessages.technical_engineering_review_needed",
      {
        defaultValue: "The text contains technical or engineering claims that may need expert verification, drawings, standards, or manufacturer documentation.",
      },
    ),
    scientific_review_needed: t("plannedAnalysis.results.issueMessages.scientific_review_needed",
      {
        defaultValue: "The text contains research or scientific-method claims that may need methodology, sources, or calculation review.",
      },
    ),
    calculation_review_needed: t("plannedAnalysis.results.issueMessages.calculation_review_needed",
      {
        defaultValue: "The text contains several numeric or formula-like fragments; calculations may need a dedicated check.",
      },
    ),
    custom_resource_rules_needed: t("plannedAnalysis.results.issueMessages.custom_resource_rules_needed",
      {
        defaultValue: "A custom platform or resource may require manual rule verification.",
      },
    ),
    external_verification_needed: t("plannedAnalysis.results.issueMessages.external_verification_needed",
      {
        defaultValue: "External source, jurisdiction, platform, SERP, or analytics verification was not performed by this local text scan.",
      },
    ),
    repeated_terms: issue.message.replace(
      /^Repeated terms may make the text feel mechanical:?\s*/i,
      `${t("plannedAnalysis.results.issueMessages.repeated_termsPrefix", {
        defaultValue: "Repeated terms may make the text feel mechanical:",
      }).replace(/:?\s*$/, ": ")}`
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
      defaultValue: "Keep platform metadata separate from the body: title, description, tags, and preview text.",
    }),
    analyze_text_structure: t("plannedAnalysis.results.recommendations.structure", {
      defaultValue: "Use one clear main title and group sections by intent.",
    }),
    analyze_text_style: t("plannedAnalysis.results.recommendations.style", {
      defaultValue: "Add concrete verbs, shorter sentences, and examples where the reader may hesitate.",
    }),
    analyze_tone_fit: t("plannedAnalysis.results.recommendations.tone", {
      defaultValue: "Use caveats precisely: they should protect the reader without making the whole text defensive.",
    }),
    language_audience_fit: t("plannedAnalysis.results.recommendations.audience", {
      defaultValue: "Name the target reader in the introduction when the topic can serve several audiences.",
    }),
    media_placeholder_review: t("plannedAnalysis.results.recommendations.media", {
      defaultValue: "Place media markers inside relevant sections, not at the end of the text.",
    }),
    article_uniqueness: t("plannedAnalysis.results.recommendations.uniqueness", {
      defaultValue: "Rewrite repeated fragments with new examples, narrower claims, or clearer transitions.",
    }),
    language_syntax: t("plannedAnalysis.results.recommendations.syntax", {
      defaultValue: "Run a final human pass for punctuation, sentence boundaries, and overloaded phrases.",
    }),
    ai_writing_probability: t("plannedAnalysis.results.recommendations.ai", {
      defaultValue: "To sound more authorial, add specific examples, context, and more varied sentence rhythm.",
    }),
    ai_trace_map: t("plannedAnalysis.results.recommendations.aiTrace", {
      defaultValue: "Use the trace map as an editing guide: replace generic transitions with examples, sources, or sharper author judgment.",
    }),
    genericness_water_check: t("plannedAnalysis.results.recommendations.genericness", {
      defaultValue: "Turn broad paragraphs into useful ones by adding a concrete example, source, number, or reader action.",
    }),
    readability_complexity: t("plannedAnalysis.results.recommendations.readabilityComplexity",
      {
        defaultValue: "Shorten dense sentences and split heavy paragraphs before polishing style.",
      },
    ),
    claim_source_queue: t("plannedAnalysis.results.recommendations.claimQueue", {
      defaultValue: "Verify queued claims against sources; if a source is weak, soften or remove the claim.",
    }),
    naturalness_indicators: t("plannedAnalysis.results.recommendations.naturalness", {
      defaultValue: "Vary sentence openings and remove service phrases that do not add meaning.",
    }),
    logic_consistency_check: t("plannedAnalysis.results.recommendations.logic", {
      defaultValue: "Check places with “therefore”, “because”, “always”, and “never”; they need enough support.",
    }),
    fact_distortion_check: t("plannedAnalysis.results.recommendations.facts", {
      defaultValue: "Verify numbers, names, and sensitive claims; soften statements that cannot be supported confidently.",
    }),
    ai_hallucination_check: t("plannedAnalysis.results.recommendations.hallucination", {
      defaultValue: "Replace vague authorities with concrete sources or remove details that cannot be verified.",
    }),
    intent_seo_forecast: t("plannedAnalysis.results.recommendations.intentSeo", {
      defaultValue: "Strengthen the first line, clear reader benefit, and SEO package before publishing.",
    }),
    safety_science_review: t("plannedAnalysis.results.recommendations.safetyScience", {
      defaultValue: "Check legal, medical, investment, technical, scientific, and country-sensitive areas with experts, platform rules, or official sources.",
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
  if (topic?.trim() && !/^https?:\/\//i.test(topic.trim())) {
    return { title: topic.trim(), titleNote: null };
  }
  const titleCandidate = firstExplicitArticleTitleLine(text, 120);
  if (titleCandidate && platformKey !== "short_social_post") {
    return { title: titleCandidate, titleNote: null };
  }
  return {
    title: t("plannedAnalysis.results.untitled", { defaultValue: "Untitled" }),
    titleNote:
      platformKey === "short_social_post"
        ? null
        : t("plannedAnalysis.results.titleMissingNote", {
            defaultValue: "No title was found in the text. A future AI layer can suggest one beside the heading.",
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
      defaultValue: "Detects the publishing platform and context.",
    }),
    analyze_text_structure: t("plannedAnalysis.results.descriptions.structure", {
      defaultValue: "Checks headings, paragraphs, and article structure.",
    }),
    analyze_text_style: t("plannedAnalysis.results.descriptions.style", {
      defaultValue: "Detects text style and weak spots.",
    }),
    analyze_tone_fit: t("plannedAnalysis.results.descriptions.tone", {
      defaultValue: "Reviews whether the tone fits the topic and audience.",
    }),
    language_audience_fit: t("plannedAnalysis.results.descriptions.audience", {
      defaultValue: "Checks language, audience, and explanation level.",
    }),
    media_placeholder_review: t("plannedAnalysis.results.descriptions.media", {
      defaultValue: "Checks where and how media markers are placed.",
    }),
    article_uniqueness: t("plannedAnalysis.results.descriptions.uniqueness", {
      defaultValue: "Estimates local repetition and template risk.",
    }),
    language_syntax: t("plannedAnalysis.results.descriptions.syntax", {
      defaultValue: "Checks syntax and clear language risks.",
    }),
    ai_writing_probability: t("plannedAnalysis.results.descriptions.ai", {
      defaultValue: "Estimates AI-style signals in the text.",
    }),
    ai_trace_map: t("plannedAnalysis.results.descriptions.aiTrace", {
      defaultValue: "Maps local AI-like fragments without claiming authorship proof.",
    }),
    genericness_water_check: t("plannedAnalysis.results.descriptions.genericness", {
      defaultValue: "Checks whether the text is too broad, watery, or template-like.",
    }),
    readability_complexity: t("plannedAnalysis.results.descriptions.readabilityComplexity", {
      defaultValue: "Checks sentence density and heavy paragraphs.",
    }),
    claim_source_queue: t("plannedAnalysis.results.descriptions.claimQueue", {
      defaultValue: "Queues claims that need source verification.",
    }),
    naturalness_indicators: t("plannedAnalysis.results.descriptions.naturalness", {
      defaultValue: "Looks for mechanical phrasing and repetition.",
    }),
    logic_consistency_check: t("plannedAnalysis.results.descriptions.logic", {
      defaultValue: "Checks contradictions and reasoning jumps.",
    }),
    intent_seo_forecast: t("plannedAnalysis.results.descriptions.intent", {
      defaultValue: "Evaluates intent, opening pitch, and SEO package.",
    }),
    safety_science_review: t("plannedAnalysis.results.descriptions.safety", {
      defaultValue: "Finds legal, medical, scientific, and technical risks.",
    }),
    fact_distortion_check: t("plannedAnalysis.results.descriptions.facts", {
      defaultValue: "Looks for disputed facts and overconfident claims.",
    }),
    ai_hallucination_check: t("plannedAnalysis.results.descriptions.hallucination", {
      defaultValue: "Looks for invented details and AI hallucination signals.",
    }),
  };
  return descriptions[toolId] ??
    t("plannedAnalysis.results.descriptions.default", {
      defaultValue: "ToraSEO text check.",
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
    return "Technology";
  }
  if (/здоров|организм|диабет|трениров|питани|медиц|гликоген|глюкоз|углевод|спорт|упражнен|health|diet|fitness/i.test(joined)) {
    return "Health and fitness";
  }
  if (/бизнес|продаж|маркет|клиент|conversion|sales/i.test(joined)) {
    return "Business";
  }
  return "Helpful resources";
}

function inferSeoTitleFromInput(text: string, topic?: string): string {
  const topicTitle = topic?.trim() ?? "";
  if (topicTitle && !/^https?:\/\//i.test(topicTitle) && !isServiceSeoValue(topicTitle)) {
    return topicTitle;
  }
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
  if (/гликоген|glycogen/u.test(lowered) && /трениров|упражнен|нагруз|training|exercise|workout/u.test(lowered)) {
    return "Glycogen recovery after training";
  }
  if (/glycogen/i.test(text) && /training|exercise|workout/i.test(text)) {
    return "Glycogen recovery after training";
  }
  if (keywords.length >= 3) {
    return `${capitalizeTitleStart(keywords.slice(0, 3).join(" "))}: what to know`;
  }
  if (keywords[0]) return `${capitalizeTitleStart(keywords[0])}: what to know`;
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
        defaultValue: "This metric looks strong across the current analysis tools.",
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
  const aiTraceScore = metricValue(state, "ai_trace_map", "traceScore");
  const genericnessScore = metricValue(
    state,
    "genericness_water_check",
    "genericnessScore",
  );
  const readabilityScore = metricValue(state, "readability_complexity", "score");
  const claimQueueRisk = metricValue(state, "claim_source_queue", "risk");
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
        defaultValue: "Safety and review",
      }),
      status: dimensionStatus([
        warningCount > 1 ? "problem" : warningCount > 0 ? "watch" : "healthy",
        entryStatus(state, "safety_science_review"),
      ]),
      detail: t("plannedAnalysis.results.dimensions.safetyDetail", {
        defaultValue: "Risks around prohibited content, rule evasion, legal, medical, investment, technical, scientific, calculation, and external-source review.",
      }),
      recommendation:
        warningCount > 0
          ? t("plannedAnalysis.results.dimensions.safetyFix", {
              defaultValue: "Review warnings before publishing; AI does not replace a lawyer, doctor, investment adviser, engineer, scientific expert, or manual source check.",
            })
          : t("plannedAnalysis.results.dimensions.safetyKeep", {
              defaultValue: "No blocking safety or expert-review warnings were found.",
            }),
      sourceToolIds: ["safety_science_review"],
    },
    {
      id: "intent",
      label: t("plannedAnalysis.results.dimensions.intent", {
        defaultValue: "Intent and promotion",
      }),
      status: dimensionStatus([
        scoreStatus(intentForecast?.ctrPotential ?? null, false),
        scoreStatus(intentForecast?.hookScore ?? null, false),
      ]),
      detail: t("plannedAnalysis.results.dimensions.intentDetail", {
        defaultValue: "How clearly the text explains why to read it, what intent it satisfies, and how strong the opening presentation is.",
      }),
      recommendation:
        intentForecast && (intentForecast.ctrPotential ?? 0) >= 70
          ? t("plannedAnalysis.results.dimensions.intentKeep", {
              defaultValue: "Keep the current intent and use the SEO package as a CMS draft.",
            })
          : t("plannedAnalysis.results.dimensions.intentFix", {
              defaultValue: "Strengthen the first line, reader benefit, and SEO title before publishing.",
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
        scoreStatus(aiTraceScore, true),
        scoreStatus(genericnessScore, true),
        naturalnessWarnings >= 2
          ? "problem"
          : naturalnessWarnings >= 1
            ? "watch"
            : "healthy",
      ]),
      detail: t("plannedAnalysis.results.dimensions.originalityDetail", {
        defaultValue: "Local repetition, template risk, naturalness, and AI-style signals.",
      }),
      recommendation:
        uniqueness !== null && uniqueness < 80
          ? t("plannedAnalysis.results.dimensions.originalityFix", {
              defaultValue: "Rewrite repeated fragments with fresher examples and less uniform phrasing.",
            })
          : t("plannedAnalysis.results.dimensions.originalityKeep", {
              defaultValue: "Keep the specific examples and avoid adding generic filler in later edits.",
            }),
      sourceToolIds: [
        "article_uniqueness",
        "ai_writing_probability",
        "ai_trace_map",
        "genericness_water_check",
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
        scoreStatus(readabilityScore, false),
        entryStatus(state, "analyze_text_structure"),
        entryStatus(state, "analyze_text_style"),
      ]),
      detail: t("plannedAnalysis.results.dimensions.clarityDetail", {
        defaultValue: "Syntax, sentence density, structure, headings, and scanability.",
      }),
      recommendation:
        syntax !== null && syntax < 80
          ? t("plannedAnalysis.results.dimensions.clarityFix", {
              defaultValue: "Shorten dense sentences and add clearer section breaks before polishing style.",
            })
          : t("plannedAnalysis.results.dimensions.clarityKeep", {
              defaultValue: "Use the current structure as the base and polish only the weak sections.",
            }),
      sourceToolIds: [
        "language_syntax",
        "readability_complexity",
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
        defaultValue: "Internal contradictions, weak transitions, and unsupported conclusions.",
      }),
      recommendation:
        logicScore !== null && logicScore < 80
          ? t("plannedAnalysis.results.dimensions.logicFix", {
              defaultValue: "Add missing intermediate reasoning where the text jumps from claim to conclusion.",
            })
          : t("plannedAnalysis.results.dimensions.logicKeep", {
              defaultValue: "Preserve the current argument chain and verify new claims after editing.",
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
        scoreStatus(claimQueueRisk, true),
      ]),
      detail: t("plannedAnalysis.results.dimensions.trustDetail", {
        defaultValue: "Fact-sensitive claims, vague authorities, exact numbers, and hallucination risk.",
      }),
      recommendation:
        state.buffer.fact_distortion_check || state.buffer.ai_hallucination_check
          ? t("plannedAnalysis.results.dimensions.trustFix", {
              defaultValue: "Verify exact numbers and soften claims that are not supported by concrete evidence.",
            })
          : t("plannedAnalysis.results.dimensions.trustOptional", {
              defaultValue: "Run optional trust checks for claim-heavy medical, legal, finance, or technical articles.",
            }),
      sourceToolIds: [
        "fact_distortion_check",
        "ai_hallucination_check",
        "claim_source_queue",
      ],
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
        defaultValue: "Publishing context, tone, audience, language, and media placement.",
      }),
      recommendation:
        entryStatus(state, "media_placeholder_review") !== "healthy"
          ? t("plannedAnalysis.results.dimensions.platformFix", {
              defaultValue: "Add media markers only where they clarify the article, not as decoration.",
            })
          : t("plannedAnalysis.results.dimensions.platformKeep", {
              defaultValue: "Keep platform-specific packaging separate from the article body.",
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
          defaultValue: "Local repetition and template-risk estimate. This is not an internet plagiarism check.",
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
          defaultValue: "Shows punctuation, sentence-boundary, and overloaded-phrase risk.",
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
          defaultValue: "Uses AI-style signals: rhythm, templates, and mechanical repetition. This is not proof of authorship.",
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
          defaultValue: "Shows text coherence, contradictions, conclusion jumps, and weak cause-and-effect transitions.",
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
          defaultValue: "Shows mechanical phrasing, repetition, and uniform-rhythm risk.",
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

function buildArticleTextToraRank(
  articleSummary: RuntimeArticleTextSummary,
): ToraRankResult {
  const defaultToolDepth = 15;
  const extendedToolDepth = 19;
  const metric = (id: string) =>
    articleSummary.metrics.find((item) => item.id === id)?.value ?? null;
  const normalMetricIds = ["uniqueness", "syntax", "logic", "naturalness"];
  const normalSignals = normalMetricIds
    .map(metric)
    .filter((value): value is number => typeof value === "number");
  const aiProbability = metric("ai");
  const inverseSignals =
    typeof aiProbability === "number" ? [100 - aiProbability] : [];
  const forecast = articleSummary.intentForecast;
  const intentSignals = [
    forecast?.hookScore ?? null,
    forecast?.ctrPotential ?? null,
    forecast?.trendPotential ?? null,
  ].filter((value): value is number => typeof value === "number");
  const qualitySignals = [...normalSignals, ...inverseSignals, ...intentSignals];
  const qualityScore =
    qualitySignals.length > 0
      ? qualitySignals.reduce((sum, value) => sum + value, 0) /
        qualitySignals.length
      : 50;
  const healthyDimensions = articleSummary.dimensions.filter(
    (dimension) => dimension.status === "healthy",
  ).length;
  const watchDimensions = articleSummary.dimensions.filter(
    (dimension) => dimension.status === "watch",
  ).length;
  const problemDimensions = articleSummary.dimensions.filter(
    (dimension) => dimension.status === "problem",
  ).length;
  const highPriorities = articleSummary.priorities.filter(
    (priority) => priority.priority === "high",
  ).length;
  const mediumPriorities = articleSummary.priorities.filter(
    (priority) => priority.priority === "medium",
  ).length;
  const completedDepth = Math.min(
    1,
    articleSummary.coverage.completed / defaultToolDepth,
  );
  const selectedDepth = Math.min(
    1,
    articleSummary.coverage.total / defaultToolDepth,
  );
  const toolDepth = Math.min(completedDepth, selectedDepth);
  const extendedDepth = Math.min(
    1,
    articleSummary.coverage.completed / extendedToolDepth,
  );
  const evidenceCeiling = Math.round(1600 + toolDepth * 5200 + extendedDepth * 700);
  const positiveSignals = Math.round(
    qualityScore * 36 + healthyDimensions * 220 + intentSignals.length * 120,
  );
  const penaltySignals = Math.round(
    problemDimensions * 520 +
      watchDimensions * 210 +
      highPriorities * 430 +
      mediumPriorities * 160 +
      articleSummary.warningCount * 140,
  );
  const verdictGate =
    articleSummary.verdict === "high_risk"
      ? 0.72
      : articleSummary.verdict === "needs_revision"
        ? 0.86
        : 1;
  const rawValue =
    (qualityScore / 100) * evidenceCeiling * verdictGate +
    positiveSignals -
    penaltySignals;
  const value = Math.max(
    250,
    Math.min(evidenceCeiling, Math.round(rawValue / 10) * 10),
  );

  return {
    value,
    displayValue: new Intl.NumberFormat(undefined).format(value),
    qualityScore: Math.round(qualityScore),
    positiveSignals,
    penaltySignals,
    evidenceCeiling,
    toolDepth: Math.round(toolDepth * 100),
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
      defaultValue: "The available tool evidence does not show blocking problems. Final human review is still recommended.",
    });
  }
  if (verdict === "high_risk") {
    return t("plannedAnalysis.results.verdict.highRiskDetail", {
      defaultValue: "One or more core dimensions need attention. Check warnings and priority items before publishing.",
    });
  }
  if (coveragePercent < 80) {
    return t("plannedAnalysis.results.verdict.lowCoverageDetail", {
      defaultValue: "The analysis has useful signals, but evidence coverage is partial. Treat the result as a guided editing pass.",
    });
  }
  return t("plannedAnalysis.results.verdict.needsRevisionDetail", {
    defaultValue: "The article can improve materially if the highlighted issues are fixed before publication.",
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
        defaultValue: "No blocking findings were detected. Keep edits focused and re-run analysis after the final draft.",
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
  locale: "ru" | "en",
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
        defaultValue: "Improve clarity, trust, and SEO content quality.",
      }),
      validationMethod: t("plannedAnalysis.results.reportValidationMethod", {
        defaultValue: "Run ToraSEO text analysis again after edits.",
      }),
    }));
  });

  return {
    analysisType:
      state.analysisType === "page_by_url" ? "page_by_url" : "article_text",
    analysisVersion: DEFAULT_ANALYSIS_VERSION,
    locale,
    mode: "audit_plus_ideas",
    providerId: "local",
    model: "ToraSEO MCP + Instructions",
    generatedAt: new Date().toISOString(),
    summary: t("plannedAnalysis.results.reportSummary", {
      defaultValue: "Structured report for the ToraSEO article text analysis.",
    }),
    nextStep: t("plannedAnalysis.results.reportNextStep", {
      defaultValue: "Review recommendations, choose priority edits, and scan the text again.",
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
  return (
    chunks.join("\n\n") ||
    t("plannedAnalysis.results.noDetails", {
      defaultValue: "The check completed without extra notes.",
    })
  );
}

function textToolLabel(
  t: ReturnType<typeof useTranslation>["t"],
  toolId: string,
): string {
  const compareLabels: Record<string, string> = {
    compare_intent_gap: "Intent comparison",
    compare_article_structure: "Structure comparison",
    compare_content_gap: "Content gaps",
    compare_semantic_gap: "Semantic coverage",
    compare_specificity_gap: "Specificity comparison",
    compare_trust_gap: "Trust comparison",
    compare_article_style: "Style comparison",
    similarity_risk: "Similarity risk",
    compare_title_ctr: "Title and click",
    compare_platform_fit: "Platform fit comparison",
    compare_strengths_weaknesses: "Strengths and weaknesses",
    compare_improvement_plan: "Improvement plan",
  };
  if (compareLabels[toolId]) {
    return t(`analysisTools.${toolId}.label`, {
      defaultValue: compareLabels[toolId],
    });
  }
  const labels: Record<string, string> = {
    article_uniqueness: t("analysisTools.article_uniqueness.label", {
      defaultValue: "Article uniqueness",
    }),
    language_syntax: t("analysisTools.language_syntax.label", {
      defaultValue: "Language syntax",
    }),
    ai_writing_probability: t("analysisTools.ai_writing_probability.label", {
      defaultValue: "AI writing probability",
    }),
    ai_trace_map: t("analysisTools.ai_trace_map.label", {
      defaultValue: "AI trace map",
    }),
    genericness_water_check: t("analysisTools.genericness_water_check.label", {
      defaultValue: "Genericness and watery text",
    }),
    readability_complexity: t("analysisTools.readability_complexity.label", {
      defaultValue: "Readability and complexity",
    }),
    claim_source_queue: t("analysisTools.claim_source_queue.label", {
      defaultValue: "Claim source queue",
    }),
    fact_distortion_check: t("analysisTools.fact_distortion_check.label", {
      defaultValue: "Fact distortion",
    }),
    logic_consistency_check: t("analysisTools.logic_consistency_check.label", {
      defaultValue: "Logic check",
    }),
    ai_hallucination_check: t("analysisTools.ai_hallucination_check.label", {
      defaultValue: "AI and hallucination check",
    }),
    naturalness_indicators: t("analysisTools.naturalness_indicators.label", {
      defaultValue: "Naturalness",
    }),
    intent_seo_forecast: t("analysisTools.intent_seo_forecast.label", {
      defaultValue: "Intent and promotion forecast",
    }),
    safety_science_review: t("analysisTools.safety_science_review.label", {
      defaultValue: "Risk and expert review",
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
              defaultValue: "Insert marker:",
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

function CompareRoleSelect({
  label,
  value,
  onValueChange,
}: {
  label: string;
  value?: RuntimeArticleCompareRole;
  onValueChange?: (value: RuntimeArticleCompareRole) => void;
}) {
  const { t } = useTranslation();
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase tracking-wider text-outline-900/50">
        {label}
      </span>
      <select
        value={value ?? "auto"}
        onChange={(event) =>
          onValueChange?.(event.target.value as RuntimeArticleCompareRole)
        }
        className="mt-2 w-full rounded-md border border-outline/15 bg-white px-3 py-2 text-sm text-outline-900 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15"
      >
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

function formatTextStats(text: string, locale: "ru" | "en"): string {
  const stats = computeTextStats(text);
  if (stats.wordCount === 0) return "";
  if (locale === "ru") {
    return `${stats.wordCount} words · ${stats.paragraphCount} paragraphs · ${stats.headingCount} headings`;
  }
  return `${stats.wordCount} words · ${stats.paragraphCount} paragraphs · ${stats.headingCount} headings`;
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
    case "image_analysis":
      return <Image className="h-6 w-6" strokeWidth={1.7} />;
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
