# ToraSEO 0.0.9 Smoke Tests

Use this checklist before tagging `v0.0.9`.

## Safety rules

- Do not paste API keys into issues, logs, screenshots, or chat.
- Use a disposable OpenRouter key for release testing when possible.
- Test on sites you own or on harmless public test domains first.
- Do not bypass `robots.txt`.
- If a test fails, record the exact step, visible error, and whether
  the failure happened in `MCP + Instructions` or `API + AI Chat` mode.

## Local startup

From the repo root on Windows PowerShell:

```powershell
npm.cmd run dev:app
```

For Bridge Mode testing, also run the MCP watcher in a second terminal:

```powershell
npm.cmd run dev:mcp
```

## Build checks

From the repo root:

```powershell
node --version
npm.cmd run build
npm.cmd run build:app
```

Expected result:

- Node.js should be `22.x` for release verification.
- `build` completes for `core` and `mcp`.
- `build:app` completes in a normal local environment. If it fails
  with `electron-vite` / `esbuild` `spawn EPERM`, retest from a clean
  terminal on Node 22 and note the environment because this has
  previously looked host-specific rather than TypeScript-specific.

## Test 1: App starts

1. Launch the app.
2. Confirm the top toolbar shows version `0.0.9`.
3. Open Settings.
4. Confirm the Language tab still works.
5. Confirm the Providers tab is visible.

Pass criteria:

- No blank window.
- No console error loop.
- Settings can be opened before running a scan.

## Test 2: API + AI Chat mode

1. On the home screen, select `API + AI Chat`.
2. If no provider is configured, confirm the app opens
   `Settings -> AI providers`.
3. Add an OpenRouter API key.
4. Confirm the key is masked after saving.
5. Leave the custom API endpoint empty unless testing a real proxy.
6. Add at least two OpenRouter model profiles and mark one as default.
7. Run the per-model test under each saved model profile, using a
   disposable key when possible.
8. Confirm the UI distinguishes a full structured-audit response from
   a plain model response.
9. Confirm provider-reported usage/cost appears when OpenRouter returns
   it.
10. Return to the home screen and confirm `API + AI Chat` is
   highlighted as the active execution mode.
11. Confirm the home screen shows a model selector and does not show a
   required `Check AI connection` button.
12. Switch the selected model and confirm `Site by URL` remains
   available.
13. Switch the UI language to Russian and restart the app.
14. Confirm `API + AI Chat` remains the active execution mode.
15. Select `Site by URL`.
16. Confirm the standalone AI chat window opens automatically.
17. Enter a test URL in the main window.
18. Select at least one safe tool.
19. Run the scan.
20. Confirm the AI chat automatically starts post-scan
    interpretation after the scan completes.
21. Confirm the interpretation is in Russian when the selected locale
    is `ru`.
22. Ask a follow-up question that requires explanation, for example:
    "Раскрой подробнее, что исправить первым и почему".
23. Switch policy to `strict_audit` and ask for recommendations.
24. Switch policy to `audit_plus_ideas` and ask for improvement ideas.
25. Click `Back to home` and confirm the standalone AI chat window
    switches to a session-ended state instead of staying active.

Pass criteria:

- Native mode works with Claude Desktop closed.
- Each saved model can be tested independently from Settings.
- Settings explain that per-model tests can spend tokens on paid
  models.
- Settings show usage/cost for a test when the provider reports it.
- The selected model is used by the analysis chat.
- The chat runs in its own window, not inside the main workspace.
- Returning home ends the chat session even if the chat window remains
  open.
- Post-scan interpretation starts automatically after a completed
  native scan.
- With `locale=ru`, the first interpretation and follow-up answers are
  in Russian.
- Follow-up answers are useful and grounded in scan facts, not a dry
  one-line reply.
- `strict_audit` contains no expert hypotheses.
- `audit_plus_ideas` labels hypotheses explicitly.
- Confirmed facts and expert hypotheses are rendered separately.
- Provider errors are user-readable if the key is invalid or missing.
- Returning to home leaves the chat window open with a session-ended
  state.

## Test 3: MCP + Instructions mode

1. Launch Claude Desktop with the ToraSEO MCP server configured.
2. Confirm the ToraSEO Claude Bridge Instructions are enabled.
3. On the home screen, select `MCP + Instructions`.
4. Select `Claude Desktop` in the program choice.
5. Confirm the guided setup rows are green.
6. Select `Site by URL`.
7. Enter a test URL.
8. Select several tools.
9. Start the scan.
10. Follow the copied Bridge prompt in Claude Desktop.
11. Confirm Claude calls `verify_skill_loaded` before tool execution.
12. Confirm tool facts return to the app workspace.

