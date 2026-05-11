/**
 * OpenAI-compatible provider adapter.
 *
 * Production-ready implementation for the native runtime:
 *   - OpenAI-compatible `/chat/completions` request
 *   - long-running model timeout with one retry on retryable failures
 *   - stable provider error mapping
 *   - strict JSON output contract for analysis-panel rendering
 */

import log from "electron-log";

import {
  DEFAULT_CAPABILITIES,
  validateProviderConfig,
  type ProviderAdapter,
  type ProviderChatRequest,
  type ProviderChatResponse,
} from "./base.js";
import type {
  ProviderId,
  ProviderUsage,
  ProviderCapabilities,
  ProviderConfig,
  RuntimeArticleCompareGoalMode,
  RuntimeArticleCompareSummary,
  RuntimeArticleTextSummary,
  RuntimeAuditReport,
  RuntimeSiteCompareSummary,
} from "../../../src/types/runtime.js";

const DEFAULT_MODEL = "openrouter/auto";
const DEFAULT_BASE_URL = "https://openrouter.ai/api/v1";
const DEFAULT_REQUEST_TIMEOUT_MS = 90_000;
const AGGREGATE_ANALYSIS_TIMEOUT_MS = 180_000;
const ANALYSIS_REQUEST_TIMEOUT_MS = 180_000;
const MAX_ATTEMPTS = 2;
const ANALYSIS_VERSION = "0.0.2";
const MAX_SCHEMA_FACTS = 48;

function requestTimeoutMs(request: ProviderChatRequest): number {
  if (isAggregateAnalysisRequest(request)) {
    return AGGREGATE_ANALYSIS_TIMEOUT_MS;
  }
  return hasScanEvidence(request) ||
    hasArticleTextContext(request) ||
    hasArticleCompareContext(request) ||
    hasSiteCompareContext(request)
    ? ANALYSIS_REQUEST_TIMEOUT_MS
    : DEFAULT_REQUEST_TIMEOUT_MS;
}

function maxAttemptsForRequest(request: ProviderChatRequest): number {
  return hasArticleTextContext(request) ||
    hasArticleCompareContext(request) ||
    hasSiteCompareContext(request)
    ? 1
    : MAX_ATTEMPTS;
}

function timeoutMessage(
  label: string,
  locale: "en" | "ru",
  timeoutMs: number,
): string {
  const seconds = Math.round(timeoutMs / 1000);
  void locale;
  return `${label} did not respond within ${seconds} seconds. ToraSEO did not create a visual report because the provider did not return report data in time.`;
}

interface OpenAiCompatibleAdapterOptions {
  id: ProviderId;
  label: string;
  defaultModel: string;
  defaultBaseUrl: string;
  supportsStrictJsonSchema?: boolean;
  includeOpenRouterHeaders?: boolean;
}

interface OpenRouterSuccessPayload {
  choices?: Array<{
    message?: {
      content?: unknown;
      reasoning?: unknown;
      reasoning_content?: unknown;
    };
    text?: unknown;
    content?: unknown;
  }>;
  output_text?: unknown;
  response?: unknown;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
    cost?: number;
  };
  error?: {
    message?: string;
    code?: string | number;
    type?: string;
  };
}

type OutputContractMode = "json_schema" | "prompt_only";

function buildSchema(
  mode: RuntimeAuditReport["mode"],
  confirmedFactCount = 1,
): object {
  const hypothesisMin = mode === "strict_audit" ? 0 : 0;
  const hypothesisMax = mode === "strict_audit" ? 0 : 8;
  const factCount = Math.max(1, Math.min(MAX_SCHEMA_FACTS, confirmedFactCount));

  return {
    type: "object",
    additionalProperties: false,
    required: ["summary", "nextStep", "confirmedFacts", "expertHypotheses"],
    properties: {
      summary: {
        type: "string",
        minLength: 40,
        maxLength: 1600,
        description:
          "A concise but useful audit summary in the user's interface language.",
      },
      nextStep: {
        type: "string",
        minLength: 30,
        maxLength: 500,
        description:
          "The single most important next action, written in the user's interface language.",
      },
      confirmedFacts: {
        type: "array",
        minItems: factCount,
        maxItems: Math.max(factCount, MAX_SCHEMA_FACTS),
        items: {
          type: "object",
          additionalProperties: false,
          required: ["title", "detail", "priority", "sourceToolIds"],
          properties: {
            title: {
              type: "string",
              minLength: 1,
              maxLength: 200,
              description: "Finding title in the user's interface language.",
            },
            detail: {
              type: "string",
              minLength: 20,
              maxLength: 700,
              description:
                "Evidence-backed explanation in the user's interface language.",
            },
            priority: { type: "string", enum: ["high", "medium", "low"] },
            sourceToolIds: {
              type: "array",
              minItems: 1,
              maxItems: 7,
              items: { type: "string" },
            },
          },
        },
      },
      expertHypotheses: {
        type: "array",
        minItems: hypothesisMin,
        maxItems: hypothesisMax,
        items: {
          type: "object",
          additionalProperties: false,
          required: [
            "title",
            "detail",
            "priority",
            "expectedImpact",
            "validationMethod",
          ],
          properties: {
            title: { type: "string", minLength: 1, maxLength: 200 },
            detail: { type: "string", minLength: 20, maxLength: 700 },
            priority: { type: "string", enum: ["high", "medium", "low"] },
            expectedImpact: { type: "string", minLength: 20, maxLength: 400 },
            validationMethod: { type: "string", minLength: 20, maxLength: 400 },
          },
        },
      },
    },
  };
}

function extractMessageContent(
  payload: OpenRouterSuccessPayload,
): string | null {
  const firstChoice = payload.choices?.[0];
  const content =
    firstChoice?.message?.content ??
    firstChoice?.text ??
    firstChoice?.content ??
    payload.output_text ??
    payload.response;
  const normalized = textFromProviderContent(content);
  if (normalized) return normalized;
  const reasoning = textFromProviderContent(
    firstChoice?.message?.reasoning_content ?? firstChoice?.message?.reasoning,
  );
  return reasoning || null;
}

function textFromProviderContent(content: unknown): string {
  if (typeof content === "string") {
    return content.trim();
  }
  if (Array.isArray(content)) {
    return content
      .map((part) => textFromProviderContent(part))
      .join("")
      .trim();
  }
  if (isRecord(content)) {
    for (const key of ["text", "content", "output_text", "value"]) {
      const value = textFromProviderContent(content[key]);
      if (value) return value;
    }
  }
  return "";
}

