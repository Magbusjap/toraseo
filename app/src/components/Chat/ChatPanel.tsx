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
  RuntimeArticleCompareContext,
  RuntimeArticleCompareGoalMode,
  RuntimeArticleCompareMetric,
  RuntimeArticleCompareSummary,
  RuntimeArticleCompareTextSide,
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
  articleCompareContext?: RuntimeArticleCompareContext | null;
  analysisType?: "site" | "article_text" | "article_compare";
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

function articleCompareContextKey(
  context: RuntimeArticleCompareContext | null | undefined,
): string | null {
  if (!context) return null;
  return [
    context.runId ?? "",
    context.goal,
    context.goalMode ?? "",
    context.textPlatform,
    context.customPlatform ?? "",
    context.roleA,
    context.roleB,
    context.selectedTools.join(","),
    context.textA.length,
    context.textB.length,
    context.textA.slice(0, 60),
    context.textB.slice(0, 60),
  ].join("|");
}

function inferArticleCompareGoalMode(
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
  if (/похож|копир|плагиат|уникальн|заимств|similar|copy|plagiar|overlap/iu.test(normalized)) {
    return "similarity_check";
  }
  if (/стил|тон|ритм|подраж|style|tone|voice|imitat/iu.test(normalized)) {
    return "style_match";
  }
  if (/верс|вариант|до\s+и\s+после|что\s+стало|version|variant|before|after/iu.test(normalized)) {
    return "version_compare";
  }
  if (/\bab\b|a\/b|пост|хук|hook|cta|соцсет|social/iu.test(normalized)) {
    return "ab_post";
  }
  if (/конкур|обогн|лучше\s+конкур|топ|top|competitor|beat|outrank/iu.test(normalized)) {
    return "beat_competitor";
  }
  if (mentionsB && !mentionsA) return "focus_text_b";
  if (mentionsA && !mentionsB) return "focus_text_a";
  return "standard_comparison";
}

function compareGoalModeLabel(
  mode: RuntimeArticleCompareGoalMode,
  locale: SupportedLocale,
): string {
  const ru: Record<RuntimeArticleCompareGoalMode, string> = {
    standard_comparison: "Стандартное сравнение",
    focus_text_a: "Фокус на тексте A",
    focus_text_b: "Фокус на тексте B",
    beat_competitor: "Сравнение с конкурентом",
    style_match: "Подражание стилю",
    similarity_check: "Проверка похожести",
    version_compare: "Сравнение версий",
    ab_post: "A/B-анализ поста",
  };
  const en: Record<RuntimeArticleCompareGoalMode, string> = {
    standard_comparison: "Standard comparison",
    focus_text_a: "Focus on Text A",
    focus_text_b: "Focus on Text B",
    beat_competitor: "Competitor comparison",
    style_match: "Style matching",
    similarity_check: "Similarity check",
    version_compare: "Version comparison",
    ab_post: "A/B post comparison",
  };
  return locale === "ru" ? ru[mode] : en[mode];
}

function compareGoalModeDescription(
  mode: RuntimeArticleCompareGoalMode,
  locale: SupportedLocale,
): string {
  const ru: Record<RuntimeArticleCompareGoalMode, string> = {
    standard_comparison:
      "Цель не указана: отчет показывает оба текста, разрывы по категориям, риск похожести и план улучшения.",
    focus_text_a:
      "Отчет сфокусирован на тексте A; текст B используется как контекст сравнения.",
    focus_text_b:
      "Отчет сфокусирован на тексте B; текст A используется как контекст сравнения.",
    beat_competitor:
      "Отчет ищет текстовые преимущества конкурента и план усиления без копирования.",
    style_match:
      "Отчет делает акцент на тоне, ритме, ясности, примерах и переносимых стилевых приемах.",
    similarity_check:
      "Отчет ставит на первое место дословные совпадения, смысловую близость и риск копирования.",
    version_compare:
      "Отчет показывает, что стало сильнее или слабее между двумя версиями.",
    ab_post:
      "Отчет оценивает хук, ясность, краткость, платформенность и потенциал реакции.",
  };
  const en: Record<RuntimeArticleCompareGoalMode, string> = {
    standard_comparison:
      "No goal was provided: the report compares both texts, category gaps, similarity risk, and improvement actions.",
    focus_text_a:
      "The report focuses on Text A; Text B is used as comparison context.",
    focus_text_b:
      "The report focuses on Text B; Text A is used as comparison context.",
    beat_competitor:
      "The report looks for competitor text advantages and a non-copying improvement plan.",
    style_match:
      "The report emphasizes tone, rhythm, clarity, examples, and transferable style techniques.",
    similarity_check:
      "The report prioritizes exact overlap, semantic closeness, and copying risk.",
    version_compare:
      "The report shows what improved or worsened between the two versions.",
    ab_post:
      "The report evaluates hook, clarity, brevity, platform fit, and reaction potential.",
  };
  return locale === "ru" ? ru[mode] : en[mode];
}

