import { z } from "zod";

import { readState, submitAiReport, type CurrentScanState } from "./stateFile.js";
import { writeWorkspaceResult } from "./workspace.js";

type McpHandlerResult = {
  isError?: boolean;
  content: Array<{ type: "text"; text: string }>;
};

export const submitAiReportInputSchema = {
  reportJson: z
    .string()
    .min(2)
    .describe(
      "A JSON object containing the final ToraSEO report written by the AI. " +
        "The app renders this report; do not pass prose outside JSON. " +
        "Use plain string summary and nextStep fields, and put articleText, " +
        "articleCompare, or siteCompare at the top level rather than under " +
        "a visual wrapper. " +
        "Call this only after every selected MCP analysis tool has completed.",
    ),
};

function parseReportJson(reportJson: string): unknown {
  const parsed = JSON.parse(reportJson);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("reportJson must be a JSON object.");
  }
  return parsed;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizePriority(value: unknown, fallback: "high" | "medium" | "low" = "low"): "high" | "medium" | "low" {
  if (value === "high" || value === "medium" || value === "low") return value;
  if (value === "critical") return "high";
  if (value === "warning" || value === "warn") return "medium";
  if (value === "info") return "low";
  return fallback;
}

function normalizeSeverityStatus(value: unknown): "healthy" | "watch" | "problem" {
  const priority = normalizePriority(value, "low");
  if (priority === "high") return "problem";
  if (priority === "medium") return "watch";
  return "healthy";
}

function normalizeSourceToolIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function summarizeObject(value: unknown): string | null {
  const direct = asString(value);
  if (direct) return direct;
  const record = asRecord(value);
  if (!record) return null;

  const parts: string[] = [];
  const oneLine = asString(record.oneLine);
  const recommended = asString(record.recommended);
  if (oneLine) parts.push(oneLine);
  if (recommended) parts.push(recommended);
  if (Array.isArray(record.topPriorities)) {
    const priorities = record.topPriorities
      .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      .slice(0, 5);
    if (priorities.length > 0) parts.push(`Top priorities: ${priorities.join(" ")}`);
  }
  if (Array.isArray(record.questions)) {
    const questions = record.questions
      .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      .slice(0, 3);
    if (questions.length > 0) parts.push(`Questions: ${questions.join(" ")}`);
  }
  return parts.length > 0 ? parts.join(" ") : null;
}

function normalizeNextStepText(value: unknown): string | null {
  const text = summarizeObject(value);
  if (!text) return null;
  const trimmed = text.trim();
  if (
    /^\s*if you want\b/i.test(trimmed) ||
    /\bi can\b/i.test(trimmed) ||
    /\?$/.test(trimmed)
  ) {
    return "Apply the highest-priority report edits, then re-run the selected checks.";
  }
  return trimmed;
}

function normalizeConfirmedFacts(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) return [];
  return value.map((item, index) => {
    const record = asRecord(item);
    const title =
      asString(record?.title) ??
      asString(record?.fact) ??
      asString(record?.finding) ??
      `Confirmed fact ${index + 1}`;
    const detail =
      asString(record?.detail) ??
      asString(record?.fact) ??
      asString(record?.finding) ??
      title;
    return {
      title,
      detail,
      priority: normalizePriority(record?.priority, "low"),
      sourceToolIds: normalizeSourceToolIds(record?.sourceToolIds),
    };
  });
}

function normalizeExpertHypotheses(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) return [];
  return value.map((item, index) => {
    const record = asRecord(item);
    const detail =
      asString(record?.detail) ??
      asString(record?.hypothesis) ??
      `Expert hypothesis ${index + 1}`;
    const confidence = asNumber(record?.confidence);
    return {
      title: asString(record?.title) ?? `Expert hypothesis ${index + 1}`,
      detail,
      priority: normalizePriority(
        record?.priority,
        confidence !== null && confidence >= 0.75 ? "medium" : "low",
      ),
      expectedImpact:
        asString(record?.expectedImpact) ??
        "Improve report confidence and editorial prioritization.",
      validationMethod:
        asString(record?.validationMethod) ??
        "Validate after edits and re-run the selected ToraSEO checks.",
    };
  });
}

function selectedToolCoverage(state: CurrentScanState): {
  completed: number;
  total: number;
  percent: number;
} {
  const total = state.selectedTools.length;
  const completed = state.selectedTools.filter((toolId) => {
    const entry = state.buffer[toolId];
    return entry && (entry.status === "complete" || entry.status === "error");
  }).length;
  return {
    completed,
    total,
    percent: total > 0 ? Math.round((completed / total) * 100) : 0,
  };
}

