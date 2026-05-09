#!/usr/bin/env node
import path from "node:path";
import {
  DEFAULT_DB_PATH,
  applySchema,
  basenameId,
  collectCompletedToolIds,
  collectToolIds,
  countPriority,
  extractMetrics,
  inferAnalysisType,
  inferRunMode,
  json,
  normalizeReport,
  openDatabase,
  parseArgs,
  readJson,
  readText,
} from "./db-utils.mjs";

const args = parseArgs();
const dbPath = String(args.db ?? DEFAULT_DB_PATH);
const db = openDatabase(dbPath);
applySchema(db);

let imported = 0;

if (args.case) {
  importCase(String(args.case));
  imported += 1;
}

if (args.run) {
  importRun(String(args.run), {
    caseId: args.caseId ? String(args.caseId) : null,
    mode: args.mode ? String(args.mode) : null,
    runId: args.runId ? String(args.runId) : null,
  });
  imported += 1;
}

if (args.comparison) {
  importComparison(String(args.comparison), {
    caseId: args.caseId ? String(args.caseId) : null,
    mcpRunId: args.mcpRun ? String(args.mcpRun) : null,
    apiRunId: args.apiRun ? String(args.apiRun) : null,
    comparisonId: args.comparisonId ? String(args.comparisonId) : null,
  });
  imported += 1;
}

db.close();

if (imported === 0) {
  console.error("Nothing to import. Use --case, --run, or --comparison.");
  process.exit(1);
}

console.log(`Imported ${imported} item(s) into ${dbPath}`);

function importCase(filePath) {
  const source = readJson(filePath);
  const id = String(source.id ?? basenameId(filePath));
  const name = String(source.name ?? source.id ?? basenameId(filePath));
  const analysisType = String(source.analysisType ?? "article_text");
  const inputMeta = {
    input: source.input ?? null,
    thresholds: source.thresholds ?? null,
    expectedTools: source.expectedTools ?? [],
  };

  db.prepare(
    `INSERT INTO eval_cases (
      id, analysis_type, name, status, source_path, target_query, platform,
      notes, expected_json, input_meta_json, updated_at
    ) VALUES (
      @id, @analysis_type, @name, @status, @source_path, @target_query,
      @platform, @notes, @expected_json, @input_meta_json, datetime('now')
    )
    ON CONFLICT(id) DO UPDATE SET
      analysis_type = excluded.analysis_type,
      name = excluded.name,
      status = excluded.status,
      source_path = excluded.source_path,
      target_query = excluded.target_query,
      platform = excluded.platform,
      notes = excluded.notes,
      expected_json = excluded.expected_json,
      input_meta_json = excluded.input_meta_json,
      updated_at = datetime('now')`,
  ).run({
    id,
    analysis_type: analysisType,
    name,
    status: String(source.status ?? "active"),
    source_path: path.normalize(filePath),
    target_query: source.targetQuery ?? source.input?.targetQuery ?? null,
    platform: source.platform ?? source.input?.platform ?? null,
    notes: source.notes ?? null,
    expected_json: json(source.expected ?? {}),
    input_meta_json: json(inputMeta),
  });
}