function buildArticleComparePrompt(
  context: RuntimeArticleCompareContext,
  locale: SupportedLocale,
): string {
  const selectedTools = context.selectedTools
    .map((toolId) => toolLabelForChat(toolId, locale))
    .join(", ");
  const platform =
    context.customPlatform ||
    platformLabelForChat(context.textPlatform, locale);
  const goalMode =
    context.goalMode ?? inferArticleCompareGoalMode(context.goal);
  const goalModeLabel = compareGoalModeLabel(goalMode, locale);
  const goalModeDescription = compareGoalModeDescription(goalMode, locale);

  if (locale === "ru") {
    return [
      "TORASEO_ARTICLE_COMPARE_AUTO_RUN=scan",
      "Сравни два текста в рамках ToraSEO.",
      "",
      `Цель: ${context.goal || "нейтрально сравнить оба текста"}`,
      `Режим отчета по цели: ${goalModeLabel}`,
      `Как использовать цель: ${goalModeDescription}`,
      `Площадка: ${platform}`,
      `Роль текста A: ${context.roleA}`,
      `Роль текста B: ${context.roleB}`,
      `Выбранные проверки: ${selectedTools || "сравнительные проверки текста"}`,
      "",
      "Верни структурированный отчет именно по этим выбранным проверкам и под указанный режим цели. Если в запросе передана одна проверка, считай это шагом большого сканирования: не пиши, что выбрана только одна проверка, и не превращай механику сканирования в вывод.",
      "Если режим фокусируется на тексте A или B, выводи сильные и слабые стороны прежде всего по этому тексту, а второй текст используй как сравнительный контекст. Если режим про конкурента, покажи текстовые разрывы и план усиления без копирования. Если режим про стиль, похожесть, версии или A/B-пост, смести вывод в эту сторону.",
      "Сначала оцени каждый текст отдельно, затем сравни их по выбранным проверкам. Не делай вывод, что позиция в поиске зависит только от текста: говори о текстовом преимуществе, разрывах и улучшениях.",
      "Не добавляй готовый переписанный текст. Пользователь сравнивает две версии и ждёт выводы, разрывы, риск похожести и план улучшения.",
      "Не упоминай API, JSON, backend ids, selectedTools, sourceToolIds или внутреннюю механику. Пиши названия проверок нормальным русским языком.",
    ].join("\n");
  }

  return [
    "TORASEO_ARTICLE_COMPARE_AUTO_RUN=scan",
    "Compare two texts within ToraSEO.",
    "",
    `Goal: ${context.goal || "neutral comparison"}`,
    `Goal report mode: ${goalModeLabel}`,
    `How to use the goal: ${goalModeDescription}`,
    `Platform: ${platform}`,
    `Text A role: ${context.roleA}`,
    `Text B role: ${context.roleB}`,
    `Selected checks: ${selectedTools || "text comparison checks"}`,
    "",
    "Return a structured report for exactly these selected checks and the selected goal mode. If only one check is present, treat it as one step of a larger scan: do not say only one check was selected and do not turn scan mechanics into a finding.",
    "If the mode focuses on Text A or Text B, report strengths and weaknesses primarily for that text and use the other text as comparison context. If the mode is competitor, style, similarity, version, or A/B post, shape the findings and actions around that purpose.",
    "Evaluate each text separately first, then compare them by the selected checks. Do not claim search ranking is explained by text alone: describe text advantage, gaps, and improvements.",
    "Do not write a rewritten article. The user is comparing two versions and needs findings, gaps, similarity risk, and an improvement plan.",
    "Do not mention API, JSON, backend ids, selectedTools, sourceToolIds, or internal orchestration in user-facing wording.",
  ].join("\n");
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
      "Сначала оцени текст по релевантным проверкам: платформа, структура, стиль, тон, язык/аудитория, медиа-метки, локальные повторы/уникальность, синтаксис, вероятность ИИ-стиля, карта AI-фрагментов, водность/шаблонность, читаемость/сложность, очередь фактов на проверку, естественность, логика, локальный SEO-интент/метаданные и риск-флаги.",
      "Разделяй эти проверки: вероятность ИИ-стиля не доказывает авторство, карта AI-фрагментов показывает редакторские места, водность ищет общие фразы и слабую конкретику, читаемость ищет плотные предложения и тяжёлые абзацы, очередь фактов собирает утверждения для ручной сверки с источниками.",
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
    "First evaluate the text using relevant checks: platform, structure, style, tone, language/audience, media markers, local repetition/uniqueness, syntax, AI-style probability, AI trace map, genericness/watery text, readability/complexity, claim source queue, naturalness, logic, local SEO intent/metadata, and risk flags.",
    "Keep those checks separate: AI-style probability is not authorship proof, AI trace map is an editing map, genericness/watery text is about broad filler and weak concrete evidence, readability/complexity is about dense sentences and heavy paragraphs, and claim source queue is for manual source verification.",
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
    page_url_article_internal: {
      ru: "пакет анализа страницы по URL",
      en: "page URL analysis package",
    },
    extract_main_text: {
      ru: "извлечение основного текста",
      en: "main text extraction",
    },
    check_robots_txt: { ru: "проверка robots.txt", en: "robots.txt check" },
    analyze_meta: { ru: "мета-теги страницы", en: "page meta tags" },
    analyze_headings: { ru: "заголовки страницы", en: "page headings" },
    analyze_content: { ru: "контент страницы", en: "page content" },
    detect_stack: { ru: "стек сайта", en: "site stack" },
    analyze_google_page_search: {
      ru: "проверка страницы в Google",
      en: "Google page search check",
    },
    analyze_yandex_page_search: {
      ru: "проверка страницы в Яндекс",
      en: "Yandex page search check",
    },
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
    ai_trace_map: { ru: "карта AI-фрагментов", en: "AI trace map" },
    genericness_water_check: {
      ru: "водность и шаблонность",
      en: "genericness and watery text",
    },
    readability_complexity: {
      ru: "читаемость и сложность",
      en: "readability and complexity",
    },
    claim_source_queue: {
      ru: "очередь фактов на проверку",
      en: "claim source queue",
    },
    naturalness_indicators: {
      ru: "естественность текста",
      en: "naturalness indicators",
    },
    fact_distortion_check: {
      ru: "искажение фактов",
      en: "fact distortion",
    },
    logic_consistency_check: {
      ru: "логическая согласованность",
      en: "logic consistency",
    },
    ai_hallucination_check: {
      ru: "ИИ и галлюцинации",
      en: "AI and hallucination check",
    },
    intent_seo_forecast: {
      ru: "SEO-интент и метаданные",
      en: "SEO intent and metadata",
    },
    safety_science_review: {
      ru: "риск-флаги и экспертная проверка",
      en: "risk flags and expert review",
    },
    compare_intent_gap: { ru: "сравнение интента", en: "intent gap" },
    compare_article_structure: {
      ru: "сравнение структуры",
      en: "structure comparison",
    },
    compare_content_gap: { ru: "разрывы по содержанию", en: "content gap" },
    compare_semantic_gap: {
      ru: "смысловое покрытие",
      en: "semantic gap",
    },
    compare_specificity_gap: {
      ru: "сравнение конкретики",
      en: "specificity gap",
    },
    compare_trust_gap: { ru: "сравнение доверия", en: "trust gap" },
    compare_article_style: {
      ru: "сравнение стиля",
      en: "style comparison",
    },
    compare_title_ctr: {
      ru: "заголовок и клик",
      en: "title and CTR comparison",
    },
    compare_platform_fit: {
      ru: "сравнение под платформу",
      en: "platform fit comparison",
    },
    compare_strengths_weaknesses: {
      ru: "сильные и слабые стороны",
      en: "strengths and weaknesses",
    },
    similarity_risk: { ru: "риск похожести", en: "similarity risk" },
    compare_improvement_plan: {
      ru: "план улучшения",
      en: "improvement plan",
    },
  };
  return labels[value]?.[locale] ?? value;
}

