#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

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

function printHelp() {
  console.log(`ToraSEO Eval Lab: inspect one article-text report JSON.

Usage:
  npm run eval:article-text:inspect -- <report.json>
  npm run eval:article-text:inspect -- --file <report.json> [--out <report.md>]

Accepted inputs:
  - RuntimeAuditReport JSON
  - { "report": RuntimeAuditReport }
  - current-scan.json bridge state with a tool buffer
`);
}

function parseArgs(argv) {
  const args = { file: null, out: null, help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = () => {
      index += 1;
      if (index >= argv.length) throw new Error(`Missing value for ${arg}`);
      return argv[index];
    };
    if (arg === "--file") args.file = next();
    else if (arg === "--out") args.out = next();
    else if (arg === "--help" || arg === "-h") args.help = true;
    else if (!arg.startsWith("--") && !args.file) args.file = arg;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

async function readJson(filePath) {
  let raw;
  try {
    raw = await readFile(filePath, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") {
      throw new Error(`File does not exist: ${path.resolve(filePath)}`);
    }
    throw error;
  }
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`Invalid JSON in ${filePath}: ${error.message}`);
  }
}

function isObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeInput(value, label) {
  if (isRuntimeReport(value)) return { kind: "runtime_report", report: value };
  if (isRuntimeReport(value?.report)) return { kind: "wrapped_report", report: value.report };
  if (isRuntimeReport(value?.runtimeReport)) return { kind: "wrapped_runtime_report", report: value.runtimeReport };
  if (isBridgeState(value)) return { kind: "bridge_state", report: bridgeStateToReport(value, label) };
  throw new Error("JSON is not a RuntimeAuditReport, wrapped report, or bridge current-scan state.");
}

function isRuntimeReport(value) {
  return isObject(value) && Array.isArray(value.confirmedFacts) && typeof value.summary === "string";
}

function isBridgeState(value) {
  return isObject(value) && isObject(value.buffer) && Array.isArray(value.selectedTools);
}

function bridgeStateToReport(state, label) {
  const entries = Object.entries(state.buffer ?? {});
  const confirmedFacts = entries
    .filter(([, entry]) => entry?.status === "complete")
    .map(([toolId, entry]) => {
      const data = isObject(entry.data) ? entry.data : {};
      return {
        title: firstString(data.title, data.label, data.name, TOOL_LABELS[toolId], toolId),
        detail: firstString(data.detail, data.summary, data.finding, data.message, data.recommendation, safeJson(data)),
        priority: entry.verdict === "critical" ? "high" : entry.verdict === "warning" ? "medium" : "low",
        sourceToolIds: [toolId],
      };
    });
  return {
    mode: "strict_audit",
    providerId: "local",
    model: `${label}-bridge-state`,
    generatedAt: state.finishedAt ?? state.createdAt ?? "",
    summary: `Bridge state: ${entries.length}/${state.selectedTools.length} tool entries.`,
    nextStep: state.error?.message ?? "",
    confirmedFacts,
    expertHypotheses: [],
    articleText: {
      verdict: state.error ? "high_risk" : "needs_revision",
      verdictLabel: state.error ? "Bridge state error" : "Bridge state",
      verdictDetail: state.error?.message ?? "",
      coverage: {
        completed: entries.filter(([, entry]) => entry?.status === "complete" || entry?.status === "error").length,
        total: state.selectedTools.length,
        percent: state.selectedTools.length
          ? Math.round((entries.length / state.selectedTools.length) * 100)
          : 0,
      },
      platform: { key: state.input?.textPlatform ?? "", label: state.input?.textPlatform ?? "", detail: "" },
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
      priorities: confirmedFacts.map((fact) => ({
        title: fact.title,
        detail: fact.detail,
        priority: fact.priority,
        sourceToolIds: fact.sourceToolIds,
      })),
      metrics: [],
      warningCount: entries.filter(([, entry]) => entry?.verdict === "warning").length,
      strengths: [],
      weaknesses: [],
      nextActions: [],
    },
  };
}

