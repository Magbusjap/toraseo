/**
 * The seven tools the ToraSEO MCP server can run for site audits.
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
  | "check_robots_txt"
  | "analyze_sitemap"
  | "analyze_meta"
  | "analyze_headings"
  | "check_redirects"
  | "analyze_content"
  | "scan_site_minimal";

export interface ToolMeta {
  id: ToolId;
}

export const TOOLS: ToolMeta[] = [
  { id: "check_robots_txt" },
  { id: "analyze_sitemap" },
  { id: "analyze_meta" },
  { id: "analyze_headings" },
  { id: "check_redirects" },
  { id: "analyze_content" },
  { id: "scan_site_minimal" },
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
  check_robots_txt: "robots",
  analyze_sitemap: "sitemap",
  analyze_meta: "meta",
  analyze_headings: "headings",
  check_redirects: "redirects",
  analyze_content: "content",
  scan_site_minimal: "scanMinimal",
};

export function getToolI18nKeyBase(id: ToolId): string {
  return TOOL_I18N_KEY_BASE[id];
}

/** All tools enabled by default. */
export const DEFAULT_SELECTED_TOOLS: Set<ToolId> = new Set(TOOLS.map((t) => t.id));
