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

Inspect one saved article-text report:

```powershell
npm run eval:article-text:inspect -- private/eval-lab/runs/text_001.api.json
```

Compare an `article_text` MCP report with an API Native report:

```powershell
npm run eval:article-text:compare -- --mcp private/eval-lab/runs/text_001.mcp.json --api private/eval-lab/runs/text_001.api.json --case private/eval-lab/cases/article_text/text_001.case.json --out private/eval-lab/reports/text_001.compare.md
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
- a private local dashboard reading `private/eval-lab/runs/`.
