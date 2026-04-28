# Test Plan — Bridge Mode v0.0.7

> **Feature:** Bridge Mode (App + MCP + Skill three-component coordination)
> **Release:** v0.0.7 (App), v0.2.1 (MCP), v0.2.0 (Skill)
> **Plan version:** 1.0
> **Last updated:** 2026-04-28
> **Prerequisites:** Windows 10+ (others may work but untested),
>                    Claude Desktop installed and signed in,
>                    Node.js 22+ for `npm run dev`,
>                    PowerShell 5.1+

---

## Why this plan exists

Bridge Mode is the v0.0.7 architectural change that makes the
Desktop App require Claude Desktop + MCP server + Skill all
three to function. Before v0.0.7 the App ran SEO tools locally
in its own process, and the Claude dependency was social (we
*told* the user to install Claude); now the dependency is
technical — the App is a viewer/coordinator and Claude does the
analysis through MCP.

This plan covers the core scenarios where any one of the three
components is missing or in an unexpected state. Each scenario
has a documented expected outcome that, taken together, define
what "Bridge Mode works" means.

The plan is hand-executed because:

- It involves user-visible UI behavior (clipboard, Claude
  Desktop chat, App window state) that's hard to script.
- Each scenario tests how an LLM (Claude/Haiku) reacts to
  specific prompts — the "test" is partly the model's
  judgement, which automated harnesses can't easily verify.

---

## Preparation (before any scenario)

### Build everything fresh

Run these in order:

```powershell
cd C:\Users\user\Documents\Projects\toraseo

# Build MCP
cd mcp
npm run build
cd ..

# Build Skill ZIP
./scripts/build-skill.ps1 v0.2.0
# Should produce toraseo-skill-v0.2.0.zip in repo root

# (App is rebuilt by `npm run dev` automatically)
```

### Two terminals running

**Terminal A** — App in dev mode:

```powershell
cd C:\Users\user\Documents\Projects\toraseo\app
npm run dev
```

Leave this running. App window opens. DevTools open automatically.

**Terminal B** — for diagnostic commands. Don't run `npm run dev`
here.

### Verify pre-test state

In Terminal B:

```powershell
# 1. App is running and alive-file exists
Get-ChildItem -Path "$env:APPDATA" -Filter "app-alive.json" -Recurse -ErrorAction SilentlyContinue | Select-Object FullName, LastWriteTime, Length

# 2. No stale scan-state file
Get-ChildItem -Path "$env:APPDATA" -Filter "current-scan.json" -Recurse -ErrorAction SilentlyContinue | Select-Object FullName, LastWriteTime, Length

# 3. MCP code is fresh (these grep should match)
findstr /C:"verify_skill_loaded" "C:\Users\user\Documents\Projects\toraseo\mcp\dist\index.js"
findstr /C:"app_running_no_scan" "C:\Users\user\Documents\Projects\toraseo\mcp\dist\verifySkillLoaded.js"
findstr /C:"probeAppAlive" "C:\Users\user\Documents\Projects\toraseo\mcp\dist\aliveFile.js"
```

If any check fails, fix before running scenarios.

### Restart Claude Desktop with fresh MCP

Always start each scenario from a clean Claude Desktop. MCP is
spawned by Claude Desktop and held in memory; rebuilds don't
take effect until restart.

```powershell
# Kill all Claude + MCP processes
Get-WmiObject Win32_Process | Where-Object { $_.CommandLine -like "*toraseo*mcp*dist*index*" } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
Get-Process claude -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 3

# Open Claude Desktop via shortcut
```

---

## Scenarios

### Scenario 1 — Skill NOT installed, App running, auto-prompt (NEGATIVE test)

**Setup:**

- Skill `toraseo` is NOT installed in Claude Desktop (Settings →
  Skills → confirm absent).
