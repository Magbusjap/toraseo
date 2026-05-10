#!/usr/bin/env node
import {
  DEFAULT_DB_PATH,
  applySchema,
  openDatabase,
  parseArgs,
  runQuery,
  writeText,
} from "./db-utils.mjs";

const args = parseArgs();
const dbPath = String(args.db ?? DEFAULT_DB_PATH);
const outPath = String(args.out ?? "private/eval-lab/reports/sql-dashboard.html");

const db = openDatabase(dbPath);
applySchema(db);

const sections = [
  {
    id: "cases",
    title: "Cases",
    sqlTable: "eval_cases",
    description: "Golden cases and expected detections.",
    columns: columns([
      ["id", "Case ID"],
      ["analysis_type", "Analysis type"],
      ["name", "Name"],
      ["status", "Status"],
      ["target_query", "Target query"],
      ["platform", "Platform"],
      ["run_count", "Runs"],
      ["comparison_count", "Comparisons"],
      ["updated_at", "Updated"],
    ]),
    rows: runQuery(
      db,
      `SELECT
        c.id,
        c.analysis_type,
        c.name,
        c.status,
        c.target_query,
        c.platform,
        COUNT(DISTINCT r.id) AS run_count,
        COUNT(DISTINCT cp.id) AS comparison_count,
        c.updated_at
      FROM eval_cases c
      LEFT JOIN eval_runs r ON r.case_id = c.id
      LEFT JOIN eval_comparisons cp ON cp.case_id = c.id
      GROUP BY c.id
      ORDER BY c.updated_at DESC, c.id`,
    ),
  },
  {
    id: "runs",
    title: "Runs",
    sqlTable: "eval_runs",
    description: "Imported MCP, API, and manual analysis outputs.",
    columns: columns([
      ["id", "Run ID"],
      ["case_id", "Case ID"],
      ["analysis_type", "Analysis type"],
      ["mode", "Mode"],
      ["provider_id", "Provider"],
      ["model", "Model"],
      ["warning_count", "Warnings"],
      ["critical_count", "Critical"],
      ["metric_count", "Metrics"],
      ["generated_at", "Generated"],
      ["imported_at", "Imported"],
    ]),
    rows: runQuery(
      db,
      `SELECT
        r.id,
        r.case_id,
        r.analysis_type,
        r.mode,
        r.provider_id,
        r.model,
        r.warning_count,
        r.critical_count,
        r.generated_at,
        r.imported_at,
        COUNT(m.metric_id) AS metric_count
      FROM eval_runs r
      LEFT JOIN eval_run_metrics m ON m.run_id = r.id
      GROUP BY r.id
      ORDER BY r.imported_at DESC, r.id`,
    ),
  },
  {
    id: "runMetrics",
    title: "Run Metrics",
    sqlTable: "eval_run_metrics",
    description: "Metric rows extracted from saved reports.",
    columns: columns([
      ["run_id", "Run ID"],
      ["metric_id", "Metric ID"],
      ["label", "Label"],
      ["value", "Value"],
      ["suffix", "Suffix"],
      ["tone", "Tone"],
      ["description", "Description"],
    ]),
    rows: runQuery(
      db,
      `SELECT
        run_id,
        metric_id,
        label,
        value,
        suffix,
        tone,
        description
      FROM eval_run_metrics
      ORDER BY run_id, metric_id`,
    ),
  },
  {
    id: "comparisons",
    title: "Comparisons",
    sqlTable: "eval_comparisons",
    description: "MCP/API comparison reports.",
    columns: columns([
      ["id", "Comparison ID"],
      ["case_id", "Case ID"],
      ["mcp_run_id", "MCP run"],
      ["api_run_id", "API run"],
      ["verdict", "Verdict"],
      ["generated_at", "Generated"],
      ["imported_at", "Imported"],
    ]),
    rows: runQuery(
      db,
      `SELECT
        id,
        case_id,
        mcp_run_id,
        api_run_id,
        verdict,
        generated_at,
        imported_at
      FROM eval_comparisons
      ORDER BY imported_at DESC, id`,
    ),
  },
  {
    id: "metricSummary",
    title: "Metric Summary",
    sqlTable: "query from eval_run_metrics",
    description: "Aggregated view, not a physical SQL table.",
    columns: columns([
      ["metric_id", "Metric ID"],
      ["label", "Label"],
      ["samples", "Samples"],
      ["avg_value", "Average"],
      ["min_value", "Minimum"],
      ["max_value", "Maximum"],
    ]),
    rows: runQuery(
      db,
      `SELECT
        metric_id,
        label,
        COUNT(*) AS samples,
        ROUND(AVG(value), 2) AS avg_value,
        MIN(value) AS min_value,
        MAX(value) AS max_value
      FROM eval_run_metrics
      WHERE value IS NOT NULL
      GROUP BY metric_id, label
      ORDER BY metric_id`,
    ),
  },
  {
    id: "formulas",
    title: "Formula Versions",
    sqlTable: "formula_versions",
    description: "Future formula versions and public-safe metadata.",
    columns: columns([
      ["id", "Formula ID"],
      ["analysis_type", "Analysis type"],
      ["version", "Version"],
      ["status", "Status"],
      ["description", "Description"],
      ["created_at", "Created"],
      ["updated_at", "Updated"],
    ]),
    rows: runQuery(
      db,
      `SELECT
        id,
        analysis_type,
        version,
        status,
        description,
        created_at,
        updated_at
      FROM formula_versions
      ORDER BY updated_at DESC, id`,
    ),
  },
  {
    id: "formulaTestRuns",
    title: "Formula Test Runs",
    sqlTable: "formula_test_runs",
    description: "Manual formula and score checks, including repeated scans of the same text.",
    columns: columns([
      ["id", "Test ID"],
      ["case_id", "Case ID"],
      ["run_id", "Run ID"],
      ["analysis_type", "Analysis type"],
      ["same_text_group_id", "Same text group"],
      ["repeat_index", "Repeat"],
      ["provider_id", "Provider"],
      ["model", "Model"],
      ["ai_intelligence_model", "AI intelligence model"],
      ["ai_difference_percent", "AI difference %"],
      ["ai_power_label", "AI power label"],
      ["ai_power_score", "AI power score"],
      ["ai_power_source", "AI power source"],
      ["analysis_score_cgs", "Analysis score CGS"],
      ["analysis_score_percent", "Analysis score %"],
      ["expected_score_cgs", "Expected CGS"],
      ["manual_score_cgs", "Manual CGS"],
      ["formula_name", "Formula name"],
      ["formula_score", "Formula score"],
      ["formula_score_unit", "Unit"],
      ["formula_expression", "Formula expression"],
      ["formula_parts_json", "Formula parts"],
      ["formula_additions_json", "Added parts"],
      ["formula_subtractions_json", "Subtracted parts"],
      ["formula_multiplications_json", "Multiplied parts"],
      ["formula_divisions_json", "Divided parts"],
      ["formula_numbers_json", "Formula numbers"],
      ["formula_explanation_question", "AI formula question"],
      ["formula_explanation_answer", "AI formula answer"],
      ["deviation_from_baseline_cgs", "Manual CGS deviation"],
      ["deviation_from_baseline_percent", "Manual deviation %"],
      ["status", "Status"],
      ["notes", "Notes"],
      ["created_at", "Created"],
    ]),
    rows: runQuery(
      db,
      `SELECT
        id,
        case_id,
        run_id,
        analysis_type,
        same_text_group_id,
        repeat_index,
        provider_id,
        model,
        ai_intelligence_model,
        ai_difference_percent,
        ai_power_label,
        ai_power_score,
        ai_power_source,
        analysis_score_cgs,
        analysis_score_percent,
        expected_score_cgs,
        manual_score_cgs,
        formula_name,
        formula_score,
        formula_score_unit,
        formula_expression,
        formula_parts_json,
        formula_additions_json,
        formula_subtractions_json,
        formula_multiplications_json,
        formula_divisions_json,
        formula_numbers_json,
        formula_explanation_question,
        formula_explanation_answer,
        deviation_from_baseline_cgs,
        deviation_from_baseline_percent,
        status,
        notes,
        created_at
      FROM formula_test_runs
      ORDER BY created_at DESC, same_text_group_id, repeat_index, id`,
    ),
  },
  {
    id: "formulaRepeatDeltas",
    title: "Formula Repeat Deltas",
    sqlTable: "formula_test_repeat_deltas",
    description: "Computed deviation between repeated scans of the same text and the first run in the group.",
    columns: columns([
      ["id", "Test ID"],
      ["same_text_group_id", "Same text group"],
      ["repeat_index", "Repeat"],
      ["model", "Model"],
      ["ai_intelligence_model", "AI intelligence model"],
      ["formula_name", "Formula name"],
      ["formula_score", "Formula score"],
      ["baseline_formula_score", "Baseline formula score"],
      ["formula_score_delta", "Formula delta"],
      ["formula_score_delta_percent", "Formula delta %"],
      ["analysis_score_cgs", "Analysis score CGS"],
      ["baseline_analysis_score_cgs", "Baseline CGS"],
      ["analysis_score_delta_cgs", "CGS delta"],
      ["analysis_score_delta_percent", "CGS delta %"],
      ["ai_difference_percent", "Manual AI difference %"],
      ["created_at", "Created"],
    ]),
    rows: runQuery(
      db,
      `SELECT
        id,
        same_text_group_id,
        repeat_index,
        model,
        ai_intelligence_model,
        formula_name,
        formula_score,
        baseline_formula_score,
        formula_score_delta,
        formula_score_delta_percent,
        analysis_score_cgs,
        baseline_analysis_score_cgs,
        analysis_score_delta_cgs,
        analysis_score_delta_percent,
        ai_difference_percent,
        created_at
      FROM formula_test_repeat_deltas
      ORDER BY same_text_group_id, formula_name, repeat_index, id`,
    ),
  },
  {
    id: "manualReviews",
    title: "Manual Reviews",
    sqlTable: "manual_reviews",
    description: "Human QA notes and ratings.",
    columns: columns([
      ["id", "Review ID"],
      ["case_id", "Case ID"],
      ["run_id", "Run ID"],
      ["comparison_id", "Comparison ID"],
      ["reviewer", "Reviewer"],
      ["rating", "Rating"],
      ["status", "Status"],
      ["notes", "Notes"],
      ["created_at", "Created"],
    ]),
    rows: runQuery(
      db,
      `SELECT
        id,
        case_id,
        run_id,
        comparison_id,
        reviewer,
        rating,
        status,
        notes,
        created_at
      FROM manual_reviews
      ORDER BY created_at DESC, id`,
    ),
  },
];

