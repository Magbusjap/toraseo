import { TOOLS, getToolI18nKeyBase, type ToolId } from "../config/tools";
import type { ScanComplete, CurrentScanState } from "../types/ipc";
import type { BridgeStagesMap } from "../hooks/useBridgeScan";
import type { StagesMap } from "../hooks/useScan";
import type {
  RuntimeScanContext,
  RuntimeScanFact,
} from "../types/runtime";

interface BridgeIssue {
  severity: "critical" | "warning" | "info";
  code: string;
  message: string;
}

const TOOL_LABELS: Record<ToolId, string> = {
  scan_site_minimal: "Minimal scan",
  analyze_indexability: "Indexability",
  check_robots_txt: "Robots.txt",
  analyze_sitemap: "Sitemap",
  check_redirects: "Redirects",
  analyze_meta: "Meta tags",
  analyze_canonical: "Canonical",
  analyze_headings: "Headings",
  analyze_content: "Content",
  analyze_links: "Links",
  detect_stack: "Stack detection",
};

function isToolId(value: string): value is ToolId {
  return TOOLS.some((tool) => tool.id === value);
}

function priorityFromStatus(
  status: "ok" | "warning" | "critical" | "error",
): RuntimeScanFact["severity"] {
  return status;
}

function priorityFromIssueSeverity(
  severity: BridgeIssue["severity"],
): RuntimeScanFact["severity"] {
  if (severity === "critical" || severity === "warning") {
    return severity;
  }
  return "ok";
}

