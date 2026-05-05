import { mutateBuffer, readState, type ToolBufferEntry } from "./stateFile.js";
import { readActiveInputMarkdown, writeWorkspaceResult } from "./workspace.js";

type CompareToolId =
  | "detect_text_platform"
  | "analyze_text_structure"
  | "analyze_text_style"
  | "analyze_tone_fit"
  | "language_audience_fit"
  | "media_placeholder_review"
  | "article_uniqueness"
  | "language_syntax"
  | "ai_writing_probability"
  | "naturalness_indicators"
  | "fact_distortion_check"
  | "logic_consistency_check"
  | "ai_hallucination_check"
  | "intent_seo_forecast"
  | "safety_science_review"
  | "compare_intent_gap"
  | "compare_article_structure"
  | "compare_content_gap"
  | "compare_semantic_gap"
  | "compare_specificity_gap"
  | "compare_trust_gap"
  | "compare_article_style"
  | "similarity_risk"
  | "compare_title_ctr"
  | "compare_platform_fit"
  | "compare_strengths_weaknesses"
  | "compare_improvement_plan";

type CompareGoalMode =
  | "standard_comparison"
  | "focus_text_a"
  | "focus_text_b"
  | "beat_competitor"
  | "style_match"
  | "similarity_check"
  | "version_compare"
  | "ab_post";

const ARTICLE_COMPARE_INTERNAL_TOOLS: CompareToolId[] = [
  "detect_text_platform",
  "analyze_text_structure",
  "analyze_text_style",
  "analyze_tone_fit",
  "language_audience_fit",
  "media_placeholder_review",
  "article_uniqueness",
  "language_syntax",
  "ai_writing_probability",
  "naturalness_indicators",
  "fact_distortion_check",
  "logic_consistency_check",
  "ai_hallucination_check",
  "intent_seo_forecast",
  "safety_science_review",
  "compare_intent_gap",
  "compare_article_structure",
  "compare_content_gap",
  "compare_semantic_gap",
  "compare_specificity_gap",
  "compare_trust_gap",
  "compare_article_style",
  "similarity_risk",
  "compare_title_ctr",
  "compare_platform_fit",
  "compare_strengths_weaknesses",
  "compare_improvement_plan",
];

interface CompareContext {
  goal: string;
  goalMode: CompareGoalMode;
  roleA: "auto" | "own" | "competitor";
  roleB: "auto" | "own" | "competitor";
  textPlatform: string;
  customPlatform: string;
  textA: string;
  textB: string;
}

interface CompareIssue {
  severity: "critical" | "warning" | "info";
  code: string;
  message: string;
}

interface CompareToolResult {
  tool: CompareToolId;
  summary: Record<string, unknown>;
  issues: CompareIssue[];
  recommendations: string[];
}

type McpHandlerResult = {
  isError?: boolean;
  content: Array<{ type: "text"; text: string }>;
};

interface TextStats {
  words: string[];
  wordCount: number;
  paragraphs: string[];
  paragraphCount: number;
  headings: string[];
  sentenceCount: number;
  avgSentenceWords: number | null;
  questionCount: number;
  listCount: number;
  numberCount: number;
  trustSignalCount: number;
}

function tokenize(text: string): string[] {
  return Array.from(text.toLowerCase().matchAll(/[\p{L}\p{N}]+/gu)).map(
    (match) => match[0],
  );
}

