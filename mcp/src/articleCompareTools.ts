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
    standard_comparison: "standard comparison",
    focus_text_a: "focus on Text A",
    focus_text_b: "focus on Text B",
    beat_competitor: "competitor comparison",
    style_match: "style matching",
    similarity_check: "similarity check",
    version_compare: "version comparison",
    ab_post: "A/B post analysis",
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
    goal: state?.input?.goal?.trim() || "standard comparison report",
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
  if (winner === "textA") return "Text A";
  if (winner === "textB") return "Text B";
  if (winner === "tie") return "about equal";
  return "manual review needed";
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
        "Text A and Text B emphasize different key concepts, so the intent may overlap only partially.",
    });
  }
  return {
    tool: "compare_intent_gap",
    summary: {
      goal: context.goal,
      topTermsA: base.termsA,
      topTermsB: base.termsB,
      intentTermOverlap: overlap,
      likelyWinner: overlap >= 55 ? "about equal" : "manual review needed",
    },
    issues,
    recommendations: [
      "Before deciding which text is stronger, check whether both texts answer the same request.",
      "If one text is used as a competitive reference, keep the intent focus, not the wording.",
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
                  ? "Text A has a stronger visible structure: more support blocks for the reader."
                  : "Text B has a stronger visible structure: more support blocks for the reader.",
            },
          ]
        : [],
    recommendations: [
      "Compare not only the number of headings, but the reader path: problem, explanation, steps, examples, FAQ, and conclusion.",
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
                "The texts differ noticeably in topical coverage; before editing, check the missing sections.",
            },
          ]
        : [],
    recommendations: [
      "Use missing topics as prompts for your own sections, examples, or FAQ, not as material to copy from the other text.",
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
      "Strengthen semantic coverage through missing concepts, but add your own explanations and examples.",
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
                  ? "Text A provides more specificity signals: numbers, questions, lists, or practical details."
                  : "Text B provides more specificity signals: numbers, questions, lists, or practical details.",
            },
          ]
        : [],
    recommendations: [
      "Add concrete steps, scenarios, examples, and numbers only where they are accurate and useful.",
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
      "Medical, legal, financial, technical, and scientific claims need sources, careful wording, and human review.",
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
      "If you need to move closer to the style, transfer clarity level, rhythm, and example density, not phrases or paragraph order.",
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
      note: "Local exact phrase overlap check; this is not an external plagiarism check.",
    },
    issues:
      copyRisk === "high"
        ? [
            {
              severity: "critical",
              code: "high_exact_overlap",
              message:
                "There are many exact overlaps. Before publication, independently rework wording, examples, and block order.",
            },
          ]
        : copyRisk === "medium"
          ? [
              {
                severity: "warning",
                code: "medium_exact_overlap",
                message:
                  "There are noticeable exact overlaps. Keep ideas only as reference and rewrite independently.",
              },
            ]
          : [],
    recommendations: [
      "Use similar logic only as a reference; add your own examples, conclusions, and wording.",
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
      "A title works better when it directly states the intent and benefit without clickbait.",
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
      "Evaluate fit for the selected platform: site articles need structure and completeness, while social posts need a hook and concise value.",
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
          ? "shorter average sentence length"
          : "",
        a.headings.length > b.headings.length ? "more visible structure blocks" : "",
        a.numberCount > b.numberCount ? "more numerical specificity" : "",
      ].filter(Boolean),
      textBStrengths: [
        b.avgSentenceWords !== null && b.avgSentenceWords < (a.avgSentenceWords ?? 999)
          ? "shorter average sentence length"
          : "",
        b.headings.length > a.headings.length ? "more visible structure blocks" : "",
        b.numberCount > a.numberCount ? "more numerical specificity" : "",
      ].filter(Boolean),
    },
    issues: [],
    recommendations: [
      "Use strengths as editing priorities, not as a reason to copy the other text.",
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
        "Check the shared intent of both texts.",
        "Close the most important content gaps with your own sections.",
        "Add concrete examples, steps, or scenarios where they are useful.",
        "Keep independent wording and examples to reduce copy risk.",
      ],
      contentGap: gap,
      specificity,
    },
    issues: [],
    recommendations: [
      "Strengthen the weaker text with added value, not by mirroring the stronger text.",
      "After editing, run the comparison again and check whether the gaps became smaller.",
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
      textAFormat: a.wordCount > 900 ? "long article" : "short text / post",
      textBFormat: b.wordCount > 900 ? "long article" : "short text / post",
      platformFitWinner: winnerRu(
        compareBy(Math.min(a.wordCount, 1800), Math.min(b.wordCount, 1800)),
      ),
    },
    issues: [
      {
        severity: "info",
        code: "platform_compared",
        message:
          "Both texts were checked as materials for the selected platform. This is a local format estimate, not SERP data.",
      },
    ],
    recommendations: [
      "Compare volume and structure against the platform: site articles need completeness and sections, while social posts need a hook, clarity, and compactness.",
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
      "Tone should match topic risk: in medicine, finance, law, and technical topics, precision, caution, and clear limits work better.",
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
          : "manual review needed",
    },
    issues: [],
    recommendations: [
      "Check who each text is addressed to. If the audiences differ, compare not only quality, but also fit with reader expectations.",
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
                "The texts do not contain clear media markers. For a long article, check where images, diagrams, or video are needed.",
            },
          ]
        : [],
    recommendations: [
      "For a site article, media markers should sit inside relevant sections, not be pushed to the end of the text.",
    ],
  };
}

