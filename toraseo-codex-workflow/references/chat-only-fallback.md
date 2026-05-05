# ToraSEO Chat-Only Fallback

Use this reference only when Codex Workflow Instructions are active but
the live bridge cannot run because ToraSEO MCP is unavailable, ToraSEO
Desktop App is unavailable, or the app has no active scan.

Do not load this file during a healthy bridge run. When Codex Workflow
Instructions, ToraSEO MCP, and an active Desktop App scan are all
available, use `verify_codex_workflow_loaded`, then run the selected MCP
tools. The MCP results and app state are the source of truth in that path.

## User-Facing Boundary

Say plainly:

- "Сейчас я могу дать только чатовый разбор ToraSEO: приложение не будет
  обновлено структурированными результатами."
- "Это не live SERP, не внешняя проверка плагиата, не юридическая,
  медицинская, финансовая, инженерная или научная экспертиза."
- "Для отчета в приложении нужно запустить ToraSEO Desktop App, проверить
  MCP-подключение и повторить запуск из приложения."

Use the user's language.

## One Text

If the user provided one article text, analyze conceptually with the same
categories as ToraSEO text analysis:

- platform/use-case fit
- structure and headings
- style and tone
- language and audience
- media placeholders
- local uniqueness and repetition risk
- AI-writing style signals
- logic and claim-risk markers
- SEO intent/title/meta draft when enough context exists
- safety/science/legal-sensitive risk flags

## Two Texts

If the user provided Text A and Text B, compare conceptually:

- intent match
- structure
- content gaps
- semantic coverage
- specificity
- trust and caution
- style
- similarity/copying risk
- title/CTR potential
- platform fit
- strengths and weaknesses
- improvement plan

If a goal is present, select the report mode:

- no goal: standard comparison for both texts
- Text A or Text B goal: focus the report on that side and use the other
  text only as comparison context
- competitor goal: textual advantages, gaps, and a non-copying plan
- style goal: transferable style techniques without copying phrases
- similarity goal: exact overlap, semantic closeness, and copying risk
- version goal: what improved, worsened, was fixed, or appeared
- A/B post goal: hook, clarity, brevity, CTA, platform fit, and reaction
  potential

## URL-Only Requests

If the user provided only a URL and MCP/network tools are unavailable, do
not pretend the page was fetched. Ask for the page text, title/meta, or a
brief extract, or provide a checklist of what to collect.

## Do Not

- Do not claim that ToraSEO Desktop App was updated.
- Do not claim MCP tools ran.
- Do not cite result files, scan IDs, tool IDs, or app state.
- Do not say a page ranks because of text alone.
- Do not rewrite the full article unless the user explicitly asks after
  the analysis.
