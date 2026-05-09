#!/usr/bin/env node

import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const ARTICLE_TEXT_TOOL_IDS = [
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
  "logic_consistency_check",
  "fact_distortion_check",
  "ai_hallucination_check",
  "intent_seo_forecast",
  "safety_science_review",
];

const TOOL_LABELS = {
  detect_text_platform: "Text platform",
  analyze_text_structure: "Text structure",
  analyze_text_style: "Text style",
  analyze_tone_fit: "Tone fit",
  language_audience_fit: "Language and audience",
  media_placeholder_review: "Media placement",
  article_uniqueness: "Article uniqueness",
  language_syntax: "Language syntax",
  ai_writing_probability: "AI writing probability",
  naturalness_indicators: "Naturalness",
  logic_consistency_check: "Logic consistency",
  fact_distortion_check: "Fact distortion",
  ai_hallucination_check: "AI hallucination check",
  intent_seo_forecast: "Intent and SEO",
  safety_science_review: "Safety and expert review",
};

const SIGNAL_KEYWORDS = {
  health_risk: ["health", "medical", "diabetes", "hypoglycemia", "insulin", "glucagon"],
  medical_risk: ["health", "medical", "diabetes", "hypoglycemia", "insulin", "glucagon"],
  fact_check_required: ["source", "fact", "expert", "verify", "citation"],
  missing_sources: ["source", "citation", "reference"],
  service_elements_in_body: ["download pdf", "part 1", "part 2", "service", "boilerplate", "pdf"],
  partial_intent_match: ["intent", "broad", "mixed", "unfocused", "unclear"],
  broad_intent: ["intent", "broad", "mixed", "unfocused", "unclear"],
  repetition: ["repetition", "duplicate", "repeated", "same idea"],
  ai_like_generic_text: ["ai", "template", "generic", "mechanical", "pattern"],
  long_blocks: ["long", "overloaded", "paragraph", "block"],
  categorical_medical_advice: ["categorical", "must", "should", "recommend", "medical"],
};

function printHelp() {
  console.log(`ToraSEO Eval Lab: compare MCP and API article-text reports.

Usage:
  npm run eval:article-text:compare -- --mcp <mcp.json> --api <api.json> [options]

Options:
  --case <case.json>          Optional private eval case with expected tools/signals.
  --out <report.md|json>      Save comparison report. Markdown by default.
  --format markdown|json      Output format. Default: markdown.
  --metric-delta <number>     Max allowed score delta. Default: case value or 15.
  --no-fail-exit             Always exit with code 0, even when verdict is FAIL.
  --help                     Show this help.

Accepted inputs:
  - RuntimeAuditReport JSON
  - { "report": RuntimeAuditReport }
  - current-scan.json bridge state with a tool buffer
`);
}

function parseArgs(argv) {
  const args = {
    mcp: null,
    api: null,
    casePath: null,
    out: null,
    format: "markdown",
    metricDelta: null,
    noFailExit: false,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = () => {
      index += 1;
      if (index >= argv.length) throw new Error(`Missing value for ${arg}`);
      return argv[index];
    };

    if (arg === "--mcp") args.mcp = next();
    else if (arg === "--api") args.api = next();
    else if (arg === "--case") args.casePath = next();
    else if (arg === "--out") args.out = next();
    else if (arg === "--format") args.format = next();
    else if (arg === "--metric-delta") args.metricDelta = Number(next());
    else if (arg === "--no-fail-exit") args.noFailExit = true;
    else if (arg === "--help" || arg === "-h") args.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }

  if (!["markdown", "json"].includes(args.format)) {
    throw new Error("--format must be markdown or json");
  }
  if (args.metricDelta !== null && !Number.isFinite(args.metricDelta)) {
    throw new Error("--metric-delta must be a number");
  }
  return args;
}

async function readJson(filePath) {
  let raw;
  try {
    raw = await readFile(filePath, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") {
      throw new Error(await missingFileMessage(filePath));
    }
    throw error;
  }
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`Invalid JSON in ${filePath}: ${error.message}`);
  }
}

