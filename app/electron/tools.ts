/**
 * Tool runner for the Electron main process.
 *
 * Maps each `ToolId` to its corresponding function in `@toraseo/core`,
 * runs the user-selected subset in parallel, and streams progress back
 * to the renderer via `webContents.send(...)`.
 *
 * Why this lives in `electron/` and not in `core/`:
 *   - Streaming progress is an Electron-IPC concern; `core/` should
 *     stay transport-agnostic so the MCP server keeps reusing it
 *     unchanged.
 *   - The verdict-classification logic ("how do I turn issues[] into
 *     a status?") is a UI concern, not core SEO logic.
 *   - The renderer never imports from here directly — only through
 *     the preload bridge.
 */

import { randomUUID } from "node:crypto";
import type { WebContents } from "electron";

import {
  scanSiteMinimal,
  ScanSiteError,
  checkRobots,
  analyzeMeta,
  AnalyzeMetaError,
  analyzeHeadings,
  AnalyzeHeadingsError,
  analyzeSitemap,
  AnalyzeSitemapError,
  checkRedirects,
  CheckRedirectsError,
  analyzeContent,
  AnalyzeContentError,
  analyzeIndexability,
  analyzeCanonical,
  analyzeLinks,
  detectStack,
  DetectStackError,
} from "@toraseo/core";

import type { ToolId } from "../src/config/tools";
import type {
  ScanComplete,
  StageStatus,
  StageUpdate,
} from "../src/types/ipc";

// IPC channel names — kept here as the single source of truth so main
// and preload don't drift.
export const IPC_CHANNELS = {
  startScan: "toraseo:start-scan",
  stageUpdate: "toraseo:stage-update",
  scanComplete: "toraseo:scan-complete",
} as const;

/**
 * One verdict object as returned by every Mode-A analyzer.
 * The shape matches MetaIssue / HeadingIssue / SitemapIssue / etc.
 * — they all share the same three fields. We don't import any of
 * those types here because the classification only needs `severity`.
 */
interface AnyIssue {
  severity: "critical" | "warning" | "info";
  code: string;
  message: string;
}

/**
 * Loose shape of every tool result that has an `issues[]` field.
 * `scan_site_minimal` is the one exception — it has no issues at all,
 * so it gets `ok` unconditionally on success.
 */
interface ResultWithIssues {
  issues?: AnyIssue[];
}

/**
 * Normalize a user-typed URL into one the core tools accept.
 *
 * The sidebar input deliberately tolerates schema-less hosts like
 * `bozheslav.ru` because that's what users type in browsers — but
 * `new URL(...)` (which every core tool calls under the hood)
 * rejects them with `TypeError: Invalid URL`. We add `https://` if
 * there is no scheme. http:// is reserved for the rare case where
 * the user explicitly typed it in.
 *
 * Also strips a trailing slash, leading/trailing whitespace, and
 * collapses any internal whitespace — those are pure user-typo
 * sources, not legitimate URL content.
 */
function normalizeUrl(input: string): string {
  let value = input.trim().replace(/\s+/g, "");
  // Already has a scheme? Use as-is.
  if (/^https?:\/\//i.test(value)) {
    return value;
  }
  // Catch protocol-relative URLs like //example.com.
  if (value.startsWith("//")) {
    return `https:${value}`;
  }
  // No scheme at all.
  return `https://${value}`;
}

/**
 * Run a single tool by id and return a partial StageUpdate describing
 * the outcome. This is the only place where tool ids and core
 * functions meet — adding a new tool means adding a case here and
 * exporting from `@toraseo/core/index.ts`.
 *
 * Each branch is responsible for:
 *   - Calling the right core function
 *   - Catching the right typed error class (so we get clean error codes
 *     like "robots_disallowed" instead of "[unexpected]")
 *   - Letting unexpected errors fall through to the generic handler
 */
async function runOne(
  toolId: ToolId,
  url: string,
): Promise<Omit<StageUpdate, "scanId">> {
  try {
    switch (toolId) {
      case "check_robots_txt": {
        // checkRobots intentionally does not throw — robots failure is a
        // verdict, not an exception. We classify by `allowed`.
        const result = await checkRobots(url);
        const status: StageStatus = result.allowed ? "ok" : "warning";
        return {
          toolId,
          status,
          result,
          summary: { critical: 0, warning: result.allowed ? 0 : 1, info: 0 },
        };
      }

      case "analyze_indexability": {
        const result = await analyzeIndexability(url);
        return classify(toolId, result);
      }

      case "analyze_sitemap": {
        const result = await analyzeSitemap(url);
        return classify(toolId, result);
      }

      case "analyze_meta": {
        const result = await analyzeMeta(url);
        return classify(toolId, result);
      }

      case "analyze_canonical": {
        const result = await analyzeCanonical(url);
        return classify(toolId, result);
      }

      case "analyze_headings": {
        const result = await analyzeHeadings(url);
        return classify(toolId, result);
      }

      case "check_redirects": {
        const result = await checkRedirects(url);
        return classify(toolId, result);
      }

      case "analyze_content": {
        const result = await analyzeContent(url);
        return classify(toolId, result);
      }

      case "analyze_links": {
        const result = await analyzeLinks(url);
        return classify(toolId, result);
      }

      case "scan_site_minimal": {
        // No issues[] — a single-shot probe. If it didn't throw, we're
        // ok. Detailed signals like "title: null" are visible in the
        // result for the renderer to surface but don't auto-warn here.
        const result = await scanSiteMinimal(url);
        return {
          toolId,
          status: "ok",
          result,
          summary: { critical: 0, warning: 0, info: 0 },
        };
      }

      case "detect_stack": {
        const result = await detectStack(url);
        return classify(toolId, result);
      }
    }
  } catch (error: unknown) {
    return errorUpdate(toolId, error);
  }
}

