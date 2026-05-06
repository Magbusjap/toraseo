import {
  analyzeContent,
  analyzeHeadings,
  analyzeMeta,
  checkRobots,
  detectStack,
  type AnalyzeContentResult,
} from "@toraseo/core";

import { mutateBuffer, readState, type ToolBufferEntry } from "./stateFile.js";
import {
  readActiveInputMarkdown,
  writeActiveInputMarkdown,
  writeWorkspaceResult,
} from "./workspace.js";
import {
  aiHallucinationCheckHandler,
  aiTraceMapHandler,
  aiWritingProbabilityHandler,
  analyzeTextStructureHandler,
  analyzeTextStyleHandler,
  analyzeToneFitHandler,
  articleUniquenessHandler,
  claimSourceQueueHandler,
  detectTextPlatformHandler,
  factDistortionCheckHandler,
  genericnessWaterCheckHandler,
  intentSeoForecastHandler,
  languageAudienceFitHandler,
  languageSyntaxHandler,
  logicConsistencyCheckHandler,
  mediaPlaceholderReviewHandler,
  naturalnessIndicatorsHandler,
  readabilityComplexityHandler,
  safetyScienceReviewHandler,
} from "./textAnalysisTools.js";

type McpHandlerResult = {
  isError?: boolean;
  content: Array<{ type: "text"; text: string }>;
};

type PageUrlToolId =
  | "check_robots_txt"
  | "analyze_meta"
  | "analyze_headings"
  | "analyze_content"
  | "detect_stack"
  | "extract_main_text"
  | "detect_text_platform"
  | "analyze_text_structure"
  | "analyze_text_style"
  | "analyze_tone_fit"
  | "language_audience_fit"
  | "media_placeholder_review"
  | "article_uniqueness"
  | "language_syntax"
  | "ai_writing_probability"
  | "ai_trace_map"
  | "genericness_water_check"
  | "readability_complexity"
  | "claim_source_queue"
  | "naturalness_indicators"
  | "fact_distortion_check"
  | "logic_consistency_check"
  | "ai_hallucination_check"
  | "intent_seo_forecast"
  | "safety_science_review";

type PageTextHandler = () => Promise<McpHandlerResult>;

const PAGE_URL_INTERNAL_ORDER: PageUrlToolId[] = [
  "check_robots_txt",
  "analyze_meta",
  "analyze_headings",
  "analyze_content",
  "detect_stack",
  "extract_main_text",
  "detect_text_platform",
  "analyze_text_structure",
  "analyze_text_style",
  "analyze_tone_fit",
  "language_audience_fit",
  "media_placeholder_review",
  "article_uniqueness",
  "language_syntax",
  "ai_writing_probability",
  "ai_trace_map",
  "genericness_water_check",
  "readability_complexity",
  "claim_source_queue",
  "naturalness_indicators",
  "fact_distortion_check",
  "logic_consistency_check",
  "ai_hallucination_check",
  "intent_seo_forecast",
  "safety_science_review",
];

const TEXT_HANDLERS: Partial<Record<PageUrlToolId, PageTextHandler>> = {
  detect_text_platform: detectTextPlatformHandler,
  analyze_text_structure: analyzeTextStructureHandler,
  analyze_text_style: analyzeTextStyleHandler,
  analyze_tone_fit: analyzeToneFitHandler,
  language_audience_fit: languageAudienceFitHandler,
  media_placeholder_review: mediaPlaceholderReviewHandler,
  article_uniqueness: articleUniquenessHandler,
  language_syntax: languageSyntaxHandler,
  ai_writing_probability: aiWritingProbabilityHandler,
  ai_trace_map: aiTraceMapHandler,
  genericness_water_check: genericnessWaterCheckHandler,
  readability_complexity: readabilityComplexityHandler,
  claim_source_queue: claimSourceQueueHandler,
  naturalness_indicators: naturalnessIndicatorsHandler,
  fact_distortion_check: factDistortionCheckHandler,
  logic_consistency_check: logicConsistencyCheckHandler,
  ai_hallucination_check: aiHallucinationCheckHandler,
  intent_seo_forecast: intentSeoForecastHandler,
  safety_science_review: safetyScienceReviewHandler,
};

interface PageExtractionResult {
  url: string;
  source: "user_text_block" | "html_article_extraction";
  extraction_method?: AnalyzeContentResult["summary"]["extraction_method"];
  extraction_note?: string;
  word_count: number;
  character_count: number;
  text_blocks: string[];
  preview: string;
  limits: string[];
}

interface SearchEngineProbeResult {
  engine: "google" | "yandex";
  url: string;
  presence: "requires_connected_search_provider";
  queries_to_check: string[];
  indexed_keywords: string[];
  owner_metrics: {
    clicks_per_day: null;
    clicks_per_week: null;
    clicks_per_month: null;
    impressions_per_day: null;
    impressions_per_week: null;
    impressions_per_month: null;
    note: string;
  };
  mentions: {
    count: null;
    items: Array<{
      source: string;
      title: string;
      url: string;
      mention_context: string;
    }>;
    note: string;
  };
}

