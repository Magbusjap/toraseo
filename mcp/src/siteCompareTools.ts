import {
  analyzeCanonical,
  analyzeContent,
  analyzeHeadings,
  analyzeIndexability,
  analyzeLinks,
  analyzeMeta,
  analyzeSitemap,
  checkRedirects,
  checkRobots,
  detectStack,
  scanSiteMinimal,
} from "@toraseo/core";

import { mutateBuffer, readState, type ToolBufferEntry } from "./stateFile.js";
import { writeWorkspaceResult } from "./workspace.js";

type McpHandlerResult = {
  isError?: boolean;
  content: Array<{ type: "text"; text: string }>;
};

type SiteToolId =
  | "scan_site_minimal"
  | "analyze_indexability"
  | "check_robots_txt"
  | "analyze_sitemap"
  | "check_redirects"
  | "analyze_meta"
  | "analyze_canonical"
  | "analyze_headings"
  | "analyze_content"
  | "analyze_links"
  | "detect_stack";

const SITE_TOOL_ORDER: SiteToolId[] = [
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
];

const SITE_COMPARE_TOOLS = new Set([
  "compare_site_positioning",
  "compare_site_metadata",
  "compare_site_structure",
  "compare_site_content_depth",
  "compare_site_technical_basics",
  "compare_site_delta",
  "compare_site_direction_matrix",
  "compare_site_competitive_insights",
  "compare_strengths_weaknesses",
]);

interface SiteIssue {
  severity?: "critical" | "warning" | "info";
  code?: string;
  message?: string;
}

interface PerSiteToolResult {
  url: string;
  status: "complete" | "error";
  result: unknown | null;
  summary: ToolBufferEntry["summary"];
  errorMessage?: string;
}

