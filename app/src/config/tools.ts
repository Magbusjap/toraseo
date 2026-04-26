/**
 * Список 7 tools, которые умеет анализировать ToraSEO MCP-сервер.
 *
 * Эти id используются:
 * - В sidebar как чекбоксы выбора
 * - В IPC контракте между renderer и main process
 * - В core/ tools (после рефакторинга mcp/ → core/)
 *
 * Порядок здесь = порядок отображения в UI.
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

/** Все tools включены по умолчанию. */
export const DEFAULT_SELECTED_TOOLS: Set<ToolId> = new Set(TOOLS.map((t) => t.id));
