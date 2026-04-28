# Test Results — Bridge Mode v0.0.7

> **Tester:** [your name]
> **Date:** [YYYY-MM-DD]
> **Plan:** test-plan-v0.0.7.md
> **Build:** [git rev-parse HEAD]
> **Environment:** [Windows 11 / macOS 14 / etc.]

---

## Summary

- Total scenarios: 10
- Passed: __ / 10
- Failed: __ / 10
- Blocked: __ / 10
- Notes: [overall impressions; was this a clean run, were there
         retakes, anything weird]

---

## Scenario 1 — Skill NOT installed, App running, auto-prompt

**Verdict:** PASS / FAIL

**What happened:**

- [ ] Prompt printed correctly (no token, no verify_skill_loaded mention)
- [ ] Claude did not complete the scan
- [ ] State-file went into error / handshake_timeout

**Notes / deviations:**

[paste relevant chat excerpts, state-file contents, screenshots]

---

## Scenario 2 — Skill NOT installed, App running, free-form prompt

**Verdict:** PASS / FAIL

**What happened:**

[as above]

---

## Scenario 3 — Skill installed, App running, auto-prompt (HAPPY PATH)

**Verdict:** PASS / FAIL

**What happened:**

- [ ] Skill activated
- [ ] verify_skill_loaded called with token "bridge-v1-2026-04-27"
- [ ] MCP returned ok: true
- [ ] check_robots_txt called and completed
- [ ] State-file in "complete" with buffer populated

**Final state-file contents:**

```json
[paste]
```

---

## Scenario 4 — Skill installed, App running, free-form prompt (HAPPY PATH)

**Verdict:** PASS / FAIL

**What happened:**

[as above]

---

## Scenario 5 — Skill installed, App NOT running

**Verdict:** PASS / FAIL

**What happened:**

- [ ] verify_skill_loaded returned app_not_running
- [ ] Claude offered fallback choice (didn't silently audit)

**MCP response received by Claude:**

```json
[paste]
```

---

## Scenario 6 — App NOT running, no app mention (FALLTHROUGH)

**Verdict:** PASS / FAIL

**What happened:**

- [ ] Claude proceeded with Mode A audit silently
- [ ] No mention of "app not running" in the response

---

## Scenario 7 — App running, no Scan clicked (BRANCH POINT)

**Verdict:** PASS / FAIL

### 7a — User picks "I'll click Scan"

- [ ] Claude offered ask_user_input_v0 with two options
- [ ] On Option B, Claude waited (no tool calls)
- [ ] After Scan + "готово", Claude resumed and completed scan

### 7b — User picks "I want results in chat"

- [ ] Claude proceeded with Mode A workflow
- [ ] App's state-file remained empty (no scan started)

---

## Scenario 8 — App crash, stale alive-file

**Verdict:** PASS / FAIL

**What happened:**

- [ ] After force-kill, alive-file remained on disk
- [ ] verify_skill_loaded returned app_not_running with reason: stale_pid
- [ ] Claude told user the app isn't running

---

## Scenario 9 — Slash-only command

**Verdict:** PASS / FAIL

**What happened:**

- [ ] Claude treated /toraseo as Bridge Mode trigger
- [ ] verify_skill_loaded called
- [ ] Scan completed using params from state-file

---

## Scenario 10 — Transliterated mention

**Verdict:** PASS / FAIL

**What happened:**

- [ ] Claude recognized "Тора СЕО" as a ToraSEO mention
- [ ] Bridge Mode triggered

---

## Issues found

[list any bugs, surprises, or "expected outcome was wrong"
moments that need plan revisions]

## Recommendations

[shipping yes/no, what to fix before next attempt, etc.]