function importRun(filePath, options) {
  const raw = readJson(filePath);
  const report = normalizeReport(raw);
  const id = options.runId ?? String(report.runId ?? basenameId(filePath));
  const analysisType = inferAnalysisType(report);
  const mode = options.mode ?? inferRunMode(filePath, report);
  const selectedTools = collectToolIds(report);
  const completedTools = collectCompletedToolIds(report);
  const metrics = extractMetrics(report);
  const articleText = report.articleText ?? {};

  db.prepare(
    `INSERT INTO eval_runs (
      id, case_id, analysis_type, mode, provider_id, model, prompt_version,
      schema_version, app_version, source_path, summary, next_step,
      generated_at, latency_ms, estimated_cost, selected_tools_json,
      completed_tools_json, report_json, warning_count, critical_count,
      status, imported_at
    ) VALUES (
      @id, @case_id, @analysis_type, @mode, @provider_id, @model,
      @prompt_version, @schema_version, @app_version, @source_path,
      @summary, @next_step, @generated_at, @latency_ms, @estimated_cost,
      @selected_tools_json, @completed_tools_json, @report_json,
      @warning_count, @critical_count, @status, datetime('now')
    )
    ON CONFLICT(id) DO UPDATE SET
      case_id = excluded.case_id,
      analysis_type = excluded.analysis_type,
      mode = excluded.mode,
      provider_id = excluded.provider_id,
      model = excluded.model,
      prompt_version = excluded.prompt_version,
      schema_version = excluded.schema_version,
      app_version = excluded.app_version,
      source_path = excluded.source_path,
      summary = excluded.summary,
      next_step = excluded.next_step,
      generated_at = excluded.generated_at,
      latency_ms = excluded.latency_ms,
      estimated_cost = excluded.estimated_cost,
      selected_tools_json = excluded.selected_tools_json,
      completed_tools_json = excluded.completed_tools_json,
      report_json = excluded.report_json,
      warning_count = excluded.warning_count,
      critical_count = excluded.critical_count,
      status = excluded.status,
      imported_at = datetime('now')`,
  ).run({
    id,
    case_id: options.caseId,
    analysis_type: analysisType,
    mode,
    provider_id: report.providerId ?? null,
    model: report.model ?? null,
    prompt_version: report.promptVersion ?? null,
    schema_version: report.schemaVersion ?? null,
    app_version: report.appVersion ?? null,
    source_path: path.normalize(filePath),
    summary: report.summary ?? null,
    next_step: report.nextStep ?? null,
    generated_at: report.generatedAt ?? null,
    latency_ms: report.latencyMs ?? null,
    estimated_cost: report.estimatedCost ?? null,
    selected_tools_json: json(selectedTools),
    completed_tools_json: json(completedTools),
    report_json: json(report),
    warning_count: Number(articleText.warningCount ?? countPriority(report, "medium") ?? 0),
    critical_count: Number(articleText.criticalCount ?? countPriority(report, "high") ?? 0),
    status: "imported",
  });

  db.prepare("DELETE FROM eval_run_metrics WHERE run_id = ?").run(id);
  const insertMetric = db.prepare(
    `INSERT INTO eval_run_metrics (
      run_id, metric_id, label, value, suffix, tone, description, raw_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  for (const metric of metrics) {
    insertMetric.run(
      id,
      String(metric.id ?? metric.label ?? "metric"),
      String(metric.label ?? metric.id ?? "Metric"),
      typeof metric.value === "number" ? metric.value : null,
      metric.suffix ?? null,
      metric.tone ?? null,
      metric.description ?? null,
      json(metric),
    );
  }
}

function importComparison(filePath, options) {
  const markdown = readText(filePath);
  const id = options.comparisonId ?? basenameId(filePath);
  const verdict = markdown.match(/Verdict:\s+\*\*([^*]+)\*\*/i)?.[1]?.trim() ?? "unknown";
  const caseId = options.caseId ?? markdown.match(/Case:\s+`([^`]+)`/i)?.[1]?.trim() ?? null;
  const generatedAt = markdown.match(/Generated:\s+`([^`]+)`/i)?.[1]?.trim() ?? null;

  db.prepare(
    `INSERT INTO eval_comparisons (
      id, case_id, mcp_run_id, api_run_id, verdict, source_path,
      report_markdown, generated_at, failures_json, warnings_json,
      metric_delta_json, imported_at
    ) VALUES (
      @id, @case_id, @mcp_run_id, @api_run_id, @verdict, @source_path,
      @report_markdown, @generated_at, @failures_json, @warnings_json,
      @metric_delta_json, datetime('now')
    )
    ON CONFLICT(id) DO UPDATE SET
      case_id = excluded.case_id,
      mcp_run_id = excluded.mcp_run_id,
      api_run_id = excluded.api_run_id,
      verdict = excluded.verdict,
      source_path = excluded.source_path,
      report_markdown = excluded.report_markdown,
      generated_at = excluded.generated_at,
      failures_json = excluded.failures_json,
      warnings_json = excluded.warnings_json,
      metric_delta_json = excluded.metric_delta_json,
      imported_at = datetime('now')`,
  ).run({
    id,
    case_id: caseId,
    mcp_run_id: options.mcpRunId,
    api_run_id: options.apiRunId,
    verdict,
    source_path: path.normalize(filePath),
    report_markdown: markdown,
    generated_at: generatedAt,
    failures_json: json(extractBullets(markdown, "Failures")),
    warnings_json: json(extractBullets(markdown, "Warnings")),
    metric_delta_json: json({}),
  });
}

function extractBullets(markdown, heading) {
  const lines = markdown.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === `## ${heading}`);
  if (start === -1) return [];
  const output = [];
  for (const line of lines.slice(start + 1)) {
    if (line.startsWith("## ")) break;
    if (line.trim().startsWith("- ")) output.push(line.trim().slice(2));
  }
  return output;
}
