/**
 * Site-audit tools the ToraSEO MCP server can run.
 *
 * These ids are used in three places:
 * - The sidebar checkboxes
 * - The IPC contract between renderer and main process
 * - core/ tool functions (after the mcp/ → core/ refactor)
 *
 * Order here = display order in the UI.
 *
 * Labels and tooltips live in the i18n bundle (locales/en.json,
 * locales/ru.json) under the `tools.<keyBase>.label` and
 * `tools.<keyBase>.tooltip` paths. The mapping from snake_case
 * `ToolId` to the camelCase JSON key is intentional: keeps the
 * code-side identifier stable for IPC and core/ imports while
 * letting the JSON keys read naturally.
 */

export type ToolId =
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

export interface ToolMeta {
  id: ToolId;
  group: "basic" | "onPage" | "advanced";
  defaultSelected?: boolean;
}

export const TOOLS: ToolMeta[] = [
  { id: "scan_site_minimal", group: "basic" },
  { id: "analyze_indexability", group: "basic" },
  { id: "check_robots_txt", group: "basic" },
  { id: "analyze_sitemap", group: "basic" },
  { id: "check_redirects", group: "basic" },
  { id: "analyze_meta", group: "onPage" },
  { id: "analyze_canonical", group: "onPage" },
  { id: "analyze_headings", group: "onPage" },
  { id: "analyze_content", group: "onPage" },
  { id: "analyze_links", group: "onPage" },
  { id: "detect_stack", group: "advanced", defaultSelected: false },
];

/**
 * Map a snake_case ToolId to its camelCase i18n key base.
 *
 * Examples:
 *   check_robots_txt → robots
 *   analyze_sitemap  → sitemap
 *   scan_site_minimal → scanMinimal
 *
 * Used by the renderer wherever it needs to look up a tool's
 * label/tooltip string. The MCP server and core/ functions
 * keep using the original snake_case ids — those don't need to
 * change just because the UI does.
 */
const TOOL_I18N_KEY_BASE: Record<ToolId, string> = {
  scan_site_minimal: "scanMinimal",
  analyze_indexability: "indexability",
  check_robots_txt: "robots",
  analyze_sitemap: "sitemap",
  check_redirects: "redirects",
  analyze_meta: "meta",
  analyze_canonical: "canonical",
  analyze_headings: "headings",
  analyze_content: "content",
  analyze_links: "links",
  detect_stack: "stack",
};

export function getToolI18nKeyBase(id: ToolId): string {
  return TOOL_I18N_KEY_BASE[id];
}

/** Baseline tools enabled by default; advanced checks stay opt-in. */
export const DEFAULT_SELECTED_TOOLS: Set<ToolId> = new Set(
  TOOLS.filter((tool) => tool.defaultSelected !== false).map((tool) => tool.id),
);
