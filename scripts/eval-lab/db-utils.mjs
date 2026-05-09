import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

export const DEFAULT_DB_PATH = "private/eval-lab/toraseo-eval.sqlite";
export const DEFAULT_SCHEMA_PATH = "qa/eval-lab/schema.sql";

export function parseArgs(argv = process.argv.slice(2)) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i];
    if (!item.startsWith("--")) {
      args._ ??= [];
      args._.push(item);
      continue;
    }
    const key = item.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      args[key] = true;
      continue;
    }
    args[key] = next;
    i += 1;
  }
  return args;
}

export function repoPath(input) {
  return path.resolve(process.cwd(), input);
}

export function ensureParentDir(filePath) {
  fs.mkdirSync(path.dirname(path.resolve(filePath)), { recursive: true });
}

export function ensureDir(dirPath) {
  fs.mkdirSync(path.resolve(dirPath), { recursive: true });
}

export function readJson(filePath) {
  const absolutePath = path.resolve(filePath);
  return JSON.parse(fs.readFileSync(absolutePath, "utf8"));
}

export function readText(filePath) {
  return fs.readFileSync(path.resolve(filePath), "utf8");
}

export function writeText(filePath, value) {
  ensureParentDir(filePath);
  fs.writeFileSync(path.resolve(filePath), value, "utf8");
}

export function openDatabase(dbPath = DEFAULT_DB_PATH) {
  ensureParentDir(dbPath);
  const db = new DatabaseSync(path.resolve(dbPath));
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec("PRAGMA busy_timeout = 5000;");
  return db;
}

export function applySchema(db, schemaPath = DEFAULT_SCHEMA_PATH) {
  db.exec(fs.readFileSync(path.resolve(schemaPath), "utf8"));
}

export function json(value) {
  return JSON.stringify(value ?? null);
}

export function basenameId(filePath) {
  return path.basename(filePath).replace(/\.(json|md|sqlite)$/i, "");
}

export function inferRunMode(filePath, report = {}) {
  const haystack = `${filePath} ${report.mode ?? ""} ${report.providerId ?? ""}`.toLowerCase();
  if (haystack.includes("mcp") || haystack.includes("bridge")) return "mcp";
  if (haystack.includes("api") || haystack.includes("openrouter") || haystack.includes("native")) return "api";
  return "manual";
}

export function inferAnalysisType(report = {}, fallback = "article_text") {
  if (report.analysisType) return report.analysisType;
  if (report.articleText) return "article_text";
  if (report.articleCompare) return "article_compare";
  if (report.siteCompare) return "site_compare";
  if (report.pageByUrl) return "page_by_url";
  if (report.siteByUrl) return "site_by_url";
  return fallback;
}

export function normalizeReport(input) {
  if (input?.report) return input.report;
  return input;
}

export function collectToolIds(report = {}) {
  const ids = new Set();
  for (const toolId of report.selectedTools ?? []) ids.add(toolId);
  for (const toolId of report.completedTools ?? []) ids.add(toolId);
  for (const fact of report.confirmedFacts ?? []) {
    for (const toolId of fact.sourceToolIds ?? []) ids.add(toolId);
  }
  for (const item of report.articleText?.priorities ?? []) {
    for (const toolId of item.sourceToolIds ?? []) ids.add(toolId);
  }
  for (const item of report.articleText?.dimensions ?? []) {
    for (const toolId of item.sourceToolIds ?? []) ids.add(toolId);
  }
  return [...ids].sort();
}

export function collectCompletedToolIds(report = {}) {
  const ids = new Set(report.completedTools ?? []);
  for (const fact of report.confirmedFacts ?? []) {
    for (const toolId of fact.sourceToolIds ?? []) ids.add(toolId);
  }
  return [...ids].sort();
}

export function extractMetrics(report = {}) {
  return report.articleText?.metrics ?? report.metrics ?? [];
}

export function countPriority(report = {}, priority) {
  return (report.confirmedFacts ?? []).filter((fact) => fact.priority === priority).length;
}

export function nowIso() {
  return new Date().toISOString();
}

export function runQuery(db, sql, params = {}) {
  return db.prepare(sql).all(params);
}

export function tableExists(db, name) {
  return (
    db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
      .get(name) !== undefined
  );
}