const emptySummary: ToolBufferEntry["summary"] = {
  critical: 0,
  warning: 0,
  info: 1,
};

function summarizeIssues(result: unknown): ToolBufferEntry["summary"] {
  const issueSource = result as {
    verdicts?: Array<{ severity?: string }>;
    issues?: Array<{ severity?: string }>;
  };
  const issues = Array.isArray(issueSource.verdicts)
    ? issueSource.verdicts
    : Array.isArray(issueSource.issues)
      ? issueSource.issues
      : [];
  return {
    critical: issues.filter((issue) => issue.severity === "critical").length,
    warning: issues.filter((issue) => issue.severity === "warning").length,
    info: issues.filter((issue) => issue.severity === "info").length,
  };
}

function verdictFromSummary(
  summary: ToolBufferEntry["summary"],
): "ok" | "warning" | "critical" {
  if ((summary?.critical ?? 0) > 0) return "critical";
  if ((summary?.warning ?? 0) > 0) return "warning";
  return "ok";
}

function countWords(text: string): number {
  return text
    .split(/\s+/)
    .filter((token) => /[\p{L}\p{N}]/u.test(token)).length;
}

function textBlocksFromText(text: string): string[] {
  return text
    .split(/\n{2,}/)
    .map((block) => block.replace(/\s+/g, " ").trim())
    .filter((block) => block.length >= 24)
    .slice(0, 120);
}

async function runBufferedTool<T>(
  toolId: string,
  task: () => Promise<T>,
): Promise<McpHandlerResult> {
  const startedAt = new Date().toISOString();
  await mutateBuffer(toolId, () => ({
    status: "running",
    startedAt,
    completedAt: null,
  }));

  try {
    const result = await task();
    const completedAt = new Date().toISOString();
    const updated = await mutateBuffer(toolId, () => ({
      status: "complete",
      startedAt,
      completedAt,
      verdict: "ok",
      data: result,
      summary: emptySummary,
    }));
    await writeWorkspaceResult(updated, toolId, result);

    return {
      content: [
        {
          type: "text",
          text: updated
            ? `Проверка страницы по URL завершена: ${toolId}. Результаты записаны в ToraSEO.`
            : JSON.stringify(result, null, 2),
        },
      ],
    };
  } catch (error) {
    const completedAt = new Date().toISOString();
    const errorMessage = error instanceof Error ? error.message : String(error);
    const updated = await mutateBuffer(toolId, () => ({
      status: "error",
      startedAt,
      completedAt,
      errorCode: "page_url_error",
      errorMessage,
    }));
    await writeWorkspaceResult(updated, toolId, {
      errorCode: "page_url_error",
      errorMessage,
    });

    return {
      isError: true,
      content: [{ type: "text", text: `[page_url_error] ${errorMessage}` }],
    };
  }
}

async function runCorePageTool<T>(
  toolId: PageUrlToolId,
  url: string,
  task: () => Promise<T>,
): Promise<void> {
  const startedAt = new Date().toISOString();
  await mutateBuffer(toolId, () => ({
    status: "running",
    startedAt,
    completedAt: null,
  }));

  try {
    const result = await task();
    const completedAt = new Date().toISOString();
    const summary = summarizeIssues(result);
    const updated = await mutateBuffer(toolId, () => ({
      status: "complete",
      startedAt,
      completedAt,
      verdict: verdictFromSummary(summary),
      data: result,
      summary,
    }));
    await writeWorkspaceResult(updated, toolId, result);
  } catch (error) {
    const completedAt = new Date().toISOString();
    const errorMessage = error instanceof Error ? error.message : String(error);
    const updated = await mutateBuffer(toolId, () => ({
      status: "error",
      startedAt,
      completedAt,
      errorCode: "page_url_error",
      errorMessage: `${url}: ${errorMessage}`,
    }));
    await writeWorkspaceResult(updated, toolId, {
      errorCode: "page_url_error",
      errorMessage,
    });
  }
}

async function runSelectedPageTool(toolId: PageUrlToolId, url: string): Promise<void> {
  if (toolId === "extract_main_text") {
    await extractMainTextHandler();
    return;
  }
  if (toolId === "check_robots_txt") {
    await runCorePageTool(toolId, url, () => checkRobots(url));
    return;
  }
  if (toolId === "analyze_meta") {
    await runCorePageTool(toolId, url, () => analyzeMeta(url));
    return;
  }
  if (toolId === "analyze_headings") {
    await runCorePageTool(toolId, url, () => analyzeHeadings(url));
    return;
  }
  if (toolId === "analyze_content") {
    await runCorePageTool(toolId, url, () => analyzeContent(url));
    return;
  }
  if (toolId === "detect_stack") {
    await runCorePageTool(toolId, url, () => detectStack(url));
    return;
  }

  const handler = TEXT_HANDLERS[toolId];
  if (handler) await handler();
}

