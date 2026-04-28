/**
 * verify_skill_loaded — the Bridge Mode handshake tool.
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
 * fields being in the user's prompt — the prompt only references
 * the scan abstractly.
 *
 * On failure, it writes the error to the state-file (so the App
 * knows what went wrong) and returns a structured error to Claude.
 */

import { z } from "zod";
import { applyHandshake } from "./stateFile.js";
import { BRIDGE_PROTOCOL_TOKEN } from "./constants.js";

/**
 * Input schema. The token is the only argument — Claude reads it
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
 * The shape of the success response is intentionally rich (scanId,
 * url, selectedTools) so Claude doesn't need any other context to
 * proceed with the scan. The error response includes a reason
 * code Claude can use to give the user a useful message.
 */
export async function verifySkillLoadedHandler({ token }: { token: string }): Promise<{
  isError?: boolean;
  content: Array<{ type: "text"; text: string }>;
}> {
  const { result, state } = await applyHandshake(token, BRIDGE_PROTOCOL_TOKEN);

  if (result === "no_scan") {
    // Either no state-file at all, or it's not in awaiting_handshake.
    // Most common cause: user mentioned ToraSEO but didn't actually
    // click Scan in the app, or app isn't running.
    return {
      isError: true,
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              ok: false,
              error: "no_active_scan",
              message:
                "No scan is currently waiting. The user may not have " +
                "the ToraSEO app open, or hasn't clicked Scan yet. Ask " +
                "them to start a scan in the app first.",
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
              expected: BRIDGE_PROTOCOL_TOKEN,
              received: token,
              message:
                "The Skill protocol token does not match. The user has " +
                "an outdated SKILL.md file. They need to update the " +
                "ToraSEO Skill — see the app's onboarding screen for " +
                "instructions, or use the 'Reinstall Skill' button.",
            },
            null,
            2,
          ),
        },
      ],
    };
  }

  // Success — return scan parameters so Claude can proceed.
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(
          {
            ok: true,
            scanId: state!.scanId,
            url: state!.url,
            selectedTools: state!.selectedTools,
            message:
              "Handshake verified. Now call each tool in selectedTools " +
              "(in any order, but typically in the order listed). " +
              "Each tool's results will be displayed in the ToraSEO app " +
              "automatically. After all tools complete, provide " +
              "recommendations to the user in chat based on the data.",
          },
          null,
          2,
        ),
      },
    ],
  };
}