function analyzeCompareUniqueness(context: CompareContext): CompareToolResult {
  const overlap = shingleOverlap(context.textA, context.textB);
  const copyRisk =
    overlap >= 35 ? "high" : overlap >= 15 ? "medium" : "low";
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
                "There is a local similarity risk. This is not an external plagiarism check, but the wording should be separated more clearly.",
            },
          ]
        : [],
    recommendations: [
      "0% in this metric means no matching 4-word fragments in the local check, not a guarantee of absolute uniqueness.",
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
                "Local syntax or punctuation signals were found and should be manually reviewed.",
            },
          ]
        : [],
    recommendations: [
      "Do a final manual pass for punctuation, sentence boundaries, and overloaded phrases in both texts.",
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
      "To make the text sound more authorial, add concrete experience, examples, context, and fewer generic service phrases.",
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
      "If the text feels mechanical, vary sentence openings, add natural transitions, and remove repetitions that do not add meaning.",
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
                "The texts contain cause-and-effect transitions. They should be checked for sufficient support, not treated as automatic errors.",
            },
          ]
        : [],
    recommendations: [
      "Check places with 'therefore', 'consequently', 'always', and 'never': they need nearby justification.",
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
                "There are fact-sensitive claims, numbers, or medical/legal statements. They cannot be confirmed by text comparison alone.",
            },
          ]
        : [],
    recommendations: [
      "Recheck numbers, sources, and categorical claims; soften anything that cannot be confirmed confidently.",
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
      "Vague references to research and experts should be replaced with specific sources or removed.",
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
      "This is a local intent forecast without SERP data. For SEO, use it as a draft direction, not as proof of demand or ranking potential.",
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
          "Text comparison does not replace medical, legal, financial, or scientific expertise.",
      },
    ],
    recommendations: [
      "For sensitive topics, add warnings, sources, and wording with clear limits of applicability.",
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
  copyRisk: "low" | "medium" | "high";
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
      exactOverlap >= 35 ? "high" : exactOverlap >= 15 ? "medium" : "low",
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
    `Two-text comparison is ready: ToraSEO completed ${completedCount} checks and updated the report in the app.`,
    "",
    "**Comparison result**",
    `- Analysis goal mode: ${compareGoalModeLabel(summary.goalMode)}.`,
    `- ${compareGoalModeAdvice(summary.goalMode)}`,
    `- ${compareOverallVerdict(summary)}`,
    `- Intent and topic: key concept overlap is ${summary.termOverlap}%. ${intentAdvice(summary.termOverlap)}`,
    `- Copying risk: ${summary.copyRisk}. Exact overlap is ${summary.exactOverlap}%. This is a local matching-phrase check, not an external plagiarism database.`,
    "",
    "**Category comparison**",
    `- Structure: ${winnerRu(summary.structureWinner)}. Headings: A - ${summary.headingsA}, B - ${summary.headingsB}; paragraphs: A - ${summary.paragraphsA}, B - ${summary.paragraphsB}.`,
    `- Readability: ${winnerRu(summary.readabilityWinner)}. Average sentence length: A - ${summary.avgSentenceA ?? "-"} words, B - ${summary.avgSentenceB ?? "-"} words.`,
    `- Specificity: ${winnerRu(summary.specificityWinner)}. Numbers, lists, and questions: A - ${summary.specificityA}, B - ${summary.specificityB}.`,
    `- Trust and caution: ${winnerRu(summary.trustWinner)}. Sources, warnings, and expert markers: A - ${summary.trustA}, B - ${summary.trustB}.`,
    `- Media planning: ${winnerRu(summary.mediaWinner)}. Media markers: A - ${summary.mediaA}, B - ${summary.mediaB}.`,
    `- Syntax and punctuation: cleaner ${winnerRu(summary.syntaxWinner)}. Manual review spots: A - ${summary.syntaxRiskA}, B - ${summary.syntaxRiskB}.`,
    `- Logic: more manual review is needed in ${winnerRu(summary.logicSupportWinner)}. Cause-and-effect connectors: A - ${summary.logicSignalsA}, B - ${summary.logicSignalsB}.`,
    `- Authorial naturalness: stronger ${winnerRu(summary.aiStyleWinner)}. Generic service phrases: A - ${summary.aiSignalsA}, B - ${summary.aiSignalsB}.`,
    "",
    ...compareGoalFocusedStrengthBlocks(summary),
    "",
    "**Content gaps**",
    `- What exists in B and should be checked for A: ${formatTerms(summary.missingInA)}.`,
    `- What exists in A and should be checked for B: ${formatTerms(summary.missingInB)}.`,
    "",
    "**Priority action plan**",
    compareGoalModeFirstAction(summary.goalMode),
    "- Close content gaps with your own sections, examples, and conclusions, not by copying the second text's structure.",
    "- Strengthen specificity: add steps, scenarios, numbers, and explanations only where they are accurate and useful.",
    "- Check trust: sources, careful wording, advice limits, and expert review for sensitive topics.",
    "- After edits, run the comparison again and check whether the gaps became smaller.",
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
    return "The texts are close by local signals; category gaps and the comparison goal matter more.";
  }
  return scoreA > scoreB
    ? "Text A currently looks stronger by the sum of local text signals."
    : "Text B currently looks stronger by the sum of local text signals.";
}