const knownPhysicalTables = new Set(
  sections
    .map((section) => section.sqlTable)
    .filter((name) => !name.startsWith("query from ")),
);
const customTableNames = runQuery(
  db,
  `SELECT name
  FROM sqlite_master
  WHERE type = 'table'
    AND name NOT LIKE 'sqlite_%'
  ORDER BY name`,
)
  .map((row) => row.name)
  .filter((name) => !knownPhysicalTables.has(name));

for (const tableName of customTableNames) {
  const tableColumns = runQuery(db, `PRAGMA table_info(${quoteIdentifier(tableName)})`);
  const tableRows = runQuery(db, `SELECT * FROM ${quoteIdentifier(tableName)}`);
  sections.push({
    id: `custom_${tableName.replace(/[^a-z0-9_]+/gi, "_")}`,
    title: humanizeTableName(tableName),
    sqlTable: tableName,
    description: "Custom table discovered from the SQLite database.",
    columns: tableColumns.map((column) => ({
      key: column.name,
      label: humanizeColumnName(column.name),
    })),
    rows: tableRows,
  });
}

db.close();

writeText(outPath, renderDashboard({ dbPath, sections }));
console.log(`Eval Lab SQL dashboard written: ${outPath}`);
console.log(`Open with: start ${outPath}`);

