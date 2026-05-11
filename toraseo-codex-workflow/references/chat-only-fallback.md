# ToraSEO Chat-Only Fallback

Use this reference only when Codex Workflow Instructions are active but
the live bridge cannot run because ToraSEO MCP is unavailable, ToraSEO
Desktop App is unavailable, or the app has no active scan.

Do not load this file during a healthy bridge run. When Codex Workflow
Instructions, ToraSEO MCP, and an active Desktop App scan are all
available, use `verify_codex_workflow_loaded`, then run the selected MCP
tools. The MCP results and app state are the source of truth in that path.

## User-Facing Boundary

Say plainly. Use these English reference messages, translated to the
active reply language when the ToraSEO run is not English:

- "I can only give a chat-only ToraSEO review right now; the app will
  not be updated with structured results."
- "This is not live SERP research, an external plagiarism check, or
  legal, medical, financial, engineering, or scientific expert review."
- "To fill the report in the app, open ToraSEO Desktop App, check the
  MCP connection, and start the analysis again from the app."

Use the interface locale from the pasted ToraSEO prompt as the default
reply language. Only switch to another language if the user explicitly
changes language in their own new message.

## One Text

If the user provided one article text, analyze conceptually with the same
categories as ToraSEO text analysis:

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

## Page By URL

If the user provided a URL plus copied/highlighted page content, treat the
provided content as the evidence. Analyze the article/page text in chat and
state that URL fetching, robots/meta/headings, index visibility, search
clicks/impressions, and mention discovery did not run through ToraSEO MCP.

If the user provided only a URL, follow the URL-only boundary above.

## Site By URL

If browsing/network tools are available in the current environment and the
user gave a site URL, inspect only the public evidence you can actually
reach and keep the report bounded. If browsing is unavailable, ask for
exported facts, screenshots, page text, title/meta, robots/sitemap snippets,
or a short crawl summary. Do not invent site-wide technical findings.

## Site Comparison

For two or three sites, do not write three full audits side by side. Use one
compact competitive dashboard:

- summary: who looks strongest and why
- compact site cards: only key KPIs or qualitative status
- comparative metrics: metadata, content, indexability, structure,
  performance, trust
- direction heatmap: green/yellow/red per direction when evidence exists
- winners by block
- actionable insights: what to copy from the leader and what to fix first

If only URLs were provided and browsing/network tools are unavailable, state
that live site evidence was not fetched and ask for source material.

## Do Not

- Do not claim that ToraSEO Desktop App was updated.
- Do not claim MCP tools ran.
- Do not cite result files, scan IDs, tool IDs, or app state.
- Do not say a page ranks because of text alone.
- Do not rewrite the full article unless the user explicitly asks after
  the analysis.
