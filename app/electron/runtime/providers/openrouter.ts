/**
 * OpenRouter provider adapter.
 *
 * Production-ready implementation for the native runtime:
 *   - OpenAI-compatible `/chat/completions` request
 *   - 20s timeout with one retry on retryable failures
 *   - stable provider error mapping
 *   - strict JSON output contract for analysis-panel rendering
 */

import {
  DEFAULT_CAPABILITIES,
  validateProviderConfig,
  type ProviderAdapter,
  type ProviderChatRequest,
  type ProviderChatResponse,
} from "./base.js";
import type {
  ProviderUsage,
  ProviderCapabilities,
  ProviderConfig,
  RuntimeArticleCompareGoalMode,
  RuntimeAuditReport,
} from "../../../src/types/runtime.js";

const DEFAULT_MODEL = "openrouter/auto";
const DEFAULT_BASE_URL = "https://openrouter.ai/api/v1";
const REQUEST_TIMEOUT_MS = 20_000;
const MAX_ATTEMPTS = 2;

interface OpenRouterSuccessPayload {
  choices?: Array<{
    message?: {
      content?: string | Array<{ type?: string; text?: string }>;
    };
  }>;
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
  const factCount = Math.max(1, Math.min(24, confirmedFactCount));

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
        maxItems: Math.max(factCount, 24),
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
  const content = payload.choices?.[0]?.message?.content;
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .map((part) => (typeof part?.text === "string" ? part.text : ""))
      .join("")
      .trim();
  }
  return null;
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

function isStructuredArticleCompareScan(request: ProviderChatRequest): boolean {
  return (
    hasArticleCompareContext(request) &&
    request.analysisType === "article_compare"
  );
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
  if (isStructuredArticleCompareScan(request)) {
    return request.articleCompareContext?.selectedTools.length || 1;
  }
  if (isStructuredArticleTextScan(request)) {
    return request.articleTextContext?.selectedTools.length || 1;
  }
  return 1;
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
  };
  return labels[value]?.[locale] ?? value;
}