/**
 * Turn a result object that has `issues[]` into a StageUpdate.
 * Severity rules:
 *   - any `critical` issue → critical
 *   - else any `warning`   → warning
 *   - else                 → ok
 */
function classify(
  toolId: ToolId,
  result: ResultWithIssues,
): Omit<StageUpdate, "scanId"> {
  const issues = result.issues ?? [];
  let critical = 0;
  let warning = 0;
  let info = 0;
  for (const issue of issues) {
    if (issue.severity === "critical") critical++;
    else if (issue.severity === "warning") warning++;
    else info++;
  }
  const status: StageStatus =
    critical > 0 ? "critical" : warning > 0 ? "warning" : "ok";
  return {
    toolId,
    status,
    result,
    summary: { critical, warning, info },
  };
}

/**
 * Pull the most informative error code we can from the various typed
 * error classes that core throws. Each *Error class carries a `.code`
 * string identifier (e.g. "robots_disallowed", "fetch_timeout") that
 * is much more useful than the generic message for UI grouping.
 */
function errorUpdate(
  toolId: ToolId,
  error: unknown,
): Omit<StageUpdate, "scanId"> {
  let errorCode = "unexpected";
  let errorMessage =
    error instanceof Error ? error.message : String(error);

  if (
    error instanceof ScanSiteError ||
    error instanceof AnalyzeMetaError ||
    error instanceof AnalyzeHeadingsError ||
    error instanceof AnalyzeSitemapError ||
    error instanceof CheckRedirectsError ||
    error instanceof AnalyzeContentError ||
    error instanceof DetectStackError
  ) {
    errorCode = error.code;
    errorMessage = error.message;
  }

  // Always log the full error to the main-process console. Without
  // this, an "unexpected" verdict in the UI gives no clue what blew
  // up — it could be a network failure, a missing dependency, or a
  // bug in core. The terminal where `npm run dev:app` is running is
  // the only place this surface this detail.
  console.error(
    `[toraseo:tools] ${toolId} failed:`,
    error instanceof Error ? error.stack ?? error.message : error,
  );

  return {
    toolId,
    status: "error",
    errorCode,
    errorMessage,
  };
}

/**
 * Public entry point used by the IPC handler in main.ts.
 *
 * Generates a fresh scanId, kicks off the requested tools in parallel,
 * and streams a StageUpdate per tool as soon as it finishes (success
 * or error). When all are settled, sends a final ScanComplete.
 *
 * Returns the scanId synchronously to the IPC caller so the renderer
 * can correlate updates that arrive over `webContents.send` channels.
 */
export function startScan(
  webContents: WebContents,
  url: string,
  toolIds: ToolId[],
): { scanId: string } {
  const scanId = randomUUID();
  const startedAt = Date.now();

  // Aggregate counters for the final ScanComplete event.
  const totals = { critical: 0, warning: 0, info: 0, errors: 0 };

  // Build a friendly, normalized URL once per scan. Every selected
  // tool will run against the same normalized form so verdicts and
  // error codes line up with what the user actually typed.
  const normalizedUrl = normalizeUrl(url);

  // Notify renderer that each tool is now "running" — gives the UI
  // an immediate signal to switch from pending to working spinner,
  // even if some tools take 5+ seconds.
  for (const toolId of toolIds) {
    const update: StageUpdate = {
      scanId,
      toolId,
      status: "running",
    };
    safeSend(webContents, IPC_CHANNELS.stageUpdate, update);
  }

  // Fire all tools in parallel. Each settles independently and
  // streams its own update; we don't wait for one to finish another.
  const tasks = toolIds.map(async (toolId) => {
    const partial = await runOne(toolId, normalizedUrl);
    if (partial.summary) {
      totals.critical += partial.summary.critical;
      totals.warning += partial.summary.warning;
      totals.info += partial.summary.info;
    }
    if (partial.status === "error") {
      totals.errors++;
    }
    const update: StageUpdate = { scanId, ...partial };
    safeSend(webContents, IPC_CHANNELS.stageUpdate, update);
  });

  // After all stages settle, send the final summary. Use Promise.all
  // because runOne never rejects (errors become "error" status) — so
  // there's no need for allSettled.
  Promise.all(tasks).then(() => {
    const summary: ScanComplete = {
      scanId,
      durationMs: Date.now() - startedAt,
      totals,
    };
    safeSend(webContents, IPC_CHANNELS.scanComplete, summary);
  });

  return { scanId };
}

/**
 * Send an IPC message guarded against destroyed webContents.
 *
 * If the user closes the window while a scan is in flight, sending to
 * a destroyed WebContents throws. Swallow that — the result has
 * nowhere to go anyway.
 */
function safeSend(
  webContents: WebContents,
  channel: string,
  payload: unknown,
): void {
  if (webContents.isDestroyed()) return;
  try {
    webContents.send(channel, payload);
  } catch {
    // window closed mid-flight; nothing to do
  }
}
