import {
  FileText,
  Film,
  Globe,
  Image,
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
import type { AuditExecutionMode } from "../../types/runtime";
import sleepingMascot from "@branding/mascots/tora-sleeping.svg";

interface PlannedAnalysisViewProps {
  analysisType: AnalysisTypeId;
  executionMode: AuditExecutionMode;
  selectedToolIds: AnalysisToolId[];
  activeRun: ArticleTextAction | null;
  completedTools: number;
  totalTools: number;
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
      <div className="mx-auto max-w-5xl">
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
  bridgeUnavailable,
  bridgeUnavailableAppName,
  bridgeTargetAppName,
}: {
  onRun: (action: ArticleTextAction, data: ArticleTextPromptData) => Promise<void>;
  onCancel: () => void;
  activeRun: ArticleTextAction | null;
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
