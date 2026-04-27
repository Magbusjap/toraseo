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
 * Note on labels: `label` and `tooltip` are user-facing strings.
 * They live as Russian literals here for v0.0.x; in v0.0.6 they
 * will be extracted into locales/{en,ru}.json and looked up by id.
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
  label: string;
  tooltip: string;
}

export const TOOLS: ToolMeta[] = [
  {
    id: "check_robots_txt",
    label: "Robots.txt",
    tooltip: "Доступность сайта для поисковых роботов",
  },
  {
    id: "analyze_sitemap",
    label: "Sitemap",
    tooltip: "Карта сайта и список индексируемых страниц",
  },
  {
    id: "analyze_meta",
    label: "Мета-теги",
    tooltip: "Title, description, Open Graph, viewport",
  },
  {
    id: "analyze_headings",
    label: "Заголовки",
    tooltip: "Структура заголовков h1-h6",
  },
  {
    id: "check_redirects",
    label: "Редиректы",
    tooltip: "Цепочка переадресаций и битые ссылки",
  },
  {
    id: "analyze_content",
    label: "Контент",
    tooltip: "Объём текста, соотношение код/текст",
  },
  {
    id: "scan_site_minimal",
    label: "Базовый скан",
    tooltip: "Общая проверка состояния сайта",
  },
];

/** All tools enabled by default. */
export const DEFAULT_SELECTED_TOOLS: Set<ToolId> = new Set(TOOLS.map((t) => t.id));
