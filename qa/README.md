# QA — ToraSEO

This directory holds manual test plans and execution results for
the ToraSEO project. The structure mirrors how QA teams in larger
shops organize testing: each feature has its own subfolder with
a versioned plan and a `results/` archive of each run.

## Structure

```
qa/
├── README.md                          # this file
└── <feature>/
    ├── test-plan-v<X.Y.Z>.md          # what to test, how, expected outcome
    ├── test-results-template.md       # blank form for recording a run
    └── results/
        └── <YYYY-MM-DD>-<tester>.md   # filled-in results from each run
```

A test plan is a contract — it lists the scenarios that must pass
before a release ships. A test result is the record of running
that plan, including any deviations and the tester's verdict.

## Current feature areas

- `bridge-mode/` — Bridge Mode handshake (App + MCP + Skill
  three-component coordination), introduced in v0.0.7.

## How to run a test plan

1. Read the plan top-to-bottom. Note the prerequisites — every
   plan starts with a "preparation" section that lists the env
   you need (App rebuilt, Skill installed/uninstalled, etc.).
2. Copy `test-results-template.md` to `results/<date>-<your-name>.md`.
3. For each scenario, run the steps and record:
   - What actually happened
   - PASS / FAIL verdict
   - Any deviations from the expected outcome
4. After the full run, write a short summary at the top of your
   results file: how many passed, how many failed, blocking
   issues if any.

A failed test does not necessarily block release — sometimes the
expected outcome is wrong and needs revising. Note the discrepancy
in the results file and discuss with Mikhail before changing the
plan.

## Conventions

- Test plan filenames are versioned: `test-plan-v0.0.7.md`. When
  the plan changes substantially, bump the version and keep the
  old plans archived (don't delete them — they're history of how
  testing evolved).
- Result filenames are dated and signed: `2026-04-28-mikhail.md`.
  One file per testing session. Multiple runs in one day get
  numbered: `2026-04-28-mikhail-2.md`.
- Russian commit messages are fine for QA artifacts (Mikhail's
  working language), but the plan content itself is in English to
  keep the project consistent.
