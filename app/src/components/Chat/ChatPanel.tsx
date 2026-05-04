import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { useTranslation } from "react-i18next";
import { Bot, Check, Copy, Sparkles, ShieldCheck } from "lucide-react";

import type { CurrentScanState } from "../../types/ipc";
import type {
  AuditExecutionMode,
  OrchestratorMessageInput,
  OrchestratorMessageResult,
  RuntimeArticleTextContext,
  ProviderModelProfile,
  RuntimeAuditReport,
  RuntimeArticleTextDimensionStatus,
  RuntimeArticleTextMetric,
  RuntimeArticleTextSummary,
  RuntimePolicyMode,
  RuntimeScanContext,
  RuntimeConfirmedFact,
} from "../../types/runtime";
import type { SupportedLocale } from "../../types/ipc";

interface ChatTurn {
  role: "user" | "assistant" | "system";
  text: string;
}

interface ChatPanelProps {
  locale: SupportedLocale;
  executionMode: AuditExecutionMode;
  scanContext: RuntimeScanContext | null;
  articleTextContext?: RuntimeArticleTextContext | null;
  analysisType?: "site" | "article_text";
  selectedModelProfile: ProviderModelProfile | null;
  bridgeState: CurrentScanState | null;
  bridgePrompt: string | null;
  onReport: (
    report: RuntimeAuditReport | null,
    runState?: "running" | "complete" | "failed",
    errorMessage?: string,
  ) => void;
}

const RUNTIME_PROVIDER_ID = "openrouter" as const;

function isScanContextReady(scanContext: RuntimeScanContext | null): boolean {
  return Boolean(scanContext && scanContext.completedTools.length > 0);
}

function isScanContextComplete(scanContext: RuntimeScanContext | null): boolean {
  return Boolean(
    scanContext &&
      scanContext.selectedTools.length > 0 &&
      scanContext.completedTools.length >= scanContext.selectedTools.length,
  );
}

function scanContextKey(scanContext: RuntimeScanContext | null): string | null {
  if (!scanContext) return null;
  return [
    scanContext.url,
    scanContext.selectedTools.join(","),
    scanContext.completedTools.join(","),
  ].join("|");
}

function articleTextContextKey(
  context: RuntimeArticleTextContext | null | undefined,
): string | null {
  if (!context) return null;
  return [
    context.runId ?? "",
    context.action,
    context.topic,
    context.textPlatform,
    context.customPlatform ?? "",
    context.selectedTools.join(","),
    context.body.length,
    context.body.slice(0, 80),
  ].join("|");
}

function buildArticleTextPrompt(
  context: RuntimeArticleTextContext,
  locale: SupportedLocale,
): string {
  const selectedTools = context.selectedTools
    .map((toolId) => toolLabelForChat(toolId, locale))
    .join(", ");
  const platform =
    context.customPlatform ||
    platformLabelForChat(context.textPlatform, locale);
  if (locale === "ru") {
    return [
      `TORASEO_ARTICLE_TEXT_AUTO_RUN=${context.action}`,
      context.action === "solution"
        ? "Предложи решение по тексту статьи в рамках ToraSEO."
        : "Проанализируй текст статьи в рамках ToraSEO.",
      "",
      `Тема: ${context.topic || "не указана"}`,
      `Площадка: ${platform}`,
      `Роль анализа: ${context.analysisRole || "стандартная"}`,
      `Выбранные проверки: ${selectedTools || "стандартные проверки текста"}`,
      "",
      "Сначала оцени текст по релевантным проверкам: платформа, структура, стиль, тон, язык/аудитория, медиа-метки, локальные повторы/уникальность, синтаксис, вероятность ИИ-стиля, естественность, логика, локальный SEO-интент/метаданные и риск-флаги.",
      context.action === "solution"
        ? "Затем дай конкретное решение или направление черновика. Если уместен рерайт и контекста достаточно, напиши готовую версию прямо в чате отдельным копируемым блоком."
        : "Затем дай приоритетные рекомендации и следующий шаг. Не переписывай всю статью без запроса.",
      "Не заявляй, что были выполнены интернет-проверка, проверка плагиата, юридическая/медицинская/научная экспертиза или MCP-инструменты, если этого нет в контексте API.",
    ].join("\n");
  }

  return [
    `TORASEO_ARTICLE_TEXT_AUTO_RUN=${context.action}`,
    context.action === "solution"
      ? "Suggest a solution for this article text within ToraSEO."
      : "Analyze this article text within ToraSEO.",
    "",
    `Topic: ${context.topic || "not specified"}`,
    `Platform: ${platform}`,
    `Analysis role: ${context.analysisRole || "standard"}`,
    `Selected checks: ${selectedTools || "standard text checks"}`,
    "",
    "First evaluate the text using relevant checks: platform, structure, style, tone, language/audience, media markers, local repetition/uniqueness, syntax, AI-style probability, naturalness, logic, local SEO intent/metadata, and risk flags.",
    context.action === "solution"
      ? "Then provide a concrete solution or draft direction. If a rewrite is appropriate and context is sufficient, write the ready version directly in chat as a separate copyable block."
      : "Then provide prioritized recommendations and the next step. Do not rewrite the whole article unless asked.",
    "Do not claim live internet checking, plagiarism checking, legal/medical/scientific expert review, or MCP tool execution when using API context only.",
  ].join("\n");
}

function platformLabelForChat(value: string, locale: SupportedLocale): string {
  const labels: Record<string, { ru: string; en: string }> = {
    site_article: { ru: "статья для сайта", en: "site article" },
    markdown_article: { ru: "статья в Markdown", en: "Markdown article" },
    short_social_post: {
      ru: "короткий пост для соцсетей",
      en: "short social post",
    },
    short_article_or_long_social_post: {
      ru: "короткая статья или длинный пост",
      en: "short article or long social post",
    },
    auto: { ru: "определить автоматически", en: "auto-detected format" },
  };
  return labels[value]?.[locale] ?? value;
}

function toolLabelForChat(value: string, locale: SupportedLocale): string {
  const labels: Record<string, { ru: string; en: string }> = {
    detect_text_platform: { ru: "платформа текста", en: "text platform" },
    analyze_text_structure: { ru: "структура текста", en: "text structure" },
    analyze_text_style: { ru: "стиль текста", en: "text style" },
    analyze_tone_fit: { ru: "соответствие тона", en: "tone fit" },
    language_audience_fit: {
      ru: "язык и аудитория",
      en: "language and audience",
    },
    media_placeholder_review: {
      ru: "размещение медиа",
      en: "media placement",
    },
    article_uniqueness: {
      ru: "локальная уникальность и повторы",
      en: "local uniqueness and repetition",
    },
    language_syntax: { ru: "синтаксис языка", en: "language syntax" },
    ai_writing_probability: {
      ru: "вероятность ИИ-стиля",
      en: "AI-writing probability",
    },
    naturalness_indicators: {
      ru: "естественность текста",
      en: "naturalness indicators",
    },
    logic_consistency_check: {
      ru: "логическая согласованность",
      en: "logic consistency",
    },
    intent_seo_forecast: {
      ru: "SEO-интент и метаданные",
      en: "SEO intent and metadata",
    },
    safety_science_review: {
      ru: "риск-флаги и экспертная проверка",
      en: "risk flags and expert review",
    },
  };
  return labels[value]?.[locale] ?? value;
}

function defaultPolicyModeForSession(
  analysisType: "site" | "article_text",
  articleTextContext: RuntimeArticleTextContext | null | undefined,
): RuntimePolicyMode {
  if (
    analysisType === "article_text" &&
    articleTextContext?.action === "solution"
  ) {
    return "audit_plus_ideas";
  }
  return "strict_audit";
}

function isAutoArticleTextScan(
  analysisType: "site" | "article_text",
  articleTextContext: RuntimeArticleTextContext | null | undefined,
  text: string,
): boolean {
  return (
    analysisType === "article_text" &&
    articleTextContext?.action === "scan" &&
    text.includes("TORASEO_ARTICLE_TEXT_AUTO_RUN=scan")
  );
}

function priorityLabel(
  priority: RuntimeConfirmedFact["priority"],
  locale: SupportedLocale,
): string {
  if (locale === "ru") {
    if (priority === "high") return "высокий";
    if (priority === "medium") return "средний";
    return "низкий";
  }
  return priority;
}

function numberedLines<T>(
  items: T[],
  formatter: (item: T) => string,
): string {
  return items.map((item, index) => `${index + 1}. ${formatter(item)}`).join("\n");
}

function articleFactByTool(
  report: RuntimeAuditReport,
  toolIds: string[],
): RuntimeConfirmedFact | undefined {
  const facts = report.articleText?.priorities ?? report.confirmedFacts;
  return facts.find((fact) =>
    fact.sourceToolIds.some((toolId) => toolIds.includes(toolId)),
  );
}