function isFullArticleTextVisual(value: Record<string, unknown>): boolean {
  return Boolean(
    asRecord(value.coverage) &&
      asRecord(value.platform) &&
      asRecord(value.document) &&
      Array.isArray(value.dimensions) &&
      Array.isArray(value.priorities) &&
      Array.isArray(value.metrics),
  );
}

function compactItems(
  value: unknown,
  defaultPriority: "high" | "medium" | "low",
): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => asRecord(item))
    .filter((item): item is Record<string, unknown> => Boolean(item))
    .map((item) => ({
      title: asString(item.title) ?? asString(item.label) ?? "AI finding",
      detail:
        asString(item.detail) ??
        asString(item.note) ??
        asString(item.finding) ??
        "AI finding based on selected tool evidence.",
      priority: normalizePriority(item.severity ?? item.priority, defaultPriority),
      sourceToolIds: normalizeSourceToolIds(item.sourceToolIds),
    }));
}

function collectSourceToolIds(value: unknown, output = new Set<string>()): Set<string> {
  if (!value || typeof value !== "object") return output;
  if (Array.isArray(value)) {
    for (const item of value) collectSourceToolIds(item, output);
    return output;
  }
  const record = value as Record<string, unknown>;
  const sourceToolIds = record.sourceToolIds;
  if (Array.isArray(sourceToolIds)) {
    for (const toolId of sourceToolIds) {
      if (typeof toolId === "string" && toolId.trim()) {
        output.add(toolId.trim());
      }
    }
  }
  for (const item of Object.values(record)) {
    collectSourceToolIds(item, output);
  }
  return output;
}

function attachInternalProvenance(
  report: Record<string, unknown>,
  state: CurrentScanState,
): Record<string, unknown> {
  const coveredToolIds = collectSourceToolIds(report);
  const tools = state.selectedTools.map((toolId) => {
    const coveredByReport = coveredToolIds.has(toolId);
    return {
      toolId,
      aiAuthored: coveredByReport,
      coveredByReport,
      source: "mcp_submit_ai_report",
    };
  });
  return {
    ...report,
    internalProvenance: {
      generatedBy: "ai",
      source: "mcp_submit_ai_report",
      checkedAt: new Date().toISOString(),
      tools,
    },
  };
}

function logInternalProvenance(report: Record<string, unknown>, state: CurrentScanState): void {
  const provenance = asRecord(report.internalProvenance);
  const tools = provenance?.tools;
  if (!provenance || !Array.isArray(tools)) return;
  for (const item of tools) {
    const record = asRecord(item);
    process.stderr.write(
      `[report-provenance] scan=${state.scanId} analysis=${state.analysisType ?? "unknown"} source=${String(provenance.source ?? "unknown")} tool=${String(record?.toolId ?? "unknown")} aiAuthored=${record?.aiAuthored === true} coveredByReport=${record?.coveredByReport === true}\n`,
    );
  }
}

function sectionText(value: unknown): string | null {
  const direct = asString(value);
  if (direct) return direct;
  const record = asRecord(value);
  if (!record) return null;

  const parts: string[] = [];
  for (const key of [
    "recommendation",
    "detail",
    "note",
    "issue",
    "risk",
    "flag",
  ]) {
    const text = asString(record[key]);
    if (text) parts.push(text);
  }
  for (const key of ["notes", "recommendations", "safetyFlags"]) {
    const list = record[key];
    if (!Array.isArray(list)) continue;
    const values = list
      .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      .slice(0, 3);
    if (values.length > 0) parts.push(values.join(" "));
  }
  return parts.length > 0 ? parts.join(" ") : null;
}

function compactSectionItem(
  compact: Record<string, unknown>,
  key: string,
  title: string,
  priority: "high" | "medium" | "low",
  sourceToolIds: string[],
): Record<string, unknown> | null {
  const section = asRecord(compact[key]);
  if (!section) return null;
  const detail =
    sectionText(section) ?? "AI finding based on selected tool evidence.";
  return {
    id: key,
    title,
    detail,
    severity: priority,
    priority,
    sourceToolIds:
      normalizeSourceToolIds(section.sourceToolIds).length > 0
        ? normalizeSourceToolIds(section.sourceToolIds)
        : sourceToolIds,
  };
}