function priorityFromBridgeIssue(issue: BridgeIssue): RuntimeScanFact["severity"] {
  if (
    issue.code === "no_meta_description" ||
    issue.code === "title_too_short" ||
    issue.code === "og_missing" ||
    issue.code === "twitter_card_missing"
  ) {
    return "warning";
  }
  if (issue.code === "no_canonical" || issue.code === "heading_level_skip") {
    return "ok";
  }
  return priorityFromIssueSeverity(issue.severity);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function getStringField(
  record: Record<string, unknown>,
  key: string,
): string | null {
  const value = record[key];
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function getNumberField(
  record: Record<string, unknown>,
  key: string,
): number | null {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function extractIssues(data: unknown): BridgeIssue[] {
  const record = asRecord(data);
  if (!record) return [];

  const source = Array.isArray(record.issues)
    ? record.issues
    : Array.isArray(record.verdicts)
      ? record.verdicts
      : [];

  return source.flatMap((item) => {
    const issue = asRecord(item);
    if (!issue) return [];
    const severity = issue.severity;
    if (
      severity !== "critical" &&
      severity !== "warning" &&
      severity !== "info"
    ) {
      return [];
    }

    const code = getStringField(issue, "code") ?? severity;
    const message =
      getStringField(issue, "message") ??
      `The ${code} finding was reported by a ToraSEO bridge tool.`;

    return [{ severity, code, message }];
  });
}

function formatIssueCode(code: string): string {
  return code
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function detailFromLocalStage(
  toolId: ToolId,
  stage: NonNullable<StagesMap[ToolId]>,
): string {
  if (stage.status === "error") {
    return stage.errorMessage ?? stage.errorCode ?? "The scan stage failed.";
  }
  if (stage.result !== undefined) {
    return detailFromBridgeData(toolId, stage.result);
  }
  if (!stage.summary) {
    return "Completed successfully.";
  }
  return `Critical: ${stage.summary.critical}, warning: ${stage.summary.warning}, info: ${stage.summary.info}.`;
}

function detailFromBridgeStage(
  stage: NonNullable<BridgeStagesMap[ToolId]>,
): string {
  if (stage.status === "error") {
    return stage.errorMessage ?? stage.errorCode ?? "The bridge stage failed.";
  }
  if (!stage.summary) {
    return "Completed successfully.";
  }
  return `Critical: ${stage.summary.critical}, warning: ${stage.summary.warning}, info: ${stage.summary.info}.`;
}

function detailFromBridgeData(
  toolId: ToolId,
  data: unknown,
  stage?: NonNullable<BridgeStagesMap[ToolId]>,
): string {
  const record = asRecord(data);
  if (!record) {
    return stage
      ? detailFromBridgeStage(stage)
      : "Tool completed and returned data.";
  }

  if (toolId === "scan_site_minimal") {
    const status = getNumberField(record, "status");
    const finalUrl = getStringField(record, "url");
    const title = getStringField(record, "title");
    const h1 = getStringField(record, "h1");
    const responseTime = getNumberField(record, "response_time_ms");
    return [
      status !== null ? `HTTP ${status}` : null,
      finalUrl ? `final URL: ${finalUrl}` : null,
      title ? `title: ${title}` : "title missing",
      h1 ? `H1: ${h1}` : "H1 missing",
      responseTime !== null ? `${responseTime} ms` : null,
    ]
      .filter(Boolean)
      .join("; ");
  }

  if (toolId === "check_robots_txt") {
    const allowed = record.allowed;
    const reason = getStringField(record, "reason");
    const robotsUrl = getStringField(record, "robots_txt_url");
    const crawlDelay = getNumberField(record, "crawl_delay_seconds");
    return [
      typeof allowed === "boolean"
        ? allowed
          ? "Crawling is allowed"
          : "Crawling is disallowed"
        : "Robots policy checked",
      reason ? `reason: ${reason}` : null,
      robotsUrl ? `robots.txt: ${robotsUrl}` : null,
      crawlDelay !== null ? `crawl-delay: ${crawlDelay}s` : null,
    ]
      .filter(Boolean)
      .join("; ");
  }

  if (toolId === "analyze_indexability") {
    const indexable = record.indexable;
    const reasons = Array.isArray(record.reasons) ? record.reasons.length : 0;
    const robots = asRecord(record.robots_txt);
    return [
      typeof indexable === "boolean"
        ? indexable
          ? "locally indexable"
          : "blocked from indexing locally"
        : "indexability checked",
      `blocking reasons: ${reasons}`,
      typeof robots?.allowed === "boolean"
        ? robots.allowed
          ? "robots allows crawl"
          : "robots blocks crawl"
        : null,
    ]
      .filter(Boolean)
      .join("; ");
  }

  if (toolId === "analyze_meta") {
    const status = getNumberField(record, "status");
    const basic = asRecord(record.basic);
    const title = asRecord(basic?.title);
    const description = asRecord(basic?.description);
    const openGraph = asRecord(record.open_graph);
    const ogCompleteness = getNumberField(openGraph ?? {}, "completeness");
    return [
      status !== null ? `HTTP ${status}` : null,
      title
        ? `title length: ${getNumberField(title, "length_chars") ?? "unknown"}`
        : "title missing",
      description
        ? `description length: ${
            getNumberField(description, "length_chars") ?? "unknown"
          }`
        : "description missing",
      ogCompleteness !== null
        ? `Open Graph completeness: ${ogCompleteness}/5`
        : null,
    ]
      .filter(Boolean)
      .join("; ");
  }

  if (toolId === "analyze_canonical") {
    const canonical = asRecord(record.canonical);
    return canonical
      ? [
          `canonical: ${getStringField(canonical, "value") ?? "unknown"}`,
          `absolute: ${String(canonical.is_absolute ?? "unknown")}`,
          `points to self: ${String(canonical.points_to_self ?? "unknown")}`,
        ].join("; ")
      : "canonical missing";
  }

  if (toolId === "analyze_headings") {
    const summary = asRecord(record.summary);
    return [
      `headings: ${getNumberField(summary ?? {}, "total") ?? "unknown"}`,
      `H1 count: ${getNumberField(summary ?? {}, "h1_count") ?? "unknown"}`,
      `level skips: ${
        getNumberField(summary ?? {}, "skip_count") ?? "unknown"
      }`,
    ].join("; ");
  }

  if (toolId === "analyze_sitemap") {
    const summary = asRecord(record.summary);
    const kind = getStringField(record, "kind");
    const sitemapUrl = getStringField(record, "sitemap_url");
    const discoveredVia = getStringField(record, "discovered_via");
    return [
      kind ? `kind: ${kind}` : null,
      discoveredVia ? `discovered via: ${discoveredVia}` : null,
      sitemapUrl ? `sitemap: ${sitemapUrl}` : "sitemap not found",
      `entries: ${
        getNumberField(summary ?? {}, "total_entries") ?? "unknown"
      }`,
    ]
      .filter(Boolean)
      .join("; ");
  }

  if (toolId === "check_redirects") {
    return [
      `final status: ${
        getNumberField(record, "final_status") ?? "unknown"
      }`,
      `hops: ${getNumberField(record, "total_hops") ?? "unknown"}`,
      getStringField(record, "final_url")
        ? `final URL: ${getStringField(record, "final_url")}`
        : null,
    ]
      .filter(Boolean)
      .join("; ");
  }

  if (toolId === "analyze_content") {
    const summary = asRecord(record.summary);
    const links = asRecord(record.links);
    const images = asRecord(record.images);
    const ratio = getNumberField(summary ?? {}, "text_to_code_ratio");
    return [
      `words: ${getNumberField(summary ?? {}, "word_count") ?? "unknown"}`,
      `paragraphs: ${
        getNumberField(summary ?? {}, "paragraph_count") ?? "unknown"
      }`,
      ratio !== null ? `text/code ratio: ${(ratio * 100).toFixed(1)}%` : null,
      `links: ${
        (getNumberField(links ?? {}, "internal") ?? 0) +
        (getNumberField(links ?? {}, "external") ?? 0)
      }`,
      `images without alt: ${
        getNumberField(images ?? {}, "without_alt") ?? "unknown"
      }`,
    ]
      .filter(Boolean)
      .join("; ");
  }

  if (toolId === "analyze_links") {
    const links = asRecord(record.links);
    return [
      `internal: ${getNumberField(links ?? {}, "internal") ?? 0}`,
      `external: ${getNumberField(links ?? {}, "external") ?? 0}`,
      `invalid: ${getNumberField(links ?? {}, "invalid") ?? 0}`,
    ].join("; ");
  }

  if (toolId === "detect_stack") {
    const detections = Array.isArray(record.detections)
      ? record.detections
      : [];
    const headers = asRecord(record.headers);
    const names = detections
      .flatMap((item) => {
        const detection = asRecord(item);
        const name = detection ? getStringField(detection, "name") : null;
        const confidence = detection
          ? getStringField(detection, "confidence")
          : null;
        return name ? [`${name}${confidence ? ` (${confidence})` : ""}`] : [];
      })
      .slice(0, 8);
    return [
      names.length > 0
        ? `detected: ${names.join(", ")}`
        : "no reliable stack markers detected",
      getStringField(headers ?? {}, "server")
        ? `server: ${getStringField(headers ?? {}, "server")}`
        : null,
      getStringField(headers ?? {}, "powered_by")
        ? `powered by: ${getStringField(headers ?? {}, "powered_by")}`
        : null,
    ]
      .filter(Boolean)
      .join("; ");
  }

  return stage
    ? detailFromBridgeStage(stage)
    : "Tool completed and returned data.";
}

export function buildNativeScanContext(
  url: string,
  selectedTools: Set<ToolId>,
  stages: StagesMap,
  summary: ScanComplete | null,
): RuntimeScanContext | null {
  const selected = TOOLS.filter((tool) => selectedTools.has(tool.id)).map(
    (tool) => tool.id,
  );
  if (!url.trim() || selected.length === 0) return null;

  const facts: RuntimeScanFact[] = [];
  const completedTools: ToolId[] = [];
  for (const toolId of selected) {
    const stage = stages[toolId];
    if (!stage) continue;
    if (
      stage.status === "ok" ||
      stage.status === "warning" ||
      stage.status === "critical" ||
      stage.status === "error"
    ) {
      completedTools.push(toolId);
      facts.push({
        toolId,
        title: getToolI18nKeyBase(toolId),
        detail: detailFromLocalStage(toolId, stage),
        severity: priorityFromStatus(stage.status),
        source: "local_scan",
      });
    }
  }

  return {
    url: url.trim(),
    selectedTools: selected,
    completedTools,
    totals: summary?.totals ?? {
      critical: 0,
      warning: 0,
      info: 0,
      errors: 0,
    },
    facts,
  };
}

export function buildBridgeScanFacts(
  state: CurrentScanState | null,
  stages: BridgeStagesMap,
): RuntimeScanFact[] {
  if (!state) return [];
  const facts: RuntimeScanFact[] = [];
  for (const rawToolId of state.selectedTools) {
    if (!isToolId(rawToolId)) continue;
    const toolId = rawToolId;
    const entry = state.buffer[toolId];
    const stage = stages[toolId];

    if (entry?.status === "complete") {
      const issues = extractIssues(entry.data);
      if (issues.length > 0) {
        for (const issue of issues) {
          facts.push({
            toolId,
            title: `${TOOL_LABELS[toolId]}: ${formatIssueCode(issue.code)}`,
            detail: issue.message,
            severity: priorityFromBridgeIssue(issue),
            source: "bridge_scan",
          });
        }
        continue;
      }

      facts.push({
        toolId,
        title: `${TOOL_LABELS[toolId]} completed`,
        detail: detailFromBridgeData(toolId, entry.data, stage),
        severity:
          stage?.status === "warning" ||
          stage?.status === "critical" ||
          stage?.status === "error"
            ? priorityFromStatus(stage.status)
            : "ok",
        source: "bridge_scan",
      });
      continue;
    }

    if (
      !stage ||
      (stage.status !== "ok" &&
        stage.status !== "warning" &&
        stage.status !== "critical" &&
        stage.status !== "error")
    ) {
      continue;
    }
    facts.push({
      toolId,
      title: getToolI18nKeyBase(toolId),
      detail: detailFromBridgeStage(stage),
      severity: priorityFromStatus(stage.status),
      source: "bridge_scan",
    });
  }
  return facts;
}
