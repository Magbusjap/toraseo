#!/usr/bin/env node

import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const PRIVATE_LAB_DIR = path.join(ROOT, "private", "eval-lab");
const ARTICLE_CASES_DIR = path.join(PRIVATE_LAB_DIR, "cases", "article_text");
const RUNS_DIR = path.join(PRIVATE_LAB_DIR, "runs");
const REPORTS_DIR = path.join(PRIVATE_LAB_DIR, "reports");

function printHelp() {
  console.log(`ToraSEO Eval Lab dashboard.

Usage:
  npm run eval:dashboard
  npm run eval:dashboard -- --out private/eval-lab/reports/index.html

The dashboard scans private/eval-lab and writes a local HTML table with:
- article-text cases;
- matching MCP/API run files;
- comparison report status;
- obvious next step.
`);
}

function parseArgs(argv) {
  const args = {
    out: path.join(REPORTS_DIR, "index.html"),
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = () => {
      index += 1;
      if (index >= argv.length) throw new Error(`Missing value for ${arg}`);
      return argv[index];
    };

    if (arg === "--out") args.out = path.resolve(next());
    else if (arg === "--help" || arg === "-h") args.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }

  return args;
}

async function readJson(filePath) {
  const raw = await readFile(filePath, "utf8");
  return JSON.parse(raw);
}

