# ToraSEO Eval Lab

This folder documents the public, non-secret part of the internal
quality lab. The lab exists to compare ToraSEO analysis behavior across
execution modes without spending API tokens on repeated manual checks.

The private datasets, golden expectations, raw API/MCP outputs, visual
snapshots, and formula tests live under `private/eval-lab/`. That folder
is intentionally ignored by git.

Use `article-text-case-template.json` as the public starter shape, then
copy the real case into `private/eval-lab/cases/article_text/`.

## First Runner

Create or update the local SQLite database:

```powershell
npm run eval:db:init
```

The database file is private and ignored by git:

```text
private/eval-lab/toraseo-eval.sqlite
```

Open that file in DBeaver as a SQLite database when you want a full
database table view, filters, SQL queries, and manual notes.

Build the local dashboard:

```powershell
npm run eval:dashboard
```

Open the generated table:

```powershell
start private/eval-lab/reports/index.html
```

Inspect one saved article-text report:

```powershell
npm run eval:article-text:inspect -- private/eval-lab/runs/text_001.api.json
```

Compare an `article_text` MCP report with an API Native report:

```powershell
npm run eval:article-text:compare -- --mcp private/eval-lab/runs/text_001.mcp.json --api private/eval-lab/runs/text_001.api.json --case private/eval-lab/cases/article_text/text_001.case.json --out private/eval-lab/reports/text_001.compare.md
```

Import a private case and saved reports into SQLite:

```powershell
npm run eval:db:import -- --case private/eval-lab/cases/article_text/text_001.case.json
npm run eval:db:import -- --run private/eval-lab/runs/text_001.mcp.json --caseId text_001 --mode mcp
npm run eval:db:import -- --run private/eval-lab/runs/text_001.api.json --caseId text_001 --mode api
npm run eval:db:import -- --comparison private/eval-lab/reports/text_001.compare.md --caseId text_001 --mcpRun text_001.mcp --apiRun text_001.api
```

Build the SQL-backed visual dashboard:

```powershell
npm run eval:db:dashboard
start private/eval-lab/reports/sql-dashboard.html
```

The SQL dashboard is a static HTML viewer over the SQLite database. It
includes tabs, pagination, global search, clickable ID/reference cells,
and a column-label switch:

- `Human column names`
- `SQL column keys`
- `Human + SQL`

Run a quick SQL query from the terminal:

```powershell
npm run eval:db:query -- --sql "SELECT id, analysis_type, name FROM eval_cases"
```

The runner accepts:

- a `RuntimeAuditReport` JSON object;
- `{ "report": RuntimeAuditReport }`;
- a bridge `current-scan.json` state file with `selectedTools` and
  `buffer`.

To export article-text report JSON from the app, enable the private lab
button in DevTools:

```js
localStorage.setItem("toraseo.evalLab", "1")
```

Then restart or refresh the app view. Completed article-text reports will
show a small `QA JSON` button next to the normal export controls.

It checks:

- whether API covered the same selected article-text tools as the MCP
  baseline;
- whether the required report sections exist in both outputs;
- whether top metrics are close enough;
- whether API missed baseline critical signals;
- whether API priorities cover the same tool areas as MCP priorities.

## Why This Exists

The product rule for `article_text` is:

- MCP + Instructions is the current golden baseline for report UX and
  semantics.
- API Native Analysis must follow the same report contract, regardless
  of the selected API provider/model.
- Comparison should not require identical wording. It should require
  the same important detections, report structure, tool coverage, and
  close-enough scores.

## Future Layers

Add these after the first comparison runner is useful:

- schema/completeness validator for every analysis type;
- visual snapshot tests for dashboard/report/PDF rendering using saved
  JSON fixtures;
- compare-two-texts eval cases;
- page URL, site URL, up-to-three-sites, and media eval cases;
- formula tests for future scoring families;
- richer SQL dashboards reading `private/eval-lab/toraseo-eval.sqlite`.

## SQL Model

The public schema lives in `qa/eval-lab/schema.sql`. It is safe to keep
in git because it contains only structure, not private cases or real
analysis outputs.

Main tables:

- `eval_cases` - golden cases and expected detections.
- `eval_runs` - imported MCP/API/manual analysis outputs.
- `eval_run_metrics` - metric rows extracted from saved reports.
- `eval_comparisons` - MCP/API comparison reports.
- `formula_versions` - future formula versions and public-safe metadata.
- `formula_test_runs` - manual formula and score checks, including AI model,
  optional model-power notes, repeated scans of the same text, formula parts,
  and manually entered AI-difference percentages.
- `formula_test_repeat_deltas` - SQL view that compares repeated formula
  checks against the first run in the same `same_text_group_id`.
- `qa_sessions` - one manual QA session with a final verdict.
- `qa_findings` - separate issues/observations found during a session.
- `qa_article_text_reviews` - article text analysis review details.
- `qa_article_preview_reviews` - visual article preview and annotation QA.
- `qa_article_annotation_checks` - individual marker, highlight, and
  recommendation-link checks inside the article preview.
- `qa_article_compare_reviews` - two-text comparison review details.
- `qa_page_url_reviews` - page/article by URL review details.
- `qa_site_url_reviews` - site by URL review details.
- `qa_site_compare_reviews` - up-to-three-sites comparison review details.
- `qa_system_design_reviews` - architecture and data-flow review notes.
- `qa_ux_ui_reviews` - UI behavior, windows, layout, and interaction notes.
- `qa_typography_reviews` - font, size, weight, spacing, and readability checks.
- `automated_test_runs` - future Vitest/Playwright command runs.
- `automated_test_results` - individual test results from those runs.
- `manual_reviews` - legacy/simple human QA notes and ratings.

Recommended manual QA flow:

1. Create one row in `qa_sessions` for the check you are performing.
2. Add each separate problem or observation to `qa_findings`.
3. If the check belongs to a specific analysis type, add a row to the
   matching `qa_*_reviews` table.
4. For article preview checks, use `qa_article_preview_reviews` for the
   whole preview state and `qa_article_annotation_checks` for each
   visible marker or highlighted fragment.
5. Set `check_language` on `eval_cases`, `qa_sessions`, and preview
   reviews when language-specific rules matter, for example `ru` or `en`.
6. For design/system work, use `qa_system_design_reviews`,
   `qa_ux_ui_reviews`, or `qa_typography_reviews`.
7. For Tora Rank/formula calibration, add one `formula_test_runs` row per
   formula result. Use `same_text_group_id` for repeated scans of identical
   text, `formula_name` and `formula_score` before the JSON formula parts,
   and `ai_difference_percent` for the manually judged difference between
   AI models.
8. Put the second AI verification question in
   `formula_explanation_question`: ask which formula was used, which parts
   were added, subtracted, multiplied, and divided, and the separate numbers
   for each formula. Store the answer in `formula_explanation_answer` and
   the machine-readable numbers in `formula_numbers_json`.
9. `ai_power_*` fields are intentionally optional. Use them only when you
   have a public benchmark/source you trust; otherwise leave them empty and
   rely on your manual `ai_difference_percent`.
10. After running `npm run eval:db:dashboard`, the HTML dashboard will
   show these tables as separate tabs.
