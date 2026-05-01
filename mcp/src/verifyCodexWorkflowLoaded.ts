/**
 * verify_codex_workflow_loaded — Codex Bridge Mode handshake.
 *
 * This mirrors the Claude Bridge handshake, but uses a Codex-specific
 * token that lives only in the Codex Workflow Instructions package and
 * the MCP server. The desktop prompt never contains the token.
 */

import { z } from "zod";
import { probeAppAlive } from "./aliveFile.js";
import { CODEX_WORKFLOW_PROTOCOL_TOKEN } from "./constants.js";
import { writeCodexSetupVerification } from "./codexSetupVerification.js";
import { applyHandshake, readState } from "./stateFile.js";
import { readActiveInputMarkdown } from "./workspace.js";

export const verifyCodexWorkflowLoadedInputSchema = {
  token: z
    .string()
    .describe(
      "The Codex Workflow Instructions protocol token. Must match exactly. " +
        "Format: codex-workflow-vN-YYYY-MM-DD. If the tool returns " +
        "token_mismatch, do not ask the user to reveal or paste a token; " +
        "tell them to update or reinstall the ToraSEO Codex Workflow " +
        "Instructions package and restart Codex.",
    ),
};

const TOKEN_MISMATCH_MESSAGE =
  "The Codex Workflow Instructions token does not match. Do not ask the " +
  "user to reveal, copy, or paste the expected token. This means the " +
  "current Codex session is using an outdated or different ToraSEO Codex " +
  "Workflow Instructions package, or the package was not loaded. Ask the " +
  "user to update or reinstall `toraseo-codex-workflow`, restart Codex, " +
  "start a new Codex session, and run the setup check again.";

export async function verifyCodexWorkflowLoadedHandler({
  token,
}: {
  token: string;
}): Promise<{
  isError?: boolean;
  content: Array<{ type: "text"; text: string }>;
}> {
  const { result, state } = await applyHandshake(
    token,
    CODEX_WORKFLOW_PROTOCOL_TOKEN,
    "codex",
  );

  if (result === "no_scan") {
    if (token !== CODEX_WORKFLOW_PROTOCOL_TOKEN) {
      return jsonError({
        ok: false,
        error: "token_mismatch",
        doNotAskUserForToken: true,
        nextStep: "update_or_reinstall_codex_workflow_instructions",
        message: TOKEN_MISMATCH_MESSAGE,
      });
    }

    const alive = await probeAppAlive();
    if (alive.kind === "not_running") {
      return jsonError({
        ok: false,
        error: "app_not_running",
        reason: alive.reason,
        message:
          "The ToraSEO Desktop App is not running. Ask the user to start " +
          "the app, choose MCP + Instructions -> Codex, click Scan, then paste " +
          "the generated Codex bridge prompt again.",
      });
    }

    await writeCodexSetupVerification({
      verifiedAt: new Date().toISOString(),
      appPid: alive.pid,
      appVersion: alive.version,
    });

    const stateNow = await readState();
    if (stateNow === null) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                ok: true,
                setupVerified: true,
                appPid: alive.pid,
                appVersion: alive.version,
                message:
                  "The ToraSEO Desktop App is running, and Codex successfully " +
                  "reached the ToraSEO MCP server with the active Codex Workflow " +
                  "Instructions. Setup is verified. To start an analysis, ask the " +
                  "user to click Scan in ToraSEO and paste the generated prompt.",
              },
              null,
              2,
            ),
          },
        ],
      };
    }

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              ok: true,
              setupVerified: true,
              error: "wrong_state",
              state: stateNow.status,
              message:
                "Codex setup is verified. The app still has a previous " +
                "scan state (`" +
                stateNow.status +
                "`). Ask the user to cancel or finish it, then start a " +
                "fresh Codex bridge scan.",
            },
            null,
            2,
          ),
        },
      ],
    };
  }

  if (result === "wrong_client") {
    const alive = await probeAppAlive();
    if (alive.kind === "running") {
      await writeCodexSetupVerification({
        verifiedAt: new Date().toISOString(),
        appPid: alive.pid,
        appVersion: alive.version,
      });
    }
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              ok: true,
              setupVerified: true,
              expected: state?.bridgeClient ?? "unknown",
              message:
                "Codex setup is verified, but the active ToraSEO scan was " +
                "not started for Codex. Select the Codex path in ToraSEO " +
                "and start a fresh Codex bridge scan.",
            },
            null,
            2,
          ),
        },
      ],
    };
  }

  if (result === "mismatch") {
    return jsonError({
      ok: false,
      error: "token_mismatch",
      doNotAskUserForToken: true,
      nextStep: "update_or_reinstall_codex_workflow_instructions",
      message: TOKEN_MISMATCH_MESSAGE,
    });
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
              "Codex workflow handshake verified. Now call each tool in " +
              "selectedTools. If analysisType is article_text, do not ask " +
              "the user to paste the article into chat; the selected MCP " +
              "tools read input.md from the temporary ToraSEO workspace. Results will be displayed " +
              "in the ToraSEO app.",
          },
          null,
          2,
        ),
      },
    ],
  };
}

function jsonError(payload: Record<string, unknown>): {
  isError: true;
  content: Array<{ type: "text"; text: string }>;
} {
  return {
    isError: true,
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(payload, null, 2),
      },
    ],
  };
}
