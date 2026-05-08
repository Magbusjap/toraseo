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
    scan_site_minimal: "Базовый скан",
    analyze_indexability: "Индексация",
    check_robots_txt: "Robots.txt",
    analyze_sitemap: "Sitemap",
    check_redirects: "Редиректы",
    analyze_meta: "Meta-теги",
    analyze_canonical: "Canonical",
    analyze_headings: "Заголовки",
    analyze_content: "Контент",
    analyze_links: "Ссылки",
    detect_stack: "Стек сайта",
  };
  return labels[toolId];
}

function issueTitle(code: string | undefined, fallback: string | undefined): string {
  const titles: Record<string, string> = {
    no_title: "Title отсутствует",
    title_too_short: "Title слишком короткий",
    title_too_long: "Title слишком длинный",
    no_meta_description: "Meta description отсутствует",
    description_too_short: "Meta description слишком короткий",
    description_too_long: "Meta description слишком длинный",
    no_canonical: "Canonical отсутствует",
    canonical_relative: "Canonical указан относительным URL",
    canonical_points_elsewhere: "Canonical указывает на другой URL",
    og_missing: "Open Graph отсутствует",
    og_incomplete: "Open Graph заполнен не полностью",
    twitter_card_missing: "Twitter Card отсутствует",
    no_charset: "Charset не указан",
    no_viewport: "Viewport не указан",
    no_html_lang: "Язык HTML не указан",
    noindex_present: "Страница закрыта от индексации",
    robots_disallow: "Robots.txt запрещает обход",
    meta_noindex: "Meta robots запрещает индексацию",
    indexability_clear: "Индексация разрешена",
    no_sitemap: "Sitemap не найден",
    sitemap_not_found: "Sitemap не найден",
    sitemap_empty: "Sitemap пустой",
    no_redirects: "Редиректов нет",
    redirect_chain_too_long: "Цепочка редиректов слишком длинная",
    redirect_loop: "Обнаружена петля редиректов",
    heading_level_skip: "Пропуск уровня заголовка",
    no_h1: "H1 отсутствует",
    multiple_h1: "Несколько H1",
    no_main_content: "Основной текст не найден",
    thin_content: "Мало основного текста",
    borderline_content: "Основной текст на границе минимума",
    text_to_code_ratio_very_low: "Очень мало текста относительно HTML",
    text_to_code_ratio_low: "Мало текста относительно HTML",
    no_paragraphs: "Нет абзацев",
    no_internal_links: "Нет внутренних ссылок",
    many_external_links: "Много внешних ссылок",
    links_checked: "Ссылки проверены",
    stack_detected: "Стек сайта определён",
  };
  if (code && titles[code]) return titles[code];
  return fallback?.split(".")[0]?.trim() || "Результат проверки";
}