function normaliseUsage(
  usage: OpenRouterSuccessPayload["usage"],
): ProviderUsage | undefined {
  if (!usage || typeof usage !== "object") return undefined;
  const result: ProviderUsage = {};
  if (typeof usage.prompt_tokens === "number") {
    result.promptTokens = usage.prompt_tokens;
  }
  if (typeof usage.completion_tokens === "number") {
    result.completionTokens = usage.completion_tokens;
  }
  if (typeof usage.total_tokens === "number") {
    result.totalTokens = usage.total_tokens;
  }
  if (typeof usage.cost === "number") {
    result.cost = usage.cost;
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

function parseJson(text: string): unknown | null {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function parseProviderPayload(rawText: string): OpenRouterSuccessPayload | null {
  const parsed = parseJson(rawText);
  return parsed && typeof parsed === "object"
    ? (parsed as OpenRouterSuccessPayload)
    : null;
}

function extractProviderErrorMessage(rawText: string): string | null {
  const payload = parseProviderPayload(rawText);
  if (typeof payload?.error?.message === "string") {
    return payload.error.message;
  }
  const trimmed = rawText.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, 300);
}

function looksLikeStructuredOutputRejection(message: string | null): boolean {
  if (!message) return false;
  const lower = message.toLowerCase();
  return (
    lower.includes("response_format") ||
    lower.includes("json_schema") ||
    lower.includes("structured output") ||
    lower.includes("structured outputs")
  );
}

function looksLikeGenericProviderRejection(message: string | null): boolean {
  if (!message) return false;
  const lower = message.toLowerCase();
  return (
    lower.includes("provider returned error") ||
    lower.includes("provider error") ||
    lower.includes("upstream error")
  );
}

function parseAuditContent(content: string): unknown | null {
  const trimmed = content.trim();
  if (!trimmed) return null;

  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const candidate = fenced?.[1]?.trim() ?? trimmed;
  const direct = parseJson(candidate);
  if (direct) return direct;

  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start >= 0 && end > start) {
    return parseJson(candidate.slice(start, end + 1));
  }

  return null;
}

function isRetryableProviderResult(result: ProviderChatResponse): boolean {
  return (
    result.errorCode === "provider_temporary_failure" ||
    result.errorCode === "provider_network_error" ||
    result.errorCode === "provider_rate_limited"
  );
}

function shouldTryPromptOnlyFallback(result: ProviderChatResponse): boolean {
  return (
    result.errorCode === "provider_bad_response" ||
    result.errorCode === "provider_structured_output_unsupported"
  );
}

function hasScanEvidence(request: ProviderChatRequest): boolean {
  return Boolean(
    request.scanContext &&
      (request.scanContext.completedTools.length > 0 ||
        request.scanContext.facts.length > 0),
  );
}

function hasArticleTextContext(request: ProviderChatRequest): boolean {
  return Boolean(request.articleTextContext?.body.trim());
}

function hasArticleCompareContext(request: ProviderChatRequest): boolean {
  return Boolean(
    request.articleCompareContext?.textA.trim() &&
      request.articleCompareContext?.textB.trim(),
  );
}

function hasSiteCompareContext(request: ProviderChatRequest): boolean {
  return Boolean(
    request.siteCompareContext?.urls.length &&
      request.siteCompareContext.urls.length >= 2 &&
      request.siteCompareContext.scanResults.length > 0,
  );
}

function isStructuredArticleCompareScan(request: ProviderChatRequest): boolean {
  return (
    hasArticleCompareContext(request) &&
    request.analysisType === "article_compare"
  );
}

function isStructuredSiteCompareScan(request: ProviderChatRequest): boolean {
  return hasSiteCompareContext(request) && request.analysisType === "site_compare";
}

function inferArticleCompareGoalMode(goal: string): RuntimeArticleCompareGoalMode {
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
  locale: "en" | "ru",
): string {
  const ru: Record<RuntimeArticleCompareGoalMode, string> = {
    standard_comparison: "стандартное сравнение",
    focus_text_a: "фокус на тексте A",
    focus_text_b: "фокус на тексте B",
    beat_competitor: "сравнение с конкурентом",
    style_match: "подражание стилю",
    similarity_check: "проверка похожести",
    version_compare: "сравнение версий",
    ab_post: "A/B-анализ поста",
  };
  const en: Record<RuntimeArticleCompareGoalMode, string> = {
    standard_comparison: "standard comparison",
    focus_text_a: "focus on Text A",
    focus_text_b: "focus on Text B",
    beat_competitor: "competitor comparison",
    style_match: "style matching",
    similarity_check: "similarity check",
    version_compare: "version comparison",
    ab_post: "A/B post comparison",
  };
  return locale === "ru" ? ru[mode] : en[mode];
}

function compareGoalModeInstruction(
  mode: RuntimeArticleCompareGoalMode,
  locale: "en" | "ru",
): string {
  const ru: Record<RuntimeArticleCompareGoalMode, string> = {
    standard_comparison:
      "Если цель не указана, дай стандартный отчет по двум текстам: интент, структура, полнота, конкретика, доверие, стиль, похожесть и план улучшения.",
    focus_text_a:
      "Сфокусируй отчет на тексте A: сильные и слабые стороны, что улучшить, а текст B используй только как сравнительный ориентир.",
    focus_text_b:
      "Сфокусируй отчет на тексте B: сильные и слабые стороны, что улучшить, а текст A используй только как сравнительный ориентир.",
    beat_competitor:
      "Покажи текстовые преимущества конкурента, разрывы пользовательского текста и план усиления без копирования чужих формулировок.",
    style_match:
      "Сравни тон, ритм, длину предложений, плотность примеров и формальность; объясни, какие приемы можно перенять без копирования фраз.",
    similarity_check:
      "Поставь на первое место дословные совпадения, смысловую похожесть и риск копирования; дай рекомендации по снижению похожести.",
    version_compare:
      "Покажи, что стало лучше, что стало хуже, какие ошибки исправлены и какие появились между двумя версиями.",
    ab_post:
      "Оцени хук, ясность, краткость, реакционный потенциал, CTA и соответствие выбранной платформе.",
  };
  const en: Record<RuntimeArticleCompareGoalMode, string> = {
    standard_comparison:
      "If no goal is provided, produce a standard two-text report: intent, structure, coverage, specificity, trust, style, similarity, and improvement plan.",
    focus_text_a:
      "Focus the report on Text A: strengths, weaknesses, and improvements; use Text B only as comparison context.",
    focus_text_b:
      "Focus the report on Text B: strengths, weaknesses, and improvements; use Text A only as comparison context.",
    beat_competitor:
      "Show competitor text advantages, user-text gaps, and a non-copying improvement plan.",
    style_match:
      "Compare tone, rhythm, sentence length, examples, and formality; explain transferable style techniques without copying phrases.",
    similarity_check:
      "Prioritize exact overlap, semantic similarity, and copying risk; recommend ways to reduce similarity.",
    version_compare:
      "Show what improved, what worsened, which issues were fixed, and which appeared between versions.",
    ab_post:
      "Evaluate hook, clarity, brevity, reaction potential, CTA, and platform fit.",
  };
  return locale === "ru" ? ru[mode] : en[mode];
}

function articleTextAutoRunAction(
  request: ProviderChatRequest,
): "scan" | "solution" | null {
  const match = request.userText.match(
    /TORASEO_ARTICLE_TEXT_AUTO_RUN=(scan|solution)/,
  );
  return match ? (match[1] as "scan" | "solution") : null;
}

function isStructuredArticleTextScan(request: ProviderChatRequest): boolean {
  return (
    hasArticleTextContext(request) &&
    request.articleTextContext?.action === "scan" &&
    articleTextAutoRunAction(request) === "scan"
  );
}

function expectedConfirmedFactCount(request: ProviderChatRequest): number {
  if (isStructuredSiteCompareScan(request)) {
    return request.siteCompareContext?.selectedTools.length || 1;
  }
  if (isStructuredArticleCompareScan(request)) {
    return request.articleCompareContext?.selectedTools.length || 1;
  }
  if (isStructuredArticleTextScan(request)) {
    return request.articleTextContext?.selectedTools.length || 1;
  }
  return 1;
}

function maxTokensForRequest(request: ProviderChatRequest): number {
  if (
    hasArticleTextContext(request) ||
    hasArticleCompareContext(request) ||
    hasSiteCompareContext(request)
  ) {
    const expectedFacts = expectedConfirmedFactCount(request);
    return Math.min(9000, Math.max(4200, expectedFacts * 260));
  }
  return hasScanEvidence(request) ? 1800 : 700;
}

function isAggregateAnalysisRequest(request: ProviderChatRequest): boolean {
  return (
    isStructuredArticleTextScan(request) ||
    isStructuredArticleCompareScan(request) ||
    isStructuredSiteCompareScan(request) ||
    ((request.scanContext?.selectedTools.length ?? 0) > 1)
  );
}

function initialOutputContractMode(request: ProviderChatRequest): OutputContractMode {
  if (isAggregateAnalysisRequest(request)) {
    return "prompt_only";
  }
  return hasScanEvidence(request) ? "json_schema" : "prompt_only";
}

function webEvidencePromptSection(request: ProviderChatRequest): string[] {
  const evidence = request.webEvidenceContext;
  if (!evidence || evidence.items.length === 0) {
    return [
      "Public web evidence:",
      "No public web-evidence packet was collected for this request. Do not claim internet verification, live browsing, live rankings, traffic, backlinks, Search Console, GA4, or paid SEO database checks.",
    ];
  }
  return [
    "Public web evidence collected by ToraSEO before this API request:",
    JSON.stringify(evidence, null, 2),
    "Use this web-evidence packet as supporting evidence only. Cite it as direct URL fetch/search-snippet evidence when relevant. If it is incomplete, blocked, or only a snippet, say that verification is partial.",
  ];
}

function visualReportContractPrompt(request: ProviderChatRequest): string[] {
  if (isStructuredArticleTextScan(request)) {
    return [
      "Required visual report block:",
      "In addition to summary, nextStep, confirmedFacts, and expertHypotheses, include a complete top-level articleText object. ToraSEO will render articleText directly; the app must not invent metrics, dimensions, annotations, priorities, or scores after the provider response.",
      "articleText must include: verdict, verdictLabel, verdictDetail, coverage, platform, document, annotationStatus, annotations, dimensions, priorities, metrics, warningCount, strengths, weaknesses, nextActions, and optional intentForecast.",
      "Use the selected checks and the web-evidence packet to choose metric values, statuses, annotations, and priorities. If a value is uncertain, set it to null or describe the limitation inside the relevant detail instead of guessing.",
      "coverage.completed must equal the number of selected checks you actually analyzed, and coverage.total must equal selectedToolIds.length.",
    ];
  }
  if (isStructuredArticleCompareScan(request)) {
    return [
      "Required visual report block:",
      "In addition to summary, nextStep, confirmedFacts, and expertHypotheses, include a complete top-level articleCompare object. ToraSEO will render articleCompare directly; the app must not build comparison metrics or winners after the provider response.",
      "articleCompare must include: verdict, goal, goalMode, goalLabel, goalDescription, focusSide, platform, coverage, textA, textB, metrics, gaps, priorities, similarity, actionPlan, and limitations.",
      "Use both texts, the comparison goal, selected checks, and the web-evidence packet to decide the winner, gaps, similarity risk, metrics, and action plan. Mark uncertainty in limitations when web evidence is partial.",
    ];
  }
  if (isStructuredSiteCompareScan(request)) {
    return [
      "Required visual report block:",
      "In addition to summary, nextStep, confirmedFacts, and expertHypotheses, include a complete top-level siteCompare object. ToraSEO will render siteCompare directly; the app must not compute the winner, score cards, directions, or insights after the provider response.",
      "siteCompare must include: focus, winnerUrl, completed, total, sites, metrics, directions, and insights.",
      "Use the public scan evidence, selected checks, and the web-evidence packet to decide scores, site cards, directions, and insights. If a URL lacks evidence, reflect that with lower confidence or pending/warn statuses instead of inventing clean data.",
    ];
  }
  return [];
}

function platformLabelForPrompt(value: string, locale: "en" | "ru"): string {
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

function toolLabelForPrompt(value: string, locale: "en" | "ru"): string {
  const labels: Record<string, { ru: string; en: string }> = {
    page_url_article_internal: {
      ru: "пакет анализа страницы по URL",
      en: "page URL analysis package",
    },
    scan_site_minimal: { ru: "базовый скан сайта", en: "basic site scan" },
    analyze_sitemap: { ru: "sitemap", en: "sitemap" },
    check_redirects: { ru: "редиректы", en: "redirects" },
    extract_main_text: {
      ru: "извлечение основного текста",
      en: "main text extraction",
    },
    check_robots_txt: { ru: "проверка robots.txt", en: "robots.txt check" },
    analyze_indexability: { ru: "индексация", en: "indexability" },
    analyze_meta: { ru: "мета-теги страницы", en: "page meta tags" },
    analyze_canonical: { ru: "canonical", en: "canonical" },
    analyze_headings: { ru: "заголовки страницы", en: "page headings" },
    analyze_content: { ru: "контент страницы", en: "page content" },
    analyze_links: { ru: "ссылки страницы", en: "page links" },
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
    compare_intent_gap: {
      ru: "сравнение интента",
      en: "intent gap",
    },
    compare_article_structure: {
      ru: "сравнение структуры",
      en: "structure comparison",
    },
    compare_content_gap: {
      ru: "разрывы по содержанию",
      en: "content gap",
    },
    compare_semantic_gap: {
      ru: "смысловое покрытие",
      en: "semantic gap",
    },
    compare_specificity_gap: {
      ru: "сравнение конкретики",
      en: "specificity gap",
    },
    compare_trust_gap: {
      ru: "сравнение доверия",
      en: "trust gap",
    },
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
    similarity_risk: {
      ru: "риск похожести",
      en: "similarity risk",
    },
    compare_improvement_plan: {
      ru: "план улучшения",
      en: "improvement plan",
    },
    compare_site_positioning: { ru: "сравнение позиционирования сайтов", en: "site positioning comparison" },
    compare_site_metadata: { ru: "сравнение метаданных сайтов", en: "site metadata comparison" },
    compare_site_structure: { ru: "сравнение структуры сайтов", en: "site structure comparison" },
    compare_site_content_depth: { ru: "сравнение глубины контента", en: "site content depth comparison" },
    compare_site_technical_basics: { ru: "сравнение технической базы", en: "technical baseline comparison" },
    compare_site_delta: { ru: "сравнение разрывов", en: "delta comparison" },
    compare_site_direction_matrix: { ru: "матрица направлений", en: "direction matrix" },
    compare_site_competitive_insights: { ru: "конкурентные выводы", en: "competitive insights" },
  };
  return labels[value]?.[locale] ?? value;
}

function resolveBaseUrl(configBaseUrl: string | undefined, defaultBaseUrl: string): string {
  const raw = configBaseUrl?.trim();
  if (!raw) return defaultBaseUrl;

  try {
    const parsed = new URL(raw);
    const isOpenRouterHost =
      parsed.hostname === "openrouter.ai" ||
      parsed.hostname.endsWith(".openrouter.ai");

    if (isOpenRouterHost && !parsed.pathname.startsWith("/api/")) {
      return defaultBaseUrl;
    }
  } catch {
    return raw;
  }

  return raw;
}

function normaliseToolIds(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return input.filter((value): value is string => typeof value === "string");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function priorityValue(value: unknown): "high" | "medium" | "low" {
  const raw = stringValue(value).toLowerCase();
  if (raw === "high" || raw.includes("high") || raw.includes("высок")) {
    return "high";
  }
  if (raw === "low" || raw.includes("low") || raw.includes("низк")) {
    return "low";
  }
  return "medium";
}

function fallbackToolId(
  request: ProviderChatRequest,
  index: number,
): string {
  return (
    request.articleTextContext?.selectedTools[index] ??
    request.articleTextContext?.selectedTools[0] ??
    request.articleCompareContext?.selectedTools[index] ??
    request.articleCompareContext?.selectedTools[0] ??
    request.siteCompareContext?.selectedTools[index] ??
    request.siteCompareContext?.selectedTools[0] ??
    request.scanContext?.selectedTools[index] ??
    request.scanContext?.selectedTools[0] ??
    "api_article_text"
  );
}

function mapToolLabelToId(value: string): string | null {
  const normalized = value.toLowerCase().replace(/[_-]+/g, " ").trim();
  const aliases: Record<string, string> = {
    "page url analysis package": "page_url_article_internal",
    "page by url analysis": "page_url_article_internal",
    "main text extraction": "extract_main_text",
    "robots txt check": "check_robots_txt",
    "robots.txt check": "check_robots_txt",
    indexability: "analyze_indexability",
    "page meta tags": "analyze_meta",
    "meta tags": "analyze_meta",
    canonical: "analyze_canonical",
    sitemap: "analyze_sitemap",
    "sitemap check": "analyze_sitemap",
    redirects: "check_redirects",
    "redirect check": "check_redirects",
    "basic scan": "scan_site_minimal",
    "site scan": "scan_site_minimal",
    "page headings": "analyze_headings",
    headings: "analyze_headings",
    "page content": "analyze_content",
    "page links": "analyze_links",
    links: "analyze_links",
    "site stack": "detect_stack",
    "google page search check": "analyze_google_page_search",
    "yandex page search check": "analyze_yandex_page_search",
    "platform text": "detect_text_platform",
    "text platform": "detect_text_platform",
    platform: "detect_text_platform",
    "structure text": "analyze_text_structure",
    "text structure": "analyze_text_structure",
    structure: "analyze_text_structure",
    "style text": "analyze_text_style",
    "text style": "analyze_text_style",
    style: "analyze_text_style",
    "tone fit": "analyze_tone_fit",
    tone: "analyze_tone_fit",
    "language audience": "language_audience_fit",
    "language and audience": "language_audience_fit",
    audience: "language_audience_fit",
    "media placement": "media_placeholder_review",
    "media placeholders": "media_placeholder_review",
    media: "media_placeholder_review",
    "local repetition and uniqueness": "article_uniqueness",
    "local uniqueness and repetition": "article_uniqueness",
    uniqueness: "article_uniqueness",
    repetition: "article_uniqueness",
    syntax: "language_syntax",
    "language syntax": "language_syntax",
    "ai style probability": "ai_writing_probability",
    "ai writing probability": "ai_writing_probability",
    "ai-writing probability": "ai_writing_probability",
    "ai trace map": "ai_trace_map",
    "genericness and watery text": "genericness_water_check",
    genericness: "genericness_water_check",
    "watery text": "genericness_water_check",
    "readability and complexity": "readability_complexity",
    readability: "readability_complexity",
    complexity: "readability_complexity",
    "claim source queue": "claim_source_queue",
    "source queue": "claim_source_queue",
    "naturalness indicators": "naturalness_indicators",
    naturalness: "naturalness_indicators",
    logic: "logic_consistency_check",
    "logic consistency": "logic_consistency_check",
    "seo intent and metadata": "intent_seo_forecast",
    "seo intent": "intent_seo_forecast",
    metadata: "intent_seo_forecast",
    "risk flags and expert check": "safety_science_review",
    "risk flags and expert review": "safety_science_review",
    "risk flags": "safety_science_review",
    "expert check": "safety_science_review",
    "fact distortion": "fact_distortion_check",
    "hallucination check": "ai_hallucination_check",
    "intent gap": "compare_intent_gap",
    "content gap": "compare_content_gap",
    "semantic gap": "compare_semantic_gap",
    "specificity gap": "compare_specificity_gap",
    "trust gap": "compare_trust_gap",
    "title and ctr comparison": "compare_title_ctr",
    "title ctr comparison": "compare_title_ctr",
    "similarity risk": "similarity_risk",
    "improvement plan": "compare_improvement_plan",
    "site positioning comparison": "compare_site_positioning",
    "metadata comparison": "compare_site_metadata",
    "site metadata comparison": "compare_site_metadata",
    "site structure comparison": "compare_site_structure",
    "site content depth comparison": "compare_site_content_depth",
    "technical baseline comparison": "compare_site_technical_basics",
    "site technical comparison": "compare_site_technical_basics",
    "delta comparison": "compare_site_delta",
    "direction matrix": "compare_site_direction_matrix",
    "competitive insights": "compare_site_competitive_insights",
  };
  return aliases[normalized] ?? null;
}

function normalizeSourceToolIds(
  input: unknown,
  request: ProviderChatRequest,
  index: number,
): string[] {
  const expected = new Set([
    ...(request.articleTextContext?.selectedTools ?? []),
    ...(request.articleCompareContext?.selectedTools ?? []),
    ...(request.siteCompareContext?.selectedTools ?? []),
    ...(request.scanContext?.selectedTools ?? []),
  ]);
  const raw = normaliseToolIds(input);
  const direct = raw.filter((toolId) => expected.has(toolId));
  if (direct.length > 0) return direct;

  const mapped = raw
    .map(mapToolLabelToId)
    .filter((toolId): toolId is string =>
      Boolean(toolId && (expected.size === 0 || expected.has(toolId))),
    );
  if (mapped.length > 0) return [...new Set(mapped)];

  return [fallbackToolId(request, index)];
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function reportAnalysisTypeForRequest(
  request: ProviderChatRequest,
): RuntimeAuditReport["analysisType"] {
  if (request.siteCompareContext) return "site_compare";
  if (request.articleCompareContext) return "article_compare";
  if (request.articleTextContext) {
    const context = request.articleTextContext;
    const looksLikePageByUrl =
      context.sourceType === "page_by_url" ||
      (/^https?:\/\//i.test(context.topic.trim()) &&
        context.selectedTools.includes("extract_main_text"));
    return looksLikePageByUrl ? "page_by_url" : "article_text";
  }
  return "site_by_url";
}

function coerceLocalizedArticleReport(
  candidate: Record<string, unknown>,
  request: ProviderChatRequest,
  model: string,
  providerId: ProviderId,
): RuntimeAuditReport | null {
  const factsSource = arrayValue(candidate["факты"]);
  if (factsSource.length === 0) return null;

  const summarySource = candidate["сводка"];
  const summary =
    typeof summarySource === "string"
      ? summarySource.trim()
      : isRecord(summarySource)
        ? [
            stringValue(summarySource["тип_анализа"]),
            stringValue(summarySource["платформа"]),
            stringValue(summarySource["тема"]),
          ]
            .filter(Boolean)
            .join(". ")
        : "";

  const nextStepSource = candidate["следующий_шаг"];
  const nextStep = isRecord(nextStepSource)
    ? stringValue(nextStepSource["действие"])
    : stringValue(nextStepSource);

  const confirmedFacts = factsSource
    .filter(isRecord)
    .map((item, index) => {
      const title =
        stringValue(item["проверка"]) ||
        stringValue(item["заголовок"]) ||
        `Article text check ${index + 1}`;
      const detail = [
        stringValue(item["наблюдение"]),
        stringValue(item["рекомендация"]),
        stringValue(item["основание"]),
      ]
        .filter(Boolean)
        .join("\n\n");
      return {
        title,
        detail,
        priority: priorityValue(item["приоритет"]),
        sourceToolIds: normalizeSourceToolIds(
          item["sourceToolIds"],
          request,
          index,
        ),
      };
    })
    .filter((item) => item.title && item.detail);

  if (confirmedFacts.length === 0) return null;

  const localizedRecommendations = arrayValue(
    candidate["рекомендации_по_приоритету"],
  );
  const expertHypotheses =
    request.policy.mode === "strict_audit"
      ? []
      : localizedRecommendations
          .filter(isRecord)
          .map((item) => ({
            title: stringValue(item["рекомендация"]).slice(0, 200),
            detail: stringValue(item["рекомендация"]),
            priority: priorityValue(item["приоритет"]),
            expectedImpact: stringValue(item["эффект"]),
            validationMethod: stringValue(item["метод_проверки"]),
          }))
          .filter(
            (item) =>
              item.title &&
              item.detail &&
              item.expectedImpact &&
              item.validationMethod,
          )
          .slice(0, 8);

  return {
    analysisType: reportAnalysisTypeForRequest(request),
    analysisVersion: ANALYSIS_VERSION,
    locale: request.policy.locale,
    mode: request.policy.mode,
    providerId,
    model,
    generatedAt: new Date().toISOString(),
    summary:
      summary ||
      (request.policy.locale === "ru"
        ? "Структурированный API-отчет по тексту статьи сформирован моделью."
        : "The structured API report for the article text was generated by the model."),
    nextStep:
      nextStep ||
      confirmedFacts[0]?.detail.slice(0, 500) ||
      (request.policy.locale === "ru"
        ? "Просмотрите приоритетные замечания и повторите анализ после правок."
        : "Review the priority findings and run the analysis again after editing."),
    confirmedFacts,
    expertHypotheses,
  };
}

function hasString(value: Record<string, unknown>, key: string): boolean {
  return typeof value[key] === "string" && value[key].trim().length > 0;
}

function hasArray(value: Record<string, unknown>, key: string): boolean {
  return Array.isArray(value[key]);
}

function hasObject(value: Record<string, unknown>, key: string): boolean {
  return isRecord(value[key]);
}

function coerceArticleTextSummary(
  value: unknown,
): RuntimeArticleTextSummary | null {
  if (!isRecord(value)) return null;
  if (
    !hasString(value, "verdict") ||
    !hasString(value, "verdictLabel") ||
    !hasString(value, "verdictDetail") ||
    !hasObject(value, "coverage") ||
    !hasObject(value, "platform") ||
    !hasObject(value, "document") ||
    !hasString(value, "annotationStatus") ||
    !hasArray(value, "annotations") ||
    !hasArray(value, "dimensions") ||
    !hasArray(value, "priorities") ||
    !hasArray(value, "metrics") ||
    typeof value.warningCount !== "number" ||
    !hasArray(value, "strengths") ||
    !hasArray(value, "weaknesses") ||
    !hasArray(value, "nextActions")
  ) {
    return null;
  }
  return value as unknown as RuntimeArticleTextSummary;
}

function coerceArticleCompareSummary(
  value: unknown,
): RuntimeArticleCompareSummary | null {
  if (!isRecord(value)) return null;
  if (
    !hasObject(value, "verdict") ||
    !hasString(value, "goalMode") ||
    !hasString(value, "goalLabel") ||
    !hasString(value, "goalDescription") ||
    !hasObject(value, "platform") ||
    !hasObject(value, "coverage") ||
    !hasObject(value, "textA") ||
    !hasObject(value, "textB") ||
    !hasArray(value, "metrics") ||
    !hasArray(value, "gaps") ||
    !hasArray(value, "priorities") ||
    !hasObject(value, "similarity") ||
    !hasArray(value, "actionPlan") ||
    !hasArray(value, "limitations")
  ) {
    return null;
  }
  return value as unknown as RuntimeArticleCompareSummary;
}

function coerceSiteCompareSummary(
  value: unknown,
): RuntimeSiteCompareSummary | null {
  if (!isRecord(value)) return null;
  if (
    typeof value.focus !== "string" ||
    typeof value.completed !== "number" ||
    typeof value.total !== "number" ||
    !hasArray(value, "sites") ||
    !hasArray(value, "metrics") ||
    !hasArray(value, "directions") ||
    !hasArray(value, "insights")
  ) {
    return null;
  }
  return value as unknown as RuntimeSiteCompareSummary;
}

function coerceReport(
  raw: unknown,
  request: ProviderChatRequest,
  model: string,
  providerId: ProviderId,
): RuntimeAuditReport | null {
  if (!isRecord(raw)) return null;
  const candidate = raw;
  const localizedReport = coerceLocalizedArticleReport(
    candidate,
    request,
    model,
    providerId,
  );
  if (localizedReport) return localizedReport;
  const hasExpertHypothesisArray = Array.isArray(candidate.expertHypotheses);
  if (
    typeof candidate.summary !== "string" ||
    typeof candidate.nextStep !== "string" ||
    !Array.isArray(candidate.confirmedFacts) ||
    (request.policy.mode !== "strict_audit" && !hasExpertHypothesisArray)
  ) {
    return null;
  }

  const confirmedFacts = candidate.confirmedFacts
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"))
    .map((item, index) => {
      return {
        title: typeof item.title === "string" ? item.title.trim() : "",
        detail: typeof item.detail === "string" ? item.detail.trim() : "",
        priority:
          item.priority === "high" || item.priority === "low"
            ? item.priority
            : "medium",
        sourceToolIds: normalizeSourceToolIds(
          item.sourceToolIds,
          request,
          index,
        ),
      };
    })
    .filter((item) => item.title && item.detail && item.sourceToolIds.length > 0);

  const expertHypothesisSource =
    request.policy.mode === "strict_audit" ? [] : candidate.expertHypotheses;
  const expertHypotheses = arrayValue(expertHypothesisSource)
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"))
    .map((item) => ({
      title: typeof item.title === "string" ? item.title.trim() : "",
      detail: typeof item.detail === "string" ? item.detail.trim() : "",
      priority:
        item.priority === "high" || item.priority === "low"
          ? item.priority
          : "medium",
      expectedImpact:
        typeof item.expectedImpact === "string" ? item.expectedImpact.trim() : "",
      validationMethod:
        typeof item.validationMethod === "string"
          ? item.validationMethod.trim()
          : "",
    }))
    .filter(
      (item) =>
        item.title &&
        item.detail &&
        item.expectedImpact &&
        item.validationMethod,
    );

  if (confirmedFacts.length === 0) {
    return null;
  }
  const report: RuntimeAuditReport = {
    analysisType: reportAnalysisTypeForRequest(request),
    analysisVersion: ANALYSIS_VERSION,
    locale: request.policy.locale,
    mode: request.policy.mode,
    providerId,
    model,
    generatedAt: new Date().toISOString(),
    summary: candidate.summary.trim(),
    nextStep: candidate.nextStep.trim(),
    confirmedFacts,
    expertHypotheses,
  };
  const articleText = coerceArticleTextSummary(candidate.articleText);
  if (articleText) {
    report.articleText = articleText;
  }
  const articleCompare = coerceArticleCompareSummary(candidate.articleCompare);
  if (articleCompare) {
    report.articleCompare = articleCompare;
  }
  const siteCompare = coerceSiteCompareSummary(candidate.siteCompare);
  if (siteCompare) {
    report.siteCompare = siteCompare;
  }
  return report;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readResponseTextWithTimeout(
  response: Response,
  timeoutMs: number,
): Promise<string> {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      response.text(),
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => {
          reject(new Error("response_body_timeout"));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export class OpenAiCompatibleAdapter implements ProviderAdapter {
  public readonly id: ProviderId;
  public readonly label: string;
  public readonly capabilities: ProviderCapabilities;

  private config: ProviderConfig;
  private defaultModel: string;
  private defaultBaseUrl: string;
  private supportsStrictJsonSchema: boolean;
  private includeOpenRouterHeaders: boolean;

  constructor(
    config: ProviderConfig,
    options: OpenAiCompatibleAdapterOptions = {
      id: "openrouter",
      label: "OpenRouter",
      defaultModel: DEFAULT_MODEL,
      defaultBaseUrl: DEFAULT_BASE_URL,
    },
  ) {
    const check = validateProviderConfig(config);
    if (!check.ok) {
      throw new Error(`${options.id} adapter init failed: ${check.reason}`);
    }
    this.id = options.id;
    this.label = options.label;
    this.config = config;
    this.defaultModel = options.defaultModel;
    this.defaultBaseUrl = options.defaultBaseUrl;
    this.supportsStrictJsonSchema = options.supportsStrictJsonSchema ?? true;
    this.includeOpenRouterHeaders =
      options.includeOpenRouterHeaders ?? options.id === "openrouter";
    this.capabilities = {
      ...DEFAULT_CAPABILITIES,
      streaming: false,
      toolCalls: false,
      structuredOutput: this.supportsStrictJsonSchema,
    };
  }

  isConfigured(): boolean {
    return this.config.apiKey.trim().length > 0;
  }

  private buildUserPrompt(request: ProviderChatRequest): string {
    if (hasSiteCompareContext(request)) {
      const context = request.siteCompareContext!;
      const languageInstruction =
        request.policy.locale === "ru"
          ? "Reply in Russian. Keep fixed SEO terms such as SERP, Core Web Vitals, Open Graph, canonical, robots.txt, sitemap, and SEO when that is the normal term."
          : "Reply in English.";
      const selectedChecks = context.selectedTools.map((toolId) =>
        toolLabelForPrompt(toolId, request.policy.locale),
      );

      return [
        "The user clicked Site comparison by URL in ToraSEO API + AI Chat.",
        "The app already ran public URL checks for each site and passes the scan evidence below. The AI must interpret that evidence and form the structured comparison report.",
        "Return JSON that satisfies the required audit schema only; do not wrap it in markdown fences. Do not translate JSON property names.",
        "Use exactly these top-level keys: summary, nextStep, confirmedFacts, expertHypotheses, siteCompare.",
        "Each confirmedFacts item must use exactly: title, detail, priority, sourceToolIds. Priority values must be exactly high, medium, or low.",
        "Return one confirmedFacts item for every selected site comparison check, in the same order as selectedToolIds. sourceToolIds must contain the exact backend id for the current check.",
        "Use title for the finding headline, not the tool name. Write detail in two or three short paragraphs: who is stronger, why, where the gap is, and what to do first.",
        ...visualReportContractPrompt(request),
        "If this request contains only one selected check, treat it as one step of a larger site comparison and do not mention scan mechanics.",
        languageInstruction,
        "Compare up to three sites as one competitive comparison dashboard. Do not render three full audits side by side.",
        "Stay within public technical/content signals from the provided scan evidence. Do not pretend Search Console, GA4, backlinks, live rankings, private analytics, Lighthouse, or paid SEO databases ran.",
        "If a URL has errors or missing evidence for a direction, say that the direction needs verification instead of inventing a clean score.",
        request.policy.mode === "strict_audit"
          ? "Strict mode: expertHypotheses must be an empty array. Tie every recommendation to provided scan evidence or clearly marked local heuristics."
          : "Ideas mode: expert hypotheses are allowed, but label them as hypotheses and keep them bounded by the provided evidence.",
        ...webEvidencePromptSection(request),
        "",
        "Comparison context:",
        JSON.stringify(
          {
            runId: context.runId ?? "not specified",
            urls: context.urls,
            focus: context.focus || "general competitive comparison",
            selectedToolIds: context.selectedTools,
            selectedChecks,
            siteToolIds: context.siteTools,
          },
          null,
          2,
        ),
        "",
        "User request:",
        request.userText,
        "",
        "Public scan evidence by site and tool:",
        JSON.stringify(context.scanResults, null, 2),
      ].join("\n");
    }

    if (hasArticleCompareContext(request)) {
      const context = request.articleCompareContext!;
      const languageInstruction =
        request.policy.locale === "ru"
          ? "Reply in Russian. Keep fixed product terms such as Content Gap, CTR, SERP, and SEO when that is the normal term."
          : "Reply in English.";
      const platform =
        context.customPlatform?.trim() ||
        platformLabelForPrompt(context.textPlatform, request.policy.locale);
      const goalMode =
        context.goalMode ?? inferArticleCompareGoalMode(context.goal);
      const selectedChecks = context.selectedTools.map((toolId) =>
        toolLabelForPrompt(toolId, request.policy.locale),
      );

      return [
        "The user clicked Compare two texts in ToraSEO API + AI Chat.",
        "Return JSON that satisfies the required audit schema only; do not wrap it in markdown fences. Do not translate JSON property names.",
        "Use exactly these top-level keys: summary, nextStep, confirmedFacts, expertHypotheses, articleCompare.",
        "Each confirmedFacts item must use exactly: title, detail, priority, sourceToolIds. Priority values must be exactly high, medium, or low.",
        "Return one confirmedFacts item for every selected comparison check, in the same order as selectedToolIds. sourceToolIds must contain the exact backend id for the current check.",
        "Use title for the finding headline, not the tool name; the app renders the tool name separately. Write detail in two or three short paragraphs when possible: key evidence, what was found, what to do.",
        ...visualReportContractPrompt(request),
        "If this request contains only one selected check, treat it as one step of a larger multi-check comparison: evaluate the two texts for that check, but do not write that only one check was selected and do not mention scan mechanics.",
        languageInstruction,
        `Goal report mode: ${compareGoalModeLabel(goalMode, request.policy.locale)}.`,
        compareGoalModeInstruction(goalMode, request.policy.locale),
        "Compare text A and text B as text-only evidence. Do not claim that one page ranks higher in search because of the text alone. Use wording such as text advantage, textual strengths, or textual gap.",
        "First evaluate each text separately, then compare them by intent match, structure, content coverage, semantic coverage, specificity, trust, style, similarity risk, title/CTR, platform fit, and improvement plan when those checks are selected.",
        "For similarity, distinguish exact overlap from semantic similarity. Warn against copying phrasing; suggest adding original examples, conclusions, and structure improvements.",
        "For competitor-style goals, explain what can be borrowed as an approach and what must not be copied.",
        "Stay within local text comparison. Do not pretend live SERP, backlinks, domain authority, plagiarism database, fact-checking, or expert review ran.",
        "Use human-readable wording, not backend IDs. Do not create findings about JSON, selected checks, sourceToolIds, API mode, or orchestration details.",
        request.policy.mode === "strict_audit"
          ? "Strict mode: expertHypotheses must be an empty array. Tie every recommendation to visible text evidence or clearly marked local heuristics."
          : "Ideas mode: expert hypotheses are allowed, but label them as hypotheses and keep them bounded by the two texts.",
        ...webEvidencePromptSection(request),
        "",
        "Comparison context:",
        JSON.stringify(
          {
            runId: context.runId ?? "not specified",
            goal: context.goal || "neutral comparison",
            goalMode,
            goalModeLabel: compareGoalModeLabel(goalMode, request.policy.locale),
            roleA: context.roleA,
            roleB: context.roleB,
            platform,
            selectedToolIds: context.selectedTools,
            selectedChecks,
          },
          null,
          2,
        ),
        "",
        "User request:",
        request.userText,
        "",
        "Text A:",
        context.textA,
        "",
        "Text B:",
        context.textB,
      ].join("\n");
    }

    if (hasArticleTextContext(request)) {
      const context = request.articleTextContext!;
      const structuredScan = isStructuredArticleTextScan(request);
      const autoRunAction = articleTextAutoRunAction(request);
      const isPageByUrl =
        context.sourceType === "page_by_url" ||
        (/^https?:\/\//i.test(context.topic.trim()) &&
          context.selectedTools.includes("extract_main_text"));
      const languageInstruction =
        request.policy.locale === "ru"
          ? "Reply in Russian."
          : "Reply in English.";
      const actionInstruction =
        !autoRunAction
          ? "Answer the user's current message inside the active ToraSEO article-text workflow. Use the article text as context, and do not claim you can see the user's screen."
        : context.action === "solution"
          ? "The user clicked Suggest solution. First reason through the selected ToraSEO text-analysis checks, then provide a concrete solution, rewrite plan, or draft direction. If there is enough context and the user expects a rewrite, write the rewritten article directly in chat as a separate copyable block."
          : isPageByUrl
            ? "The user clicked Analyze page by URL in API + AI Chat. The app fetched the URL and extracted the main article text before sending it here. Analyze the extracted article text and page-level context; do not treat ads, navigation, comments, or service UI as article content unless they clearly remain in the provided text."
            : "The user clicked Scan text in API + AI Chat. Analyze the article text and provide prioritized recommendations in chat.";
      const modeInstruction =
        request.policy.mode === "strict_audit"
          ? "Strict mode: do not include an Expert hypotheses section. Do not invent hidden tool scores. List only observations that are directly visible in the article text or explicitly described as local heuristics, and tie every recommendation to a visible observation."
          : "Ideas mode: expert hypotheses and rewrite directions are allowed, but label them as hypotheses or suggestions and keep them bounded by the article text.";
      const platform =
        context.customPlatform?.trim() ||
        platformLabelForPrompt(context.textPlatform, request.policy.locale);
      const selectedChecks = context.selectedTools.map((toolId) =>
        toolLabelForPrompt(toolId, request.policy.locale),
      );

      const outputInstruction = structuredScan
        ? `${isPageByUrl ? "The user clicked Analyze page by URL." : "The user clicked Scan text."} The API model must form the structured ToraSEO report. Return JSON that satisfies the required audit schema only; do not wrap it in markdown fences. Do not translate JSON property names. Use exactly these top-level keys: summary, nextStep, confirmedFacts, expertHypotheses, articleText. Each confirmedFacts item must use exactly: title, detail, priority, sourceToolIds. Priority values must be exactly high, medium, or low. User-facing string values should still be written in the user's language. Return one confirmedFacts item for every selected check, in the same order as selectedToolIds. sourceToolIds must contain the exact backend id for the current check from selectedToolIds, not the translated label. Use title for the finding headline, not the tool name; the app will render the tool name itself. Write detail in three short paragraphs when possible: key evidence, what was found, what to do. Use high only for blocking or publication-critical problems; use medium for normal editing issues; use low for healthy or informational findings. If this request contains only one selected check, treat it as the current step of a larger multi-tool scan: evaluate the article for that check, but do not write that only one check was selected, and do not turn scan mechanics into a content finding.`
        : "This is a ToraSEO API + AI Chat article-text workflow. Do not return JSON.";

      return [
        outputInstruction,
        ...visualReportContractPrompt(request),
        languageInstruction,
        actionInstruction,
        modeInstruction,
        structuredScan
          ? "The report source is the AI provider response. The application only prepares the text/context and displays the structured report after this response is parsed."
          : "If the user asks whether the report exists in ToraSEO, explain that in API mode the application can display a report only after the AI provider has returned a structured report; you cannot see the screen, but you can describe this workflow.",
        "If the user asks whether you changed/updated/made edits to the report or all 19 checks, do not answer with a flat 'no'. Answer the precise boundary: yes, this AI provider response supplied the analysis and structured interpretation for the selected checks that ToraSEO rendered into the report; no, you did not directly edit the source article text or manually operate the app UI unless the user requested a rewrite or targeted edit.",
        "Stay within the selected/relevant text-analysis tools. Do not pretend live MCP tools, internet SERP checks, external plagiarism checks, legal, medical, investment, engineering, or scientific expert verification ran.",
        "Use the public web-evidence packet below when it is present. If no packet is present, say that internet verification was not available for this API run.",
        "Use human-readable wording, not backend IDs. Mention uncertainty where a check is only heuristic.",
        structuredScan
          ? "For structured scan output, every confirmed fact must describe the article itself or a clearly labeled local heuristic. Do not create findings about selectedChecks, runId, JSON schema, API mode, or other orchestration details."
          : "Keep orchestration details out of the answer unless the user asks how the workflow works.",
        "When selectedToolIds includes ai_writing_probability, evaluate AI-like style probability only; do not claim proof of authorship.",
        "When selectedToolIds includes ai_trace_map, map local AI-like editing targets: generic transitions, formal wording, repeated terms, and overly even rhythm.",
        "When selectedToolIds includes genericness_water_check, evaluate broad/watery phrasing, repeated generic concepts, weak concrete evidence, and missing examples, numbers, sources, cases, or reader actions.",
        "When selectedToolIds includes readability_complexity, evaluate sentence density, long sentences, heavy paragraphs, and scan friction.",
        "When selectedToolIds includes claim_source_queue, list claims, numbers, absolute wording, vague authorities, and sensitive statements that need manual source verification, softer wording, or removal.",
        isPageByUrl
          ? "Relevant checks may include URL extraction, robots/meta/headings/content/page stack, platform/use-case, structure, style, tone, language/audience, media placement, local repetition/uniqueness, syntax, AI-writing style probability, AI trace map, genericness/watery text, readability/complexity, claim source queue, naturalness, logic, local SEO intent/metadata, and safety/science/legal-sensitive risk flags."
          : "Relevant checks may include platform/use-case, structure, style, tone, language/audience, media placeholders, local repetition/uniqueness, syntax, AI-writing style probability, AI trace map, genericness/watery text, readability/complexity, claim source queue, naturalness, logic, local SEO intent/metadata, and safety/science/legal-sensitive risk flags.",
        "If rewriting or substantially reworking, preserve necessary caveats and do not strengthen unverified claims. Ask about media placeholder positions before adding them unless the user already requested media placement.",
        ...webEvidencePromptSection(request),
        "",
        "User message:",
        request.userText.replace(/TORASEO_ARTICLE_TEXT_AUTO_RUN=(scan|solution)\s*/g, "").trim(),
        "",
        "Article context:",
        JSON.stringify(
          {
            action: context.action,
            runId: context.runId ?? "not specified",
            topic: context.topic,
            sourceType: isPageByUrl ? "page_by_url" : "article_text",
            analysisRole: context.analysisRole ?? "default",
            platform,
            selectedToolIds: context.selectedTools,
            selectedChecks,
          },
          null,
          2,
        ),
        "",
        "User request:",
        request.userText,
        "",
        "Article text:",
        context.body,
      ].join("\n");
    }

    if (!hasScanEvidence(request)) {
      const languageInstruction =
        request.policy.locale === "ru"
          ? "Reply in Russian."
          : "Reply in English.";

      return [
        "This is a pre-scan ToraSEO chat turn. Do not return JSON.",
        languageInstruction,
        "You may explain how ToraSEO works, what the current analysis mode can do, how the user should run a site audit, and what kind of questions can be asked after scan results exist.",
        "If the user asks you to analyze a site or anything outside the active ToraSEO workflow, explain that the analysis must be started from the main ToraSEO window first.",
        "Keep the answer helpful and concise.",
        "",
        `User message: ${request.userText}`,
      ].join("\n");
    }

    const factsSection = request.scanContext
      ? JSON.stringify(request.scanContext, null, 2)
      : "No structured scan context is available yet.";
    const languageInstruction =
      request.policy.locale === "ru"
        ? "Write every user-facing JSON string value in Russian. Keep only product names, URLs, tool IDs, and fixed SEO terms such as Open Graph in English when that is the normal term."
        : "Write every user-facing JSON string value in English.";

    return [
      "Produce a ToraSEO audit response using the required JSON schema only.",
      "Do not wrap the JSON in markdown fences.",
      languageInstruction,
      "Make the answer substantial: include concrete evidence from the scan, prioritized recommendations, and one practical next step.",
      ...webEvidencePromptSection(request),
      "",
      "User request:",
      request.userText,
      "",
      "Active analysis type:",
      request.analysisType === "site"
        ? "Site audit by URL. Redirect unrelated or generic assistant requests back to the current site audit."
        : "Article text analysis. Redirect unrelated or generic assistant requests back to the current article text workflow.",
      "",
      "Current scan context:",
      factsSection,
      "",
      "Important mode rules:",
      request.policy.mode === "strict_audit"
        ? "- Expert hypotheses are forbidden in this mode."
        : "- Expert hypotheses are allowed, but must be clearly actionable and explicitly framed as hypotheses.",
    ].join("\n");
  }

  private async executeAttempt(
    request: ProviderChatRequest,
    model: string,
    signal: AbortSignal,
    outputContractMode: OutputContractMode,
    timeoutMs: number,
  ): Promise<ProviderChatResponse> {
    const endpoint = `${resolveBaseUrl(this.config.baseUrl, this.defaultBaseUrl).replace(/\/+$/, "")}/chat/completions`;
    const requestBody: Record<string, unknown> = {
      model,
      temperature: request.policy.mode === "strict_audit" ? 0.1 : 0.35,
      max_tokens: maxTokensForRequest(request),
      stream: false,
      messages: [
        { role: "system", content: request.policy.systemPrompt },
        { role: "user", content: this.buildUserPrompt(request) },
      ],
    };

    if (outputContractMode === "json_schema") {
      requestBody.response_format = {
        type: "json_schema",
        json_schema: {
          name: "toraseo_audit_report",
          strict: true,
          schema: buildSchema(
            request.policy.mode,
            expectedConfirmedFactCount(request),
          ),
        },
      };
    }

    let response: Response;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.config.apiKey}`,
    };
    if (this.includeOpenRouterHeaders) {
      headers["HTTP-Referer"] = "https://github.com/Magbusjap/toraseo";
      headers["X-Title"] = "ToraSEO";
    }
    const aggregate = isAggregateAnalysisRequest(request);
    log.info(
      `[runtime] provider request start provider=${this.id} model=${model} contract=${outputContractMode} aggregate=${aggregate} timeoutMs=${timeoutMs}`,
    );
    try {
      response = await fetch(endpoint, {
        method: "POST",
        signal,
        headers,
        body: JSON.stringify(requestBody),
      });
    } catch (error) {
      if ((error as Error).name === "AbortError") {
        log.warn(
          `[runtime] provider request timeout provider=${this.id} model=${model} timeoutMs=${timeoutMs}`,
        );
        return {
          ok: false,
          errorCode: "provider_timeout",
          errorMessage: timeoutMessage(
            this.label,
            request.policy.locale,
            timeoutMs,
          ),
        };
      }
      return {
        ok: false,
        errorCode: "provider_network_error",
        errorMessage:
          error instanceof Error
            ? error.message
          : `Network error while contacting ${this.label}.`,
      };
    }
    log.info(
      `[runtime] provider response provider=${this.id} model=${model} status=${response.status}`,
    );

    let rawBody: string;
    try {
      rawBody = await readResponseTextWithTimeout(response, timeoutMs);
    } catch (error) {
      if ((error as Error).message === "response_body_timeout") {
        log.warn(
          `[runtime] provider response body timeout provider=${this.id} model=${model} timeoutMs=${timeoutMs}`,
        );
        return {
          ok: false,
          errorCode: "provider_timeout",
          errorMessage: timeoutMessage(
            this.label,
            request.policy.locale,
            timeoutMs,
          ),
        };
      }
      return {
        ok: false,
        errorCode: "provider_bad_response",
        errorMessage: `${this.label} response body could not be read.`,
      };
    }

    if (response.status === 401 || response.status === 403) {
      return {
        ok: false,
        errorCode: "provider_auth_failed",
        errorMessage: `${this.label} rejected the API key.`,
      };
    }
    if (response.status === 429) {
      return {
        ok: false,
        errorCode: "provider_rate_limited",
        errorMessage: `${this.label} rate-limited the request.`,
      };
    }
    if (!response.ok) {
      const providerMessage = extractProviderErrorMessage(rawBody);
      if (
        response.status === 400 &&
        outputContractMode === "json_schema" &&
        (looksLikeStructuredOutputRejection(providerMessage) ||
          looksLikeGenericProviderRejection(providerMessage))
      ) {
        return {
          ok: false,
          errorCode: "provider_structured_output_unsupported",
          errorMessage:
            `The selected ${this.label} model does not support strict structured output.`,
        };
      }
      return {
        ok: false,
        errorCode:
          response.status >= 500
            ? "provider_temporary_failure"
            : "provider_http_error",
        errorMessage: providerMessage
          ? `${this.label} returned HTTP ${response.status}: ${providerMessage}`
          : `${this.label} returned HTTP ${response.status}.`,
      };
    }

    const payload = parseProviderPayload(rawBody);
    if (!payload) {
      return {
        ok: false,
        errorCode: "provider_bad_response",
        errorMessage:
          outputContractMode === "json_schema"
            ? `${this.label} returned a non-JSON API response.`
            : `${this.label} returned a non-JSON API response after compatibility fallback.`,
      };
    }
    if (payload.error?.message) {
      return {
        ok: false,
        errorCode: "provider_http_error",
        errorMessage: payload.error.message,
      };
    }

    const content = extractMessageContent(payload);
    const usage = normaliseUsage(payload.usage);
    if (!content) {
      return {
        ok: false,
        errorCode: "provider_bad_response",
        errorMessage: `${this.label} response did not include message content.`,
      };
    }

    const parsed = parseAuditContent(content);
    if (!parsed) {
      if (outputContractMode === "prompt_only") {
        return {
          ok: true,
          model,
          usage,
          text: content.trim(),
        };
      }
      return {
        ok: false,
        errorCode: "provider_bad_response",
        errorMessage: `${this.label} returned non-JSON message content.`,
      };
    }

    const report = coerceReport(parsed, request, model, this.id);
    if (!report) {
      if (outputContractMode === "prompt_only") {
        return {
          ok: true,
          model,
          usage,
          text: content.trim(),
        };
      }
      return {
        ok: false,
        errorCode: "provider_bad_response",
        errorMessage: `${this.label} response did not satisfy the audit contract.`,
      };
    }

    return {
      ok: true,
      model,
      usage,
      report,
      text: report.summary,
    };
  }

  async sendChat(request: ProviderChatRequest): Promise<ProviderChatResponse> {
    if (!this.isConfigured()) {
      return {
        ok: false,
        errorCode: "provider_not_configured",
        errorMessage: `${this.label} is not configured. Add an API key in Settings.`,
      };
    }

    const model =
      request.modelOverride ?? this.config.defaultModel ?? this.defaultModel;
    const timeoutMs = requestTimeoutMs(request);

    const maxAttempts = maxAttemptsForRequest(request);
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const initialContractMode = this.supportsStrictJsonSchema
          ? initialOutputContractMode(request)
          : "prompt_only";
        const result = await this.executeAttempt(
          request,
          model,
          controller.signal,
          initialContractMode,
          timeoutMs,
        );
        const shouldRetry =
          attempt < maxAttempts && isRetryableProviderResult(result);
        if (shouldRetry) {
          await wait(attempt * 500);
          continue;
        }
        if (shouldTryPromptOnlyFallback(result)) {
          const fallbackController = new AbortController();
          const fallbackTimeout = setTimeout(
            () => fallbackController.abort(),
            timeoutMs,
          );
          try {
            const fallback = await this.executeAttempt(
              request,
              model,
              fallbackController.signal,
              "prompt_only",
              timeoutMs,
            );
            if (fallback.ok) return fallback;
            if (fallback.errorCode === "provider_bad_response") {
              return {
                ok: false,
                errorCode: "provider_bad_response",
                errorMessage:
                  `The selected ${this.label} model did not return parseable audit content. Try a model with structured JSON support.`,
              };
            }
            return fallback;
          } finally {
            clearTimeout(fallbackTimeout);
          }
        }
        return result;
      } finally {
        clearTimeout(timeout);
      }
    }

    return {
      ok: false,
      errorCode: "provider_temporary_failure",
      errorMessage:
        maxAttempts > 1
          ? `${this.label} did not complete the request after retrying.`
          : `${this.label} did not complete the request.`,
    };
  }
}
