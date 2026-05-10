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

const SITE_BY_URL_INTERNAL_TOOL_IDS = new Set([
  "scan_site_minimal",
  "analyze_indexability",
  "check_robots_txt",
  "analyze_sitemap",
  "check_redirects",
  "analyze_meta",
  "analyze_canonical",
  "analyze_headings",
  "analyze_content",
  "analyze_links",
  "detect_stack",
]);

function siteByUrlHandshakeTools(selectedTools: string[]): string[] {
  const extraTools = selectedTools.filter(
    (toolId) => !SITE_BY_URL_INTERNAL_TOOL_IDS.has(toolId),
  );
  return ["site_url_internal", ...extraTools];
}

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
          "The ToraSEO Desktop App is not reachable from MCP right now. " +
          "For setup-check, do not tell the user to click Scan. Explain that " +
          "Codex MCP and Codex Workflow Instructions are loaded, but the app " +
          "liveness marker is not reachable yet. Ask the user to keep ToraSEO " +
          "open on MCP + Instructions -> Codex and run the setup prompt again " +
          "after the app refreshes. If the user wanted an analysis and the app " +
          "cannot be reached, offer the Skill-only chat fallback instead of " +
          "sending them to a non-existent Scan button.",
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
                  "Instructions. Setup is verified. This was only a setup check, " +
                  "not an analysis run. Tell the user they can return to ToraSEO, " +
                  "choose an analysis type, and start it from that analysis screen.",
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
                "`). Ask the user to cancel or finish that previous run in " +
                "ToraSEO, then choose the next analysis type from the app. Do " +
                "not mention a generic Scan button during setup-check.",
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
  const analysisType = state!.analysisType ?? "site_by_url";

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(
          {
            ok: true,
            scanId: state!.scanId,
            url: state!.url,
            analysisType,
            input: state!.input
              ? {
                  action: state!.input.action,
                  topic: state!.input.topic,
                  goal: state!.input.goal,
                  goalMode: state!.input.goalMode,
                  sourceType: state!.input.sourceType,
                  analysisRole: state!.input.analysisRole || "default",
                  hasText: Boolean(
                    workspaceText?.trim() || state!.input.text?.trim(),
                  ),
                  textLength:
                    workspaceText?.length ?? state!.input.text?.length ?? 0,
                  selectedAnalysisTools: state!.input.selectedAnalysisTools,
                  hasPageTextBlock: Boolean(state!.input.pageTextBlock),
                  siteUrls: state!.input.siteUrls,
                }
              : undefined,
            workspace: undefined,
            selectedTools:
              analysisType === "article_compare"
                ? ["article_compare_internal"]
                : analysisType === "site_by_url"
                  ? siteByUrlHandshakeTools(state!.selectedTools)
                : analysisType === "site_compare"
                  ? ["site_compare_internal"]
                : state!.selectedTools,
            internalSelectedTools:
              analysisType === "article_compare" ||
              analysisType === "site_by_url" ||
              analysisType === "site_compare"
                ? state!.selectedTools
                : undefined,
            message:
              "ToraSEO connection verified. Use the tool list returned in this response. " +
              "For two-text comparison runs, the listed tool starts " +
              "the full comparison package and writes the individual check results " +
              "to the ToraSEO app. Do not call separate comparison checks unless " +
              "the user explicitly asks. For two-text comparison, use input.goalMode " +
              "to shape the final report: standard comparison, focus on Text A/B, " +
              "competitor, style, similarity, version, or A/B post. " +
              "When answering the user, use human-readable check names in the " +
              "interface language for this run, and switch language only if the " +
              "user explicitly changes language in their own new message. Avoid " +
              "backend ids such as trustSignals, syntaxRiskSignals, tool ids, " +
              "or result file paths unless the user asks for debugging details. " +
              "Do not request filesystem access to read temporary workspace or " +
              "results JSON files for a normal final summary; MCP tool responses " +
              "and the app report are the source of facts. " +
              "Do not mention connection handshakes, scan ids, MCP internals, or aggregate tool names " +
              "in the final user-facing answer; write a normal comparison report summary. " +
              "For text-analysis runs, do not ask " +
              "the user to paste the article into chat; the selected MCP " +
              "tools read input.md from the temporary ToraSEO workspace. " +
              "For two-text comparison runs, do not ask the user to paste " +
              "either text into chat; the selected MCP comparison tools read " +
              "Text A and Text B from the temporary ToraSEO workspace. Keep " +
              "the comparison text-evidence only: do not claim ranking causes " +
              "from text alone and do not rewrite the full article. " +
              "For site-by-URL runs, call site_url_internal first; it runs " +
              "the selected core site-audit checks one by one and writes each " +
              "individual tool result to the ToraSEO app so progress advances " +
              "per check. Then call any additional tools returned after " +
              "site_url_internal. Do not ask the user to paste a report " +
              "summary, screenshot, or JSON after the selected tools complete; " +
              "use the MCP tool responses and the app report as the source of facts. " +
              "For page-by-URL runs, call each selected page URL MCP tool " +
              "returned in this response, in order. Run extract_main_text " +
              "before article-text checks so the temporary article text is " +
              "prepared. If the app provided a page text block, use that block " +
              "as the article focus. Ignore ads/navigation/comments " +
              "and respect robots.txt; do not bypass auth, paywalls, CAPTCHA, " +
              "or private content. Do not invent Google/Yandex clicks, impressions, " +
              "views, or indexed phrases without an official connected source. Results will be displayed " +
              "in the ToraSEO app. If input.action is solution, run the tools first, " +
              "then propose a concrete solution or draft direction in chat from the tool evidence. " +
              "If the input is only a topic or too thin for a complete article, be explicit about " +
              "the missing context and provide a bounded plan or minimum clarifying question.",
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