function normalizeUrl(input: string): string {
  const trimmed = input.trim();
  const explicitUrl = trimmed.match(/https?:\/\/[^\s<>"']+/i)?.[0];
  const domainLike = trimmed.match(/[a-zа-я0-9][a-zа-я0-9.-]+\.[a-zа-я]{2,}(?:\/[^\s<>"']*)?/iu)?.[0];
  const raw = (explicitUrl ?? domainLike ?? trimmed)
    .trim()
    .replace(/^["'(<\[]+|["')>\].,;:!?]+$/g, "")
    .replace(/\s+/g, "");
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith("//")) return `https:${raw}`;
  return `https://${raw}`;
}

function issuesFromResult(result: unknown): SiteIssue[] {
  const source = result as { verdicts?: SiteIssue[]; issues?: SiteIssue[] };
  const issues = Array.isArray(source.verdicts)
    ? source.verdicts
    : Array.isArray(source.issues)
      ? source.issues
      : [];
  return issues.filter((issue) => issue.severity);
}

function summarizeResult(result: unknown): ToolBufferEntry["summary"] {
  const issues = issuesFromResult(result);
  return {
    critical: issues.filter((issue) => issue.severity === "critical").length,
    warning: issues.filter((issue) => issue.severity === "warning").length,
    info: issues.filter((issue) => issue.severity === "info").length,
  };
}

function mergeSummary(items: PerSiteToolResult[]): ToolBufferEntry["summary"] {
  return items.reduce(
    (acc, item) => ({
      critical: (acc.critical ?? 0) + (item.summary?.critical ?? 0),
      warning: (acc.warning ?? 0) + (item.summary?.warning ?? 0),
      info: (acc.info ?? 0) + (item.summary?.info ?? 0),
    }),
    { critical: 0, warning: 0, info: 0 },
  );
}

function verdictFromSummary(summary: ToolBufferEntry["summary"]): "ok" | "warning" | "critical" {
  if ((summary?.critical ?? 0) > 0) return "critical";
  if ((summary?.warning ?? 0) > 0) return "warning";
  return "ok";
}

async function runSiteTool(toolId: SiteToolId, url: string): Promise<unknown> {
  if (toolId === "scan_site_minimal") return scanSiteMinimal(url);
  if (toolId === "analyze_indexability") return analyzeIndexability(url);
  if (toolId === "check_robots_txt") return checkRobots(url);
  if (toolId === "analyze_sitemap") return analyzeSitemap(url);
  if (toolId === "check_redirects") return checkRedirects(url);
  if (toolId === "analyze_meta") return analyzeMeta(url);
  if (toolId === "analyze_canonical") return analyzeCanonical(url);
  if (toolId === "analyze_headings") return analyzeHeadings(url);
  if (toolId === "analyze_content") return analyzeContent(url);
  if (toolId === "analyze_links") return analyzeLinks(url);
  return detectStack(url);
}

async function runBufferedComparisonTool(
  toolId: string,
  task: () => Promise<unknown>,
): Promise<void> {
  const startedAt = new Date().toISOString();
  await mutateBuffer(toolId, () => ({
    status: "running",
    startedAt,
    completedAt: null,
  }));

  try {
    const data = await task();
    const sites = (data as { sites?: PerSiteToolResult[] }).sites ?? [];
    const summary = sites.length > 0 ? mergeSummary(sites) : { critical: 0, warning: 0, info: 0 };
    const updated = await mutateBuffer(toolId, () => ({
      status: "complete",
      startedAt,
      completedAt: new Date().toISOString(),
      verdict: verdictFromSummary(summary),
      data,
      summary,
    }));
    await writeWorkspaceResult(updated, toolId, data);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const updated = await mutateBuffer(toolId, () => ({
      status: "error",
      startedAt,
      completedAt: new Date().toISOString(),
      errorCode: "site_compare_error",
      errorMessage,
    }));
    await writeWorkspaceResult(updated, toolId, {
      errorCode: "site_compare_error",
      errorMessage,
    });
  }
}

function toolLabel(toolId: string): string {
  const labels: Record<string, string> = {
    scan_site_minimal: "basic scan",
    analyze_indexability: "indexability",
    check_robots_txt: "robots.txt",
    analyze_sitemap: "sitemap",
    check_redirects: "redirects",
    analyze_meta: "metadata",
    analyze_canonical: "canonical",
    analyze_headings: "headings",
    analyze_content: "content",
    analyze_links: "links",
    detect_stack: "stack",
    compare_site_positioning: "positioning",
    compare_site_metadata: "metadata",
    compare_site_structure: "structure",
    compare_site_content_depth: "content depth",
    compare_site_technical_basics: "technical basics",
    compare_site_delta: "gaps",
    compare_site_direction_matrix: "direction matrix",
    compare_site_competitive_insights: "competitive insights",
    compare_strengths_weaknesses: "strengths and weaknesses",
  };
  return labels[toolId] ?? toolId;
}

function siteScore(
  results: Record<string, PerSiteToolResult | null>,
  url: string,
): number {
  let critical = 0;
  let warning = 0;
  for (const entry of Object.values(results)) {
    const item = entry?.url === url ? entry : null;
    if (!item) continue;
    critical += item.summary?.critical ?? 0;
    warning += item.summary?.warning ?? 0;
  }
  return Math.max(0, Math.min(100, 100 - critical * 12 - warning * 6));
}

function buildSyntheticCompareData(
  toolId: string,
  urls: string[],
  resultMap: Record<string, PerSiteToolResult[]>,
): unknown {
  const siteRows = urls.map((url) => {
    const perTool = Object.fromEntries(
      Object.entries(resultMap).map(([siteToolId, items]) => [
        siteToolId,
        items.find((item) => item.url === url) ?? null,
      ]),
    );
    const score = siteScore(perTool as Record<string, PerSiteToolResult | null>, url);
    return {
      url,
      score,
      critical: Object.values(perTool).reduce(
        (sum, item) => sum + ((item as PerSiteToolResult | null)?.summary?.critical ?? 0),
        0,
      ),
      warning: Object.values(perTool).reduce(
        (sum, item) => sum + ((item as PerSiteToolResult | null)?.summary?.warning ?? 0),
        0,
      ),
    };
  });
  const winner = siteRows.slice().sort((a, b) => b.score - a.score)[0] ?? null;
  return {
    toolId,
    title: toolLabel(toolId),
    sites: siteRows,
    winner,
    insight:
      winner != null
        ? `${winner.url} looks stronger by the selected public checks. Review gaps by direction and fix critical blockers first.`
        : "The comparison does not contain enough data yet.",
  };
}

function siteCompareResultMapFromState(state: Awaited<ReturnType<typeof readState>>): Record<string, PerSiteToolResult[]> {
  const resultMap: Record<string, PerSiteToolResult[]> = {};
  if (!state) return resultMap;
  for (const toolId of SITE_TOOL_ORDER) {
    const data = state.buffer[toolId]?.data as { sites?: PerSiteToolResult[] } | undefined;
    if (Array.isArray(data?.sites)) {
      resultMap[toolId] = data.sites;
    }
  }
  return resultMap;
}

export async function siteCompareToolHandler(toolId: string): Promise<McpHandlerResult> {
  const state = await readState();
  if (!state || (state.analysisType ?? "site_by_url") !== "site_compare") {
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: "[site_compare_error] No active ToraSEO site comparison is waiting.",
        },
      ],
    };
  }

  const urls = Array.from(
    new Set((state.input?.siteUrls ?? []).map(normalizeUrl).filter(Boolean)),
  ).slice(0, 3);
  if (urls.length < 2) {
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: "[site_compare_error] Add at least two URLs before starting comparison.",
        },
      ],
    };
  }

  if ((SITE_TOOL_ORDER as string[]).includes(toolId)) {
    await runBufferedComparisonTool(toolId, async () => {
      const sites: PerSiteToolResult[] = [];
      for (const url of urls) {
        try {
          const result = await runSiteTool(toolId as SiteToolId, url);
          sites.push({
            url,
            status: "complete",
            result,
            summary: summarizeResult(result),
          });
        } catch (error) {
          sites.push({
            url,
            status: "error",
            result: null,
            summary: { critical: 1, warning: 0, info: 0 },
            errorMessage: error instanceof Error ? error.message : String(error),
          });
        }
      }
      return { toolId, title: toolLabel(toolId), sites };
    });
  } else if (SITE_COMPARE_TOOLS.has(toolId)) {
    const resultMap = siteCompareResultMapFromState(state);
    await runBufferedComparisonTool(toolId, async () =>
      buildSyntheticCompareData(toolId, urls, resultMap),
    );
  } else {
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: `[site_compare_error] ${toolId} is not a site comparison tool.`,
        },
      ],
    };
  }

  return {
    content: [
      {
        type: "text",
        text: `Tool ${toolId} completed for the active site comparison. Full result is available in ToraSEO.`,
      },
    ],
  };
}

