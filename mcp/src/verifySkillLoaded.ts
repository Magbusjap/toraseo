/**
 * verify_skill_loaded вЂ” the Bridge Mode handshake tool.
 *
 * Called by Claude as the first action when handling a ToraSEO scan
 * request. Confirms that:
 *   1. SKILL.md is loaded (otherwise Claude wouldn't know to call it)
 *   2. The token in SKILL.md matches the one MCP expects (otherwise
 *      Skill is outdated relative to MCP+App)
 *   3. There IS an active scan waiting (App created the state-file)
 *
 * On success, the tool returns the scan parameters (url,
 * selectedTools) to Claude, so Claude can proceed without those
 * fields being in the user's prompt вЂ” the prompt only references
 * the scan abstractly.
 *
 * On failure, it returns a structured error to Claude. The error
 * includes a reason code so Claude can give the user a useful
 * actionable message:
 *
 *   - app_not_running        вЂ” App process isn't alive (no alive-file
 *                              or stale PID). Tell user to start app.
 *   - app_running_no_scan    вЂ” App is alive but the user hasn't
 *                              clicked Scan yet. Offer choice: scan
 *                              in chat (Mode A fallback) or wait for
 *                              the user to click Scan.
 *   - wrong_state            вЂ” State-file exists but isn't in
 *                              awaiting_handshake (e.g. previous
 *                              scan still in_progress or terminal).
 *   - token_mismatch         вЂ” Skill version is out of sync with MCP.
 *                              Tell user to update the Skill.
 */

import { z } from "zod";
import { applyHandshake, readState } from "./stateFile.js";
import { probeAppAlive } from "./aliveFile.js";
import { BRIDGE_PROTOCOL_TOKEN } from "./constants.js";
import { readActiveInputMarkdown } from "./workspace.js";

/**
 * Input schema. The token is the only argument вЂ” Claude reads it
 * from SKILL.md and passes it verbatim.
 */
export const verifySkillLoadedInputSchema = {
  token: z
    .string()
    .describe(
      "The bridge protocol token from SKILL.md. Must match exactly. " +
        "Format: bridge-vN-YYYY-MM-DD",
    ),
};

/**
 * MCP handler. Takes the token, applies handshake against the
 * state-file, returns success info or a structured error to Claude.
 *
 * Order of checks:
 *   1. Try the handshake (against current-scan.json).
 *   2. If that returns "no_scan", probe the alive-file to refine
 *      the diagnosis: app_not_running vs app_running_no_scan.
 *   3. If "mismatch", surface token_mismatch.
 *   4. If "verified", return scan parameters.
 *
 * The shape of the success response is intentionally rich (scanId,
 * url, selectedTools) so Claude doesn't need any other context to
 * proceed with the scan. The error response includes a reason
 * code Claude can use to give the user a useful message.
 */