function normalizeArticleTextVisual(
  report: Record<string, unknown>,
  state: CurrentScanState,
): Record<string, unknown> | null {
  const topLevel = asRecord(report.articleText);
  const visual = asRecord(report.visual);
  const compact = topLevel ?? asRecord(visual?.articleText);
  if (!compact) return null;
  if (isFullArticleTextVisual(compact)) return compact;

  const findings = Array.isArray(report.findings)
    ? report.findings.map((item) => asRecord(item)).filter((item): item is Record<string, unknown> => Boolean(item))
    : [];
  const risks = compactItems(compact.keyRisks, "medium");
  const strengths = compactItems(compact.strengths, "low");
  const safetyNotes = compactItems(compact.safetyNotes, "medium");
  const sectionItems = [
    compactSectionItem(compact, "structure", "Structure", "medium", [
      "analyze_text_structure",
    ]),
    compactSectionItem(compact, "styleAndTone", "Style and tone", "low", [
      "analyze_text_style",
      "analyze_tone_fit",
    ]),
    compactSectionItem(compact, "readability", "Readability", "high", [
      "readability_complexity",
    ]),
    compactSectionItem(
      compact,
      "uniquenessAndRepetition",
      "Uniqueness and repetition",
      "medium",
      ["article_uniqueness", "naturalness_indicators"],
    ),
    compactSectionItem(compact, "syntax", "Syntax", "medium", [
      "language_syntax",
    ]),
    compactSectionItem(
      compact,
      "credibilityAndVerification",
      "Credibility and verification",
      "high",
      ["claim_source_queue", "fact_distortion_check", "ai_hallucination_check"],
    ),
    compactSectionItem(compact, "safety", "Safety", "medium", [
      "safety_science_review",
    ]),
    compactSectionItem(compact, "media", "Media", "medium", [
      "media_placeholder_review",
    ]),
    compactSectionItem(compact, "aiSignals", "AI-style signals", "low", [
      "ai_writing_probability",
      "ai_trace_map",
    ]),
  ].filter((item): item is Record<string, unknown> => Boolean(item));
  const coverage = selectedToolCoverage(state);
  const findingPriorities = findings.map((finding, index) => ({
    title: asString(finding.title) ?? `Finding ${index + 1}`,
    detail:
      asString(finding.whatWeSaw) ??
      asString(finding.detail) ??
      asString(finding.whyItMatters) ??
      "AI finding based on selected tool evidence.",
    priority: normalizePriority(finding.severity, "medium"),
    sourceToolIds: normalizeSourceToolIds(finding.sourceToolIds),
  }));
  const priorities = [
    ...findingPriorities,
    ...risks,
    ...safetyNotes,
    ...sectionItems.filter((item) => normalizePriority(item.priority, "low") !== "low"),
  ];
  const dimensionsSource =
    findings.length > 0
      ? findings
      : sectionItems.length > 0
        ? sectionItems
      : [...risks, ...safetyNotes, ...strengths].map((item, index) => ({
          id: `ai_item_${index + 1}`,
          title: item.title,
          detail: item.detail,
          severity: item.priority,
          sourceToolIds: item.sourceToolIds,
        })) as Record<string, unknown>[];
  const dimensions = dimensionsSource.map((finding, index) => ({
    id: asString(finding.id) ?? `finding_${index + 1}`,
    label: asString(finding.title) ?? `Finding ${index + 1}`,
    status: normalizeSeverityStatus(finding.severity),
    detail:
      asString(finding.whatWeSaw) ??
      asString(finding.detail) ??
      "AI finding based on selected tool evidence.",
    recommendation: Array.isArray(finding.recommendations)
      ? finding.recommendations
          .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
          .slice(0, 3)
          .join(" ")
      : asString(finding.whyItMatters) ?? "Review this point before publishing.",
    sourceToolIds: normalizeSourceToolIds(finding.sourceToolIds),
  }));
  const annotationSource = dimensionsSource.length > 0 ? dimensionsSource : findings;
  const annotations = annotationSource.map((finding, index) => ({
    id: index + 1,
    kind: normalizePriority(finding.severity, "low") === "low" ? "note" : "issue",
    label: asString(finding.title) ?? `Finding ${index + 1}`,
    detail:
      asString(finding.whatWeSaw) ??
      asString(finding.detail) ??
      "AI finding based on selected tool evidence.",
    sourceToolIds: normalizeSourceToolIds(finding.sourceToolIds),
    severity:
      normalizePriority(finding.severity, "low") === "high"
        ? "critical"
        : normalizePriority(finding.severity, "low") === "medium"
          ? "warning"
          : "info",
  }));
  const nextStepRecord = asRecord(report.nextStep);
  const nextActions = Array.isArray(nextStepRecord?.questions)
    ? nextStepRecord.questions.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
  const overview = asRecord(compact.overview);
  const platformRecord = asRecord(compact.platform);
  const structureRecord = asRecord(compact.structure);
  const wordCount =
    asNumber(compact.wordCount) ??
    asNumber(overview?.wordCount) ??
    asNumber(platformRecord?.wordCount) ??
    asNumber(structureRecord?.wordCount);
  const paragraphCount =
    asNumber(compact.paragraphCount) ??
    asNumber(overview?.paragraphCount) ??
    asNumber(structureRecord?.paragraphCount);
  const warningCount = priorities.filter((item) => item.priority !== "low").length;
  const seoPreview =
    asRecord(compact.seoPackagePreview) ?? asRecord(compact.seoIntent);
  const seoDraft = asRecord(seoPreview?.draftPackage);
  const hookScore = asNumber(seoPreview?.hookScore);
  const ctrPotential = asNumber(seoPreview?.ctrPotential);
  const trendPotential = asNumber(seoPreview?.trendPotential);

  return {
    verdict: warningCount > 0 ? "needs_revision" : "ready",
    verdictLabel: warningCount > 0 ? "Needs revision before publish" : "Ready to publish",
    verdictDetail:
      asString(asRecord(report.summary)?.oneLine) ??
      asString(report.summary) ??
      "AI-written report based on selected ToraSEO tool evidence.",
    coverage,
    platform: {
      key:
        asString(platformRecord?.selectedPlatform) ??
        asString(platformRecord?.inferredPlatform) ??
        asString(overview?.platform) ??
        state.input?.textPlatform ??
        "site_article",
      label:
        asString(platformRecord?.selectedPlatform) ??
        asString(platformRecord?.inferredPlatform) ??
        asString(overview?.platform) ??
        state.input?.textPlatform ??
        "Site article",
      detail: "Detected or selected article-text platform.",
    },
    document: {
      title: state.input?.topic ?? "Article text",
      titleNote: null,
      text: "",
      wordCount,
      paragraphCount,
    },
    annotationStatus: warningCount > 0 ? "issuesAndRecommendations" : "ready",
    annotations,
    dimensions,
    priorities,
    metrics: [
      {
        id: "hook",
        label: "Hook",
        value: hookScore,
        suffix: "",
        tone: hookScore === null ? "pending" : hookScore >= 70 ? "good" : "warn",
        description: asString(seoPreview?.note) ?? "AI-provided local SEO hook forecast.",
      },
      {
        id: "ctr",
        label: "CTR",
        value: ctrPotential,
        suffix: "",
        tone:
          ctrPotential === null ? "pending" : ctrPotential >= 70 ? "good" : "warn",
        description: "AI-provided local CTR forecast.",
      },
      {
        id: "trend",
        label: "Trend",
        value: trendPotential,
        suffix: "",
        tone:
          trendPotential === null
            ? "pending"
            : trendPotential >= 70
              ? "good"
              : "warn",
        description: "AI-provided local trend forecast.",
      },
    ],
    warningCount,
    strengths: strengths.map((item) => ({
      title: String(item.title),
      detail: String(item.detail),
      sourceToolIds: normalizeSourceToolIds(item.sourceToolIds),
    })),
    weaknesses: priorities.filter((item) => item.priority !== "low").map((item) => ({
      title: item.title,
      detail: item.detail,
      sourceToolIds: item.sourceToolIds,
    })),
    intentForecast: seoPreview
      ? {
          intent: asString(seoPreview.intent) ?? "informational",
          intentLabel: asString(seoPreview.intent) ?? "Informational",
          hookType: "local_forecast",
          hookScore,
          ctrPotential,
          trendPotential,
          internetDemandAvailable: false,
          internetDemandSource:
            asString(seoPreview.note) ??
            "Local forecast only. No live SERP/social validation was used.",
          hookIdeas: [],
          seoPackage: {
            seoTitle: asString(seoDraft?.seoTitle) ?? "",
            metaDescription: asString(seoDraft?.metaDescription) ?? "",
            primaryKeyword: asString(seoDraft?.primaryKeyword) ?? "",
            secondaryKeywords: Array.isArray(seoDraft?.secondaryKeywords)
              ? seoDraft.secondaryKeywords.filter(
                  (item): item is string =>
                    typeof item === "string" && item.trim().length > 0,
                )
              : [],
            keywords: Array.isArray(seoDraft?.secondaryKeywords)
              ? seoDraft.secondaryKeywords.filter(
                  (item): item is string =>
                    typeof item === "string" && item.trim().length > 0,
                )
              : [],
            category: "",
            tags: [],
            slug: asString(seoDraft?.slug) ?? "",
          },
        }
      : undefined,
    nextActions:
      nextActions.length > 0
        ? nextActions
        : [summarizeObject(report.nextStep) ?? "Review AI findings and re-run the selected checks after edits."],
  };
}

