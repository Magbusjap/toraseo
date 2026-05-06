# ToraSEO Chat-Only Fallback

Use this file only when the ToraSEO Claude Bridge Instructions are loaded
but the live bridge cannot run because the MCP server is unavailable, the
Desktop App is unavailable, or the app has no active scan.

Do not load this file during a healthy Bridge Mode run. When Skill, MCP,
and the Desktop App scan are all available, use `verify_skill_loaded`, then
run the selected MCP tools. The MCP results and app state are the source of
truth in that path.

## What To Say

Be explicit and calm:

- "Сейчас я могу дать только чатовый разбор ToraSEO: приложение не будет
  обновлено структурированными результатами."
- "Это не live SERP, не внешняя проверка плагиата, не юридическая,
  медицинская, финансовая, инженерная или научная экспертиза."
- "Если нужно заполнить отчет в приложении, запустите ToraSEO Desktop App,
  проверьте MCP-подключение и повторите запуск из приложения."

Use the user's language.

## What To Analyze

If the user provided a URL only and MCP/network tools are unavailable, do
not pretend the page was fetched. Ask for the page text, title/meta, or a
brief extract, or provide a checklist of what to collect.

If the user provided a URL plus a copied/highlighted page fragment, treat
that fragment as the intended article evidence and analyze it as a page
article excerpt. Make clear that URL-level fetching, robots/meta/headings,
index visibility, search clicks/impressions, and mention discovery did not
run in chat-only fallback mode.

If the user provided one article text, analyze conceptually:

- platform/use-case fit
- structure and headings
- style and tone
- language and audience
- media placeholders
- local uniqueness and repetition risk
- AI-writing style probability, explicitly not proof of authorship
- AI trace map: local AI-like editing targets such as generic transitions,
  formal wording, repeated terms, or overly even rhythm
- genericness/watery text: broad filler, repeated generic concepts, and
  missing concrete examples, numbers, sources, cases, or reader actions
- readability/complexity: dense sentences, long phrases, heavy paragraphs,
  and scan friction
- claim source queue: claims, numbers, absolute wording, vague authorities,
  and sensitive statements that need manual source verification, softer
  wording, or removal
- logic and claim-risk markers
- SEO intent/title/meta draft when enough context exists
- safety/science/legal-sensitive risk flags

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

If the user gave a comparison goal, adapt the report:

- focus on Text A or Text B when the goal names one side
- for competitor goals, show textual advantages, gaps, and a non-copying
  improvement plan
- for style goals, analyze transferable style techniques without copying
  phrases
- for similarity goals, prioritize exact overlap, semantic closeness, and
  copying risk
- for version goals, show what improved, worsened, was fixed, or appeared
- for A/B post goals, focus on hook, clarity, brevity, CTA, platform fit,
  and reaction potential

## What Not To Do

- Do not claim that ToraSEO Desktop App was updated.
- Do not claim MCP tools ran.
- Do not cite `results/*.json`, scan IDs, tool IDs, or app state.
- Do not say a page ranks because of text alone.
- Do not rewrite the full article unless the user explicitly asks for a
  rewrite after the analysis.