function columns(entries) {
  return entries.map(([key, label]) => ({ key, label }));
}

function quoteIdentifier(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function humanizeTableName(value) {
  return fixAcronyms(String(value)
    .replace(/^eval_/, "")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase()));
}

function humanizeColumnName(value) {
  return fixAcronyms(String(value)
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase()));
}

function fixAcronyms(value) {
  return value
    .replace(/\bQa\b/g, "QA")
    .replace(/\bUi\b/g, "UI")
    .replace(/\bUx\b/g, "UX")
    .replace(/\bUrl\b/g, "URL")
    .replace(/\bId\b/g, "ID")
    .replace(/\bApi\b/g, "API")
    .replace(/\bMcp\b/g, "MCP");
}

function renderDashboard({ dbPath, sections }) {
  const stats = {
    cases: sections.find((section) => section.id === "cases")?.rows.length ?? 0,
    runs: sections.find((section) => section.id === "runs")?.rows.length ?? 0,
    comparisons: sections.find((section) => section.id === "comparisons")?.rows.length ?? 0,
    metrics: sections.find((section) => section.id === "runMetrics")?.rows.length ?? 0,
  };
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>ToraSEO Eval Lab SQL</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #fff7ed;
      --panel: #ffffff;
      --line: #f0d9c8;
      --text: #2b211b;
      --muted: #7a665a;
      --accent: #ff6b35;
      --accent-soft: #fff1e8;
      --bad: #dc2626;
      --ok: #059669;
      --warn: #d97706;
      --mark: #fff3a3;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: var(--bg);
      color: var(--text);
      font: 14px/1.45 Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    header {
      padding: 24px 30px 18px;
      background: linear-gradient(180deg, #fff, rgba(255,255,255,.62));
      border-bottom: 1px solid var(--line);
    }
    main { padding: 20px 30px 36px; }
    h1, h2, p { margin: 0; letter-spacing: 0; }
    h1 { font-size: 28px; }
    h2 { font-size: 18px; }
    button, input, select { font: inherit; }
    .muted { color: var(--muted); }
    .topline {
      display: flex;
      flex-wrap: wrap;
      align-items: flex-start;
      justify-content: space-between;
      gap: 16px;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 12px;
      margin-top: 18px;
    }
    .card, .panel {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 8px;
      box-shadow: 0 8px 28px rgba(97, 58, 35, .05);
    }
    .card { padding: 14px; }
    .value { margin-top: 5px; font-size: 26px; font-weight: 750; }
    code {
      border-radius: 5px;
      background: var(--accent-soft);
      padding: 2px 5px;
      color: #5b3826;
    }
    .toolbar {
      display: grid;
      grid-template-columns: minmax(220px, 1fr) auto auto;
      gap: 10px;
      margin-top: 18px;
    }
    .control {
      min-height: 36px;
      border: 1px solid var(--line);
      border-radius: 7px;
      background: #fff;
      color: var(--text);
      padding: 7px 10px;
      outline: none;
    }
    .control:focus { border-color: var(--accent); box-shadow: 0 0 0 3px rgba(255, 107, 53, .12); }
    .tabs {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 20px;
    }
    .tab {
      display: inline-flex;
      align-items: center;
      gap: 7px;
      border: 1px solid var(--line);
      border-radius: 999px;
      background: #fff;
      color: var(--muted);
      cursor: pointer;
      padding: 7px 11px;
      transition: .15s ease;
    }
    .tab[aria-selected="true"] {
      border-color: var(--accent);
      background: var(--accent);
      color: #fff;
    }
    .tab-count {
      display: inline-grid;
      min-width: 22px;
      min-height: 22px;
      place-items: center;
      border-radius: 999px;
      background: rgba(43, 33, 27, .08);
      font-size: 12px;
      font-weight: 700;
    }
    .tab[aria-selected="true"] .tab-count { background: rgba(255,255,255,.2); }
    .panel { margin-top: 14px; overflow: hidden; }
    .panel-head {
      display: flex;
      flex-wrap: wrap;
      align-items: flex-start;
      justify-content: space-between;
      gap: 12px;
      padding: 16px 18px;
      border-bottom: 1px solid var(--line);
      background: #fffaf6;
    }
    .panel-title { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
    .pill {
      display: inline-flex;
      align-items: center;
      border-radius: 999px;
      border: 1px solid var(--line);
      padding: 2px 8px;
      font-size: 12px;
      font-weight: 650;
      background: #fffaf6;
      white-space: nowrap;
    }
    .pass { color: var(--ok); }
    .fail { color: var(--bad); }
    .warn { color: var(--warn); }
    .table-wrap { max-height: calc(100vh - 360px); overflow: auto; }
    table {
      width: 100%;
      min-width: 980px;
      border-collapse: collapse;
    }
    th, td {
      max-width: 420px;
      padding: 10px 12px;
      border-bottom: 1px solid #f3e5da;
      text-align: left;
      vertical-align: top;
      white-space: nowrap;
    }
    td {
      overflow: hidden;
      text-overflow: ellipsis;
    }
    th {
      position: sticky;
      top: 0;
      z-index: 1;
      background: #fff;
      color: var(--muted);
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: .04em;
    }
    tr.row-highlight td { animation: rowFlash 1.8s ease; }
    .cell-highlight {
      background: var(--mark);
      box-shadow: inset 0 0 0 2px rgba(255, 181, 35, .8);
    }
    .link-cell {
      border: 0;
      background: transparent;
      color: #9a3f1e;
      cursor: pointer;
      padding: 0;
      text-decoration: underline;
      text-underline-offset: 2px;
    }
    .link-cell:hover { color: var(--accent); }
    .pager {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 12px 18px;
      border-top: 1px solid var(--line);
      background: #fffaf6;
    }
    .pager-buttons { display: flex; gap: 8px; }
    .button {
      border: 1px solid var(--line);
      border-radius: 7px;
      background: #fff;
      color: var(--text);
      cursor: pointer;
      padding: 7px 10px;
    }
    .button:disabled { cursor: not-allowed; opacity: .45; }
    .empty {
      padding: 34px 18px;
      color: var(--muted);
      text-align: center;
    }
    @keyframes rowFlash {
      0%, 100% { background: transparent; }
      25%, 70% { background: #fff3a3; }
    }
    @media (max-width: 900px) {
      header, main { padding-left: 16px; padding-right: 16px; }
      .grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .toolbar { grid-template-columns: 1fr; }
      .table-wrap { max-height: none; }
    }
  </style>
</head>
<body>
  <header>
    <div class="topline">
      <div>
        <p class="muted">ToraSEO Eval Lab</p>
        <h1>SQL Dashboard</h1>
        <p class="muted">Database: <code>${escapeHtml(dbPath)}</code></p>
      </div>
      <p class="muted">Source: SQLite tables and SQL views generated from saved eval data.</p>
    </div>
    <div class="grid">
      ${statCard("Cases", stats.cases)}
      ${statCard("Runs", stats.runs)}
      ${statCard("Comparisons", stats.comparisons)}
      ${statCard("Metric rows", stats.metrics)}
    </div>
    <div class="toolbar">
      <input id="searchInput" class="control" type="search" placeholder="Search any value, id, model, verdict, metric...">
      <select id="labelMode" class="control" aria-label="Column label mode">
        <option value="human">Human column names</option>
        <option value="sql">SQL column keys</option>
        <option value="both">Human + SQL</option>
      </select>
      <select id="pageSize" class="control" aria-label="Rows per page">
        <option value="10">10 rows</option>
        <option value="25" selected>25 rows</option>
        <option value="50">50 rows</option>
        <option value="100">100 rows</option>
      </select>
    </div>
    <div id="tabs" class="tabs" role="tablist"></div>
  </header>
  <main>
    <section id="panel" class="panel" aria-live="polite"></section>
  </main>
  <script id="dashboard-data" type="application/json">${safeJson({ sections })}</script>
  <script>
    const payload = JSON.parse(document.getElementById("dashboard-data").textContent);
    const sections = payload.sections;
    const state = {
      activeSectionId: sections[0]?.id ?? null,
      pages: Object.fromEntries(sections.map((section) => [section.id, 1])),
      pageSize: 25,
      labelMode: "human",
      query: "",
      highlight: null,
    };
    const references = {
      cases: { id: { section: "runs", column: "case_id" } },
      runs: {
        id: { section: "runMetrics", column: "run_id" },
        case_id: { section: "cases", column: "id" },
      },
      runMetrics: { run_id: { section: "runs", column: "id" } },
      comparisons: {
        id: { section: "manualReviews", column: "comparison_id" },
        case_id: { section: "cases", column: "id" },
        mcp_run_id: { section: "runs", column: "id" },
        api_run_id: { section: "runs", column: "id" },
      },
      manualReviews: {
        case_id: { section: "cases", column: "id" },
        run_id: { section: "runs", column: "id" },
        comparison_id: { section: "comparisons", column: "id" },
      },
    };

    const tabsEl = document.getElementById("tabs");
    const panelEl = document.getElementById("panel");
    const searchInput = document.getElementById("searchInput");
    const labelMode = document.getElementById("labelMode");
    const pageSize = document.getElementById("pageSize");

    searchInput.addEventListener("input", () => {
      state.query = searchInput.value.trim().toLowerCase();
      state.highlight = null;
      if (state.query) jumpToSearchResult(state.query);
      render();
    });
    labelMode.addEventListener("change", () => {
      state.labelMode = labelMode.value;
      render();
    });
    pageSize.addEventListener("change", () => {
      state.pageSize = Number(pageSize.value);
      state.pages = Object.fromEntries(sections.map((section) => [section.id, 1]));
      render();
    });

    render();
    applyInitialHash();

    function render() {
      renderTabs();
      renderPanel();
    }

    function renderTabs() {
      tabsEl.innerHTML = sections.map((section) => {
        const selected = section.id === state.activeSectionId;
        return \`<button class="tab" type="button" role="tab" aria-selected="\${selected}" data-section="\${escapeAttr(section.id)}">
          <span>\${escapeHtml(section.title)}</span>
          <span class="tab-count">\${section.rows.length}</span>
        </button>\`;
      }).join("");
      tabsEl.querySelectorAll("[data-section]").forEach((button) => {
        button.addEventListener("click", () => {
          state.activeSectionId = button.dataset.section;
          state.highlight = null;
          writeHash(state.activeSectionId);
          render();
        });
      });
    }

    function renderPanel() {
      const section = getActiveSection();
      if (!section) {
        panelEl.innerHTML = '<div class="empty">No sections.</div>';
        return;
      }
      const filtered = filterRows(section);
      const pageCount = Math.max(1, Math.ceil(filtered.length / state.pageSize));
      const currentPage = Math.min(state.pages[section.id] ?? 1, pageCount);
      state.pages[section.id] = currentPage;
      const start = (currentPage - 1) * state.pageSize;
      const pageRows = filtered.slice(start, start + state.pageSize);

      panelEl.innerHTML = \`
        <div class="panel-head">
          <div>
            <div class="panel-title">
              <h2>\${escapeHtml(section.title)}</h2>
              <span class="pill">\${escapeHtml(section.sqlTable)}</span>
            </div>
            <p class="muted">\${escapeHtml(section.description)}</p>
          </div>
          <div class="muted">\${filtered.length} shown / \${section.rows.length} total</div>
        </div>
        \${pageRows.length ? renderTable(section, pageRows, start) : '<div class="empty">No matching rows.</div>'}
        <div class="pager">
          <div class="muted">Page \${currentPage} of \${pageCount}</div>
          <div class="pager-buttons">
            <button class="button" id="prevPage" type="button" \${currentPage <= 1 ? "disabled" : ""}>Previous</button>
            <button class="button" id="nextPage" type="button" \${currentPage >= pageCount ? "disabled" : ""}>Next</button>
          </div>
        </div>\`;

      panelEl.querySelector("#prevPage")?.addEventListener("click", () => {
        state.pages[section.id] = Math.max(1, currentPage - 1);
        state.highlight = null;
        render();
      });
      panelEl.querySelector("#nextPage")?.addEventListener("click", () => {
        state.pages[section.id] = Math.min(pageCount, currentPage + 1);
        state.highlight = null;
        render();
      });
      panelEl.querySelectorAll("[data-link-section]").forEach((button) => {
        button.addEventListener("click", () => followCellLink(button));
      });
      if (state.highlight) {
        panelEl.querySelector(".cell-highlight")?.scrollIntoView({ block: "center", inline: "center" });
      }
    }

    function renderTable(section, rows, offset) {
      return \`<div class="table-wrap">
        <table>
          <thead><tr>\${section.columns.map((column) => \`<th>\${escapeHtml(columnLabel(column))}</th>\`).join("")}</tr></thead>
          <tbody>
            \${rows.map((row, index) => renderRow(section, row, offset + index)).join("")}
          </tbody>
        </table>
      </div>\`;
    }

    function renderRow(section, row, absoluteIndex) {
      const highlighted = state.highlight?.sectionId === section.id && state.highlight.rowIndex === absoluteIndex;
      return \`<tr class="\${highlighted ? "row-highlight" : ""}">
        \${section.columns.map((column) => renderCell(section, row, absoluteIndex, column)).join("")}
      </tr>\`;
    }

    function renderCell(section, row, rowIndex, column) {
      const value = row[column.key];
      const highlighted =
        state.highlight?.sectionId === section.id &&
        state.highlight.rowIndex === rowIndex &&
        state.highlight.columnKey === column.key;
      const className = highlighted ? "cell-highlight" : "";
      return \`<td class="\${className}" title="\${escapeAttr(displayValue(value))}">\${formatCell(section, column.key, value)}</td>\`;
    }

    function formatCell(section, columnKey, value) {
      if (value === null || value === undefined || value === "") return '<span class="muted">-</span>';
      const text = displayValue(value);
      const ref = references[section.id]?.[columnKey];
      if (ref) {
        return \`<button class="link-cell" type="button" data-link-section="\${escapeAttr(ref.section)}" data-link-column="\${escapeAttr(ref.column)}" data-link-value="\${escapeAttr(text)}">\${escapeHtml(text)}</button>\`;
      }
      if (columnKey === "verdict") {
        const normalized = text.toLowerCase();
        const className = normalized.includes("pass") ? "pass" : normalized.includes("fail") ? "fail" : "warn";
        return \`<span class="pill \${className}">\${escapeHtml(text)}</span>\`;
      }
      if (["mode", "status", "analysis_type", "tone"].includes(columnKey)) {
        return \`<span class="pill">\${escapeHtml(text)}</span>\`;
      }
      return escapeHtml(text);
    }

    function followCellLink(button) {
      const targetSectionId = button.dataset.linkSection;
      const columnKey = button.dataset.linkColumn;
      const value = button.dataset.linkValue;
      const target = sections.find((section) => section.id === targetSectionId);
      if (!target) return;
      const rowIndex = target.rows.findIndex((row) => displayValue(row[columnKey]) === value);
      state.activeSectionId = target.id;
      state.query = "";
      searchInput.value = "";
      if (rowIndex >= 0) {
        state.pages[target.id] = Math.floor(rowIndex / state.pageSize) + 1;
        state.highlight = { sectionId: target.id, rowIndex, columnKey };
        writeHash(target.id, columnKey, value);
      } else {
        state.highlight = null;
        writeHash(target.id);
      }
      render();
    }

    function jumpToSearchResult(query) {
      for (const section of sections) {
        for (let rowIndex = 0; rowIndex < section.rows.length; rowIndex += 1) {
          const row = section.rows[rowIndex];
          for (const column of section.columns) {
            if (displayValue(row[column.key]).toLowerCase().includes(query)) {
              state.activeSectionId = section.id;
              state.pages[section.id] = Math.floor(rowIndex / state.pageSize) + 1;
              state.highlight = { sectionId: section.id, rowIndex, columnKey: column.key };
              writeHash(section.id, column.key, displayValue(row[column.key]));
              return;
            }
          }
        }
      }
    }

    function filterRows(section) {
      if (!state.query) return section.rows;
      return section.rows.filter((row) =>
        section.columns.some((column) => displayValue(row[column.key]).toLowerCase().includes(state.query)),
      );
    }

    function getActiveSection() {
      return sections.find((section) => section.id === state.activeSectionId) ?? sections[0] ?? null;
    }

    function columnLabel(column) {
      if (state.labelMode === "sql") return column.key;
      if (state.labelMode === "both") return \`\${column.label} / \${column.key}\`;
      return column.label;
    }

    function displayValue(value) {
      if (value === null || value === undefined) return "";
      return String(value);
    }

    function writeHash(sectionId, columnKey = "", value = "") {
      const parts = [sectionId];
      if (columnKey && value) parts.push(\`\${columnKey}=\${encodeURIComponent(value)}\`);
      history.replaceState(null, "", \`#\${parts.join(":")}\`);
    }

    function applyInitialHash() {
      const hash = decodeURIComponent(location.hash.slice(1));
      if (!hash) return;
      const [sectionId, condition] = hash.split(":");
      const section = sections.find((item) => item.id === sectionId);
      if (!section) return;
      state.activeSectionId = section.id;
      if (condition?.includes("=")) {
        const [columnKey, value] = condition.split("=");
        const rowIndex = section.rows.findIndex((row) => displayValue(row[columnKey]) === value);
        if (rowIndex >= 0) {
          state.pages[section.id] = Math.floor(rowIndex / state.pageSize) + 1;
          state.highlight = { sectionId: section.id, rowIndex, columnKey };
        }
      }
      render();
    }

    function escapeHtml(value) {
      return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;");
    }

    function escapeAttr(value) {
      return escapeHtml(value).replaceAll("'", "&#39;");
    }
  </script>
</body>
</html>`;
}

function statCard(label, value) {
  return `<div class="card"><div class="muted">${escapeHtml(label)}</div><div class="value">${escapeHtml(String(value))}</div></div>`;
}

function safeJson(value) {
  return JSON.stringify(value).replaceAll("</", "<\\/");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
