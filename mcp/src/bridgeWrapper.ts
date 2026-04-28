/**
 * Bridge wrapper — adapts a core analysis tool into an MCP handler
 * that writes results to the shared state-file when an active scan
 * is in progress, and falls back to legacy chat-only mode otherwise.
 *
 * Without this wrapper, every tool handler would duplicate the
 * same five blocks of code:
 *   1. mark "running" in state-file
 *   2. call the core function
 *   3. on success: write result to state-file with verdict + summary
 *      OR fall back to JSON in chat
 *   4. on error: write error to state-file
 *      OR fall back to error string in chat
 *   5. format the chat response
 *
 * That's ~50 lines per tool × 7 tools = 350 lines of near-identical
 * code. The wrapper centralizes it.
 *
 * The wrapper is intentionally generic over the core function's
 * return type. Each tool's result has a different shape — the
 * wrapper treats it as `unknown` and serializes verbatim.
 *
 * Verdict extraction: most core tools return a `verdicts` array
 * with severity-tagged entries (`{severity: "critical" | "warning"
 * | "info"}`). We summarize counts here so the App's UI can render
 * status dots without re-parsing the full result. If a tool
 * doesn't produce verdicts (scan_site_minimal), we treat it as
 * verdict="ok" with empty counts.
 */

import { mutateBuffer, type ToolBufferEntry } from "./stateFile.js";

/**
 * Severity counts extracted from a core tool's verdict array.
 * "info" verdicts are non-actionable observations (informative);
 * "warning" and "critical" drive the verdict color.
 */
interface SeverityCounts {
  critical: number;
  warning: number;
  info: number;
}

/**
 * Verdict shape that core tools emit. Not all tools have all
 * fields; we read what we can and tolerate missing data.
 */
interface CoreVerdict {
  severity?: "critical" | "warning" | "info";
}

/**
 * Tool result shape — most core functions return `{ verdicts: [...] }`
 * alongside their domain-specific data. We pluck verdicts to
 * compute summary; the rest of the data passes through unchanged.
 */
interface CoreResult {
  verdicts?: CoreVerdict[];
}

/**
 * Compute critical/warning/info counts from a core result.
 * Returns {0,0,0} when there are no verdicts (e.g. scan_site_minimal).
 */
function summarizeVerdicts(result: unknown): SeverityCounts {
  const counts: SeverityCounts = { critical: 0, warning: 0, info: 0 };
  const verdicts = (result as CoreResult)?.verdicts;
  if (!Array.isArray(verdicts)) return counts;

  for (const v of verdicts) {
    if (v.severity === "critical") counts.critical++;
    else if (v.severity === "warning") counts.warning++;
    else if (v.severity === "info") counts.info++;
  }
  return counts;
}

/**
 * Derive overall verdict from severity counts.
 *   any critical → "critical"
 *   any warning  → "warning"
 *   otherwise    → "ok" (including "info-only" results)
 */
function deriveVerdict(
  counts: SeverityCounts,
): "ok" | "warning" | "critical" {
  if (counts.critical > 0) return "critical";
  if (counts.warning > 0) return "warning";
  return "ok";
}

/**
 * MCP handler return type. Matches the SDK's expected shape.
 */
type McpHandlerResult = {
  isError?: boolean;
  content: Array<{ type: "text"; text: string }>;
};

/**
 * Wrap a core analysis function as an MCP tool handler.
 *
 * The handler:
 *   1. Reads state-file. If there's an active scan with this
 *      tool in selectedTools, marks the slot as "running".
 *   2. Calls the core function with the user's input.
 *   3. On success: extracts verdict counts, writes complete entry
 *      to state-file (if active scan), returns either a brief
 *      summary message (active scan) or the full JSON (legacy mode)
 *      to Claude.
 *   4. On error: writes error entry to state-file (if active scan),
 *      returns formatted error to Claude in either case.
 *
 * @param toolId      The MCP tool name, e.g. "check_robots_txt".
 *                    Must match keys in selectedTools / buffer.
 * @param coreFn      The core function to invoke. Takes a single
 *                    argument (typically a URL string) and returns
 *                    a result object.
 * @param ErrorClass  The core's named error class (e.g. CheckRobotsError),
 *                    used to format the error code in chat. Pass null
 *                    for tools that don't have a typed error class
 *                    (only `unexpected` formatting will be used).
 */
export function bridgeWrap<TArgs, TResult>(
  toolId: string,
  coreFn: (...args: TArgs[]) => Promise<TResult>,
  ErrorClass: { new (...args: never[]): Error & { code?: string } } | null,
): (args: { url: string } & Record<string, unknown>) => Promise<McpHandlerResult> {
  return async (args) => {
    const startedAt = new Date().toISOString();

    // Step 1: try to mark "running" in active scan, if any.
    const runningEntry: ToolBufferEntry = {
      status: "running",
      startedAt,
      completedAt: null,
    };
    // mutateBuffer returns null if there's no active scan — we
    // ignore that and fall through to legacy mode.
    await mutateBuffer(toolId, () => runningEntry);

    // Step 2: invoke the core function. The args object is what
    // the MCP SDK gives us after parsing the user's input through
    // the registered schema. Most tools take just `url`; we
    // extract it directly. Tools that take additional parameters
    // can be wrapped manually if needed (none in v0.0.7).
    let result: TResult;
    try {
      result = await coreFn(args.url as TArgs);
    } catch (err) {
      // Step 4: error path.
      const errorCode =
        ErrorClass && err instanceof ErrorClass && err.code
          ? err.code
          : "unexpected";
      const errorMessage =
        err instanceof Error ? err.message : String(err);

      const completedAt = new Date().toISOString();
      await mutateBuffer(toolId, () => ({
        status: "error",
        startedAt,
        completedAt,
        errorCode,
        errorMessage,
      }));

      return {
        isError: true,
        content: [
          {
            type: "text",
            text: `[${errorCode}] ${errorMessage}`,
          },
        ],
      };
    }

    // Step 3: success path.
    const completedAt = new Date().toISOString();
    const counts = summarizeVerdicts(result);
    const verdict = deriveVerdict(counts);

    // Try to write to state-file; check if an active scan exists.
    const updated = await mutateBuffer(toolId, () => ({
      status: "complete",
      startedAt,
      completedAt,
      verdict,
      data: result,
      summary: counts,
    }));

    if (updated) {
      // Active scan path — return a brief summary to Claude
      // instead of the full JSON. Saves tokens and avoids
      // duplicating data the user can already see in the App.
      const summaryParts: string[] = [];
      summaryParts.push(`Tool ${toolId} completed (verdict: ${verdict}).`);
      if (counts.critical > 0) {
        summaryParts.push(`${counts.critical} critical`);
      }
      if (counts.warning > 0) {
        summaryParts.push(`${counts.warning} warning${counts.warning === 1 ? "" : "s"}`);
      }
      if (counts.info > 0) {
        summaryParts.push(`${counts.info} info`);
      }
      summaryParts.push("Full results available in the ToraSEO app.");

      return {
        content: [
          {
            type: "text",
            text: summaryParts.join(" "),
          },
        ],
      };
    }

    // Legacy mode — no active scan, return full JSON as before.
    // This keeps the MCP server usable directly from Claude
    // Desktop without the App, e.g. for power users or
    // troubleshooting.
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  };
}
