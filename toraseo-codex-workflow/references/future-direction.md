# Future Direction

Use this reference for roadmap or architecture work around Codex
instructions.

## Long-term direction

The Codex package is expected to evolve beyond a simple bridge helper.
It should become the instruction system for richer, guided ToraSEO task
flows, including future gamified experiences where a plain `100%` score
is not the whole story.

## Design constraints

- Keep the entry point small and durable.
- Move heavy guidance into references, scripts, or other targeted
  resources.
- Avoid designs that require Codex to ingest a giant monolithic file on
  every task.
- Treat handshake verification, workflow guidance, and domain knowledge
  as separate layers.

## Open questions

- Which parts should stay as human-readable references versus scripts?
- What should become file-based installation checks versus session-based
  runtime checks?
- How should future game-like task systems be represented without
  bloating the core entry point?

## Future Documentation Tasks

- Create a role guide for text analysis. It should explain which AI
  reviewer roles work best for different text types: SEO editor for site
  articles, fact-checker for claim-heavy material, medical/legal/finance
  editor for sensitive topics, community moderator for Reddit-style
  posts, product marketer for landing and commercial text, and
  plain-language editor for expert content that needs simplification.
- Add a small "analysis cost" note to future result output when provider
  APIs expose usage data: prompt tokens, completion tokens, total tokens,
  and estimated cost where possible.
- Avoid a "token efficiency" slider in the sidebar for now. The selected
  model and its configured reasoning/capability level already define the
  main intelligence budget. ToraSEO should show usage after the analysis
  and keep prompts compact, rather than asking the user to tune token
  spending manually before every run.
- Keep the first analytics-tool catalog as a local versioned registry in
  the desktop app. If formulas, tool history, user presets, or team
  sharing move to a backend later, PostgreSQL is a good fit for the
  authoritative store. The desktop UI should not require a local
  PostgreSQL service just to display a read-only reference table.