async function missingFileMessage(filePath) {
  const resolved = path.resolve(filePath);
  const directory = path.dirname(resolved);
  let available = [];
  try {
    available = (await readdir(directory))
      .filter((entry) => entry.toLowerCase().endsWith(".json"))
      .sort();
  } catch {
    available = [];
  }

  const hints = [
    `Input file does not exist: ${resolved}`,
    "",
    "Export completed MCP/API article-text reports first, or use the smoke files:",
    "  npm run eval:article-text:compare -- --mcp private/eval-lab/runs/_smoke_mcp.article_text.json --api private/eval-lab/runs/_smoke_api.article_text.json --case private/eval-lab/cases/article_text/_smoke.case.json --out private/eval-lab/reports/_smoke.compare.md --no-fail-exit",
  ];

  if (available.length) {
    hints.push("", `JSON files currently available in ${directory}:`);
    for (const entry of available) hints.push(`  - ${entry}`);
  }

  return hints.join("\n");
}

function isObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function looksLikeRuntimeReport(value) {
  return (
    isObject(value) &&
    Array.isArray(value.confirmedFacts) &&
    typeof value.summary === "string"
  );
}

function looksLikeBridgeState(value) {
  return isObject(value) && isObject(value.buffer) && Array.isArray(value.selectedTools);
}

function normalizeInput(value, label) {
  if (looksLikeRuntimeReport(value)) {
    return { kind: "runtime_report", report: value, selectedTools: null };
  }
  if (looksLikeRuntimeReport(value?.report)) {
    return { kind: "wrapped_report", report: value.report, selectedTools: null };
  }
  if (looksLikeRuntimeReport(value?.runtimeReport)) {
    return { kind: "wrapped_runtime_report", report: value.runtimeReport, selectedTools: null };
  }
  if (looksLikeBridgeState(value)) {
    return {
      kind: "bridge_state",
      report: runtimeReportFromBridgeState(value, label),
      selectedTools: value.selectedTools,
    };
  }
  throw new Error(`${label} input is not a RuntimeAuditReport or bridge current-scan state.`);
}

function runtimeReportFromBridgeState(state, label) {
  const selectedTools = state.selectedTools ?? [];
  const completeEntries = Object.entries(state.buffer ?? {}).filter(([, entry]) => entry?.status === "complete");
  const confirmedFacts = completeEntries.map(([toolId, entry]) => {
    const data = isObject(entry.data) ? entry.data : {};
    const title = firstString(data.title, data.label, data.name, TOOL_LABELS[toolId], toolId);
    const detail = firstString(
      data.detail,
      data.summary,
      data.finding,
      data.message,
      data.recommendation,
      safeJsonSlice(data),
      "Tool completed.",
    );
    return {
      title,
      detail,
      priority: priorityFromVerdict(entry.verdict),
      sourceToolIds: [toolId],
    };
  });

  const coverage = {
    completed: completeEntries.length,
    total: selectedTools.length,
    percent: selectedTools.length ? Math.round((completeEntries.length / selectedTools.length) * 100) : 0,
  };

  return {
    mode: "strict_audit",
    providerId: "local",
    model: `${label}-bridge-state`,
    generatedAt: state.finishedAt ?? state.createdAt ?? new Date().toISOString(),
    summary: `Bridge state converted for Eval Lab comparison (${coverage.completed}/${coverage.total}).`,
    nextStep: state.error?.message ?? "",
    confirmedFacts,
    expertHypotheses: [],
    articleText: {
      verdict: state.error ? "high_risk" : "needs_revision",
      verdictLabel: state.error ? "Bridge state has an error" : "Bridge state converted",
      verdictDetail: state.error?.message ?? "Converted from current-scan.json; article report summary may be partial.",
      coverage,
      platform: {
        key: state.input?.textPlatform ?? "unknown",
        label: state.input?.textPlatform ?? "Unknown",
        detail: "",
      },
      document: {
        title: state.input?.topic ?? "",
        titleNote: null,
        text: state.input?.text ?? "",
        wordCount: null,
        paragraphCount: null,
      },
      annotationStatus: "",
      annotations: [],
      dimensions: [],
      priorities: confirmedFacts
        .filter((fact) => fact.priority !== "low")
        .map((fact) => ({
          title: fact.title,
          detail: fact.detail,
          priority: fact.priority,
          sourceToolIds: fact.sourceToolIds,
        })),
      metrics: [],
      warningCount: completeEntries.filter(([, entry]) => entry.verdict === "warning").length,
      strengths: [],
      weaknesses: [],
      nextActions: [],
    },
  };
}

function priorityFromVerdict(verdict) {
  if (verdict === "critical") return "high";
  if (verdict === "warning") return "medium";
  return "low";
}