- App is running (Terminal A's `npm run dev`).

**Steps:**

1. In App's DevTools console, run:
   ```js
   const r = await window.toraseo.bridge.startScan("https://bozheslav.ru", ["check_robots_txt"]);
   console.log(r.prompt);
   ```
2. Verify the printed prompt:
   - Starts with `/toraseo bridge-mode`
   - Contains "Приложение ToraSEO запущено и ожидает анализа сайта https://bozheslav.ru"
   - Does NOT contain `verify_skill_loaded`
   - Does NOT contain `bridge-v1-2026-04-27`
3. In Claude Desktop, open a **new chat**.
4. Press Ctrl+V (the prompt is in clipboard from step 1), Enter.
5. Wait 15 seconds without doing anything.
6. In Terminal B, read state-file:
   ```powershell
   Get-Content -LiteralPath "C:\Users\user\AppData\Roaming\@toraseo\app\current-scan.json" -Raw
   ```

**Expected outcome:**

- Claude does NOT complete a SEO scan. Without the Skill, Claude
  has no instruction to call `verify_skill_loaded` and no token
  to pass anyway. Claude may say something general (e.g. "I'll
  help you with SEO basics") or refuse / ask a clarifying
  question.
- After 10 seconds, App's handshake_timeout fires. State-file:
  - `status: "error"`
  - `error.code: "handshake_timeout"`
  - `handshake.status: "timeout"`
- After ~15 seconds total, the state-file may already be deleted
  by the cleanup grace timer (5s after error). Either is fine —
  the goal is "scan didn't complete with results".

**Why this scenario matters:** without this gate, Bridge Mode
would silently complete using only chat-supplied data, which is
the security gap closed by removing the token from the prompt.

---

### Scenario 2 — Skill NOT installed, App running, free-form prompt (NEGATIVE test)

**Setup:** same as Scenario 1.

**Steps:**

1. In App's DevTools console:
   ```js
   await window.toraseo.bridge.startScan("https://bozheslav.ru", ["check_robots_txt"]);
   ```
2. In Claude Desktop, **new chat**, **type by hand** (don't paste):

   > я запустил приложение ТораСэо, проанализируй
   > https://bozheslav.ru через него

3. Wait for Claude's full response.
4. Wait 15 seconds total since startScan, then read state-file.

**Expected outcome:** same as Scenario 1. Without the Skill,
Claude has no `/toraseo` trigger interpretation, no token, no
handshake. The transliterated "ТораСэо" doesn't matter because
the Skill is what would teach Claude to recognize it.

---

### Scenario 3 — Skill installed, App running, auto-prompt (HAPPY PATH)

**Setup:**

- Install Skill ZIP `toraseo-skill-v0.2.0.zip` via Claude Desktop
  Settings → Skills → +.
- Verify Skill description in Settings ends with "Supports Bridge
  Mode handshake when ToraSEO Desktop App is running an active
  scan."
- Toggle Skill ON.
- Restart Claude Desktop (via the kill commands in preparation).
- App is running.

**Steps:**

1. In App's DevTools:
   ```js
   await window.toraseo.bridge.startScan("https://bozheslav.ru", ["check_robots_txt"]);
   ```
2. In Claude Desktop, **new chat**, Ctrl+V, Enter.
3. Watch Claude's response in real time.
4. After Claude finishes, read state-file.

**Expected outcome:**

- Claude activates the toraseo skill (visible in tool-use blocks
  or a "Skill: toraseo" indicator).
- Claude's first tool call is `verify_skill_loaded` with token
  argument `"bridge-v1-2026-04-27"` (visible in the tool-use
  expansion).
- MCP returns `{ok: true, scanId, url, selectedTools, message}`.
- Claude calls `check_robots_txt` next.
- Claude writes a short summary in chat.
- State-file:
  - `status: "complete"`
  - `handshake.status: "verified"`
  - `handshake.receivedToken: "bridge-v1-2026-04-27"`
  - `buffer.check_robots_txt.status: "complete"` with `data` and
    `summary` populated
- Total elapsed time: ~5-15 seconds (most of which is human
  paste latency).

---

### Scenario 4 — Skill installed, App running, free-form prompt (HAPPY PATH)

**Setup:** same as Scenario 3.

**Steps:**

1. In App's DevTools:
   ```js
   await window.toraseo.bridge.startScan("https://bozheslav.ru", ["check_robots_txt"]);
   ```
2. In Claude Desktop, **new chat**, **type by hand**:

   > я запустил приложение ТораСэо, проанализируй
   > https://bozheslav.ru

3. Wait for full response, read state-file.

**Expected outcome:** same as Scenario 3. The Skill recognizes
"ТораСэо" + URL + "приложение" as a Bridge Mode trigger via §2.1,
so Claude calls `verify_skill_loaded` even though the auto-prompt
wasn't pasted. Bridge Mode completes end-to-end.

---

### Scenario 5 — Skill installed, App NOT running (NEGATIVE-INFORMATIVE)

**Setup:**

- Skill installed (toggle ON).
- App is **closed**: stop `npm run dev` (Ctrl+C in Terminal A),
  wait 3 seconds.
- Verify alive-file is gone:
  ```powershell
  Get-ChildItem -Path "$env:APPDATA" -Filter "app-alive.json" -Recurse -ErrorAction SilentlyContinue
  ```
  Should return nothing.

**Steps:**

1. In Claude Desktop, **new chat**:

   > /toraseo проверь https://bozheslav.ru

2. Wait for Claude's full response.

**Expected outcome:**

- Claude calls `verify_skill_loaded("bridge-v1-2026-04-27")`.
- MCP returns `{ok: false, error: "app_not_running", reason: "no_file", ...}`.
- Per SKILL.md §2.3.1, since the user used `/toraseo` (a Bridge
  Mode trigger) but the app isn't running:
  - Claude tells the user the app isn't running.
  - Claude offers a fallback (`ask_user_input_v0` with options
    "I'll start the app" / "Run a regular audit anyway") OR
    text-prompts the user to choose.
- Claude does NOT silently run a Mode A audit.

---

### Scenario 6 — Skill installed, App NOT running, no app mention (FALLTHROUGH)

**Setup:** same as Scenario 5 (App closed).

**Steps:**

1. In Claude Desktop, **new chat**:

   > Проанализируй SEO для https://bozheslav.ru

   No mention of app/ToraSEO/skill — just a URL and SEO request.

2. Wait for Claude's full response.

**Expected outcome:**

- Claude may or may not call `verify_skill_loaded` (the trigger
  in §2.1 is "app + URL", not just "URL"). Both are acceptable.
- If called: MCP returns `app_not_running`. Per SKILL.md §2.3.1,
  since the user did NOT mention the app, Claude proceeds
  silently with Mode A workflow (§3).
- If not called: Claude proceeds directly with Mode A workflow.
- Either way, Claude eventually runs a regular audit using the
  six analyzer tools and gives a SEO report in chat.

---

### Scenario 7 — Skill installed, App running, no Scan clicked (BRANCH POINT)

**Setup:**

- Skill installed (toggle ON).
- App running (`npm run dev` again, Terminal A).
- Verify alive-file exists:
  ```powershell
  Get-ChildItem -Path "$env:APPDATA" -Filter "app-alive.json" -Recurse | Select-Object FullName, LastWriteTime
  ```
- Verify no scan-state file:
  ```powershell
  Get-ChildItem -Path "$env:APPDATA" -Filter "current-scan.json" -Recurse
  ```
  Should be empty.

**Steps:**

1. In Claude Desktop, **new chat**:

   > /toraseo проверь https://bozheslav.ru

2. Wait for Claude's full response.

**Expected outcome:**

- Claude calls `verify_skill_loaded`.
- MCP returns `{ok: false, error: "app_running_no_scan", appPid, appVersion, ...}`.
- Per SKILL.md §2.3.2, Claude uses `ask_user_input_v0` to give
  the user two options:
  - "I want results in chat" / "Хочу получить результат прямо в чате"
  - "I'll click Scan in the app" / "Я нажму Сканировать в приложении"
- Claude does NOT call any analyzer tools yet.

**Sub-test 7a:** user picks "I'll click Scan".

3. Click the option in Claude.
4. Verify Claude responds with something like "OK, click Scan
   and let me know when done" — and does NOT call any tools.
5. In App's DevTools:
   ```js
   await window.toraseo.bridge.startScan("https://bozheslav.ru", ["check_robots_txt"]);
   ```
6. In Claude (same chat) type: "готово".
7. Verify Claude calls `verify_skill_loaded` again, gets
   `ok: true`, runs `check_robots_txt`, summarizes results.

**Sub-test 7b:** user picks "I want results in chat" (use a
fresh chat for this).

3. In a new chat, redo steps 1-2.
4. Click "I want results in chat".
5. Verify Claude runs Mode A workflow (`scan_site_minimal` then
   the rest), gives a regular SEO report in chat.
6. App is unaffected — no scan started, alive-file unchanged.

---

### Scenario 8 — App crash, stale alive-file (DURABILITY)

**Setup:**

- App is running (Terminal A).
- Skill installed.

**Steps:**

1. Note the App's PID:
   ```powershell
   Get-Content -LiteralPath "C:\Users\user\AppData\Roaming\@toraseo\app\app-alive.json" -Raw
   ```
   Note the `pid` field.
2. Kill the App ungracefully:
   ```powershell
   Stop-Process -Id <pid-from-step-1> -Force
   ```
   (Don't use Ctrl+C in `npm run dev` — that's graceful.)
3. Verify alive-file is **still on disk** (App didn't get to clean up):
   ```powershell
   Get-Content -LiteralPath "C:\Users\user\AppData\Roaming\@toraseo\app\app-alive.json" -Raw
   ```
4. In Claude Desktop, **new chat**:

   > /toraseo проверь https://bozheslav.ru

**Expected outcome:**

- Claude calls `verify_skill_loaded`.
- MCP probes alive-file, sees the PID is dead (`process.kill(pid, 0)`
  throws ESRCH), returns `{ok: false, error: "app_not_running", reason: "stale_pid", ...}`.
- Per SKILL.md §2.3.1, Claude tells the user the app isn't
  running.
- Stale alive-file remains on disk; will be overwritten when App
  starts again.

---

### Scenario 9 — Slash-only command (TRIGGER TEST)

**Setup:**

- Skill installed.
- App running.
- App's Scan clicked (state-file in `awaiting_handshake`).

**Steps:**

1. In App's DevTools:
   ```js
   await window.toraseo.bridge.startScan("https://bozheslav.ru", ["check_robots_txt"]);
   ```
2. In Claude Desktop, **new chat**, type just:

   > /toraseo

3. Watch Claude's behavior.

**Expected outcome:**

- Claude treats `/toraseo` as a Bridge Mode trigger per SKILL.md
  §1 / §2.1 — calls `verify_skill_loaded`, gets `ok: true`,
  proceeds with the scan parameters from the state-file.
- Claude does NOT ask for the URL or tools — both come from
  the state-file via `verify_skill_loaded`'s response.

---

### Scenario 10 — Transliterated mention (TRIGGER TEST)

**Setup:**

- Skill installed.
- App running.
- App's Scan clicked.

**Steps:**

1. `bridge.startScan` for some URL.
2. In Claude Desktop, **new chat**, type:

   > Тора СЕО, проверь сайт пожалуйста

   Note: lowercase "сео", space between words.

**Expected outcome:**

- Claude recognizes "Тора СЕО" as a ToraSEO mention per SKILL.md
  §1 trigger list, treats it as a Bridge Mode signal alongside
  the URL implied by the active scan.
- Calls `verify_skill_loaded`, gets `ok: true`, proceeds.

This scenario specifically tests the transliteration coverage —
"Тора СЕО" is the most common Russian phonetic spelling.

---

## Sign-off criteria

The release ships when **all 10 scenarios PASS**. Failures
should be triaged:

- **Negative test passes (i.e. expected behavior is "no scan")
  but a scan completed:** blocker. Security/architecture flaw.
- **Happy path test fails (i.e. scan was supposed to complete
  but didn't):** blocker. Core feature broken.
- **Edge case fails (Scenario 8, 10):** non-blocker if explained
  by environment quirks, but document the discrepancy.

Tester records each scenario's outcome in their results file
under `results/`.
