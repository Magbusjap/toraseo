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