function renderSiteCompareChatReport(urls: string[], resultMap: Record<string, PerSiteToolResult[]>): string {
  const synthetic = buildSyntheticCompareData("compare_site_competitive_insights", urls, resultMap) as {
    sites: Array<{ url: string; score: number; critical: number; warning: number }>;
    winner?: { url: string; score: number } | null;
  };
  const lines = [
    `Site comparison completed: ${urls.length} URLs and ${Object.keys(resultMap).length} directions checked.`,
    "",
    "**Who is stronger**",
    synthetic.winner
      ? `- Best overall SEO profile by selected checks: ${synthetic.winner.url} (${synthetic.winner.score}/100).`
      : "- Winner is not determined yet: not enough data.",
    "",
    "**Quick KPI**",
    ...synthetic.sites.map(
      (site) =>
        `- ${site.url}: SEO ${site.score}/100, critical ${site.critical}, warnings ${site.warning}.`,
    ),
    "",
    "**How to read the result**",
    "- This is a comparative dashboard: first review the winner and gaps, then inspect specific directions.",
    "- Do not compare three full audits side by side: use cards, metrics, heatmap, and action blocks.",
    "",
    "**What to do next**",
    "- Fix directions where your site loses most strongly against the winner: metadata, content, indexability, structure, or technical basics.",
    "- After edits, run the comparison again and check whether critical gaps decreased.",
  ];
  return lines.join("\n");
}

export async function siteCompareInternalHandler(): Promise<McpHandlerResult> {
  const state = await readState();
  if (!state || (state.analysisType ?? "site_by_url") !== "site_compare") {
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: "[site_compare_error] No active ToraSEO site comparison is waiting.",
        },
      ],
    };
  }

  const urls = Array.from(
    new Set((state.input?.siteUrls ?? []).map(normalizeUrl).filter(Boolean)),
  ).slice(0, 3);
  if (urls.length < 2) {
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: "[site_compare_error] Add at least two URLs before starting comparison.",
        },
      ],
    };
  }

  const selected = new Set(state.selectedTools);
  const resultMap: Record<string, PerSiteToolResult[]> = {};

  for (const toolId of SITE_TOOL_ORDER) {
    if (!selected.has(toolId)) continue;
    await runBufferedComparisonTool(toolId, async () => {
      const sites: PerSiteToolResult[] = [];
      for (const url of urls) {
        try {
          const result = await runSiteTool(toolId, url);
          sites.push({
            url,
            status: "complete",
            result,
            summary: summarizeResult(result),
          });
        } catch (error) {
          sites.push({
            url,
            status: "error",
            result: null,
            summary: { critical: 1, warning: 0, info: 0 },
            errorMessage: error instanceof Error ? error.message : String(error),
          });
        }
      }
      resultMap[toolId] = sites;
      return { toolId, title: toolLabel(toolId), sites };
    });
  }

  for (const toolId of state.selectedTools) {
    if (!SITE_COMPARE_TOOLS.has(toolId)) continue;
    await runBufferedComparisonTool(toolId, async () =>
      buildSyntheticCompareData(toolId, urls, resultMap),
    );
  }

  return {
    content: [
      {
        type: "text",
        text: renderSiteCompareChatReport(urls, resultMap),
      },
    ],
  };
}