export async function extractMainTextHandler(): Promise<McpHandlerResult> {
  return runBufferedTool<PageExtractionResult>("extract_main_text", async () => {
    const state = await readState();
    if (state?.analysisType !== "page_by_url") {
      throw new Error("Активный контекст ToraSEO не является анализом страницы по URL.");
    }

    const userBlock =
      state.input?.pageTextBlock?.trim() ||
      state.input?.text?.trim() ||
      (await readActiveInputMarkdown(state))?.trim() ||
      "";

    if (userBlock) {
      await writeActiveInputMarkdown(state, userBlock);
      return {
        url: state.url,
        source: "user_text_block",
        word_count: countWords(userBlock),
        character_count: userBlock.length,
        text_blocks: textBlocksFromText(userBlock),
        preview: userBlock.slice(0, 700),
        limits: [
          "Пользователь выделил конкретный фрагмент, поэтому ToraSEO анализирует его как основной текст страницы.",
        ],
      };
    }

    const content = await analyzeContent(state.url);
    const extractedText =
      content.text_blocks?.join("\n\n").trim() || content.main_text?.trim() || "";
    if (!extractedText) {
      throw new Error("Не удалось выделить основной текст статьи из HTML страницы.");
    }

    await writeActiveInputMarkdown(state, extractedText);
    return {
      url: content.url,
      source: "html_article_extraction",
      extraction_method: content.summary.extraction_method,
      extraction_note: content.summary.extraction_note,
      word_count: content.summary.word_count,
      character_count: content.summary.character_count,
      text_blocks: content.text_blocks ?? [],
      preview: extractedText.slice(0, 700),
      limits: [
        "ToraSEO удаляет локальные рекламные, навигационные, социальные и служебные блоки из HTML, но не обходит авторизацию, paywall, CAPTCHA или robots.txt.",
      ],
    };
  });
}

export async function pageUrlArticleInternalHandler(): Promise<McpHandlerResult> {
  return runBufferedTool("page_url_article_internal", async () => {
    const state = await readState();
    if (state?.analysisType !== "page_by_url") {
      throw new Error("Активный контекст ToraSEO не является анализом страницы по URL.");
    }

    const selected = new Set(state.selectedTools);
    const completed: string[] = [];
    for (const toolId of PAGE_URL_INTERNAL_ORDER) {
      if (!selected.has(toolId)) continue;
      await runSelectedPageTool(toolId, state.url);
      completed.push(toolId);
    }

    return {
      tool: "page_url_article_internal",
      completedTools: completed,
      summary:
        "Внутренний пакет анализа страницы по URL завершен: извлечение статьи, технические проверки страницы и текстовые проверки записаны в ToraSEO.",
    };
  });
}

function buildSearchProbe(
  engine: SearchEngineProbeResult["engine"],
  url: string,
): SearchEngineProbeResult {
  let origin = "";
  try {
    origin = new URL(url).origin;
  } catch {
    origin = url;
  }

  return {
    engine,
    url,
    presence: "requires_connected_search_provider",
    queries_to_check: [`"${url}"`, `site:${origin} "${url}"`, `link:${url}`],
    indexed_keywords: [],
    owner_metrics: {
      clicks_per_day: null,
      clicks_per_week: null,
      clicks_per_month: null,
      impressions_per_day: null,
      impressions_per_week: null,
      impressions_per_month: null,
      note:
        engine === "google"
          ? "Клики, показы и частотность доступны через Google Search Console или официальный SEO-провайдер, а не из публичной выдачи."
          : "Клики, показы и частотность доступны через Яндекс Вебмастер/Метрику или официальный SEO-провайдер, а не из публичной выдачи.",
    },
    mentions: {
      count: null,
      items: [],
      note:
        "Для полного списка упоминаний нужен подключенный поисковый индекс, SERP API или владелецкие данные. ToraSEO не подменяет это скрейпингом поисковика.",
    },
  };
}

export async function analyzeGooglePageSearchHandler(): Promise<McpHandlerResult> {
  return runBufferedTool<SearchEngineProbeResult>(
    "analyze_google_page_search",
    async () => {
      const state = await readState();
      if (!state?.url) throw new Error("Нет активного URL для проверки Google.");
      return buildSearchProbe("google", state.url);
    },
  );
}

export async function analyzeYandexPageSearchHandler(): Promise<McpHandlerResult> {
  return runBufferedTool<SearchEngineProbeResult>(
    "analyze_yandex_page_search",
    async () => {
      const state = await readState();
      if (!state?.url) throw new Error("Нет активного URL для проверки Яндекса.");
      return buildSearchProbe("yandex", state.url);
    },
  );
}