function compareGoalModeAdvice(mode: CompareGoalMode): string {
  const advice: Record<CompareGoalMode, string> = {
    standard_comparison:
      "No goal is set, so ToraSEO shows a standard two-text report: categories, gaps, similarity, and an improvement plan.",
    focus_text_a:
      "The report focuses on Text A: Text B is used as comparison context, not as an equal audit target.",
    focus_text_b:
      "The report focuses on Text B: Text A is used as comparison context, not as an equal audit target.",
    beat_competitor:
      "The report focuses on competitor text advantages and a strengthening plan without copying someone else's wording.",
    style_match:
      "The report focuses on style, tone, rhythm, example density, and presentation techniques that can be adapted without copying phrases.",
    similarity_check:
      "The report focuses on exact overlaps, semantic closeness, and copying risk.",
    version_compare:
      "The report focuses on what became better or worse between the two text versions.",
    ab_post:
      "The report focuses on hook, clarity, brevity, CTA, platform fit, and reaction potential.",
  };
  return advice[mode];
}

function compareGoalModeFirstAction(mode: CompareGoalMode): string {
  const actions: Record<CompareGoalMode, string> = {
    standard_comparison:
      "- First confirm the shared intent and comparison goal. If the requests differ, do not treat 'one text is better' as an SEO fact.",
    focus_text_a:
      "- First review Text A's strengths and weaknesses; use Text B only as a reference for missing solutions.",
    focus_text_b:
      "- First review Text B's strengths and weaknesses; use Text A only as a reference for missing solutions.",
    beat_competitor:
      "- First identify which competitor advantages truly match your intent, then close the gaps with your own sections and examples.",
    style_match:
      "- First adapt style techniques, not phrases: sentence length, rhythm, clarity level, example type, and paragraph flow.",
    similarity_check:
      "- First remove exact overlaps and overly close semantic blocks: add your own examples, conclusions, and wording.",
    version_compare:
      "- First record what improved and what worsened in the second version, then fix only confirmed gaps.",
    ab_post:
      "- First choose the version with the stronger hook and clearer platform benefit, then polish CTA and compactness.",
  };
  return actions[mode];
}

