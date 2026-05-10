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

type SiteUrlToolId =
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

const SITE_URL_INTERNAL_ORDER: SiteUrlToolId[] = [
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

interface SeverityIssue {
  severity?: "critical" | "warning" | "info";
}

interface SiteIssue extends SeverityIssue {
  code?: string;
  message?: string;
}

interface CompletedSiteToolResult {
  toolId: SiteUrlToolId;
  result: unknown | null;
  summary: ToolBufferEntry["summary"];
  status: "complete" | "error";
  errorMessage?: string;
}

function summarizeIssues(result: unknown): ToolBufferEntry["summary"] {
  const source = result as {
    verdicts?: SiteIssue[];
    issues?: SiteIssue[];
  };
  const issues = Array.isArray(source.verdicts)
    ? source.verdicts
    : Array.isArray(source.issues)
      ? source.issues
      : [];
  return {
    critical: issues.filter((issue) => issue.severity === "critical").length,
    warning: issues.filter((issue) => issue.severity === "warning").length,
    info: issues.filter((issue) => issue.severity === "info").length,
  };
}

function verdictFromSummary(
  summary: ToolBufferEntry["summary"],
): "ok" | "warning" | "critical" {
  if ((summary?.critical ?? 0) > 0) return "critical";
  if ((summary?.warning ?? 0) > 0) return "warning";
  return "ok";
}

async function runBufferedSiteTool<T>(
  toolId: SiteUrlToolId,
  task: () => Promise<T>,
): Promise<CompletedSiteToolResult> {
  const startedAt = new Date().toISOString();
  await mutateBuffer(toolId, () => ({
    status: "running",
    startedAt,
    completedAt: null,
  }));

  try {
    const result = await task();
    const completedAt = new Date().toISOString();
    const summary = summarizeIssues(result);
    const updated = await mutateBuffer(toolId, () => ({
      status: "complete",
      startedAt,
      completedAt,
      verdict: verdictFromSummary(summary),
      data: result,
      summary,
    }));
    await writeWorkspaceResult(updated, toolId, result);
    return {
      toolId,
      result,
      summary,
      status: "complete",
    };
  } catch (error) {
    const completedAt = new Date().toISOString();
    const errorMessage = error instanceof Error ? error.message : String(error);
    const updated = await mutateBuffer(toolId, () => ({
      status: "error",
      startedAt,
      completedAt,
      errorCode: "site_url_error",
      errorMessage,
    }));
    await writeWorkspaceResult(updated, toolId, {
      errorCode: "site_url_error",
      errorMessage,
    });
    return {
      toolId,
      result: null,
      summary: { critical: 0, warning: 0, info: 0 },
      status: "error",
      errorMessage,
    };
  }
}

async function runSelectedSiteTool(
  toolId: SiteUrlToolId,
  url: string,
): Promise<CompletedSiteToolResult> {
  if (toolId === "scan_site_minimal") {
    return runBufferedSiteTool(toolId, () => scanSiteMinimal(url));
  }
  if (toolId === "analyze_indexability") {
    return runBufferedSiteTool(toolId, () => analyzeIndexability(url));
  }
  if (toolId === "check_robots_txt") {
    return runBufferedSiteTool(toolId, () => checkRobots(url));
  }
  if (toolId === "analyze_sitemap") {
    return runBufferedSiteTool(toolId, () => analyzeSitemap(url));
  }
  if (toolId === "check_redirects") {
    return runBufferedSiteTool(toolId, () => checkRedirects(url));
  }
  if (toolId === "analyze_meta") {
    return runBufferedSiteTool(toolId, () => analyzeMeta(url));
  }
  if (toolId === "analyze_canonical") {
    return runBufferedSiteTool(toolId, () => analyzeCanonical(url));
  }
  if (toolId === "analyze_headings") {
    return runBufferedSiteTool(toolId, () => analyzeHeadings(url));
  }
  if (toolId === "analyze_content") {
    return runBufferedSiteTool(toolId, () => analyzeContent(url));
  }
  if (toolId === "analyze_links") {
    return runBufferedSiteTool(toolId, () => analyzeLinks(url));
  }
  return runBufferedSiteTool(toolId, () => detectStack(url));
}

function issuesFromResult(result: unknown): SiteIssue[] {
  const source = result as {
    verdicts?: SiteIssue[];
    issues?: SiteIssue[];
  };
  const issues = Array.isArray(source.verdicts)
    ? source.verdicts
    : Array.isArray(source.issues)
      ? source.issues
      : [];
  return issues.filter((issue) => issue.severity);
}

function toolLabel(toolId: SiteUrlToolId): string {
  const labels: Record<SiteUrlToolId, string> = {
    scan_site_minimal: "Basic scan",
    analyze_indexability: "Indexability",
    check_robots_txt: "Robots.txt",
    analyze_sitemap: "Sitemap",
    check_redirects: "Redirects",
    analyze_meta: "Meta tags",
    analyze_canonical: "Canonical",
    analyze_headings: "Headings",
    analyze_content: "Content",
    analyze_links: "Links",
    detect_stack: "Site stack",
  };
  return labels[toolId];
}

function issueTitle(code: string | undefined, fallback: string | undefined): string {
  const titles: Record<string, string> = {
    no_title: "Title is missing",
    title_too_short: "Title is too short",
    title_too_long: "Title is too long",
    no_meta_description: "Meta description is missing",
    description_too_short: "Meta description is too short",
    description_too_long: "Meta description is too long",
    no_canonical: "Canonical is missing",
    canonical_relative: "Canonical uses a relative URL",
    canonical_points_elsewhere: "Canonical points to another URL",
    og_missing: "Open Graph is missing",
    og_incomplete: "Open Graph is incomplete",
    twitter_card_missing: "Twitter Card is missing",
    no_charset: "Charset is missing",
    no_viewport: "Viewport is missing",
    no_html_lang: "HTML language is missing",
    noindex_present: "Page is blocked from indexing",
    robots_disallow: "Robots.txt blocks crawling",
    meta_noindex: "Meta robots blocks indexing",
    indexability_clear: "Indexing is allowed",
    no_sitemap: "Sitemap was not found",
    sitemap_not_found: "Sitemap was not found",
    sitemap_empty: "Sitemap is empty",
    no_redirects: "No redirects",
    redirect_chain_too_long: "Redirect chain is too long",
    redirect_loop: "Redirect loop detected",
    heading_level_skip: "Heading level skip",
    no_h1: "H1 is missing",
    multiple_h1: "Multiple H1 headings",
    no_main_content: "Main content was not found",
    thin_content: "Main content is thin",
    borderline_content: "Main content is near the minimum",
    text_to_code_ratio_very_low: "Very little text compared with HTML",
    text_to_code_ratio_low: "Little text compared with HTML",
    no_paragraphs: "No paragraphs",
    no_internal_links: "No internal links",
    many_external_links: "Many external links",
    links_checked: "Links were checked",
    stack_detected: "Site stack detected",
  };
  if (code && titles[code]) return titles[code];
  return fallback?.split(".")[0]?.trim() || "Check result";
}

function issueExplanation(code: string | undefined, fallback: string | undefined): string {
  const explanations: Record<string, string> = {
    no_title:
      "Search engines and users have a harder time understanding the page topic without a clear title.",
    title_too_short:
      "Make the title more specific so it names the page and carries the main search meaning.",
    title_too_long:
      "Shorten the title: long titles are often truncated in search results.",
    no_meta_description:
      "Search engines may generate the snippet automatically; add a controlled 120-160 character description.",
    description_too_short:
      "Expand the description so it explains the page and the user benefit clearly.",
    description_too_long:
      "Shorten the description so the main meaning is not truncated in the snippet.",
    no_canonical:
      "If the page has duplicates or URL variants, add a canonical URL.",
    canonical_relative:
      "Use an absolute canonical URL so search engines do not interpret it ambiguously.",
    canonical_points_elsewhere:
      "Check whether this page should really point its canonical tag to another URL.",
    og_missing:
      "When the link is shared on social platforms, the preview may look accidental.",
    og_incomplete:
      "Add the missing Open Graph fields: title, description, URL, and preview image.",
    twitter_card_missing:
      "Add twitter:card or an Open Graph fallback so the link looks better on X/Twitter.",
    no_charset:
      "Add meta charset so browsers do not have to guess the encoding.",
    no_viewport:
      "Add a viewport tag for correct rendering on mobile devices.",
    no_html_lang:
      "Add lang to the html element; it helps accessibility and language targeting.",
    noindex_present:
      "Remove noindex in production if the page should appear in search.",
    robots_disallow:
      "Allow crawling of important pages in robots.txt if they should be indexed.",
    meta_noindex:
      "Check meta robots: an important page should not be blocked from indexing.",
    no_sitemap:
      "Create sitemap.xml and reference it in robots.txt so search engines can find site pages more easily.",
    sitemap_not_found:
      "Create sitemap.xml and reference it in robots.txt so search engines can find site pages more easily.",
    sitemap_empty:
      "Keep only pages that should actually be indexed in the sitemap.",
    redirect_chain_too_long:
      "Reduce the redirect chain to one step.",
    redirect_loop:
      "Fix the redirect loop: the page may be unavailable to users and search engines.",
    heading_level_skip:
      "Clean up the heading hierarchy.",
    no_h1:
      "Add one clear H1 that names the main page topic.",
    multiple_h1:
      "Keep one main H1 and move other large headings to H2/H3.",
    no_main_content:
      "Check that important content is available in HTML, not only after complex JavaScript rendering.",
    thin_content:
      "Add meaningful topic coverage or check that the main content is available in HTML.",
    borderline_content:
      "Strengthen the page with useful text if it should attract search traffic.",
    text_to_code_ratio_very_low:
      "Check whether the basic scan sees only the page shell instead of the main content.",
    text_to_code_ratio_low:
      "Reduce unnecessary code or add more useful visible content.",
    no_paragraphs:
      "Split the text into paragraphs so users and assistive technologies can read it more easily.",
    no_internal_links:
      "Add internal links to related site pages.",
    many_external_links:
      "Check that external links are really needed and do not dilute the page focus.",
    links_checked:
      "No urgent link action is required.",
    stack_detected:
      "Use these signals as reference, not as an SEO issue.",
  };
  if (code && explanations[code]) return explanations[code];
  return fallback?.trim() || "Review this item and run the scan again after edits.";
}

function issuePriority(issue: SiteIssue): number {
  if (issue.severity === "critical") return 0;
  if (issue.severity === "warning") return 1;
  return 2;
}

function issueKey(toolId: SiteUrlToolId, issue: SiteIssue): string {
  const code = issue.code ?? issueTitle(undefined, issue.message).toLowerCase();
  if (code.includes("canonical")) return "canonical";
  if (code.includes("sitemap")) return "sitemap";
  if (code.includes("description")) return "description";
  if (code.includes("title")) return "title";
  if (code.includes("og") || code.includes("twitter")) return code;
  return `${toolId}:${code}`;
}

function collectIssues(results: CompletedSiteToolResult[]): Array<{
  severity: "critical" | "warning" | "info";
  code?: string;
  title: string;
  explanation: string;
  checks: string[];
}> {
  const map = new Map<string, {
    severity: "critical" | "warning" | "info";
    code?: string;
    title: string;
    explanation: string;
    checks: string[];
  }>();

  for (const item of results) {
    if (item.status !== "complete") continue;
    for (const issue of issuesFromResult(item.result)) {
      const severity = issue.severity ?? "info";
      const key = issueKey(item.toolId, issue);
      const existing = map.get(key);
      if (existing) {
        if (!existing.checks.includes(toolLabel(item.toolId))) {
          existing.checks.push(toolLabel(item.toolId));
        }
        if (issuePriority({ severity }) < issuePriority(existing)) {
          existing.severity = severity;
        }
        continue;
      }
      map.set(key, {
        severity,
        code: issue.code,
        title: issueTitle(issue.code, issue.message),
        explanation: issueExplanation(issue.code, issue.message),
        checks: [toolLabel(item.toolId)],
      });
    }
  }

  return Array.from(map.values()).sort(
    (a, b) => issuePriority(a) - issuePriority(b),
  );
}

function stackSignals(result: unknown): string[] {
  const source = result as {
    detections?: Array<{ name?: string }>;
    technologies?: string[];
    signals?: string[];
  };
  if (Array.isArray(source.technologies)) return source.technologies.slice(0, 5);
  if (Array.isArray(source.detections)) {
    return source.detections
      .map((item) => item.name)
      .filter((item): item is string => Boolean(item))
      .slice(0, 5);
  }
  if (Array.isArray(source.signals)) return source.signals.slice(0, 5);
  return [];
}

function collectPassedFacts(results: CompletedSiteToolResult[]): string[] {
  const facts: string[] = [];
  for (const item of results) {
    if (item.status === "error") continue;
    const result = item.result as Record<string, unknown> | null;
    if (!result) continue;
    if (item.toolId === "scan_site_minimal" && result.status === 200) {
      facts.push("the page is available and returns HTTP 200");
    }
    if (item.toolId === "analyze_indexability") {
      const indexable = (result as { indexable?: boolean }).indexable;
      if (indexable) facts.push("indexing is not blocked by meta robots or robots.txt");
    }
    if (item.toolId === "check_robots_txt") {
      const allowed = (result as { allowed?: boolean }).allowed;
      if (allowed) facts.push("robots.txt allows crawling of the checked URL");
    }
    if (item.toolId === "check_redirects") {
      const hops = (result as { total_hops?: number }).total_hops;
      if (hops === 0) facts.push("there are no redirects");
      if (hops === 1) facts.push("the redirect is configured in one step");
    }
    if (item.toolId === "detect_stack") {
      const signals = stackSignals(item.result);
      if (signals.length > 0) {
        facts.push(`technology signals found: ${signals.join(", ")}`);
      }
    }
  }
  return Array.from(new Set(facts)).slice(0, 6);
}

function formatIssueLine(
  issue: ReturnType<typeof collectIssues>[number],
  index: number,
): string {
  const severity =
    issue.severity === "critical"
      ? "critical"
      : issue.severity === "warning"
        ? "warning"
        : "info";
  return `${index}. ${issue.title} (${severity}): ${issue.explanation} Checks: ${issue.checks.join(", ")}.`;
}

function renderSiteUrlInternalChatReport(
  url: string,
  results: CompletedSiteToolResult[],
): string {
  const completed = results.filter((item) => item.status === "complete");
  const failed = results.filter((item) => item.status === "error");
  const issues = collectIssues(results);
  const blocking = issues.filter((issue) => issue.severity === "critical");
  const warnings = issues.filter((issue) => issue.severity === "warning");
  const info = issues.filter((issue) => issue.severity === "info");
  const passedFacts = collectPassedFacts(results);
  const firstFixes = issues
    .filter((issue) => issue.severity !== "info")
    .slice(0, 5);

  const lines = [
    `Site audit for ${url} completed: ${completed.length} checks finished.`,
    "",
    "**Short result**",
    `- Critical: ${blocking.length}. Warnings: ${warnings.length}. Info: ${info.length}.`,
    failed.length > 0
      ? `- Failed checks: ${failed.length}. Check URL availability and run the scan again.`
      : "- All selected checks finished without execution errors.",
  ];

  if (passedFacts.length > 0) {
    lines.push("", "**What looks good**");
    for (const fact of passedFacts) lines.push(`- ${fact}.`);
  }

  if (firstFixes.length > 0) {
    lines.push("", "**What blocks SEO and what to fix first**");
    firstFixes.forEach((issue, index) => {
      lines.push(`- ${formatIssueLine(issue, index + 1)}`);
    });
  } else if (issues.length > 0) {
    lines.push("", "**Notes without urgent blockers**");
    issues.slice(0, 5).forEach((issue, index) => {
      lines.push(`- ${formatIssueLine(issue, index + 1)}`);
    });
  }

  lines.push(
    "",
    "**Next step**",
    firstFixes.length > 0
      ? `Fix first: ${firstFixes.map((issue) => issue.title).join(", ")}. After edits, run the scan again and check whether critical issues and warnings decreased.`
      : "No critical issues were found in the selected checks. Review informational notes and run the scan again after edits.",
    "",
    "No additional user materials are required for this summary.",
  );

  return lines.join("\n");
}

export async function siteUrlInternalHandler(): Promise<McpHandlerResult> {
  const state = await readState();
  if (!state) {
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: "[site_url_error] No active ToraSEO site-by-URL audit is waiting.",
        },
      ],
    };
  }
  const analysisType = state.analysisType ?? "site_by_url";
  if (analysisType !== "site_by_url") {
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: "[site_url_error] Active ToraSEO context is not a site-by-URL audit.",
        },
      ],
    };
  }

  const selected = new Set(state.selectedTools);
  const normalizedUrl = normalizeUrl(state.url);
  const completed: CompletedSiteToolResult[] = [];
  for (const toolId of SITE_URL_INTERNAL_ORDER) {
    if (!selected.has(toolId)) continue;
    completed.push(await runSelectedSiteTool(toolId, normalizedUrl));
  }

  return {
    content: [
      {
        type: "text",
        text: renderSiteUrlInternalChatReport(normalizedUrl, completed),
      },
    ],
  };
}
