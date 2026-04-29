# ToraSEO 0.0.7 Smoke Tests

Use this checklist before tagging `v0.0.7`.

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
2. Confirm the top toolbar shows version `0.0.7`.
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
5. Add at least two OpenRouter model profiles and mark one as default.
6. Run `Test default model` from Settings only, using a disposable key
   when possible.
7. Return to the home screen and confirm `API + AI Chat` is
   highlighted as the active execution mode.
8. Confirm the home screen shows a model selector and does not show a
   required `Check AI connection` button.
9. Switch the selected model and confirm `Site by URL` remains
   available.
10. Select `Site by URL`.
11. Confirm the standalone AI chat window opens automatically.
12. Enter a test URL in the main window.
13. Select at least one safe tool.
14. Run the scan.
15. Ask the AI chat for a concise audit interpretation.
16. Switch policy to `strict_audit` and ask for recommendations.
17. Switch policy to `audit_plus_ideas` and ask for improvement ideas.

Pass criteria:

- Native mode works with Claude Desktop closed.
- The provider call succeeds from Settings diagnostics.
- The selected model is used by the analysis chat.
- The chat runs in its own window, not inside the main workspace.
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
9. Confirm Codex calls `verify_codex_workflow_loaded` before any
   analyzer tool.
10. Confirm `ToraSEO MCP is available to Codex` and
   `Codex Workflow Instructions are available` turn green only after
   that handshake succeeds.

Pass criteria:

- The Codex path does not claim MCP or instruction-package verification
  from process detection alone.
- The app distinguishes `Codex Workflow Instructions` from the Claude
  Bridge Instructions ZIP.
- If the Codex Workflow Instructions token is missing or outdated, the
  app remains in handshake/error state and analyzer tools do not run.

## Test 4: Details window and PDF

1. Complete a scan with enough findings to fill the report.
2. Click the details button under the analysis panel.
3. Confirm the separate report window opens.
4. Close the report window.
5. Confirm the right analysis panel still works as fallback.
6. Click `Back to home` while the report window is open.
7. Confirm the report window stays open and shows an analysis-ended
   state.
8. Start a fresh native analysis and export PDF.
9. Export the standard document.
10. Export the presentation.
11. Open the PDF and inspect at least the first, middle, and last page.

Pass criteria:

- No clipped text.
- No missing facts/hypotheses sections.
- Long content paginates cleanly.
- Export cancellation does not show as an error.
- Document and presentation exports use the same structured report
  content as the PDF.

## Test 5: Regression pass

1. Change UI language and restart the app.
2. Check for updates from the toolbar.
3. Open About.
4. Run a scan with no URL and confirm validation blocks it.
5. Run a scan with no selected tools and confirm validation blocks it.
6. Remove provider config and confirm native chat shows a clear setup
   error instead of crashing.

Pass criteria:

- Language persistence still works.
- Updater UI still renders release-note previews safely.
- No raw API key appears in UI, logs, or exported report.
- Validation failures are clear and non-destructive.

## Release decision

Do not tag `v0.0.7` until:

- all pass criteria above are met, or
- every failure is documented with a reproduction step and a fix plan.