function compareGoalFocusedStrengthBlocks(
  summary: ReturnType<typeof buildInternalCompareSummary>,
): string[] {
  if (summary.goalMode === "focus_text_a") {
    return [
      "**Text A strengths and weaknesses**",
      formatChatList(compareStrengthsForChat(summary, "textA")),
      "",
    ];
  }
  if (summary.goalMode === "focus_text_b") {
    return [
      "**Text B strengths and weaknesses**",
      formatChatList(compareStrengthsForChat(summary, "textB")),
      "",
    ];
  }
  return [
    "**Text A strengths**",
    formatChatList(compareStrengthsForChat(summary, "textA")),
    "",
    "**Text B strengths**",
    formatChatList(compareStrengthsForChat(summary, "textB")),
    "",
  ];
}

function intentAdvice(overlap: number): string {
  if (overlap < 35) {
    return "The topics differ noticeably, so first confirm that both texts answer the same request.";
  }
  if (overlap < 60) {
    return "The topics partially overlap, but the intent should still be checked manually.";
  }
  return "The topics are close enough for a standard A/B comparison of the text layer.";
}

function compareStrengthsForChat(
  summary: ReturnType<typeof buildInternalCompareSummary>,
  side: "textA" | "textB",
): string[] {
  const items: string[] = [];
  const label = side === "textA" ? "A" : "B";
  if (summary.structureWinner === side) items.push(`Text ${label} has a stronger visible framework and support blocks`);
  if (summary.readabilityWinner === side) items.push(`Text ${label} is easier to scan by average sentence length`);
  if (summary.specificityWinner === side) items.push(`Text ${label} has more specificity: numbers, lists, or questions`);
  if (summary.trustWinner === side) items.push(`Text ${label} has more trust and caution markers`);
  if (summary.mediaWinner === side) items.push(`Text ${label} is better prepared for media support`);
  if (summary.syntaxWinner === side) items.push(`Text ${label} is cleaner by local punctuation and syntax signals`);
  if (summary.aiStyleWinner === side) items.push(`Text ${label} looks more natural by local signals`);
  if (summary.logicSupportWinner === side) {
    items.push(`Text ${label} has more cause-and-effect connectors that should be manually checked for support`);
  }
  return items.length > 0 ? items : [`Text ${label} has no clear advantage by the current local signals`];
}

function formatChatList(items: string[]): string {
  return items.map((item) => `- ${item}.`).join("\n");
}

function formatTerms(terms: string[]): string {
  return terms.length > 0 ? terms.join(", ") : "no clear local gaps found";
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