function normalizeSubmittedReport(report: Record<string, unknown>, state: CurrentScanState): Record<string, unknown> {
  const normalized: Record<string, unknown> = {
    ...report,
    summary:
      summarizeObject(report.summary) ??
      "AI-written ToraSEO report based on selected tool evidence.",
    nextStep:
      normalizeNextStepText(report.nextStep) ??
      "Review the recommendations and re-run the selected checks after edits.",
    confirmedFacts: normalizeConfirmedFacts(report.confirmedFacts),
    expertHypotheses: normalizeExpertHypotheses(report.expertHypotheses),
  };

  const articleText = normalizeArticleTextVisual(report, state);
  if (articleText) normalized.articleText = articleText;
  const visual = asRecord(report.visual);
  if (!normalized.articleCompare && asRecord(visual?.articleCompare)) {
    normalized.articleCompare = visual?.articleCompare;
  }
  if (!normalized.siteCompare && asRecord(visual?.siteCompare)) {
    normalized.siteCompare = visual?.siteCompare;
  }

  return attachInternalProvenance(normalized, state);
}

function reportValidationError(
  report: Record<string, unknown>,
  analysisType: string | undefined,
): string | null {
  if (!Array.isArray(report.confirmedFacts)) {
    return "report.confirmedFacts must be an array.";
  }
  if (typeof report.summary !== "string" || !report.summary.trim()) {
    return "report.summary must be a non-empty string.";
  }
  if (typeof report.nextStep !== "string" || !report.nextStep.trim()) {
    return "report.nextStep must be a non-empty string.";
  }
  if (
    (analysisType === "article_text" || analysisType === "page_by_url") &&
    (!report.articleText ||
      typeof report.articleText !== "object" ||
      Array.isArray(report.articleText))
  ) {
    return "article_text and page_by_url reports must include an articleText visual block written by the AI.";
  }
  if (
    analysisType === "article_compare" &&
    (!report.articleCompare ||
      typeof report.articleCompare !== "object" ||
      Array.isArray(report.articleCompare))
  ) {
    return "article_compare reports must include an articleCompare visual block written by the AI.";
  }
  if (
    analysisType === "site_compare" &&
    (!report.siteCompare ||
      typeof report.siteCompare !== "object" ||
      Array.isArray(report.siteCompare))
  ) {
    return "site_compare reports must include a siteCompare visual block written by the AI.";
  }
  return null;
}

