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
 *   - app_running_no_scan    вЂ” App is alive but no analysis run is
 *                              waiting. In setup-check, this proves
 *                              the setup path is reachable; do not
 *                              mention a generic Scan button.
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
                  "For setup-check, do not tell the user to click Scan. " +
                  "Tell the user to keep ToraSEO open on MCP + Instructions " +
                  "-> Claude Desktop and repeat the setup prompt after the " +
                  "app refreshes. If they want analysis without the app, " +
                  "offer the Skill-only chat fallback instead of sending " +
                  "them to a generic Scan button.",
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
                  "has not started an analysis run. For setup-check, treat " +
                  "this as successful setup proof: MCP is reachable and the " +
                  "Bridge Instructions are active. Do not mention a generic " +
                  "Scan button. Tell the user they can return to ToraSEO, " +
                  "choose an analysis type, and start analysis from that " +
                  "specific screen. If they want analysis without the app, " +
                  "offer the Skill-only chat fallback.",
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
                  ? ["site_url_internal"]
                : analysisType === "site_compare"
                  ? ["site_compare_internal"]
                : analysisType === "page_by_url"
                  ? [
                      "page_url_article_internal",
                      ...state!.selectedTools.filter((toolId) =>
                        [
                          "analyze_google_page_search",
                          "analyze_yandex_page_search",
                        ].includes(toolId),
                      ),
                    ]
                : state!.selectedTools,
            internalSelectedTools:
              analysisType === "article_compare" ||
              analysisType === "page_by_url" ||
              analysisType === "site_compare"
                ? state!.selectedTools
                : undefined,
            message:
              "ToraSEO connection verified. Now call each tool from the tool list " +
              "returned in this response, in the usual order. For two-text comparison runs, the listed " +
              "tool starts the full comparison package and writes the individual check " +
              "results to the ToraSEO app. Do not call separate comparison checks unless " +
              "the user explicitly asks. For two-text comparison, use input.goalMode " +
              "to shape the final report: standard comparison, focus on Text A/B, " +
              "competitor, style, similarity, version, or A/B post. When answering the user, use " +
              "human-readable check names in the interface language for this run, and switch " +
              "language only if the user explicitly changes language in their own new message. " +
              "Avoid backend ids such as trustSignals, syntaxRiskSignals, tool ids, or result " +
              "file paths unless the user asks for debugging details. " +
              "Do not request filesystem access to read temporary workspace or " +
              "results JSON files for a normal final summary; MCP tool responses " +
              "and the app report are the source of facts. " +
              "Do not mention connection handshakes, scan ids, MCP internals, or aggregate tool names in the final user-facing answer; " +
              "write a normal comparison report summary. " +
              "Each tool's results will be displayed in the ToraSEO app " +
              "automatically. For text-analysis runs, do not ask " +
              "the user to paste the article into chat; the selected MCP " +
              "tools read input.md from the temporary ToraSEO workspace. " +
              "For two-text comparison runs, do not ask the user to paste " +
              "either text into chat; the selected MCP comparison tools read " +
              "Text A and Text B from the temporary ToraSEO workspace. Keep " +
              "the comparison text-evidence only: do not claim ranking causes " +
              "from text alone and do not rewrite the full article. " +
              "For site-by-URL runs, call site_url_internal; it runs the " +
              "selected site-audit checks and writes individual results under " +
              "normal user-facing tool names. Do not call separate site URL " +
              "tools unless explicitly debugging one check. Do not read " +
              "workspace JSON files after site_url_internal; use the MCP " +
              "tool response and the app report as the source of facts. Do not " +
              "ask the user to paste a report summary, screenshot, or JSON after " +
              "site_url_internal has completed. " +
              "For page-by-URL runs, call page_url_article_internal; it runs " +
              "the internal URL/page extraction and article text checks as MCP " +
              "checks and writes individual results under normal user-facing " +
              "tool names. If the app provided a page text block, use " +
              "that block as the article focus. Ignore ads/navigation/comments " +
              "and respect robots.txt; do not bypass auth, paywalls, CAPTCHA, " +
              "or private content. Do not invent Google/Yandex clicks, impressions, " +
              "views, or indexed phrases without an official connected source. " +
              "For text analysis, treat ai_writing_probability, ai_trace_map, " +
              "genericness_water_check, readability_complexity, claim_source_queue, " +
              "fact_distortion_check, and ai_hallucination_check as separate " +
              "questions. The first is an AI-style probability heuristic; " +
              "ai_trace_map is an editing map, not authorship proof; " +
              "genericness_water_check is about broad/watery phrasing and weak " +
              "concrete evidence; readability_complexity is about dense sentences " +
              "and heavy paragraphs; claim_source_queue lists claims needing " +
              "source review; optional fact and hallucination checks are not " +
              "external fact-checking. Use human-readable names in the final answer. " +
              "After all tools complete, provide " +
              "recommendations to the user in chat based on the data. " +
              "If input.action is solution, run the tools first, then propose " +
              "a concrete solution or draft direction in chat from the tool evidence. " +
              "If the input is only a topic or too thin for a complete article, be explicit " +
              "about the missing context and provide a bounded plan or minimum clarifying question.",
          },
          null,
          2,
        ),
      },
    ],
  };
}

