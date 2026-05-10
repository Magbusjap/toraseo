# Analysis Policy

Use this reference when a task changes analysis types, tool selection,
AI interpretation, or future formula groundwork.

## Approved `0.0.9` Analysis Types

First-wave analysis types for `0.0.9`:

| ID | User-facing shape | Status |
|---|---|---|
| `site_by_url` | Site by URL | implemented baseline |
| `page_by_url` | Page/article by URL | implemented bridge/API baseline |
| `article_text` | Pasted article text | bridge MVP implemented |
| `article_compare` | Compare 2 article inputs | approved, planned |
| `site_compare` | Compare up to 3 site URLs | approved, planned |
| `site_design_by_url` | Design and broader content by URL | approved, planned |

`image_analysis` / media-content analysis is intentionally excluded from
this first implementation pass unless the user explicitly reopens it.

## Site by URL Baseline

`site_by_url` remains the classic baseline audit. It should not become a
mega-mode that absorbs every future idea.

Current baseline tools:

- `check_robots_txt`
- `analyze_sitemap`
- `analyze_meta`
- `analyze_headings`
- `check_redirects`
- `analyze_content`
- `scan_site_minimal`
- `detect_stack`

`detect_stack` is the first approved expansion tool. It detects public
CMS / builder / framework / analytics / CDN / server signals from HTML
and response headers so recommendations can become platform-aware.

## Tool Sets Are Analysis-Specific

Do not reuse one universal tool list for every analysis type.

`site_by_url` uses the classic site-audit tools. Other analysis types
may reuse a subset of site tools, but must also add their own content,
platform, comparison, or design tools.

Current planning direction:

- `page_by_url`: reuse URL/page tools such as robots, meta, headings,
  content, and stack detection; add text extraction, platform detection,
  text style, and language/audience fit.
- `article_text`: focus on text platform, structure, style, tone,
  language/audience fit, media placeholders, naturalness, safety/legal,
  medical, investment, technical/engineering, jurisdiction, source-context
  risk flags, and scientific/calculation review signals. Built-in
  checks also include article uniqueness, language syntax, AI-writing
  probability, AI trace mapping, genericness/watery-text review,
  readability/complexity review, claim source queue, logic consistency,
  and the intent/SEO forecast layer.
  The intent/SEO layer may suggest hooks, CTR/trend potential, and CMS
  metadata, but must not claim live search, platform rules, likes/dislikes,
  SERP demand, jurisdiction rules, or social demand unless a real external
  data source is connected. Optional deeper checks include
  fact distortion and AI/hallucination review. In Bridge Mode the app
  stores the temporary article text in workspace `input.md`; Codex/Claude
  should use MCP tools to read that file and write structured results
  back to the app instead of asking the user to paste the article into
  chat. If the user later asks for a rewrite or ready draft from the
  same analysis, use `article_rewrite_context` instead of reading
  `input.md` directly or asking for the pasted text again. The rewritten
  article should be produced in chat as a copyable block; the user then
  pastes it into ToraSEO and starts a new scan. The rewrite must still
  follow the active workflow rules and selected tool evidence.
- `article_compare`: compare structure, style, platform fit, strengths
  and weaknesses, language/audience fit, and media placement.
- `site_compare`: compare up to three URLs through one competitive
  dashboard, not three full audits side by side. Reuse the full
  `site_by_url` public check package per URL, then synthesize:
  summary, compact KPI cards, grouped metrics, one radar-style overview
  when available, delta bars, heatmap/direction matrix, winners by
  block, and actionable insights.
- `site_design_by_url`: keep as planned/deferred for full execution
  until visual/media boundaries are clearer; UI may show planned tools
  but must not imply a completed design/vision analyzer exists.

## Robots.txt Boundary

`robots.txt` is the exception document that ToraSEO may fetch in order
to know crawl permissions. Reading `robots.txt` itself is not gated by
`robots.txt`; doing so would be circular.

Practical rules:

