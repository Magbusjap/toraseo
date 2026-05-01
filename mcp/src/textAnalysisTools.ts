import { mutateBuffer, readState, type ToolBufferEntry } from "./stateFile.js";
import { readActiveInputMarkdown, writeWorkspaceResult } from "./workspace.js";

type TextToolId =
  | "detect_text_platform"
  | "analyze_text_structure"
  | "analyze_text_style"
  | "analyze_tone_fit"
  | "language_audience_fit"
  | "media_placeholder_review"
  | "naturalness_indicators";

interface TextContext {
  action: "scan" | "solution";
  topic: string;
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
          text: next
            ? `Tool ${toolId} completed. Results were written to the ToraSEO app.`
            : JSON.stringify(result, null, 2),
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
    const issue: TextIssue = {
      severity: "info",
      code: "platform_inferred",
      message:
        wordCount > 700
          ? "The text behaves like a long-form site article."
          : "The text behaves like a short article or platform post draft.",
    };
    return {
      tool: "detect_text_platform",
      summary: { topic: context.topic, wordCount, hasMarkdown },
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
      summary: { words: allWords.length, sentences: allSentences.length, avgSentenceWords },
      issues,
      recommendations: [
        "Prefer concrete verbs, shorter sentences, and examples where the reader may hesitate.",
      ],
    };
  });

export const analyzeToneFitHandler = () =>
  runTextTool("analyze_tone_fit", (context) => ({
    tool: "analyze_tone_fit",
    summary: { action: context.action },
    issues: [
      {
        severity: "info",
        code: "tone_review",
        message:
          "Tone should match the platform and risk of the topic; for health or finance topics, avoid overconfident promises.",
      },
    ],
    recommendations: [
      "Add precise caveats only where they protect the reader; avoid making every paragraph cautious.",
    ],
  }));

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
      summary: { markers },
      issues,
      recommendations: [
        "Place media markers inside the relevant section, not all at the end of the article.",
      ],
    };
  });

export const naturalnessIndicatorsHandler = () =>
  runTextTool("naturalness_indicators", (context) => {
    const repeated = [...context.text.toLowerCase().matchAll(/\b([\p{L}\p{N}]{5,})\b/gu)]
      .flatMap((match) => (match[1] ? [match[1]] : []))
      .reduce<Record<string, number>>((acc, word) => {
        acc[word] = (acc[word] ?? 0) + 1;
        return acc;
      }, {});
    const overused = Object.entries(repeated)
      .filter(([, count]) => count >= 5)
      .map(([word]) => word)
      .slice(0, 8);
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