function firstString(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function safeJson(value) {
  try {
    return JSON.stringify(value).slice(0, 500);
  } catch {
    return "";
  }
}

function truncate(value, max = 180) {
  const clean = String(value ?? "").replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

function sourceLabel(sourceToolIds) {
  const ids = sourceToolIds ?? [];
  if (!ids.length) return "unknown";
  return ids.map((id) => TOOL_LABELS[id] ?? id).join(", ");
}

function markdownTable(headers, rows) {
  const divider = headers.map(() => "---");
  return [headers, divider, ...rows].map((row) => `| ${row.join(" | ")} |`).join("\n");
}

function renderMarkdown(input, filePath) {
  const report = input.report;
  const article = report.articleText;
  const lines = [];
  lines.push("# ToraSEO Eval Lab - Report Inspector");
  lines.push("");
  lines.push(`File: \`${path.resolve(filePath)}\``);
  lines.push(`Input shape: \`${input.kind}\``);
  lines.push(`Provider/model: \`${report.providerId ?? "unknown"} / ${report.model ?? "unknown"}\``);
  lines.push(`Mode: \`${report.mode ?? "unknown"}\``);
  if (report.generatedAt) lines.push(`Generated: \`${report.generatedAt}\``);
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push(report.summary || "No summary.");
  if (report.nextStep) {
    lines.push("");
    lines.push(`Next step: ${report.nextStep}`);
  }
  lines.push("");
  lines.push("## Article Contract");
  lines.push("");
  if (article) {
    lines.push(
      markdownTable(
        ["Field", "Value"],
        [
          ["Verdict", `${article.verdictLabel ?? article.verdict ?? "n/a"}`],
          ["Coverage", `${article.coverage?.completed ?? "?"}/${article.coverage?.total ?? "?"} (${article.coverage?.percent ?? "?"}%)`],
          ["Platform", `${article.platform?.label ?? article.platform?.key ?? "n/a"}`],
          ["Document", `${article.document?.wordCount ?? "?"} words, ${article.document?.paragraphCount ?? "?"} paragraphs`],
          ["Priorities", String(article.priorities?.length ?? 0)],
          ["Dimensions", String(article.dimensions?.length ?? 0)],
          ["Metrics", String(article.metrics?.length ?? 0)],
          ["Strengths", String(article.strengths?.length ?? 0)],
          ["Weaknesses", String(article.weaknesses?.length ?? 0)],
          ["Intent forecast", article.intentForecast ? "yes" : "no"],
        ],
      ),
    );
  } else {
    lines.push("No `articleText` block found.");
  }
  lines.push("");
  lines.push("## Metrics");
  lines.push("");
  if (article?.metrics?.length) {
    lines.push(
      markdownTable(
        ["Metric", "Value", "Tone", "Description"],
        article.metrics.map((metric) => [
          metric.label ?? metric.id,
          `${metric.value ?? "n/a"}${metric.suffix ?? ""}`,
          metric.tone ?? "",
          truncate(metric.description, 120),
        ]),
      ),
    );
  } else {
    lines.push("No metrics.");
  }
  lines.push("");
  lines.push("## Priorities");
  lines.push("");
  if (article?.priorities?.length) {
    lines.push(
      markdownTable(
        ["Priority", "Tool", "Title", "Detail"],
        article.priorities.map((item) => [
          item.priority ?? "",
          sourceLabel(item.sourceToolIds),
          truncate(item.title, 80),
          truncate(item.detail, 160),
        ]),
      ),
    );
  } else {
    lines.push("No priorities.");
  }
  lines.push("");
  lines.push("## Tool Evidence");
  lines.push("");
  if (report.confirmedFacts?.length) {
    lines.push(
      markdownTable(
        ["Priority", "Tool", "Title", "Detail"],
        report.confirmedFacts.map((fact) => [
          fact.priority ?? "",
          sourceLabel(fact.sourceToolIds),
          truncate(fact.title, 80),
          truncate(fact.detail, 160),
        ]),
      ),
    );
  } else {
    lines.push("No confirmed facts.");
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }
  if (!args.file) {
    printHelp();
    throw new Error("Report JSON path is required.");
  }

  const input = normalizeInput(await readJson(args.file), "report");
  const output = renderMarkdown(input, args.file);

  if (args.out) {
    const outPath = path.resolve(args.out);
    await mkdir(path.dirname(outPath), { recursive: true });
    await writeFile(outPath, output, "utf8");
    console.log(`Eval Lab inspection saved: ${outPath}`);
  } else {
    process.stdout.write(output);
  }
}

main().catch((error) => {
  console.error(`Eval Lab error: ${error.message}`);
  process.exitCode = 1;
});
