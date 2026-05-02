import { mutateBuffer, readState, type ToolBufferEntry } from "./stateFile.js";
import { readActiveInputMarkdown, writeWorkspaceResult } from "./workspace.js";

type TextToolId =
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
  | "ai_hallucination_check";

interface TextContext {
  action: "scan" | "solution";
  topic: string;
  analysisRole: string;
  text: string;
}

interface TextIssue {
  severity: "critical" | "warning" | "info";
  code: string;
  message: string;
}

interface TextToolResult {
  tool: TextToolId;
  summary: Record<string, unknown>;
  issues: TextIssue[];
  recommendations: string[];
}

type McpHandlerResult = {
  isError?: boolean;
  content: Array<{ type: "text"; text: string }>;
};

export const emptyInputSchema = {};

function words(text: string): string[] {
  return text.match(/[\p{L}\p{N}]+(?:[-'][\p{L}\p{N}]+)?/gu) ?? [];
}

function sentences(text: string): string[] {
  return text
    .split(/[.!?…]+|\n{2,}/g)
    .map((item) => item.trim())
    .filter(Boolean);
}

function paragraphs(text: string): string[] {
  return text
    .split(/\n\s*\n/g)
    .map((item) => item.trim())
    .filter(Boolean);
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function repeatedTermCounts(text: string): Record<string, number> {
  return [...text.toLowerCase().matchAll(/\b([\p{L}\p{N}]{5,})\b/gu)]
    .flatMap((match) => (match[1] ? [match[1]] : []))
    .reduce<Record<string, number>>((acc, word) => {
      acc[word] = (acc[word] ?? 0) + 1;
      return acc;
    }, {});
}

function topRepeatedTerms(text: string, minCount = 5): string[] {
  return Object.entries(repeatedTermCounts(text))
    .filter(([, count]) => count >= minCount)
    .sort((a, b) => b[1] - a[1])
    .map(([word]) => word)
    .slice(0, 8);
}

function sentenceLengthStats(text: string): { avg: number; variance: number } {
  const lengths = sentences(text).map((sentence) => words(sentence).length);
  if (lengths.length === 0) return { avg: 0, variance: 0 };
  const avg = lengths.reduce((sum, item) => sum + item, 0) / lengths.length;
  const variance =
    lengths.reduce((sum, item) => sum + (item - avg) ** 2, 0) / lengths.length;
  return { avg: Math.round(avg), variance: Math.round(variance) };
}

function inferPlatform(text: string, wordCount: number): string {
  if (/^#{1,3}\s|\*\*|^- /m.test(text)) return "markdown_article";
  if (wordCount > 700) return "site_article";
  if (wordCount < 120) return "short_social_post";
  return "short_article_or_long_social_post";
}

function inferTextStyle(text: string): string {
  if (/я\s|мой|личн|опыт|I\s|my\s/iu.test(text)) return "personal";
  if (/исследован|данн|таблиц|метод|анализ|study|data|research/iu.test(text)) {
    return "analytical";
  }
  if (/как|почему|что такое|объясн|пример|how to|why|what is/iu.test(text)) {
    return "educational";
  }
  if (/купить|цена|клиент|продаж|conversion|customer|sales/iu.test(text)) {
    return "business";
  }
  return "informational";
}

function inferTone(text: string): string {
  if (/врач|диабет|болезн|беремен|риск|doctor|risk|disease/iu.test(text)) {
    return "cautious_expert";
  }
  if (/!{1,2}|круто|легко|быстро|wow|easy/iu.test(text)) return "energetic";
  if (/я\s|мой|личн|I\s|my\s/iu.test(text)) return "personal";
  return "neutral_explaining";
}

function headings(text: string): string[] {
  return text
    .split(/\n/g)
    .map((item) => item.trim())
    .filter((line) => line.length > 0 && line.length <= 90 && !/[.!?]$/.test(line));
}

function issueCounts(issues: TextIssue[]): ToolBufferEntry["summary"] {
  return {
    critical: issues.filter((issue) => issue.severity === "critical").length,
    warning: issues.filter((issue) => issue.severity === "warning").length,
    info: issues.filter((issue) => issue.severity === "info").length,
  };
}

function verdict(issues: TextIssue[]): "ok" | "warning" | "critical" {
  if (issues.some((issue) => issue.severity === "critical")) return "critical";
  if (issues.some((issue) => issue.severity === "warning")) return "warning";
  return "ok";
}

async function getContext(): Promise<TextContext> {
  const state = await readState();
  const workspaceText = await readActiveInputMarkdown(state);
  const text = (workspaceText ?? state?.input?.text ?? "").trim();
  if (state && state.analysisType !== "article_text") {
    throw new Error("The active ToraSEO context is not article_text.");
  }
  if (!text) {
    throw new Error("No active ToraSEO article_text context is available.");
  }
  return {
    action: state?.input?.action === "solution" ? "solution" : "scan",
    topic: state?.input?.topic?.trim() ?? "",
    analysisRole: state?.input?.analysisRole?.trim() || "default",
    text,
  };
}

async function runTextTool(
  toolId: TextToolId,
  analyzer: (context: TextContext) => TextToolResult,
): Promise<McpHandlerResult> {
  const startedAt = new Date().toISOString();
  await mutateBuffer(toolId, () => ({
    status: "running",
    startedAt,
    completedAt: null,
  }));

  try {
    const result = analyzer(await getContext());
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
      errorCode: "text_context_error",
      errorMessage: message,
    }));
    await writeWorkspaceResult(next, toolId, {
      errorCode: "text_context_error",
      errorMessage: message,
    });
    return {
      isError: true,
      content: [{ type: "text", text: `[text_context_error] ${message}` }],
    };
  }
}

export const detectTextPlatformHandler = () =>
  runTextTool("detect_text_platform", (context) => {
    const text = context.text;
    const hasMarkdown = /^#{1,3}\s|\*\*|^- /m.test(text);
    const wordCount = words(text).length;
    const inferredPlatform = inferPlatform(text, wordCount);
    const issue: TextIssue = {
      severity: "info",
      code: "platform_inferred",
      message:
        inferredPlatform === "site_article"
          ? "The text behaves like a long-form site article."
          : "The text behaves like a short article or platform post draft.",
    };
    return {
      tool: "detect_text_platform",
      summary: {
        topic: context.topic,
        analysisRole: context.analysisRole,
        wordCount,
        hasMarkdown,
        inferredPlatform,
      },
      issues: [issue],
      recommendations: [
        "Keep platform-specific metadata separate from the body: title, description, tags, and social preview text.",
      ],
    };
  });

export const analyzeTextStructureHandler = () =>
  runTextTool("analyze_text_structure", (context) => {
    const text = context.text;
    const wordCount = words(text).length;
    const paragraphCount = paragraphs(text).length;
    const headingCount = headings(text).length;
    const issues: TextIssue[] = [];
    if (wordCount < 300) {
      issues.push({
        severity: "warning",
        code: "thin_text",
        message: "The article is short for a search-oriented text; expand the useful answer before optimizing.",
      });
    }
    if (paragraphCount < 3) {
      issues.push({
        severity: "warning",
        code: "low_paragraph_structure",
        message: "The text has too few clear paragraphs, which makes scanning harder.",
      });
    }
    if (headingCount < 2) {
      issues.push({
        severity: "warning",
        code: "weak_heading_structure",
        message: "Add clear section headings so readers and search systems can understand the structure faster.",
      });
    }
    return {
      tool: "analyze_text_structure",
      summary: { wordCount, paragraphCount, headingCount },
      issues,
      recommendations: [
        "Use one clear H1/title, then split the body into intent-based sections with short headings.",
      ],
    };
  });

export const analyzeTextStyleHandler = () =>
  runTextTool("analyze_text_style", (context) => {
    const allWords = words(context.text);
    const allSentences = sentences(context.text);
    const detectedStyle = inferTextStyle(context.text);
    const avgSentenceWords =
      allSentences.length > 0 ? Math.round(allWords.length / allSentences.length) : 0;
    const issues: TextIssue[] = [];
    if (avgSentenceWords > 24) {
      issues.push({
        severity: "warning",
        code: "long_sentences",
        message: "Average sentence length is high; shorten dense sentences to improve readability.",
      });
    }
    if (/является|осуществляется|производится|обеспечивает|utilize|leverage/i.test(context.text)) {
      issues.push({
        severity: "info",
        code: "formal_phrasing",
        message: "The text contains formal or mechanical phrasing; make key explanations more direct.",
      });
    }
    return {
      tool: "analyze_text_style",
      summary: {
        words: allWords.length,
        sentences: allSentences.length,
        avgSentenceWords,
        detectedStyle,
      },
      issues,
      recommendations: [
        `Detected style: ${detectedStyle}. Prefer concrete verbs, shorter sentences, and examples where the reader may hesitate.`,
      ],
    };
  });

export const analyzeToneFitHandler = () =>
  runTextTool("analyze_tone_fit", (context) => {
    const detectedTone = inferTone(context.text);
    return {
      tool: "analyze_tone_fit",
      summary: { action: context.action, detectedTone },
      issues: [
        {
          severity: "info",
          code: "tone_review",
          message:
            detectedTone === "cautious_expert"
              ? "Tone appears cautious and expert-oriented; keep warnings precise instead of making every paragraph defensive."
              : "Tone should match the platform and risk of the topic; for health or finance topics, avoid overconfident promises.",
        },
      ],
      recommendations: [
        `Detected tone: ${detectedTone}. Add precise caveats only where they protect the reader; avoid making every paragraph cautious.`,
      ],
    };
  });

export const languageAudienceFitHandler = () =>
  runTextTool("language_audience_fit", (context) => {
    const cyrillic = (context.text.match(/\p{Script=Cyrillic}/gu) ?? []).length;
    const latin = (context.text.match(/\p{Script=Latin}/gu) ?? []).length;
    return {
      tool: "language_audience_fit",
      summary: {
        dominantScript: cyrillic >= latin ? "cyrillic" : "latin",
        cyrillic,
        latin,
      },
      issues: [
        {
          severity: "info",
          code: "audience_fit",
          message:
            "Check that examples, terminology, and assumed knowledge match the intended audience.",
        },
      ],
      recommendations: [
        "Name the target reader explicitly in the intro when the topic can serve several audiences.",
      ],
    };
  });

export const mediaPlaceholderReviewHandler = () =>
  runTextTool("media_placeholder_review", (context) => {
    const markers = (context.text.match(/место для изображения|image placeholder|место для видео|место для аудио/giu) ?? []).length;
    const needsMediaQuestion = markers === 0;
    const issues: TextIssue[] = markers
      ? [
          {
            severity: "info",
            code: "media_markers_present",
            message: "Media markers are already present in the body; keep them near the relevant explanation.",
          },
        ]
      : [
          {
            severity: "warning",
            code: "no_media_markers",
            message: "No media placeholders were found. Add them only where an image, animation, video, or audio improves understanding.",
          },
        ];
    return {
      tool: "media_placeholder_review",
      summary: {
        markers,
        needsMediaQuestion,
        suggestedMarkerTypes: ["image", "animation", "video", "audio"],
      },
      issues,
      recommendations: [
        needsMediaQuestion
          ? "Ask the user whether they want ToraSEO to add media placement markers; choose image, animation, video, or audio based on the article section."
          : "Place media markers inside the relevant section, not all at the end of the article.",
      ],
    };
  });

export const articleUniquenessHandler = () =>
  runTextTool("article_uniqueness", (context) => {
    const allWords = words(context.text).map((word) => word.toLowerCase());
    const uniqueWordRatio =
      allWords.length > 0 ? new Set(allWords).size / allWords.length : 0;
    const normalizedSentences = sentences(context.text).map((sentence) =>
      sentence.toLowerCase().replace(/\s+/g, " ").trim(),
    );
    const duplicateSentences =
      normalizedSentences.length - new Set(normalizedSentences).size;
    const duplicateSentenceRate =
      normalizedSentences.length > 0
        ? duplicateSentences / normalizedSentences.length
        : 0;
    const repeated = topRepeatedTerms(context.text, 5);
    const score = clampScore(
      92 -
        duplicateSentenceRate * 80 -
        repeated.length * 3 -
        Math.max(0, 0.42 - uniqueWordRatio) * 80,
    );
    const issues: TextIssue[] = [];
    if (score < 70) {
      issues.push({
        severity: "warning",
        code: "uniqueness_risk",
        message:
          "The text has local repetition or duplicate-pattern risk. This is not an internet plagiarism check.",
      });
    }
    if (duplicateSentences > 0) {
      issues.push({
        severity: "warning",
        code: "duplicate_sentences",
        message: "Some sentences repeat almost exactly inside the article.",
      });
    }
    return {
      tool: "article_uniqueness",
      summary: {
        score,
        uniqueWordRatio,
        duplicateSentenceRate,
        repeatedTerms: repeated,
        method: "local_repetition_risk",
      },
      issues,
      recommendations: [
        "Rewrite repeated fragments with new examples, narrower claims, or more specific transitions.",
      ],
    };
  });

export const languageSyntaxHandler = () =>
  runTextTool("language_syntax", (context) => {
    const allSentences = sentences(context.text);
    const stats = sentenceLengthStats(context.text);
    const spacingIssues =
      (context.text.match(/\s+[,.!?;:]/g) ?? []).length +
      (context.text.match(/[,.!?;:][^\s\n)"»]/g) ?? []).length;
    const lowercaseStarts = allSentences.filter((sentence) =>
      /^[a-zа-яё]/u.test(sentence),
    ).length;
    const repeatedPunctuation = (context.text.match(/[!?.,]{3,}/g) ?? []).length;
    const issueTotal = spacingIssues + lowercaseStarts + repeatedPunctuation;
    const score = clampScore(
      96 - issueTotal * 5 - Math.max(0, stats.avg - 26) * 1.5,
    );
    const issues: TextIssue[] = [];
    if (score < 78) {
      issues.push({
        severity: "warning",
        code: "syntax_risk",
        message:
          "The text has visible syntax or punctuation risks that should be checked before publishing.",
      });
    }
    if (stats.avg > 26) {
      issues.push({
        severity: "info",
        code: "dense_sentences",
        message: "Several sentences are dense; grammar may be correct, but readability suffers.",
      });
    }
    return {
      tool: "language_syntax",
      summary: {
        score,
        suspectedIssues: issueTotal,
        spacingIssues,
        lowercaseSentenceStarts: lowercaseStarts,
        repeatedPunctuation,
        avgSentenceWords: stats.avg,
      },
      issues,
      recommendations: [
        "Run a final human grammar pass for punctuation, sentence boundaries, and overloaded clauses.",
      ],
    };
  });

export const aiWritingProbabilityHandler = () =>
  runTextTool("ai_writing_probability", (context) => {
    const repeated = topRepeatedTerms(context.text, 5);
    const stats = sentenceLengthStats(context.text);
    const genericSignals = (
      context.text.match(
        /важно отметить|следует отметить|таким образом|в заключение|it is important to note|in conclusion|overall|moreover/giu,
      ) ?? []
    ).length;
    const formalSignals = (
      context.text.match(/является|осуществляется|производится|обеспечивает|utilize|leverage/giu) ?? []
    ).length;
    const lowVarianceSignal = stats.variance > 0 && stats.variance < 18 ? 18 : 0;
    const probability = clampScore(
      18 + genericSignals * 10 + formalSignals * 5 + repeated.length * 4 + lowVarianceSignal,
    );
    const issues: TextIssue[] =
      probability >= 60
        ? [
            {
              severity: "warning",
              code: "ai_style_probability",
              message:
                "The text has signals often associated with AI-assisted writing: generic transitions, uniform rhythm, or repeated terms.",
            },
          ]
        : [];
    return {
      tool: "ai_writing_probability",
      summary: {
        probability,
        genericSignals,
        formalSignals,
        repeatedTerms: repeated,
        sentenceLengthVariance: stats.variance,
        method: "heuristic_style_probability",
      },
      issues,
      recommendations: [
        "Add specific lived examples, clearer author intent, and less uniform sentence rhythm where the topic allows it.",
      ],
    };
  });

export const factDistortionCheckHandler = () =>
  runTextTool("fact_distortion_check", (context) => {
    const exactNumbers = (context.text.match(/\b\d+(?:[.,]\d+)?\s?%|\b\d{4}\b|\b\d+(?:[.,]\d+)?\s?(?:кг|мг|г|км|мл|час|мин|day|days|kg|mg|km)\b/giu) ?? [])
      .length;
    const absoluteClaims = (
      context.text.match(
        /всегда|никогда|доказано|гарантирует|без исключений|единственный|точно|100%|always|never|proven|guarantees|only|without exception/giu,
      ) ?? []
    ).length;
    const sensitiveClaims = (
      context.text.match(
        /врач|болезн|диабет|лекарств|лечение|беремен|инвестици|налог|закон|doctor|disease|treatment|medicine|investment|tax|law/giu,
      ) ?? []
    ).length;
    const sourceSignals = (
      context.text.match(/https?:\/\/|\[[0-9]+\]|источник|исследован|study|source|according to/giu) ?? []
    ).length;
    const risk = clampScore(
      exactNumbers * 5 + absoluteClaims * 10 + sensitiveClaims * 7 - sourceSignals * 6,
    );
    const issues: TextIssue[] = [];
    if (risk >= 45) {
      issues.push({
        severity: "warning",
        code: "fact_distortion_risk",
        message:
          "The text contains fact-sensitive claims that may need source verification before publication.",
      });
    }
    if (absoluteClaims > 0) {
      issues.push({
        severity: "info",
        code: "absolute_claims",
        message:
          "Absolute wording can distort facts if the article does not prove the claim.",
      });
    }
    if (sensitiveClaims > 0 && sourceSignals === 0) {
      issues.push({
        severity: "warning",
        code: "sensitive_claims_without_sources",
        message:
          "Sensitive medical, legal, financial, or technical claims should be supported by sources or cautious wording.",
      });
    }
    return {
      tool: "fact_distortion_check",
      summary: {
        risk,
        exactNumbers,
        absoluteClaims,
        sensitiveClaims,
        sourceSignals,
        method: "claim_risk_heuristic",
      },
      issues,
      recommendations: [
        "Verify exact numbers, named facts, and sensitive claims; soften statements that cannot be supported confidently.",
      ],
    };
  });

export const logicConsistencyCheckHandler = () =>
  runTextTool("logic_consistency_check", (context) => {
    const allSentences = sentences(context.text);
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
    const lowerText = context.text.toLowerCase();
    const contradictionSignals = contradictionPairs.filter(
      ([left, right]) => lowerText.includes(left) && lowerText.includes(right),
    ).length;
    const causalityClaims = (
      context.text.match(/поэтому|из-за этого|следовательно|значит|because|therefore|as a result/giu) ?? []
    ).length;
    const unsupportedCausality = Math.max(
      0,
      causalityClaims -
        (context.text.match(/например|данн|исследован|потому что|example|data|study|because/giu) ?? [])
          .length,
    );
    const abruptTurns = (
      context.text.match(/однако|но при этом|с другой стороны|however|but at the same time/giu) ?? []
    ).length;
    const score = clampScore(
      94 - contradictionSignals * 18 - unsupportedCausality * 8 - Math.max(0, abruptTurns - allSentences.length / 6) * 4,
    );
    const issues: TextIssue[] = [];
    if (contradictionSignals > 0) {
      issues.push({
        severity: "warning",
        code: "possible_internal_contradiction",
        message:
          "The text may contain statements that pull in opposite directions.",
      });
    }
    if (unsupportedCausality > 1) {
      issues.push({
        severity: "info",
        code: "unsupported_causality",
        message:
          "Some cause-and-effect transitions may need examples, evidence, or clearer intermediate steps.",
      });
    }
    return {
      tool: "logic_consistency_check",
      summary: {
        score,
        contradictionSignals,
        causalityClaims,
        unsupportedCausality,
        abruptTurns,
        method: "internal_logic_heuristic",
      },
      issues,
      recommendations: [
        "Check claims that use 'therefore', 'because', 'always', or 'never'; add missing intermediate reasoning where the conclusion jumps too quickly.",
      ],
    };
  });

export const aiHallucinationCheckHandler = () =>
  runTextTool("ai_hallucination_check", (context) => {
    const fabricatedCitationSignals = (
      context.text.match(/\[[^\]]*(?:нужен источник|citation needed|source needed|источник\?)[^\]]*\]/giu) ?? []
    ).length;
    const vagueAuthorities = (
      context.text.match(/эксперты считают|исследования показывают|многие специалисты|according to experts|studies show|researchers say/giu) ?? []
    ).length;
    const exactFacts = (
      context.text.match(/\b\d+(?:[.,]\d+)?\s?%|\b\d{4}\b|[A-ZА-ЯЁ][\p{L}]+(?:\s+[A-ZА-ЯЁ][\p{L}]+){1,3}/gu) ?? []
    ).length;
    const sourceSignals = (
      context.text.match(/https?:\/\/|\[[0-9]+\]|источник|исследован|study|source|doi\.org/giu) ?? []
    ).length;
    const aiArtifactSignals = (
      context.text.match(/как искусственный интеллект|я не могу подтвердить|as an ai|i cannot verify/giu) ?? []
    ).length;
    const hallucinationRisk = clampScore(
      fabricatedCitationSignals * 22 +
        vagueAuthorities * 12 +
        Math.max(0, exactFacts - sourceSignals * 2) * 4 +
        aiArtifactSignals * 12,
    );
    const aiInvolvementSignals = clampScore(
      aiArtifactSignals * 28 + vagueAuthorities * 8 + fabricatedCitationSignals * 18,
    );
    const issues: TextIssue[] = [];
    if (hallucinationRisk >= 45) {
      issues.push({
        severity: "warning",
        code: "hallucination_risk",
        message:
          "The text contains signals that AI-generated factual details may need verification.",
      });
    }
    if (vagueAuthorities > 0) {
      issues.push({
        severity: "info",
        code: "vague_authorities",
        message:
          "Phrases like 'experts say' or 'studies show' should point to a concrete source.",
      });
    }
    return {
      tool: "ai_hallucination_check",
      summary: {
        hallucinationRisk,
        aiInvolvementSignals,
        fabricatedCitationSignals,
        vagueAuthorities,
        exactFacts,
        sourceSignals,
        method: "ai_claim_hallucination_heuristic",
      },
      issues,
      recommendations: [
        "Ask the model to list claims that need verification, then replace vague authorities with concrete sources or remove unsupported details.",
      ],
    };
  });

export const naturalnessIndicatorsHandler = () =>
  runTextTool("naturalness_indicators", (context) => {
    const overused = topRepeatedTerms(context.text, 5);
    return {
      tool: "naturalness_indicators",
      summary: { repeatedTerms: overused },
      issues: overused.length
        ? [
            {
              severity: "warning",
              code: "repeated_terms",
              message: `Repeated terms may make the text feel mechanical: ${overused.join(", ")}.`,
            },
          ]
        : [],
      recommendations: [
        "Vary sentence openings and remove service phrases that do not add meaning.",
      ],
    };
  });