export async function verifySkillLoadedHandler({ token }: { token: string }): Promise<{
  isError?: boolean;
  content: Array<{ type: "text"; text: string }>;
}> {
  const { result, state } = await applyHandshake(
    token,
    BRIDGE_PROTOCOL_TOKEN,
    "claude",
  );

  if (result === "no_scan") {
    // Either no state-file at all, or it's not in awaiting_handshake.
    // Probe the alive-file to figure out which sub-case applies.
    const alive = await probeAppAlive();

    if (alive.kind === "not_running") {
      // App is not running at all.
      return {
        isError: true,
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                ok: false,
                error: "app_not_running",
                reason: alive.reason,
                message:
                  "The ToraSEO Desktop App is not running. " +
                  "Tell the user: please start the ToraSEO app, " +
                  "then continue. If they want a regular SEO audit " +
                  "without the app, you can offer that as an " +
                  "alternative вЂ” but ask them first; do not silently " +
                  "fall back.",
              },
              null,
              2,
            ),
          },
        ],
      };
    }

    // App is running. State-file may be missing entirely (no scan
    // started) or present-but-not-awaiting (previous scan in
    // terminal state).
    const stateNow = await readState();
    if (stateNow === null) {
      // App alive, no scan started.
      return {
        isError: true,
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                ok: false,
                error: "app_running_no_scan",
                appPid: alive.pid,
                appVersion: alive.version,
                message:
                  "The ToraSEO Desktop App is running, but the user " +
                  "hasn't clicked the Scan button yet. " +
                  "Use ask_user_input_v0 to give them two choices: " +
                  "(a) 'I want results in chat' вЂ” fall back to a " +
                  "regular Mode A audit using the URL they mentioned. " +
                  "(b) 'I'll click Scan in the app' вЂ” pause and wait " +
                  "for the user's confirmation that they clicked it; " +
                  "do nothing until they message again. Do NOT start " +
                  "any tool calls without explicit user choice.",
              },
              null,
              2,
            ),
          },
        ],
      };
    }

    // App alive, state file exists but not in awaiting_handshake.
    return {
      isError: true,
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              ok: false,
              error: "wrong_state",
              state: stateNow.status,
              message:
                "The app already has a scan in another state " +
                `(${stateNow.status}). Tell the user to cancel ` +
                "or finish the existing scan in the app, then click " +
                "Scan again with the URL they want, and resend the " +
                "prompt.",
            },
            null,
            2,
          ),
        },
      ],
    };
  }

  if (result === "mismatch") {
    return {
      isError: true,
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              ok: false,
              error: "token_mismatch",
              message:
                "The Claude Bridge Instructions token does not match. The user has " +
                "an outdated SKILL.md file. They need to update the " +
                "ToraSEO Claude Bridge Instructions: download the latest skill ZIP from " +
                "GitHub Releases, then in Claude Desktop go to " +
                "Settings в†’ Skills, delete the existing toraseo instructions, " +
                "and install the new ZIP. For security, the expected token " +
                "is not returned by MCP.",
            },
            null,
            2,
          ),
        },
      ],
    };
  }

  // Success вЂ” return scan parameters so Claude can proceed.
  if (result === "wrong_client") {
    return {
      isError: true,
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              ok: false,
              error: "wrong_bridge_client",
              expected: state?.bridgeClient ?? "unknown",
              message:
                "The active ToraSEO scan was started for a different " +
                "external agent. Use the matching bridge prompt and " +
                "handshake tool for that agent.",
            },
            null,
            2,
          ),
        },
      ],
    };
  }

  const workspaceText = await readActiveInputMarkdown(state);

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(
          {
            ok: true,
            scanId: state!.scanId,
            url: state!.url,
            analysisType: state!.analysisType ?? "site_by_url",
            input: state!.input
              ? {
                  action: state!.input.action,
                  topic: state!.input.topic,
                  analysisRole: state!.input.analysisRole || "default",
                  hasText: Boolean(
                    workspaceText?.trim() || state!.input.text?.trim(),
                  ),
                  textLength:
                    workspaceText?.length ?? state!.input.text?.length ?? 0,
                  selectedAnalysisTools: state!.input.selectedAnalysisTools,
                }
              : undefined,
            workspace: state!.workspace
              ? {
                  inputFile: state!.workspace.inputFile,
                  metaFile: state!.workspace.metaFile,
                  resultsDir: state!.workspace.resultsDir,
                  expiresAt: state!.workspace.expiresAt,
                }
              : undefined,
            selectedTools: state!.selectedTools,
            message:
              "Handshake verified. Now call each tool in selectedTools " +
              "(in any order, but typically in the order listed). " +
              "Each tool's results will be displayed in the ToraSEO app " +
              "automatically. If analysisType is article_text, do not ask " +
              "the user to paste the article into chat; the selected MCP " +
              "tools read input.md from the temporary ToraSEO workspace. " +
              "After all tools complete, provide " +
              "recommendations to the user in chat based on the data.",
          },
          null,
          2,
        ),
      },
    ],
  };
}