function firstString(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function safeJsonSlice(value) {
  try {
    return JSON.stringify(value).slice(0, 700);
  } catch {
    return "";
  }
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function toolIdsFromSourceIds(sourceToolIds) {
  return (sourceToolIds ?? []).filter((id) => ARTICLE_TEXT_TOOL_IDS.includes(id));
}

function collectToolIds(report, selectedTools) {
  const ids = [];
  if (Array.isArray(selectedTools)) ids.push(...selectedTools);
  for (const fact of report.confirmedFacts ?? []) ids.push(...toolIdsFromSourceIds(fact.sourceToolIds));
  const article = report.articleText;
  for (const collection of [
    article?.annotations,
    article?.dimensions,
    article?.priorities,
    article?.strengths,
    article?.weaknesses,
  ]) {
    for (const item of collection ?? []) ids.push(...toolIdsFromSourceIds(item.sourceToolIds));
  }
  return unique(ids);
}

function metricMap(report) {
  const map = new Map();
  for (const metric of report.articleText?.metrics ?? []) {
    if (metric?.id) map.set(metric.id, metric);
  }
  return map;
}

function collectText(value, parts = []) {
  if (typeof value === "string") {
    parts.push(value);
  } else if (Array.isArray(value)) {
    for (const item of value) collectText(item, parts);
  } else if (isObject(value)) {
    for (const item of Object.values(value)) collectText(item, parts);
  }
  return parts;
}

function normalizeText(value) {
  return value
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function signalKeywords(signal, customKeywords = {}) {
  if (Array.isArray(customKeywords[signal])) return customKeywords[signal];
  if (SIGNAL_KEYWORDS[signal]) return SIGNAL_KEYWORDS[signal];
  return normalizeText(signal)
    .split(" ")
    .filter((word) => word.length >= 4);
}

function hasSignal(report, signal, customKeywords = {}) {
  const text = normalizeText(collectText(report).join(" "));
  const keywords = signalKeywords(signal, customKeywords).map(normalizeText).filter(Boolean);
  if (keywords.length === 0) return false;
  return keywords.some((keyword) => text.includes(keyword));
}

function sectionStatus(report) {
  const article = report.articleText;
  return {
    articleText: Boolean(article),
    confirmedFacts: (report.confirmedFacts ?? []).length > 0,
    priorities: (article?.priorities ?? []).length > 0,
    dimensions: (article?.dimensions ?? []).length > 0,
    metrics: (article?.metrics ?? []).length > 0,
    strengths: (article?.strengths ?? []).length > 0,
    weaknesses: (article?.weaknesses ?? []).length > 0,
    intentForecast: Boolean(article?.intentForecast),
  };
}

function compareReports({ mcp, api, evalCase, metricDelta }) {
  const baselineTools =
    evalCase?.expectedTools ??
    evalCase?.expected?.requiredTools ??
    evalCase?.expected?.selectedTools ??
    collectToolIds(mcp.report, mcp.selectedTools);
  const expectedTools = unique(baselineTools.filter((toolId) => ARTICLE_TEXT_TOOL_IDS.includes(toolId)));
  const mcpTools = collectToolIds(mcp.report, mcp.selectedTools);
  const apiTools = collectToolIds(api.report, api.selectedTools);
  const missingInApi = expectedTools.filter((toolId) => !apiTools.includes(toolId));
  const missingInMcp = expectedTools.filter((toolId) => !mcpTools.includes(toolId));

  const maxMetricDelta = metricDelta ?? evalCase?.thresholds?.metricMaxDelta ?? 15;
  const mcpMetrics = metricMap(mcp.report);
  const apiMetrics = metricMap(api.report);
  const metricComparisons = [];
  for (const metricId of unique([...mcpMetrics.keys(), ...apiMetrics.keys()])) {
    const left = mcpMetrics.get(metricId)?.value;
    const right = apiMetrics.get(metricId)?.value;
    const delta =
      typeof left === "number" && typeof right === "number" ? Math.abs(left - right) : null;
    metricComparisons.push({
      id: metricId,
      mcp: left ?? null,
      api: right ?? null,
      delta,
      ok: delta === null ? false : delta <= maxMetricDelta,
    });
  }

  const requiredSignals = evalCase?.expected?.mustDetect ?? [];
  const forbiddenSignals = evalCase?.expected?.mustNotDetect ?? [];
  const requiredRecommendationThemes = evalCase?.expected?.requiredRecommendationThemes ?? [];
  const customSignalKeywords = evalCase?.expected?.signalKeywords ?? {};
  const signalChecks = requiredSignals.map((signal) => ({
    signal,
    mcp: hasSignal(mcp.report, signal, customSignalKeywords),
    api: hasSignal(api.report, signal, customSignalKeywords),
  }));
  const forbiddenChecks = forbiddenSignals.map((signal) => ({
    signal,
    mcp: hasSignal(mcp.report, signal, customSignalKeywords),
    api: hasSignal(api.report, signal, customSignalKeywords),
  }));
  const recommendationChecks = requiredRecommendationThemes.map((theme) => ({
    theme,
    mcp: hasSignal(mcp.report, theme, customSignalKeywords),
    api: hasSignal(api.report, theme, customSignalKeywords),
  }));

  const mcpSections = sectionStatus(mcp.report);
  const apiSections = sectionStatus(api.report);
  const missingApiSections = Object.entries(mcpSections)
    .filter(([, present]) => present)
    .filter(([section]) => !apiSections[section])
    .map(([section]) => section);

  const mcpPriorityToolIds = unique(
    (mcp.report.articleText?.priorities ?? [])
      .filter((item) => item.priority === "high" || item.priority === "medium")
      .flatMap((item) => toolIdsFromSourceIds(item.sourceToolIds)),
  );
  const apiPriorityToolIds = unique(
    (api.report.articleText?.priorities ?? [])
      .filter((item) => item.priority === "high" || item.priority === "medium")
      .flatMap((item) => toolIdsFromSourceIds(item.sourceToolIds)),
  );
  const missingPriorityTools = mcpPriorityToolIds.filter((toolId) => !apiPriorityToolIds.includes(toolId));

  const failures = [];
  const warnings = [];

  if (!mcp.report.articleText) failures.push("MCP report has no articleText summary.");
  if (!api.report.articleText) failures.push("API report has no articleText summary.");
  if (missingInApi.length) failures.push(`API is missing ${missingInApi.length} expected tool result(s).`);
  if (missingInMcp.length) warnings.push(`MCP baseline is missing ${missingInMcp.length} expected tool result(s).`);
  if (missingApiSections.length) failures.push(`API is missing report section(s): ${missingApiSections.join(", ")}.`);
  for (const check of signalChecks) {
    if (check.mcp && !check.api) failures.push(`API missed required baseline signal: ${check.signal}.`);
    if (!check.mcp && !check.api) warnings.push(`Required signal not found in either report: ${check.signal}.`);
  }
  for (const check of forbiddenChecks) {
    if (check.api) failures.push(`API contains forbidden signal: ${check.signal}.`);
  }
  for (const check of recommendationChecks) {
    if (check.mcp && !check.api) warnings.push(`API missed recommendation theme: ${check.theme}.`);
  }
  for (const metric of metricComparisons) {
    if (metric.delta !== null && metric.delta > maxMetricDelta) {
      warnings.push(`Metric delta is high for ${metric.id}: ${metric.delta}.`);
    }
  }
  if (missingPriorityTools.length) {
    warnings.push(`API priorities do not cover MCP priority tool(s): ${missingPriorityTools.join(", ")}.`);
  }

  return {
    verdict: failures.length ? "FAIL" : warnings.length ? "WARN" : "PASS",
    generatedAt: new Date().toISOString(),
    caseId: evalCase?.id ?? null,
    thresholds: { metricMaxDelta: maxMetricDelta },
    coverage: {
      expectedTools,
      mcpTools,
      apiTools,
      missingInApi,
      missingInMcp,
      mcpArticleCoverage: mcp.report.articleText?.coverage ?? null,
      apiArticleCoverage: api.report.articleText?.coverage ?? null,
    },
    sections: {
      mcp: mcpSections,
      api: apiSections,
      missingInApi: missingApiSections,
    },
    metrics: metricComparisons,
    requiredSignals: signalChecks,
    forbiddenSignals: forbiddenChecks,
    recommendationThemes: recommendationChecks,
    priorityToolCoverage: {
      mcp: mcpPriorityToolIds,
      api: apiPriorityToolIds,
      missingInApi: missingPriorityTools,
    },
    failures,
    warnings,
  };
}

function markdownTable(headers, rows) {
  const divider = headers.map(() => "---");
  const allRows = [headers, divider, ...rows];
  return allRows.map((row) => `| ${row.join(" | ")} |`).join("\n");
}

function boolMark(value) {
  return value ? "yes" : "no";
}

function toolList(ids) {
  if (!ids.length) return "none";
  return ids.map((id) => `${TOOL_LABELS[id] ?? id} (${id})`).join(", ");
}

function renderMarkdown(result) {
  const lines = [];
  lines.push("# ToraSEO Eval Lab - Article Text MCP/API Comparison");
  lines.push("");
  lines.push(`Verdict: **${result.verdict}**`);
  if (result.caseId) lines.push(`Case: \`${result.caseId}\``);
  lines.push(`Generated: \`${result.generatedAt}\``);
  lines.push("");
  lines.push("## Coverage");
  lines.push("");
  lines.push(
    markdownTable(
      ["Area", "MCP", "API", "Notes"],
      [
        [
          "Tool results",
          String(result.coverage.mcpTools.length),
          String(result.coverage.apiTools.length),
          result.coverage.missingInApi.length
            ? `Missing in API: ${toolList(result.coverage.missingInApi)}`
            : "API covers expected tools",
        ],
        [
          "Article coverage",
          coverageText(result.coverage.mcpArticleCoverage),
          coverageText(result.coverage.apiArticleCoverage),
          "",
        ],
      ],
    ),
  );
  lines.push("");
  lines.push("## Sections");
  lines.push("");
  lines.push(
    markdownTable(
      ["Section", "MCP", "API"],
      Object.keys(result.sections.mcp).map((section) => [
        section,
        boolMark(result.sections.mcp[section]),
        boolMark(result.sections.api[section]),
      ]),
    ),
  );
  lines.push("");
  lines.push("## Metrics");
  lines.push("");
  if (result.metrics.length) {
    lines.push(
      markdownTable(
        ["Metric", "MCP", "API", "Delta", "OK"],
        result.metrics.map((metric) => [
          metric.id,
          valueText(metric.mcp),
          valueText(metric.api),
          valueText(metric.delta),
          boolMark(metric.ok),
        ]),
      ),
    );
  } else {
    lines.push("No comparable metrics found.");
  }
  lines.push("");
  lines.push("## Required Signals");
  lines.push("");
  if (result.requiredSignals.length) {
    lines.push(
      markdownTable(
        ["Signal", "MCP", "API"],
        result.requiredSignals.map((check) => [check.signal, boolMark(check.mcp), boolMark(check.api)]),
      ),
    );
  } else {
    lines.push("No required signals configured.");
  }
  lines.push("");
  if (result.failures.length) {
    lines.push("## Failures");
    lines.push("");
    for (const item of result.failures) lines.push(`- ${item}`);
    lines.push("");
  }
  if (result.warnings.length) {
    lines.push("## Warnings");
    lines.push("");
    for (const item of result.warnings) lines.push(`- ${item}`);
    lines.push("");
  }
  lines.push("## Priority Tool Coverage");
  lines.push("");
  lines.push(`MCP priority tools: ${toolList(result.priorityToolCoverage.mcp)}`);
  lines.push("");
  lines.push(`API priority tools: ${toolList(result.priorityToolCoverage.api)}`);
  if (result.priorityToolCoverage.missingInApi.length) {
    lines.push("");
    lines.push(`Missing in API priorities: ${toolList(result.priorityToolCoverage.missingInApi)}`);
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
}

function coverageText(coverage) {
  if (!coverage) return "n/a";
  return `${coverage.completed ?? "?"}/${coverage.total ?? "?"} (${coverage.percent ?? "?"}%)`;
}

function valueText(value) {
  return value === null || value === undefined ? "n/a" : String(value);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }
  if (!args.mcp || !args.api) {
    printHelp();
    throw new Error("--mcp and --api are required");
  }

  const [mcpJson, apiJson, evalCase] = await Promise.all([
    readJson(args.mcp),
    readJson(args.api),
    args.casePath ? readJson(args.casePath) : Promise.resolve(null),
  ]);
  const result = compareReports({
    mcp: normalizeInput(mcpJson, "MCP"),
    api: normalizeInput(apiJson, "API"),
    evalCase,
    metricDelta: args.metricDelta,
  });
  const output =
    args.format === "json" ? `${JSON.stringify(result, null, 2)}\n` : renderMarkdown(result);

  if (args.out) {
    const outPath = path.resolve(args.out);
    await mkdir(path.dirname(outPath), { recursive: true });
    await writeFile(outPath, output, "utf8");
    console.log(`Eval Lab comparison saved: ${outPath}`);
    console.log(`Verdict: ${result.verdict}`);
    if (result.failures.length) {
      console.log(`Failures: ${result.failures.length}`);
      for (const item of result.failures.slice(0, 3)) console.log(`- ${item}`);
    }
    if (result.warnings.length) {
      console.log(`Warnings: ${result.warnings.length}`);
    }
  } else {
    process.stdout.write(output);
  }

  if (result.verdict === "FAIL" && !args.noFailExit) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(`Eval Lab error: ${error.message}`);
  process.exitCode = 1;
});