function incompleteToolsMessage(state: NonNullable<Awaited<ReturnType<typeof readState>>>): string | null {
  const missing = state.selectedTools.filter((toolId) => {
    const entry = state.buffer[toolId];
    return !entry || (entry.status !== "complete" && entry.status !== "error");
  });
  if (missing.length === 0) return null;
  return `[tools_not_complete] submit_ai_report is the final step and cannot run yet. Complete the remaining selected MCP tools first: ${missing.join(", ")}.`;
}

export async function submitAiReportHandler({
  reportJson,
}: {
  reportJson: string;
}): Promise<McpHandlerResult> {
  let report: unknown;
  try {
    report = parseReportJson(reportJson);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: `[invalid_report_json] ${message}`,
        },
      ],
    };
  }

  const state = await readState();
  if (!state) {
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: "[no_active_scan] ToraSEO has no active bridge scan that can accept an AI report.",
        },
      ],
    };
  }
  const incompleteMessage = incompleteToolsMessage(state);
  if (incompleteMessage) {
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: incompleteMessage,
        },
      ],
    };
  }
  const normalizedReport = normalizeSubmittedReport(
    report as Record<string, unknown>,
    state,
  );
  const validationError = reportValidationError(normalizedReport, state.analysisType);
  if (validationError) {
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: `[invalid_report_contract] ${validationError}`,
        },
      ],
    };
  }

  const updated = await submitAiReport(normalizedReport);
  if (!updated) {
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: "[no_active_scan] ToraSEO has no active bridge scan that can accept an AI report.",
        },
      ],
    };
  }

  logInternalProvenance(normalizedReport, updated);
  await writeWorkspaceResult(updated, "ai_report", normalizedReport);
  await writeWorkspaceResult(
    updated,
    "report_provenance",
    normalizedReport.internalProvenance,
  );

  return {
    content: [
      {
        type: "text",
        text:
          "AI report submitted to ToraSEO. The app will render this structured report as the visual result.",
      },
    ],
  };
}