- Fetch `robots.txt` to determine whether page/site HTML may be fetched.
- Respect robots-gate for page/site HTML and other crawlable resources.
- Do not apply robots-gate to `robots.txt` itself.
- Do not apply robots-gate to the sitemap file itself when it is found
  through a `Sitemap:` directive or standard sitemap discovery; still
  apply rate limiting and normal network safety.
- Do not spoof Googlebot/Yandexbot/Bingbot user agents.

Reference basis:

- Google documents that automated crawlers download and parse
  `robots.txt` before crawling a site.
- Existing ToraSEO private notes already record that sitemap discovery
  through `robots.txt` is public by definition and should not be gated
  by another robots check.

## Text Platform And Style Policy

Text analysis must be platform-aware.

The user can choose a known resource such as a site article, X/Twitter,
Facebook, LinkedIn, Habr, Reddit, or provide a custom resource. If the
selected platform has a dominant audience language and the submitted
text uses another language, the AI should not silently penalize the text;
it should recommend translation or localization when appropriate.

Style selection is optional. If unset, the AI may infer style from the
text. If set, the AI must evaluate against that style instead of forcing
a generic business tone. Supported first-wave styles include:

- informational
- journalistic / publicistic
- business
- educational
- humorous
- personal

The analysis role field is also optional. It answers a different
question than text style: style describes the submitted text, while role
describes the reviewer lens the AI should use. Examples: SEO editor,
fact-checker, medical editor, product marketer, community moderator, or
plain-language editor. If the role field is empty, the AI uses the
standard ToraSEO analysis posture and may choose the best rewrite role
itself when proposing next steps.

For `article_text`, the "text topic" field is optional. If the text body
contains a title that conflicts with the topic field, treat the title in
the body as the stronger source of truth.

`article_text` has two user intents:

- scan an existing finished text
- ask AI to propose a ready solution / draft

If the user chose finished-text analysis, the AI should not suddenly
rewrite the whole article. It may point out problems, recommend fixes,
and ask whether the user wants a rewrite. If the user chose AI solution,
the AI may draft the article when there is enough context, or ask a
short clarifying question when context is insufficient. The bridge must
still start as `article_text` even when the user supplies only a topic
for this solution flow; the temporary `input.md` should contain that
topic/brief so the selected MCP tools and the final chat proposal are
working from the same evidence.

When AI drafts a full article, the final response should clearly separate
the ready article from recommendations, so the user can copy only the
article. It should also suggest a re-analysis loop:

> Want to analyze the finished version? Copy the text into the analysis
> form and run the text analysis again.

Before the AI rewrites or substantially reworks an article, it should
ask immediately whether the user wants recommended image positions to be
marked for better SEO. If the user agrees, or has already asked for
image placement guidance, the rewritten article should include the exact
ToraSEO placeholder line at the relevant places in the text. Do not move
all placeholders to the end of the article and do not invent alternate
labels.

If the user asks for unrelated research while inside the text analysis
flow, redirect gently back to the article task. Example: "I can collect
options on this topic and prepare material for your article. Should I do
that?"

After an article-text analysis, the chat answer should end with a
numbered list of user choices instead of one broad question. The list
should say whether the user needs a rewrite, whether a structure-only
pass is enough, whether media markers are useful, and which role the AI
would use for rewriting. If the user says no or stays silent, do not
pressure them; acknowledge the decision and keep the analysis available.

Article text may include explicit placeholders:

```text
------------------------- image placeholder -------------------------
------------------------ animation placeholder -----------------------
------------------------- video placeholder --------------------------
------------------------- audio placeholder --------------------------
```

Russian UI markers must be kept exact:

```text
------------------------- место для изображения --------------------------
------------------------- место для анимации ----------------------------
------------------------- место для видео -------------------------------
------------------------- место для аудио -------------------------------
```

The AI should treat these as media placement hints and account for
platform conventions. For example, if a platform normally places images
after the post body, recommendations should not assume inline images are
available.

When pasted clipboard content includes media that cannot be inserted into
ToraSEO text fields, convert it to text placeholders rather than losing
the signal.

## Compare Two Texts Policy

`article_compare` should include an optional analysis goal. The goal may
ask to imitate text A, improve text B, find competitor weaknesses, or
compare both texts neutrally.