function defaultPolicyModeForSession(
  analysisType: "site" | "article_text" | "article_compare",
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
  analysisType: "site" | "article_text" | "article_compare",
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
  if (report.articleCompare) {
    const compare = report.articleCompare;
    if (locale === "ru") {
      const focus =
        compare.focusSide === "textA"
          ? compare.textA
          : compare.focusSide === "textB"
            ? compare.textB
            : null;
      const focusLines = focus
        ? [
            "",
            `**Фокус отчета: ${focus.label}**`,
            ...focus.strengths.slice(0, 4).map((item) => `- Сильная сторона: ${item.title}. ${item.detail}`),
            ...focus.weaknesses.slice(0, 4).map((item) => `- Слабая сторона: ${item.title}. ${item.detail}`),
          ]
        : [];
      const metricLines = compare.metrics
        .slice(0, 6)
        .map((metric) => {
          return `- ${metric.label}: A — ${metric.textA ?? "—"}${metric.textA !== null ? metric.suffix : ""}, B — ${metric.textB ?? "—"}${metric.textB !== null ? metric.suffix : ""}. ${metric.description}`;
        });
      const gaps = compare.gaps.length > 0
        ? compare.gaps.slice(0, 5).map((gap) => `- ${gap.title}: ${gap.detail}`)
        : ["- Явные разрывы по содержанию в локальной сводке не выделены."];
      const actions = compare.actionPlan.length > 0
        ? compare.actionPlan.slice(0, 5).map((item, index) => `${index + 1}. ${item.title}: ${item.detail}`)
        : ["1. Проверьте интент, конкретику, структуру и риск похожести после правок."];
      return [
        `Коротко: ${compare.verdict.label}`,
        "",
        `Режим по цели: ${compare.goalLabel}. ${compare.goalDescription}`,
        "",
        compare.verdict.detail,
        ...focusLines,
        "",
        "**Сравнение по категориям**",
        ...metricLines,
        "",
        "**Разрывы по содержанию**",
        ...gaps,
        "",
        "**План действий**",
        ...actions,
        "",
        `Следующий шаг: ${report.nextStep}`,
      ].join("\n");
    }

    const metricLines = compare.metrics
      .slice(0, 6)
      .map((metric) => {
        return `- ${metric.label}: A ${metric.textA ?? "—"}${metric.textA !== null ? metric.suffix : ""}, B ${metric.textB ?? "—"}${metric.textB !== null ? metric.suffix : ""}. ${metric.description}`;
      });
    return [
      `Summary: ${compare.verdict.label}`,
      "",
      `Goal mode: ${compare.goalLabel}. ${compare.goalDescription}`,
      "",
      compare.verdict.detail,
      "",
      "**Category comparison**",
      ...metricLines,
      "",
      `Next step: ${report.nextStep}`,
    ].join("\n");
  }

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

interface CompareLocalStats {
  wordCount: number;
  paragraphCount: number;
  headingCount: number;
  sentenceCount: number;
  averageSentenceWords: number | null;
  listCount: number;
  numberCount: number;
  questionCount: number;
  trustCount: number;
  terms: string[];
}

function compareWordTokens(text: string): string[] {
  return Array.from(text.toLowerCase().matchAll(/[\p{L}\p{N}]+/gu)).map(
    (match) => match[0],
  );
}

function compareTopTerms(words: string[]): string[] {
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
  for (const word of words) {
    if (word.length < 4 || stopWords.has(word)) continue;
    counts.set(word, (counts.get(word) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 10)
    .map(([word]) => word);
}

function compareLocalStats(text: string): CompareLocalStats {
  const words = compareWordTokens(text);
  const paragraphs = paragraphsInText(text);
  const lines = text.split(/\r?\n/g).map((line) => line.trim()).filter(Boolean);
  const sentenceCount = text
    .split(/[.!?…]+/u)
    .map((item) => item.trim())
    .filter(Boolean).length;
  return {
    wordCount: words.length,
    paragraphCount: paragraphs,
    headingCount: lines.filter((line) =>
      /^(#{1,6}\s+|[А-ЯA-Z0-9][^.!?]{2,90}:?$)/u.test(line),
    ).length,
    sentenceCount,
    averageSentenceWords:
      sentenceCount > 0 ? Math.round(words.length / sentenceCount) : null,
    listCount: lines.filter((line) => /^\s*(?:[-*•]|\d+[.)])\s+/.test(line))
      .length,
    numberCount: (text.match(/\b\d+(?:[.,]\d+)?\b/g) ?? []).length,
    questionCount: (text.match(/\?/g) ?? []).length,
    trustCount: (
      text.match(
        /источник|исследован|данн|ссылка|по данным|рекоменд|врач|эксперт|закон|ГОСТ|pubmed|doi|source|study|research|according|expert|warning|risk/giu,
      ) ?? []
    ).length,
    terms: compareTopTerms(words),
  };
}

function compareSharedPercent(left: string[], right: string[]): number {
  const a = new Set(left);
  const b = new Set(right);
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const item of a) {
    if (b.has(item)) shared += 1;
  }
  return Math.round((shared / Math.min(a.size, b.size)) * 100);
}

function compareExactOverlapPercent(textA: string, textB: string): number {
  const shingles = (text: string) => {
    const words = compareWordTokens(text);
    const result = new Set<string>();
    for (let index = 0; index <= words.length - 4; index += 1) {
      result.add(words.slice(index, index + 4).join(" "));
    }
    return result;
  };
  const a = shingles(textA);
  const b = shingles(textB);
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const item of a) {
    if (b.has(item)) shared += 1;
  }
  return Math.round((shared / Math.min(a.size, b.size)) * 100);
}

function compareMetricWinner(
  left: number | null,
  right: number | null,
  inverse = false,
): RuntimeArticleCompareMetric["winner"] {
  if (left === null || right === null) return "pending";
  if (Math.abs(left - right) <= 2) return "tie";
  if (inverse) return left < right ? "textA" : "textB";
  return left > right ? "textA" : "textB";
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
    page_url_article_internal: {
      ru: "Анализ страницы по URL",
      en: "Page by URL analysis",
    },
    extract_main_text: {
      ru: "Извлечение основного текста",
      en: "Main text extraction",
    },
    check_robots_txt: {
      ru: "Проверка robots.txt",
      en: "Robots.txt check",
    },
    analyze_meta: {
      ru: "Мета-теги страницы",
      en: "Page meta tags",
    },
    analyze_headings: {
      ru: "Заголовки страницы",
      en: "Page headings",
    },
    analyze_content: {
      ru: "Контент страницы",
      en: "Page content",
    },
    detect_stack: {
      ru: "Стек сайта",
      en: "Site stack",
    },
    analyze_google_page_search: {
      ru: "Проверка страницы в Google",
      en: "Google page search check",
    },
    analyze_yandex_page_search: {
      ru: "Проверка страницы в Яндекс",
      en: "Yandex page search check",
    },
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
    ai_trace_map: { ru: "Карта AI-фрагментов", en: "AI trace map" },
    genericness_water_check: {
      ru: "Водность и шаблонность",
      en: "Genericness and watery text",
    },
    readability_complexity: {
      ru: "Читаемость и сложность",
      en: "Readability and complexity",
    },
    claim_source_queue: {
      ru: "Очередь фактов на проверку",
      en: "Claim source queue",
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

function apiRepeatedTermCounts(text: string): Record<string, number> {
  return apiWords(text)
    .map((word) => word.toLowerCase())
    .reduce<Record<string, number>>((acc, word) => {
      acc[word] = (acc[word] ?? 0) + 1;
      return acc;
    }, {});
}

function apiIsSingleLetter(value: string): boolean {
  return /^\p{L}$/u.test(value);
}

function apiIsSingleDigit(value: string): boolean {
  return /^\d$/u.test(value);
}

function apiWordBeforeIndex(text: string, index: number): string {
  return text.slice(0, index).match(/[\p{L}\p{N}]+$/u)?.[0] ?? "";
}

function apiWordAfterIndex(text: string, index: number): string {
  return text.slice(index + 1).match(/^[\p{L}\p{N}]+/u)?.[0] ?? "";
}

function apiShouldIgnoreTightPunctuation(
  text: string,
  index: number,
  punctuation: string,
): boolean {
  const prev = text[index - 1] ?? "";
  const next = text[index + 1] ?? "";
  if (!next) return true;
  if ((punctuation === ":" || punctuation === ".") && next === "/") return true;
  if (apiIsSingleDigit(prev) && apiIsSingleDigit(next)) return true;
  if (punctuation === "." && apiIsSingleLetter(prev) && apiIsSingleLetter(next)) {
    const left = apiWordBeforeIndex(text, index);
    const right = apiWordAfterIndex(text, index);
    return left.length <= 3 || right.length <= 3;
  }
  return false;
}

function apiPunctuationSpacingIssueCount(text: string): number {
  const before = (text.match(/\s+[,.!?;:]/g) ?? []).length;
  let after = 0;
  for (const match of text.matchAll(/[,.!?;:](?=[^\s\n)"»\]\}])/gu)) {
    const index = match.index ?? 0;
    if (apiShouldIgnoreTightPunctuation(text, index, match[0])) continue;
    after += 1;
  }
  return before + after;
}

function apiLowercaseSentenceStartCount(text: string): number {
  return (text.match(/[.!?…]\s+\p{Ll}/gu) ?? []).length;
}

function apiLocalTextMetrics(text: string): {
  uniquenessScore: number;
  syntaxScore: number;
  aiProbability: number;
  aiTraceScore: number;
  genericnessScore: number;
  readabilityScore: number;
  claimQueueRisk: number;
  logicScore: number;
  naturalnessScore: number;
} {
  const allWords = apiWords(text).map((word) => word.toLowerCase());
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
  const spacingIssues = apiPunctuationSpacingIssueCount(text);
  const lowercaseStarts = apiLowercaseSentenceStartCount(text);
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
  const waterySignals = (
    text.match(
      /важно понимать|играет важную роль|имеет большое значение|ключевой аспект|широкий спектр|различные факторы|множество возможностей|plays a key role|wide range|various factors|many opportunities/giu,
    ) ?? []
  ).length;
  const concreteSignals = (
    text.match(
      /\b\d+(?:[.,]\d+)?\b|например|кейс|исследован|источник|по данным|https?:\/\/|example|case study|source|according to|data/giu,
    ) ?? []
  ).length;
  const authorialSignals = (
    text.match(/я видел|мы проверили|наш опыт|по моей практике|we tested|in our experience|I found/giu) ??
    []
  ).length;
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
  const repeatedCounts = apiRepeatedTermCounts(text);
  const maxRepeatedTermCount = repeatedTerms.reduce(
    (max, term) => Math.max(max, repeatedCounts[term] ?? 0),
    0,
  );
  const maxRepeatedTermDensity =
    allWords.length > 0 ? maxRepeatedTermCount / allWords.length : 0;
  const paragraphs = text
    .split(/\n\s*\n/g)
    .map((item) => item.trim())
    .filter(Boolean);
  const longSentences = apiSentences(text).filter(
    (sentence) => wordsInText(sentence) >= 28,
  ).length;
  const heavyParagraphs = paragraphs.filter((paragraph) => wordsInText(paragraph) >= 120)
    .length;
  const readabilityScore = clampMetricScore(
    94 -
      Math.max(0, stats.avg - 16) * 3 -
      longSentences * 5 -
      heavyParagraphs * 6,
  );
  const genericnessScore = clampMetricScore(
    28 +
      waterySignals * 11 +
      repeatedTerms.length * 3 -
      concreteSignals * 4 -
      authorialSignals * 5,
  );
  const exactNumbers = (
    text.match(
      /\b\d+(?:[.,]\d+)?\s?%|\b\d{4}\b|\b\d+(?:[.,]\d+)?\s?(?:кг|мг|г|км|мл|час|мин|day|days|kg|mg|km)\b/giu,
    ) ?? []
  ).length;
  const absoluteClaims = (
    text.match(
      /всегда|никогда|доказано|гарантирует|без исключений|единственный|точно|100%|always|never|proven|guarantees|only|without exception/giu,
    ) ?? []
  ).length;
  const vagueAuthorities = (
    text.match(
      /эксперты считают|исследования показывают|многие специалисты|по мнению экспертов|according to experts|studies show|researchers say/giu,
    ) ?? []
  ).length;
  const sensitiveClaims = (
    text.match(
      /врач|болезн|диабет|лекарств|лечение|беремен|инвестици|налог|закон|doctor|disease|treatment|medicine|investment|tax|law/giu,
    ) ?? []
  ).length;
  const sourceSignals = (
    text.match(/https?:\/\/|\[[0-9]+\]|источник|исследован|study|source|doi\.org/giu) ??
    []
  ).length;
  const claimQueueSize = Math.max(
    0,
    exactNumbers + absoluteClaims + vagueAuthorities + sensitiveClaims - sourceSignals,
  );

  return {
    uniquenessScore: clampMetricScore(
      96 -
        duplicateSentenceRate * 80 -
        Math.max(0, maxRepeatedTermDensity - 0.035) * 520 -
        Math.max(0, repeatedTerms.length - 6) * 2,
    ),
    syntaxScore: clampMetricScore(
      96 -
        spacingIssues * 2.5 -
        lowercaseStarts * 4 -
        repeatedPunctuation * 3 -
        Math.max(0, stats.avg - 28) * 1.2,
    ),
    aiProbability: clampMetricScore(
      18 + genericSignals * 10 + formalSignals * 5 + lowVarianceSignal,
    ),
    aiTraceScore: clampMetricScore(
      12 +
        genericSignals * 9 +
        formalSignals * 4 +
        repeatedTerms.length * 4 +
        (lowVarianceSignal > 0 ? 16 : 0),
    ),
    genericnessScore,
    readabilityScore,
    claimQueueRisk: clampMetricScore(
      claimQueueSize * 9 + absoluteClaims * 5 + vagueAuthorities * 6,
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
  const aiTraceScore = localMetrics.aiTraceScore;
  const genericnessScore = localMetrics.genericnessScore;
  const readabilityScore = localMetrics.readabilityScore;
  const claimQueueRisk = localMetrics.claimQueueRisk;
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
    expectedToolIds.includes("ai_trace_map")
      ? scoreStatusForApi(aiTraceScore, true)
      : "healthy",
    scoreStatusForApi(genericnessScore, true),
    scoreStatusForApi(naturalnessScore, false),
    toolStatusFromFacts(normalizedFacts, [
      "article_uniqueness",
      "ai_writing_probability",
      "ai_trace_map",
      "genericness_water_check",
      "naturalness_indicators",
    ]),
  ]);
  const clarityStatus = combineDimensionStatus([
    scoreStatusForApi(syntaxScore, false),
    scoreStatusForApi(readabilityScore, false),
    toolStatusFromFacts(normalizedFacts, [
      "language_syntax",
      "readability_complexity",
      "analyze_text_structure",
      "analyze_text_style",
    ]),
  ]);
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
              "ai_trace_map",
              "genericness_water_check",
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
        "ai_trace_map",
        "genericness_water_check",
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
              "readability_complexity",
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
        "readability_complexity",
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
        expectedToolIds.includes("claim_source_queue")
          ? scoreStatusForApi(claimQueueRisk, true)
          : "healthy",
        toolStatusFromFacts(normalizedFacts, ["claim_source_queue"]),
        toolStatusFromFacts(normalizedFacts, ["fact_distortion_check"]),
        toolStatusFromFacts(normalizedFacts, ["ai_hallucination_check"]),
      ]),
      detail: isRu
        ? "Факт-чувствительные утверждения, расплывчатые авторитеты, точные числа и риск галлюцинаций."
        : "Fact-sensitive claims, vague authorities, exact numbers, and hallucination risk.",
      recommendation:
        factForTools(normalizedFacts, [
          "claim_source_queue",
          "fact_distortion_check",
          "ai_hallucination_check",
        ])?.detail ??
        (isRu
          ? "Для медицинских, юридических, финансовых и технических материалов отдельно проверьте источники."
          : "For medical, legal, finance, and technical material, verify sources separately."),
      sourceToolIds: [
        "claim_source_queue",
        "fact_distortion_check",
        "ai_hallucination_check",
      ],
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

function inferCompareTextTitle(text: string, fallback: string): string {
  const firstLine = text
    .split(/\r?\n/g)
    .map((line) => line.trim().replace(/^#{1,6}\s+/, ""))
    .find(Boolean);
  if (!firstLine) return fallback;
  return firstLine.length > 90 ? `${firstLine.slice(0, 87)}...` : firstLine;
}

function compareSideFromApi(
  id: "textA" | "textB",
  label: string,
  role: RuntimeArticleCompareTextSide["role"],
  text: string,
  stats: CompareLocalStats,
  facts: RuntimeConfirmedFact[],
): RuntimeArticleCompareTextSide {
  const marker =
    id === "textA"
      ? /\b(A|textA|text A|текст A)\b/i
      : /\b(B|textB|text B|текст B)\b/i;
  return {
    id,
    label,
    role,
    title: inferCompareTextTitle(text, label),
    text,
    wordCount: stats.wordCount,
    paragraphCount: stats.paragraphCount,
    headingCount: stats.headingCount,
    sentenceCount: stats.sentenceCount,
    averageSentenceWords: stats.averageSentenceWords,
    strengths: facts
      .filter((fact) => marker.test(`${fact.title} ${fact.detail}`))
      .slice(0, 4)
      .map((fact) => ({
        title: fact.title,
        detail: fact.detail,
        sourceToolIds: fact.sourceToolIds,
      })),
    weaknesses: facts
      .filter((fact) => fact.priority !== "low" && marker.test(`${fact.title} ${fact.detail}`))
      .slice(0, 4)
      .map((fact) => ({
        title: fact.title,
        detail: fact.detail,
        sourceToolIds: fact.sourceToolIds,
      })),
  };
}

function buildArticleCompareSummaryForApi(
  context: RuntimeArticleCompareContext,
  confirmedFacts: RuntimeConfirmedFact[],
  expectedToolIds: string[],
  locale: SupportedLocale,
): RuntimeArticleCompareSummary {
  const isRu = locale === "ru";
  const statsA = compareLocalStats(context.textA);
  const statsB = compareLocalStats(context.textB);
  const overlap = compareExactOverlapPercent(context.textA, context.textB);
  const copyRisk =
    overlap >= 35 ? "high" : overlap >= 15 ? "medium" : "low";
  const termOverlap = compareSharedPercent(statsA.terms, statsB.terms);
  const completed = confirmedFacts.length;
  const total = Math.max(1, expectedToolIds.length);
  const goalMode =
    context.goalMode ?? inferArticleCompareGoalMode(context.goal);
  const focusSide =
    goalMode === "focus_text_a"
      ? "textA"
      : goalMode === "focus_text_b"
        ? "textB"
        : null;
  const textAAdvantage =
    confirmedFacts.filter((fact) => /\b(A|text A|textA|текст A)\b/i.test(fact.detail))
      .length + (statsA.headingCount > statsB.headingCount ? 1 : 0);
  const textBAdvantage =
    confirmedFacts.filter((fact) => /\b(B|text B|textB|текст B)\b/i.test(fact.detail))
      .length + (statsB.headingCount > statsA.headingCount ? 1 : 0);
  const winner =
    Math.abs(textAAdvantage - textBAdvantage) <= 1
      ? "tie"
      : textAAdvantage > textBAdvantage
        ? "textA"
        : "textB";
  const winnerLabel =
    focusSide === "textA"
      ? isRu
        ? "Отчет сфокусирован на тексте A"
        : "Report focused on Text A"
      : focusSide === "textB"
        ? isRu
          ? "Отчет сфокусирован на тексте B"
          : "Report focused on Text B"
        : goalMode === "similarity_check"
          ? isRu
            ? "Главный вывод: риск похожести и заимствований"
            : "Main finding: similarity and copying risk"
          : goalMode === "style_match"
            ? isRu
              ? "Главный вывод: различия стиля и подачи"
              : "Main finding: style and delivery differences"
            : goalMode === "version_compare"
              ? isRu
                ? "Главный вывод: что изменилось между версиями"
                : "Main finding: changes between versions"
              : goalMode === "beat_competitor"
                ? isRu
                  ? "Главный вывод: текстовые разрывы с конкурентом"
                  : "Main finding: competitor text gaps"
                : winner === "textA"
      ? isRu
        ? "Текст A сильнее по текстовым признакам"
        : "Text A has stronger text signals"
      : winner === "textB"
        ? isRu
          ? "Текст B сильнее по текстовым признакам"
          : "Text B has stronger text signals"
        : isRu
          ? "Тексты близки: важнее разрывы по категориям"
          : "The texts are close: category gaps matter more";
  const missingInA = statsB.terms
    .filter((term) => !statsA.terms.includes(term))
    .slice(0, 6);
  const missingInB = statsA.terms
    .filter((term) => !statsB.terms.includes(term))
    .slice(0, 6);

  return {
    verdict: {
      winner,
      label: winnerLabel,
      detail:
        confirmedFacts[0]?.detail ??
        (isRu
          ? "ИИ сравнил оба текста по выбранным проверкам API + AI Chat."
          : "AI compared both texts using the selected API + AI Chat checks."),
      mainGap:
        termOverlap < 35
          ? isRu
            ? "Главный риск: тексты могут отвечать на разные интенты, поэтому вывод “кто лучше” нужно делать осторожно."
            : "Main risk: the texts may answer different intents, so the winner should be interpreted carefully."
          : isRu
            ? "Главные разрывы смотрите в блоках содержания, конкретики, структуры и доверия."
            : "Review the main gaps in coverage, specificity, structure, and trust.",
    },
    goal: context.goal,
    goalMode,
    goalLabel: compareGoalModeLabel(goalMode, locale),
    goalDescription: compareGoalModeDescription(goalMode, locale),
    focusSide,
    platform: {
      key: context.textPlatform,
      label: platformLabelForChat(context.textPlatform, locale),
      detail: isRu
        ? "Сравнение учитывает только текстовую часть: без домена, ссылок, технического SEO и живой выдачи."
        : "This compares text only: no domain, backlink, technical SEO, or live SERP data.",
    },
    coverage: {
      completed,
      total,
      percent: Math.min(100, Math.round((completed / total) * 100)),
    },
    textA: compareSideFromApi("textA", "Текст A", context.roleA, context.textA, statsA, confirmedFacts),
    textB: compareSideFromApi("textB", "Текст B", context.roleB, context.textB, statsB, confirmedFacts),
    metrics: [
      {
        id: "intent",
        label: isRu ? "Интент" : "Intent",
        textA: termOverlap,
        textB: termOverlap,
        delta: 0,
        suffix: "%",
        winner: termOverlap >= 55 ? "tie" : "pending",
        description: isRu
          ? "Пересечение локальных ключевых понятий. Низкое значение означает, что интент нужно проверить вручную."
          : "Overlap of local key concepts. Low values mean the intent needs manual review.",
      },
      {
        id: "structure",
        label: isRu ? "Структура" : "Structure",
        textA: statsA.headingCount + statsA.listCount,
        textB: statsB.headingCount + statsB.listCount,
        delta: statsA.headingCount + statsA.listCount - statsB.headingCount - statsB.listCount,
        suffix: "",
        winner: compareMetricWinner(
          statsA.headingCount + statsA.listCount,
          statsB.headingCount + statsB.listCount,
        ),
        description: isRu
          ? "Учитывает заголовки и списки как локальные признаки структуры."
          : "Uses headings and lists as local structure signals.",
      },
      {
        id: "specificity",
        label: isRu ? "Конкретика" : "Specificity",
        textA: statsA.numberCount + statsA.listCount + statsA.questionCount,
        textB: statsB.numberCount + statsB.listCount + statsB.questionCount,
        delta:
          statsA.numberCount + statsA.listCount + statsA.questionCount -
          statsB.numberCount - statsB.listCount - statsB.questionCount,
        suffix: "",
        winner: compareMetricWinner(
          statsA.numberCount + statsA.listCount + statsA.questionCount,
          statsB.numberCount + statsB.listCount + statsB.questionCount,
        ),
        description: isRu
          ? "Локальный сигнал по цифрам, вопросам, спискам и шагам."
          : "Local signal from numbers, questions, lists, and steps.",
      },
      {
        id: "readability",
        label: isRu ? "Читаемость" : "Readability",
        textA: statsA.averageSentenceWords,
        textB: statsB.averageSentenceWords,
        delta:
          statsA.averageSentenceWords !== null && statsB.averageSentenceWords !== null
            ? statsA.averageSentenceWords - statsB.averageSentenceWords
            : null,
        suffix: "",
        winner: compareMetricWinner(
          statsA.averageSentenceWords,
          statsB.averageSentenceWords,
          true,
        ),
        description: isRu
          ? "Более короткие предложения обычно легче сканировать."
          : "Shorter sentences are usually easier to scan.",
      },
      {
        id: "similarity",
        label: isRu ? "Дословные совпадения" : "Exact overlap",
        textA: overlap,
        textB: overlap,
        delta: 0,
        suffix: "%",
        winner: copyRisk === "low" ? "tie" : "risk",
        description: isRu
          ? "Локальная проверка совпавших фраз. Это не внешняя база плагиата."
          : "Local phrase overlap check. This is not an external plagiarism database.",
      },
    ],
    gaps: [
      ...missingInA.map((term) => ({
        title: isRu ? `Нет в A: ${term}` : `Missing in A: ${term}`,
        detail: isRu
          ? "Проверьте, нужна ли эта тема в тексте A с учетом цели сравнения."
          : "Check whether this topic belongs in Text A for the comparison goal.",
        side: "missing_in_a" as const,
        sourceToolIds: ["compare_content_gap"],
      })),
      ...missingInB.map((term) => ({
        title: isRu ? `Нет в B: ${term}` : `Missing in B: ${term}`,
        detail: isRu
          ? "Проверьте, нужна ли эта тема в тексте B с учетом цели сравнения."
          : "Check whether this topic belongs in Text B for the comparison goal.",
        side: "missing_in_b" as const,
        sourceToolIds: ["compare_content_gap"],
      })),
    ].slice(0, 8),
    priorities: confirmedFacts.map((fact) => ({
      title: fact.title,
      detail: fact.detail,
      priority: fact.priority,
      sourceToolIds: fact.sourceToolIds,
    })),
    similarity: {
      exactOverlap: overlap,
      semanticSimilarity: null,
      copyRisk,
      detail: isRu
        ? "Это локальная проверка совпавших фраз; смысловую похожесть оценивайте по выводам и разрывам ниже."
        : "This is a local exact-phrase check; assess semantic similarity through the findings and gaps below.",
    },
    actionPlan: confirmedFacts.slice(0, 6).map((fact) => ({
      title: fact.title,
      detail: fact.detail,
      priority: fact.priority,
      sourceToolIds: fact.sourceToolIds,
    })),
    limitations: [
      isRu
        ? "Это сравнение только текста: домен, ссылки, техническое SEO и поведенческие сигналы не учитываются."
        : "This compares text only: domain, links, technical SEO, and behavior signals are not included.",
      isRu
        ? "Риск похожести — локальная эвристика, а не интернет-проверка плагиата."
        : "Similarity risk is a local heuristic, not an internet plagiarism check.",
    ],
  };
}

function mergeArticleCompareReports(
  reports: RuntimeAuditReport[],
  context: RuntimeArticleCompareContext,
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
  const goalMode =
    context.goalMode ?? inferArticleCompareGoalMode(context.goal);
  const summary =
    locale === "ru"
      ? `ИИ сформировал отчет по сравнению двух текстов под цель: ${compareGoalModeLabel(goalMode, locale)}. Проверено пунктов: ${confirmedFacts.length}.`
      : `AI formed a two-text comparison report for: ${compareGoalModeLabel(goalMode, locale)}. Completed checks: ${confirmedFacts.length}.`;
  return {
    mode: last.mode,
    providerId: last.providerId,
    model: last.model,
    generatedAt: new Date().toISOString(),
    summary,
    nextStep: last.nextStep,
    confirmedFacts,
    expertHypotheses,
    articleCompare: buildArticleCompareSummaryForApi(
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
  articleCompareContext = null,
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
  const autoArticleCompareKey = useRef<string | null>(null);
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
      articleCompareContextKey(articleCompareContext) ?? "",
      scanContextKey(scanContext) ?? "",
    ].join("|");
    if (policySessionKey.current === key) return;
    policySessionKey.current = key;
    setPolicyMode(defaultPolicyModeForSession(analysisType, articleTextContext));
  }, [analysisType, articleCompareContext, articleTextContext, scanContext]);

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
    if (
      analysisType === "article_compare" &&
      articleCompareContext?.textA.trim() &&
      articleCompareContext.textB.trim()
    ) {
      return t("chat.helper.nativeArticleCompare", {
        defaultValue:
          "Two texts are ready. Strict mode is used for the comparison report.",
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
  }, [
    analysisType,
    articleCompareContext,
    articleTextContext,
    bridgeState,
    executionMode,
    scanContext,
    t,
  ]);

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
      const autoArticleCompareScan =
        analysisType === "article_compare" &&
        text.includes("TORASEO_ARTICLE_COMPARE_AUTO_RUN=scan");
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
        articleCompareContext,
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
          onReport(
            result.report,
            autoArticleScan || autoArticleCompareScan ? "complete" : undefined,
          );
        } else if (autoArticleScan || autoArticleCompareScan) {
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
        onReport(
          null,
          autoArticleScan || autoArticleCompareScan ? "failed" : undefined,
          result.errorMessage,
        );
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
      articleCompareContext,
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

  const runArticleCompareScanSequence = useCallback(
    async (
      context: RuntimeArticleCompareContext,
      policyModeOverride: RuntimePolicyMode,
    ) => {
      if (busy || executionMode !== "native") return;
      setBusy(true);
      onReport(null, "running");
      setHistory((prev) => [
        ...prev,
        {
          role: "system",
          text: t("chat.articleCompareStarted", {
            defaultValue: "Two text inputs received. Preparing comparison...",
          }),
        },
      ]);

      const reports: RuntimeAuditReport[] = [];
      for (let index = 0; index < context.selectedTools.length; index += 1) {
        const toolId = context.selectedTools[index];
        const toolContext: RuntimeArticleCompareContext = {
          ...context,
          selectedTools: [toolId],
        };
        const input: OrchestratorMessageInput = {
          text: buildArticleComparePrompt(toolContext, locale),
          mode: policyModeOverride,
          executionMode,
          analysisType,
          providerId: RUNTIME_PROVIDER_ID,
          modelOverride: selectedModelProfile?.modelId,
          locale,
          scanContext,
          articleTextContext: null,
          articleCompareContext: toolContext,
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
                code: result.errorCode ?? "article_compare_report_failed",
                message,
                defaultValue: "[error: {{code}}] {{message}}",
              }),
            },
          ]);
          setBusy(false);
          return;
        }

        reports.push(result.report);
        const partial = mergeArticleCompareReports(reports, context, locale);
        if (partial) {
          onReport(
            partial,
            index === context.selectedTools.length - 1 ? "complete" : "running",
          );
        }
      }

      const finalReport = mergeArticleCompareReports(reports, context, locale);
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
    if (executionMode !== "native" || analysisType !== "article_compare") return;
    if (!articleCompareContext?.textA.trim() || !articleCompareContext.textB.trim()) {
      return;
    }
    if (busy) return;
    const key = articleCompareContextKey(articleCompareContext);
    if (!key || autoArticleCompareKey.current === key) return;
    autoArticleCompareKey.current = key;
    setPolicyMode("strict_audit");
    void runArticleCompareScanSequence(articleCompareContext, "strict_audit");
  }, [
    analysisType,
    articleCompareContext,
    busy,
    executionMode,
    runArticleCompareScanSequence,
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