function issueExplanation(code: string | undefined, fallback: string | undefined): string {
  const explanations: Record<string, string> = {
    no_title:
      "Поисковикам и пользователям сложнее понять тему страницы без нормального title.",
    title_too_short:
      "Уточните title так, чтобы он лучше называл страницу и содержал важный поисковый смысл.",
    title_too_long:
      "Сократите title: длинные заголовки часто обрезаются в поисковой выдаче.",
    no_meta_description:
      "Поисковая система может сформировать сниппет автоматически; лучше добавить управляемое описание на 120-160 символов.",
    description_too_short:
      "Расширьте description до понятного описания страницы и пользы для пользователя.",
    description_too_long:
      "Сократите description, чтобы важный смысл не обрезался в сниппете.",
    no_canonical:
      "Если у страницы есть дубли или URL-варианты, добавьте канонический адрес.",
    canonical_relative:
      "Сделайте canonical абсолютным URL, чтобы поисковики не трактовали его неоднозначно.",
    canonical_points_elsewhere:
      "Проверьте, действительно ли эта страница должна ссылаться canonical на другой адрес.",
    og_missing:
      "При публикации ссылки в соцсетях превью может выглядеть случайным.",
    og_incomplete:
      "Добавьте недостающие Open Graph поля: заголовок, описание, URL и изображение превью.",
    twitter_card_missing:
      "Добавьте twitter:card или Open Graph fallback, чтобы ссылка выглядела лучше в X/Twitter.",
    no_charset:
      "Добавьте meta charset, чтобы браузеры не угадывали кодировку.",
    no_viewport:
      "Добавьте viewport для корректного отображения на мобильных устройствах.",
    no_html_lang:
      "Добавьте lang на html: это помогает доступности и языковому таргетингу.",
    noindex_present:
      "Уберите noindex на продакшене, если страницу нужно показывать в поиске.",
    robots_disallow:
      "Откройте обход важных страниц в robots.txt, если их нужно индексировать.",
    meta_noindex:
      "Проверьте meta robots: важная страница не должна быть закрыта от индексации.",
    no_sitemap:
      "Создайте sitemap.xml и укажите его в robots.txt, чтобы поисковикам было проще находить страницы сайта.",
    sitemap_not_found:
      "Создайте sitemap.xml и укажите его в robots.txt, чтобы поисковикам было проще находить страницы сайта.",
    sitemap_empty:
      "Заполните sitemap только теми страницами, которые действительно должны индексироваться.",
    redirect_chain_too_long:
      "Сократите цепочку редиректов до одного шага.",
    redirect_loop:
      "Исправьте петлю редиректов: такая страница может быть недоступна для пользователей и поисковиков.",
    heading_level_skip:
      "Приведите иерархию заголовков в более чистый порядок.",
    no_h1:
      "Добавьте один понятный H1, который называет основную тему страницы.",
    multiple_h1:
      "Оставьте один основной H1, а остальные крупные заголовки переведите в H2/H3.",
    no_main_content:
      "Проверьте, что важный контент доступен в HTML, а не только после сложного JS-рендеринга.",
    thin_content:
      "Добавьте содержательное описание темы или проверьте, что основной контент доступен в HTML.",
    borderline_content:
      "Усилите страницу содержательным текстом, если она должна привлекать поисковый трафик.",
    text_to_code_ratio_very_low:
      "Проверьте, не видит ли базовый скан только оболочку страницы вместо основного контента.",
    text_to_code_ratio_low:
      "Уменьшите лишний код или добавьте больше полезного видимого контента.",
    no_paragraphs:
      "Разбейте текст на абзацы, чтобы его легче читали пользователи и ассистивные технологии.",
    no_internal_links:
      "Добавьте внутренние ссылки на связанные страницы сайта.",
    many_external_links:
      "Проверьте, что внешние ссылки действительно нужны и не размывают фокус страницы.",
    links_checked:
      "Срочных действий по ссылкам не требуется.",
    stack_detected:
      "Используйте эти сигналы как справку, а не как SEO-проблему.",
  };
  if (code && explanations[code]) return explanations[code];
  return fallback?.trim() || "Проверьте этот пункт и запустите повторный скан после правок.";
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
      facts.push("страница доступна и отвечает HTTP 200");
    }
    if (item.toolId === "analyze_indexability") {
      const indexable = (result as { indexable?: boolean }).indexable;
      if (indexable) facts.push("индексация не заблокирована meta robots или robots.txt");
    }
    if (item.toolId === "check_robots_txt") {
      const allowed = (result as { allowed?: boolean }).allowed;
      if (allowed) facts.push("robots.txt разрешает обход проверяемого URL");
    }
    if (item.toolId === "check_redirects") {
      const hops = (result as { total_hops?: number }).total_hops;
      if (hops === 0) facts.push("редиректов нет");
      if (hops === 1) facts.push("редирект настроен в один шаг");
    }
    if (item.toolId === "detect_stack") {
      const signals = stackSignals(item.result);
      if (signals.length > 0) {
        facts.push(`найдены технологические сигналы: ${signals.join(", ")}`);
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
      ? "критично"
      : issue.severity === "warning"
        ? "предупреждение"
        : "информация";
  return `${index}. ${issue.title} (${severity}): ${issue.explanation} Проверки: ${issue.checks.join(", ")}.`;
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
    `Аудит сайта ${url} завершён: выполнено ${completed.length} проверок.`,
    "",
    "**Коротко по результату**",
    `- Критично: ${blocking.length}. Предупреждения: ${warnings.length}. Информация: ${info.length}.`,
    failed.length > 0
      ? `- Не удалось выполнить проверок: ${failed.length}. Проверьте доступность URL и повторите скан.`
      : "- Все выбранные проверки завершились без ошибки выполнения.",
  ];

  if (passedFacts.length > 0) {
    lines.push("", "**Что в порядке**");
    for (const fact of passedFacts) lines.push(`- ${fact}.`);
  }

  if (firstFixes.length > 0) {
    lines.push("", "**Что мешает SEO и что исправить первым**");
    firstFixes.forEach((issue, index) => {
      lines.push(`- ${formatIssueLine(issue, index + 1)}`);
    });
  } else if (issues.length > 0) {
    lines.push("", "**Замечания без срочного блокера**");
    issues.slice(0, 5).forEach((issue, index) => {
      lines.push(`- ${formatIssueLine(issue, index + 1)}`);
    });
  }

  lines.push(
    "",
    "**Следующий шаг**",
    firstFixes.length > 0
      ? `Исправьте сначала: ${firstFixes.map((issue) => issue.title).join(", ")}. После правок запустите повторный скан и сравните, сократились ли критичные проблемы и предупреждения.`
      : "Критичных проблем по выбранным проверкам не найдено. Просмотрите информационные замечания и запустите повторный скан после правок.",
    "",
    "Дополнительные материалы от пользователя для этой сводки не требуются.",
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