function splitParagraphs(text: string): string[] {
  return text
    .split(/\n{2,}/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function stripHeading(line: string): string {
  return line.trim().replace(/^#{1,6}\s+/, "");
}

function stats(text: string): TextStats {
  const words = tokenize(text);
  const paragraphs = splitParagraphs(text);
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const headings = lines
    .filter((line) => /^(#{1,6}\s+|[А-ЯA-Z0-9][^.!?]{2,90}:?$)/u.test(line))
    .map(stripHeading);
  const sentences = text
    .split(/[.!?…]+/u)
    .map((item) => item.trim())
    .filter(Boolean);
  const listCount = lines.filter((line) => /^\s*(?:[-*•]|\d+[.)])\s+/.test(line)).length;
  const numberCount = (text.match(/\b\d+(?:[.,]\d+)?\b/g) ?? []).length;
  const trustSignalCount = (
    text.match(
      /источник|исследован|данн|ссылка|по данным|рекоменд|врач|эксперт|закон|ГОСТ|pubmed|doi|source|study|research|according|expert|warning|risk/giu,
    ) ?? []
  ).length;
  return {
    words,
    wordCount: words.length,
    paragraphs,
    paragraphCount: paragraphs.length,
    headings,
    sentenceCount: sentences.length,
    avgSentenceWords:
      sentences.length > 0 ? Math.round(words.length / sentences.length) : null,
    questionCount: (text.match(/\?/g) ?? []).length,
    listCount,
    numberCount,
    trustSignalCount,
  };
}

function parseCompareMarkdown(markdown: string): {
  textA: string;
  textB: string;
} {
  const match = markdown.match(/## Text A\s*([\s\S]*?)\n## Text B\s*([\s\S]*)$/i);
  if (!match) return { textA: "", textB: "" };
  return {
    textA: match[1]?.trim() ?? "",
    textB: match[2]?.trim() ?? "",
  };
}

function inferCompareGoalMode(goal: string): CompareGoalMode {
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

function compareGoalModeLabel(mode: CompareGoalMode): string {
  const labels: Record<CompareGoalMode, string> = {
    standard_comparison: "стандартное сравнение",
    focus_text_a: "фокус на тексте A",
    focus_text_b: "фокус на тексте B",
    beat_competitor: "сравнение с конкурентом",
    style_match: "подражание стилю",
    similarity_check: "проверка похожести",
    version_compare: "сравнение версий",
    ab_post: "A/B-анализ поста",
  };
  return labels[mode];
}

async function getCompareContext(): Promise<CompareContext> {
  const state = await readState();
  if (state && state.analysisType !== "article_compare") {
    throw new Error("The active ToraSEO context is not article_compare.");
  }
  const workspaceText = await readActiveInputMarkdown(state);
  const parsed = workspaceText ? parseCompareMarkdown(workspaceText) : null;
  const textA = (state?.input?.textA ?? parsed?.textA ?? "").trim();
  const textB = (state?.input?.textB ?? parsed?.textB ?? "").trim();
  if (!textA || !textB) {
    throw new Error("No active ToraSEO article_compare context is available.");
  }
  return {
    goal: state?.input?.goal?.trim() || "стандартный отчет сравнения",
    goalMode:
      state?.input?.goalMode ?? inferCompareGoalMode(state?.input?.goal ?? ""),
    roleA: state?.input?.roleA ?? "auto",
    roleB: state?.input?.roleB ?? "auto",
    textPlatform: state?.input?.textPlatform?.trim() || "auto",
    customPlatform: state?.input?.customPlatform?.trim() || "",
    textA,
    textB,
  };
}

function issueCounts(issues: CompareIssue[]): ToolBufferEntry["summary"] {
  return {
    critical: issues.filter((issue) => issue.severity === "critical").length,
    warning: issues.filter((issue) => issue.severity === "warning").length,
    info: issues.filter((issue) => issue.severity === "info").length,
  };
}

function verdict(issues: CompareIssue[]): "ok" | "warning" | "critical" {
  if (issues.some((issue) => issue.severity === "critical")) return "critical";
  if (issues.some((issue) => issue.severity === "warning")) return "warning";
  return "ok";
}

function winnerLabel(a: number, b: number, inverse = false): "textA" | "textB" | "tie" {
  if (Math.abs(a - b) <= 2) return "tie";
  if (inverse) return a < b ? "textA" : "textB";
  return a > b ? "textA" : "textB";
}

function winnerRu(winner: "textA" | "textB" | "tie" | "unclear"): string {
  if (winner === "textA") return "Текст A";
  if (winner === "textB") return "Текст B";
  if (winner === "tie") return "примерно одинаково";
  return "нужна ручная проверка";
}

function compareBy(
  a: number,
  b: number,
  inverse = false,
): "textA" | "textB" | "tie" {
  return winnerLabel(a, b, inverse);
}

function topTerms(words: string[]): string[] {
  const stop = new Set([
    "и",
    "в",
    "на",
    "для",
    "что",
    "как",
    "это",
    "the",
    "and",
    "for",
    "that",
    "with",
    "this",
    "you",
  ]);
  const counts = new Map<string, number>();
  for (const word of words) {
    if (word.length < 4 || stop.has(word)) continue;
    counts.set(word, (counts.get(word) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 12)
    .map(([word]) => word);
}

function sharedRatio(left: string[], right: string[]): number {
  const a = new Set(left);
  const b = new Set(right);
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const item of a) {
    if (b.has(item)) shared += 1;
  }
  return Math.round((shared / Math.min(a.size, b.size)) * 100);
}

function shingleOverlap(textA: string, textB: string): number {
  const build = (text: string) => {
    const words = tokenize(text);
    const shingles = new Set<string>();
    for (let index = 0; index <= words.length - 4; index += 1) {
      shingles.add(words.slice(index, index + 4).join(" "));
    }
    return shingles;
  };
  const a = build(textA);
  const b = build(textB);
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const item of a) {
    if (b.has(item)) shared += 1;
  }
  return Math.round((shared / Math.min(a.size, b.size)) * 100);
}

function baseSummary(context: CompareContext): {
  a: TextStats;
  b: TextStats;
  termsA: string[];
  termsB: string[];
} {
  const a = stats(context.textA);
  const b = stats(context.textB);
  return {
    a,
    b,
    termsA: topTerms(a.words),
    termsB: topTerms(b.words),
  };
}

function analyzeIntentGap(context: CompareContext): CompareToolResult {
  const base = baseSummary(context);
  const overlap = sharedRatio(base.termsA, base.termsB);
  const issues: CompareIssue[] = [];
  if (overlap < 35) {
    issues.push({
      severity: "warning",
      code: "intent_terms_diverge",
      message:
        "Текст A и текст B делают акцент на разных ключевых понятиях, поэтому интент может совпадать не полностью.",
    });
  }
  return {
    tool: "compare_intent_gap",
    summary: {
      goal: context.goal,
      topTermsA: base.termsA,
      topTermsB: base.termsB,
      intentTermOverlap: overlap,
      likelyWinner: overlap >= 55 ? "примерно одинаково" : "нужна ручная проверка",
    },
    issues,
    recommendations: [
      "Перед выводом о том, какой текст сильнее, проверьте, что оба текста отвечают на один и тот же запрос.",
      "Если один текст используется как конкурентный ориентир, берите фокус интента, а не формулировки.",
    ],
  };
}

function analyzeStructure(context: CompareContext): CompareToolResult {
  const { a, b } = baseSummary(context);
  const scoreA = a.headings.length * 2 + a.listCount + Math.min(6, a.paragraphCount);
  const scoreB = b.headings.length * 2 + b.listCount + Math.min(6, b.paragraphCount);
  return {
    tool: "compare_article_structure",
    summary: {
      headingsA: a.headings.length,
      headingsB: b.headings.length,
      paragraphsA: a.paragraphCount,
      paragraphsB: b.paragraphCount,
      listsA: a.listCount,
      listsB: b.listCount,
      structureWinner: winnerLabel(scoreA, scoreB),
    },
    issues:
      Math.abs(scoreA - scoreB) >= 4
        ? [
            {
              severity: "warning",
              code: "structure_gap",
              message:
                scoreA > scoreB
                  ? "У текста A сильнее видимая структура: больше опорных блоков для читателя."
                  : "У текста B сильнее видимая структура: больше опорных блоков для читателя.",
            },
          ]
        : [],
    recommendations: [
      "Сравнивайте не только количество заголовков, а путь читателя: проблема, объяснение, шаги, примеры, FAQ и вывод.",
    ],
  };
}

function analyzeContentGap(context: CompareContext): CompareToolResult {
  const { termsA, termsB } = baseSummary(context);
  const setA = new Set(termsA);
  const setB = new Set(termsB);
  const missingInA = termsB.filter((term) => !setA.has(term)).slice(0, 8);
  const missingInB = termsA.filter((term) => !setB.has(term)).slice(0, 8);
  return {
    tool: "compare_content_gap",
    summary: {
      missingInA,
      missingInB,
      sharedTerms: termsA.filter((term) => setB.has(term)).slice(0, 8),
    },
    issues:
      missingInA.length >= 5 || missingInB.length >= 5
        ? [
            {
              severity: "warning",
              code: "content_gap_detected",
              message:
                "Тексты заметно расходятся по тематическому покрытию; перед правкой проверьте отсутствующие разделы.",
            },
          ]
        : [],
    recommendations: [
      "Используйте отсутствующие темы как подсказки для собственных разделов, примеров или FAQ, а не для копирования второго текста.",
    ],
  };
}

function analyzeSemanticGap(context: CompareContext): CompareToolResult {
  const { termsA, termsB } = baseSummary(context);
  return {
    tool: "compare_semantic_gap",
    summary: {
      semanticOverlap: sharedRatio(termsA, termsB),
      entitiesA: termsA,
      entitiesB: termsB,
    },
    issues: [],
    recommendations: [
      "Усильте смысловое покрытие через недостающие понятия, но добавляйте собственные объяснения и примеры.",
    ],
  };
}

function analyzeSpecificity(context: CompareContext): CompareToolResult {
  const { a, b } = baseSummary(context);
  const scoreA = a.numberCount + a.listCount + a.questionCount;
  const scoreB = b.numberCount + b.listCount + b.questionCount;
  return {
    tool: "compare_specificity_gap",
    summary: {
      numbersA: a.numberCount,
      numbersB: b.numberCount,
      listsA: a.listCount,
      listsB: b.listCount,
      questionsA: a.questionCount,
      questionsB: b.questionCount,
      specificityWinner: winnerLabel(scoreA, scoreB),
    },
    issues:
      Math.abs(scoreA - scoreB) >= 3
        ? [
            {
              severity: "warning",
              code: "specificity_gap",
              message:
                scoreA > scoreB
                  ? "Текст A даёт больше сигналов конкретики: цифр, вопросов, списков или практических деталей."
                  : "Текст B даёт больше сигналов конкретики: цифр, вопросов, списков или практических деталей.",
            },
          ]
        : [],
    recommendations: [
      "Добавляйте конкретные шаги, сценарии, примеры и цифры только там, где они точны и полезны.",
    ],
  };
}

function analyzeTrust(context: CompareContext): CompareToolResult {
  const { a, b } = baseSummary(context);
  return {
    tool: "compare_trust_gap",
    summary: {
      trustSignalsA: a.trustSignalCount,
      trustSignalsB: b.trustSignalCount,
      trustWinner: winnerLabel(a.trustSignalCount, b.trustSignalCount),
    },
    issues: [],
    recommendations: [
      "Для медицинских, юридических, финансовых, технических и научных утверждений нужны источники, осторожные формулировки и ручная проверка.",
    ],
  };
}

function analyzeStyle(context: CompareContext): CompareToolResult {
  const { a, b } = baseSummary(context);
  return {
    tool: "compare_article_style",
    summary: {
      avgSentenceWordsA: a.avgSentenceWords,
      avgSentenceWordsB: b.avgSentenceWords,
      readabilityWinner:
        a.avgSentenceWords !== null && b.avgSentenceWords !== null
          ? winnerLabel(a.avgSentenceWords, b.avgSentenceWords, true)
          : "tie",
    },
    issues: [],
    recommendations: [
      "Если нужно приблизиться к стилю, переносите уровень ясности, ритм и плотность примеров, но не фразы и порядок абзацев.",
    ],
  };
}

function analyzeSimilarity(context: CompareContext): CompareToolResult {
  const exactOverlap = shingleOverlap(context.textA, context.textB);
  const copyRisk =
    exactOverlap >= 35 ? "high" : exactOverlap >= 15 ? "medium" : "low";
  return {
    tool: "similarity_risk",
    summary: {
      exactOverlap,
      semanticSimilarity: null,
      copyRisk,
      note: "Локальная проверка точных совпадений фраз; это не внешняя проверка плагиата.",
    },
    issues:
      copyRisk === "high"
        ? [
            {
              severity: "critical",
              code: "high_exact_overlap",
              message:
                "Дословных совпадений много. Перед публикацией нужно независимо переработать формулировки, примеры и порядок блоков.",
            },
          ]
        : copyRisk === "medium"
          ? [
              {
                severity: "warning",
                code: "medium_exact_overlap",
                message:
                  "Есть заметные дословные совпадения. Оставляйте идеи только как ориентир и переписывайте независимо.",
              },
            ]
          : [],
    recommendations: [
      "Используйте похожую логику только как ориентир; добавьте собственные примеры, выводы и формулировки.",
    ],
  };
}

function analyzeTitleCtr(context: CompareContext): CompareToolResult {
  const { a, b } = baseSummary(context);
  const titleA = a.headings[0] ?? a.paragraphs[0]?.slice(0, 90) ?? "";
  const titleB = b.headings[0] ?? b.paragraphs[0]?.slice(0, 90) ?? "";
  const scoreA = Math.min(100, titleA.length + (titleA.includes(":") ? 12 : 0));
  const scoreB = Math.min(100, titleB.length + (titleB.includes(":") ? 12 : 0));
  return {
    tool: "compare_title_ctr",
    summary: {
      titleA,
      titleB,
      ctrDraftA: scoreA,
      ctrDraftB: scoreB,
      ctrWinner: winnerLabel(scoreA, scoreB),
    },
    issues: [],
    recommendations: [
      "Лучше работает заголовок, который прямо называет интент и пользу без кликбейта.",
    ],
  };
}

function analyzePlatformFit(context: CompareContext): CompareToolResult {
  const { a, b } = baseSummary(context);
  const platform = context.customPlatform || context.textPlatform || "auto";
  return {
    tool: "compare_platform_fit",
    summary: {
      platform,
      textAWordCount: a.wordCount,
      textBWordCount: b.wordCount,
      platformFitWinner: winnerLabel(
        Math.min(a.wordCount, 1800),
        Math.min(b.wordCount, 1800),
      ),
    },
    issues: [],
    recommendations: [
      "Оценивайте пригодность под выбранную площадку: статьям сайта нужны структура и полнота, соцсетям — хук и короткая польза.",
    ],
  };
}

function analyzeStrengthsWeaknesses(context: CompareContext): CompareToolResult {
  const { a, b } = baseSummary(context);
  return {
    tool: "compare_strengths_weaknesses",
    summary: {
      textAStrengths: [
        a.avgSentenceWords !== null && a.avgSentenceWords < (b.avgSentenceWords ?? 999)
          ? "короче средняя длина предложения"
          : "",
        a.headings.length > b.headings.length ? "больше видимых структурных блоков" : "",
        a.numberCount > b.numberCount ? "больше числовой конкретики" : "",
      ].filter(Boolean),
      textBStrengths: [
        b.avgSentenceWords !== null && b.avgSentenceWords < (a.avgSentenceWords ?? 999)
          ? "короче средняя длина предложения"
          : "",
        b.headings.length > a.headings.length ? "больше видимых структурных блоков" : "",
        b.numberCount > a.numberCount ? "больше числовой конкретики" : "",
      ].filter(Boolean),
    },
    issues: [],
    recommendations: [
      "Используйте сильные стороны как приоритеты редактирования, а не как повод копировать второй текст.",
    ],
  };
}

function analyzeImprovementPlan(context: CompareContext): CompareToolResult {
  const gap = analyzeContentGap(context).summary;
  const specificity = analyzeSpecificity(context).summary;
  return {
    tool: "compare_improvement_plan",
    summary: {
      goal: context.goal,
      firstSteps: [
        "Проверить общий интент двух текстов.",
        "Закрыть самые важные content gap через собственные разделы.",
        "Добавить конкретные примеры, шаги или сценарии там, где они полезны.",
        "Сохранить независимые формулировки и примеры, чтобы снизить риск копирования.",
      ],
      contentGap: gap,
      specificity,
    },
    issues: [],
    recommendations: [
      "Усиливайте более слабый текст добавленной ценностью, а не зеркальным повторением сильного текста.",
      "После правок запустите сравнение снова и проверьте, сократились ли разрывы.",
    ],
  };
}

function analyzeCompareTextPlatform(context: CompareContext): CompareToolResult {
  const { a, b } = baseSummary(context);
  const platform = context.customPlatform || context.textPlatform || "auto";
  return {
    tool: "detect_text_platform",
    summary: {
      platform,
      textAWordCount: a.wordCount,
      textBWordCount: b.wordCount,
      textAFormat: a.wordCount > 900 ? "длинная статья" : "короткий текст / пост",
      textBFormat: b.wordCount > 900 ? "длинная статья" : "короткий текст / пост",
      platformFitWinner: winnerRu(
        compareBy(Math.min(a.wordCount, 1800), Math.min(b.wordCount, 1800)),
      ),
    },
    issues: [
      {
        severity: "info",
        code: "platform_compared",
        message:
          "Оба текста проверены как материалы для выбранной площадки. Это локальная оценка формата, а не данные SERP.",
      },
    ],
    recommendations: [
      "Сопоставляйте объём и структуру с площадкой: для статьи сайта важны полнота и разделы, для соцсетей — хук, ясность и компактность.",
    ],
  };
}

function analyzeCompareTextStructure(context: CompareContext): CompareToolResult {
  return {
    ...analyzeStructure(context),
    tool: "analyze_text_structure",
  };
}

function analyzeCompareTextStyle(context: CompareContext): CompareToolResult {
  return {
    ...analyzeStyle(context),
    tool: "analyze_text_style",
  };
}

function analyzeCompareTone(context: CompareContext): CompareToolResult {
  const { a, b } = baseSummary(context);
  const cautionA = a.trustSignalCount + a.questionCount;
  const cautionB = b.trustSignalCount + b.questionCount;
  return {
    tool: "analyze_tone_fit",
    summary: {
      toneWinner: winnerRu(compareBy(cautionA, cautionB)),
      textACautionSignals: cautionA,
      textBCautionSignals: cautionB,
    },
    issues: [],
    recommendations: [
      "Тон должен соответствовать риску темы: в медицине, финансах, праве и технике лучше звучит точность, осторожность и ясное ограничение советов.",
    ],
  };
}

function analyzeCompareLanguageAudience(context: CompareContext): CompareToolResult {
  const { a, b } = baseSummary(context);
  return {
    tool: "language_audience_fit",
    summary: {
      textAAverageSentenceWords: a.avgSentenceWords,
      textBAverageSentenceWords: b.avgSentenceWords,
      audienceClarityWinner:
        a.avgSentenceWords !== null && b.avgSentenceWords !== null
          ? winnerRu(compareBy(a.avgSentenceWords, b.avgSentenceWords, true))
          : "нужна ручная проверка",
    },
    issues: [],
    recommendations: [
      "Проверьте, кому адресован каждый текст. Если аудитория разная, сравнивайте не только качество, но и соответствие ожиданиям читателя.",
    ],
  };
}

function analyzeCompareMedia(context: CompareContext): CompareToolResult {
  const countMarkers = (text: string) =>
    (text.match(/место для изображения|image placeholder|место для видео|video placeholder|место для аудио|audio placeholder/giu) ?? [])
      .length;
  const mediaA = countMarkers(context.textA);
  const mediaB = countMarkers(context.textB);
  return {
    tool: "media_placeholder_review",
    summary: {
      textAMediaMarkers: mediaA,
      textBMediaMarkers: mediaB,
      mediaPlanningWinner: winnerRu(compareBy(mediaA, mediaB)),
    },
    issues:
      mediaA === 0 && mediaB === 0
        ? [
            {
              severity: "info",
              code: "no_media_markers",
              message:
                "В текстах нет явных меток медиа. Для длинной статьи стоит проверить, где нужны изображения, схемы или видео.",
            },
          ]
        : [],
    recommendations: [
      "Для сайта полезно отмечать медиа внутри релевантных разделов, а не складывать все изображения в конец текста.",
    ],
  };
}

function analyzeCompareUniqueness(context: CompareContext): CompareToolResult {
  const overlap = shingleOverlap(context.textA, context.textB);
  const copyRisk =
    overlap >= 35 ? "высокий" : overlap >= 15 ? "средний" : "низкий";
  return {
    tool: "article_uniqueness",
    summary: {
      exactPhraseOverlap: overlap,
      localUniquenessA: Math.max(0, 100 - overlap),
      localUniquenessB: Math.max(0, 100 - overlap),
      copyRisk,
    },
    issues:
      overlap >= 15
        ? [
            {
              severity: overlap >= 35 ? "critical" : "warning",
              code: "copy_risk",
              message:
                "Есть локальный риск похожести. Это не внешняя проверка плагиата, но формулировки лучше развести сильнее.",
            },
          ]
        : [],
    recommendations: [
      "0% в этой метрике означает отсутствие совпавших 4-словных фрагментов в локальной проверке, а не гарантию абсолютной уникальности.",
    ],
  };
}

function analyzeCompareSyntax(context: CompareContext): CompareToolResult {
  const punctuationRisk = (text: string) =>
    (text.match(/[,;:]{2,}|[.!?]{3,}|\s{2,}/g) ?? []).length;
  const riskA = punctuationRisk(context.textA);
  const riskB = punctuationRisk(context.textB);
  return {
    tool: "language_syntax",
    summary: {
      textASyntaxRiskSignals: riskA,
      textBSyntaxRiskSignals: riskB,
      cleanerSyntax: winnerRu(compareBy(riskA, riskB, true)),
    },
    issues:
      riskA > 0 || riskB > 0
        ? [
            {
              severity: "info",
              code: "syntax_risk_signals",
              message:
                "Найдены локальные синтаксические или пунктуационные сигналы, которые стоит вычитать вручную.",
            },
          ]
        : [],
    recommendations: [
      "Сделайте финальную ручную вычитку пунктуации, границ предложений и перегруженных фраз в обоих текстах.",
    ],
  };
}

function analyzeCompareAiProbability(context: CompareContext): CompareToolResult {
  const genericSignals = (text: string) =>
    (text.match(/важно отметить|следует отметить|в современном мире|таким образом|в заключение|comprehensive|it is important/giu) ?? [])
      .length;
  const signalA = genericSignals(context.textA);
  const signalB = genericSignals(context.textB);
  return {
    tool: "ai_writing_probability",
    summary: {
      textAAiStyleSignals: signalA,
      textBAiStyleSignals: signalB,
      moreHumanByLocalSignals: winnerRu(compareBy(signalA, signalB, true)),
    },
    issues: [],
    recommendations: [
      "Чтобы текст звучал авторски, добавьте конкретный опыт, примеры, контекст и меньше универсальных служебных оборотов.",
    ],
  };
}

function analyzeCompareNaturalness(context: CompareContext): CompareToolResult {
  const repetition = (text: string) => {
    const terms = topTerms(tokenize(text));
    return terms.length;
  };
  const repA = repetition(context.textA);
  const repB = repetition(context.textB);
  return {
    tool: "naturalness_indicators",
    summary: {
      textARepeatedCoreTerms: repA,
      textBRepeatedCoreTerms: repB,
      naturalnessWinner: winnerRu(compareBy(repA, repB, true)),
    },
    issues: [],
    recommendations: [
      "Если текст кажется механическим, разнообразьте начала предложений, добавьте живые переходы и уберите повторы без смысловой пользы.",
    ],
  };
}

function analyzeCompareLogic(context: CompareContext): CompareToolResult {
  const jumps = (text: string) =>
    (text.match(/поэтому|следовательно|значит|всегда|никогда|because|therefore|always|never/giu) ?? [])
      .length;
  const a = jumps(context.textA);
  const b = jumps(context.textB);
  return {
    tool: "logic_consistency_check",
    summary: {
      textALogicTransitionSignals: a,
      textBLogicTransitionSignals: b,
      needsMoreSupport: winnerRu(compareBy(a, b)),
    },
    issues:
      a + b > 0
        ? [
            {
              severity: "info",
              code: "logic_transitions_found",
              message:
                "В текстах есть причинно-следственные переходы. Их нужно проверять на достаточность объяснения, а не считать ошибками автоматически.",
            },
          ]
        : [],
    recommendations: [
      "Проверьте места с «поэтому», «следовательно», «всегда» и «никогда»: рядом должно быть обоснование.",
    ],
  };
}

function analyzeCompareFactDistortion(context: CompareContext): CompareToolResult {
  const sensitive = (text: string) =>
    (text.match(/врач|лечение|болезн|закон|налог|договор|исследован|доказан|%|\b\d+(?:[.,]\d+)?\b|doctor|treatment|law|study/giu) ?? [])
      .length;
  const a = sensitive(context.textA);
  const b = sensitive(context.textB);
  return {
    tool: "fact_distortion_check",
    summary: {
      textAFactSensitiveSignals: a,
      textBFactSensitiveSignals: b,
      moreFactSensitive: winnerRu(compareBy(a, b)),
    },
    issues:
      a + b > 0
        ? [
            {
              severity: "warning",
              code: "fact_sensitive_claims",
              message:
                "Есть фактически чувствительные утверждения, числа или медицинско-правовые формулировки. Их нельзя подтверждать только сравнением текстов.",
            },
          ]
        : [],
    recommendations: [
      "Перепроверьте числа, источники и категоричные утверждения; смягчите то, что нельзя подтвердить уверенно.",
    ],
  };
}

function analyzeCompareHallucination(context: CompareContext): CompareToolResult {
  const vagueSources = (text: string) =>
    (text.match(/эксперты считают|исследования показывают|по данным|studies show|experts say|according to/giu) ?? [])
      .length;
  const a = vagueSources(context.textA);
  const b = vagueSources(context.textB);
  return {
    tool: "ai_hallucination_check",
    summary: {
      textAVagueSourceSignals: a,
      textBVagueSourceSignals: b,
      sourceRiskHigherIn: winnerRu(compareBy(a, b)),
    },
    issues: [],
    recommendations: [
      "Расплывчатые ссылки на исследования и экспертов лучше заменить конкретными источниками или убрать.",
    ],
  };
}

function analyzeCompareIntentSeo(context: CompareContext): CompareToolResult {
  const intent = analyzeIntentGap(context).summary;
  const title = analyzeTitleCtr(context).summary;
  return {
    tool: "intent_seo_forecast",
    summary: {
      goal: context.goal,
      intent,
      title,
      internetDemandAvailable: false,
    },
    issues: [],
    recommendations: [
      "Это локальный прогноз интента без SERP. Для SEO используйте его как черновой ориентир, а не как доказательство спроса или ранжирования.",
    ],
  };
}

function analyzeCompareSafetyScience(context: CompareContext): CompareToolResult {
  const fact = analyzeCompareFactDistortion(context).summary;
  return {
    tool: "safety_science_review",
    summary: fact,
    issues: [
      {
        severity: "info",
        code: "text_only_safety_boundary",
        message:
          "Сравнение текстов не заменяет медицинскую, юридическую, финансовую или научную экспертизу.",
      },
    ],
    recommendations: [
      "Для рискованных тем добавьте предупреждения, источники и формулировки с границами применимости.",
    ],
  };
}

const ANALYZERS: Record<CompareToolId, (context: CompareContext) => CompareToolResult> = {
  detect_text_platform: analyzeCompareTextPlatform,
  analyze_text_structure: analyzeCompareTextStructure,
  analyze_text_style: analyzeCompareTextStyle,
  analyze_tone_fit: analyzeCompareTone,
  language_audience_fit: analyzeCompareLanguageAudience,
  media_placeholder_review: analyzeCompareMedia,
  article_uniqueness: analyzeCompareUniqueness,
  language_syntax: analyzeCompareSyntax,
  ai_writing_probability: analyzeCompareAiProbability,
  naturalness_indicators: analyzeCompareNaturalness,
  fact_distortion_check: analyzeCompareFactDistortion,
  logic_consistency_check: analyzeCompareLogic,
  ai_hallucination_check: analyzeCompareHallucination,
  intent_seo_forecast: analyzeCompareIntentSeo,
  safety_science_review: analyzeCompareSafetyScience,
  compare_intent_gap: analyzeIntentGap,
  compare_article_structure: analyzeStructure,
  compare_content_gap: analyzeContentGap,
  compare_semantic_gap: analyzeSemanticGap,
  compare_specificity_gap: analyzeSpecificity,
  compare_trust_gap: analyzeTrust,
  compare_article_style: analyzeStyle,
  similarity_risk: analyzeSimilarity,
  compare_title_ctr: analyzeTitleCtr,
  compare_platform_fit: analyzePlatformFit,
  compare_strengths_weaknesses: analyzeStrengthsWeaknesses,
  compare_improvement_plan: analyzeImprovementPlan,
};

function isCompareToolId(toolId: string): toolId is CompareToolId {
  return Object.prototype.hasOwnProperty.call(ANALYZERS, toolId);
}

async function selectedInternalCompareTools(): Promise<CompareToolId[]> {
  const state = await readState();
  const selected = (state?.selectedTools ?? []).filter(isCompareToolId);
  return selected.length > 0 ? selected : ARTICLE_COMPARE_INTERNAL_TOOLS;
}

export async function runCompareTool(toolId: CompareToolId): Promise<McpHandlerResult> {
  const startedAt = new Date().toISOString();
  await mutateBuffer(toolId, () => ({
    status: "running",
    startedAt,
    completedAt: null,
  }));

  try {
    const result = ANALYZERS[toolId](await getCompareContext());
    const completedAt = new Date().toISOString();
    const counts = issueCounts(result.issues);
    const next = await mutateBuffer(toolId, () => ({
      status: "complete",
      startedAt,
      completedAt,
      verdict: verdict(result.issues),
      data: result,
      summary: counts,
    }));
    await writeWorkspaceResult(next, toolId, result);
    return {
      content: [
        {
          type: "text",
          text: [
            `Tool ${toolId} completed. Structured result:`,
            JSON.stringify(result, null, 2),
            next ? "The same result was written to the ToraSEO app." : "",
          ]
            .filter(Boolean)
            .join("\n"),
        },
      ],
    };
  } catch (error) {
    const completedAt = new Date().toISOString();
    const message = error instanceof Error ? error.message : String(error);
    const next = await mutateBuffer(toolId, () => ({
      status: "error",
      startedAt,
      completedAt,
      errorCode: "article_compare_context_error",
      errorMessage: message,
    }));
    await writeWorkspaceResult(next, toolId, {
      errorCode: "article_compare_context_error",
      errorMessage: message,
    });
    return {
      isError: true,
      content: [{ type: "text", text: `[article_compare_context_error] ${message}` }],
    };
  }
}

export async function articleCompareInternalHandler(): Promise<McpHandlerResult> {
  const aggregateToolId = "article_compare_internal";
  const startedAt = new Date().toISOString();
  await mutateBuffer(aggregateToolId, () => ({
    status: "running",
    startedAt,
    completedAt: null,
  }));

  try {
    const context = await getCompareContext();
    const selectedTools = await selectedInternalCompareTools();
    const completedResults: CompareToolResult[] = [];

    for (const toolId of selectedTools) {
      const toolStartedAt = new Date().toISOString();
      await mutateBuffer(toolId, () => ({
        status: "running",
        startedAt: toolStartedAt,
        completedAt: null,
      }));
      const result = ANALYZERS[toolId](context);
      const completedAt = new Date().toISOString();
      const counts = issueCounts(result.issues);
      const next = await mutateBuffer(toolId, () => ({
        status: "complete",
        startedAt: toolStartedAt,
        completedAt,
        verdict: verdict(result.issues),
        data: result,
        summary: counts,
      }));
      await writeWorkspaceResult(next, toolId, result);
      completedResults.push(result);
    }

    const completedAt = new Date().toISOString();
    const summaryResult = buildInternalCompareSummary(context);
    const next = await mutateBuffer(aggregateToolId, () => ({
      status: "complete",
      startedAt,
      completedAt,
      verdict: "ok",
      data: {
        tool: aggregateToolId,
        summary: summaryResult,
        completedTools: selectedTools,
      },
      summary: {
        critical: 0,
        warning: 0,
        info: completedResults.length,
      },
    }));
    await writeWorkspaceResult(next, aggregateToolId, {
      tool: aggregateToolId,
      summary: summaryResult,
      completedTools: selectedTools,
    });

    return {
      content: [
        {
          type: "text",
          text: renderInternalCompareChatReport(summaryResult, completedResults.length),
        },
      ],
    };
  } catch (error) {
    const completedAt = new Date().toISOString();
    const message = error instanceof Error ? error.message : String(error);
    const next = await mutateBuffer(aggregateToolId, () => ({
      status: "error",
      startedAt,
      completedAt,
      errorCode: "article_compare_context_error",
      errorMessage: message,
    }));
    await writeWorkspaceResult(next, aggregateToolId, {
      errorCode: "article_compare_context_error",
      errorMessage: message,
    });
    return {
      isError: true,
      content: [{ type: "text", text: `[article_compare_context_error] ${message}` }],
    };
  }
}

function buildInternalCompareSummary(context: CompareContext): {
  goal: string;
  goalMode: CompareGoalMode;
  termOverlap: number;
  headingsA: number;
  headingsB: number;
  paragraphsA: number;
  paragraphsB: number;
  avgSentenceA: number | null;
  avgSentenceB: number | null;
  specificityA: number;
  specificityB: number;
  trustA: number;
  trustB: number;
  mediaA: number;
  mediaB: number;
  syntaxRiskA: number;
  syntaxRiskB: number;
  logicSignalsA: number;
  logicSignalsB: number;
  aiSignalsA: number;
  aiSignalsB: number;
  exactOverlap: number;
  copyRisk: "низкий" | "средний" | "высокий";
  termsA: string[];
  termsB: string[];
  missingInA: string[];
  missingInB: string[];
  structureWinner: "textA" | "textB" | "tie";
  readabilityWinner: "textA" | "textB" | "tie";
  specificityWinner: "textA" | "textB" | "tie";
  trustWinner: "textA" | "textB" | "tie";
  mediaWinner: "textA" | "textB" | "tie";
  syntaxWinner: "textA" | "textB" | "tie";
  logicSupportWinner: "textA" | "textB" | "tie";
  aiStyleWinner: "textA" | "textB" | "tie";
} {
  const a = stats(context.textA);
  const b = stats(context.textB);
  const exactOverlap = shingleOverlap(context.textA, context.textB);
  const termsA = topTerms(a.words);
  const termsB = topTerms(b.words);
  const termsSetA = new Set(termsA);
  const termsSetB = new Set(termsB);
  const mediaMarkers = (text: string) =>
    (text.match(/место для изображения|image placeholder|место для видео|video placeholder|место для аудио|audio placeholder/giu) ?? [])
      .length;
  const syntaxRisk = (text: string) =>
    (text.match(/[,;:]{2,}|[.!?]{3,}|\s{2,}/g) ?? []).length;
  const logicSignals = (text: string) =>
    (text.match(/поэтому|следовательно|значит|всегда|никогда|because|therefore|always|never/giu) ?? [])
      .length;
  const aiSignals = (text: string) =>
    (text.match(/важно отметить|следует отметить|в современном мире|таким образом|в заключение|comprehensive|it is important/giu) ?? [])
      .length;
  const mediaA = mediaMarkers(context.textA);
  const mediaB = mediaMarkers(context.textB);
  const syntaxRiskA = syntaxRisk(context.textA);
  const syntaxRiskB = syntaxRisk(context.textB);
  const logicSignalsA = logicSignals(context.textA);
  const logicSignalsB = logicSignals(context.textB);
  const aiSignalsA = aiSignals(context.textA);
  const aiSignalsB = aiSignals(context.textB);
  return {
    goal: context.goal,
    goalMode: context.goalMode,
    termOverlap: sharedRatio(termsA, termsB),
    headingsA: a.headings.length,
    headingsB: b.headings.length,
    paragraphsA: a.paragraphCount,
    paragraphsB: b.paragraphCount,
    avgSentenceA: a.avgSentenceWords,
    avgSentenceB: b.avgSentenceWords,
    specificityA: a.numberCount + a.listCount + a.questionCount,
    specificityB: b.numberCount + b.listCount + b.questionCount,
    trustA: a.trustSignalCount,
    trustB: b.trustSignalCount,
    mediaA,
    mediaB,
    syntaxRiskA,
    syntaxRiskB,
    logicSignalsA,
    logicSignalsB,
    aiSignalsA,
    aiSignalsB,
    exactOverlap,
    copyRisk:
      exactOverlap >= 35 ? "высокий" : exactOverlap >= 15 ? "средний" : "низкий",
    termsA,
    termsB,
    missingInA: termsB.filter((term) => !termsSetA.has(term)).slice(0, 6),
    missingInB: termsA.filter((term) => !termsSetB.has(term)).slice(0, 6),
    structureWinner: compareBy(a.headings.length + a.listCount, b.headings.length + b.listCount),
    readabilityWinner: compareBy(a.avgSentenceWords ?? 0, b.avgSentenceWords ?? 0, true),
    specificityWinner: compareBy(
      a.numberCount + a.listCount + a.questionCount,
      b.numberCount + b.listCount + b.questionCount,
    ),
    trustWinner: compareBy(a.trustSignalCount, b.trustSignalCount),
    mediaWinner: compareBy(mediaA, mediaB),
    syntaxWinner: compareBy(syntaxRiskA, syntaxRiskB, true),
    logicSupportWinner: compareBy(logicSignalsA, logicSignalsB),
    aiStyleWinner: compareBy(aiSignalsA, aiSignalsB, true),
  };
}

function renderInternalCompareChatReport(
  summary: ReturnType<typeof buildInternalCompareSummary>,
  completedCount: number,
): string {
  return [
    `Сравнение двух текстов готово: ToraSEO выполнил ${completedCount} проверок и обновил отчет в приложении.`,
    "",
    "**Итог сравнения**",
    `- Режим по цели анализа: ${compareGoalModeLabel(summary.goalMode)}.`,
    `- ${compareGoalModeAdvice(summary.goalMode)}`,
    `- ${compareOverallVerdict(summary)}`,
    `- Интент и тема: пересечение ключевых понятий — ${summary.termOverlap}%. ${intentAdvice(summary.termOverlap)}`,
    `- Риск копирования: ${summary.copyRisk}. Дословное совпадение — ${summary.exactOverlap}%. Это локальная проверка совпавших фраз, а не внешняя база плагиата.`,
    "",
    "**Сравнение по категориям**",
    `- Структура: ${winnerRu(summary.structureWinner)}. Заголовки: A — ${summary.headingsA}, B — ${summary.headingsB}; абзацы: A — ${summary.paragraphsA}, B — ${summary.paragraphsB}.`,
    `- Читаемость: ${winnerRu(summary.readabilityWinner)}. Средняя длина предложения: A — ${summary.avgSentenceA ?? "—"} слов, B — ${summary.avgSentenceB ?? "—"} слов.`,
    `- Конкретика: ${winnerRu(summary.specificityWinner)}. Числа, списки и вопросы: A — ${summary.specificityA}, B — ${summary.specificityB}.`,
    `- Доверие и осторожность: ${winnerRu(summary.trustWinner)}. Источники, предупреждения и экспертные маркеры: A — ${summary.trustA}, B — ${summary.trustB}.`,
    `- Медиа-планирование: ${winnerRu(summary.mediaWinner)}. Медиа-маркеры: A — ${summary.mediaA}, B — ${summary.mediaB}.`,
    `- Синтаксис и пунктуация: чище ${winnerRu(summary.syntaxWinner)}. Места для ручной вычитки: A — ${summary.syntaxRiskA}, B — ${summary.syntaxRiskB}.`,
    `- Логическая связность: больше ручной проверки требует ${winnerRu(summary.logicSupportWinner)}. Причинно-следственные связки: A — ${summary.logicSignalsA}, B — ${summary.logicSignalsB}.`,
    `- Авторская естественность: сильнее ${winnerRu(summary.aiStyleWinner)}. Универсальные служебные обороты: A — ${summary.aiSignalsA}, B — ${summary.aiSignalsB}.`,
    "",
    ...compareGoalFocusedStrengthBlocks(summary),
    "",
    "**Разрывы по содержанию**",
    `- Что есть в B и стоит проверить для A: ${formatTerms(summary.missingInA)}.`,
    `- Что есть в A и стоит проверить для B: ${formatTerms(summary.missingInB)}.`,
    "",
    "**Приоритетный план действий**",
    compareGoalModeFirstAction(summary.goalMode),
    "- Закрывайте разрывы по содержанию собственными разделами, примерами и выводами, а не копированием структуры второго текста.",
    "- Усильте конкретику: добавьте шаги, сценарии, числа и пояснения только там, где они точны и полезны.",
    "- Проверьте доверие: источники, осторожные формулировки, ограничения советов и экспертную проверку для чувствительных тем.",
    "- После правок запустите сравнение снова и проверьте, сократились ли разрывы.",
  ].join("\n");
}

function compareOverallVerdict(summary: ReturnType<typeof buildInternalCompareSummary>): string {
  const winners = [
    summary.structureWinner,
    summary.readabilityWinner,
    summary.specificityWinner,
    summary.trustWinner,
    summary.mediaWinner,
    summary.syntaxWinner,
    summary.aiStyleWinner,
  ];
  const scoreA = winners.filter((winner) => winner === "textA").length;
  const scoreB = winners.filter((winner) => winner === "textB").length;
  if (Math.abs(scoreA - scoreB) <= 1) {
    return "Тексты близки по сумме локальных признаков; важнее смотреть разрывы по категориям и цель сравнения.";
  }
  return scoreA > scoreB
    ? "Текст A сейчас выглядит сильнее по сумме локальных текстовых признаков."
    : "Текст B сейчас выглядит сильнее по сумме локальных текстовых признаков.";
}

function compareGoalModeAdvice(mode: CompareGoalMode): string {
  const advice: Record<CompareGoalMode, string> = {
    standard_comparison:
      "Цель не указана, поэтому ToraSEO показывает стандартный отчет по двум текстам: категории, разрывы, похожесть и план улучшения.",
    focus_text_a:
      "Фокус отчета — текст A: текст B используется как сравнительный контекст, а не как равноправный объект аудита.",
    focus_text_b:
      "Фокус отчета — текст B: текст A используется как сравнительный контекст, а не как равноправный объект аудита.",
    beat_competitor:
      "Фокус отчета — текстовые преимущества конкурента и план усиления без копирования чужих формулировок.",
    style_match:
      "Фокус отчета — стиль, тон, ритм, плотность примеров и приемы подачи, которые можно перенять без копирования фраз.",
    similarity_check:
      "Фокус отчета — дословные совпадения, смысловая близость и риск копирования.",
    version_compare:
      "Фокус отчета — что стало лучше или хуже между двумя версиями текста.",
    ab_post:
      "Фокус отчета — хук, ясность, краткость, CTA, платформенность и потенциал реакции.",
  };
  return advice[mode];
}

function compareGoalModeFirstAction(mode: CompareGoalMode): string {
  const actions: Record<CompareGoalMode, string> = {
    standard_comparison:
      "- Сначала подтвердите общий интент и цель сравнения. Если запросы разные, не делайте вывод “один текст лучше другого” как SEO-факт.",
    focus_text_a:
      "- Сначала разберите сильные и слабые стороны текста A; текст B используйте только как ориентир для недостающих решений.",
    focus_text_b:
      "- Сначала разберите сильные и слабые стороны текста B; текст A используйте только как ориентир для недостающих решений.",
    beat_competitor:
      "- Сначала определите, какие текстовые преимущества конкурента действительно относятся к вашему интенту, а затем закрывайте разрывы своими разделами и примерами.",
    style_match:
      "- Сначала перенимайте не фразы, а приемы стиля: длину предложений, ритм, уровень ясности, тип примеров и порядок абзацев.",
    similarity_check:
      "- Сначала уберите дословные совпадения и слишком близкие смысловые блоки: добавьте собственные примеры, выводы и формулировки.",
    version_compare:
      "- Сначала зафиксируйте, что во второй версии стало лучше и что ухудшилось, затем правьте только подтвержденные разрывы.",
    ab_post:
      "- Сначала выберите вариант с более сильным хуком и ясной пользой для площадки, затем доработайте CTA и компактность.",
  };
  return actions[mode];
}

function compareGoalFocusedStrengthBlocks(
  summary: ReturnType<typeof buildInternalCompareSummary>,
): string[] {
  if (summary.goalMode === "focus_text_a") {
    return [
      "**Сильные и слабые стороны текста A**",
      formatChatList(compareStrengthsForChat(summary, "textA")),
      "",
    ];
  }
  if (summary.goalMode === "focus_text_b") {
    return [
      "**Сильные и слабые стороны текста B**",
      formatChatList(compareStrengthsForChat(summary, "textB")),
      "",
    ];
  }
  return [
    "**Сильные стороны текста A**",
    formatChatList(compareStrengthsForChat(summary, "textA")),
    "",
    "**Сильные стороны текста B**",
    formatChatList(compareStrengthsForChat(summary, "textB")),
    "",
  ];
}

function intentAdvice(overlap: number): string {
  if (overlap < 35) {
    return "Темы заметно расходятся, поэтому сначала подтвердите, что тексты отвечают на один и тот же запрос.";
  }
  if (overlap < 60) {
    return "Темы частично пересекаются, но интент всё равно стоит проверить вручную.";
  }
  return "Темы достаточно близки для стандартного A/B-сравнения текстовой части.";
}

function compareStrengthsForChat(
  summary: ReturnType<typeof buildInternalCompareSummary>,
  side: "textA" | "textB",
): string[] {
  const items: string[] = [];
  const label = side === "textA" ? "A" : "B";
  if (summary.structureWinner === side) items.push(`у текста ${label} сильнее видимый каркас и опорные блоки`);
  if (summary.readabilityWinner === side) items.push(`текст ${label} легче сканировать по средней длине предложения`);
  if (summary.specificityWinner === side) items.push(`в тексте ${label} больше конкретики: чисел, списков или вопросов`);
  if (summary.trustWinner === side) items.push(`в тексте ${label} больше маркеров доверия и осторожности`);
  if (summary.mediaWinner === side) items.push(`текст ${label} лучше подготовлен к медиа-сопровождению`);
  if (summary.syntaxWinner === side) items.push(`текст ${label} чище по локальным пунктуационным и синтаксическим признакам`);
  if (summary.aiStyleWinner === side) items.push(`текст ${label} выглядит естественнее по локальным признакам`);
  if (summary.logicSupportWinner === side) {
    items.push(`в тексте ${label} больше причинно-следственных связок, которые стоит вручную проверить на доказательность`);
  }
  return items.length > 0 ? items : [`у текста ${label} нет явного преимущества по текущим локальным признакам`];
}

function formatChatList(items: string[]): string {
  return items.map((item) => `- ${item}.`).join("\n");
}

function formatTerms(terms: string[]): string {
  return terms.length > 0 ? terms.join(", ") : "явных локальных разрывов не найдено";
}

export const compareIntentGapHandler = async (): Promise<McpHandlerResult> =>
  runCompareTool("compare_intent_gap");
export const compareArticleStructureHandler = async (): Promise<McpHandlerResult> =>
  runCompareTool("compare_article_structure");
export const compareContentGapHandler = async (): Promise<McpHandlerResult> =>
  runCompareTool("compare_content_gap");
export const compareSemanticGapHandler = async (): Promise<McpHandlerResult> =>
  runCompareTool("compare_semantic_gap");
export const compareSpecificityGapHandler = async (): Promise<McpHandlerResult> =>
  runCompareTool("compare_specificity_gap");
export const compareTrustGapHandler = async (): Promise<McpHandlerResult> =>
  runCompareTool("compare_trust_gap");
export const compareArticleStyleHandler = async (): Promise<McpHandlerResult> =>
  runCompareTool("compare_article_style");
export const similarityRiskHandler = async (): Promise<McpHandlerResult> =>
  runCompareTool("similarity_risk");
export const compareTitleCtrHandler = async (): Promise<McpHandlerResult> =>
  runCompareTool("compare_title_ctr");
export const comparePlatformFitHandler = async (): Promise<McpHandlerResult> =>
  runCompareTool("compare_platform_fit");
export const compareStrengthsWeaknessesHandler = async (): Promise<McpHandlerResult> =>
  runCompareTool("compare_strengths_weaknesses");
export const compareImprovementPlanHandler = async (): Promise<McpHandlerResult> =>
  runCompareTool("compare_improvement_plan");