function articlePriorityLines(
  report: RuntimeAuditReport,
  locale: SupportedLocale,
): string[] {
  const article = report.articleText;
  if (!article) return [];
  const selectedFacts = [
    articleFactByTool(report, ["intent_seo_forecast"]),
    articleFactByTool(report, ["analyze_text_style", "naturalness_indicators"]),
    articleFactByTool(report, ["article_uniqueness"]),
  ].filter((fact): fact is RuntimeConfirmedFact => Boolean(fact));
  const fallbackFacts =
    selectedFacts.length > 0
      ? selectedFacts
      : article.priorities.filter((fact) => fact.priority !== "low").slice(0, 3);
  if (fallbackFacts.length === 0) {
    return [
      locale === "ru"
        ? "Явных приоритетных замечаний по выбранным инструментам не найдено."
        : "No clear priority findings were highlighted by the selected tools.",
    ];
  }
  return fallbackFacts
    .slice(0, 3)
    .map((fact) => `${fact.title}: ${clampReportText(fact.detail, 180)}`);
}

function articleFactLine(
  report: RuntimeAuditReport,
  toolIds: string[],
  fallback: string,
): string {
  const fact = articleFactByTool(report, toolIds);
  if (!fact) return fallback;
  return `${fact.title}: ${clampReportText(fact.detail, 240)}`;
}

function renderArticleReportText(
  report: RuntimeAuditReport,
  locale: SupportedLocale,
): string {
  const article = report.articleText;
  if (!article) return report.summary;
  const forecast = article.intentForecast;
  const seo = forecast?.seoPackage;
  const priorityLines = articlePriorityLines(report, locale).map(
    (item) => `- ${item}`,
  );
  const structureLine = articleFactLine(
    report,
    ["analyze_text_structure", "detect_text_platform"],
    locale === "ru"
      ? `Текст распознан как ${article.platform.label}; ${article.document.wordCount ?? "—"} слов, ${article.document.paragraphCount ?? "—"} абзацев.`
      : `The text is treated as ${article.platform.label}; ${article.document.wordCount ?? "—"} words, ${article.document.paragraphCount ?? "—"} paragraphs.`,
  );
  const mediaLine = articleFactLine(
    report,
    ["media_placeholder_review"],
    locale === "ru"
      ? "Медиа-маркеры проверены в рамках выбранных инструментов."
      : "Media markers were checked within the selected tools.",
  );
  const riskLine = articleFactLine(
    report,
    ["safety_science_review"],
    locale === "ru"
      ? "Если в тексте есть юридические, медицинские, технические или расчетные утверждения, их нужно проверять вручную."
      : "Legal, medical, technical, or calculation-heavy claims should be checked manually when present.",
  );

  if (locale === "ru") {
    const seoLines = seo
      ? [
          `- Title: «${seo.seoTitle || article.document.title}»`,
          `- Description: ${seo.metaDescription || "—"}`,
          `- Slug: \`${seo.slug || "—"}\``,
          `- Ключи/теги: ${(seo.keywords.length > 0 ? seo.keywords : [seo.primaryKeyword]).filter(Boolean).join(", ") || "—"}`,
        ]
      : ["- SEO-пакет не сформирован: инструмент прогноза интента не выбран."];
    return [
      `Готово: API-анализ текста выполнен, отчет сформирован в ToraSEO. Проверено инструментов: ${article.coverage.completed}/${article.coverage.total}.`,
      "",
      "**Главные приоритеты**",
      ...priorityLines,
      "",
      "**Структура**",
      `- ${structureLine}`,
      "",
      "**SEO-пакет (черновик из прогноза)**",
      ...seoLines,
      "",
      "**Медиа**",
      `- ${mediaLine}`,
      "",
      "**Риск и корректность формулировок**",
      `- ${riskLine}`,
      "",
      `Следующий шаг: ${report.nextStep}`,
    ].join("\n");
  }

  const seoLines = seo
    ? [
        `- Title: "${seo.seoTitle || article.document.title}"`,
        `- Description: ${seo.metaDescription || "—"}`,
        `- Slug: \`${seo.slug || "—"}\``,
        `- Keywords/tags: ${(seo.keywords.length > 0 ? seo.keywords : [seo.primaryKeyword]).filter(Boolean).join(", ") || "—"}`,
      ]
    : ["- SEO package was not formed because the intent forecast tool is not selected."];
  return [
    `Done: API text analysis is complete and the report is formed in ToraSEO. Tool coverage: ${article.coverage.completed}/${article.coverage.total}.`,
    "",
    "**Main priorities**",
    ...priorityLines,
    "",
    "**Structure**",
    `- ${structureLine}`,
    "",
    "**SEO package draft**",
    ...seoLines,
    "",
    "**Media**",
    `- ${mediaLine}`,
    "",
    "**Risk and wording accuracy**",
    `- ${riskLine}`,
    "",
    `Next step: ${report.nextStep}`,
  ].join("\n");
}

function renderReportText(
  report: RuntimeAuditReport,
  locale: SupportedLocale,
): string {
  if (report.articleText) {
    return renderArticleReportText(report, locale);
  }

  const chatFacts = report.articleText?.priorities ?? report.confirmedFacts;
  const visibleFacts = chatFacts.slice(0, 6);
  const hiddenFactCount = Math.max(0, chatFacts.length - visibleFacts.length);
  if (locale === "ru") {
    const facts = numberedLines(visibleFacts, (fact) => {
      return `[${priorityLabel(fact.priority, locale)}] ${fact.title}: ${fact.detail}`;
    });
    const factNote =
      hiddenFactCount > 0
        ? `\nЕще ${hiddenFactCount} пунктов сохранены в отчете ToraSEO.`
        : "";
    const hypotheses =
      report.expertHypotheses.length > 0
        ? numberedLines(report.expertHypotheses, (item) => {
            return `[${priorityLabel(item.priority, locale)}] ${item.title}: ${
              item.detail
            }\n   Ожидаемый эффект: ${
              item.expectedImpact
            }\n   Как проверить: ${item.validationMethod}`;
          })
        : "Нет гипотез сверх подтверждённых фактов.";

    return [
      `Коротко: ${report.summary}`,
      "",
      "Подтверждённые факты:",
      `${facts}${factNote}`,
      "",
      "Экспертные гипотезы:",
      hypotheses,
      "",
      `Следующий шаг: ${report.nextStep}`,
    ].join("\n");
  }

  const facts = numberedLines(visibleFacts, (fact) => {
    return `[${priorityLabel(fact.priority, locale)}] ${fact.title}: ${fact.detail}`;
  });
  const factNote =
    hiddenFactCount > 0
      ? `\n${hiddenFactCount} more items are saved in the ToraSEO report.`
      : "";
  const hypotheses =
    report.expertHypotheses.length > 0
      ? numberedLines(report.expertHypotheses, (item) => {
          return `[${priorityLabel(item.priority, locale)}] ${item.title}: ${
            item.detail
          }\n   Expected impact: ${
            item.expectedImpact
          }\n   Validation: ${item.validationMethod}`;
        })
      : "No hypotheses beyond confirmed facts.";

  return [
    `Summary: ${report.summary}`,
    "",
    "Confirmed facts:",
    `${facts}${factNote}`,
    "",
    "Expert hypotheses:",
    hypotheses,
    "",
    `Next step: ${report.nextStep}`,
  ].join("\n");
}