Pass criteria:

- No in-app AI chat window opens in `MCP + Instructions` mode.
- The bridge prompt does not expose the protocol token.
- Missing or outdated Claude Bridge Instructions produce a clear
  failure state.
- A successful handshake moves the scan forward.
- MCP facts appear in the analysis panel.
- Switching from `API + AI Chat` to `MCP + Instructions` closes the
  standalone AI chat window.

## Test 3b: MCP + Instructions Codex path

1. On the home screen, select `MCP + Instructions`.
2. Select `Codex` in the program choice.
3. Confirm the `Codex is running` row shows a red state when Codex is
   closed.
4. Click `Open Codex`.
5. Confirm the row turns green after the detector refreshes.
6. Confirm `Site by URL` unlocks after Codex is running.
7. Enter a test URL, select safe tools, and start the scan.
8. Paste the copied prompt into Codex.
9. Confirm the copied-prompt helper stays visible until dismissed or
   until real Codex scan data reaches the app.
10. Confirm the pasted scan prompt starts by asking Codex to use
   `$toraseo-codex-workflow`.
11. Confirm Codex calls `verify_codex_workflow_loaded` before any
   analyzer tool.
12. If Codex asks for ToraSEO MCP permissions, tick the chat/session
   approval checkbox and click Allow when that option is available.
13. Confirm `ToraSEO MCP is available to Codex` and
   `Codex Workflow Instructions are available` turn green only after
   that handshake succeeds.
14. Confirm every selected tool writes data into the app and that
   `Overview` / `Confirmed facts` render content from tool results,
   not just a Codex chat claim.

Pass criteria:

- The Codex path does not claim MCP or instruction-package verification
  from process detection alone.
- The app distinguishes `Codex Workflow Instructions` from the Claude
  Bridge Instructions ZIP.
- If the Codex Workflow Instructions token is missing or outdated, the
  app remains in handshake/error state and analyzer tools do not run.
- A successful Codex chat message is not enough; the app must actually
  show bridge facts after the scan completes.

## Test 4: Details window and PDF

1. Complete a scan with enough findings to fill the report.
2. Click the details button under the analysis panel.
3. Confirm the separate report window opens.
4. Close the report window.
5. Confirm the right analysis panel still works as fallback.
6. Start or keep a chat window open as well, so the app has main,
   details, and chat windows at the same time.
7. Click `Back to home` while the report and chat windows are open.
8. Confirm the report window stays open and shows an analysis-ended
   state.
9. Confirm the chat window stays open and shows a session-ended state.
10. Start a fresh native analysis and export PDF.
11. Export the standard document.
12. Export the presentation.
13. Open the PDF and inspect at least the first, middle, and last page.

Pass criteria:

- No clipped text.
- No missing facts/hypotheses sections.
- Long content paginates cleanly.
- Export cancellation does not show as an error.
- Document and presentation exports use the same structured report
  content as the PDF.

## Test 5: Release packaging

1. Confirm the release tag will be a plain app tag such as `v0.0.9`,
   not a package-specific tag.
2. Confirm `.github/workflows/release-app.yml` uses Node.js 22.
3. Confirm the workflow builds the app and attaches:
   - desktop installer assets
   - `toraseo-claude-bridge-instructions-v0.0.9.zip`
   - `toraseo-codex-workflow-v0.0.9.zip`
4. Confirm `release-skill.yml` and `release-codex-workflow.yml` are
   manual artifact workflows and do not create public releases.
5. After the GitHub Actions run, open the release page and confirm all
   expected assets are visible under one `v0.0.9` release.

Pass criteria:

- Users see one release page for app, Claude Bridge Instructions, and
  Codex Workflow Instructions.
- The instruction/skill ZIPs are present on the same release page as
  the app installer assets.
- No separate public release entry is created for the Claude or Codex
  instruction packages.

## Test 6: Regression pass

1. Change UI language and restart the app.
2. Check for updates from the toolbar.
3. Open About.
4. Run a scan with no URL and confirm validation blocks it.
5. Run a scan with no selected tools and confirm validation blocks it.
6. Remove provider config and confirm native chat shows a clear setup
   error instead of crashing.
7. Return to the home screen from each mode and confirm the selected
   execution mode, provider/model state, and inactive external windows
   behave consistently with the `0.0.7` baseline.

Pass criteria:

- Language persistence still works.
- Updater UI still renders release-note previews safely.
- No raw API key appears in UI, logs, or exported report.
- Validation failures are clear and non-destructive.

## Release decision

Do not tag `v0.0.9` until:

- all pass criteria above are met, or
- every failure is documented with a reproduction step and a fix plan.