function resolveBaseUrl(configBaseUrl?: string): string {
  const raw = configBaseUrl?.trim();
  if (!raw) return DEFAULT_BASE_URL;

  try {
    const parsed = new URL(raw);
    const isOpenRouterHost =
      parsed.hostname === "openrouter.ai" ||
      parsed.hostname.endsWith(".openrouter.ai");

    if (isOpenRouterHost && !parsed.pathname.startsWith("/api/")) {
      return DEFAULT_BASE_URL;
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
    request.scanContext?.selectedTools[index] ??
    request.scanContext?.selectedTools[0] ??
    "api_article_text"
  );
}

function mapToolLabelToId(value: string): string | null {
  const normalized = value.toLowerCase().replace(/[_-]+/g, " ").trim();
  const aliases: Record<string, string> = {
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

function coerceLocalizedArticleReport(
  candidate: Record<string, unknown>,
  request: ProviderChatRequest,
  model: string,
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
    mode: request.policy.mode,
    providerId: "openrouter",
    model,
    generatedAt: new Date().toISOString(),
    summary:
      summary ||
      "Структурированный API-отчет по тексту статьи сформирован моделью.",
    nextStep:
      nextStep ||
      confirmedFacts[0]?.detail.slice(0, 500) ||
      "Просмотрите приоритетные замечания и повторите анализ после правок.",
    confirmedFacts,
    expertHypotheses,
  };
}

function coerceReport(
  raw: unknown,
  request: ProviderChatRequest,
  model: string,
): RuntimeAuditReport | null {
  if (!isRecord(raw)) return null;
  const candidate = raw;
  const localizedReport = coerceLocalizedArticleReport(candidate, request, model);
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
  return {
    mode: request.policy.mode,
    providerId: "openrouter",
    model,
    generatedAt: new Date().toISOString(),
    summary: candidate.summary.trim(),
    nextStep: candidate.nextStep.trim(),
    confirmedFacts,
    expertHypotheses,
  };
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class OpenRouterAdapter implements ProviderAdapter {
  public readonly id = "openrouter" as const;
  public readonly label = "OpenRouter";
  public readonly capabilities: ProviderCapabilities = {
    ...DEFAULT_CAPABILITIES,
    streaming: false,
    toolCalls: false,
    structuredOutput: true,
  };

  private config: ProviderConfig;

  constructor(config: ProviderConfig) {
    const check = validateProviderConfig(config);
    if (!check.ok) {
      throw new Error(`openrouter adapter init failed: ${check.reason}`);
    }
    this.config = config;
  }

  isConfigured(): boolean {
    return this.config.apiKey.trim().length > 0;
  }

  private buildUserPrompt(request: ProviderChatRequest): string {
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
        "Use exactly these top-level keys: summary, nextStep, confirmedFacts, expertHypotheses.",
        "Each confirmedFacts item must use exactly: title, detail, priority, sourceToolIds. Priority values must be exactly high, medium, or low.",
        "Return one confirmedFacts item for every selected comparison check, in the same order as selectedToolIds. sourceToolIds must contain the exact backend id for the current check.",
        "Use title for the finding headline, not the tool name; the app renders the tool name separately. Write detail in two or three short paragraphs when possible: key evidence, what was found, what to do.",
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
      const languageInstruction =
        request.policy.locale === "ru"
          ? "Ответь по-русски."
          : "Reply in English.";
      const actionInstruction =
        !autoRunAction
          ? "Answer the user's current message inside the active ToraSEO article-text workflow. Use the article text as context, and do not claim you can see the user's screen."
          : context.action === "solution"
          ? "The user clicked Suggest solution. First reason through the selected ToraSEO text-analysis checks, then provide a concrete solution, rewrite plan, or draft direction. If there is enough context and the user expects a rewrite, write the rewritten article directly in chat as a separate copyable block."
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
        ? "The user clicked Scan text. The API model must form the structured ToraSEO report. Return JSON that satisfies the required audit schema only; do not wrap it in markdown fences. Do not translate JSON property names. Use exactly these top-level keys: summary, nextStep, confirmedFacts, expertHypotheses. Each confirmedFacts item must use exactly: title, detail, priority, sourceToolIds. Priority values must be exactly high, medium, or low. User-facing string values should still be written in the user's language. Return one confirmedFacts item for every selected check, in the same order as selectedToolIds. sourceToolIds must contain the exact backend id for the current check from selectedToolIds, not the translated label. Use title for the finding headline, not the tool name; the app will render the tool name itself. Write detail in three short paragraphs when possible: key evidence, what was found, what to do. Use high only for blocking or publication-critical problems; use medium for normal editing issues; use low for healthy or informational findings. If this request contains only one selected check, treat it as the current step of a larger multi-tool scan: evaluate the article for that check, but do not write that only one check was selected, and do not turn scan mechanics into a content finding."
        : "This is a ToraSEO API + AI Chat article-text workflow. Do not return JSON.";

      return [
        outputInstruction,
        languageInstruction,
        actionInstruction,
        modeInstruction,
        structuredScan
          ? "The report source is the AI provider response. The application only prepares the text/context and displays the structured report after this response is parsed."
          : "If the user asks whether the report exists in ToraSEO, explain that in API mode the application can display a report only after the AI provider has returned a structured report; you cannot see the screen, but you can describe this workflow.",
        "Stay within the selected/relevant text-analysis tools. Do not pretend live MCP tools, internet SERP checks, external plagiarism checks, legal, medical, investment, engineering, or scientific expert verification ran.",
        "Use human-readable wording, not backend IDs. Mention uncertainty where a check is only heuristic.",
        structuredScan
          ? "For structured scan output, every confirmed fact must describe the article itself or a clearly labeled local heuristic. Do not create findings about selectedChecks, runId, JSON schema, API mode, or other orchestration details."
          : "Keep orchestration details out of the answer unless the user asks how the workflow works.",
        "Relevant checks may include platform/use-case, structure, style, tone, language/audience, media placeholders, local repetition/uniqueness, syntax, AI-writing style probability, naturalness, logic, local SEO intent/metadata, and safety/science/legal-sensitive risk flags.",
        "If rewriting or substantially reworking, preserve necessary caveats and do not strengthen unverified claims. Ask about media placeholder positions before adding them unless the user already requested media placement.",
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
          ? "Ответь по-русски."
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
  ): Promise<ProviderChatResponse> {
    const endpoint = `${resolveBaseUrl(this.config.baseUrl).replace(/\/+$/, "")}/chat/completions`;
    const requestBody: Record<string, unknown> = {
      model,
      temperature: request.policy.mode === "strict_audit" ? 0.1 : 0.35,
      max_tokens: hasArticleTextContext(request) || hasArticleCompareContext(request)
        ? 3600
        : hasScanEvidence(request)
          ? 1800
          : 700,
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
    try {
      response = await fetch(endpoint, {
        method: "POST",
        signal,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.config.apiKey}`,
          "HTTP-Referer": "https://github.com/Magbusjap/toraseo",
          "X-Title": "ToraSEO",
        },
        body: JSON.stringify(requestBody),
      });
    } catch (error) {
      if ((error as Error).name === "AbortError") {
        return {
          ok: false,
          errorCode: "provider_timeout",
          errorMessage: "The AI provider took too long to respond.",
        };
      }
      return {
        ok: false,
        errorCode: "provider_network_error",
        errorMessage:
          error instanceof Error
            ? error.message
            : "Network error while contacting OpenRouter.",
      };
    }

    let rawBody: string;
    try {
      rawBody = await response.text();
    } catch {
      return {
        ok: false,
        errorCode: "provider_bad_response",
        errorMessage: "OpenRouter response body could not be read.",
      };
    }

    if (response.status === 401 || response.status === 403) {
      return {
        ok: false,
        errorCode: "provider_auth_failed",
        errorMessage: "OpenRouter rejected the API key.",
      };
    }
    if (response.status === 429) {
      return {
        ok: false,
        errorCode: "provider_rate_limited",
        errorMessage: "OpenRouter rate-limited the request.",
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
            "The selected OpenRouter model does not support strict structured output.",
        };
      }
      return {
        ok: false,
        errorCode:
          response.status >= 500
            ? "provider_temporary_failure"
            : "provider_http_error",
        errorMessage: providerMessage
          ? `OpenRouter returned HTTP ${response.status}: ${providerMessage}`
          : `OpenRouter returned HTTP ${response.status}.`,
      };
    }

    const payload = parseProviderPayload(rawBody);
    if (!payload) {
      return {
        ok: false,
        errorCode: "provider_bad_response",
        errorMessage:
          outputContractMode === "json_schema"
            ? "OpenRouter returned a non-JSON API response."
            : "OpenRouter returned a non-JSON API response after compatibility fallback.",
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
        errorMessage: "OpenRouter response did not include message content.",
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
        errorMessage: "OpenRouter returned non-JSON message content.",
      };
    }

    const report = coerceReport(parsed, request, model);
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
        errorMessage: "OpenRouter response did not satisfy the audit contract.",
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
        errorMessage:
          "OpenRouter is not configured. Add an API key in Settings.",
      };
    }

    const model =
      request.modelOverride ?? this.config.defaultModel ?? DEFAULT_MODEL;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      try {
        const initialContractMode: OutputContractMode =
          hasScanEvidence(request) ||
          isStructuredArticleTextScan(request) ||
          isStructuredArticleCompareScan(request)
            ? "json_schema"
            : "prompt_only";
        const result = await this.executeAttempt(
          request,
          model,
          controller.signal,
          initialContractMode,
        );
        const shouldRetry =
          attempt < MAX_ATTEMPTS && isRetryableProviderResult(result);
        if (shouldRetry) {
          await wait(attempt * 500);
          continue;
        }
        if (shouldTryPromptOnlyFallback(result)) {
          const fallbackController = new AbortController();
          const fallbackTimeout = setTimeout(
            () => fallbackController.abort(),
            REQUEST_TIMEOUT_MS,
          );
          try {
            const fallback = await this.executeAttempt(
              request,
              model,
              fallbackController.signal,
              "prompt_only",
            );
            if (fallback.ok) return fallback;
            if (fallback.errorCode === "provider_bad_response") {
              return {
                ok: false,
                errorCode: "provider_bad_response",
                errorMessage:
                  "The selected OpenRouter model did not return parseable audit content. Try a model with structured JSON support.",
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
      errorMessage: "OpenRouter did not complete the request after retrying.",
    };
  }
}