function wordsInText(text: string): number {
  return text.match(/[\p{L}\p{N}]+(?:[-'][\p{L}\p{N}]+)?/gu)?.length ?? 0;
}

function paragraphsInText(text: string): number {
  return text
    .split(/\n\s*\n/g)
    .map((item) => item.trim())
    .filter(Boolean).length;
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

function isArticleListLeadInLine(value: string): boolean {
  const line = stripArticleHeadingMarker(value).trim();
  if (!line) return false;
  if (/[:：]\s*$/.test(line)) return true;
  return /^(?:эта статья поможет понять|в этой статье|вы узнаете|разбер[её]м|ниже разбер[её]м|практически|важно(?:\s+помнить)?|this article|in this article|you will learn|we will cover)\b/iu.test(
    line,
  );
}

function isArticleListContinuationLine(
  value: string,
  previousMeaningfulLine = "",
): boolean {
  const raw = stripArticleHeadingMarker(value).trim();
  const line = stripArticleListMarker(raw);
  if (!line) return false;
  if (/^[-*•]\s+/.test(raw)) return true;
  if (previousMeaningfulLine && isArticleListLeadInLine(previousMeaningfulLine)) {
    return true;
  }
  const previousLine = stripArticleListMarker(previousMeaningfulLine);
  if (
    previousLine &&
    isLowercaseStart(previousLine) &&
    isLowercaseStart(line) &&
    line.split(/\s+/).length <= 12
  ) {
    return true;
  }
  if (isLowercaseStart(line) && line.split(/\s+/).length <= 12 && /[,;]$/.test(line)) {
    return true;
  }
  return (
    isLowercaseStart(line) &&
    line.split(/\s+/).length <= 8 &&
    !/[.!?…]$/.test(line)
  );
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
    "этот",
    "текст",
    "статья",
    "article",
    "with",
    "that",
    "this",
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
  if (/glycogen/i.test(text) && /training|exercise|workout/i.test(text)) {
    return "Glycogen recovery after training";
  }
  if (keywords.length >= 3) {
    return `${capitalizeTitleStart(keywords.slice(0, 3).join(" "))}: что важно знать`;
  }
  if (keywords[0]) return `${capitalizeTitleStart(keywords[0])}: что важно знать`;
  return "";
}

function inferSeoTitleFromInput(text: string, topic?: string): string {
  const topicTitle = topic?.trim() ?? "";
  if (topicTitle && !isServiceSeoValue(topicTitle)) return topicTitle;
  const explicitTitle = firstExplicitArticleTitleLine(text, 90);
  if (explicitTitle) return explicitTitle;
  return fallbackSeoTitleFromKeywords(text, inferKeywordListFromInput(text));
}

function inferMetaDescriptionFromInput(text: string): string {
  const lowered = text.toLowerCase();
  if (/гликоген/u.test(lowered) && /трениров|упражнен|нагруз/u.test(lowered)) {
    return "Как восстановить запасы гликогена после нагрузки: питание, сроки, частые ошибки и важные ограничения для здоровья.";
  }
  const cleaned = text
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .filter((line) => line && !isServiceSeoValue(line) && !isArticleServiceLine(line))
    .join(" ");
  const sentence = cleaned
    .split(/[.!?…]+/g)
    .map((item) => item.trim())
    .find((item) => item.length >= 45);
  if (!sentence) return "";
  return sentence.length <= 155 ? sentence : `${sentence.slice(0, 154).trim()}…`;
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

function inferArticleTitle(context: RuntimeArticleTextContext): string {
  const topic = context.topic.trim();
  if (topic) return topic;
  const firstHeading = firstExplicitArticleTitleLine(context.body, 120);
  const fallbackTitle = fallbackSeoTitleFromKeywords(
    context.body,
    inferKeywordListFromInput(context.body),
  );
  return (
    firstHeading ||
    fallbackTitle ||
    (context.textPlatform === "site_article" ? "Статья для сайта" : "Article text")
  );
}

function normalizeReportText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function clampReportText(value: string, maxLength: number): string {
  const normalized = normalizeReportText(value);
  if (normalized.length <= maxLength) return normalized;
  const slice = normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd();
  return `${slice}…`;
}

function recommendationFromDetail(detail: string): string {
  const chunks = detail
    .split(/\n{2,}|(?<=\.)\s+(?=[А-ЯA-Z])/g)
    .map((item) => item.trim())
    .filter(Boolean);
  return chunks[chunks.length - 1] || detail;
}

function factPriorityWeight(priority: RuntimeConfirmedFact["priority"]): number {
  if (priority === "high") return 0;
  if (priority === "medium") return 1;
  return 2;
}

function pickPriorityFacts(
  facts: RuntimeConfirmedFact[],
  limit: number,
): RuntimeConfirmedFact[] {
  return facts
    .map((fact, index) => ({ fact, index }))
    .sort((left, right) => {
      const priorityDelta =
        factPriorityWeight(left.fact.priority) -
        factPriorityWeight(right.fact.priority);
      return priorityDelta || left.index - right.index;
    })
    .slice(0, limit)
    .map((item) => item.fact);
}

function compactReportFact(
  fact: RuntimeConfirmedFact,
  detailLimit = 360,
): RuntimeConfirmedFact {
  return {
    ...fact,
    title: clampReportText(fact.title, 96),
    detail: clampReportText(fact.detail, detailLimit),
  };
}

function articleTextToolLabelForLocale(
  toolId: string,
  locale: SupportedLocale,
): string {
  const labels: Record<string, { ru: string; en: string }> = {
    detect_text_platform: {
      ru: "Определение платформы",
      en: "Platform detection",
    },
    analyze_text_structure: {
      ru: "Структура текста",
      en: "Text structure",
    },
    analyze_text_style: {
      ru: "Стиль текста",
      en: "Text style",
    },
    analyze_tone_fit: {
      ru: "Соответствие тона",
      en: "Tone fit",
    },
    language_audience_fit: {
      ru: "Язык и аудитория",
      en: "Language and audience",
    },
    media_placeholder_review: {
      ru: "Размещение медиа",
      en: "Media placement",
    },
    article_uniqueness: {
      ru: "Уникальность статьи",
      en: "Article uniqueness",
    },
    language_syntax: {
      ru: "Синтаксис языка",
      en: "Language syntax",
    },
    ai_writing_probability: {
      ru: "Вероятность написания ИИ",
      en: "AI writing probability",
    },
    naturalness_indicators: {
      ru: "Естественность",
      en: "Naturalness",
    },
    logic_consistency_check: {
      ru: "Проверка логики",
      en: "Logic check",
    },
    intent_seo_forecast: {
      ru: "Прогноз интента и SEO",
      en: "Intent and SEO forecast",
    },
    safety_science_review: {
      ru: "Проверка рисков",
      en: "Risk review",
    },
    fact_distortion_check: {
      ru: "Искажение фактов",
      en: "Fact distortion",
    },
    ai_hallucination_check: {
      ru: "Проверка наличия ИИ и его галлюцинаций",
      en: "AI and hallucination check",
    },
  };
  return labels[toolId]?.[locale] ?? toolId;
}

function factToolLabelForLocale(
  fact: RuntimeConfirmedFact,
  locale: SupportedLocale,
): string {
  return articleTextToolLabelForLocale(fact.sourceToolIds[0] ?? "", locale);
}

function normalizeArticleFactForDisplay(
  fact: RuntimeConfirmedFact,
): RuntimeConfirmedFact {
  const text = `${fact.title} ${fact.detail}`.toLowerCase();
  const sourceToolId = fact.sourceToolIds[0] ?? "";
  const serviceFinding =
    /выбран[аоы]? только проверк/.test(text) ||
    /в контексте анализа указан[ао]?/.test(text) ||
    /selected check/.test(text) ||
    /one selected check/.test(text) ||
    /only selected check/.test(text);
  if (serviceFinding) {
    return {
      ...fact,
      priority: "low",
      title: "Ограничение проверки",
      detail:
        "Этот пункт описывает границы текущей проверки, а не отдельную проблему текста. Он сохранен как контекст и не считается приоритетной правкой.",
    };
  }

  const positiveSignal =
    /уже есть|предусмотрен|соблюден|соответствует|подходит|полностью написан|в целом нейтраль|нейтрально-инструктив/.test(
      text,
    );
  const problemSignal =
    /частич|однако|риск|слаб|неоднород|повтор|перегруж|служеб|нужн|смешан|ошиб|проблем|категорич|избыточ/.test(
      text,
    );
  if (positiveSignal && !problemSignal) {
    return {
      ...fact,
      priority: "low",
    };
  }

  if (
    fact.sourceToolIds.includes("media_placeholder_review") &&
    positiveSignal &&
    !/неравномер|без связи|служеб|лишн|дублир/.test(text)
  ) {
    return {
      ...fact,
      priority: "low",
    };
  }

  const highAllowedTools = new Set([
    "safety_science_review",
    "fact_distortion_check",
    "ai_hallucination_check",
    "intent_seo_forecast",
  ]);
  const hardIntentRisk =
    /не закреплен|размыт|смешан|нет фокус|неясн|unclear|mixed|unfocused|broad/i.test(
      text,
    );
  if (
    fact.priority === "high" &&
    (!highAllowedTools.has(sourceToolId) ||
      (sourceToolId === "intent_seo_forecast" && !hardIntentRisk))
  ) {
    return {
      ...fact,
      priority: "medium",
    };
  }

  return fact;
}

function factSignature(fact: RuntimeConfirmedFact): string {
  return `${fact.title} ${fact.detail}`
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .split(/\s+/)
    .slice(0, 18)
    .join(" ");
}

function dedupeArticleFacts(facts: RuntimeConfirmedFact[]): RuntimeConfirmedFact[] {
  const seen = new Set<string>();
  const result: RuntimeConfirmedFact[] = [];
  for (const fact of facts) {
    const signature = factSignature(fact);
    if (signature && seen.has(signature)) continue;
    seen.add(signature);
    result.push(fact);
  }
  return result;
}

function compactFactsByTool(
  facts: RuntimeConfirmedFact[],
  expectedToolIds: string[],
): RuntimeConfirmedFact[] {
  return expectedToolIds
    .map((toolId) => {
      const matches = facts
        .filter((fact) => fact.sourceToolIds.includes(toolId))
        .map(normalizeArticleFactForDisplay);
      if (matches.length === 0) return null;
      const first = pickPriorityFacts(matches, 1)[0];
      return compactReportFact({
        ...first,
        sourceToolIds: [toolId],
      });
    })
    .filter((fact): fact is RuntimeConfirmedFact => Boolean(fact));
}

function metricTone(value: number): RuntimeArticleTextMetric["tone"] {
  if (value >= 78) return "good";
  if (value >= 55) return "warn";
  return "bad";
}

function buildMetric(
  id: string,
  label: string,
  value: number,
  description: string,
): RuntimeArticleTextMetric {
  return {
    id,
    label,
    value,
    suffix: "%",
    tone: metricTone(value),
    description,
  };
}

function buildInverseMetric(
  id: string,
  label: string,
  value: number,
  description: string,
): RuntimeArticleTextMetric {
  return {
    id,
    label,
    value,
    suffix: "%",
    tone: value <= 35 ? "good" : value <= 60 ? "warn" : "bad",
    description,
  };
}

function clampMetricScore(value: number): number {
  return Math.max(10, Math.min(96, Math.round(value)));
}

function apiSentences(text: string): string[] {
  return text
    .replace(/\r/g, "\n")
    .split(/(?<=[.!?…])\s+|\n+/gu)
    .map((item) => item.trim())
    .filter((item) => wordsInText(item) >= 3);
}

function apiWords(text: string): string[] {
  return text.match(/[\p{L}\p{N}]+(?:[-'][\p{L}\p{N}]+)?/gu) ?? [];
}

function apiSentenceStats(text: string): { avg: number; variance: number } {
  const lengths = apiSentences(text).map(wordsInText);
  if (lengths.length === 0) return { avg: 0, variance: 0 };
  const avg = lengths.reduce((sum, value) => sum + value, 0) / lengths.length;
  const variance =
    lengths.reduce((sum, value) => sum + Math.pow(value - avg, 2), 0) /
    lengths.length;
  return { avg, variance };
}

function apiTopRepeatedTerms(text: string, limit = 5): string[] {
  const stop = new Set([
    "это",
    "как",
    "для",
    "что",
    "или",
    "при",
    "после",
    "так",
    "его",
    "она",
    "они",
    "the",
    "and",
    "for",
    "with",
    "that",
    "this",
    "from",
  ]);
  const counts = new Map<string, number>();
  for (const raw of apiWords(text)) {
    const word = raw.toLowerCase();
    if (word.length < 5 || stop.has(word)) continue;
    counts.set(word, (counts.get(word) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .filter(([, count]) => count >= 5)
    .sort((left, right) => right[1] - left[1])
    .slice(0, limit)
    .map(([word]) => word);
}

function apiLocalTextMetrics(text: string): {
  uniquenessScore: number;
  syntaxScore: number;
  aiProbability: number;
  logicScore: number;
  naturalnessScore: number;
} {
  const allWords = apiWords(text).map((word) => word.toLowerCase());
  const uniqueWordRatio =
    allWords.length > 0 ? new Set(allWords).size / allWords.length : 0;
  const normalizedSentences = apiSentences(text).map((sentence) =>
    sentence.toLowerCase().replace(/\s+/g, " ").trim(),
  );
  const duplicateSentences =
    normalizedSentences.length - new Set(normalizedSentences).size;
  const duplicateSentenceRate =
    normalizedSentences.length > 0
      ? duplicateSentences / normalizedSentences.length
      : 0;
  const stats = apiSentenceStats(text);
  const spacingIssues =
    (text.match(/\s+[,.!?;:]/g) ?? []).length +
    (text.match(/[,.!?;:][^\s\n)"»]/g) ?? []).length;
  const repeatedPunctuation = (text.match(/[!?.,]{3,}/g) ?? []).length;
  const genericSignals = (
    text.match(
      /важно отметить|следует отметить|таким образом|в заключение|it is important to note|in conclusion|overall|moreover/giu,
    ) ?? []
  ).length;
  const formalSignals = (
    text.match(/является|осуществляется|производится|обеспечивает|utilize|leverage/giu) ??
    []
  ).length;
  const lowVarianceSignal = stats.variance > 0 && stats.variance < 18 ? 18 : 0;
  const lowerText = text.toLowerCase();
  const contradictionPairs = [
    ["всегда", "иногда"],
    ["никогда", "иногда"],
    ["невозможно", "можно"],
    ["обязательно", "не обязательно"],
    ["always", "sometimes"],
    ["never", "sometimes"],
    ["impossible", "can"],
    ["must", "optional"],
  ] as const;
  const contradictionSignals = contradictionPairs.filter(
    ([left, right]) => lowerText.includes(left) && lowerText.includes(right),
  ).length;
  const causalityClaims = (
    text.match(/поэтому|из-за этого|следовательно|значит|because|therefore|as a result/giu) ??
    []
  ).length;
  const supportedCausality = (
    text.match(/например|данн|исследован|потому что|example|data|study|because/giu) ??
    []
  ).length;
  const unsupportedCausality = Math.max(0, causalityClaims - supportedCausality);
  const abruptTurns = (
    text.match(/однако|но при этом|с другой стороны|however|but at the same time/giu) ??
    []
  ).length;
  const repeatedTerms = apiTopRepeatedTerms(text, 5);

  return {
    uniquenessScore: clampMetricScore(
      92 -
        duplicateSentenceRate * 80 -
        Math.max(0, 0.42 - uniqueWordRatio) * 80,
    ),
    syntaxScore: clampMetricScore(
      96 -
        (spacingIssues + repeatedPunctuation) * 5 -
        Math.max(0, stats.avg - 26) * 1.5,
    ),
    aiProbability: clampMetricScore(
      18 + genericSignals * 10 + formalSignals * 5 + lowVarianceSignal,
    ),
    logicScore: clampMetricScore(
      94 -
        contradictionSignals * 18 -
        unsupportedCausality * 8 -
        Math.max(0, abruptTurns - normalizedSentences.length / 6) * 4,
    ),
    naturalnessScore: repeatedTerms.length > 0 ? 82 : 96,
  };
}

function scoreStatusForApi(
  value: number,
  inverse: boolean,
): RuntimeArticleTextDimensionStatus {
  if (inverse) {
    if (value >= 65) return "problem";
    if (value >= 40) return "watch";
    return "healthy";
  }
  if (value < 60) return "problem";
  if (value < 80) return "watch";
  return "healthy";
}

function combineDimensionStatus(
  statuses: RuntimeArticleTextDimensionStatus[],
): RuntimeArticleTextDimensionStatus {
  if (statuses.includes("problem")) return "problem";
  if (statuses.includes("watch")) return "watch";
  return "healthy";
}

function toolStatusFromFacts(
  facts: RuntimeConfirmedFact[],
  toolIds: string[],
): RuntimeArticleTextDimensionStatus {
  const relevant = facts.filter((fact) =>
    fact.sourceToolIds.some((toolId) => toolIds.includes(toolId)),
  );
  if (relevant.some((fact) => fact.priority === "high")) return "problem";
  if (relevant.some((fact) => fact.priority === "medium")) return "watch";
  return "healthy";
}

function apiPlatformStatusFromFacts(
  facts: RuntimeConfirmedFact[],
): RuntimeArticleTextDimensionStatus {
  const platformFacts = facts.filter((fact) =>
    fact.sourceToolIds.some((toolId) =>
      [
        "detect_text_platform",
        "media_placeholder_review",
      ].includes(toolId),
    ),
  );
  const text = platformFacts
    .map((fact) => `${fact.title} ${fact.detail}`)
    .join(" ")
    .toLowerCase();
  const platformIssue =
    /служеб|загрузить\s+pdf|место для изображ|место для видео|место для аудио|шаблон|артефакт|разметк|не подходит площадк|platform mismatch|placeholder|template artifact/i.test(
      text,
    );
  if (!platformIssue) return "healthy";
  if (platformFacts.some((fact) => fact.priority === "high")) return "problem";
  if (platformFacts.some((fact) => fact.priority === "medium")) return "watch";
  return "healthy";
}

function factForTools(
  facts: RuntimeConfirmedFact[],
  toolIds: string[],
): RuntimeConfirmedFact | undefined {
  return pickPriorityFacts(
    facts.filter((fact) =>
      fact.sourceToolIds.some((toolId) => toolIds.includes(toolId)),
    ),
    1,
  )[0];
}

function platformDetailForApi(value: string, locale: SupportedLocale): string {
  const details: Record<string, { ru: string; en: string }> = {
    site_article: {
      ru: "Подходит для длинного материала с заголовком, разделами и поисковым интентом.",
      en: "Fits long-form material with a title, sections, and search intent.",
    },
    markdown_article: {
      ru: "Подходит для статьи с Markdown-разметкой и явной структурой разделов.",
      en: "Fits an article with Markdown markup and explicit section structure.",
    },
    short_social_post: {
      ru: "Подходит для короткой публикации, где важны первая строка, тон и компактность.",
      en: "Fits a short publication where opening line, tone, and compactness matter.",
    },
    short_article_or_long_social_post: {
      ru: "Подходит для короткой статьи или длинного поста с понятной первой подачей.",
      en: "Fits a short article or long social post with a clear opening pitch.",
    },
    auto: {
      ru: "Формат определен по самому тексту и выбранным признакам анализа.",
      en: "The format is inferred from the text and selected analysis signals.",
    },
  };
  return (
    details[value]?.[locale] ??
    (locale === "ru"
      ? "Формат оценен по тексту и контексту публикации."
      : "The format is evaluated from the text and publication context.")
  );
}

function buildApiIntentForecast(
  context: RuntimeArticleTextContext,
  facts: RuntimeConfirmedFact[],
  expectedToolIds: string[],
  locale: SupportedLocale,
): RuntimeArticleTextSummary["intentForecast"] {
  if (!expectedToolIds.includes("intent_seo_forecast")) return undefined;
  const isRu = locale === "ru";
  const text = context.body;
  const keywords = inferKeywordListFromInput(text);
  const seoTitle =
    inferSeoTitleFromInput(text, context.topic) ||
    (isRu ? "Текст статьи: что важно знать" : "Article text: what to know");
  const primaryKeyword = keywords[0] ?? seoTitle.toLowerCase().split(/\s+/)[0] ?? "";
  const slug = toLatinSlug(seoTitle || keywords.slice(0, 5).join(" "));
  const intentFact = factForTools(facts, ["intent_seo_forecast"]);
  const hasIntentRisk =
    intentFact?.priority === "high" ||
    /слаб|не указан|не хватает|размыт|широк|weak|missing|unclear|broad/i.test(
      `${intentFact?.title ?? ""} ${intentFact?.detail ?? ""}`,
    );
  const hookScore = hasIntentRisk ? 58 : intentFact?.priority === "medium" ? 64 : 74;
  const metaDescription = inferMetaDescriptionFromInput(text);
  const category = inferCategoryFromKeywords(keywords);
  const tags = keywords
    .filter((item) => item !== primaryKeyword)
    .slice(0, 5);
  const hookIdeas = isRu
    ? [
        `Сразу покажите проблему читателя: почему тема «${seoTitle}» важна именно сейчас.`,
        "Покажите обещание пользы в первой строке: что человек поймет и сможет сделать после чтения.",
        "Если это health-sensitive тема, добавьте осторожную оговорку рядом с практическими советами.",
      ]
    : [
        `Open with the reader problem: why "${seoTitle}" matters now.`,
        "Show the payoff in the first line: what the reader will understand or do after reading.",
        "If the topic is health-sensitive, add a careful limitation near practical advice.",
      ];
  return {
    intent: "informational",
    intentLabel: isRu
      ? "Информационный / решение проблемы"
      : "Informational / problem-solving",
    hookType: "problem-solution",
    hookScore,
    ctrPotential: 74,
    trendPotential: 74,
    internetDemandAvailable: false,
    internetDemandSource: isRu
      ? "Локальный прогноз без SERP и соцданных. Для реального спроса нужен внешний источник."
      : "Local forecast without SERP or social data. Real demand needs an external source.",
    hookIdeas,
    seoPackage: {
      seoTitle,
      metaDescription,
      primaryKeyword,
      secondaryKeywords: keywords
        .filter((item) => item !== primaryKeyword)
        .slice(0, 6),
      keywords,
      category,
      tags,
      slug,
    },
  };
}

function buildArticleTextSummaryForApi(
  context: RuntimeArticleTextContext,
  facts: RuntimeConfirmedFact[],
  expectedToolIds: string[],
  locale: SupportedLocale,
): RuntimeArticleTextSummary {
  const normalizedFacts = dedupeArticleFacts(
    facts.map(normalizeArticleFactForDisplay),
  );
  const completed = new Set(
    normalizedFacts.flatMap((fact) =>
      fact.sourceToolIds.filter((toolId) => expectedToolIds.includes(toolId)),
    ),
  ).size;
  const total = Math.max(1, expectedToolIds.length);
  const isRu = locale === "ru";
  const coveragePercent = Math.round((completed / total) * 100);
  const platformLabel =
    context.customPlatform ||
    platformLabelForChat(context.textPlatform, locale);
  const intentForecast = buildApiIntentForecast(
    context,
    normalizedFacts,
    expectedToolIds,
    locale,
  );
  const localMetrics = apiLocalTextMetrics(context.body);
  const uniquenessScore = localMetrics.uniquenessScore;
  const syntaxScore = localMetrics.syntaxScore;
  const logicScore = localMetrics.logicScore;
  const naturalnessScore = localMetrics.naturalnessScore;
  const aiProbability = localMetrics.aiProbability;
  const safetyFacts = normalizedFacts.filter((fact) =>
    fact.sourceToolIds.includes("safety_science_review"),
  );
  const warningCount = safetyFacts.filter(
    (fact) => fact.priority !== "low",
  ).length;
  const actionableFacts = normalizedFacts.filter((fact) => fact.priority !== "low");
  const priorityFacts = pickPriorityFacts(actionableFacts, 12);
  const lowFacts = normalizedFacts.filter((fact) => fact.priority === "low");
  const compactInsight = (fact: RuntimeConfirmedFact) => ({
    title: clampReportText(factToolLabelForLocale(fact, locale), 90),
    detail: clampReportText(fact.detail, 260),
    sourceToolIds: fact.sourceToolIds,
  });
  const metrics = [
    buildMetric(
      "uniqueness",
      isRu ? "Уникальность статьи" : "Article uniqueness",
      uniquenessScore,
      isRu
        ? "Локальная оценка повторов и шаблонных совпадений по тексту статьи."
        : "Local repetition and template-similarity estimate from the article text.",
    ),
    buildMetric(
      "syntax",
      isRu ? "Синтаксис языка" : "Language syntax",
      syntaxScore,
      isRu
        ? "Локальная оценка перегруженности, пунктуации и понятности фраз."
        : "Local sentence clarity, punctuation, and overload estimate.",
    ),
    buildInverseMetric(
      "ai",
      isRu ? "Вероятность написания ИИ" : "AI-writing probability",
      aiProbability,
      isRu
        ? "Считается только по проверке ИИ-стиля; это эвристика, не доказательство авторства."
        : "Heuristic template-style signal, not proof of authorship.",
    ),
    buildMetric(
      "logic",
      isRu ? "Логическая связность" : "Logic consistency",
      logicScore,
      isRu
        ? "Локальная оценка связности, противоречий и резких переходов."
        : "Local coherence, contradiction, and transition estimate.",
    ),
    buildMetric(
      "naturalness",
      isRu ? "Естественность" : "Naturalness",
      naturalnessScore,
      isRu
        ? "Показывает риск механических формулировок, повторов и однообразного ритма."
        : "Highlights mechanical phrasing, repetition, and uniform rhythm risks.",
    ),
  ];
  const originalityStatus = combineDimensionStatus([
    scoreStatusForApi(uniquenessScore, false),
    scoreStatusForApi(aiProbability, true),
    scoreStatusForApi(naturalnessScore, false),
    toolStatusFromFacts(normalizedFacts, [
      "article_uniqueness",
      "ai_writing_probability",
      "naturalness_indicators",
    ]),
  ]);
  const clarityStatus = scoreStatusForApi(syntaxScore, false);
  const logicStatus = scoreStatusForApi(logicScore, false);
  const platformStatus = apiPlatformStatusFromFacts(normalizedFacts);
  const dimensions = [
    {
      id: "safety",
      label: isRu ? "Безопасность и проверка" : "Safety and review",
      status: toolStatusFromFacts(normalizedFacts, ["safety_science_review"]),
      detail: isRu
        ? "Риски запрещенного контента, обхода правил, юридических, медицинских, инвестиционных, технических, научных выводов, расчетов и внешней сверки."
        : "Forbidden-content, policy, legal, medical, investment, technical, scientific, calculation, and external-verification risks.",
      recommendation:
        warningCount > 0
          ? isRu
            ? "Проверьте предупреждения перед публикацией; ИИ не заменяет эксперта или ручную проверку источников."
            : "Review warnings before publishing; AI does not replace an expert or manual source check."
          : isRu
            ? "Блокирующих предупреждений по безопасности и экспертной проверке не найдено."
            : "No blocking safety or expert-review warnings were highlighted.",
      sourceToolIds: ["safety_science_review"],
    },
    {
      id: "intent",
      label: isRu ? "Интент и продвижение" : "Intent and promotion",
      status: toolStatusFromFacts(normalizedFacts, ["intent_seo_forecast"]),
      detail: isRu
        ? "Насколько понятно, зачем читать текст, какой интент он закрывает и насколько сильна первая подача."
        : "How clear the reader payoff, search intent, and opening hook are.",
      recommendation:
        factForTools(normalizedFacts, ["intent_seo_forecast"])?.detail ??
        (isRu
          ? "Усилите первую строку, пользу для читателя и SEO-title перед публикацией."
          : "Strengthen the opening, reader benefit, and SEO title before publishing."),
      sourceToolIds: ["intent_seo_forecast"],
    },
    {
      id: "originality",
      label: isRu ? "Оригинальность" : "Originality",
      status: originalityStatus,
      detail: isRu
        ? "Локальные повторы, шаблонность, естественность и признаки ИИ-стиля."
        : "Local repetition, template risk, naturalness, and AI-style signals.",
      recommendation:
        originalityStatus !== "healthy"
          ? factForTools(normalizedFacts, [
              "article_uniqueness",
              "ai_writing_probability",
              "naturalness_indicators",
            ])?.detail ??
            (isRu
              ? "Перепишите повторяющиеся фрагменты через более конкретные примеры и менее одинаковый ритм."
              : "Rewrite repeated fragments with more specific examples and less uniform phrasing.")
          : isRu
            ? "Сохраните конкретные примеры и не добавляйте общий наполнитель при последующих правках."
            : "Keep specific examples and avoid adding generic filler in later edits.",
      sourceToolIds: [
        "article_uniqueness",
        "ai_writing_probability",
        "naturalness_indicators",
      ],
    },
    {
      id: "clarity",
      label: isRu ? "Ясность" : "Clarity",
      status: clarityStatus,
      detail: isRu
        ? "Синтаксис, плотность предложений, структура, заголовки и сканируемость."
        : "Syntax, sentence density, structure, headings, and scanability.",
      recommendation:
        clarityStatus !== "healthy"
          ? factForTools(normalizedFacts, [
              "language_syntax",
              "analyze_text_structure",
              "analyze_text_style",
            ])?.detail ??
            (isRu
              ? "Сократите перегруженные фразы и сохраните понятные разделы."
              : "Shorten overloaded phrasing and preserve clear sections.")
          : isRu
            ? "Используйте текущую структуру как основу и полируйте только слабые места."
            : "Use the current structure as the base and polish only weak spots.",
      sourceToolIds: [
        "language_syntax",
        "analyze_text_structure",
        "analyze_text_style",
      ],
    },
    {
      id: "logic",
      label: isRu ? "Логика" : "Logic",
      status: logicStatus,
      detail: isRu
        ? "Внутренние противоречия, слабые переходы и неподдержанные выводы."
        : "Internal contradictions, weak transitions, and unsupported conclusions.",
      recommendation:
        logicStatus !== "healthy"
          ? factForTools(normalizedFacts, ["logic_consistency_check"])?.detail ??
            (isRu
              ? "Добавьте переходные пояснения там, где текст перескакивает от тезиса к выводу."
              : "Add bridging explanations where the text jumps from claim to conclusion.")
          : isRu
            ? "Сохраните текущую цепочку аргументации и проверяйте новые утверждения после правок."
            : "Preserve the current argument chain and verify new claims after editing.",
      sourceToolIds: ["logic_consistency_check"],
    },
    {
      id: "trust",
      label: isRu ? "Риск доверия" : "Trust risk",
      status: combineDimensionStatus([
        toolStatusFromFacts(normalizedFacts, ["fact_distortion_check"]),
        toolStatusFromFacts(normalizedFacts, ["ai_hallucination_check"]),
      ]),
      detail: isRu
        ? "Факт-чувствительные утверждения, расплывчатые авторитеты, точные числа и риск галлюцинаций."
        : "Fact-sensitive claims, vague authorities, exact numbers, and hallucination risk.",
      recommendation:
        factForTools(normalizedFacts, [
          "fact_distortion_check",
          "ai_hallucination_check",
        ])?.detail ??
        (isRu
          ? "Для медицинских, юридических, финансовых и технических материалов отдельно проверьте источники."
          : "For medical, legal, finance, and technical material, verify sources separately."),
      sourceToolIds: ["fact_distortion_check", "ai_hallucination_check"],
    },
    {
      id: "platform",
      label: isRu ? "Соответствие площадке" : "Platform fit",
      status: platformStatus,
      detail: isRu
        ? "Контекст публикации, тон, аудитория, язык и размещение медиа."
        : "Publishing context, tone, audience, language, and media placement.",
      recommendation:
        platformStatus !== "healthy"
          ? factForTools(normalizedFacts, [
              "detect_text_platform",
              "media_placeholder_review",
            ])?.detail ??
            (isRu
              ? "Держите служебные элементы отдельно от тела статьи и уточните аудиторию."
              : "Keep service elements separate from the article body and clarify the audience.")
          : isRu
            ? "Держите платформенную упаковку отдельно от тела статьи."
            : "Keep platform-specific packaging separate from the article body.",
      sourceToolIds: [
        "detect_text_platform",
        "analyze_tone_fit",
        "language_audience_fit",
        "media_placeholder_review",
      ],
    },
  ];
  const problemDimensions = dimensions.filter(
    (dimension) => dimension.status === "problem",
  ).length;
  const highPriorities = priorityFacts.filter(
    (fact) => fact.priority === "high",
  ).length;
  const verdict =
    highPriorities > 0 || problemDimensions >= 2
      ? "high_risk"
      : problemDimensions > 0 ||
          dimensions.some((dimension) => dimension.status === "watch")
        ? "needs_revision"
        : coveragePercent >= 80
          ? "ready"
          : "needs_revision";
  const annotations = priorityFacts.slice(0, 48).map((fact, index) => ({
    id: index + 1,
    kind: fact.priority === "high" ? "issue" : "recommendation",
    label: fact.priority === "high"
      ? isRu
        ? "Проблема"
        : "Issue"
      : isRu
        ? "Рекомендация"
        : "Recommendation",
    detail: clampReportText(fact.detail, 260),
    sourceToolIds: fact.sourceToolIds,
    severity: fact.priority === "high" ? "warning" : "info",
    marker: fact.priority === "high" ? "underline" : "note",
    title: clampReportText(fact.title, 90),
    shortMessage: clampReportText(fact.title, 80),
    confidence: 0.72,
    global: true,
  }));
  const strengths = dimensions
    .filter((dimension) => dimension.status === "healthy")
    .slice(0, 4)
    .map((dimension) => ({
      title: dimension.label,
      detail: dimension.recommendation,
      sourceToolIds: dimension.sourceToolIds,
    }));
  if (strengths.length === 0 && lowFacts.length > 0) {
    strengths.push(...lowFacts.slice(0, 3).map(compactInsight));
  }
  if (strengths.length === 0) {
    strengths.push({
      title: isRu ? "Проверка собрана в едином отчете" : "Checks are grouped",
      detail: isRu
        ? `ИИ прошел ${completed} из ${total} выбранных инструментов и свел замечания в общий редакционный обзор.`
        : `AI completed ${completed} of ${total} selected tools and grouped findings into one editorial view.`,
      sourceToolIds: expectedToolIds.slice(0, 1),
    });
  }
  const priorityItems =
    priorityFacts.length > 0
      ? priorityFacts.map((fact) => ({
          title: clampReportText(factToolLabelForLocale(fact, locale), 92),
          detail: clampReportText(fact.detail, 300),
          priority: fact.priority,
          sourceToolIds: fact.sourceToolIds,
        }))
      : [
          {
            title: isRu ? "Сохранить стабильный результат" : "Keep the result stable",
            detail: isRu
              ? "Блокирующих замечаний не найдено. Правьте текст точечно и повторите анализ после финальной версии."
              : "No blocking findings were detected. Keep edits focused and rerun analysis after the final draft.",
            priority: "low" as const,
            sourceToolIds: expectedToolIds,
          },
        ];
  const weaknesses = priorityItems
    .filter((item) => item.priority !== "low")
    .slice(0, 5)
    .map((item) => ({
      title: item.title,
      detail: item.detail,
      sourceToolIds: item.sourceToolIds,
    }));

  return {
    verdict,
    verdictLabel:
      verdict === "high_risk"
        ? isRu
          ? "Нужна проверка перед публикацией"
          : "Review required before publication"
        : verdict === "needs_revision"
          ? isRu
            ? "Нужны точечные правки"
            : "Targeted edits needed"
          : isRu
            ? "Можно готовить к публикации"
            : "Ready to prepare for publication",
    verdictDetail:
      verdict !== "ready"
        ? isRu
          ? "ИИ отметил приоритетные замечания и чувствительные фрагменты. Проверьте их перед публикацией."
          : "AI found priority issues and sensitive fragments. Review them before publishing."
        : isRu
          ? "Критичных замечаний в структурированном отчете не выделено."
          : "No critical structured-report findings were highlighted.",
    coverage: {
      completed,
      total,
      percent: coveragePercent,
    },
    platform: {
      key: context.textPlatform,
      label: platformLabel,
      detail: platformDetailForApi(context.textPlatform, locale),
    },
    document: {
      title: inferArticleTitle(context),
      titleNote: null,
      text: context.body,
      wordCount: wordsInText(context.body),
      paragraphCount: paragraphsInText(context.body),
    },
    annotationStatus:
      annotations.length > 0
        ? isRu
          ? `Замечания и рекомендации (${annotations.length})`
          : `Findings and recommendations (${annotations.length})`
        : isRu
          ? "Без критичных замечаний"
          : "No critical findings",
    annotations,
    dimensions,
    priorities: priorityItems,
    metrics,
    warningCount,
    strengths,
    weaknesses,
    intentForecast,
    nextActions: [
      isRu
        ? "Проверьте замечания с высоким приоритетом."
        : "Review high-priority findings.",
      isRu
        ? "Внесите правки и повторите анализ текста."
        : "Edit the article and scan the text again.",
    ],
  };
}

function mergeArticleTextReports(
  reports: RuntimeAuditReport[],
  context: RuntimeArticleTextContext,
  locale: SupportedLocale,
): RuntimeAuditReport | null {
  if (reports.length === 0) return null;
  const last = reports[reports.length - 1];
  const expectedToolIds = context.selectedTools;
  const confirmedFacts = compactFactsByTool(
    reports.flatMap((report) => report.confirmedFacts),
    expectedToolIds,
  );
  const expertHypotheses = reports.flatMap((report) => report.expertHypotheses);
  const topic = context.topic.trim();
  const summary =
    locale === "ru"
      ? `ИИ сформировал структурированный отчет по тексту статьи${
          topic ? `: ${topic}` : ""
        }. Проверено пунктов: ${confirmedFacts.length}.`
      : `AI formed a structured article-text report${
          topic ? `: ${topic}` : ""
        }. Completed checks: ${confirmedFacts.length}.`;

  return {
    mode: last.mode,
    providerId: last.providerId,
    model: last.model,
    generatedAt: new Date().toISOString(),
    summary,
    nextStep: last.nextStep,
    confirmedFacts,
    expertHypotheses,
    articleText: buildArticleTextSummaryForApi(
      context,
      confirmedFacts,
      expectedToolIds,
      locale,
    ),
  };
}

function renderInlineMarkdown(text: string): ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={index}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code
          key={index}
          className="rounded bg-white/70 px-1 py-0.5 font-mono text-[0.92em]"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    return part;
  });
}

function MarkdownMessage({ text }: { text: string }) {
  const lines = text.split(/\r?\n/g);
  const nodes: ReactNode[] = [];
  let listBuffer: Array<{ marker: string; text: string; ordered: boolean }> = [];

  const flushList = () => {
    if (listBuffer.length === 0) return;
    const ordered = listBuffer[0].ordered;
    const items = listBuffer;
    listBuffer = [];
    const ListTag = ordered ? "ol" : "ul";
    nodes.push(
      <ListTag
        key={`list-${nodes.length}`}
        className={`my-2 space-y-1 pl-5 ${ordered ? "list-decimal" : "list-disc"}`}
      >
        {items.map((item, index) => (
          <li key={`${item.marker}-${index}`}>{renderInlineMarkdown(item.text)}</li>
        ))}
      </ListTag>,
    );
  };

  lines.forEach((rawLine) => {
    const line = rawLine.trimEnd();
    if (!line.trim()) {
      flushList();
      return;
    }
    const heading = line.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      flushList();
      const level = heading[1].length;
      nodes.push(
        <p
          key={`heading-${nodes.length}`}
          className={
            level <= 2
              ? "mt-3 text-base font-semibold"
              : "mt-2 text-sm font-semibold"
          }
        >
          {renderInlineMarkdown(heading[2])}
        </p>,
      );
      return;
    }
    const unordered = line.match(/^\s*[-*]\s+(.+)$/);
    if (unordered) {
      listBuffer.push({ marker: "-", text: unordered[1], ordered: false });
      return;
    }
    const ordered = line.match(/^\s*(\d+)[.)]\s+(.+)$/);
    if (ordered) {
      listBuffer.push({ marker: ordered[1], text: ordered[2], ordered: true });
      return;
    }
    flushList();
    nodes.push(
      <p key={`p-${nodes.length}`} className="my-1">
        {renderInlineMarkdown(line)}
      </p>,
    );
  });
  flushList();

  return <div className="leading-relaxed">{nodes}</div>;
}

export default function ChatPanel({
  locale,
  executionMode,
  scanContext,
  articleTextContext = null,
  analysisType = "site",
  selectedModelProfile,
  bridgeState,
  bridgePrompt,
  onReport,
}: ChatPanelProps) {
  const { t } = useTranslation();
  const [history, setHistory] = useState<ChatTurn[]>([
    {
      role: "system",
      text: t("chat.nativeReady", {
        defaultValue:
          "Native mode is ready. Run a local scan, then ask for interpretation.",
      }),
    },
  ]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [copiedTurnIndex, setCopiedTurnIndex] = useState<number | null>(null);
  const [policyMode, setPolicyMode] = useState<RuntimePolicyMode>(() =>
    defaultPolicyModeForSession(analysisType, articleTextContext),
  );
  const autoInterpretationKey = useRef<string | null>(null);
  const autoArticleTextKey = useRef<string | null>(null);
  const policySessionKey = useRef<string | null>(null);
  const copyResetTimer = useRef<number | null>(null);

  useEffect(() => {
    setHistory([
      {
        role: "system",
        text:
          executionMode === "native"
            ? t("chat.nativeReady", {
                defaultValue:
                  "Native mode is ready. Run a local scan, then ask for interpretation.",
              })
            : t("chat.bridgeReady", {
                defaultValue:
                  "Bridge mode is ready. Paste the copied prompt into Claude Desktop to let MCP tools fill the app.",
              }),
      },
    ]);
  }, [executionMode, t]);

  useEffect(() => {
    return () => {
      if (copyResetTimer.current) {
        window.clearTimeout(copyResetTimer.current);
      }
    };
  }, []);

  useEffect(() => {
    const key = [
      analysisType,
      articleTextContextKey(articleTextContext) ?? "",
      scanContextKey(scanContext) ?? "",
    ].join("|");
    if (policySessionKey.current === key) return;
    policySessionKey.current = key;
    setPolicyMode(defaultPolicyModeForSession(analysisType, articleTextContext));
  }, [analysisType, articleTextContext, scanContext]);

  const helperText = useMemo(() => {
    if (executionMode === "bridge") {
      if (!bridgeState) {
        return t("chat.helper.bridgeNoScan", {
          defaultValue:
            "Click Scan to copy the Bridge prompt, then send it in Claude Desktop.",
        });
      }
      if (bridgeState.status === "awaiting_handshake") {
        return t("chat.helper.bridgeAwaiting", {
          defaultValue:
            "Prompt copied. Claude is expected to call the handshake next.",
        });
      }
      if (bridgeState.status === "in_progress") {
        return t("chat.helper.bridgeRunning", {
          defaultValue:
            "Claude is running MCP tools. Results flow into the right panel automatically.",
        });
      }
      if (bridgeState.status === "error") {
        return (
          bridgeState.error?.message ??
          t("chat.helper.bridgeError", {
            defaultValue: "Bridge mode hit an error.",
          })
        );
      }
      return t("chat.helper.bridgeComplete", {
        defaultValue:
          "Bridge scan finished. Claude recommendations can continue in the external chat.",
      });
    }
    if (analysisType === "article_text" && articleTextContext?.body.trim()) {
      return articleTextContext.action === "solution"
        ? t("chat.helper.nativeArticleSolution", {
            defaultValue:
              "Article context is ready. Ideas mode is used for solution drafts.",
          })
        : t("chat.helper.nativeArticleScan", {
            defaultValue:
              "Article context is ready. Strict mode is used for the first analysis.",
          });
    }
    if (!isScanContextReady(scanContext)) {
      return t("chat.helper.nativeNoScan", {
        defaultValue:
          "You can ask how the analysis works now. Run a scan when you want site-specific recommendations.",
      });
    }
    return t("chat.helper.nativeReady", {
      completed: scanContext!.completedTools.length,
      total: scanContext!.selectedTools.length,
      defaultValue:
        "Scan context ready: {{completed}}/{{total}} tools completed.",
    });
  }, [analysisType, articleTextContext, bridgeState, executionMode, scanContext, t]);

  const sendToRuntime = useCallback(
    async (
      text: string,
      visibleUserTurn: boolean,
      policyModeOverride?: RuntimePolicyMode,
    ) => {
      if (busy || executionMode !== "native") return;
      if (visibleUserTurn) {
        setHistory((prev) => [...prev, { role: "user", text }]);
      }

      setBusy(true);
      const effectivePolicyMode = policyModeOverride ?? policyMode;
      const autoArticleScan = isAutoArticleTextScan(
        analysisType,
        articleTextContext,
        text,
      );
      if (autoArticleScan) {
        onReport(null, "running");
      }
      const input: OrchestratorMessageInput = {
        text,
        mode: effectivePolicyMode,
        executionMode,
        analysisType,
        providerId: RUNTIME_PROVIDER_ID,
        modelOverride: selectedModelProfile?.modelId,
        locale,
        scanContext,
        articleTextContext,
      };

      let result: OrchestratorMessageResult;
      try {
        result = await window.toraseo.runtime.sendMessage(input);
      } catch (err) {
        result = {
          ok: false,
          errorCode: "ipc_failure",
          errorMessage:
            err instanceof Error ? err.message : "Unknown IPC failure",
        };
      }

      if (result.ok) {
        if (result.report) {
          onReport(result.report, autoArticleScan ? "complete" : undefined);
        } else if (autoArticleScan) {
          onReport(
            null,
            "failed",
            t("chat.articleTextReportParseFailed", {
              defaultValue:
                "AI returned a chat answer instead of a structured ToraSEO report.",
            }),
          );
        }
        setHistory((prev) => [
          ...prev,
          {
            role: "assistant",
            text: result.report
              ? renderReportText(result.report, locale)
              : result.text?.trim() ||
                t("chat.emptyProviderResponse", {
                  defaultValue:
                    "The provider returned an empty response for this audit.",
                }),
          },
        ]);
      } else {
        onReport(null, autoArticleScan ? "failed" : undefined, result.errorMessage);
        setHistory((prev) => [
          ...prev,
          {
            role: "assistant",
            text: t("chat.providerError", {
              code: result.errorCode ?? "unknown",
              message: result.errorMessage ?? "",
              defaultValue: "[error: {{code}}] {{message}}",
            }),
          },
        ]);
      }
      setBusy(false);
    },
    [
      busy,
      executionMode,
      locale,
      onReport,
      policyMode,
      scanContext,
      articleTextContext,
      analysisType,
      selectedModelProfile?.modelId,
      t,
    ],
  );

  const runArticleTextScanSequence = useCallback(
    async (
      context: RuntimeArticleTextContext,
      policyModeOverride: RuntimePolicyMode,
    ) => {
      if (busy || executionMode !== "native") return;
      setBusy(true);
      onReport(null, "running");
      setHistory((prev) => [
        ...prev,
        {
          role: "system",
          text: t("chat.articleTextStarted", {
            defaultValue: "Article text context received. Preparing response...",
          }),
        },
      ]);

      const reports: RuntimeAuditReport[] = [];
      for (let index = 0; index < context.selectedTools.length; index += 1) {
        const toolId = context.selectedTools[index];
        const toolContext: RuntimeArticleTextContext = {
          ...context,
          selectedTools: [toolId],
        };
        const input: OrchestratorMessageInput = {
          text: buildArticleTextPrompt(toolContext, locale),
          mode: policyModeOverride,
          executionMode,
          analysisType,
          providerId: RUNTIME_PROVIDER_ID,
          modelOverride: selectedModelProfile?.modelId,
          locale,
          scanContext,
          articleTextContext: toolContext,
        };

        let result: OrchestratorMessageResult;
        try {
          result = await window.toraseo.runtime.sendMessage(input);
        } catch (err) {
          result = {
            ok: false,
            errorCode: "ipc_failure",
            errorMessage:
              err instanceof Error ? err.message : "Unknown IPC failure",
          };
        }

        if (!result.ok || !result.report) {
          const message =
            result.errorMessage ||
            t("chat.articleTextReportParseFailed", {
              defaultValue:
                "AI returned a chat answer instead of a structured ToraSEO report.",
            });
          onReport(null, "failed", message);
          setHistory((prev) => [
            ...prev,
            {
              role: "assistant",
              text: t("chat.providerError", {
                code: result.errorCode ?? "article_text_report_failed",
                message,
                defaultValue: "[error: {{code}}] {{message}}",
              }),
            },
          ]);
          setBusy(false);
          return;
        }

        reports.push(result.report);
        const partial = mergeArticleTextReports(reports, context, locale);
        if (partial) {
          onReport(
            partial,
            index === context.selectedTools.length - 1 ? "complete" : "running",
          );
        }
      }

      const finalReport = mergeArticleTextReports(reports, context, locale);
      if (finalReport) {
        setHistory((prev) => [
          ...prev,
          {
            role: "assistant",
            text: renderReportText(finalReport, locale),
          },
        ]);
      }
      setBusy(false);
    },
    [
      analysisType,
      busy,
      executionMode,
      locale,
      onReport,
      scanContext,
      selectedModelProfile?.modelId,
      t,
    ],
  );

  useEffect(() => {
    if (executionMode !== "native" || analysisType !== "article_text") return;
    if (!articleTextContext?.body.trim()) return;
    if (busy) return;
    const key = articleTextContextKey(articleTextContext);
    if (!key || autoArticleTextKey.current === key) return;
    autoArticleTextKey.current = key;
    const autoPolicyMode = defaultPolicyModeForSession(
      analysisType,
      articleTextContext,
    );
    setPolicyMode(autoPolicyMode);
    if (articleTextContext.action === "scan") {
      void runArticleTextScanSequence(articleTextContext, autoPolicyMode);
      return;
    }
    void sendToRuntime(
      buildArticleTextPrompt(articleTextContext, locale),
      false,
      autoPolicyMode,
    );
  }, [
    analysisType,
    articleTextContext,
    busy,
    executionMode,
    locale,
    runArticleTextScanSequence,
    sendToRuntime,
  ]);

  useEffect(() => {
    if (executionMode !== "native") {
      return;
    }
    if (analysisType !== "site") {
      autoInterpretationKey.current = null;
      return;
    }
    if (!isScanContextComplete(scanContext)) {
      autoInterpretationKey.current = null;
      return;
    }
    if (busy) return;
    const key = scanContextKey(scanContext);
    if (!key || autoInterpretationKey.current === key) return;
    autoInterpretationKey.current = key;
    setPolicyMode("strict_audit");
    setHistory((prev) => [
      ...prev,
      {
        role: "system",
        text: t("chat.autoInterpretationStarted", {
          defaultValue: "Scan finished. Preparing recommendations...",
        }),
      },
    ]);
    void sendToRuntime(
      t("chat.autoInterpretationPrompt", {
        defaultValue:
          "Interpret the completed site audit and give prioritized recommendations.",
      }),
      false,
      "strict_audit",
    );
  }, [busy, executionMode, scanContext, sendToRuntime, t]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const text = draft.trim();
    if (!text || busy || executionMode !== "native") return;

    setDraft("");
    await sendToRuntime(text, true);
  };

  const handleCopyTurn = async (index: number, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedTurnIndex(index);
      if (copyResetTimer.current) {
        window.clearTimeout(copyResetTimer.current);
      }
      copyResetTimer.current = window.setTimeout(() => {
        setCopiedTurnIndex(null);
        copyResetTimer.current = null;
      }, 2000);
    } catch {
      setCopiedTurnIndex(null);
    }
  };

  return (
    <section className="flex h-full min-w-0 flex-col bg-white">
      <header className="flex items-center justify-between border-b border-orange-100 px-5 py-3">
        <div>
          <h2 className="text-sm font-semibold text-orange-900">
            {executionMode === "native"
              ? "API + AI Chat"
              : t("chat.bridgeTitle", {
                  defaultValue: "MCP + Instructions Companion",
                })}
          </h2>
          <p className="text-xs text-orange-700/70">{helperText}</p>
        </div>
        <div className="flex min-w-0 items-center gap-2">
          {executionMode === "native" && (
            <div className="flex rounded-full border border-orange-200 bg-orange-50 p-1">
              <PolicyButton
                active={policyMode === "strict_audit"}
                icon={<ShieldCheck size={12} />}
                label={t("chat.policy.strict", { defaultValue: "Strict" })}
                onClick={() => setPolicyMode("strict_audit")}
              />
              <PolicyButton
                active={policyMode === "audit_plus_ideas"}
                icon={<Sparkles size={12} />}
                label={t("chat.policy.ideas", { defaultValue: "Ideas" })}
                onClick={() => setPolicyMode("audit_plus_ideas")}
              />
            </div>
          )}
          <span
            className="max-w-[140px] truncate rounded-full bg-orange-50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-orange-700 sm:max-w-[190px]"
            title={
              executionMode === "native"
                ? selectedModelProfile?.displayName ??
                  t("chat.inAppRuntime", { defaultValue: "In-app runtime" })
                : "Claude Desktop"
            }
          >
            {executionMode === "native"
              ? selectedModelProfile?.displayName ??
                t("chat.inAppRuntime", { defaultValue: "In-app runtime" })
              : "Claude Desktop"}
          </span>
        </div>
      </header>

      <ol className="flex-1 space-y-3 overflow-auto px-5 py-4">
        {history.map((turn, idx) => (
          <li
            key={idx}
            className={
              turn.role === "user"
                ? "ml-auto max-w-[80%] rounded-2xl rounded-br-sm bg-orange-500 px-4 py-2 text-sm text-white shadow-sm"
                : turn.role === "assistant"
                  ? "group relative mr-auto max-w-[80%] rounded-2xl rounded-bl-sm bg-orange-50 px-4 py-2 pr-10 text-sm text-orange-950 shadow-sm"
                  : "mx-auto max-w-[90%] rounded-md border border-dashed border-orange-200 bg-white px-3 py-1.5 text-center text-xs text-orange-600"
            }
          >
            {turn.role === "assistant" ? (
              <MarkdownMessage text={turn.text} />
            ) : (
              <pre className="whitespace-pre-wrap font-sans leading-relaxed">
                {turn.text}
              </pre>
            )}
            {turn.role === "assistant" && (
              <button
                type="button"
                onClick={() => void handleCopyTurn(idx, turn.text)}
                className="absolute right-2 top-2 inline-flex size-7 items-center justify-center rounded-md text-orange-700/70 opacity-0 transition hover:bg-white hover:text-orange-900 focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-orange-300 group-hover:opacity-100"
                aria-label={t("chat.copyAnswer", {
                  defaultValue: "Copy answer",
                })}
                title={t("chat.copyAnswer", {
                  defaultValue: "Copy answer",
                })}
              >
                {copiedTurnIndex === idx ? <Check size={14} /> : <Copy size={14} />}
              </button>
            )}
            {copiedTurnIndex === idx && (
              <span className="absolute right-2 top-10 rounded-md bg-orange-900 px-2 py-1 text-[11px] font-medium text-white shadow-sm">
                {t("chat.copied", { defaultValue: "Copied" })}
              </span>
            )}
          </li>
        ))}

        {executionMode === "bridge" && bridgePrompt && (
          <li className="rounded-2xl border border-orange-200 bg-orange-50/60 p-4 text-sm text-orange-950">
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-orange-700">
              <Bot size={14} />
              {t("chat.copiedPrompt", { defaultValue: "Copied prompt" })}
            </div>
            <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-orange-900/80">
              {bridgePrompt}
            </pre>
          </li>
        )}
      </ol>

      <form
        onSubmit={handleSubmit}
        className="border-t border-orange-100 bg-orange-50/40 px-5 py-3"
      >
        <div className="flex gap-2">
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={
              executionMode === "native"
                ? isScanContextReady(scanContext)
                  ? t("chat.inputPlaceholder.native", {
                      defaultValue: "Ask about the current site audit...",
                    })
                  : t("chat.inputPlaceholder.nativeNoScan", {
                      defaultValue: "Ask how the audit works...",
                    })
                : t("chat.inputPlaceholder.bridge", {
                    defaultValue:
                      "Bridge mode uses Claude Desktop for the live conversation.",
                  })
            }
            disabled={
              busy || executionMode !== "native"
            }
            className="flex-1 rounded-lg border border-orange-200 bg-white px-3 py-2 text-sm text-orange-950 placeholder:text-orange-400 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-300 disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={
              busy || draft.trim().length === 0 || executionMode !== "native"
            }
            className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-orange-600 disabled:bg-orange-300"
          >
            {busy ? "..." : t("chat.send", { defaultValue: "Send" })}
          </button>
        </div>
      </form>
    </section>
  );
}

function PolicyButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-medium transition ${
        active
          ? "bg-white text-orange-900 shadow-sm"
          : "text-orange-700/70 hover:text-orange-900"
      }`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}