async function safeList(dir) {
  try {
    return await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

function stripCaseSuffix(fileName) {
  return fileName.replace(/\.case\.json$/i, "");
}

function isJsonFile(entry) {
  return entry.isFile() && entry.name.toLowerCase().endsWith(".json");
}

function includesAll(value, parts) {
  const lowered = value.toLowerCase();
  return parts.every((part) => lowered.includes(part.toLowerCase()));
}

function findRunFile(runFiles, slug, mode) {
  const exact = `${slug}.${mode}.json`;
  const exactMatch = runFiles.find((file) => file.toLowerCase() === exact.toLowerCase());
  if (exactMatch) return exactMatch;

  return (
    runFiles.find((file) => includesAll(file, [slug, mode])) ??
    runFiles.find((file) => includesAll(file, [slug.replace(/^_/, ""), mode])) ??
    null
  );
}

function findReportFile(reportFiles, slug) {
  const exact = `${slug}.compare.md`;
  const exactMatch = reportFiles.find((file) => file.toLowerCase() === exact.toLowerCase());
  if (exactMatch) return exactMatch;

  return (
    reportFiles.find((file) => includesAll(file, [slug, "compare"])) ??
    reportFiles.find((file) => includesAll(file, [slug.replace(/^_/, ""), "compare"])) ??
    null
  );
}

function nextStep({ mcpRun, apiRun, compareReport }) {
  if (!mcpRun && !apiRun) return "Export MCP and API QA JSON";
  if (!mcpRun) return "Export MCP QA JSON";
  if (!apiRun) return "Export API QA JSON";
  if (!compareReport) return "Run comparison";
  return "Review comparison";
}

function statusClass(value) {
  return value ? "ok" : "missing";
}

function statusLabel(value) {
  return value ? "present" : "missing";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function fileLink(filePath) {
  return path.resolve(filePath).replaceAll("\\", "/");
}

function renderHtml(rows) {
  const completed = rows.filter((row) => row.mcpRun && row.apiRun && row.compareReport).length;
  const withBothRuns = rows.filter((row) => row.mcpRun && row.apiRun).length;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>ToraSEO Eval Lab</title>
  <style>
    :root {
      --bg: #f7f3ee;
      --panel: #fffaf5;
      --ink: #231f20;
      --muted: #766b63;
      --line: #eadbd0;
      --good: #098765;
      --bad: #bc4435;
      --warn: #b86b13;
      --chip: #fff0e6;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: radial-gradient(circle at top left, #fff3e9, transparent 32rem), var(--bg);
      color: var(--ink);
      font: 14px/1.45 "Segoe UI", Tahoma, sans-serif;
    }
    main {
      width: min(1180px, calc(100vw - 32px));
      margin: 28px auto 48px;
    }
    header {
      display: flex;
      gap: 18px;
      justify-content: space-between;
      align-items: flex-end;
      margin-bottom: 18px;
    }
    h1 {
      margin: 0;
      font-size: 28px;
      letter-spacing: 0;
    }
    .subtitle {
      margin: 6px 0 0;
      color: var(--muted);
    }
    .summary {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
    }
    .pill {
      border: 1px solid var(--line);
      background: var(--panel);
      border-radius: 999px;
      padding: 8px 12px;
      font-weight: 700;
      white-space: nowrap;
    }
    .panel {
      border: 1px solid var(--line);
      background: rgba(255, 250, 245, 0.88);
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 18px 45px rgba(75, 45, 24, 0.08);
    }
    table {
      width: 100%;
      border-collapse: collapse;
    }
    th, td {
      padding: 12px 14px;
      border-bottom: 1px solid var(--line);
      text-align: left;
      vertical-align: top;
    }
    th {
      background: #fff0e6;
      color: #5c4a3d;
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    tr:last-child td { border-bottom: 0; }
    .case-name {
      font-weight: 800;
      margin-bottom: 4px;
    }
    .case-id {
      color: var(--muted);
      font-family: Consolas, "Courier New", monospace;
      font-size: 12px;
    }
    .badge {
      display: inline-flex;
      align-items: center;
      min-width: 54px;
      justify-content: center;
      border-radius: 999px;
      padding: 4px 8px;
      font-weight: 800;
      font-size: 12px;
      border: 1px solid currentColor;
    }
    .ok { color: var(--good); background: #e9faf3; }
    .missing { color: var(--bad); background: #fff0ee; }
    .next {
      color: var(--warn);
      font-weight: 800;
    }
    a {
      color: #c65322;
      text-decoration: none;
      font-weight: 700;
    }
    a:hover { text-decoration: underline; }
    .empty {
      padding: 24px;
      color: var(--muted);
    }
    code {
      font-family: Consolas, "Courier New", monospace;
      font-size: 12px;
      color: #5c4a3d;
      background: var(--chip);
      padding: 2px 5px;
      border-radius: 5px;
    }
  </style>
</head>
<body>
  <main>
    <header>
      <div>
        <h1>ToraSEO Eval Lab</h1>
        <p class="subtitle">Local case table for MCP/API runs and comparison reports.</p>
      </div>
      <div class="summary">
        <div class="pill">Cases: ${rows.length}</div>
        <div class="pill">MCP+API: ${withBothRuns}</div>
        <div class="pill">Compared: ${completed}</div>
      </div>
    </header>
    <section class="panel">
      ${
        rows.length
          ? `<table>
        <thead>
          <tr>
            <th>Case</th>
            <th>MCP JSON</th>
            <th>API JSON</th>
            <th>Comparison</th>
            <th>Next step</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(renderRow).join("\n")}
        </tbody>
      </table>`
          : `<div class="empty">No cases found in <code>private/eval-lab/cases/article_text</code>.</div>`
      }
    </section>
  </main>
</body>
</html>
`;
}

function renderRow(row) {
  return `<tr>
    <td>
      <div class="case-name">${escapeHtml(row.name)}</div>
      <div class="case-id">${escapeHtml(row.slug)} · ${escapeHtml(row.id)}</div>
    </td>
    <td>${renderFileStatus(row.mcpRun, path.join(RUNS_DIR, row.mcpRun ?? ""))}</td>
    <td>${renderFileStatus(row.apiRun, path.join(RUNS_DIR, row.apiRun ?? ""))}</td>
    <td>${renderFileStatus(row.compareReport, path.join(REPORTS_DIR, row.compareReport ?? ""))}</td>
    <td class="next">${escapeHtml(row.nextStep)}</td>
  </tr>`;
}

function renderFileStatus(fileName, filePath) {
  const exists = Boolean(fileName);
  if (!exists) return `<span class="badge ${statusClass(false)}">${statusLabel(false)}</span>`;
  return `<span class="badge ${statusClass(true)}">${statusLabel(true)}</span><br><a href="file:///${fileLink(filePath)}">${escapeHtml(fileName)}</a>`;
}

async function buildRows() {
  const caseEntries = (await safeList(ARTICLE_CASES_DIR)).filter(isJsonFile);
  const runFiles = (await safeList(RUNS_DIR)).filter(isJsonFile).map((entry) => entry.name);
  const reportFiles = (await safeList(REPORTS_DIR))
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name);

  const rows = [];
  for (const entry of caseEntries.sort((left, right) => left.name.localeCompare(right.name))) {
    const slug = stripCaseSuffix(entry.name);
    const filePath = path.join(ARTICLE_CASES_DIR, entry.name);
    let testCase = {};
    try {
      testCase = await readJson(filePath);
    } catch {
      testCase = {};
    }

    const mcpRun = findRunFile(runFiles, slug, "mcp");
    const apiRun = findRunFile(runFiles, slug, "api");
    const compareReport = findReportFile(reportFiles, slug);

    rows.push({
      slug,
      id: testCase.id ?? slug,
      name: testCase.name ?? slug,
      mcpRun,
      apiRun,
      compareReport,
      nextStep: nextStep({ mcpRun, apiRun, compareReport }),
    });
  }

  return rows;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const rows = await buildRows();
  const html = renderHtml(rows);
  await mkdir(path.dirname(args.out), { recursive: true });
  await writeFile(args.out, html, "utf8");

  console.log(`Eval Lab dashboard saved: ${args.out}`);
  console.log(`Cases: ${rows.length}`);
  for (const row of rows) {
    console.log(
      `- ${row.slug}: MCP ${statusLabel(row.mcpRun)}, API ${statusLabel(row.apiRun)}, report ${statusLabel(row.compareReport)}; ${row.nextStep}`,
    );
  }
}

main().catch((error) => {
  console.error(`Eval Lab error: ${error.message}`);
  process.exitCode = 1;
});