Each input can be marked as:

- not selected
- user's text
- competitor text

The user may choose the same role for both texts. If roles are empty,
compare neutrally and provide strengths, weaknesses, and improvement
directions for both.

If style is set to automatic, the AI should infer and explain the likely
style of each text before judging fit. This avoids forcing a business
style onto humorous, personal, journalistic, or community-native writing.

## Comparison Output

Comparison analyses should render results in columns where possible.

This applies to:

- `article_compare`
- `site_compare`

For `article_compare`, columns may contain richer side-by-side text
evidence. For `site_compare`, columns must stay compact and
summary-only. Do not render three complete audits next to each other.
The goal is fast scanning of strengths, weaknesses, winners, gaps, and
next actions between competitors or variants.

## Runtime Split

Keep the layers separate:

- deterministic tools produce repeatable facts and structured evidence
- AI interpretation explains, prioritizes, rewrites, and adapts to the
  chosen analysis type
- formulas sit above stable evidence contracts and must be versioned
- UI lets the user choose tools through presets and, later, advanced
  per-tool controls

Do not ask the model to invent facts that should come from tools.
For `article_text`, the model must also keep recommendations and rewrite
directions inside selected/built-in tool evidence. It may explain what a
weak metric means, what to fix first, and what extra check is missing;
it must not invent ranking promises, hidden formula weights, or a broad
editorial strategy that the current tools did not evaluate.

## Formula Policy

Each analysis family may eventually have its own dynamic formula.

Current Tora Rank boundary:

- The desktop app may show an early Tora Rank / `cgs` preview for
  Codex-driven `article_text` results.
- MCP tools do not calculate that preview directly; they produce the
  structured metrics and issues that the app-side preview reads.
- If the user asks about the visible Tora Rank score in chat, explain it
  as an app-side preview layer over the completed text-analysis metrics,
  not as a separate MCP tool result or a hidden model calculation.
- Do not claim that visible `cgs` values are raw character counters when
  the UI label says Tora Rank.

Important constraints:

- The public scale can remain `0..100%` for familiar readability.
- A formula may expand or contract based on the selected tool set.
- A larger tool set must not automatically mean a higher or lower score.
- A smaller tool set must not pretend to be as well-evidenced as a
  deeper run.
- The formula should explain evidence coverage separately from quality.
- Future gamified scoring should be honest about uncertainty and model
  dependence.

The reason is simple: without enough context, roles, rules, and
constraints, even a strong AI cannot produce a reliable judgment. Tool
selection affects evidence coverage, not magical score purity.

## Re-analysis Loop

For article and content workflows, repeated analysis is expected:

1. user submits content
2. ToraSEO analyzes it using selected tools and rules
3. AI proposes changes
4. user revises the content
5. user runs analysis again

The AI may improve the result on a second pass, but it may also make it
worse. Treat repeated analysis as an evidence-guided iteration, not as a
guarantee of monotonic improvement.

## AI Generation Under Rules

When an analysis type has explicit rules and selected tools, any AI
rewrite or generation should adapt to those same rules. The model should
not generate first and evaluate later as if the policy did not exist.

`ai_writing_probability` and `ai_hallucination_check` are intentionally
different checks. AI-writing probability estimates whether the article
sounds AI-assisted from style, rhythm, repetition, and generic phrasing.
AI/hallucination review looks for a different problem: vague authorities,
fabricated citation placeholders, unsupported factual density, and signs
that a model may have invented or blurred facts while drafting.

`fact_distortion_check` is optional because it can require stricter
claim review and may depend on external evidence. It should flag exact
numbers, absolute claims, sensitive statements, and unsupported factual
details. It must not pretend to be a full internet fact-check.

`logic_consistency_check` is built in. It checks whether the text
contradicts itself, jumps from premise to conclusion too quickly, or
uses cause-and-effect language without enough intermediate reasoning.

Recommended behavior:

- bind a product-defined role to the analysis type
- keep forbidden-content and safety rules explicit
- use deterministic evidence before hypotheses
- mark uncertain claims as hypotheses
- keep model and depth limitations visible in product architecture
