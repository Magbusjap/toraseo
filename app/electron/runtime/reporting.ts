import { app, BrowserWindow, clipboard, dialog, screen } from "electron";
import fs from "node:fs/promises";
import * as fsSync from "node:fs";
import path from "node:path";
import log from "electron-log";

import type { RuntimeAuditReport } from "../../src/types/runtime.js";
import type { SupportedLocale } from "../../src/types/ipc.js";
import { getCurrentLocale } from "../locale.js";

let reportWindow: BrowserWindow | null = null;
let reportWindowNavigationToken = 0;
let reportWindowViewState: "closed" | "report" | "processing" | "ended" =
  "closed";
let reportWindowExportReport: RuntimeAuditReport | null = null;
const REPORT_ANALYSIS_VERSION = "0.0.2";

function analysisVersionLine(isRu: boolean, version = REPORT_ANALYSIS_VERSION): string {
  return isRu
    ? `Версия анализа: ${version}`
    : `Analysis version: ${version}`;
}

function normalizePdfPath(filePath: string): string {
  return path.extname(filePath).toLowerCase() === ".pdf"
    ? filePath
    : `${filePath}.pdf`;
}

function defaultExportPath(extension: "pdf" | "md" | "html" | "json"): string {
  const directory =
    app.isReady() && typeof app.getPath === "function"
      ? app.getPath("documents")
      : (process.env.USERPROFILE ?? process.cwd());
  return path.join(directory, `toraseo-report-${Date.now()}.${extension}`);
}

function stripMediaPlaceholderLines(text: string): string {
  return text
    .split(/\r?\n/g)
    .filter(
      (line) =>
        !/^\s*-{5,}\s*(?:место\s+для\s+(?:изображения|анимации|видео|аудио)|image placeholder|animation placeholder|video placeholder|audio placeholder)\s*-{5,}\s*$/iu.test(
          line,
        ),
    )
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function exportReportFromReportWindow(): Promise<void> {
  if (!reportWindowExportReport) return;
  const result = await exportReportPdf(reportWindowExportReport);
  if (!result.ok && result.error !== "cancelled") {
    log.error(`[runtime:reporting] PDF export failed: ${result.error}`);
    dialog.showErrorBox(
      "ToraSEO PDF export failed",
      result.error ?? "Failed to export report PDF.",
    );
  }
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatReportDuration(durationMs?: number): string | null {
  if (typeof durationMs !== "number" || !Number.isFinite(durationMs)) return null;
  const safeMs = Math.max(0, Math.round(durationMs));
  return `${(safeMs / 1000).toFixed(3).replace(".", ",")} s`;
}

const CYRILLIC_SLUG_MAP: Record<string, string> = {
  а: "a",
  б: "b",
  в: "v",
  г: "g",
  д: "d",
  е: "e",
  ё: "e",
  ж: "zh",
  з: "z",
  и: "i",
  й: "y",
  к: "k",
  л: "l",
  м: "m",
  н: "n",
  о: "o",
  п: "p",
  р: "r",
  с: "s",
  т: "t",
  у: "u",
  ф: "f",
  х: "h",
  ц: "ts",
  ч: "ch",
  ш: "sh",
  щ: "sch",
  ъ: "",
  ы: "y",
  ь: "",
  э: "e",
  ю: "yu",
  я: "ya",
};

function toLatinSlug(value: string): string {
  return value
    .toLowerCase()
    .split("")
    .map((char) => CYRILLIC_SLUG_MAP[char] ?? char)
    .join("")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 72);
}

function isLoadUrlAbortError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const maybeError = error as { code?: unknown; errno?: unknown; message?: unknown };
  return (
    maybeError.code === "ERR_ABORTED" ||
    maybeError.errno === -3 ||
    (typeof maybeError.message === "string" &&
      maybeError.message.includes("ERR_ABORTED"))
  );
}

async function loadReportWindowHtml(
  window: BrowserWindow,
  html: string,
): Promise<boolean> {
  try {
    await window.loadURL(
      `data:text/html;charset=UTF-8,${encodeURIComponent(html)}`,
    );
    return true;
  } catch (error) {
    if (isLoadUrlAbortError(error)) {
      return false;
    }
    throw error;
  }
}

function isUntitledArticleTitle(title: string, isRu: boolean): boolean {
  const normalized = title.trim().toLowerCase();
  return isRu
    ? normalized === "без названия"
    : normalized === "untitled" || normalized === "no title";
}

function isShortUntitledPlatform(platformKey: string): boolean {
  return platformKey === "x_short" || platformKey === "short_social_post";
}

function inferTitleFromArticleText(text: string): string | null {
  const firstLine = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => {
      if (!line) return false;
      if (/^\d+$/.test(line)) return false;
      if (/^часть\s+\d{1,3}$/iu.test(line)) return false;
      if (/^(?:загрузить|скачать)\s+pdf$/iu.test(line)) return false;
      if (/^(?:download|get)\s+pdf$/iu.test(line)) return false;
      if (/^-{5,}/.test(line)) return false;
      if (/\[\d+\]/.test(line)) return false;
      if (/[.!?…\]]$/.test(line)) return false;
      if (line.split(/\s+/).length > 14) return false;
      return line.length >= 4 && line.length <= 140;
    });
  return firstLine ?? null;
}

function isLikelyCopiedPageArtifact(paragraph: string): boolean {
  const trimmed = paragraph.trim();
  return (
    /^\d{1,3}$/.test(trimmed) ||
    /^часть\s+\d{1,3}$/iu.test(trimmed) ||
    /^(?:загрузить|скачать)\s+pdf$/iu.test(trimmed) ||
    /^(?:download|get)\s+pdf$/iu.test(trimmed) ||
    isMediaPlaceholderParagraph(trimmed)
  );
}

function articleParagraphEntries(text: string): Array<{ id: string; text: string }> {
  return text
    .split(/\n\s*\n/g)
    .map((item) => item.trim())
    .filter(Boolean)
    .map((paragraph, index) => ({
      id: `p${String(index + 1).padStart(3, "0")}`,
      text: paragraph,
    }));
}

function buildCopiedPageArtifactAnnotations(
  text: string,
  startId: number,
  isRu: boolean,
): ArticleAnnotation[] {
  const notes: ArticleAnnotation[] = [];
  const seen = new Set<string>();
  const paragraphs = articleParagraphEntries(text);

  for (const paragraph of paragraphs) {
    const trimmed = paragraph.text.trim();
    let detail: string | null = null;
    if (/^\d{1,3}$/.test(trimmed)) {
      detail = isRu
        ? "Похоже на служебный номер блока или элемент навигации, который мог попасть в текст при копировании со страницы."
        : "Looks like a service number or navigation element copied from the source page.";
    } else if (/^часть\s+\d{1,3}$/iu.test(trimmed)) {
      detail = isRu
        ? "Похоже на заголовок блока исходной страницы. Проверьте, должен ли он остаться как часть структуры статьи."
        : "Looks like a source-page section label. Check whether it should remain in the article structure.";
    } else if (/^(?:загрузить|скачать)\s+pdf$/iu.test(trimmed) || /^(?:download|get)\s+pdf$/iu.test(trimmed)) {
      detail = isRu
        ? "Похоже на служебную ссылку исходной страницы. Если это кнопка сайта, лучше вынести её из тела статьи."
        : "Looks like a source-page service link. If it is a site button, keep it outside the article body.";
    } else if (isMediaPlaceholderParagraph(trimmed)) {
      detail = isRu
        ? "Это служебная медиа-метка ToraSEO, а не ошибка текста. Проверьте только, стоит ли она рядом с нужным объяснением."
        : "This is a ToraSEO media placeholder, not a text error. Only check that it is near the relevant explanation.";
    } else if (/[¹²³⁴⁵⁶⁷⁸⁹⁰¼½¾⅓⅔⅛⅜⅝⅞]/u.test(trimmed)) {
      detail = isRu
        ? "В тексте есть надстрочные цифры или дробные Unicode-символы. Проверьте, не сломалось ли форматирование при копировании."
        : "The text contains superscript digits or Unicode fractions. Check whether formatting was preserved after copying.";
    }

    if (!detail || seen.has(trimmed)) continue;
    seen.add(trimmed);
    notes.push({
      id: startId + notes.length,
      kind: "note",
      label: isRu ? "Примечание" : "Note",
      detail,
      sourceToolIds: ["copied_page_artifact_review"],
      category: "service_element",
      severity: "info",
      marker: "note",
      paragraphId: paragraph.id,
      quote: trimmed,
      title: isRu ? "Служебный элемент" : "Service element",
      shortMessage: detail,
      confidence: 0.82,
    });
    if (notes.length >= 12) break;
  }

  return notes;
}

async function hydrateArticleTextReport(
  report: RuntimeAuditReport,
): Promise<RuntimeAuditReport> {
  const article = report.articleText;
  const sourceFile = article?.document.sourceFile;
  if (!article) return report;

  try {
    const text = article.document.text.trim()
      ? article.document.text.trim()
      : sourceFile
        ? (await fs.readFile(sourceFile, "utf8")).trim()
        : "";
    if (!text) return report;
    const isRu = articleReportIsRussian(report);
    const shouldInferTitle =
      !isShortUntitledPlatform(article.platform.key) &&
      isUntitledArticleTitle(article.document.title, isRu);
    const inferredTitle = shouldInferTitle ? inferTitleFromArticleText(text) : null;
    const existingArtifactNotes = article.annotations.some((item) =>
      item.sourceToolIds.includes("copied_page_artifact_review"),
    );
    const annotations = existingArtifactNotes
      ? article.annotations
      : [
          ...article.annotations,
          ...buildCopiedPageArtifactAnnotations(
            text,
            article.annotations.length + 1,
            isRu,
          ),
        ];
    return {
      ...report,
      articleText: {
        ...article,
        annotations,
        document: {
          ...article.document,
          text,
          title: inferredTitle ?? article.document.title,
          titleNote: inferredTitle ? null : article.document.titleNote,
        },
      },
    };
  } catch {
    return report;
  }
}

async function articleSourceTextFromReport(
  report: RuntimeAuditReport,
): Promise<string> {
  const hydratedReport = await hydrateArticleTextReport(report);
  return hydratedReport.articleText?.document.text.trim() ?? "";
}

const PDF_EXPORT_PREPARE_SCRIPT = `
  (() => {
    document.body.classList.add("pdf-export");
    document.querySelectorAll("[data-count]").forEach((el) => {
      el.textContent = el.getAttribute("data-count") || "0";
    });
    document.getElementById("article-scroll")?.classList.add("expanded");
    document.querySelectorAll(".toggle-wrap, #export-report, .report-window-action, #toraseo-viewport-size").forEach((el) => {
      el.remove();
    });
    const style = document.createElement("style");
    style.textContent = \`
      @page { size: A4 portrait; margin: 10mm; }
      @media print {
        * {
          animation: none !important;
          transition: none !important;
        }
        html,
        body {
          width: auto !important;
          min-width: 0 !important;
          background: #ffffff !important;
        }
        body {
          padding: 0 !important;
          color: #1a0f08 !important;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        #toraseo-viewport-size,
        .report-actions button,
        .toggle-wrap,
        .note-popover {
          display: none !important;
        }
        .dashboard,
        .shell {
          width: 100% !important;
          max-width: none !important;
          margin: 0 !important;
          gap: 10px !important;
        }
        .panel,
        .hero,
        .coverage,
        .platform-card,
        .metric-tile,
        .dimension-tile,
        .forecast-card,
        .strength-card,
        .insight-card,
        .footer-priority-panel,
        .tool-data-row,
        .article-page {
          box-shadow: none !important;
          break-inside: avoid;
          page-break-inside: avoid;
        }
        .panel,
        .hero,
        .coverage,
        .platform-card {
          padding: 12px !important;
          border-radius: 6px !important;
        }
        .report-summary-header {
          margin-bottom: 8px !important;
        }
        .report-summary-header h1 {
          font-size: 20px !important;
          line-height: 1.12 !important;
        }
        .report-summary-header p,
        p {
          font-size: 11px !important;
          line-height: 1.38 !important;
        }
        .top-grid {
          grid-template-columns: minmax(0, 1.45fr) minmax(0, 0.55fr) minmax(0, 0.72fr) !important;
          gap: 8px !important;
        }
        .hero h2 {
          font-size: 18px !important;
          line-height: 1.15 !important;
        }
        .coverage-value strong {
          font-size: 28px !important;
        }
        .summary-metrics {
          margin-top: 10px !important;
        }
        .metrics {
          grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
          gap: 8px !important;
        }
        .metric-tile {
          min-height: auto !important;
          padding: 10px !important;
        }
        .metric-tile h3 {
          font-size: 10px !important;
        }
        .metric-tile .ring {
          width: 74px !important;
          height: 74px !important;
          margin: 8px auto !important;
        }
        .metric-tile .ring strong {
          font-size: 22px !important;
        }
        .article-shell {
          grid-template-columns: minmax(0, 1fr) !important;
          gap: 10px !important;
        }
        .browser-frame {
          border-radius: 6px !important;
        }
        .article-scroll {
          max-height: none !important;
          overflow: visible !important;
          padding: 8px !important;
        }
        .article-page {
          max-width: none !important;
          padding: 16px 18px !important;
          border-radius: 6px !important;
        }
        .article-title-row h2 {
          font-size: 18px !important;
        }
        .article-meta {
          margin: 8px 0 12px !important;
        }
        .article-body {
          gap: 7px !important;
          font-size: 11px !important;
          line-height: 1.42 !important;
        }
        .annotation-list {
          margin-top: 10px !important;
        }
        .dimensions,
        .insight-grid,
        .forecast-grid,
        .strength-grid,
        .footer-fix-list,
        .tool-data-list {
          grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
          gap: 8px !important;
        }
      }
    \`;
    document.head.appendChild(style);
    return true;
  })();
`;

function priorityLabel(value: "high" | "medium" | "low"): string {
  if (value === "high") return "High";
  if (value === "low") return "Low";
  return "Medium";
}

function dimensionStatusClass(status: string): string {
  if (status === "healthy") return "good";
  if (status === "problem") return "bad";
  return "warn";
}

function metricToneClass(tone: string): string {
  if (tone === "good") return "good";
  if (tone === "bad") return "bad";
  if (tone === "warn") return "warn";
  return "muted";
}

function renderArticleTextReportHtml(report: RuntimeAuditReport): string {
  const article = report.articleText;
  if (!article) return renderReportHtml(report);

  const dimensions = article.dimensions
    .map(
      (dimension) => `
        <article class="dashboard-card ${dimensionStatusClass(dimension.status)}">
          <div class="card-topline">
            <h3>${escapeHtml(dimension.label)}</h3>
            <span>${escapeHtml(dimension.status)}</span>
          </div>
          <p>${escapeHtml(dimension.detail)}</p>
          <strong>${escapeHtml(dimension.recommendation)}</strong>
        </article>`,
    )
    .join("");

  const metrics = article.metrics
    .map(
      (metric) => {
        const value = metric.value ?? 0;
        return `
          <article class="metric-card ${metricToneClass(metric.tone)}">
            <span>${escapeHtml(metric.label)}</span>
            <strong data-count="${value}">0</strong>
            <small>${escapeHtml(metric.value === null ? "pending" : metric.suffix)}</small>
            <div class="meter"><i style="--value:${value}%"></i></div>
          </article>`;
      },
    )
    .join("");

  const priorities = article.priorities
    .map(
      (item) => `
        <article class="priority ${item.priority}">
          <span>${priorityLabel(item.priority)}</span>
          <h3>${escapeHtml(item.title)}</h3>
          <p>${escapeHtml(item.detail)}</p>
        </article>`,
    )
    .join("");

  const nextActions = article.nextActions
    .map((action) => `<span class="action-chip">${escapeHtml(action)}</span>`)
    .join("");

  return `<!doctype html>
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>ToraSEO Article Analytics</title>
      <style>
        :root {
          color-scheme: light;
          --bg: #fff7f0;
          --surface: #ffffff;
          --surface-soft: #fffaf6;
          --border: #efd9ca;
          --text: #1a0f08;
          --muted: #70554a;
          --accent: #ff6b35;
          --green: #0f9f6e;
          --amber: #b7791f;
          --red: #d13d35;
        }
        * { box-sizing: border-box; }
        body {
          margin: 0;
          padding: 28px;
          font-family: Inter, "Segoe UI", system-ui, sans-serif;
          color: var(--text);
          background:
            linear-gradient(180deg, rgba(255, 107, 53, 0.08), transparent 280px),
            var(--bg);
        }
        .shell {
          max-width: 1220px;
          margin: 0 auto;
          display: grid;
          gap: 18px;
        }
        .hero {
          display: grid;
          grid-template-columns: minmax(0, 1fr) 260px;
          gap: 18px;
          align-items: stretch;
        }
        .panel, .hero-main, .coverage {
          border: 1px solid var(--border);
          border-radius: 12px;
          background: rgba(255, 255, 255, 0.92);
          box-shadow: 0 18px 60px rgba(83, 45, 23, 0.08);
        }
        .hero-main, .coverage, .panel { padding: 22px; }
        .eyebrow {
          margin: 0 0 8px;
          color: var(--accent);
          font-size: 12px;
          font-weight: 800;
          letter-spacing: .08em;
          text-transform: uppercase;
        }
        h1, h2, h3, p { margin: 0; }
        h1 { font-size: 34px; line-height: 1.1; }
        h2 { font-size: 18px; }
        p { color: var(--muted); line-height: 1.6; }
        .hero-main p { margin-top: 10px; max-width: 760px; }
        .actions {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-top: 16px;
        }
        .action-chip {
          border: 1px solid var(--border);
          border-radius: 999px;
          background: var(--surface-soft);
          padding: 7px 10px;
          font-size: 12px;
          font-weight: 700;
        }
        .coverage strong {
          display: block;
          margin-top: 8px;
          font-size: 56px;
          line-height: 1;
        }
        .coverage span {
          color: var(--muted);
          font-size: 13px;
          font-weight: 700;
        }
        .meter {
          height: 8px;
          overflow: hidden;
          border-radius: 999px;
          background: #f1dfd3;
        }
        .meter i {
          display: block;
          height: 100%;
          width: var(--value);
          border-radius: inherit;
          background: currentColor;
          animation: grow 850ms ease-out both;
        }
        .metrics {
          display: grid;
          grid-template-columns: repeat(5, minmax(0, 1fr));
          gap: 12px;
        }
        .metric-card {
          min-height: 138px;
          border: 1px solid var(--border);
          border-radius: 10px;
          background: var(--surface);
          padding: 16px;
          color: var(--accent);
        }
        .metric-card.good { color: var(--green); }
        .metric-card.warn { color: var(--amber); }
        .metric-card.bad { color: var(--red); }
        .metric-card.muted { color: #9a8175; }
        .metric-card span {
          display: block;
          min-height: 34px;
          color: var(--muted);
          font-size: 12px;
          font-weight: 800;
          letter-spacing: .04em;
          text-transform: uppercase;
        }
        .metric-card strong {
          display: inline-block;
          margin: 10px 4px 10px 0;
          font-size: 34px;
          color: var(--text);
        }
        .metric-card small {
          color: var(--muted);
          font-weight: 800;
        }
        .dimensions {
          display: grid;
          grid-template-columns: repeat(5, minmax(0, 1fr));
          gap: 12px;
        }
        .dashboard-card {
          border: 1px solid var(--border);
          border-radius: 10px;
          background: var(--surface);
          padding: 16px;
        }
        .dashboard-card.good { border-color: rgba(15, 159, 110, 0.22); }
        .dashboard-card.warn { border-color: rgba(183, 121, 31, 0.25); }
        .dashboard-card.bad { border-color: rgba(209, 61, 53, 0.24); }
        .card-topline {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 10px;
          margin-bottom: 10px;
        }
        .card-topline span {
          border-radius: 999px;
          background: var(--surface-soft);
          padding: 4px 7px;
          color: var(--muted);
          font-size: 10px;
          font-weight: 800;
          text-transform: uppercase;
        }
        .dashboard-card p { min-height: 74px; font-size: 13px; }
        .dashboard-card strong {
          display: block;
          margin-top: 12px;
          font-size: 13px;
          line-height: 1.45;
        }
        .priorities {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 12px;
        }
        .priority {
          border: 1px solid var(--border);
          border-radius: 10px;
          background: var(--surface);
          padding: 16px;
        }
        .priority span {
          display: inline-block;
          margin-bottom: 8px;
          color: var(--accent);
          font-size: 11px;
          font-weight: 800;
          text-transform: uppercase;
        }
        .priority.high span { color: var(--red); }
        .priority.low span { color: var(--green); }
        .priority p { margin-top: 6px; font-size: 13px; }
        @keyframes grow {
          from { width: 0; }
          to { width: var(--value); }
        }
        @media (max-width: 980px) {
          .hero, .priorities { grid-template-columns: 1fr; }
          .metrics, .dimensions { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        }
        @media print {
          body { padding: 0; background: white; }
          .panel, .hero-main, .coverage, .metric-card, .dashboard-card, .priority {
            break-inside: avoid;
            box-shadow: none;
          }
        }
        ${viewportSizeOverlayStyle()}
      </style>
    </head>
    <body>
      <main class="shell">
        <section class="hero">
          <div class="hero-main">
            <p class="eyebrow">ToraSEO article analytics</p>
            <h1>${escapeHtml(articleVerdictLabelForDisplay(article, false))}</h1>
            <p>${escapeHtml(articleVerdictDetailForDisplay(article, false))}</p>
            <div class="actions">${nextActions}</div>
          </div>
          <aside class="coverage">
            <p class="eyebrow">Evidence coverage</p>
            <strong data-count="${article.coverage.percent}">0</strong>
            <span>${article.coverage.completed} / ${article.coverage.total} tools</span>
            <div class="meter" style="margin-top:16px"><i style="--value:${article.coverage.percent}%"></i></div>
          </aside>
        </section>

        <section class="panel">
          <p class="eyebrow">Core metrics</p>
          <div class="metrics">${metrics}</div>
        </section>

        <section class="panel">
          <p class="eyebrow">Dimension breakdown</p>
          <div class="dimensions">${dimensions}</div>
        </section>

        <section class="panel">
          <p class="eyebrow">Priority fixes</p>
          <div class="priorities">${priorities}</div>
        </section>
      </main>
      <script>
        (() => {
          const counters = document.querySelectorAll("[data-count]");
          counters.forEach((el) => {
            const target = Number(el.getAttribute("data-count") || "0");
            const start = performance.now();
            const tick = (now) => {
              const progress = Math.min(1, (now - start) / 850);
              el.textContent = String(Math.round(target * progress));
              if (progress < 1) requestAnimationFrame(tick);
            };
            requestAnimationFrame(tick);
          });
        })();
      </script>
      ${viewportSizeOverlayMarkup()}
    </body>
  </html>`;
}

function articleReportIsRussian(report: RuntimeAuditReport): boolean {
  if (report.locale === "ru" || report.locale === "en") {
    return report.locale === "ru";
  }
  const article = report.articleText;
  const sample = [
    article?.verdictLabel,
    article?.document.title,
    article?.annotationStatus,
  ].join(" ");
  return /[А-Яа-яЁё]/.test(sample);
}

function articleReportCopy(isRu: boolean) {
  return isRu
    ? {
        title: "Дашборд статьи",
        subtitle: "Инфографика по текущему анализу текста",
        readiness: "Готовность к публикации",
        coverage: "Покрытие инструментами",
        platform: "Платформа",
        metrics: "Ключевые показатели",
        dimensions: "Направления анализа",
        articleView: "Как выглядит статья",
        annotations: "Замечания и рекомендации",
        noText: "Текст не найден в отчёте.",
        expand: "Развернуть текст",
        collapse: "Свернуть текст",
        tools: "инструментов",
        words: "слов",
        paragraphs: "абзацев",
      }
    : {
        title: "Article Dashboard",
        subtitle: "Infographic view for the current text analysis",
        readiness: "Publish readiness",
        coverage: "Evidence coverage",
        platform: "Platform",
        metrics: "Core metrics",
        dimensions: "Analysis dimensions",
        articleView: "How the article looks",
        annotations: "Notes and recommendations",
        noText: "No article text is available in this report.",
        expand: "Expand text",
        collapse: "Collapse text",
        tools: "tools",
        words: "words",
        paragraphs: "paragraphs",
      };
}

function articleDashboardExtraCopy(isRu: boolean) {
  return isRu
    ? {
        improvementPanel: "Карта улучшения текста",
        articleProfile: "Профиль статьи",
        firstFixes: "Что исправить сначала",
        contentGap: "Пробелы содержания",
        toolData: "Данные инструментов",
        toolKeys: "Ключи инструментов",
        ready: "Готово",
        keyData: "Ключевые данные",
        found: "Что найдено",
        todo: "Что сделать",
        high: "Высокий приоритет",
        medium: "Средний приоритет",
        low: "Низкий приоритет",
        toraRankGroundwork: "Подготовка к Tora Rank",
        evidenceLayer:
          "Это пока не Tora Rank, а слой доказательств: метрики, замечания, привязка к тексту и покрытие инструментами.",
      }
    : {
        improvementPanel: "Text improvement map",
        articleProfile: "Article profile",
        firstFixes: "What to fix first",
        contentGap: "Content Gap",
        toolData: "Tool data",
        toolKeys: "Tool keys",
        ready: "Done",
        keyData: "Key data",
        found: "What was found",
        todo: "What to do",
        high: "High priority",
        medium: "Medium priority",
        low: "Low priority",
        toraRankGroundwork: "Tora Rank groundwork",
        evidenceLayer:
          "This is not Tora Rank yet; it is the evidence layer: metrics, notes, text anchors, and tool coverage.",
      };
}

function annotationClass(kind: string): string {
  if (kind === "issue") return "issue";
  if (kind === "style") return "style";
  if (kind === "note") return "note";
  return "recommendation";
}

function markerClass(annotation: ArticleAnnotation): string {
  if (annotation.marker === "outline") return "marker-outline";
  if (annotation.marker === "strike") return "marker-strike";
  if (annotation.marker === "muted") return "marker-muted";
  if (annotation.marker === "note") return "marker-note";
  return "marker-underline";
}

function dimensionStatusCopy(status: string, isRu: boolean): string {
  if (status === "healthy") return isRu ? "Норма" : "Healthy";
  if (status === "problem") return isRu ? "Проблема" : "Problem";
  return isRu ? "Нужно проверить" : "Watch";
}

type ArticleAnnotation = NonNullable<
  RuntimeAuditReport["articleText"]
>["annotations"][number];

function annotationAnchorId(id: number): string {
  return `annotation-marker-${id}`;
}

function scoreRingBackground(value: number): string {
  const safe = Math.max(0, Math.min(100, Math.round(value)));
  const angle = safe * 3.6;
  const track = "#f2e6dc";
  if (safe <= 0) return `conic-gradient(from -90deg, ${track} 0deg 360deg)`;
  const warmStop = Math.max(4, angle * 0.38);
  const goldStop = Math.max(warmStop + 4, angle * 0.68);
  return `conic-gradient(from -90deg, #ef4444 0deg, #fb6a3a ${warmStop}deg, #f59e0b ${goldStop}deg, #10b981 ${angle}deg, ${track} ${angle}deg 360deg)`;
}

function articleVerdictLabelForDisplay(
  article: NonNullable<RuntimeAuditReport["articleText"]>,
  isRu: boolean,
): string {
  const label = article.verdictLabel.trim();
  if (isRu && /высоким\s+риском/iu.test(label)) {
    return "Нужна проверка перед публикацией";
  }
  if (!isRu && /high-risk draft/i.test(label)) {
    return "Needs review before publishing";
  }
  return label;
}

function articleVerdictDetailForDisplay(
  article: NonNullable<RuntimeAuditReport["articleText"]>,
  isRu: boolean,
): string {
  const detail = article.verdictDetail.trim();
  if (isRu && /серь[её]зн\S*\s+риск/iu.test(detail)) {
    return "Один или несколько ключевых блоков требуют внимания. Проверьте предупреждения и приоритетные пункты перед публикацией.";
  }
  if (!isRu && /serious risk/i.test(detail)) {
    return "One or more core dimensions need attention. Check warnings and priority items before publishing.";
  }
  return detail;
}

function rawAnnotationTitle(annotation: ArticleAnnotation): string {
  return annotation.sourceToolIds.includes("copied_page_artifact_review")
    ? annotation.label
    : annotation.title?.trim() || annotation.label;
}

function rawAnnotationDetail(annotation: ArticleAnnotation): string {
  return annotation.shortMessage?.trim() || annotation.detail;
}

function localizeAnnotationTitle(
  annotation: ArticleAnnotation,
  isRu: boolean,
): string {
  const title = rawAnnotationTitle(annotation);
  if (!isRu) return localizeToolDataText(title, isRu);
  if (annotation.sourceToolIds.includes("copied_page_artifact_review")) {
    return "Служебный элемент";
  }
  const byTitle: Record<string, string> = {
    "ai-like wording": "ИИ-подобная формулировка",
    "audience fit": "Соответствие аудитории",
    "causality needs support": "Переход требует обоснования",
    "dense sentence": "Перегруженное предложение",
    "fact-sensitive topic": "Фактологически чувствительная тема",
    "formal phrasing": "Формальная формулировка",
    "intent and promotion forecast": "Прогноз интента и продвижения",
    "mechanical repetition": "Механический повтор",
    "media positions are not marked": "Позиции медиа не размечены",
    "possible contradiction": "Возможное противоречие",
    "punctuation spacing": "Пунктуация",
    "repeated sentence": "Повторяющееся предложение",
    "repeated term": "Повторяющийся термин",
    "section headings are weak": "Слабая структура заголовков",
    "short text for search intent": "Короткий текст для поискового интента",
    "sources are needed": "Нужны источники",
    "tone check": "Проверка тона",
    "vague authority": "Размытый источник",
    "verification needed": "Нужна проверка",
    "weak paragraph structure": "Слабая структура абзацев",
  };
  const translated = byTitle[title.trim().toLowerCase()];
  if (translated) return translated;
  if (annotation.category === "intent") return "Прогноз интента и продвижения";
  if (annotation.category === "legal") return "Проверка юридического риска";
  if (annotation.category === "medical") return "Проверка медицинского риска";
  if (annotation.category === "investment") return "Проверка инвестиционного риска";
  if (annotation.category === "engineering") return "Проверка технической части";
  if (annotation.category === "science") return "Проверка научной части";
  if (annotation.category === "calculation") return "Проверка расчётов";
  if (annotation.category === "source_context") return "Проверка площадки публикации";
  if (annotation.category === "external_verification") return "Нужна внешняя проверка";
  return title;
}

function localizeAnnotationDetail(
  annotation: ArticleAnnotation,
  isRu: boolean,
): string {
  const detail = rawAnnotationDetail(annotation);
  if (!isRu || annotation.sourceToolIds.includes("copied_page_artifact_review")) {
    return localizeToolDataText(detail, isRu);
  }
  const replacements: Array<[RegExp, string]> = [
    [
      /^This sentence appears to repeat another sentence almost exactly\.$/i,
      "Это предложение почти дословно повторяет другое предложение.",
    ],
    [
      /^This word often makes the sentence sound mechanical or bureaucratic\.$/i,
      "Это слово часто делает фразу механической или канцелярской.",
    ],
    [
      /^The tone is cautious and expert-oriented; keep warnings precise, not defensive\.$/i,
      "Тон осторожный и экспертный; оставляйте предупреждения точными, а не оборонительными.",
    ],
    [
      /^Check that examples, terms, and explanation depth match the intended reader\.$/i,
      "Проверьте, что примеры, термины и глубина объяснения подходят целевому читателю.",
    ],
    [
      /^Use a more direct verb if the meaning allows it\.$/i,
      "Если смысл позволяет, используйте более прямой глагол.",
    ],
    [
      /^The sentence is dense; grammar may be correct, but readability can suffer\.$/i,
      "Предложение плотное: грамматика может быть верной, но читаемость проседает.",
    ],
    [
      /^Split the sentence or add a clearer pause\.$/i,
      "Разделите предложение или добавьте более ясную паузу.",
    ],
    [
      /^This sentence is long enough that the reader may lose the thread\.$/i,
      "Предложение достаточно длинное: читатель может потерять нить.",
    ],
    [
      /^If media will improve understanding, mark the intended image\/video\/audio positions before rewriting\.$/i,
      "Если медиа поможет пониманию, перед правками отметьте предполагаемые места для изображения, видео или аудио.",
    ],
    [
      /^The first screen may not explain the reader payoff strongly enough\.$/i,
      "Первый экран может недостаточно ясно показывать пользу для читателя.",
    ],
    [
      /^The first screen has enough local signals for a useful preview\.$/i,
      "Первый экран даёт достаточно локальных сигналов для полезного превью.",
    ],
    [
      /^Validate demand with external SERP or social analytics when those sources are connected\.$/i,
      "Когда источники будут подключены, проверьте спрос через SERP или соцаналитику.",
    ],
    [
      /^The title and opening may not make the benefit clear enough for a search result or feed preview\.$/i,
      "Заголовок и вступление могут недостаточно ясно показывать пользу для выдачи или ленты.",
    ],
    [
      /^The opening hook can be stronger: make the reader's problem, conflict, or payoff visible earlier\.$/i,
      "Первый хук можно усилить: раньше показать проблему читателя, конфликт или понятную выгоду.",
    ],
    [
      /^Use this as a local forecast only\. For real demand and trend validation, connect SERP, Search Console, social analytics, or platform APIs later\.$/i,
      "Используйте это только как локальный прогноз. Для проверки реального спроса и трендов позже подключите SERP, Search Console, соцаналитику или API платформ.",
    ],
    [
      /^For WordPress or Laravel CMS, use the suggested SEO title, meta description, primary keyword, category, tags, and slug as a starting package\.$/i,
      "Для WordPress или Laravel CMS используйте предложенные SEO-title, описание, основной ключ, категорию, метки и slug как стартовый пакет.",
    ],
    [
      /^Not connected yet\. Future SERP\/social API data can replace this local forecast\.$/i,
      "Пока не подключено. В будущем данные SERP или API соцплатформ смогут заменить этот локальный прогноз.",
    ],
    [
      /^The text contains legal-sensitive claims\. It should not be presented as legal advice without review\.$/i,
      "В тексте есть юридически чувствительные формулировки. Их нельзя подавать как юридическую консультацию без проверки.",
    ],
    [
      /^The text contains medical or health-sensitive claims\. It should not replace clinician review or source verification\.$/i,
      "В тексте есть медицинские или health-sensitive утверждения. Они не должны заменять проверку врачом или источниками.",
    ],
    [
      /^The text contains investment-sensitive claims\. It should not be presented as personal investment advice\.$/i,
      "В тексте есть инвестиционно чувствительные формулировки. Их нельзя подавать как индивидуальную инвестиционную рекомендацию.",
    ],
    [
      /^The text contains technical or engineering claims that may need expert verification, drawings, standards, or manufacturer documentation\.$/i,
      "В тексте есть технические или конструкторские утверждения: проверьте их по документации, стандартам, чертежам или у специалиста.",
    ],
    [
      /^The text contains research or scientific-method claims that may need methodology, sources, or calculation review\.$/i,
      "В тексте есть научные или исследовательские утверждения: проверьте методику, источники и расчёты.",
    ],
    [
      /^The text contains several numeric or formula-like fragments; calculations may need a dedicated check\.$/i,
      "В тексте есть несколько чисел или формул: расчёты лучше вынести в отдельную проверку.",
    ],
    [
      /^The text may encourage illegal activity, platform-rule evasion, or unsafe instructions\.$/i,
      "В тексте есть риск опасных инструкций, обхода правил платформы или незаконного применения.",
    ],
    [
      /^The publication resource is custom or user-defined, so platform-specific rules and available interactions should be checked separately\.$/i,
      "Ресурс публикации задан пользователем: правила площадки, модерацию и доступные реакции аудитории нужно проверить отдельно.",
    ],
    [
      /^External source, jurisdiction, platform, SERP, or analytics verification was not performed by this local text scan\.$/i,
      "Внешняя проверка источников, правил площадки, страны, SERP или аналитики в этом локальном анализе не выполнялась.",
    ],
    [
      /^This term appears often enough to create a local repetition risk\.$/i,
      "Этот термин встречается часто и может создавать риск локального повтора.",
    ],
    [
      /^This phrase can make the text feel generic or AI-assisted\.$/i,
      "Эта фраза может делать текст более шаблонным или похожим на ИИ-черновик.",
    ],
    [
      /^This place may contain a punctuation spacing or sentence-boundary issue\.$/i,
      "Здесь может быть проблема с пробелом у знака препинания или границей предложения.",
    ],
    [
      /^This transition may need an example, evidence, or an intermediate explanation\.$/i,
      "Этому переходу может не хватать примера, доказательства или промежуточного объяснения.",
    ],
    [
      /^Sensitive claims appear without obvious source signals\.$/i,
      "Чувствительные утверждения выглядят недостаточно подкреплёнными источниками.",
    ],
  ];
  for (const [pattern, replacement] of replacements) {
    if (pattern.test(detail)) return detail.replace(pattern, replacement);
  }
  return detail
    .replace(/^Repeated terms may make the text feel mechanical:\s*/i, "Повторяющиеся термины могут делать текст механическим: ")
    .replace(/^No blocking intent risk was detected\.$/i, "Блокирующего риска по интенту не найдено.");
}

function localizeAnnotationMeta(
  annotation: ArticleAnnotation,
  isRu: boolean,
): string {
  const parts = [annotation.category, annotation.severity, annotation.paragraphId]
    .filter(Boolean)
    .map((part) => String(part));
  if (!isRu) return parts.join(" · ");
  const dictionary: Record<string, string> = {
    ai: "ИИ-риск",
    audience: "аудитория",
    calculation: "расчёты",
    critical: "критично",
    duplicate: "повтор",
    fact: "факты",
    info: "заметка",
    intent: "интент",
    engineering: "техническая проверка",
    external_verification: "внешняя проверка",
    investment: "инвестиционный риск",
    legal: "юридический риск",
    medical: "медицинский риск",
    readability: "читаемость",
    recommendation: "рекомендация",
    science: "научная проверка",
    service_element: "служебный элемент",
    source_context: "площадка публикации",
    style: "стиль",
    syntax: "синтаксис",
    tone: "тон",
    warning: "предупреждение",
  };
  return parts
    .map((part) => {
      const key = part.toLowerCase();
      if (/^p\d+$/i.test(part)) {
        return `абзац ${part.slice(1).replace(/^0+/, "") || "1"}`;
      }
      return dictionary[key] ?? part;
    })
    .join(" · ");
}

function isMediaPlaceholderParagraph(paragraph: string): boolean {
  return /место\s+для\s+(?:изображения|анимации|видео|аудио)|image placeholder|animation placeholder|video placeholder|audio placeholder/iu.test(
    paragraph,
  );
}

function splitParagraphIntoWords(paragraph: string): RegExpMatchArray[] {
  return [...paragraph.matchAll(/[\p{L}\p{N}]+(?:[-'][\p{L}\p{N}]+)?/gu)];
}

function anchorWordIndex(paragraph: string, localIndex: number): number | null {
  const words = splitParagraphIntoWords(paragraph);
  if (words.length === 0) return null;
  const preferred = words.findIndex((word) => {
    const value = word[0] ?? "";
    return value.length >= 4 && !/^\d+$/.test(value);
  });
  if (preferred === -1) return 0;
  return Math.min(words.length - 1, preferred + localIndex * 4);
}

function renderAnnotationBadge(
  annotation: ArticleAnnotation,
  isRu: boolean,
): string {
  const title = localizeAnnotationTitle(annotation, isRu);
  const detail = localizeAnnotationDetail(annotation, isRu);
  return `<sup id="${annotationAnchorId(annotation.id)}" class="annotation-number ${annotationClass(annotation.kind)}">${annotation.id}<span class="note-popover"><strong>${escapeHtml(
    title,
  )}</strong>${escapeHtml(detail)}</span></sup>`;
}

function findQuoteRange(
  paragraph: string,
  annotation: ArticleAnnotation,
): { start: number; end: number } | null {
  const quote = annotation.quote?.trim();
  if (!quote) return null;
  const direct = paragraph.indexOf(quote);
  if (direct >= 0) return { start: direct, end: direct + quote.length };
  const lowerParagraph = paragraph.toLowerCase();
  const lowerQuote = quote.toLowerCase();
  const normalized = lowerParagraph.indexOf(lowerQuote);
  if (normalized >= 0) {
    return { start: normalized, end: normalized + quote.length };
  }
  return null;
}

function rangesOverlap(
  left: { start: number; end: number },
  right: { start: number; end: number },
): boolean {
  return left.start < right.end && right.start < left.end;
}

function renderMarkedParagraph(
  paragraph: string,
  annotations: ArticleAnnotation[],
  isRu: boolean,
): string {
  const isMediaPlaceholder = isMediaPlaceholderParagraph(paragraph);
  const mediaClass = isMediaPlaceholder ? " media-placeholder-line" : "";
  if (isMediaPlaceholder) {
    return `<p class="article-paragraph${mediaClass}">${escapeHtml(paragraph)}</p>`;
  }
  if (annotations.length === 0) {
    return `<p class="article-paragraph${mediaClass}">${escapeHtml(paragraph)}</p>`;
  }

  const firstAnnotation = annotations[0];
  const paragraphClass = firstAnnotation
    ? ` marked-${annotationClass(firstAnnotation.kind)}`
    : "";
  const exactRanges: Array<{
    start: number;
    end: number;
    annotation: ArticleAnnotation;
  }> = [];
  const fallbackAnnotations: ArticleAnnotation[] = [];
  for (const annotation of annotations) {
    const range = findQuoteRange(paragraph, annotation);
    if (!range || exactRanges.some((item) => rangesOverlap(item, range))) {
      fallbackAnnotations.push(annotation);
      continue;
    }
    exactRanges.push({ ...range, annotation });
  }
  if (exactRanges.length > 0) {
    exactRanges.sort((left, right) => left.start - right.start);
    let exactCursor = 0;
    let exactHtml = "";
    for (const range of exactRanges) {
      exactHtml += escapeHtml(paragraph.slice(exactCursor, range.start));
      exactHtml += `<span class="annotation-anchor ${annotationClass(
        range.annotation.kind,
      )} ${markerClass(range.annotation)}">${renderAnnotationBadge(
        range.annotation,
        isRu,
      )}<span class="annotation-word">${escapeHtml(
        paragraph.slice(range.start, range.end),
      )}</span></span>`;
      exactCursor = range.end;
    }
    exactHtml += escapeHtml(paragraph.slice(exactCursor));
    return `
      <p class="article-paragraph has-annotation${paragraphClass}${mediaClass}">
        ${exactHtml}
      </p>`;
  }

  const words = splitParagraphIntoWords(paragraph);
  let cursor = 0;
  let html = "";
  const annotationByWordIndex = new Map<number, ArticleAnnotation[]>();

  fallbackAnnotations.forEach((annotation, localIndex) => {
    const index = anchorWordIndex(paragraph, localIndex);
    if (index === null) return;
    annotationByWordIndex.set(index, [
      ...(annotationByWordIndex.get(index) ?? []),
      annotation,
    ]);
  });

  words.forEach((word, index) => {
    const start = word.index ?? 0;
    const value = word[0] ?? "";
    html += escapeHtml(paragraph.slice(cursor, start));
    const wordAnnotations = annotationByWordIndex.get(index) ?? [];
    if (wordAnnotations.length === 0) {
      html += escapeHtml(value);
    } else {
      const mainAnnotation = wordAnnotations[0];
      const badges = wordAnnotations
        .map((annotation) => renderAnnotationBadge(annotation, isRu))
        .join("");
      html += `<span class="annotation-anchor ${annotationClass(
        mainAnnotation.kind,
      )} ${markerClass(mainAnnotation)}">${badges}<span class="annotation-word">${escapeHtml(
        value,
      )}</span></span>`;
    }
    cursor = start + value.length;
  });
  html += escapeHtml(paragraph.slice(cursor));

  return `
    <p class="article-paragraph has-annotation${paragraphClass}${mediaClass}">
      ${html}
    </p>`;
}

function distributeAnnotations(
  paragraphs: Array<{ id: string; text: string }>,
  annotations: ArticleAnnotation[],
): Map<number, ArticleAnnotation[]> {
  const result = new Map<number, ArticleAnnotation[]>();
  const localAnnotations = annotations.filter((annotation) => !annotation.global);
  localAnnotations.forEach((annotation) => {
    if (!annotation.paragraphId) return;
    const targetIndex = paragraphs.findIndex(
      (paragraph) => paragraph.id === annotation.paragraphId,
    );
    if (targetIndex < 0) return;
    result.set(targetIndex, [...(result.get(targetIndex) ?? []), annotation]);
  });
  const artifactIndexes = paragraphs
    .map((paragraph, index) => ({ paragraph, index }))
    .filter(({ paragraph }) => isLikelyCopiedPageArtifact(paragraph.text))
    .map(({ index }) => index);
  const candidateIndexes = paragraphs
    .map((paragraph, index) => ({ paragraph, index }))
    .filter(({ paragraph }) => !isLikelyCopiedPageArtifact(paragraph.text))
    .map(({ index }) => index);
  const targets =
    candidateIndexes.length > 0
      ? candidateIndexes
      : paragraphs.map((_, index) => index);
  if (targets.length === 0) return result;

  const artifactAnnotations = localAnnotations.filter(
    (annotation) =>
      !annotation.paragraphId &&
      annotation.sourceToolIds.includes("copied_page_artifact_review"),
  );
  const regularAnnotations = localAnnotations.filter(
    (annotation) =>
      !annotation.paragraphId &&
      !annotation.sourceToolIds.includes("copied_page_artifact_review"),
  );

  artifactAnnotations.forEach((annotation, index) => {
    const targetIndex = artifactIndexes[index % Math.max(1, artifactIndexes.length)];
    if (typeof targetIndex !== "number") return;
    result.set(targetIndex, [...(result.get(targetIndex) ?? []), annotation]);
  });

  regularAnnotations.forEach((annotation, index) => {
    const targetIndex =
      targets[
        Math.min(
          targets.length - 1,
          Math.floor((index * targets.length) / Math.max(1, regularAnnotations.length)),
        )
      ];
    result.set(targetIndex, [...(result.get(targetIndex) ?? []), annotation]);
  });
  return result;
}

function renderAnnotatedArticle(
  report: RuntimeAuditReport,
  labels: ReturnType<typeof articleReportCopy>,
  isRu: boolean,
): string {
  const article = report.articleText;
  const text = article?.document.text.trim() ?? "";
  if (!article || !text) return `<p class="empty-text">${labels.noText}</p>`;
  const paragraphs = articleParagraphEntries(text);
  const distributedAnnotations = distributeAnnotations(
    paragraphs,
    article.annotations,
  );
  const body = paragraphs
    .map((paragraph, index) =>
      renderMarkedParagraph(
        paragraph.text,
        distributedAnnotations.get(index) ?? [],
        isRu,
      ),
    )
    .join("");
  return `
      <div class="article-browser">
        <div class="browser-chrome" aria-hidden="true">
          <span></span><span></span><span></span>
        <i>${escapeHtml(labels.articleView)}</i>
      </div>
      <div class="article-scroll" id="article-scroll">
        <article class="article-page">
          <div class="article-margin-dots" id="article-margin-dots" aria-hidden="true"></div>
          <header class="article-title-row">
            <h2>${escapeHtml(article.document.title)}</h2>
            ${
              article.document.titleNote
                ? `<span>${escapeHtml(article.document.titleNote)}</span>`
                : ""
            }
          </header>
          <div class="article-meta">
            <span>${escapeHtml(article.platform.label)}</span>
            ${
              article.document.wordCount !== null
                ? `<span>${article.document.wordCount} ${labels.words}</span>`
                : ""
            }
            ${
              article.document.paragraphCount !== null
                ? `<span>${article.document.paragraphCount} ${labels.paragraphs}</span>`
                : ""
            }
            <span>${escapeHtml(labels.annotations)} (${article.annotations.length})</span>
          </div>
          <div class="article-body">${body}</div>
        </article>
      </div>
    </div>
    <div class="toggle-wrap"><button class="toggle-text" type="button" id="toggle-text">${labels.expand}</button></div>`;
}

function renderAnnotationList(
  report: RuntimeAuditReport,
  labels: ReturnType<typeof articleReportCopy>,
  isRu: boolean,
): string {
  const article = report.articleText;
  if (!article || article.annotations.length === 0) {
    return `<article class="annotation-row empty"><p>${escapeHtml(article?.annotationStatus ?? labels.annotations)}</p></article>`;
  }
  const rows = article.annotations
    .map(
      (item) => {
        const title = localizeAnnotationTitle(item, isRu);
        const detail = localizeAnnotationDetail(item, isRu);
        const meta = localizeAnnotationMeta(item, isRu);
        const href = item.global ? "article-scroll" : annotationAnchorId(item.id);
        return `
        <article class="annotation-row ${annotationClass(item.kind)}">
          <a href="#${href}" title="${escapeHtml(
            isRu ? "Показать в тексте" : "Show in text",
          )}">${item.id}</a>
          <div>
            <strong>${escapeHtml(title)}</strong>
            ${meta ? `<small>${escapeHtml(meta)}</small>` : ""}
            <p>${escapeHtml(detail)}</p>
          </div>
        </article>`;
      },
    )
    .join("");
  if (article.annotations.length > 8) {
    return `<details class="annotation-list" open><summary>${escapeHtml(labels.annotations)} (${article.annotations.length})</summary>${rows}</details>`;
  }
  return `<div class="annotation-list"><h3>${escapeHtml(labels.annotations)} (${article.annotations.length})</h3>${rows}</div>`;
}

function scoreFromDimensionStatus(status: string): number {
  if (status === "healthy") return 88;
  if (status === "watch") return 64;
  return 38;
}

function renderArticleProfile(
  report: RuntimeAuditReport,
  labels: ReturnType<typeof articleDashboardExtraCopy>,
): string {
  const article = report.articleText;
  if (!article) return "";
  const rows = article.dimensions
    .map((dimension) => {
      const score = scoreFromDimensionStatus(dimension.status);
      return `<div class="profile-row"><span>${escapeHtml(dimension.label)}</span><i><b style="--value:${score}%"></b></i><strong>${score}</strong></div>`;
    })
    .join("");
  return `<article class="insight-card"><h3>${escapeHtml(labels.articleProfile)}</h3><div class="profile-list">${rows}</div></article>`;
}

function renderFirstFixes(
  report: RuntimeAuditReport,
  labels: ReturnType<typeof articleDashboardExtraCopy>,
): string {
  const article = report.articleText;
  if (!article) return "";
  const fixes = article.priorities
    .slice(0, 5)
    .map(
      (item, index) =>
        `<li><span>${index + 1}</span><div><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.detail)}</p></div></li>`,
    )
    .join("");
  return `<article class="insight-card"><h3>${escapeHtml(labels.firstFixes)}</h3><ol class="fix-list">${fixes}</ol></article>`;
}

function renderContentGap(
  report: RuntimeAuditReport,
  labels: ReturnType<typeof articleDashboardExtraCopy>,
  isRu: boolean,
): string {
  const article = report.articleText;
  if (!article) return "";
  const wordCount = article.document.wordCount ?? 0;
  const paragraphCount = article.document.paragraphCount ?? 0;
  const hasMediaNote = article.annotations.some((item) =>
    item.sourceToolIds.includes("copied_page_artifact_review"),
  );
  const items = [
    {
      label: isRu ? "Понятный заголовок" : "Clear title",
      status: article.document.title ? "done" : "missing",
    },
    {
      label: isRu ? "Достаточный объём ответа" : "Enough answer depth",
      status: wordCount >= 700 ? "done" : wordCount >= 300 ? "partial" : "missing",
    },
    {
      label: isRu ? "Сканируемая структура" : "Scannable structure",
      status: paragraphCount >= 6 ? "done" : paragraphCount >= 3 ? "partial" : "missing",
    },
    {
      label: isRu ? "Медиа и служебные блоки отделены" : "Media and service blocks separated",
      status: hasMediaNote ? "partial" : "done",
    },
    {
      label: isRu ? "Факты можно проверить" : "Facts are verifiable",
      status: article.dimensions.find((item) => item.id === "trust")?.status === "healthy" ? "done" : "partial",
    },
  ];
  const rows = items
    .map(
      (item) =>
        `<li class="${item.status}"><span>${item.status === "done" ? "✓" : item.status === "partial" ? "!" : "×"}</span>${escapeHtml(item.label)}</li>`,
    )
    .join("");
  return `<article class="insight-card"><h3>${escapeHtml(labels.contentGap)}</h3><ul class="gap-list">${rows}</ul></article>`;
}

function renderIntentSeoPackage(
  report: RuntimeAuditReport,
  isRu: boolean,
): string {
  const forecast = report.articleText?.intentForecast;
  if (!forecast) return "";
  const seo = forecast.seoPackage;
  const noInternet = isRu
    ? "Локальный прогноз без SERP и соцданных. Для реального спроса позже нужен внешний источник: Search Console, SERP API или аналитика соцплатформ."
    : "Local forecast without SERP or social data. Real demand validation later needs an external source: Search Console, SERP API, or social analytics.";
  const labels = isRu
    ? {
        title: "Прогноз интента и SEO-пакет",
        hook: "Хук",
        hookTooltip:
          "Хук показывает, насколько первые строки цепляют читателя: видна ли боль, польза или обещание результата.",
        ctr: "CTR",
        ctrTooltip:
          "CTR — локальная оценка кликабельности заголовка и описания. Это не реальная статистика выдачи.",
        trend: "Тренд",
        trendTooltip:
          "Тренд — примерная локальная оценка потенциала темы по формулировкам текста. Интернет-спрос здесь не проверяется.",
        cms: "Для WordPress / Laravel CMS",
        seoTitle: "SEO-title",
        description: "Описание",
        keywords: "Ключевые слова",
        category: "Категория",
        tags: "Метки",
        slug: "URL-slug",
        hooks: "Цепляющие хуки",
      }
    : {
        title: "Intent forecast and SEO package",
        hook: "Hook",
        hookTooltip:
          "Hook estimates whether the opening lines show a clear pain, benefit, or promise.",
        ctr: "CTR",
        ctrTooltip:
          "CTR is a local clickability estimate for the title and description, not live search data.",
        trend: "Trend",
        trendTooltip:
          "Trend is a local topic-potential estimate from the text wording. It does not check internet demand.",
        cms: "For WordPress / Laravel CMS",
        seoTitle: "SEO title",
        description: "Description",
        keywords: "Keywords",
        category: "Category",
        tags: "Tags",
        slug: "URL slug",
        hooks: "Hooks",
      };
  const score = (label: string, value: number | null, tooltip: string) =>
    `<div class="forecast-score" aria-label="${escapeHtml(tooltip)}"><strong>${value ?? "—"}</strong><span>${escapeHtml(label)}</span><em>${escapeHtml(tooltip)}</em></div>`;
  const hookItems = forecast.hookIdeas
    .map((item) => `<li>${escapeHtml(localizeToolDataText(item, isRu))}</li>`)
    .join("");
  return `
    <section class="panel forecast-panel">
      <div class="forecast-head">
        <div>
          <p class="eyebrow">${escapeHtml(labels.title)}</p>
          <h3>${escapeHtml(localizeToolDataText(forecast.intentLabel, isRu))}</h3>
          <p>${escapeHtml(localizeToolDataText(forecast.internetDemandAvailable ? forecast.internetDemandSource : noInternet, isRu))}</p>
        </div>
        <div class="forecast-scores">
          ${score(labels.hook, forecast.hookScore, labels.hookTooltip)}
          ${score(labels.ctr, forecast.ctrPotential, labels.ctrTooltip)}
          ${score(labels.trend, forecast.trendPotential, labels.trendTooltip)}
        </div>
      </div>
      <div class="forecast-grid">
        <article class="forecast-card">
          <h3>${escapeHtml(labels.cms)}</h3>
          <dl>
            <dt>${escapeHtml(labels.seoTitle)}</dt><dd>${escapeHtml(localizeToolDataText(seo.seoTitle || "—", isRu))}</dd>
            <dt>${escapeHtml(labels.description)}</dt><dd>${escapeHtml(localizeToolDataText(seo.metaDescription || "—", isRu))}</dd>
            <dt>${escapeHtml(labels.keywords)}</dt><dd>${escapeHtml(localizeToolDataText(seo.keywords.join(", ") || "—", isRu))}</dd>
            <dt>${escapeHtml(labels.category)}</dt><dd>${escapeHtml(localizeToolDataText(seo.category || "—", isRu))}</dd>
            <dt>${escapeHtml(labels.tags)}</dt><dd>${escapeHtml(localizeToolDataText(seo.tags.join(", ") || "—", isRu))}</dd>
            <dt>${escapeHtml(labels.slug)}</dt><dd>${escapeHtml(localizeSeoSlugForReport(toLatinSlug(seo.slug || seo.seoTitle || seo.keywords.join(" ")) || "—", isRu))}</dd>
          </dl>
        </article>
        <article class="forecast-card">
          <h3>${escapeHtml(labels.hooks)}</h3>
          <ul>${hookItems}</ul>
        </article>
      </div>
    </section>`;
}

function localizeSeoSlugForReport(value: string, isRu: boolean): string {
  if (isRu) return value;
  return value.replace(/chto-vazhno-znat/gi, "what-to-know");
}

function renderStrengthWeaknessPanel(
  report: RuntimeAuditReport,
  isRu: boolean,
): string {
  const article = report.articleText;
  if (!article) return "";
  const warningItems = article.annotations.filter(
    (item) =>
      item.sourceToolIds.includes("safety_science_review") &&
      (item.severity === "critical" ||
        item.severity === "warning" ||
        item.kind === "issue"),
  );
  const labels = isRu
    ? {
        title: "Сильные и слабые стороны",
        strengths: "Сильные стороны",
        weaknesses: "Слабые стороны",
        warnings: "Риски и ограничения проверки",
        noStrengths: "Сильные стороны появятся после завершения проверок.",
        noWeaknesses: "Явных слабых сторон по текущим инструментам не найдено.",
        noWarnings: "Предупреждений по экспертной проверке не найдено.",
        warningFallback:
          "Проверьте блок безопасности и экспертной проверки перед публикацией.",
        limitation:
          "Это риск-флаг, а не экспертное заключение: ИИ может ошибаться, поэтому юридические, медицинские, инвестиционные, научные, технические и расчётные утверждения нужно проверять вручную.",
      }
    : {
        title: "Strengths and weaknesses",
        strengths: "Strengths",
        weaknesses: "Weaknesses",
        warnings: "Risks and review limits",
        noStrengths: "Strengths will appear after checks complete.",
        noWeaknesses: "No clear weaknesses were found by the current tools.",
        noWarnings: "No expert-review warnings were found.",
        warningFallback: "Review the safety and expert-check block before publishing.",
        limitation:
          "This is a risk flag, not an expert conclusion: AI can be wrong, so legal, medical, investment, scientific, technical, and calculation-heavy claims need manual review.",
      };
  const renderItems = (
    items: NonNullable<RuntimeAuditReport["articleText"]>["strengths"],
    emptyText: string,
  ) =>
    items.length > 0
      ? items
          .map(
            (item) =>
              `<article><strong>${escapeHtml(localizeToolDataText(item.title, isRu))}</strong><p>${escapeHtml(localizeToolDataText(item.detail, isRu))}</p></article>`,
          )
          .join("")
      : `<p>${escapeHtml(emptyText)}</p>`;
  const renderWarnings = () => {
    if (warningItems.length > 0) {
      return warningItems
        .map((item) => {
          const title = localizeToolDataText(item.title || item.label, isRu);
          const detail = localizeToolDataText(
            item.shortMessage || item.detail,
            isRu,
          );
          return `<article><strong>${escapeHtml(title)}</strong><p>${escapeHtml(detail)}</p></article>`;
        })
        .join("");
    }
    if (article.warningCount > 0) {
      return `<article><strong>${article.warningCount}</strong><p>${escapeHtml(labels.warningFallback)}</p></article>`;
    }
    return `<p>${escapeHtml(labels.noWarnings)}</p>`;
  };
  return `
    <section class="panel">
      <div class="strength-grid">
        <article class="strength-card good">
          <h3>${escapeHtml(labels.strengths)}</h3>
          ${renderItems(article.strengths, labels.noStrengths)}
        </article>
        <article class="strength-card warn">
          <h3>${escapeHtml(labels.weaknesses)}</h3>
          ${renderItems(article.weaknesses, labels.noWeaknesses)}
        </article>
      </div>
      <article class="strength-card warning-block ${article.warningCount > 0 ? "bad" : "good"}">
          <h3>${escapeHtml(labels.warnings)}</h3>
          ${renderWarnings()}
          <p class="warning-limitation">${escapeHtml(labels.limitation)}</p>
      </article>
    </section>`;
}

function renderArticleInsights(
  report: RuntimeAuditReport,
  isRu: boolean,
): string {
  const labels = articleDashboardExtraCopy(isRu);
  return `
    <section class="panel">
      <p class="eyebrow article-panel-heading">${escapeHtml(labels.improvementPanel)}</p>
      <div class="insight-grid">
        ${renderArticleProfile(report, labels)}
        ${renderContentGap(report, labels, isRu)}
      </div>
    </section>`;
}

function priorityToneLabel(
  priority: "high" | "medium" | "low",
  labels: ReturnType<typeof articleDashboardExtraCopy>,
): string {
  if (priority === "high") return labels.high;
  if (priority === "medium") return labels.medium;
  return labels.low;
}

function articleToolDescriptionForReport(toolIds: string[], isRu: boolean): string {
  const toolId = toolIds[0] ?? "";
  const descriptions: Record<string, { ru: string; en: string }> = {
    detect_text_platform: {
      ru: "Определяет площадку и контекст публикации.",
      en: "Detects the publishing platform and context.",
    },
    analyze_text_structure: {
      ru: "Проверяет заголовки, абзацы и каркас статьи.",
      en: "Checks headings, paragraphs, and article structure.",
    },
    analyze_text_style: {
      ru: "Определяет стиль текста и его слабые места.",
      en: "Detects text style and weak spots.",
    },
    analyze_tone_fit: {
      ru: "Смотрит, подходит ли тон теме и аудитории.",
      en: "Checks whether the tone fits the topic and audience.",
    },
    language_audience_fit: {
      ru: "Проверяет язык, сложность и соответствие аудитории.",
      en: "Checks language, complexity, and audience fit.",
    },
    media_placeholder_review: {
      ru: "Проверяет, где в тексте размещены медиа-метки.",
      en: "Checks media placeholder placement in the text.",
    },
    article_uniqueness: {
      ru: "Оценивает локальные повторы и шаблонность текста.",
      en: "Evaluates local repetition and template-like phrasing.",
    },
    genericness_water_check: {
      ru: "Проверяет, не слишком ли текст общий, водный или шаблонный.",
      en: "Checks whether the text is too broad, watery, or template-like.",
    },
    readability_complexity: {
      ru: "Проверяет плотность предложений и тяжёлые абзацы.",
      en: "Checks sentence density and heavy paragraphs.",
    },
    language_syntax: {
      ru: "Проверяет пунктуацию, границы предложений и перегруженные фразы.",
      en: "Checks punctuation, sentence boundaries, and overloaded phrasing.",
    },
    logic_consistency_check: {
      ru: "Проверяет противоречия, скачки вывода и причинно-следственные переходы.",
      en: "Checks contradictions, reasoning jumps, and causal transitions.",
    },
    naturalness_indicators: {
      ru: "Оценивает естественность ритма, повторов и формулировок.",
      en: "Evaluates naturalness of rhythm, repetition, and phrasing.",
    },
    ai_writing_probability: {
      ru: "Оценивает, насколько текст звучит как ИИ-черновик.",
      en: "Estimates how AI-draft-like the text sounds.",
    },
    intent_seo_forecast: {
      ru: "Оценивает интент, первую подачу и SEO-пакет.",
      en: "Evaluates intent, opening pitch, and SEO package.",
    },
    safety_science_review: {
      ru: "Ищет юридические, медицинские, научные и технические риски.",
      en: "Finds legal, medical, scientific, and technical risk signals.",
    },
    fact_distortion_check: {
      ru: "Проверяет факт-чувствительные утверждения и риск искажения.",
      en: "Checks fact-sensitive claims and distortion risk.",
    },
    ai_hallucination_check: {
      ru: "Проверяет признаки галлюцинаций и неподтвержденных утверждений.",
      en: "Checks hallucination and unsupported-claim signals.",
    },
  };
  return (
    descriptions[toolId]?.[isRu ? "ru" : "en"] ??
    (isRu ? "Показывает структурный результат выбранного инструмента." : "Shows the selected tool result.")
  );
}

function articleToolLabelForReport(toolIds: string[], isRu: boolean): string {
  const toolId = toolIds[0] ?? "";
  const labels: Record<string, { ru: string; en: string }> = {
    detect_text_platform: {
      ru: "Определение платформы",
      en: "Platform detection",
    },
    analyze_text_structure: {
      ru: "Структура текста",
      en: "Text structure",
    },
    analyze_text_style: {
      ru: "Стиль текста",
      en: "Text style",
    },
    analyze_tone_fit: {
      ru: "Соответствие тона",
      en: "Tone fit",
    },
    language_audience_fit: {
      ru: "Язык и аудитория",
      en: "Language and audience",
    },
    media_placeholder_review: {
      ru: "Размещение медиа",
      en: "Media placement",
    },
    article_uniqueness: {
      ru: "Уникальность статьи",
      en: "Article uniqueness",
    },
    language_syntax: {
      ru: "Синтаксис языка",
      en: "Language syntax",
    },
    ai_writing_probability: {
      ru: "Вероятность написания ИИ",
      en: "AI writing probability",
    },
    genericness_water_check: {
      ru: "Водность и шаблонность",
      en: "Genericness and watery text",
    },
    readability_complexity: {
      ru: "Читаемость и сложность",
      en: "Readability and complexity",
    },
    naturalness_indicators: {
      ru: "Естественность",
      en: "Naturalness",
    },
    logic_consistency_check: {
      ru: "Проверка логики",
      en: "Logic check",
    },
    intent_seo_forecast: {
      ru: "Прогноз интента и SEO",
      en: "Intent and SEO forecast",
    },
    safety_science_review: {
      ru: "Проверка рисков",
      en: "Risk review",
    },
    fact_distortion_check: {
      ru: "Искажение фактов",
      en: "Fact distortion",
    },
    ai_hallucination_check: {
      ru: "Проверка наличия ИИ и его галлюцинаций",
      en: "AI and hallucination check",
    },
  };
  return labels[toolId]?.[isRu ? "ru" : "en"] ?? (toolId || "Tool");
}

function renderToolFactDetail(
  detail: string,
  labels: ReturnType<typeof articleDashboardExtraCopy>,
  isRu: boolean,
): string {
  const normalizedDetail = detail
    .replace(/^Ключевые данные:\s*/gim, "")
    .replace(/^Что найдено:\s*/gim, "")
    .replace(/^Что сделать:\s*/gim, "");
  const sections = normalizedDetail
    .split(/\n{2,}/)
    .map((section) => section.trim())
    .map((section) => localizeToolDataText(section, isRu))
    .filter(Boolean);
  const keyData = sections[0] ?? localizeToolDataText(detail, isRu);
  const found = sections[1] ?? "";
  const todo = sections.slice(2).join("\n\n");
  const chips = keyData
    .split(/;\s*/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 6)
    .map((item) => `<span class="tool-chip">${escapeHtml(item)}</span>`)
    .join("");
  const fallback = found || (!chips ? keyData : "");
  return `
    ${
      chips
        ? `<div class="tool-key-data">
            <p class="tool-key-label">${escapeHtml(labels.keyData)}</p>
            <div class="tool-chip-list">${chips}</div>
          </div>`
        : ""
    }
    ${
      fallback
        ? `<div class="tool-note-block">
            <p class="tool-block-title">${escapeHtml(labels.found)}</p>
            <p>${escapeHtml(fallback)}</p>
          </div>`
        : ""
    }
    ${
      todo
        ? `<div class="tool-note-block tool-note-action">
            <p class="tool-block-title">${escapeHtml(labels.todo)}</p>
            <p>${escapeHtml(todo)}</p>
          </div>`
        : ""
    }`;
}

function localizeToolDataText(value: string, isRu: boolean): string {
  if (!isRu) {
    const exact: Record<string, string> = {
      "Безопасность и проверка": "Safety and review",
      "Интент и продвижение": "Intent and promotion",
      "Прогноз интента и продвижения": "Intent and promotion forecast",
      "Прогноз интента и SEO-пакет": "Intent forecast and SEO package",
      "Проверка риска": "Risk check",
      "Проверка рисков": "Risk check",
      "Проверка юридического риска": "Legal risk check",
      "Проверка медицинского риска": "Medical risk check",
      "Проверка инвестиционного риска": "Investment risk check",
      "Нужна внешняя проверка": "External review needed",
      "Служебный элемент": "Service element",
      "Механический повтор": "Mechanical repetition",
      "Формальная формулировка": "Formal phrasing",
      "Проверка тона": "Tone check",
      "Соответствие аудитории": "Audience fit",
      "Повторяющееся предложение": "Repeated sentence",
      "Перегруженное предложение": "Overloaded sentence",
      "Информационный / решение проблемы": "Informational / problem solution",
      "Тип интента: Информационный / решение проблемы": "Intent type: Informational / problem solution",
      "SEO-хук заголовка и вступления": "SEO hook for title and intro",
      "Полезные материалы": "Helpful resources",
      "Технологии": "Technology",
      "Здоровье и спорт": "Health and fitness",
      "Бизнес": "Business",
      "Предупреждение!": "Warning!",
      "НЕТ": "no",
      "ДА": "yes",
      "да": "yes",
      "нет": "no",
      "Есть фактически чувствительные утверждения, числа или медицинско-правовые формулировки. Их нельзя подтверждать только сравнением текстов. Перепроверьте числа, источники и категоричные утверждения; смягчите то, что нельзя подтвердить уверенно.": "The text contains fact-sensitive claims, numbers, or medical/legal wording. They cannot be verified by text comparison alone. Recheck numbers, sources, and categorical claims; soften anything that cannot be confirmed with confidence.",
      "Перепроверьте числа, источники и категоричные утверждения; смягчите то, что нельзя подтвердить уверенно.": "Recheck numbers, sources, and categorical claims; soften anything that cannot be confirmed with confidence.",
      "Расплывчатые ссылки на исследования и экспертов лучше заменить конкретными источниками или убрать.": "Vague references to research and experts should be replaced with specific sources or removed.",
      "Текст может выглядеть как попытка нарушить закон, правила платформы или дать опасные инструкции.": "The text may look like an attempt to break the law, evade platform rules, or provide dangerous instructions.",
      "Есть технические или конструкторские утверждения, где ошибка может быть критичной.": "Technical or engineering claims were found where mistakes may be critical.",
      "Для WordPress / Laravel CMS": "For WordPress / Laravel CMS",
      "Описание": "Description",
      "Ключевые слова": "Keywords",
      "Категория / метки": "Category / tags",
      "Цепляющие хуки": "Hook ideas",
    };
    const normalized = value.trim();
    if (exact[normalized]) return value.replace(normalized, exact[normalized]);
    const metaReplacements: Array<[RegExp, string]> = [
      [/\bСТИЛЬ\b/g, "STYLE"],
      [/\bТОН\b/g, "TONE"],
      [/\bАУДИТОРИЯ\b/g, "AUDIENCE"],
      [/\bЧИТАЕМОСТЬ\b/g, "READABILITY"],
      [/\bНАТУРАЛЬНОСТЬ\b/g, "NATURALNESS"],
      [/\bЛОГИКА\b/g, "LOGIC"],
      [/\bИНТЕНТ\b/g, "INTENT"],
      [/\bЮРИДИЧЕСКИЙ РИСК\b/g, "LEGAL RISK"],
      [/\bМЕДИЦИНСКИЙ РИСК\b/g, "MEDICAL RISK"],
      [/\bИНВЕСТИЦИОННЫЙ РИСК\b/g, "INVESTMENT RISK"],
      [/\bСЛУЖЕБНЫЙ ЭЛЕМЕНТ\b/g, "SERVICE ELEMENT"],
      [/\bПРЕДУПРЕЖДЕНИЕ\b/g, "WARNING"],
      [/\bЗАМЕТКА\b/g, "NOTE"],
      [/\bАБЗАЦ\b/g, "PARAGRAPH"],
    ];
    let localized = metaReplacements.reduce(
      (current, [pattern, replacement]) => current.replace(pattern, replacement),
      value,
    );
    const replacements: Array<[RegExp, string]> = [
      [/Информационный \/ решение проблемы/g, "Informational / problem solution"],
      [/SEO-хук заголовка и вступления/g, "SEO hook for title and intro"],
      [/Полезные материалы/g, "Helpful resources"],
      [/Технологии/g, "Technology"],
      [/Здоровье и спорт/g, "Health and fitness"],
      [/Бизнес/g, "Business"],
      [/что важно знать/gi, "what to know"],
      [/:\s*НЕТ\b/g, ": no"],
      [/:\s*ДА\b/g, ": yes"],
      [/:\s*нет\b/g, ": no"],
      [/:\s*да\b/g, ": yes"],
      [/Есть инвестиционно чувствительные формулировки\./g, "Investment-sensitive wording was found."],
      [/Есть юридически чувствительные формулировки\./g, "Legally sensitive wording was found."],
      [/Есть медицинские или health-sensitive утверждения\./g, "Medical or health-sensitive claims were found."],
      [/Интернет-сверка и проверка внешних источников не выполнялись в этом локальном анализе\./g, "Internet and external-source verification were not performed by this local analysis."],
      [/Интернет-сверка позже можно подключить отдельным внешним источником\./g, "Internet verification can be connected later through a separate external source."],
      [/Оба текста проверены как материалы для выбранной площадки\. Это локальная оценка формата, а не данные SERP\./gi, "Both texts were checked as materials for the selected platform. This is a local format estimate, not SERP data."],
      [/Проверьте, кому адресован каждый текст\. Если аудитория разная, сравнивайте не только качество, но и соответствие ожиданиям читателя\./gi, "Check who each text is addressed to. If the audiences differ, compare not only quality, but also fit with reader expectations."],
      [/У текста A сильнее видимая структура: больше опорных блоков для читателя\./gi, "Text A has stronger visible structure: more support blocks for the reader."],
      [/У текста B сильнее видимая структура: больше опорных блоков для читателя\./gi, "Text B has stronger visible structure: more support blocks for the reader."],
      [/Сравнивайте не только количество заголовков, а путь читателя: проблема, объяснение, шаги, примеры, FAQ и вывод\./gi, "Compare not only the number of headings, but the reader path: problem, explanation, steps, examples, FAQ, and conclusion."],
      [/Тон должен соответствовать риску темы: в медицине, финансах, праве и технике лучше звучит точность, осторожность и ясное ограничение советов\./gi, "Tone should match topic risk: in medicine, finance, law, and technical topics, precision, caution, and clear limits work better."],
      [/В текстах нет явных меток медиа\./gi, "The texts do not contain clear media markers."],
      [/В тексте нет явных меток медиа\./gi, "The text does not contain clear media markers."],
      [/Для длинной статьи стоит проверить, где нужны изображения, схемы или видео\./gi, "For a long article, check where images, diagrams, or video are needed."],
      [/Для сайта полезно отмечать медиа внутри релевантных разделов, а не складывать все изображения в конец текста\./gi, "For a site article, media markers should sit inside relevant sections, not be pushed to the end of the text."],
      [/0% в этой метрике означает отсутствие совпавших 4-словных фрагментов в локальной проверке, а не гарантию абсолютной уникальности\./gi, "0% in this metric means no matching 4-word fragments in the local check, not a guarantee of absolute uniqueness."],
      [/Найдены локальные синтаксические или пунктуационные сигналы, которые стоит вычитать вручную\./gi, "Local syntax or punctuation signals were found and should be manually reviewed."],
      [/В текстах есть причинно-следственные переходы\. Их нужно проверять на достаточность объяснения, а не считать ошибками автоматически\./gi, "The texts contain cause-and-effect transitions. They should be checked for sufficient support, not treated as automatic errors."],
      [/В тексте есть причинно-следственные переходы\. Их нужно проверять на достаточность объяснения, а не считать ошибками автоматически\./gi, "The text contains cause-and-effect transitions. They should be checked for sufficient support, not treated as automatic errors."],
      [/Проверьте места с «поэтому», «следовательно», «всегда» и «никогда»: рядом должно быть обоснование\./gi, "Check places with 'therefore', 'consequently', 'always', and 'never': they need nearby justification."],
      [/Текст A и текст B делают акцент на разных ключевых понятиях, поэтому интент может совпадать не полностью\./gi, "Text A and Text B emphasize different key concepts, so the intent may overlap only partially."],
      [/Перед выводом о том, какой текст сильнее, проверьте, что оба текста отвечают на один и тот же запрос\. Если один текст используется как конкурентный ориентир, берите фокус интента, а не формулировки\./gi, "Before deciding which text is stronger, check whether both texts answer the same request. If one text is used as a competitive reference, keep the intent focus, not the wording."],
      [/Текст A даёт больше сигналов конкретики: ([^.]+)\./gi, "Text A provides more specificity signals: $1."],
      [/Текст B даёт больше сигналов конкретики: ([^.]+)\./gi, "Text B provides more specificity signals: $1."],
      [/цифр, вопросов, списков или практических деталей/gi, "numbers, questions, lists, or practical details"],
      [/цифр, вопросов, списков и практических деталей/gi, "numbers, questions, lists, and practical details"],
      [/Сравнение текстов не заменяет медицинскую, юридическую, финансовую или научную экспертизу\./gi, "Text comparison does not replace medical, legal, financial, or scientific expertise."],
      [/Для медицинских, юридических, финансовых, технических и научных утверждений нужны источники, осторожные формулировки и ручная проверка\./gi, "Medical, legal, financial, technical, and scientific claims need sources, careful wording, and human review."],
      [/Если нужно приблизиться к стилю, переносите уровень ясности, ритм и плотность примеров, но не фразы и порядок абзацев\./gi, "If you need to move closer to the style, transfer clarity level, rhythm, and example density, not phrases or paragraph order."],
      [/Используйте похожую логику только как ориентир; добавьте собственные примеры, выводы и формулировки\./gi, "Use similar logic only as a reference: add your own examples, conclusions, and wording."],
      [/Используйте похожую логику только как ориентир: добавьте собственные примеры, выводы и формулировки\./gi, "Use similar logic only as a reference: add your own examples, conclusions, and wording."],
      [/Лучше работает заголовок, который прямо называет интент и пользу без кликбейта\./gi, "A title works better when it directly states the intent and benefit without clickbait."],
      [/Оценивайте пригодность под выбранную площадку: статьям сайта нужны структура и полнота, соцсетям — хук и короткая польза\./gi, "Evaluate fit for the selected platform: site articles need structure and completeness, while social posts need a hook and concise value."],
      [/Используйте сильные стороны как приоритеты редактирования, а не как повод копировать второй текст\./gi, "Use strengths as editing priorities, not as a reason to copy the other text."],
      [/Усиливайте более слабый текст добавленной ценностью, а не зеркальным повторением сильного текста\. После правок запустите сравнение снова и проверьте, сократились ли разрывы\./gi, "Strengthen the weaker text with added value, not by mirroring the stronger text. After editing, run the comparison again and check whether the gaps became smaller."],
      [/Усиливайте более слабый текст добавленной ценностью, а не зеркальными повторениями сильного текста\. После правок запустите сравнение снова и проверьте, сократились ли разрывы\./gi, "Strengthen the weaker text with added value, not by mirroring the stronger text. After editing, run the comparison again and check whether the gaps became smaller."],
      [/Текст A и текст B делают акцент на разных ключевых понятиях, поэтому интент может совпадать не полностью\. Перед выводом о том, какой текст сильнее, проверьте, что оба текста отвечают на один и тот же запрос\. Если один текст используется как конкурентный ориентир, берите фокус интента, а не формулировки\./gi, "Text A and Text B emphasize different key concepts, so the intent may overlap only partially. Before deciding which text is stronger, check whether both texts answer the same request. If one text is used as a competitive reference, keep the intent focus, not the wording."],
      [/Тексты заметно расходятся по тематическому покрытию; перед правкой проверьте отсутствующие разделы\./gi, "The texts differ noticeably in topical coverage; before editing, check the missing sections."],
      [/Что есть у B и может отсутствовать в A:/gi, "What B has that A may miss:"],
      [/Что есть у A и может отсутствовать в B:/gi, "What A has that B may miss:"],
      [/Используйте отсутствующие темы как подсказки для собственных разделов, примеров или FAQ, а не для копирования второго текста\./gi, "Use missing topics as prompts for your own sections, examples, or FAQ, not as material to copy from the other text."],
      [/Для рискованных тем добавьте предупреждения, источники и формулировки с границами применимости\./gi, "For sensitive topics, add warnings, sources, and wording with clear limits of applicability."],
      [/Добавляйте конкретные шаги, сценарии, примеры и цифры только там, где они точны и полезны\./gi, "Add concrete steps, scenarios, examples, and numbers only where they are accurate and useful."],
      [/[Уу]сильте смысловое покрытие через недостающие понятия, но добавляйте собственные объяснения и примеры\./g, "Strengthen semantic coverage through missing concepts, but add your own explanations and examples."],
      [/Сопоставляйте объём и структуру с площадкой: для статьи сайта важны полнота и разделы, для соцсетей — хук, ясность и компактность\./gi, "Compare volume and structure against the platform: site articles need completeness and sections, while social posts need a hook, clarity, and compactness."],
      [/Учитываются числа, списки и шаги\./gi, "Numbers, lists, and steps are counted."],
      [/Конкретику стоит добавлять только там, где она точна и полезна\./gi, "Add specificity only where it is accurate and useful."],
      [/нужна проверка/gi, "needs review"],
      [/низкий/gi, "low"],
      [/средний/gi, "medium"],
      [/высокий/gi, "high"],
      [/^Повторяющиеся термины могут делать текст механическим:\s*/i, "Repeated terms may make the text feel mechanical: "],
      [/^Проверьте, что примеры, термины и глубина объяснения подходят целевому читателю\.$/i, "Check that examples, terminology, and explanation depth fit the intended reader."],
      [/^Это предложение несёт много смыслов сразу и может требовать разделения\.$/i, "This sentence carries many ideas at once and may need splitting."],
      [/^Это слово часто делает фразу механической или канцелярской\.$/i, "This word often makes the sentence sound mechanical or bureaucratic."],
      [/^Тон осторожный и экспертный; оставляйте предупреждения точными, а не оборонительными\.$/i, "The tone is cautious and expert-oriented; keep warnings precise, not defensive."],
      [/^Первый экран даёт достаточно локальных сигналов для полезного превью\.$/i, "The first screen gives enough local signals for a useful preview."],
      [/^В тексте есть несколько чисел или формул: расчёты лучше вынести в отдельную проверку\.$/i, "The text contains several numeric or formula-like fragments; calculations may need a dedicated check."],
      [/^В тексте есть технические или конструкторские утверждения: проверьте их по документации, стандартам, чертежам или у специалиста\.$/i, "The text contains technical or engineering claims that may need expert verification, drawings, standards, or manufacturer documentation."],
      [/^В тексте есть научные или исследовательские утверждения: проверьте методику, источники и расчёты\.$/i, "The text contains research or scientific-method claims that may need methodology, sources, or calculation review."],
      [/^Внешняя проверка источников, правил площадки, страны, SERP или аналитики в этом локальном анализе не выполнялась\.$/i, "External source, jurisdiction, platform, SERP, or analytics verification was not performed by this local text scan."],
      [/^В тексте есть юридически чувствительные формулировки\. Их нельзя подавать как юридическую консультацию без проверки\.$/i, "The text contains legally sensitive claims. It should not be presented as legal advice without review."],
      [/^В тексте есть медицинские или health-sensitive утверждения\. Они не должны заменять проверку врачом или источниками\.$/i, "The text contains medical or health-sensitive claims. It should not replace clinician review or source verification."],
      [/^В тексте есть инвестиционно чувствительные формулировки\. Их нельзя подавать как индивидуальную инвестиционную рекомендацию\.$/i, "The text contains investment-sensitive claims. It should not be presented as personal investment advice."],
      [/^Есть фактически чувствительные утверждения, числа или медицинско-правовые формулировки\. Их нельзя подтверждать только сравнением текстов\. Перепроверьте числа, источники и категоричные утверждения; смягчите то, что нельзя подтвердить уверенно\.$/i, "The text contains fact-sensitive claims, numbers, or medical/legal wording. They cannot be verified by text comparison alone. Recheck numbers, sources, and categorical claims; soften anything that cannot be confirmed with confidence."],
      [/^Fact distortion:\s*Перепроверьте числа, источники и категоричные утверждения; смягчите то, что нельзя подтвердить уверенно\.$/i, "Fact distortion: Recheck numbers, sources, and categorical claims; soften anything that cannot be confirmed with confidence."],
      [/^AI and hallucination check:\s*Расплывчатые ссылки на исследования и экспертов лучше заменить конкретными источниками или убрать\.$/i, "AI and hallucination check: Vague references to research and experts should be replaced with specific sources or removed."],
      [/^Первый хук можно усилить:\s*/i, "The first hook can be stronger: "],
      [/^Начните с проблемы читателя:\s*«Почему\s+([^»]+?)\s+мешает получить результат\?»$/i, "Start with the reader's problem: \"Why $1 blocks the result?\""],
      [/^Начните с проблемы читателя:\s*"Почему\s+([^"]+?)\s+мешает получить результат\?"$/i, "Start with the reader's problem: \"Why $1 blocks the result?\""],
      [/^Начните с проблемы читателя:\s*/i, "Start with the reader's problem: "],
      [/^Покажите обещание пользы в первой строке:\s*что человек пойм[её]т или сможет сделать после чтения\.$/i, "Show the benefit promise in the first line: what the reader will understand or be able to do after reading."],
      [/^Покажите обещание пользы в первой строке:\s*что человек поймет и сможет сделать после чтения\.$/i, "Show the payoff in the first line: what the reader will understand and be able to do after reading."],
      [/^Покажите обещание пользы в первой строке:\s*/i, "Show the benefit promise in the first line: "],
      [/^Усилите первую строку, пользу для читателя и SEO-title перед публикацией\.$/i, "Strengthen the first line, reader benefit, and SEO title before publishing."],
      [/^Блокирующих предупреждений по безопасности и экспертной проверке не найдено\.$/i, "No blocking safety or expert-review warnings were found."],
      [/^Риски запрещённого контента, обхода правил, юридических, медицинских, инвестиционных, технических, научных выводов, расчётов и внешней сверки\.$/i, "Risks around prohibited content, rule evasion, legal, medical, investment, technical, scientific, calculation, and external-source review."],
      [/^Насколько понятно, зачем читать текст, какой интент он закрывает и насколько сильна первая подача\.$/i, "How clearly the text explains why to read it, what intent it satisfies, and how strong the opening presentation is."],
      [/^Сохраните текущий интент и используйте SEO-пакет как черновик для CMS\.$/i, "Keep the current intent and use the SEO package as a CMS draft."],
      [/^Это локальный прогноз без SERP и соцданных\. Интернет-сверку позже можно подключить отдельным внешним источником\.$/i, "This is a local forecast without SERP or social-platform data. Internet verification can be connected later through a separate external source."],
      [/^Если это пост или рилс, вынесите конфликт\/боль в первые 1–2 секунды или первую строку\.$/i, "If this is a post or reel, move the conflict/pain into the first 1-2 seconds or first line."],
      [/^Если это пост или рилс,\s*/i, "If this is a post or reel, "],
      [/: что важно знать\b/gi, ": what to know"],
    ];
    for (const [pattern, replacement] of replacements) {
      localized = localized.replace(pattern, replacement);
    }
    return localized;
  }
  const replacements: Array<[RegExp, string]> = [
    [/^Intent and promotion forecast$/i, "Прогноз интента и продвижения"],
    [/^Repeated sentence$/i, "Повторяющееся предложение"],
    [/^Risk check$/i, "Проверка риска"],
    [
      /^This word often makes the sentence sound mechanical or bureaucratic\.$/i,
      "Это слово часто делает фразу механической или канцелярской.",
    ],
    [
      /^The tone is cautious and expert-oriented; keep warnings precise, not defensive\.$/i,
      "Тон осторожный и экспертный; оставляйте предупреждения точными, а не оборонительными.",
    ],
    [
      /^Check that examples, terms, and explanation depth match the intended reader\.$/i,
      "Проверьте, что примеры, термины и глубина объяснения подходят целевому читателю.",
    ],
    [
      /^The title and opening may not make the benefit clear enough for a search result or feed preview\.$/i,
      "Заголовок и вступление могут недостаточно ясно показывать пользу для выдачи или ленты.",
    ],
    [
      /^The first screen may not explain the reader payoff strongly enough\.$/i,
      "Первый экран может недостаточно ясно показывать пользу для читателя.",
    ],
    [
      /^The text contains legal-sensitive claims\. It should not be presented as legal advice without review\.$/i,
      "В тексте есть юридически чувствительные формулировки. Их нельзя подавать как юридическую консультацию без проверки.",
    ],
    [
      /^The text contains medical or health-sensitive claims\. It should not replace clinician review or source verification\.$/i,
      "В тексте есть медицинские или health-sensitive утверждения. Они не должны заменять проверку врачом или источниками.",
    ],
    [
      /^The text contains investment-sensitive claims\. It should not be presented as personal investment advice\.$/i,
      "В тексте есть инвестиционно чувствительные формулировки. Их нельзя подавать как индивидуальную инвестиционную рекомендацию.",
    ],
    [
      /^The text contains technical or engineering claims that may need expert verification, drawings, standards, or manufacturer documentation\.$/i,
      "В тексте есть технические или конструкторские утверждения: проверьте их по документации, стандартам, чертежам или у специалиста.",
    ],
    [
      /^The text contains research or scientific-method claims that may need methodology, sources, or calculation review\.$/i,
      "В тексте есть научные или исследовательские утверждения: проверьте методику, источники и расчёты.",
    ],
    [
      /^The text contains several numeric or formula-like fragments; calculations may need a dedicated check\.$/i,
      "В тексте есть несколько чисел или формул: расчёты лучше вынести в отдельную проверку.",
    ],
    [
      /^The publication resource is custom or user-defined, so platform-specific rules and available interactions should be checked separately\.$/i,
      "Ресурс публикации задан пользователем: правила площадки, модерацию и доступные реакции аудитории нужно проверить отдельно.",
    ],
    [
      /^External source, jurisdiction, platform, SERP, or analytics verification was not performed by this local text scan\.$/i,
      "Внешняя проверка источников, правил площадки, страны, SERP или аналитики в этом локальном анализе не выполнялась.",
    ],
  ];
  for (const [pattern, replacement] of replacements) {
    if (pattern.test(value)) return value.replace(pattern, replacement);
  }
  return value;
}

function renderArticleFooterReport(
  report: RuntimeAuditReport,
  isRu: boolean,
): string {
  const article = report.articleText;
  if (!article) return "";
  const labels = articleDashboardExtraCopy(isRu);
  const fixes =
    article.priorities.length > 0
      ? article.priorities
          .map((item) => {
            const firstToolId = item.sourceToolIds[0] ?? "";
            const toolTitle =
              item.sourceToolIds.length > 0
                ? articleToolLabelForReport(item.sourceToolIds, isRu)
                : "";
            const title =
              toolTitle && toolTitle !== firstToolId ? toolTitle : item.title;
            return `
              <li class="${item.priority}">
                <div>
                  <header>
                    <strong>${escapeHtml(localizeToolDataText(title, isRu))}</strong>
                    <small>${escapeHtml(priorityToneLabel(item.priority, labels))}</small>
                  </header>
                  <p>${escapeHtml(localizeToolDataText(item.detail, isRu))}</p>
                </div>
              </li>`;
          })
          .join("")
      : `<li class="low"><div><header><strong>${escapeHtml(
          isRu ? "Критичных правок нет" : "No critical fixes",
        )}</strong><small>${escapeHtml(priorityToneLabel("low", labels))}</small></header><p>${escapeHtml(
          isRu
            ? "По текущим инструментам блокирующих проблем не найдено."
            : "The current tools did not find blocking issues.",
        )}</p></div></li>`;

  const toolRows =
    report.confirmedFacts.length > 0
      ? report.confirmedFacts
          .map(
            (fact) => `
              <article class="tool-data-row ${fact.priority}">
                <header>
                  <div class="tool-data-heading">
                    <span class="tool-data-icon">☷</span>
                    <div>
                      <strong>${escapeHtml(articleToolLabelForReport(fact.sourceToolIds, isRu))}</strong>
                      <small>${escapeHtml(articleToolDescriptionForReport(fact.sourceToolIds, isRu))}</small>
                    </div>
                  </div>
                  <span class="tool-status">${escapeHtml(labels.ready)}</span>
                </header>
                ${renderToolFactDetail(fact.detail, labels, isRu)}
              </article>`,
          )
          .join("")
      : `<p>${escapeHtml(
          isRu
            ? "Данные инструментов появятся после завершения проверок."
            : "Tool data will appear after checks complete.",
        )}</p>`;
  return `
    <section class="footer-priority-panel">
      <h3 class="footer-section-title">${escapeHtml(labels.firstFixes)}</h3>
        <ol class="footer-fix-list">${fixes}</ol>
    </section>
    <div class="footer-tool-title">
      <h3 class="footer-section-title">${escapeHtml(labels.toolData)}</h3>
    </div>
    <section class="tool-data-list">${toolRows}</section>`;
}

function renderArticleTextReportDashboardHtml(report: RuntimeAuditReport): string {
  const article = report.articleText;
  if (!article) return renderReportHtml(report);
  const isRu = articleReportIsRussian(report);
  const labels = articleReportCopy(isRu);
  const metrics = article.metrics
    .map((metric) => {
      const value = metric.value ?? 0;
      return `
        <article class="metric-tile ${metricToneClass(metric.tone)}">
          <h3>${escapeHtml(localizeToolDataText(metric.label, isRu))}</h3>
          <div class="ring" style="background:${scoreRingBackground(value)}"><strong data-count="${value}">0</strong><span>${escapeHtml(metric.suffix)}</span></div>
          <div class="metric-meter"><i class="${metricToneClass(metric.tone)}" style="--value:${value}%"></i></div>
          <p>${escapeHtml(localizeToolDataText(metric.description, isRu))}</p>
        </article>`;
    })
    .join("");
  const dimensions = article.dimensions
    .map(
      (dimension) => `
        <article class="dimension-tile ${dimensionStatusClass(dimension.status)}">
          <span>${escapeHtml(dimensionStatusCopy(dimension.status, isRu))}</span>
          <h3>${escapeHtml(localizeToolDataText(dimension.label, isRu))}</h3>
          <p>${escapeHtml(localizeToolDataText(dimension.detail, isRu))}</p>
          <strong>${escapeHtml(localizeToolDataText(dimension.recommendation, isRu))}</strong>
        </article>`,
    )
    .join("");
  const summaryLabels = isRu
    ? {
        title: "Результаты анализа — Инфографика",
        body:
          "Здесь собраны структурные результаты текущей проверки текста: короткая выжимка, покрытие инструментами, платформа и показатели.",
        toolCount: "инструментов анализа",
        export: "Экспортировать",
      }
    : {
        title: "Analysis results — Infographic",
        body:
          "This block collects the current structured text-audit results: summary, tool coverage, platform, and metrics.",
        toolCount: "analysis tools",
        export: "Export",
      };
  const warningStatusChip =
    article.warningCount > 0
      ? `<span class="status-chip warning-chip">${escapeHtml(
          isRu
            ? `Предупреждения: ${article.warningCount}`
            : `Warnings: ${article.warningCount}`,
        )}</span>`
      : "";

  return `<!doctype html>
  <html lang="${isRu ? "ru" : "en"}">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>ToraSEO ${escapeHtml(labels.title)}</title>
      <style>
        :root {
          color-scheme: light;
          --bg: #fff8f1;
          --paper: #fffaf6;
          --surface: #ffffff;
          --line: #ead5c6;
          --text: #1a0f08;
          --muted: #6f5549;
          --accent: #ff6b35;
          --issue: #ef4444;
          --recommendation: #2563eb;
          --style: #c57a10;
          --good: #059669;
          --shadow: 0 18px 48px rgba(83, 45, 23, 0.08);
        }
        html { scroll-behavior: smooth; }
        * { box-sizing: border-box; }
        body {
          margin: 0;
          padding: 34px 40px;
          font-family: Inter, "Segoe UI", system-ui, sans-serif;
          color: var(--text);
          background:
            radial-gradient(circle at 10% 0%, rgba(255, 107, 53, 0.10), transparent 320px),
            linear-gradient(180deg, rgba(255, 107, 53, 0.06), transparent 300px),
            var(--bg);
        }
        .dashboard { max-width: 1280px; margin: 0 auto; display: grid; gap: 18px; }
        .report-summary-header {
          display: flex;
          flex-wrap: wrap;
          align-items: flex-start;
          justify-content: space-between;
          gap: 16px;
          margin-bottom: 20px;
        }
        .report-summary-header h1 { margin-top: 2px; font-size: 24px; line-height: 1.15; }
        .report-summary-header p { max-width: 820px; font-size: 14px; }
        .report-actions {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          justify-content: flex-end;
          gap: 10px;
        }
        .report-actions span {
          border: 1px solid rgba(255,107,53,.28);
          border-radius: 999px;
          background: #fff4e8;
          padding: 7px 11px;
          color: var(--text);
          font-size: 12px;
          font-weight: 800;
        }
        .report-actions button {
          border: 0;
          border-radius: 8px;
          background: var(--accent);
          box-shadow: 0 8px 18px rgba(255,107,53,.18);
          padding: 9px 13px;
          color: white;
          font-weight: 900;
          cursor: pointer;
        }
        .analysis-version {
          margin: 0;
          color: rgba(26, 15, 8, 0.42);
          font-size: 11px;
          font-weight: 800;
          letter-spacing: .06em;
          text-transform: uppercase;
        }
        .top-grid { display: grid; grid-template-columns: minmax(0, 1.42fr) 280px 300px; gap: 14px; align-items: stretch; }
        .report-summary-panel .top-grid { margin-top: 10px; }
        .summary-metrics { margin-top: 18px; }
        .panel, .hero, .coverage, .platform-card {
          border: 1px solid var(--line);
          border-radius: 8px;
          background: rgba(255, 255, 255, 0.96);
          box-shadow: var(--shadow);
        }
        .hero, .coverage, .platform-card, .panel { padding: 20px; }
        .eyebrow {
          margin: 0 0 8px;
          color: #8f7f73;
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }
        h1, h2, h3, p { margin: 0; }
        h1 { font-size: 34px; line-height: 1.08; }
        h2 { font-size: 18px; }
        p { color: var(--muted); line-height: 1.55; }
        .hero h2 { margin-top: 2px; font-size: 24px; line-height: 1.16; }
        .hero p { margin-top: 10px; max-width: 760px; }
        .hero-ready {
          border-color: rgba(16, 185, 129, 0.32);
          background: rgba(236, 253, 245, 0.8);
        }
        .hero-needs_revision {
          border-color: rgba(252, 211, 77, 0.78);
          background: rgba(255, 251, 235, 0.86);
        }
        .hero-high_risk {
          border-color: rgba(252, 165, 165, 0.82);
          background: rgba(254, 242, 242, 0.86);
        }
        .status-chip {
          display: inline-flex;
          margin-top: 16px;
          margin-right: 8px;
          border: 1px solid rgba(26, 15, 8, 0.10);
          border-radius: 999px;
          padding: 6px 10px;
          color: rgba(26, 15, 8, 0.66);
          background: rgba(255, 255, 255, 0.76);
          font-size: 12px;
          font-weight: 800;
        }
        .warning-chip {
          border-color: rgba(239, 68, 68, 0.22);
          color: #b91c1c;
          background: rgba(254, 242, 242, 0.92);
        }
        .coverage-value {
          display: flex;
          align-items: flex-end;
          gap: 8px;
          margin-top: 12px;
        }
        .coverage-value strong {
          display: block;
          color: var(--text);
          font-size: 40px;
          line-height: 1;
          font-weight: 700;
        }
        .coverage-value span {
          padding-bottom: 4px;
          color: #8f7f73;
          font-size: 14px;
          font-weight: 800;
        }
        .meter { height: 8px; margin-top: 12px; overflow: hidden; border-radius: 999px; background: rgba(26,15,8,.10); }
        .meter i { display: block; width: var(--value); height: 100%; background: var(--accent); animation: grow 900ms ease-out both; }
        .metrics { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 12px; }
        .metric-tile {
          min-height: 238px;
          border: 1px solid rgba(255,107,53,.24);
          border-radius: 8px;
          background: rgba(255, 247, 240, 0.7);
          padding: 16px;
          text-align: left;
        }
        .metric-tile .ring {
          flex-shrink: 0;
        }
        .ring {
          display: flex;
          width: 144px;
          height: 144px;
          align-items: center;
          justify-content: center;
          flex-direction: column;
          margin: 14px auto 12px;
          border-radius: 50%;
          background: conic-gradient(from -90deg, #ef4444 0deg, #f97316 126deg, #fbbf24 220deg, #10b981 var(--value, 0deg), #f2e6dc var(--value, 0deg) 360deg);
          position: relative;
        }
        .ring::after {
          content: "";
          position: absolute;
          inset: 24px;
          border-radius: 50%;
          background: white;
          box-shadow: 0 2px 8px rgba(77,45,26,.06);
        }
        .ring strong, .ring span { position: relative; z-index: 1; }
        .ring strong { color: var(--text); font-size: 30px; line-height: 1; font-weight: 700; }
        .ring span { margin-top: 6px; color: #8f7f73; font-size: 12px; font-weight: 800; line-height: 1; }
        .metric-tile h3 {
          min-height: 34px;
          color: #8f7f73;
          font-size: 12px;
          font-weight: 800;
          letter-spacing: .04em;
          text-transform: uppercase;
          line-height: 1.25;
        }
        .metric-meter {
          height: 8px;
          margin-top: 12px;
          overflow: hidden;
          border-radius: 999px;
          background: rgba(26, 15, 8, 0.10);
        }
        .metric-meter i {
          display: block;
          width: var(--value);
          height: 100%;
          border-radius: inherit;
          animation: grow 900ms ease-out both;
        }
        .metric-meter i.good { background: #10b981; }
        .metric-meter i.warn { background: #f59e0b; }
        .metric-meter i.bad { background: #ef4444; }
        .metric-meter i.muted { background: rgba(26, 15, 8, 0.15); }
        .metric-tile p {
          margin-top: 14px;
          text-align: center;
          font-size: 12px;
        }
        .dimensions { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 12px; }
        .dimensions-panel { background: rgba(255, 255, 255, 0.94); }
        .dimension-tile {
          border: 1px solid rgba(15, 159, 110, 0.34);
          border-radius: 8px;
          background: #eafff5;
          padding: 16px;
        }
        .dimension-tile.warn { border-color: rgba(183, 121, 31, 0.42); background: #fff0c2; }
        .dimension-tile.bad { border-color: rgba(225, 75, 69, 0.42); background: #ffe4e1; }
        .dimension-tile span {
          float: right;
          border-radius: 999px;
          background: rgba(15,159,110,.92);
          padding: 3px 7px;
          color: white;
          font-size: 9px;
          font-weight: 900;
          text-transform: uppercase;
        }
        .dimension-tile.warn span { background: rgba(183,121,31,.96); }
        .dimension-tile.bad span { background: rgba(225,75,69,.96); }
        .dimension-tile h3 { font-size: 15px; }
        .dimension-tile p { min-height: 66px; margin-top: 10px; font-size: 12px; }
        .dimension-tile strong { display: block; margin-top: 12px; font-size: 12px; line-height: 1.45; }
        .article-panel-heading {
          text-align: center;
          color: var(--text);
          font-size: 14px;
          letter-spacing: 0.04em;
        }
        .article-shell { display: grid; grid-template-columns: minmax(0, 1fr); gap: 18px; align-items: start; }
        .article-shell > aside { width: min(100%, 920px); margin: 0 auto; }
        .article-browser {
          width: min(100%, 1040px);
          margin: 0 auto;
          overflow: visible;
          border: 1px solid #dfd2c6;
          border-radius: 11px;
          background: #f6f1ea;
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.75), 0 12px 34px rgba(56, 38, 28, 0.08);
        }
        .browser-chrome {
          display: flex;
          align-items: center;
          gap: 7px;
          height: 34px;
          border-bottom: 1px solid #e2d6ca;
          padding: 0 12px;
          background: linear-gradient(180deg, #fffaf6, #efe6dc);
        }
        .browser-chrome span {
          width: 9px;
          height: 9px;
          border-radius: 50%;
          background: #ff6b35;
          box-shadow: 0 1px 2px rgba(32, 23, 19, 0.16);
        }
        .browser-chrome span:nth-child(2) { background: #f0b23b; }
        .browser-chrome span:nth-child(3) { background: #23b26d; }
        .browser-chrome i {
          flex: 1;
          margin-left: 10px;
          border: 1px solid #e1d2c4;
          border-radius: 999px;
          background: rgba(255,255,255,0.7);
          color: var(--muted);
          font-size: 11px;
          font-style: normal;
          font-weight: 700;
          line-height: 20px;
          text-align: center;
        }
        .article-scroll {
          max-height: 620px;
          overflow: auto;
          padding: 18px 122px 28px;
          transition: max-height 220ms ease;
        }
        .article-scroll.expanded { max-height: none; }
        .article-page {
          position: relative;
          max-width: 760px;
          margin: 0 auto;
          overflow: visible;
          border: 1px solid #eadfd6;
          border-radius: 8px;
          background: #fffefd;
          padding: 40px 52px;
          box-shadow: 0 10px 34px rgba(56, 38, 28, 0.08);
        }
        .article-title-row { display: flex; align-items: baseline; gap: 10px; }
        .article-title-row h2 { font-size: 28px; line-height: 1.18; }
        .article-title-row span { color: var(--muted); font-size: 12px; }
        .article-meta { display: flex; flex-wrap: wrap; gap: 8px; margin: 14px 0 24px; color: var(--muted); font-size: 12px; }
        .article-meta span { border: 1px solid var(--line); border-radius: 999px; padding: 5px 9px; background: white; }
        .article-body { display: grid; gap: 15px; font-size: 16px; line-height: 1.74; }
        .article-paragraph {
          position: relative;
          color: var(--text);
          white-space: pre-wrap;
        }
        .article-paragraph.has-annotation {
          --mark-color: var(--recommendation);
        }
        .article-paragraph.marked-issue { --mark-color: var(--issue); }
        .article-paragraph.marked-recommendation { --mark-color: var(--recommendation); }
        .article-paragraph.marked-style { --mark-color: var(--style); }
        .article-paragraph.marked-note { --mark-color: #8d7667; }
        .media-placeholder-line {
          color: #8a6b58;
          font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
          font-size: 13px;
          letter-spacing: 0.01em;
        }
        .side-dot-stack {
          display: none;
        }
        .article-margin-dots {
          position: absolute;
          left: -90px;
          top: 0;
          width: 16px;
          height: 100%;
          pointer-events: none;
        }
        .side-dot {
          position: absolute;
          display: block;
          width: 9px;
          height: 9px;
          border-radius: 50%;
          border: 2px solid white;
          opacity: 1;
          box-shadow: 0 0 0 2px currentColor, 0 0 14px currentColor;
        }
        .side-dot.issue { color: var(--issue); }
        .side-dot.recommendation { color: var(--recommendation); }
        .side-dot.style { color: var(--style); }
        .side-dot.note { color: #8d7667; }
        .annotation-anchor.issue { --mark-color: var(--issue); }
        .annotation-anchor.recommendation { --mark-color: var(--recommendation); }
        .annotation-anchor.style { --mark-color: var(--style); }
        .annotation-anchor.note { --mark-color: #8d7667; }
        .annotation-number.issue { --marker-color: var(--issue); }
        .annotation-number.recommendation { --marker-color: var(--recommendation); }
        .annotation-number.style { --marker-color: var(--style); }
        .annotation-number.note { --marker-color: #8d7667; }
        .annotation-anchor {
          position: relative;
          display: inline;
          --mark-color: var(--recommendation);
          color: var(--mark-color);
          cursor: help;
        }
        .annotation-word {
          color: var(--text);
          text-decoration-color: var(--mark-color);
          text-decoration-thickness: 1.5px;
          text-underline-offset: 4px;
        }
        .annotation-anchor.marker-underline .annotation-word { text-decoration-line: underline; text-decoration-style: wavy; }
        .annotation-anchor.marker-outline .annotation-word {
          border: 1.5px solid currentColor;
          border-radius: 8px;
          padding: 0 3px;
          box-shadow: 0 0 14px color-mix(in srgb, currentColor 18%, transparent);
        }
        .annotation-anchor.marker-strike .annotation-word { text-decoration-line: line-through; text-decoration-thickness: 1px; }
        .annotation-anchor.marker-muted .annotation-word { opacity: 0.62; text-decoration-line: line-through; }
        .annotation-anchor.marker-note .annotation-word { border-bottom: 1px dotted currentColor; }
        .annotation-number {
          position: relative;
          --marker-color: var(--recommendation);
          top: -0.68em;
          display: inline-grid;
          width: 16px;
          height: 16px;
          place-items: center;
          margin-right: 1px;
          border-radius: 50%;
          background: var(--marker-color);
          color: white;
          font-size: 9px;
          font-weight: 900;
          line-height: 1;
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.35), 0 2px 7px rgba(47,128,237,0.22);
          vertical-align: baseline;
          scroll-margin-top: 90px;
        }
        .annotation-number:target,
        .annotation-number.is-active-anchor {
          outline: 2px solid rgba(255, 107, 53, 0.72);
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.35), 0 0 0 8px rgba(255,107,53,0.16), 0 0 24px rgba(255,107,53,0.38);
        }
        .note-popover {
          position: absolute;
          left: 50%;
          bottom: calc(100% + 11px);
          z-index: 20;
          display: none;
          width: min(300px, 72vw);
          transform: translateX(-50%);
          border: 1px solid rgba(32, 23, 19, 0.12);
          border-radius: 10px;
          background: white;
          color: var(--text);
          box-shadow: 0 14px 38px rgba(41, 27, 20, 0.18);
          padding: 10px 12px;
          font-size: 12px;
          font-weight: 500;
          line-height: 1.45;
          text-align: left;
        }
        .note-popover::after {
          content: "";
          position: absolute;
          left: 50%;
          bottom: -7px;
          width: 12px;
          height: 12px;
          transform: translateX(-50%) rotate(45deg);
          border-right: 1px solid rgba(32, 23, 19, 0.12);
          border-bottom: 1px solid rgba(32, 23, 19, 0.12);
          background: white;
        }
        .note-popover strong { display: block; margin-bottom: 4px; color: currentColor; }
        .annotation-number:hover .note-popover, .annotation-anchor:hover .note-popover { display: block; }
        .toggle-wrap { display: flex; justify-content: center; margin-top: 14px; }
        .toggle-text {
          border: 1px solid #efd9ca;
          border-radius: 999px;
          background: #fffaf6;
          box-shadow: 0 8px 18px rgba(77, 45, 26, 0.08);
          padding: 9px 15px;
          color: var(--text);
          font-weight: 800;
          cursor: pointer;
          transition: border-color 160ms ease, background 160ms ease, transform 160ms ease;
        }
        .toggle-text:hover { border-color: rgba(255,107,53,0.45); background: #fff4eb; transform: translateY(-1px); }
        .annotation-list { display: grid; gap: 8px; width: min(100%, 920px); margin: 0 auto; }
        details.annotation-list summary {
          margin-bottom: 10px;
          cursor: pointer;
          color: var(--text);
          font-size: 14px;
          font-weight: 900;
          text-align: center;
        }
        .annotation-list h3 {
          margin: 0 0 10px;
          color: var(--text);
          font-size: 14px;
          text-align: center;
        }
        .annotation-row {
          display: grid;
          grid-template-columns: 20px minmax(0, 1fr);
          gap: 10px;
          border-top: 1px solid rgba(229, 216, 203, 0.86);
          background: transparent;
          padding: 9px 4px;
        }
        .annotation-row:first-of-type { border-top: 0; }
        .annotation-row > a {
          display: grid;
          width: 19px;
          height: 19px;
          place-items: center;
          border-radius: 50%;
          background: var(--accent);
          color: white;
          font-size: 10px;
          font-weight: 900;
          text-decoration: none;
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.35), 0 4px 10px rgba(77,45,26,0.14);
        }
        .annotation-row.issue > a { background: var(--issue); }
        .annotation-row.recommendation > a { background: var(--recommendation); }
        .annotation-row.style > a { background: var(--style); }
        .annotation-row.note > a { background: #8d7667; }
        .annotation-row strong { font-size: 13px; }
        .annotation-row small { display: block; margin-top: 2px; color: var(--muted); font-size: 10px; text-transform: uppercase; letter-spacing: .04em; }
        .annotation-row p { margin-top: 3px; font-size: 12px; }
        .insight-grid {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 12px;
          width: min(100%, 1080px);
          margin: 0 auto;
        }
        .insight-card {
          border: 1px solid rgba(229, 216, 203, 0.86);
          border-radius: 10px;
          background: rgba(255, 255, 255, 0.82);
          padding: 16px;
        }
        .insight-card h3 { margin-bottom: 12px; font-size: 15px; }
        .profile-list { display: grid; gap: 9px; }
        .profile-row {
          display: grid;
          grid-template-columns: minmax(0, 1fr) 90px 28px;
          gap: 9px;
          align-items: center;
          color: var(--muted);
          font-size: 12px;
        }
        .profile-row i {
          height: 7px;
          overflow: hidden;
          border-radius: 999px;
          background: #eadfd6;
        }
        .profile-row b {
          display: block;
          width: var(--value);
          height: 100%;
          border-radius: inherit;
          background: var(--accent);
        }
        .profile-row strong { color: var(--text); font-size: 12px; text-align: right; }
        .fix-list, .gap-list { display: grid; gap: 8px; margin: 0; padding: 0; list-style: none; }
        .fix-list li { display: grid; grid-template-columns: 22px minmax(0, 1fr); gap: 9px; }
        .fix-list li > span, .gap-list li > span {
          display: grid;
          width: 22px;
          height: 22px;
          place-items: center;
          border-radius: 50%;
          background: var(--recommendation);
          color: white;
          font-size: 11px;
          font-weight: 900;
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.35), 0 4px 10px rgba(77,45,26,0.12);
        }
        .fix-list strong { font-size: 12px; }
        .fix-list p { margin-top: 3px; font-size: 11px; }
        .gap-list li {
          display: grid;
          grid-template-columns: 22px minmax(0, 1fr);
          gap: 9px;
          align-items: center;
          color: var(--muted);
          font-size: 12px;
          font-weight: 700;
        }
        .gap-list li.done > span { background: var(--good); }
        .gap-list li.partial > span { background: var(--style); }
        .gap-list li.missing > span { background: var(--issue); }
        .rank-groundwork p { font-size: 13px; }
        .forecast-head {
          display: flex;
          flex-wrap: wrap;
          align-items: flex-start;
          justify-content: space-between;
          gap: 18px;
          width: 100%;
          margin: 0 auto 14px;
        }
        .forecast-head h3 {
          margin: 1px 0 4px;
          font-size: 18px;
          font-weight: 700;
          line-height: 1.25;
        }
        .forecast-head p:not(.eyebrow) {
          max-width: 760px;
          font-size: 13px;
        }
        .forecast-grid {
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
          gap: 12px;
          width: 100%;
          margin: 0 auto;
        }
        .forecast-panel {
          border-color: rgba(255, 107, 53, 0.28);
          background: rgba(255, 237, 213, 0.42);
        }
        .forecast-card {
          border: 1px solid rgba(255, 107, 53, 0.22);
          border-radius: 8px;
          background: rgba(255, 247, 240, 0.72);
          padding: 14px;
        }
        .forecast-card h3 {
          margin-bottom: 10px;
          color: #8f7f73;
          font-size: 12px;
          font-weight: 800;
          letter-spacing: .04em;
          text-transform: uppercase;
        }
        .forecast-scores {
          display: grid;
          min-width: 260px;
          grid-template-columns: repeat(3, 1fr);
          gap: 8px;
        }
        .forecast-score {
          position: relative;
          border-radius: 8px;
          background: #ffffff;
          padding: 8px;
          text-align: center;
          box-shadow: 0 6px 14px rgba(77,45,26,.07);
          cursor: help;
        }
        .forecast-score strong { display: block; font-size: 20px; }
        .forecast-score span { color: var(--muted); font-size: 10px; font-weight: 900; text-transform: uppercase; }
        .forecast-score em {
          position: absolute;
          left: 50%;
          bottom: calc(100% + 10px);
          z-index: 20;
          display: none;
          width: min(270px, 70vw);
          transform: translateX(-50%);
          border: 1px solid rgba(32, 23, 19, 0.12);
          border-radius: 10px;
          background: #fff;
          color: var(--text);
          box-shadow: 0 14px 38px rgba(41, 27, 20, 0.18);
          padding: 10px 12px;
          font-size: 12px;
          font-style: normal;
          font-weight: 600;
          line-height: 1.45;
          text-align: left;
        }
        .forecast-score em::after {
          content: "";
          position: absolute;
          left: 50%;
          bottom: -7px;
          width: 12px;
          height: 12px;
          transform: translateX(-50%) rotate(45deg);
          border-right: 1px solid rgba(32, 23, 19, 0.12);
          border-bottom: 1px solid rgba(32, 23, 19, 0.12);
          background: white;
        }
        .forecast-score:hover em { display: block; }
        .forecast-card dl { display: grid; gap: 7px; margin: 0; }
        .forecast-card dt { color: var(--text); font-size: 11px; font-weight: 900; }
        .forecast-card dd { margin: -4px 0 2px; color: var(--muted); font-size: 12px; line-height: 1.4; }
        .forecast-card ul { display: grid; gap: 8px; margin: 0; padding-left: 18px; color: var(--muted); font-size: 12px; line-height: 1.45; }
        .strength-grid {
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
          gap: 12px;
          width: 100%;
          margin: 0 auto;
        }
        .strength-card {
          border: 1px solid rgba(229, 216, 203, 0.86);
          border-radius: 10px;
          background: rgba(255,255,255,0.82);
          padding: 16px;
        }
        .strength-card.good { border-color: rgba(15,159,110,.22); background: #ecfdf5; }
        .strength-card.warn { border-color: rgba(183,121,31,.24); background: #fffbeb; }
        .strength-card.bad { border-color: rgba(225,75,69,.28); background: #fff1f2; }
        .strength-card.warning-block { margin-top: 12px; }
        .strength-card h3 {
          margin-bottom: 10px;
          color: #8f7f73;
          font-size: 12px;
          font-weight: 800;
          letter-spacing: 0.06em;
          text-transform: uppercase;
        }
        .strength-card article { border-top: 1px solid rgba(229,216,203,.72); padding-top: 9px; margin-top: 9px; }
        .strength-card article:first-of-type { border-top: 0; padding-top: 0; }
        .strength-card article strong { font-size: 13px; }
        .strength-card article p, .strength-card > p { margin-top: 4px; font-size: 12px; }
        .warning-limitation {
          margin-top: 12px;
          border-top: 1px solid rgba(239, 68, 68, 0.14);
          padding-top: 10px;
          color: rgba(127, 29, 29, 0.68);
        }
        .warning-total { display: block; font-size: 54px; line-height: 1; color: var(--issue); }
        .footer-priority-panel {
          border: 1px solid rgba(215, 194, 175, 0.86);
          border-radius: 8px;
          background: #ffffff;
          padding: 16px;
        }
        .footer-section-title {
          margin: 0;
          text-align: center;
          color: var(--text);
          font-size: 14px;
          font-weight: 700;
          line-height: 1.35;
        }
        .footer-tool-title {
          margin-top: 4px;
        }
        .footer-fix-list {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 8px;
          margin: 12px 0 0;
          padding: 0;
          list-style: none;
        }
        .footer-fix-list li {
          border: 1px solid rgba(245,158,11,.32);
          border-radius: 6px;
          background: rgba(255, 251, 235, 0.45);
          padding: 8px 10px;
        }
        .footer-fix-list li.high { border-color: rgba(254, 202, 202, 0.9); background: rgba(254, 242, 242, 0.45); }
        .footer-fix-list li.medium { border-color: rgba(254, 243, 199, 0.95); background: rgba(255, 251, 235, 0.45); }
        .footer-fix-list li.low { border-color: rgba(209, 250, 229, 0.95); background: rgba(236, 253, 245, 0.45); }
        .footer-fix-list header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 10px;
        }
        .footer-fix-list small {
          display: block;
          border-radius: 999px;
          background: rgba(255,255,255,.75);
          padding: 2px 7px;
          color: var(--muted);
          font-size: 10px;
          font-weight: 900;
          letter-spacing: .04em;
          text-transform: uppercase;
          white-space: nowrap;
        }
        .footer-fix-list strong { font-size: 14px; }
        .footer-fix-list p { margin-top: 4px; font-size: 12px; }
        .tool-data-list {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 12px;
        }
        .tool-data-row {
          border: 1px solid rgba(215,194,175,.62);
          border-radius: 8px;
          background: #fff;
          padding: 16px;
        }
        .tool-data-row.high,
        .tool-data-row.medium,
        .tool-data-row.low {
          border-color: rgba(215,194,175,.62);
        }
        .tool-data-row header {
          display: flex;
          gap: 10px;
          align-items: center;
          justify-content: space-between;
        }
        .tool-data-heading {
          display: flex;
          min-width: 0;
          align-items: center;
          gap: 9px;
        }
        .tool-data-icon {
          display: grid;
          width: 32px;
          height: 32px;
          flex: 0 0 auto;
          place-items: center;
          border-radius: 7px;
          background: rgba(255, 237, 213, 0.85);
          color: var(--accent);
          font-size: 15px;
          font-weight: 900;
        }
        .tool-data-row strong { font-size: 14px; }
        .tool-data-row small {
          display: block;
          margin-top: 3px;
          color: var(--muted);
          font-size: 12px;
          letter-spacing: 0;
        }
        .tool-status {
          border-radius: 999px;
          background: rgba(209, 250, 229, 0.9);
          padding: 5px 9px;
          color: #047857;
          font-size: 10px;
          font-weight: 800;
          white-space: nowrap;
        }
        .tool-key-data { margin-top: 14px; }
        .tool-key-label,
        .tool-block-title {
          margin: 0;
          color: #b85d24;
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 0.06em;
          text-transform: uppercase;
        }
        .tool-key-label { color: var(--muted); }
        .tool-chip-list {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          margin-top: 7px;
        }
        .tool-chip {
          border: 1px solid rgba(255, 107, 53, 0.22);
          border-radius: 999px;
          background: #fff4e8;
          padding: 5px 8px;
          color: var(--muted);
          font-size: 10px;
          line-height: 1;
        }
        .tool-note-block {
          margin-top: 12px;
          border: 1px solid rgba(255, 107, 53, 0.22);
          border-radius: 7px;
          background: #fff4e8;
          padding: 10px 11px;
        }
        .tool-note-action { background: #fff1df; }
        .tool-note-block p:last-child {
          margin: 4px 0 0;
          font-size: 12px;
        }
        @keyframes grow { from { width: 0; } to { width: var(--value); } }
        @media (max-width: 1100px) {
          .top-grid { grid-template-columns: 1fr; }
          .metrics, .dimensions, .insight-grid, .forecast-grid, .strength-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        }
        @media (max-width: 700px) {
          body { padding: 14px; }
          .metrics, .dimensions, .insight-grid, .forecast-grid, .strength-grid, .footer-fix-list, .tool-data-list { grid-template-columns: 1fr; }
          .article-scroll { padding: 14px 44px 22px 62px; }
          .article-margin-dots { left: -44px; }
          .article-page { padding: 24px 20px; }
        }
        ${viewportSizeOverlayStyle()}
      </style>
    </head>
    <body>
      <main class="dashboard">
        <section class="panel report-summary-panel">
          <div class="report-summary-header">
            <div>
              <p class="eyebrow">ToraSEO</p>
              <h1>${escapeHtml(summaryLabels.title)}</h1>
              <p>${escapeHtml(summaryLabels.body)}</p>
            </div>
            <div class="report-actions">
              <span>${article.coverage.completed} / ${article.coverage.total} ${escapeHtml(summaryLabels.toolCount)}</span>
              <button id="export-report" type="button">${escapeHtml(summaryLabels.export)}</button>
            </div>
          </div>
          <div class="top-grid">
            <div class="hero hero-${article.verdict}">
              <p class="eyebrow">${escapeHtml(labels.readiness)}</p>
              <h2>${escapeHtml(articleVerdictLabelForDisplay(article, isRu))}</h2>
              <p>${escapeHtml(articleVerdictDetailForDisplay(article, isRu))}</p>
              <span class="status-chip">${escapeHtml(article.annotationStatus)}</span>
              ${warningStatusChip}
            </div>
            <aside class="coverage">
              <p class="eyebrow">${escapeHtml(labels.coverage)}</p>
              <div class="coverage-value"><strong data-count="${article.coverage.percent}">0</strong><span>%</span></div>
              <div class="meter"><i style="--value:${article.coverage.percent}%"></i></div>
              <p>${article.coverage.completed} / ${article.coverage.total} ${escapeHtml(labels.tools)}</p>
              ${
                formatReportDuration(report.durationMs)
                  ? `<p class="analysis-version" style="margin-top:10px">Report formed in: ${escapeHtml(formatReportDuration(report.durationMs) ?? "")}</p>`
                  : ""
              }
            </aside>
            <aside class="platform-card">
              <p class="eyebrow">${escapeHtml(labels.platform)}</p>
              <h2>${escapeHtml(article.platform.label)}</h2>
              <p>${escapeHtml(article.platform.detail)}</p>
            </aside>
          </div>
          <div class="summary-metrics">
            <div class="metrics">${metrics}</div>
          </div>
        </section>

        <section class="panel">
          <p class="eyebrow article-panel-heading">${escapeHtml(labels.articleView)}</p>
          <div class="article-shell">
            <div>${renderAnnotatedArticle(report, labels, isRu)}</div>
            <aside>${renderAnnotationList(report, labels, isRu)}</aside>
          </div>
        </section>

        ${renderStrengthWeaknessPanel(report, isRu)}
        ${renderIntentSeoPackage(report, isRu)}
        <section class="panel dimensions-panel">
          <p class="eyebrow">${escapeHtml(labels.dimensions)}</p>
          <div class="dimensions">${dimensions}</div>
        </section>
        ${renderArticleInsights(report, isRu)}
        ${renderArticleFooterReport(report, isRu)}
        <section class="panel">
          <p class="analysis-version">${analysisVersionLine(isRu, report.analysisVersion)}</p>
        </section>
      </main>
      <script>
        (() => {
          document.querySelectorAll("[data-count]").forEach((el) => {
            const target = Number(el.getAttribute("data-count") || "0");
            const start = performance.now();
            const tick = (now) => {
              const progress = Math.min(1, (now - start) / 900);
              el.textContent = String(Math.round(target * progress));
              if (progress < 1) requestAnimationFrame(tick);
            };
            requestAnimationFrame(tick);
          });
          const scroller = document.getElementById("article-scroll");
          const toggle = document.getElementById("toggle-text");
          if (scroller && toggle) {
            const expandLabel = ${JSON.stringify(labels.expand)};
            const collapseLabel = ${JSON.stringify(labels.collapse)};
            toggle.addEventListener("click", () => {
              const expanded = scroller.classList.toggle("expanded");
              toggle.textContent = expanded ? collapseLabel : expandLabel;
              requestAnimationFrame(syncMarginDots);
            });
          }
          const syncMarginDots = () => {
            const page = document.querySelector(".article-page");
            const holder = document.getElementById("article-margin-dots");
            if (!page || !holder) return;
            holder.innerHTML = "";
            const pageRect = page.getBoundingClientRect();
            document.querySelectorAll(".annotation-number").forEach((marker) => {
              const rect = marker.getBoundingClientRect();
              const dot = document.createElement("span");
              dot.className = "side-dot " + Array.from(marker.classList)
                .filter((name) => ["issue", "recommendation", "style", "note"].includes(name))
                .join(" ");
              dot.style.top = String(rect.top - pageRect.top + rect.height / 2 - 4.5) + "px";
              holder.appendChild(dot);
            });
          };
          syncMarginDots();
          window.addEventListener("resize", syncMarginDots);
          scroller?.addEventListener("scroll", syncMarginDots, { passive: true });
          document.querySelectorAll(".annotation-row > a").forEach((link) => {
            link.addEventListener("click", (event) => {
              const href = link.getAttribute("href") || "";
              if (!href.startsWith("#")) return;
              const target = document.getElementById(href.slice(1));
              if (!target) return;
              event.preventDefault();
              target.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
              history.replaceState(null, "", href);
              target.classList.add("is-active-anchor");
              window.setTimeout(() => target.classList.remove("is-active-anchor"), 1200);
              window.setTimeout(syncMarginDots, 260);
            });
          });
          const exportButton = document.getElementById("export-report");
          if (exportButton) {
            exportButton.addEventListener("click", () => {
              window.location.href = "toraseo://export-report-pdf";
            });
          }
        })();
      </script>
      ${viewportSizeOverlayMarkup()}
    </body>
  </html>`;
}

function viewportSizeOverlayStyle(): string {
  return `
        #toraseo-viewport-size {
          position: fixed;
          top: 15px;
          right: 20px;
          z-index: 9999;
          pointer-events: none;
          color: rgba(26, 15, 8, 0.55);
          font: 700 12px ui-monospace, SFMono-Regular, Consolas, monospace;
          opacity: 0;
          transform: translateY(-4px);
          transition: opacity 140ms ease, transform 140ms ease;
          white-space: nowrap;
        }
        #toraseo-viewport-size.visible {
          opacity: 1;
          transform: translateY(0);
        }`;
}

function viewportSizeOverlayMarkup(): string {
  return `
      <div id="toraseo-viewport-size" aria-hidden="true"></div>
      <script>
        (() => {
          const el = document.getElementById("toraseo-viewport-size");
          if (!el) return;
          let timer = null;
          const show = () => {
            el.textContent = window.innerWidth + "px x " + window.innerHeight + "px";
            el.classList.add("visible");
            if (timer) window.clearTimeout(timer);
            timer = window.setTimeout(() => {
              el.classList.remove("visible");
              timer = null;
            }, 1600);
          };
          window.addEventListener("resize", show);
        })();
      </script>`;
}

type SiteDisplayStatus = "critical" | "warning" | "info" | "passed";

interface SiteDisplayFact {
  title: string;
  detail: string;
  action: string;
  status: SiteDisplayStatus;
  priority: "high" | "medium" | "low";
  sourceToolIds: string[];
}

function siteToolLabel(toolId: string, isRu: boolean): string {
  const ru: Record<string, string> = {
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
  const en: Record<string, string> = {
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
  return (isRu ? ru : en)[toolId] ?? toolId;
}

function siteReadableTitle(title: string, isRu: boolean): string {
  if (!isRu) return title;
  const normalized = title.toLowerCase();
  if (normalized.includes("no sitemap")) return "Sitemap не найден";
  if (normalized.includes("thin content")) return "Мало основного текста";
  if (normalized.includes("no meta description")) return "Meta description отсутствует";
  if (normalized.includes("no canonical")) return "Canonical отсутствует";
  if (normalized.includes("og missing")) return "Open Graph отсутствует";
  if (normalized.includes("twitter card missing")) return "Twitter Card отсутствует";
  if (normalized.includes("title too short")) return "Title слишком короткий";
  if (normalized.includes("heading level skip")) return "Пропуск уровня заголовка";
  if (normalized.includes("no redirects")) return "Редиректов нет";
  if (normalized.includes("indexability clear")) return "Индексация разрешена";
  if (normalized.includes("robots") && normalized.includes("completed")) {
    return "Robots.txt разрешает обход";
  }
  if (normalized.includes("minimal scan completed")) return "Базовый скан выполнен";
  if (normalized.includes("links checked")) return "Ссылки проверены";
  if (normalized.includes("stack detected")) return "Стек сайта определен";
  return title
    .replace(/^Meta tags:/i, "Meta-теги:")
    .replace(/^Headings:/i, "Заголовки:")
    .replace(/^Content:/i, "Контент:")
    .replace(/^Redirects:/i, "Редиректы:")
    .replace(/^Indexability:/i, "Индексация:");
}

function siteReadableDetail(detail: string, isRu: boolean): string {
  if (!isRu) return detail;
  const normalized = detail.toLowerCase();
  if (normalized.includes("no sitemap found")) {
    return "Sitemap не найден. Поисковикам может быть сложнее находить страницы сайта. Создайте sitemap.xml и укажите его в robots.txt.";
  }
  if (normalized.includes("page contains only") && normalized.includes("words")) {
    return "На странице мало основного текста. Проверьте, что важный контент доступен в HTML, и добавьте содержательное описание темы.";
  }
  if (normalized.includes("meta name=\"description\"")) {
    return "На странице нет meta description. Поисковая система может сформировать сниппет автоматически, поэтому добавьте описание на 120-160 символов.";
  }
  if (normalized.includes("canonical")) {
    return "Canonical не указан. Если у страницы есть дубли или URL-варианты, добавьте канонический адрес.";
  }
  if (normalized.includes("no open graph")) {
    return "Open Graph не настроен. При публикации ссылки в соцсетях превью может выглядеть случайным.";
  }
  if (normalized.includes("twitter:card")) {
    return "Twitter Card не настроен. В X/Twitter ссылка может отображаться как обычный текст без нормального превью.";
  }
  if (normalized.includes("title is") && normalized.includes("characters")) {
    return "Title короткий. Уточните его так, чтобы он лучше называл страницу и содержал важный поисковый смысл.";
  }
  if (normalized.includes("heading-level skip")) {
    return "В структуре заголовков есть пропуск уровня. Это не всегда SEO-блокер, но лучше сделать иерархию чище.";
  }
  if (normalized.includes("no robots.txt block") || normalized.includes("locally indexable")) {
    return "Блокировок индексации через robots.txt или meta robots не найдено.";
  }
  if (normalized.includes("crawling is allowed")) {
    return "Robots.txt разрешает обход этой страницы.";
  }
  if (normalized.includes("detected likely stack signals")) {
    return detail.replace(/^Detected likely stack signals:/i, "Найдены вероятные технологии:");
  }
  return detail;
}

function siteFactKey(title: string, detail: string): string {
  const text = `${title} ${detail}`.toLowerCase();
  if (text.includes("canonical")) return "canonical";
  if (text.includes("meta description")) return "meta_description";
  if (text.includes("no sitemap") || text.includes("sitemap not found")) return "sitemap";
  if (text.includes("thin content")) return "thin_content";
  if (text.includes("open graph") || text.includes("og missing")) return "open_graph";
  if (text.includes("twitter")) return "twitter_card";
  if (text.includes("title too short")) return "title_too_short";
  if (text.includes("heading level skip")) return "heading_level_skip";
  if (text.includes("no redirects")) return "redirects_ok";
  if (text.includes("indexability clear")) return "indexability_ok";
  if (text.includes("robots") && text.includes("completed")) return "robots_ok";
  if (text.includes("minimal scan completed")) return "basic_scan_ok";
  if (text.includes("links checked")) return "links_checked";
  if (text.includes("stack detected")) return "stack_detected";
  return title.toLowerCase().replace(/[^a-z0-9а-яё]+/giu, "_");
}

function siteReadableAction(title: string, detail: string, isRu: boolean): string {
  const text = `${title} ${detail}`.toLowerCase();
  const key = siteFactKey(title, detail);
  if (!isRu) {
    if (key === "sitemap") return "Create sitemap.xml, add it to robots.txt, and rerun the scan.";
    if (key === "thin_content") return "Make sure the main content is present in HTML or add a fuller page body.";
    if (key === "meta_description") return "Add a clear meta description of about 120-160 characters.";
    if (key === "canonical") return "Add a canonical URL if the page can have duplicate URL variants.";
    if (key === "open_graph") return "Add Open Graph title, description, URL, and preview image.";
    if (key === "twitter_card") return "Add twitter:card or reuse the Open Graph preview for X/Twitter.";
    if (key === "title_too_short") return "Expand the title so it names the page and includes the main search meaning.";
    if (key === "heading_level_skip") return "Clean up the heading hierarchy without changing the article meaning.";
    if (key === "redirects_ok" || key === "indexability_ok" || key === "robots_ok" || key === "links_checked") {
      return "No urgent action is needed for this check.";
    }
    if (key === "stack_detected") return "Use these signals as technical context, not as an SEO issue.";
    if (text.includes("invalid url")) return "Check the entered URL and rerun the scan.";
    return "Review this check and rerun the scan after changes.";
  }
  if (key === "sitemap") return "Создайте sitemap.xml, укажите его в robots.txt и запустите повторный скан.";
  if (key === "thin_content") return "Проверьте, что основной контент есть в HTML, или добавьте более содержательный текст страницы.";
  if (key === "meta_description") return "Добавьте понятный meta description примерно на 120-160 символов.";
  if (key === "canonical") return "Добавьте canonical, если у страницы могут быть дубли или разные URL-варианты.";
  if (key === "open_graph") return "Добавьте Open Graph: заголовок, описание, URL и изображение превью.";
  if (key === "twitter_card") return "Добавьте twitter:card или настройте наследование превью из Open Graph.";
  if (key === "title_too_short") return "Расширьте title: он должен яснее называть страницу и основной поисковый смысл.";
  if (key === "heading_level_skip") return "Приведите иерархию заголовков в более чистый порядок.";
  if (key === "redirects_ok" || key === "indexability_ok" || key === "robots_ok" || key === "links_checked") {
    return "Срочных действий по этой проверке не требуется.";
  }
  if (key === "stack_detected") return "Используйте эти сигналы как справку, но не как SEO-проблему.";
  if (text.includes("invalid url")) return "Проверьте введенный URL и запустите скан повторно.";
  return "Проверьте этот пункт и запустите повторный скан после правок.";
}

function siteFactStatus(priority: "high" | "medium" | "low", title: string, detail: string): SiteDisplayStatus {
  const text = `${title} ${detail}`.toLowerCase();
  const key = siteFactKey(title, detail);
  if (key === "meta_description" || key === "title_too_short") return "warning";
  if (key === "canonical" || key === "heading_level_skip" || key === "links_checked") {
    return "info";
  }
  if (key === "thin_content" || key === "sitemap") return "critical";
  const passed =
    text.includes("completed") ||
    text.includes("clear") ||
    text.includes("no redirects") ||
    text.includes("links checked") ||
    text.includes("crawling is allowed");
  if (passed && priority === "low") return "passed";
  if (priority === "high") return "critical";
  if (priority === "medium") return "warning";
  return "info";
}

function aggregateSiteFacts(report: RuntimeAuditReport, isRu: boolean): SiteDisplayFact[] {
  const byKey = new Map<string, SiteDisplayFact>();
  for (const fact of report.confirmedFacts) {
    const key = siteFactKey(fact.title, fact.detail);
    const item: SiteDisplayFact = {
      title: siteReadableTitle(fact.title, isRu),
      detail: siteReadableDetail(fact.detail, isRu),
      action: siteReadableAction(fact.title, fact.detail, isRu),
      status: siteFactStatus(fact.priority, fact.title, fact.detail),
      priority: fact.priority,
      sourceToolIds: fact.sourceToolIds,
    };
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, item);
      continue;
    }
    existing.sourceToolIds = Array.from(
      new Set([...existing.sourceToolIds, ...item.sourceToolIds]),
    );
    if (item.priority === "high" || existing.priority === "low") {
      existing.priority = item.priority;
      existing.status = item.status;
    }
  }
  return [...byKey.values()].sort(
    (a, b) => siteStatusWeight(a.status) - siteStatusWeight(b.status),
  );
}

function siteStatusWeight(status: SiteDisplayStatus): number {
  if (status === "critical") return 0;
  if (status === "warning") return 1;
  if (status === "info") return 2;
  return 3;
}

interface SitePreviewData {
  url: string;
  title: string;
  h1: string;
  status: string;
  wordCount: string;
  stack: string[];
  robots: SiteDisplayStatus;
  sitemap: SiteDisplayStatus;
  meta: SiteDisplayStatus;
  canonical: SiteDisplayStatus;
  content: SiteDisplayStatus;
  openGraph: SiteDisplayStatus;
}

function firstMatch(text: string, pattern: RegExp): string | null {
  return text.match(pattern)?.[1]?.trim() ?? null;
}

function buildSitePreviewData(
  report: RuntimeAuditReport,
  facts: SiteDisplayFact[],
  isRu: boolean,
): SitePreviewData {
  const raw = report.confirmedFacts.map((fact) => `${fact.title}; ${fact.detail}`).join("\n");
  const stackText =
    firstMatch(raw, /signals:\s*([^.\n]+)/i) ??
    firstMatch(raw, /Detected likely stack signals:\s*([^.\n]+)/i) ??
    "";
  const status = firstMatch(raw, /HTTP\s+(\d{3})/i) ?? "200";
  const wordCount =
    firstMatch(raw, /only\s+(\d+)\s+words/i) ??
    firstMatch(raw, /(\d+)\s+words/i) ??
    "—";
  const title =
    firstMatch(raw, /title:\s*([^;\n]+)/i) ??
    (isRu ? "Title не определен" : "Title not detected");
  const h1 =
    firstMatch(raw, /H1:\s*([^;\n]+)/i) ??
    (isRu ? "H1 не определен" : "H1 not detected");
  const url =
    firstMatch(raw, /final URL:\s*([^;\n]+)/i) ??
    firstMatch(report.summary, /(https?:\/\/[^\s]+)/i) ??
    (isRu ? "URL сайта" : "Site URL");
  const statusFor = (...toolIds: string[]): SiteDisplayStatus => {
    const matching = facts.filter((fact) =>
      fact.sourceToolIds.some((toolId) => toolIds.includes(toolId)),
    );
    if (matching.some((fact) => fact.status === "critical")) return "critical";
    if (matching.some((fact) => fact.status === "warning")) return "warning";
    if (matching.some((fact) => fact.status === "info")) return "info";
    return "passed";
  };
  return {
    url,
    title,
    h1,
    status,
    wordCount,
    stack: stackText
      .split(/,\s*/g)
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 8),
    robots: statusFor("check_robots_txt"),
    sitemap: statusFor("analyze_sitemap"),
    meta: statusFor("analyze_meta"),
    canonical: statusFor("analyze_canonical"),
    content: statusFor("analyze_content"),
    openGraph: facts.some((fact) => siteFactKey(fact.title, fact.detail) === "open_graph")
      ? "warning"
      : "passed",
  };
}

function siteStatusText(status: SiteDisplayStatus, isRu: boolean): string {
  if (status === "critical") return isRu ? "Проблема" : "Issue";
  if (status === "warning") return isRu ? "Проверить" : "Review";
  if (status === "info") return isRu ? "Инфо" : "Info";
  return isRu ? "OK" : "OK";
}

function renderSitePreviewBlock(preview: SitePreviewData, isRu: boolean): string {
  const stackItems = preview.stack.length
    ? preview.stack.map((item) => `<span class="tech-chip">${escapeHtml(item)}</span>`).join("")
    : `<span class="tech-chip">${isRu ? "Стек не определен" : "Stack not detected"}</span>`;
  const signal = (label: string, status: SiteDisplayStatus) => `
    <div class="tech-row">
      <span>${escapeHtml(label)}</span>
      <strong class="status-${status}">${escapeHtml(siteStatusText(status, isRu))}</strong>
    </div>`;
  return `
    <section class="site-preview-card">
      <div class="browser-preview">
        <div class="browser-top">
          <span class="dot red"></span><span class="dot yellow"></span><span class="dot green"></span>
          <div class="address">${escapeHtml(preview.url)}</div>
        </div>
        <div class="browser-body">
          <p class="preview-label">${isRu ? "Как страницу видит базовый SEO-скан" : "How the base SEO scan sees the page"}</p>
          <h2>${escapeHtml(preview.h1)}</h2>
          <p class="preview-title">${escapeHtml(preview.title)}</p>
          <div class="serp-card">
            <strong>${escapeHtml(preview.title)}</strong>
            <span>${escapeHtml(preview.url)}</span>
            <p>${isRu ? "Description не найден: поисковик может собрать сниппет автоматически из текста страницы." : "Description is missing: the search engine may build a snippet automatically from page text."}</p>
          </div>
          <div class="preview-lines">
            <span style="width: 88%"></span>
            <span style="width: 72%"></span>
            <span style="width: 54%"></span>
          </div>
        </div>
      </div>
      <aside class="tech-panel">
        <div>
          <p class="meta">${isRu ? "Технологии и SEO-сигналы" : "Technology and SEO signals"}</p>
          <h2>${isRu ? "Профиль сайта" : "Site profile"}</h2>
        </div>
        <div class="tech-grid">
          <div><span>HTTP</span><strong>${escapeHtml(preview.status)}</strong></div>
          <div><span>${isRu ? "Текст" : "Text"}</span><strong>${escapeHtml(preview.wordCount)}</strong></div>
        </div>
        <div class="tech-chips">${stackItems}</div>
        <div class="tech-rows">
          ${signal("Robots.txt", preview.robots)}
          ${signal("Sitemap", preview.sitemap)}
          ${signal("Meta", preview.meta)}
          ${signal("Canonical", preview.canonical)}
          ${signal("Open Graph", preview.openGraph)}
          ${signal(isRu ? "Контент" : "Content", preview.content)}
        </div>
      </aside>
    </section>`;
}

function renderAuditDirections(facts: SiteDisplayFact[], isRu: boolean): string {
  const groups = [
    { label: isRu ? "Индексация" : "Indexability", tools: ["scan_site_minimal", "analyze_indexability"] },
    { label: isRu ? "Метаданные и canonical" : "Metadata and canonical", tools: ["analyze_meta", "analyze_canonical"] },
    { label: isRu ? "Структура и ссылки" : "Structure and links", tools: ["analyze_headings", "analyze_links"] },
    { label: isRu ? "Готовность контента" : "Content readiness", tools: ["analyze_content"] },
    { label: isRu ? "Sitemap и редиректы" : "Sitemap and redirects", tools: ["analyze_sitemap", "check_redirects"] },
    { label: isRu ? "Технические сигналы" : "Technical signals", tools: ["check_robots_txt", "detect_stack"] },
  ];
  return groups
    .map((group) => {
      const matching = facts.filter((fact) =>
        fact.sourceToolIds.some((toolId) => group.tools.includes(toolId)),
      );
      const seenTools = new Set(
        matching.flatMap((fact) =>
          fact.sourceToolIds.filter((toolId) => group.tools.includes(toolId)),
        ),
      );
      const problems = matching.filter(
        (fact) => fact.status === "critical" || fact.status === "warning",
      ).length;
      const status =
        matching.some((fact) => fact.status === "critical")
          ? "critical"
          : matching.some((fact) => fact.status === "warning")
            ? "warning"
            : "passed";
      const width = Math.max(12, Math.round((seenTools.size / group.tools.length) * 100));
      return `
        <article class="direction-card">
          <div class="direction-head">
            <strong>${escapeHtml(group.label)}</strong>
            <span class="status-${status}">${problems > 0 ? `${problems} ${isRu ? "проблем" : "issues"}` : `${seenTools.size}/${group.tools.length}`}</span>
          </div>
          <p>${seenTools.size}/${group.tools.length} ${isRu ? "проверок выполнено" : "checks completed"}</p>
          <div class="direction-bar"><span class="seg-${status === "passed" ? "passed" : status}" style="width:${width}%"></span></div>
        </article>`;
    })
    .join("");
}

function renderStructuredProviderReportHtml(report: RuntimeAuditReport): string {
  const sourceToolIds = new Set(
    report.confirmedFacts.flatMap((fact) => fact.sourceToolIds),
  );
  const critical = report.confirmedFacts.filter((fact) => fact.priority === "high").length;
  const warning = report.confirmedFacts.filter((fact) => fact.priority === "medium").length;
  const passed = report.confirmedFacts.filter((fact) => fact.priority === "low").length;
  const info = 0;
  const duration = formatReportDuration(report.durationMs);
  const factCards = report.confirmedFacts
    .map((fact) => {
      const statusLabel =
        fact.priority === "high"
          ? "Critical"
          : fact.priority === "medium"
            ? "Warning"
            : "Done";
      return `
        <article class="fact-card status-${fact.priority === "high" ? "critical" : fact.priority === "medium" ? "warning" : "passed"}">
          <div class="fact-head">
            <div>
              <p class="eyebrow">${escapeHtml(fact.sourceToolIds.join(", ") || "AI check")}</p>
              <h3>${escapeHtml(fact.title)}</h3>
            </div>
            <span>${escapeHtml(statusLabel)}</span>
          </div>
          <p>${escapeHtml(fact.detail)}</p>
          <div class="action">
            <strong>Action</strong>
            <p>${escapeHtml(report.nextStep)}</p>
          </div>
        </article>`;
    })
    .join("");
  const hypothesisCards = report.expertHypotheses
    .map(
      (item) => `
        <article class="fact-card">
          <div class="fact-head">
            <div>
              <p class="eyebrow">Expert hypothesis</p>
              <h3>${escapeHtml(item.title)}</h3>
            </div>
            <span>Hypothesis</span>
          </div>
          <p>${escapeHtml(item.detail)}</p>
          <p class="muted">${escapeHtml(item.expectedImpact)}</p>
          <p class="muted">${escapeHtml(item.validationMethod)}</p>
        </article>`,
    )
    .join("");

  return `<!doctype html>
  <html lang="${report.locale === "ru" ? "ru" : "en"}">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>ToraSEO AI Structured Report</title>
      <style>
        :root {
          color-scheme: light;
          --bg: #fff7ed;
          --surface: #ffffff;
          --border: #ffedd5;
          --text: #2b1b12;
          --muted: rgba(43, 27, 18, 0.58);
          --accent: #ff6b35;
          --accent-soft: #fff0e8;
          --green: #059669;
          --red: #ef4444;
          --orange: #f97316;
          --blue: #2563eb;
        }
        * { box-sizing: border-box; }
        body {
          margin: 0;
          padding: 24px;
          font-family: Inter, "Segoe UI", system-ui, sans-serif;
          color: var(--text);
          background: var(--bg);
        }
        .shell {
          max-width: 1120px;
          margin: 0 auto;
          display: grid;
          gap: 16px;
        }
        .panel, .hero, .metric, .fact-card {
          border: 1px solid var(--border);
          border-radius: 8px;
          background: var(--surface);
          box-shadow: 0 1px 2px rgba(43, 27, 18, 0.06);
        }
        .hero { padding: 20px; }
        .hero-head {
          display: flex;
          justify-content: space-between;
          gap: 16px;
          align-items: flex-start;
        }
        h1, h2, h3, p { margin: 0; }
        h1 { font-size: 24px; line-height: 1.18; }
        h2 { font-size: 16px; }
        h3 { font-size: 15px; line-height: 1.3; }
        p { color: var(--muted); line-height: 1.6; }
        .eyebrow {
          color: var(--accent);
          font-size: 11px;
          font-weight: 800;
          letter-spacing: .08em;
          text-transform: uppercase;
        }
        .summary { margin-top: 10px; max-width: 880px; }
        .metrics {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 12px;
        }
        .metric { padding: 16px; }
        .metric strong {
          display: block;
          margin-top: 8px;
          font-size: 24px;
          line-height: 1;
        }
        .pill {
          border: 1px solid rgba(255, 107, 53, 0.24);
          border-radius: 999px;
          background: var(--accent-soft);
          padding: 7px 10px;
          color: var(--text);
          font-size: 12px;
          font-weight: 700;
          white-space: nowrap;
        }
        .fact-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 12px;
        }
        .fact-card { padding: 16px; }
        .fact-head {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          align-items: flex-start;
        }
        .fact-head span {
          border-radius: 999px;
          background: #d1fae5;
          color: #047857;
          padding: 5px 9px;
          font-size: 12px;
          font-weight: 800;
        }
        .status-critical .fact-head span { background: #fee2e2; color: #b91c1c; }
        .status-warning .fact-head span { background: #ffedd5; color: #c2410c; }
        .status-info .fact-head span { background: #dbeafe; color: #1d4ed8; }
        .fact-card > p { margin-top: 12px; }
        .action {
          margin-top: 12px;
          border: 1px solid rgba(255, 107, 53, 0.22);
          border-radius: 7px;
          background: #fff4e8;
          padding: 10px;
        }
        .action strong {
          display: block;
          color: var(--accent);
          font-size: 11px;
          letter-spacing: .08em;
          text-transform: uppercase;
        }
        .action p { margin-top: 4px; color: var(--text); }
        .panel { padding: 16px; }
        .muted { margin-top: 8px; font-size: 13px; }
        .version { color: var(--muted); font-size: 12px; font-weight: 700; }
        @media (max-width: 800px) {
          body { padding: 14px; }
          .hero-head { display: grid; }
          .metrics, .fact-grid { grid-template-columns: 1fr; }
        }
        ${viewportSizeOverlayStyle()}
      </style>
    </head>
    <body>
      <main class="shell">
        <section class="hero">
          <div class="hero-head">
            <div>
              <p class="eyebrow">ToraSEO AI report</p>
              <h1>Structured analysis report</h1>
              <p class="summary">${escapeHtml(report.summary)}</p>
            </div>
            <div class="pill">${sourceToolIds.size} / ${sourceToolIds.size} tools</div>
          </div>
        </section>
        <section class="metrics">
          <article class="metric">
            <p class="eyebrow">Critical</p>
            <strong>${critical}</strong>
          </article>
          <article class="metric">
            <p class="eyebrow">Warnings</p>
            <strong>${warning}</strong>
          </article>
          <article class="metric">
            <p class="eyebrow">Info</p>
            <strong>${info}</strong>
          </article>
          <article class="metric">
            <p class="eyebrow">Done</p>
            <strong>${passed}</strong>
          </article>
        </section>
        <section class="panel">
          <h2>Tool evidence</h2>
          <div class="fact-grid" style="margin-top:12px">${factCards || "<p>No structured facts were returned.</p>"}</div>
        </section>
        ${hypothesisCards ? `<section class="panel"><h2>Expert hypotheses</h2><div class="fact-grid" style="margin-top:12px">${hypothesisCards}</div></section>` : ""}
        <section class="panel">
          <h2>Next step</h2>
          <p style="margin-top:8px">${escapeHtml(report.nextStep)}</p>
        </section>
        <section class="panel">
          <p class="version">${analysisVersionLine(false, report.analysisVersion)}</p>
          ${duration ? `<p class="version">Report formed in: ${escapeHtml(duration)}</p>` : ""}
        </section>
      </main>
      ${viewportSizeOverlayScript(0)}
    </body>
  </html>`;
}

function renderReportHtml(report: RuntimeAuditReport): string {
  if (report.siteCompare) {
    return renderSiteCompareReportDashboardHtml(report);
  }

  if (report.articleCompare) {
    return renderArticleCompareReportDashboardHtml(report);
  }

  if (report.articleText) {
    return renderArticleTextReportDashboardHtml(report);
  }

  if (report.analysisType === "article_text" || report.analysisType === "page_by_url") {
    return renderStructuredProviderReportHtml(report);
  }

  const isRu =
    report.locale === "ru" ||
    (report.locale !== "en" &&
      /[А-Яа-яЁё]/.test(`${report.summary} ${report.nextStep}`));
  const facts = aggregateSiteFacts(report, isRu);
  const preview = buildSitePreviewData(report, facts, isRu);
  const critical = facts.filter((fact) => fact.status === "critical").length;
  const warning = facts.filter((fact) => fact.status === "warning").length;
  const info = facts.filter((fact) => fact.status === "info").length;
  const passed = facts.filter((fact) => fact.status === "passed").length;
  const sourceTotal = new Set(report.confirmedFacts.flatMap((fact) => fact.sourceToolIds)).size;
  const blockedToolIds = new Set(
    facts
      .filter((fact) => fact.status === "critical" || fact.status === "warning")
      .flatMap((fact) => fact.sourceToolIds),
  );
  const cleanTools = Math.max(0, sourceTotal - blockedToolIds.size);
  const readiness = Math.max(0, Math.min(100, 100 - critical * 14 - warning * 7));
  const mascotMarkup = siteReportMascotMarkup(critical, warning, isRu);
  const fixes = facts
    .filter((fact) => fact.status === "critical" || fact.status === "warning")
    .slice(0, 5);
  const nextStep =
    fixes.length > 0
      ? isRu
        ? `Исправьте сначала: ${fixes.slice(0, 3).map((fact) => fact.title).join(", ")}. После правок запустите повторный скан.`
        : `Fix first: ${fixes.slice(0, 3).map((fact) => fact.title).join(", ")}. Run the scan again after edits.`
      : isRu
        ? "Критичных проблем не найдено. Проверьте информационные замечания и запустите повторный скан после правок."
        : "No critical issues found. Review informational notes and run the scan again after edits.";
  const detailCards = facts
    .filter((fact) => fact.status !== "passed")
    .map((fact) => renderSiteFactHtml(fact, isRu))
    .join("");
  const passedCards = facts
    .filter((fact) => fact.status === "passed")
    .map(
      (fact) => `<li>${escapeHtml(fact.title)}</li>`,
    )
    .join("");
  const fixCards = fixes
    .map(
      (fact) => `
        <article class="signal-card">
          <div class="signal-head">
            <h3>${escapeHtml(fact.title)}</h3>
            <span class="status-${fact.status}">${escapeHtml(
              fact.status === "critical"
                ? isRu ? "Критично" : "Critical"
                : fact.status === "warning"
                  ? isRu ? "Предупреждение" : "Warning"
                  : isRu ? "Информация" : "Info",
            )}</span>
          </div>
          <p>${escapeHtml(fact.detail)}</p>
          <p class="meta">${isRu ? "Что сделать" : "Action"}: ${escapeHtml(fact.action)}</p>
        </article>`,
    )
    .join("");
  const technicalRows = report.confirmedFacts
    .map(
      (fact) => `
        <li>
          <strong>${escapeHtml(fact.title)}</strong>
          <span>${escapeHtml(fact.sourceToolIds.join(", "))}</span>
        </li>`,
    )
    .join("");

  return `<!doctype html>
  <html lang="${isRu ? "ru" : "en"}">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>ToraSEO Site Audit Report</title>
      <style>
        :root {
          color-scheme: light;
          --bg: #fff7ed;
          --surface: #ffffff;
          --border: #ffedd5;
          --text: #2b1b12;
          --muted: rgba(43, 27, 18, 0.58);
          --accent: #ff6b35;
          --accent-soft: #fff0e8;
          --green: #059669;
          --red: #ef4444;
          --orange: #f97316;
          --blue: #60a5fa;
          --shadow: 0 1px 2px rgba(43, 27, 18, 0.06);
        }
        * { box-sizing: border-box; }
        body {
          margin: 0;
          padding: 24px;
          font-family: Inter, "Segoe UI", system-ui, sans-serif;
          font-size: 14px;
          color: var(--text);
          background: var(--bg);
        }
        .shell {
          max-width: 1168px;
          margin: 0 auto;
          display: grid;
          gap: 16px;
        }
        .hero, .section, .kpi {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 8px;
          box-shadow: var(--shadow);
        }
        .hero { padding: 20px; }
        .section { padding: 16px; }
        .hero h1, .section h2, .card h3, .fix-card h3 {
          margin: 0;
        }
        h1 {
          font-size: 20px;
          line-height: 1.2;
        }
        h2 {
          font-size: 14px;
          line-height: 1.25;
        }
        h3 {
          font-size: 14px;
          line-height: 1.25;
        }
        .hero p {
          margin: 8px 0 0;
          line-height: 1.5;
        }
        .hero-top {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 16px;
        }
        .hero-actions {
          display: flex;
          gap: 8px;
        }
        .audit-hero {
          display: grid;
          grid-template-columns: 72px minmax(0, 1fr) auto;
          gap: 18px;
          align-items: center;
        }
        .audit-mascot {
          width: 56px;
          height: 56px;
          object-fit: contain;
          flex: 0 0 auto;
        }
        .audit-mascot.fallback {
          display: grid;
          place-items: center;
          border-radius: 12px;
          background: var(--accent-soft);
          color: var(--accent);
          font-size: 28px;
          font-weight: 900;
        }
        .eyebrow {
          margin: 0 0 6px;
          color: var(--accent);
          font-size: 11px;
          font-weight: 800;
          text-transform: uppercase;
        }
        .button, .pill {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border-radius: 8px;
          border: 1px solid var(--border);
          background: white;
          color: var(--text);
          padding: 8px 12px;
          font-size: 12px;
          font-weight: 600;
          text-decoration: none;
        }
        .button.primary {
          background: var(--accent);
          color: white;
          border-color: var(--accent);
        }
        .summary-line {
          width: 100%;
          height: 7px;
          margin-top: 14px;
          border-radius: 999px;
          background: var(--accent);
        }
        .chips {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
          margin-top: 14px;
        }
        .chip {
          border-radius: 999px;
          background: var(--accent-soft);
          padding: 6px 10px;
          font-size: 12px;
          color: var(--muted);
        }
        .kpi-grid {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 16px;
        }
        .kpi { padding: 18px; }
        .kpi-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
        }
        .kpi-icon {
          display: grid;
          place-items: center;
          width: 34px;
          height: 34px;
          border-radius: 8px;
          background: var(--accent-soft);
          color: var(--accent);
        }
        .score-ring {
          display: grid;
          place-items: center;
          width: 56px;
          height: 56px;
          border-radius: 999px;
          color: var(--green) !important;
          background: conic-gradient(currentColor var(--ring-deg), rgba(120, 72, 42, 0.12) 0deg);
        }
        .score-ring span {
          display: grid;
          place-items: center;
          width: 40px;
          height: 40px;
          border-radius: 999px;
          background: white;
          color: inherit;
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
          font-size: 14px;
          font-weight: 700;
        }
        .kpi-value {
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
          font-size: 28px;
          font-weight: 700;
        }
        .kpi strong {
          display: block;
          margin-top: 10px;
          font-size: 14px;
        }
        .kpi-detail {
          display: block;
          margin-top: 6px;
          color: var(--muted);
          font-size: 12px;
          line-height: 1.45;
        }
        .site-preview-card {
          display: grid;
          grid-template-columns: 2fr 1fr;
          gap: 16px;
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 8px;
          padding: 16px;
        }
        .browser-preview, .tech-panel {
          border: 1px solid var(--border);
          border-radius: 8px;
          background: #fffdfa;
          overflow: hidden;
        }
        .browser-top {
          display: grid;
          grid-template-columns: 10px 10px 10px minmax(0, 1fr);
          gap: 7px;
          align-items: center;
          padding: 10px 12px;
          border-bottom: 1px solid var(--border);
          background: #fff7f0;
        }
        .dot {
          width: 10px;
          height: 10px;
          border-radius: 999px;
          display: block;
        }
        .dot.red { background: #ff5f57; }
        .dot.yellow { background: #ffbd2e; }
        .dot.green { background: #28c840; }
        .address {
          min-width: 0;
          margin-left: 8px;
          padding: 6px 10px;
          border: 1px solid var(--border);
          border-radius: 999px;
          background: white;
          color: var(--muted);
          font-size: 12px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .browser-body {
          padding: 22px;
          min-height: 300px;
        }
        .preview-label {
          margin: 0 0 10px;
          color: var(--accent);
          font-size: 11px;
          font-weight: 800;
          text-transform: uppercase;
        }
        .preview-title {
          color: var(--muted);
          margin-top: 8px;
        }
        .serp-card {
          margin-top: 18px;
          border: 1px solid var(--border);
          border-radius: 8px;
          padding: 14px;
          background: white;
        }
        .serp-card strong, .serp-card span {
          display: block;
        }
        .serp-card span {
          margin-top: 4px;
          color: var(--green);
          font-size: 12px;
        }
        .preview-lines {
          display: grid;
          gap: 10px;
          margin-top: 20px;
        }
        .preview-lines span {
          display: block;
          height: 10px;
          border-radius: 999px;
          background: #f3e4da;
        }
        .tech-panel {
          display: grid;
          align-content: start;
          gap: 14px;
          padding: 18px;
        }
        .tech-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 10px;
        }
        .tech-grid div {
          border: 1px solid var(--border);
          border-radius: 8px;
          padding: 12px;
          background: white;
        }
        .tech-grid span, .tech-row span {
          display: block;
          color: var(--muted);
          font-size: 11px;
        }
        .tech-grid strong {
          display: block;
          margin-top: 4px;
          font-size: 20px;
        }
        .tech-chips {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }
        .tech-chip {
          border: 1px solid var(--border);
          border-radius: 999px;
          padding: 6px 9px;
          background: var(--accent-soft);
          color: var(--muted);
          font-size: 12px;
          font-weight: 700;
        }
        .tech-rows {
          display: grid;
          gap: 8px;
        }
        .tech-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          border: 1px solid var(--border);
          border-radius: 8px;
          padding: 10px;
          background: white;
        }
        .distribution {
          display: flex;
          height: 14px;
          overflow: hidden;
          border-radius: 999px;
          background: rgba(43, 27, 18, 0.1);
        }
        .status-grid {
          display: grid;
          grid-template-columns: 1.1fr 0.9fr;
          gap: 16px;
        }
        .seg-critical { background: var(--red); }
        .seg-warning { background: var(--orange); }
        .seg-info { background: #60a5fa; }
        .seg-passed { background: var(--green); }
        .status-legend {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          margin-top: 14px;
          color: var(--muted);
          font-size: 12px;
        }
        .section-head {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 14px;
          margin-bottom: 14px;
        }
        .section-head p {
          margin: 6px 0 0;
          color: var(--muted);
          font-size: 12px;
        }
        .small-pill {
          border-radius: 999px;
          background: var(--accent-soft);
          padding: 6px 10px;
          color: var(--muted);
          font-size: 12px;
          font-weight: 700;
        }
        .direction-list {
          display: grid;
          gap: 10px;
        }
        .direction-card {
          border: 1px solid var(--border);
          border-radius: 8px;
          padding: 12px;
          background: rgba(255, 247, 237, 0.6);
        }
        .direction-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
        }
        .direction-card p {
          margin: 6px 0 10px;
          color: var(--muted);
          font-size: 12px;
        }
        .direction-bar {
          height: 7px;
          overflow: hidden;
          border-radius: 999px;
          background: rgba(43, 27, 18, 0.1);
        }
        .direction-bar span {
          display: block;
          height: 100%;
        }
        .fix-list {
          display: grid;
          grid-template-columns: 1fr;
          gap: 12px;
        }
        .details-list { display: grid; gap: 12px; }
        .section-title {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 12px;
          color: var(--accent);
          font-size: 12px;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }
        .section-title h2 {
          margin: 0;
          color: inherit;
          font-size: 12px;
          font-weight: 800;
          line-height: 1.2;
        }
        .section-title svg {
          width: 16px;
          height: 16px;
          flex: 0 0 auto;
        }
        .signal-card {
          border: 1px solid var(--border);
          border-radius: 8px;
          padding: 12px;
          background: rgba(255, 247, 237, 0.55);
        }
        .signal-head {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 12px;
        }
        .signal-head span {
          flex: 0 0 auto;
          font-size: 11px;
          font-weight: 800;
          text-transform: uppercase;
        }
        .signal-card p {
          margin: 6px 0 0;
          color: rgba(43, 27, 18, 0.68);
          line-height: 1.45;
        }
        .gate {
          display: grid;
          grid-template-columns: repeat(7, minmax(0, 1fr));
          gap: 8px;
        }
        .gate-step {
          border: 1px solid var(--border);
          border-radius: 8px;
          padding: 10px;
          font-size: 12px;
          font-weight: 700;
          text-align: center;
          background: #fffdfa;
        }
        .gate-step.critical { color: var(--red); border-color: #fecaca; background: #fff1f1; }
        .gate-step.warning { color: var(--orange); border-color: #fed7aa; background: #fff7ed; }
        .gate-step.passed { color: var(--green); border-color: #bbf7d0; background: #f0fdf4; }
        .card {
          border: 1px solid var(--border);
          border-radius: 8px;
          padding: 16px;
          background: #fffdfa;
        }
        .card-header {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          align-items: flex-start;
          margin-bottom: 10px;
        }
        .card p, .section p {
          margin: 0 0 10px;
          line-height: 1.6;
        }
        .meta {
          color: var(--muted);
          font-size: 12px;
        }
        .passed-list {
          display: grid;
          gap: 8px;
          margin: 0;
          padding: 0;
          list-style: none;
        }
        .passed-list li {
          border: 1px solid #bbf7d0;
          border-radius: 8px;
          background: #ecfdf5;
          padding: 10px 12px;
          color: #047857;
          font-size: 14px;
        }
        details {
          border: 1px solid var(--border);
          border-radius: 8px;
          padding: 14px;
          background: #fffdfa;
        }
        details ul { margin-bottom: 0; }
        details li {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          gap: 12px;
          padding: 8px 0;
          border-bottom: 1px solid #f4e5dc;
        }
        details li:last-child { border-bottom: 0; }
        details span { color: var(--muted); font-size: 12px; }
        .analysis-version {
          margin: 0;
          color: var(--muted);
          font-size: 11px;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }
        .status-critical { color: var(--red); }
        .status-warning { color: var(--orange); }
        .status-info { color: var(--muted); }
        .status-passed { color: var(--green); }
        @media print {
          body { padding: 0; background: white; }
          .hero, .section, .card { break-inside: avoid; }
        }
        @media (max-width: 900px) {
          .kpi-grid, .gate { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .status-grid { grid-template-columns: 1fr; }
          .site-preview-card { grid-template-columns: 1fr; }
          .hero-top { flex-direction: column; }
        }
        ${viewportSizeOverlayStyle()}
      </style>
    </head>
    <body>
      <div class="shell">
        <section class="hero">
          <div class="audit-hero">
            ${mascotMarkup}
            <div>
              <p class="eyebrow">${isRu ? "Метод проверки" : "Audit method"}</p>
              <h1>${critical > 0 ? (isRu ? "Найдены проблемы" : "Issues found") : (isRu ? "Критичных проблем не найдено" : "No critical issues found")}</h1>
              <div class="summary-line"></div>
              <div class="chips">
                <span class="chip">${critical} ${isRu ? "Критично" : "Critical"}</span>
                <span class="chip">${warning} ${isRu ? "Предупреждения" : "Warnings"}</span>
                <span class="chip">${info} ${isRu ? "Информация" : "Info"}</span>
              </div>
            </div>
            <div class="hero-actions">
              <span class="pill">${sourceTotal} / ${sourceTotal}</span>
              <button class="button primary" onclick="location.href='toraseo://export-report-pdf'">${isRu ? "Экспорт PDF" : "Export PDF"}</button>
            </div>
          </div>
        </section>

        <section class="kpi-grid">
          <div class="kpi">
            <div class="kpi-top"><span class="kpi-icon">${reportIconSvg("gauge")}</span><span class="score-ring" style="--ring-deg:${readiness * 3.6}deg"><span>${readiness}</span></span></div>
            <strong>${isRu ? "Готовность SEO" : "SEO readiness"}</strong>
            <span class="kpi-detail">${isRu ? "можно использовать после правок" : "usable after fixes"}</span>
          </div>
          <div class="kpi">
            <div class="kpi-top"><span class="kpi-icon">${reportIconSvg("activity")}</span><span class="score-ring" style="--ring-deg:360deg"><span>100</span></span></div>
            <strong>${isRu ? "Покрытие аудита" : "Audit coverage"}</strong>
            <span class="kpi-detail">${sourceTotal}/${sourceTotal} ${isRu ? "инструментов" : "tools"}</span>
          </div>
          <div class="kpi">
            <div class="kpi-top"><span class="kpi-icon">${reportIconSvg("check")}</span><span class="kpi-value status-passed">${cleanTools}</span></div>
            <strong>${isRu ? "Чистые проверки" : "Clean checks"}</strong>
            <span class="kpi-detail">${isRu ? "завершены без блокирующих проблем" : "completed without blockers"}</span>
          </div>
          <div class="kpi">
            <div class="kpi-top"><span class="kpi-icon">${reportIconSvg("shield")}</span><span class="kpi-value status-warning">${critical + warning + info}</span></div>
            <strong>${isRu ? "Найдено замечаний" : "Findings"}</strong>
            <span class="kpi-detail">${isRu ? "критично, предупреждения, информация" : "critical, warnings, info"}</span>
          </div>
        </section>

        ${renderSitePreviewBlock(preview, isRu)}

        <section class="status-grid">
          <div class="section">
            <div class="section-head">
              <div>
                <h2>${isRu ? "Распределение статусов" : "Status distribution"}</h2>
                <p>${isRu ? "Это оценка по выбранным проверкам, а не показатель трафика, популярности или позиций." : "This is based on selected checks, not traffic, popularity, or rankings."}</p>
              </div>
              <span class="small-pill">${isRu ? "Готово" : "Done"}</span>
            </div>
            <div class="distribution">
              ${renderDistributionSegment(critical, facts.length, "seg-critical")}
              ${renderDistributionSegment(warning, facts.length, "seg-warning")}
              ${renderDistributionSegment(info, facts.length, "seg-info")}
              ${renderDistributionSegment(passed, facts.length, "seg-passed")}
            </div>
            <div class="status-legend">
              <span>${isRu ? "Критично" : "Critical"} ${critical}</span>
              <span>${isRu ? "Предупреждения" : "Warnings"} ${warning}</span>
              <span>${isRu ? "Информация" : "Info"} ${info}</span>
              <span>${isRu ? "Ошибки" : "Errors"} 0</span>
            </div>
          </div>

          <div class="section">
            <div class="section-head compact">
              <h2>${isRu ? "Направления проверки" : "Audit directions"}</h2>
            </div>
            <div class="direction-list">${renderAuditDirections(facts, isRu)}</div>
          </div>
        </section>

        <section class="section">
          ${renderReportSectionTitle(isRu ? "Обзор" : "Overview", "shield")}
          <p>${escapeHtml(report.summary)}</p>
        </section>

        ${fixCards ? `<section class="section">${renderReportSectionTitle(isRu ? "Что исправить первым" : "Fix first", "shield")}<div class="fix-list">${fixCards}</div></section>` : ""}

        <section class="section">
          ${renderReportSectionTitle(isRu ? "SEO-цепочка проверки" : "SEO gate flow", "check")}
          <div class="gate">${renderSeoGateFlow(facts, isRu)}</div>
        </section>

        <section id="details" class="section">
          ${renderReportSectionTitle(isRu ? "Результаты проверки" : "Check results", "shield")}
          <div class="details-list">${detailCards}</div>
        </section>

        ${passedCards ? `<section class="section">${renderReportSectionTitle(isRu ? "Пройденные проверки" : "Passed checks", "shield")}<ul class="passed-list">${passedCards}</ul></section>` : ""}

        <section class="section">
          ${renderReportSectionTitle(isRu ? "Следующий шаг" : "Next step", "shield")}
          <p>${escapeHtml(nextStep)}</p>
        </section>

        <section class="section">
          <details>
            <summary>${isRu ? "Технические детали" : "Technical details"}</summary>
            <ul>${technicalRows}</ul>
          </details>
        </section>

        <section class="section">
          <p class="analysis-version">${analysisVersionLine(isRu, report.analysisVersion)}</p>
        </section>
      </div>
      ${viewportSizeOverlayMarkup()}
    </body>
  </html>`;
}

function renderDistributionSegment(value: number, total: number, className: string): string {
  if (value <= 0 || total <= 0) return "";
  return `<div class="${className}" style="width:${(value / total) * 100}%"></div>`;
}

function renderSiteFactHtml(fact: SiteDisplayFact, isRu: boolean): string {
  const statusLabel =
    fact.status === "critical"
      ? isRu ? "Критично" : "Critical"
      : fact.status === "warning"
        ? isRu ? "Предупреждение" : "Warning"
        : isRu ? "Информация" : "Info";
  return `
    <article class="card">
      <header class="card-header">
        <h3>${escapeHtml(fact.title)}</h3>
        <span class="pill status-${fact.status}">${escapeHtml(statusLabel)}</span>
      </header>
      <p>${escapeHtml(fact.detail)}</p>
      <p><strong>${isRu ? "Что сделать" : "Action"}:</strong> ${escapeHtml(fact.action)}</p>
      <p class="meta">${isRu ? "Проверки" : "Checks"}: ${escapeHtml(fact.sourceToolIds.map((toolId) => siteToolLabel(toolId, isRu)).join(", "))}</p>
    </article>`;
}

function renderSeoGateFlow(facts: SiteDisplayFact[], isRu: boolean): string {
  const steps = [
    { label: "URL", tools: ["scan_site_minimal"] },
    { label: "HTTP", tools: ["scan_site_minimal"] },
    { label: isRu ? "Индексация" : "Indexability", tools: ["analyze_indexability"] },
    { label: "Robots", tools: ["check_robots_txt"] },
    { label: "Sitemap", tools: ["analyze_sitemap"] },
    { label: "Meta", tools: ["analyze_meta", "analyze_canonical"] },
    { label: isRu ? "Контент" : "Content", tools: ["analyze_content"] },
  ];
  return steps
    .map((step) => {
      const matching = facts.filter((fact) =>
        fact.sourceToolIds.some((toolId) => step.tools.includes(toolId)),
      );
      const status =
        matching.some((fact) => fact.status === "critical")
          ? "critical"
          : matching.some((fact) => fact.status === "warning")
            ? "warning"
            : "passed";
      return `<div class="gate-step ${status}">${escapeHtml(step.label)}</div>`;
    })
    .join("");
}

function readMascotDataUri(fileName: string): string | null {
  const candidates = [
    path.join(process.cwd(), "branding", "mascots", fileName),
    path.join(app.getAppPath(), "branding", "mascots", fileName),
    path.join(__dirname, "..", "..", "branding", "mascots", fileName),
  ];
  for (const candidate of candidates) {
    try {
      const svg = fsSync.readFileSync(candidate);
      return `data:image/svg+xml;base64,${svg.toString("base64")}`;
    } catch {
      // Try the next development/packaged path.
    }
  }
  return null;
}

function siteReportMascotMarkup(critical: number, warning: number, isRu: boolean): string {
  const fileName =
    critical > 0
      ? "tora-surprised.svg"
      : warning > 0
        ? "tora-neutral.svg"
        : "tora-champion.svg";
  const dataUri = readMascotDataUri(fileName);
  if (!dataUri) {
    return `<div class="audit-mascot fallback">T</div>`;
  }
  return `<img class="audit-mascot" src="${dataUri}" alt="${isRu ? "Маскот ToraSEO" : "ToraSEO mascot"}" />`;
}

function reportIconSvg(name: "gauge" | "activity" | "check" | "shield"): string {
  const common = `width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"`;
  if (name === "activity") {
    return `<svg ${common}><path d="M22 12h-4l-3 7-6-14-3 7H2"/></svg>`;
  }
  if (name === "check") {
    return `<svg ${common}><path d="M21.8 12A10 10 0 1 1 12 2.2"/><path d="m9 12 2 2 4-5"/></svg>`;
  }
  if (name === "shield") {
    return `<svg ${common}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/><path d="M12 8v4"/><path d="M12 16h.01"/></svg>`;
  }
  return `<svg ${common}><path d="M4.9 19.1a10 10 0 1 1 14.2 0"/><path d="m12 13 3-5"/><path d="M8 17h8"/></svg>`;
}

function renderReportSectionTitle(title: string, icon: "check" | "shield"): string {
  return `<div class="section-title">${reportIconSvg(icon)}<h2>${escapeHtml(title)}</h2></div>`;
}

function renderSiteCompareReportDashboardHtml(report: RuntimeAuditReport): string {
  const compare = report.siteCompare;
  if (!compare) return renderReportHtml({ ...report, siteCompare: undefined });
  const isRu =
    report.locale === "ru" ||
    (report.locale !== "en" &&
      /[А-Яа-яЁё]/.test(`${report.summary} ${report.nextStep}`));
  const colors = ["#ff6b35", "#2563eb", "#059669"];
  const winner = compare.winnerUrl ?? (isRu ? "ожидаем данные" : "waiting for data");
  const metricBars = compare.metrics
    .map(
      (metric) => `
        <section class="metric-panel">
          <h3>${escapeHtml(metric.label)}</h3>
          <div class="bars">
            ${metric.values
              .map(
                (item, index) => `
                  <div class="bar-row">
                    <span>${escapeHtml(item.url)}</span>
                    <b><i style="width:${Math.max(0, Math.min(100, item.value))}%; background:${colors[index % colors.length]}"></i></b>
                    <strong>${item.value}</strong>
                  </div>`,
              )
              .join("")}
          </div>
        </section>`,
    )
    .join("");
  const siteCards = compare.sites
    .map(
      (site, index) => `
        <article class="site-card">
          <div class="site-top">
            <span>Site ${index + 1}</span>
            ${site.url === compare.winnerUrl ? `<mark>${isRu ? "Победитель" : "Winner"}</mark>` : ""}
          </div>
          <h2>${escapeHtml(site.url)}</h2>
          <div class="kpis">
            <div><span>SEO</span><strong>${site.score}/100</strong></div>
            <div><span>Issues</span><strong>${site.critical + site.warning}</strong></div>
            <div><span>Content</span><strong>${site.content}/100</strong></div>
            <div><span>Metadata</span><strong>${site.metadata}/100</strong></div>
          </div>
        </article>`,
    )
    .join("");
  const heatmapRows = compare.directions
    .map(
      (direction) => `
        <tr>
          <th>${escapeHtml(direction.label)}</th>
          ${direction.values
            .map((item) => `<td><span class="pill ${item.status}">${siteCompareStatusLabel(item.status, isRu)}</span></td>`)
            .join("")}
        </tr>`,
    )
    .join("");
  const winnerScore =
    compare.sites.find((site) => site.url === compare.winnerUrl)?.score ??
    compare.sites[0]?.score ??
    0;
  const deltaRows = compare.sites
    .map((site) => {
      const delta = site.score - winnerScore;
      return `
        <div class="bar-row">
          <span>${escapeHtml(site.url)}</span>
          <b><i style="width:${Math.max(4, Math.min(100, Math.abs(delta)))}%; background:${delta >= 0 ? "#059669" : "#f97316"}"></i></b>
          <strong>${delta}</strong>
        </div>`;
    })
    .join("");
  const insights = compare.insights.map((item) => `<li>${escapeHtml(item)}</li>`).join("");

  return `<!doctype html>
  <html lang="${isRu ? "ru" : "en"}">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>ToraSEO Site Comparison</title>
      <style>
        :root { --bg:#fff7ed; --surface:#fff; --border:#ffedd5; --text:#2b1b12; --muted:rgba(43,27,18,.58); --accent:#ff6b35; }
        * { box-sizing:border-box; }
        body { margin:0; padding:24px; background:var(--bg); color:var(--text); font-family:Inter,"Segoe UI",system-ui,sans-serif; font-size:14px; }
        .shell { max-width:1320px; margin:0 auto; display:grid; gap:16px; }
        .hero,.panel,.metric-panel,.site-card { background:var(--surface); border:1px solid var(--border); border-radius:8px; box-shadow:0 1px 2px rgba(43,27,18,.06); }
        .hero { padding:20px; display:flex; justify-content:space-between; gap:24px; align-items:flex-start; }
        h1,h2,h3,p { margin:0; }
        h1 { font-size:24px; line-height:1.15; }
        h2 { font-size:15px; }
        h3 { font-size:13px; }
        .muted { color:var(--muted); line-height:1.5; margin-top:8px; }
        .version { color:var(--muted); font-size:12px; font-weight:700; margin-top:10px; }
        .button { display:inline-flex; border:1px solid var(--border); border-radius:8px; padding:9px 12px; color:var(--text); text-decoration:none; font-weight:800; font-size:12px; background:#fff; white-space:nowrap; }
        .grid3 { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:12px; }
        .grid2 { display:grid; grid-template-columns:minmax(0,1fr) 360px; gap:16px; }
        .metric-grid { display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-top:12px; }
        .panel,.site-card,.metric-panel { padding:16px; }
        .site-top { display:flex; justify-content:space-between; gap:12px; color:var(--muted); font-size:11px; font-weight:800; text-transform:uppercase; }
        mark { background:#fff0e8; color:var(--accent); border-radius:999px; padding:3px 8px; }
        .kpis { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:8px; margin-top:14px; }
        .kpis div { background:#fff7ed; border-radius:7px; padding:9px; }
        .kpis span { display:block; color:var(--muted); font-size:11px; font-weight:800; text-transform:uppercase; }
        .kpis strong { display:block; margin-top:4px; font-size:18px; }
        .bars { display:grid; gap:10px; margin-top:14px; }
        .bar-row { display:grid; grid-template-columns:170px minmax(0,1fr) 44px; gap:10px; align-items:center; font-size:12px; }
        .bar-row span { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:var(--muted); }
        .bar-row b { height:8px; border-radius:999px; background:#f3e4d8; overflow:hidden; }
        .bar-row i { display:block; height:100%; border-radius:999px; }
        table { width:100%; border-collapse:collapse; margin-top:12px; }
        th,td { border-top:1px solid var(--border); padding:10px; text-align:left; }
        th { font-weight:800; }
        .pill { display:inline-flex; border-radius:999px; padding:5px 9px; font-size:11px; font-weight:800; }
        .good { background:#ecfdf5; color:#047857; } .warn { background:#fffbeb; color:#b45309; } .bad { background:#fef2f2; color:#dc2626; } .pending { background:#f3f4f6; color:#6b7280; }
        .radar-wrap { display:grid; justify-items:center; gap:10px; }
        .legend { display:flex; flex-wrap:wrap; gap:10px; color:var(--muted); font-size:12px; }
        .legend span { display:inline-flex; align-items:center; gap:5px; }
        .dot { width:8px; height:8px; border-radius:999px; display:inline-block; }
        ul { margin:12px 0 0; padding-left:18px; line-height:1.55; color:var(--muted); }
        @media print { body { padding:10mm; } .button { display:none; } .shell { max-width:none; } }
      </style>
    </head>
    <body>
      <main class="shell">
        <section class="hero">
          <div>
            <p class="muted">Competitive comparison dashboard</p>
            <h1>${isRu ? "Сравнение сайтов по URL" : "Site Comparison by URL"}</h1>
            <p class="muted">${isRu ? "Победитель" : "Winner"}: <strong>${escapeHtml(winner)}</strong>. ${escapeHtml(report.nextStep)}</p>
            <p class="version">${analysisVersionLine(isRu, report.analysisVersion)}</p>
          </div>
          <a class="button" href="toraseo://export-report-pdf">${isRu ? "Экспорт PDF" : "Export PDF"}</a>
        </section>
        <section class="grid3">${siteCards}</section>
        <section class="grid2">
          <div class="panel"><h2>${isRu ? "Сравнительные метрики" : "Comparative metrics"}</h2><div class="metric-grid">${metricBars}</div></div>
          <div class="panel radar-wrap"><h2>Radar profile</h2>${renderSiteCompareRadarSvg(compare.sites, colors)}<div class="legend">${compare.sites.map((site, index) => `<span><i class="dot" style="background:${colors[index % colors.length]}"></i>${escapeHtml(site.url)}</span>`).join("")}</div></div>
        </section>
        <section class="grid2">
          <div class="panel"><h2>${isRu ? "Delta к лидеру" : "Delta to leader"}</h2><div class="bars">${deltaRows}</div></div>
          <div class="panel"><h2>${isRu ? "Что делать" : "Actions"}</h2><ul>${insights}</ul></div>
        </section>
        <section class="panel">
          <h2>Heatmap / ${isRu ? "матрица направлений" : "direction matrix"}</h2>
          <table>
            <thead><tr><th>${isRu ? "Направление" : "Direction"}</th>${compare.sites.map((site) => `<th>${escapeHtml(site.url)}</th>`).join("")}</tr></thead>
            <tbody>${heatmapRows}</tbody>
          </table>
        </section>
        <p class="version">${analysisVersionLine(isRu, report.analysisVersion)}</p>
      </main>
    </body>
  </html>`;
}

function siteCompareStatusLabel(status: "good" | "warn" | "bad" | "pending", isRu: boolean): string {
  if (status === "good") return "OK";
  if (status === "warn") return isRu ? "Проверить" : "Check";
  if (status === "bad") return isRu ? "Проблема" : "Issue";
  return isRu ? "Ожидаем" : "Pending";
}

function renderSiteCompareRadarSvg(
  sites: NonNullable<RuntimeAuditReport["siteCompare"]>["sites"],
  colors: string[],
): string {
  const axes = [
    { key: "score", label: "SEO" },
    { key: "metadata", label: "Meta" },
    { key: "content", label: "Content" },
    { key: "indexability", label: "Index" },
  ] as const;
  const center = 92;
  const radius = 64;
  const point = (index: number, value: number) => {
    const angle = -Math.PI / 2 + (Math.PI * 2 * index) / axes.length;
    const r = (Math.max(0, Math.min(100, value)) / 100) * radius;
    return `${center + Math.cos(angle) * r},${center + Math.sin(angle) * r}`;
  };
  const grid = [0.25, 0.5, 0.75, 1]
    .map((scale) => {
      const points = axes
        .map((_, index) => {
          const angle = -Math.PI / 2 + (Math.PI * 2 * index) / axes.length;
          const r = radius * scale;
          return `${center + Math.cos(angle) * r},${center + Math.sin(angle) * r}`;
        })
        .join(" ");
      return `<polygon points="${points}" fill="none" stroke="#f3d8c5" stroke-width="1" />`;
    })
    .join("");
  const labels = axes
    .map((axis, index) => {
      const angle = -Math.PI / 2 + (Math.PI * 2 * index) / axes.length;
      const x = center + Math.cos(angle) * (radius + 22);
      const y = center + Math.sin(angle) * (radius + 22);
      return `<text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="middle" font-size="9" fill="#7c5b4a">${axis.label}</text>`;
    })
    .join("");
  const polygons = sites
    .map((site, siteIndex) => {
      const points = axes.map((axis, index) => point(index, Number(site[axis.key]) || 0)).join(" ");
      const color = colors[siteIndex % colors.length];
      return `<polygon points="${points}" fill="${color}" fill-opacity=".12" stroke="${color}" stroke-width="2" />`;
    })
    .join("");
  return `<svg viewBox="0 0 184 184" width="240" height="240" role="img">${grid}${labels}${polygons}</svg>`;
}

function renderArticleCompareReportDashboardHtml(report: RuntimeAuditReport): string {
  const isRu =
    report.locale === "ru" ||
    (report.locale !== "en" &&
      /[А-Яа-яЁё]/.test(`${report.summary} ${report.nextStep}`));
  const compare = report.articleCompare!;
  const copy = {
    htmlLang: isRu ? "ru" : "en",
    title: isRu ? "ToraSEO: сравнение текстов" : "ToraSEO: text comparison",
    heading: isRu ? "Результат сравнения" : "Comparison result",
    subtitle: isRu
      ? "Структурированное сравнение двух текстов по данным ToraSEO."
      : "Structured comparison of two texts based on ToraSEO data.",
    goalMode: isRu ? "Режим по цели:" : "Goal mode:",
    copyA: isRu ? "Копировать статью A" : "Copy article A",
    copyB: isRu ? "Копировать статью B" : "Copy article B",
    export: isRu ? "Экспортировать" : "Export",
    similarityRisk: isRu ? "Риск похожести" : "Similarity risk",
    exactOverlap: isRu ? "Дословные совпадения:" : "Exact overlap:",
    visualComparison: isRu ? "Визуальное сравнение A/B" : "A/B visual comparison",
    textAdvantage: isRu ? "Текстовое преимущество" : "Text advantage",
    visualBody: isRu
      ? "Графы показывают относительные локальные признаки. Это не итоговый SEO-скор, а быстрый способ увидеть разрывы."
      : "The charts show relative local signals. This is not a final SEO score, but a quick way to spot gaps.",
    twoTexts: isRu ? "Два текста" : "Two texts",
    twoTextsBody: isRu
      ? "Третий отчет показывает исходные тексты рядом, чтобы сверять выводы A/B в одном окне."
      : "The third report keeps the source texts side by side so A/B conclusions can be checked in one window.",
    gapsTitle: isRu ? "Разрывы и отличия" : "Gaps and differences",
    gapsBody: isRu
      ? "Какие темы, смысловые блоки и полезные элементы отличаются между текстами A и B."
      : "Topics, semantic blocks, and useful elements that differ between texts A and B.",
    actionsTitle: isRu ? "План улучшений" : "Improvement plan",
    toolDataTitle: isRu ? "Данные инструментов" : "Tool data",
    copyError: isRu ? "Не удалось скопировать текст." : "Could not copy the text.",
    copyAReady: isRu
      ? "Статья A скопирована без служебных медиа-меток."
      : "Article A copied without service media markers.",
    copyBReady: isRu
      ? "Статья B скопирована без служебных медиа-меток."
      : "Article B copied without service media markers.",
  };
  const visualRows = compare.metrics
    .map((metric) => renderArticleCompareVisualMetricHtml(metric, isRu))
    .join("");
  const metricCards = compare.metrics
    .map((metric) => renderArticleCompareMetricCardHtml(metric, isRu))
    .join("");
  const facts = report.confirmedFacts
    .map((fact) => renderArticleCompareToolCardHtml(fact, isRu))
    .join("");
  const findingColumns =
    compare.focusSide === "textA"
      ? renderCompareInsightColumn(isRu ? "Текст A" : "Text A", compare.textA.strengths, compare.textA.weaknesses, isRu)
      : compare.focusSide === "textB"
        ? renderCompareInsightColumn(isRu ? "Текст B" : "Text B", compare.textB.strengths, compare.textB.weaknesses, isRu)
        : [
            renderCompareInsightColumn(isRu ? "Текст A" : "Text A", compare.textA.strengths, compare.textA.weaknesses, isRu),
            renderCompareInsightColumn(isRu ? "Текст B" : "Text B", compare.textB.strengths, compare.textB.weaknesses, isRu),
          ].join("");
  const findingsTitle =
    compare.focusSide === "textA"
      ? isRu ? "Фокус по цели анализа: текст A" : "Goal focus: text A"
      : compare.focusSide === "textB"
        ? isRu ? "Фокус по цели анализа: текст B" : "Goal focus: text B"
        : isRu ? "Сильные и слабые стороны A/B" : "A/B strengths and weaknesses";
  const gapRows = compare.gaps
    .slice(0, 8)
    .map(
      (gap) => `
        <article class="compact-note soft-note">
          <h3>${escapeHtml(compareGapSideLabel(gap.side, isRu))}: ${escapeHtml(compareReportTitle(gap.title, isRu))}</h3>
          <p>${escapeHtml(localizeToolDataText(gap.detail, isRu))}</p>
        </article>`,
    )
    .join("");
  const actionRows = compare.actionPlan
    .slice(0, 8)
    .map(
      (item, index) => `
        <article class="compact-note">
          <h3>${index + 1}. ${escapeHtml(compareReportTitle(item.title, isRu))}</h3>
          <p>${escapeHtml(localizeToolDataText(item.detail, isRu))}</p>
        </article>`,
    )
    .join("");
  return `<!doctype html>
  <html lang="${copy.htmlLang}">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>${escapeHtml(copy.title)}</title>
      <style>
        :root {
          --bg:#fff7f0;
          --surface:#ffffff;
          --panel:#fffaf6;
          --border:#efd9ca;
          --border-soft:rgba(239,217,202,.72);
          --text:#1a0f08;
          --muted:rgba(26,15,8,.58);
          --muted-strong:rgba(26,15,8,.72);
          --accent:#ff6b35;
          --accent-2:#f6b36d;
          --soft:#fff2e9;
          --good:#ecfdf3;
          --good-border:#bdeccc;
          --warn:#fff8e8;
          --warn-border:#f4d58d;
        }
        * { box-sizing:border-box; }
        body {
          margin:0;
          padding:28px;
          font-family:Inter,"Segoe UI",system-ui,sans-serif;
          color:var(--text);
          background:var(--bg);
          letter-spacing:0;
        }
        h1,h2,h3,p,ol,ul { margin:0; }
        p,li { line-height:1.55; }
        button { font:inherit; }
        .dashboard { width:min(1480px,100%); margin:0 auto; display:grid; gap:18px; }
        .panel {
          border:1px solid var(--border);
          border-radius:8px;
          background:var(--surface);
          padding:20px;
        }
        .report-summary-header {
          display:flex;
          align-items:flex-start;
          justify-content:space-between;
          gap:16px;
          margin-bottom:16px;
        }
        .report-summary-header h1 {
          font-size:19px;
          font-weight:750;
          line-height:1.2;
        }
        .report-summary-header p {
          margin-top:5px;
          color:var(--muted);
          font-size:13px;
        }
        .report-actions {
          display:flex;
          flex-wrap:wrap;
          align-items:center;
          justify-content:flex-end;
          gap:8px;
        }
        .report-actions span {
          border:1px solid rgba(255,107,53,.28);
          border-radius:999px;
          background:#fffaf7;
          padding:6px 10px;
          color:var(--muted-strong);
          font:700 12px ui-monospace,SFMono-Regular,Consolas,monospace;
        }
        .report-actions button {
          border:1px solid rgba(26,15,8,.14);
          border-radius:6px;
          background:#fff;
          color:var(--muted-strong);
          padding:7px 11px;
          font-size:12px;
          font-weight:700;
          cursor:pointer;
        }
        .report-actions #export-report {
          border-color:var(--accent);
          background:var(--accent);
          color:#fff;
        }
        .analysis-version {
          margin:0;
          color:rgba(26,15,8,.42);
          font-size:11px;
          font-weight:800;
          letter-spacing:.06em;
          text-transform:uppercase;
        }
        .status-line {
          min-height:17px;
          color:#b45528;
          font-size:12px;
          font-weight:650;
        }
        .eyebrow {
          color:rgba(26,15,8,.48);
          font-size:11px;
          font-weight:750;
          letter-spacing:.04em;
          text-transform:uppercase;
        }
        .top-grid {
          display:grid;
          grid-template-columns:minmax(0,1fr) 320px;
          gap:14px;
        }
        .hero, .risk-card {
          border:1px solid rgba(255,107,53,.32);
          border-radius:8px;
          padding:16px;
        }
        .hero {
          background:var(--soft);
        }
        .hero h2, .risk-card h2 {
          margin-top:8px;
          font-size:24px;
          line-height:1.18;
          font-weight:760;
        }
        .hero p, .risk-card p {
          margin-top:8px;
          color:var(--muted-strong);
          font-size:13px;
        }
        .verdict-detail {
          border:1px solid rgba(255,107,53,.24);
          border-radius:6px;
          background:#fffaf7;
          padding:10px;
        }
        .section-heading {
          display:flex;
          align-items:flex-end;
          justify-content:space-between;
          gap:14px;
          margin-bottom:14px;
        }
        .section-heading h2 {
          font-size:16px;
          font-weight:760;
        }
        .section-heading p {
          margin-top:4px;
          color:var(--muted);
          font-size:12px;
        }
        .legend {
          display:flex;
          gap:12px;
          color:var(--muted);
          font-size:12px;
          font-weight:700;
        }
        .legend span { display:inline-flex; align-items:center; gap:5px; }
        .legend i { width:20px; height:7px; border-radius:999px; background:var(--accent); }
        .legend .b { background:var(--accent-2); }
        .visual-grid {
          display:grid;
          grid-template-columns:repeat(2,minmax(0,1fr));
          gap:12px;
        }
        .visual-card, .metric-card, .compact-note {
          border:1px solid var(--border-soft);
          border-radius:7px;
          background:#fffdfb;
          padding:13px;
        }
        .visual-card-header, .metric-card-header {
          display:flex;
          align-items:flex-start;
          justify-content:space-between;
          gap:10px;
        }
        .visual-card h3, .metric-card h3, .compact-note h3 {
          font-size:12px;
          font-weight:750;
          color:rgba(26,15,8,.66);
          text-transform:uppercase;
        }
        .winner-chip {
          border-radius:999px;
          background:#fff;
          padding:3px 8px;
          color:rgba(26,15,8,.46);
          font-size:11px;
          font-weight:750;
          white-space:nowrap;
        }
        .bar-row {
          display:grid;
          grid-template-columns:18px minmax(0,1fr) 56px;
          align-items:center;
          gap:8px;
          margin-top:9px;
          font-size:12px;
        }
        .bar-row span { color:rgba(26,15,8,.5); font-weight:750; }
        .bar-row div { height:8px; overflow:hidden; border-radius:999px; background:#fff5ed; }
        .bar-row i { display:block; height:100%; border-radius:999px; background:var(--accent); }
        .bar-row i.b { background:var(--accent-2); }
        .bar-row b { color:rgba(26,15,8,.62); text-align:right; font-weight:760; }
        .metric-grid {
          display:grid;
          grid-template-columns:repeat(4,minmax(0,1fr));
          gap:12px;
        }
        .metric-values {
          display:grid;
          grid-template-columns:1fr 1fr;
          gap:8px;
          margin-top:13px;
          text-align:center;
        }
        .metric-value {
          border-radius:6px;
          background:#fff;
          padding:12px 8px;
        }
        .metric-value strong {
          display:block;
          font-size:20px;
          line-height:1;
        }
        .metric-value span {
          display:block;
          margin-top:5px;
          color:rgba(26,15,8,.42);
          font-size:10px;
          font-weight:760;
          text-transform:uppercase;
        }
        .metric-card p, .compact-note p {
          margin-top:9px;
          color:var(--muted-strong);
          font-size:12px;
        }
        .text-grid, .findings-grid, .split-grid {
          display:grid;
          grid-template-columns:repeat(2,minmax(0,1fr));
          gap:16px;
        }
        .text-card {
          border:1px solid var(--border-soft);
          border-radius:8px;
          background:#fff;
          overflow:hidden;
        }
        .text-card header {
          border-bottom:1px solid var(--border-soft);
          padding:14px;
        }
        .text-card h3 {
          margin-top:4px;
          font-size:16px;
          line-height:1.25;
          font-weight:750;
        }
        .chips {
          display:grid;
          grid-template-columns:repeat(3,minmax(0,1fr));
          gap:8px;
          margin-top:12px;
          text-align:center;
        }
        .chip {
          border-radius:6px;
          background:#fff3e9;
          padding:7px 8px;
          color:rgba(26,15,8,.52);
          font-size:11px;
          font-weight:650;
        }
        .preview {
          max-height:560px;
          overflow:auto;
          padding:15px;
          color:rgba(26,15,8,.72);
          font-size:13px;
          line-height:1.65;
          white-space:pre-wrap;
        }
        .finding-side {
          border:1px solid var(--border-soft);
          border-radius:8px;
          background:#fff8f1;
          padding:14px;
        }
        .finding-side h3 {
          font-size:14px;
          font-weight:760;
        }
        .finding-list {
          display:grid;
          gap:10px;
          margin-top:12px;
        }
        .finding-list strong {
          font-size:12px;
        }
        .insight {
          border:1px solid var(--border-soft);
          border-radius:7px;
          background:#fffdfb;
          padding:12px;
        }
        .insight.good { background:var(--good); border-color:var(--good-border); }
        .insight.warn { background:var(--warn); border-color:var(--warn-border); }
        .insight h4 {
          margin:0;
          font-size:13px;
          font-weight:760;
        }
        .insight p {
          margin-top:7px;
          color:rgba(26,15,8,.66);
          font-size:12px;
        }
        .soft-note { background:#fff8f1; }
        .tool-data-grid {
          display:grid;
          grid-template-columns:repeat(2,minmax(0,1fr));
          gap:14px;
        }
        .tool-card {
          border:1px solid var(--border-soft);
          border-radius:8px;
          background:#fff;
          padding:14px;
        }
        .tool-card-head {
          display:grid;
          grid-template-columns:28px minmax(0,1fr) auto;
          gap:10px;
          align-items:start;
        }
        .tool-icon {
          width:26px;
          height:26px;
          border-radius:7px;
          display:grid;
          place-items:center;
          background:#fff2e9;
          color:var(--accent);
          font-weight:900;
        }
        .tool-card h3 {
          font-size:13px;
          font-weight:760;
        }
        .tool-card small {
          display:block;
          margin-top:2px;
          color:var(--muted);
          font-size:11px;
        }
        .done-pill {
          border-radius:999px;
          background:#dff8e9;
          color:#239b5d;
          padding:4px 8px;
          font-size:11px;
          font-weight:760;
        }
        .tool-note-block {
          margin-top:12px;
          border:1px solid rgba(255,107,53,.22);
          border-radius:7px;
          background:#fff4e8;
          padding:10px 11px;
        }
        .tool-note-block h4 {
          margin:0;
          color:#b66c3a;
          font-size:11px;
          font-weight:760;
          text-transform:uppercase;
        }
        .tool-note-block p {
          margin-top:5px;
          color:rgba(26,15,8,.66);
          font-size:12px;
        }
        .limit-box {
          border-color:#f3cf77;
          background:#fff9e8;
        }
        .limit-box ul {
          display:grid;
          gap:5px;
          margin-top:9px;
          padding-left:0;
          list-style:none;
          color:#8a5c17;
          font-size:12px;
        }
        .next-step {
          color:rgba(26,15,8,.82);
          font-size:14px;
          font-weight:650;
        }
        @media (max-width:1100px) {
          .top-grid, .visual-grid, .metric-grid, .text-grid, .findings-grid, .split-grid, .tool-data-grid { grid-template-columns:1fr; }
        }
        @media (max-width:700px) {
          body { padding:14px; }
          .report-summary-header { display:grid; }
          .report-actions { justify-content:flex-start; }
          .chips { grid-template-columns:1fr; }
        }
        @media print {
          body { background:white; padding:0; }
          .panel, .visual-card, .metric-card, .text-card, .finding-side, .tool-card, .compact-note { break-inside:avoid; }
          .preview { max-height:none; overflow:visible; }
        }
        ${viewportSizeOverlayStyle()}
      </style>
    </head>
    <body>
      <main class="dashboard">
        <section class="panel report-summary-panel">
          <div class="report-summary-header">
            <div>
              <p class="eyebrow">ToraSEO</p>
              <h1>${escapeHtml(copy.heading)}</h1>
              <p>${escapeHtml(copy.subtitle)}</p>
              <p><strong>${escapeHtml(copy.goalMode)}</strong> ${escapeHtml(compare.goalLabel)}. ${escapeHtml(compare.goalDescription)}</p>
            </div>
            <div class="report-actions">
              <span>${compare.coverage.completed} / ${compare.coverage.total}</span>
              <button class="report-window-action" id="copy-text-a" type="button">${escapeHtml(copy.copyA)}</button>
              <button class="report-window-action" id="copy-text-b" type="button">${escapeHtml(copy.copyB)}</button>
              <button id="export-report" type="button">${escapeHtml(copy.export)}</button>
            </div>
          </div>
          <p class="status-line" id="copy-status"></p>
          <div class="top-grid">
            <div class="hero">
              <p class="eyebrow">${escapeHtml(copy.textAdvantage)}</p>
              <h2>${escapeHtml(localizeToolDataText(compare.verdict.label, isRu))}</h2>
              <p>${escapeHtml(localizeToolDataText(compare.goalDescription, isRu))}</p>
              <p class="verdict-detail">${escapeHtml(localizeToolDataText(compare.verdict.detail, isRu))}</p>
              <p>${escapeHtml(localizeToolDataText(compare.verdict.mainGap, isRu))}</p>
            </div>
            <aside class="risk-card">
              <p class="eyebrow">${escapeHtml(copy.similarityRisk)}</p>
              <h2>${escapeHtml(copyRiskLabelForReport(compare.similarity.copyRisk, isRu))}</h2>
              <p><strong>${escapeHtml(copy.exactOverlap)}</strong> ${escapeHtml(String(compare.similarity.exactOverlap ?? "—"))}%</p>
              <p>${escapeHtml(localizeToolDataText(compare.similarity.detail, isRu))}</p>
            </aside>
          </div>
        </section>

        <section class="panel">
          <div class="section-heading">
            <div>
              <h2>${escapeHtml(copy.visualComparison)}</h2>
              <p>${escapeHtml(copy.visualBody)}</p>
            </div>
            <div class="legend"><span><i></i>A</span><span><i class="b"></i>B</span></div>
          </div>
          <div class="visual-grid">${visualRows}</div>
        </section>

        <section class="panel">
          <div class="section-heading">
            <div>
              <h2>${escapeHtml(copy.twoTexts)}</h2>
              <p>${escapeHtml(copy.twoTextsBody)}</p>
            </div>
          </div>
          <div class="text-grid">
            ${renderArticleCompareTextSideHtml(compare.textA, isRu)}
            ${renderArticleCompareTextSideHtml(compare.textB, isRu)}
          </div>
        </section>

        <section class="panel">
          <div class="metric-grid">${metricCards}</div>
        </section>

        <section class="panel">
          <div class="section-heading">
            <div>
              <h2>${findingsTitle}</h2>
              <p>${escapeHtml(compare.goalDescription)}</p>
            </div>
          </div>
          <div class="findings-grid">
            ${findingColumns}
          </div>
        </section>

        <section class="panel">
          <div class="split-grid">
            <div>
              <div class="section-heading">
                <div>
                  <h2>${escapeHtml(copy.gapsTitle)}</h2>
                  <p>${escapeHtml(copy.gapsBody)}</p>
                </div>
              </div>
              <div class="finding-list">${gapRows}</div>
            </div>
            <div>
              <div class="section-heading">
                <div>
                  <h2>${escapeHtml(copy.actionsTitle)}</h2>
                  <p>${escapeHtml(isRu ? "Приоритеты правки: усиливаем нужный текст, не копируя второй." : "Edit priorities: strengthen the target text without copying the other one.")}</p>
                </div>
              </div>
              <div class="finding-list">${actionRows}</div>
            </div>
          </div>
        </section>

        <section class="panel">
          <div class="section-heading">
            <div>
              <h2>${escapeHtml(copy.toolDataTitle)}</h2>
              <p>${escapeHtml(isRu ? "Каждый блок показывает, что нашел конкретный MCP-инструмент и что с этим делать дальше." : "Each block shows what a specific MCP tool found and what to do next.")}</p>
            </div>
          </div>
          <div class="tool-data-grid">${facts}</div>
        </section>

        <section class="panel limit-box">
          <p class="eyebrow">${escapeHtml(isRu ? "Граница текстового сравнения" : "Text comparison boundary")}</p>
          <ul>
            ${compare.limitations.map((item) => `<li>• ${escapeHtml(localizeToolDataText(item, isRu))}</li>`).join("")}
          </ul>
        </section>

        <section class="panel">
          <p class="next-step">${escapeHtml(localizeToolDataText(report.nextStep, isRu))}</p>
        </section>
        <section class="panel">
          <p class="analysis-version">${analysisVersionLine(isRu, report.analysisVersion)}</p>
        </section>
      </main>
      <script>
        (() => {
          const textA = ${jsonScriptString(stripMediaPlaceholderLines(compare.textA.text))};
          const textB = ${jsonScriptString(stripMediaPlaceholderLines(compare.textB.text))};
          const status = document.getElementById("copy-status");
          const setStatus = (message) => {
            if (!status) return;
            status.textContent = message;
          };
          const copyText = async (value, successMessage) => {
            try {
              if (navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(value);
              } else {
                const area = document.createElement("textarea");
                area.value = value;
                area.style.position = "fixed";
                area.style.opacity = "0";
                document.body.appendChild(area);
                area.focus();
                area.select();
                document.execCommand("copy");
                area.remove();
              }
              setStatus(successMessage);
            } catch {
              setStatus(${jsonScriptString(copy.copyError)});
            }
          };
          document.getElementById("copy-text-a")?.addEventListener("click", () => {
            void copyText(textA, ${jsonScriptString(copy.copyAReady)});
          });
          document.getElementById("copy-text-b")?.addEventListener("click", () => {
            void copyText(textB, ${jsonScriptString(copy.copyBReady)});
          });
          document.getElementById("export-report")?.addEventListener("click", () => {
            window.location.href = "toraseo://export-report-pdf";
          });
        })();
      </script>
      ${viewportSizeOverlayMarkup()}
    </body>
  </html>`;
}

function copyRiskLabelForReport(
  risk: NonNullable<RuntimeAuditReport["articleCompare"]>["similarity"]["copyRisk"],
  isRu: boolean,
): string {
  if (risk === "high") return isRu ? "Высокий риск" : "High risk";
  if (risk === "medium") return isRu ? "Средний риск" : "Medium risk";
  if (risk === "low") return isRu ? "Низкий риск" : "Low risk";
  return isRu ? "Нужна проверка" : "Needs review";
}

function jsonScriptString(value: string): string {
  return JSON.stringify(value).replaceAll("<", "\\u003c");
}

function renderArticleCompareVisualMetricHtml(
  metric: NonNullable<RuntimeAuditReport["articleCompare"]>["metrics"][number],
  isRu: boolean,
): string {
  const a = typeof metric.textA === "number" ? Math.abs(metric.textA) : 0;
  const b = typeof metric.textB === "number" ? Math.abs(metric.textB) : 0;
  const max = Math.max(1, a, b);
  const widthA = Math.max(4, Math.round((a / max) * 100));
  const widthB = Math.max(4, Math.round((b / max) * 100));
  return `
    <article class="visual-card">
      <div class="visual-card-header">
        <h3>${escapeHtml(metric.label)}</h3>
        <span class="winner-chip">${escapeHtml(compareMetricWinnerLabelForReport(metric.winner, isRu))}</span>
      </div>
      <div class="bar-row"><span>A</span><div><i style="width:${widthA}%"></i></div><b>${escapeHtml(String(metric.textA ?? "—"))}${escapeHtml(metric.textA !== null ? metric.suffix : "")}</b></div>
      <div class="bar-row"><span>B</span><div><i class="b" style="width:${widthB}%"></i></div><b>${escapeHtml(String(metric.textB ?? "—"))}${escapeHtml(metric.textB !== null ? metric.suffix : "")}</b></div>
    </article>`;
}

function renderArticleCompareMetricCardHtml(
  metric: NonNullable<RuntimeAuditReport["articleCompare"]>["metrics"][number],
  isRu: boolean,
): string {
  return `
    <article class="metric-card">
      <div class="metric-card-header">
        <h3>${escapeHtml(metric.label)}</h3>
        <span class="winner-chip">${escapeHtml(compareMetricShortWinnerLabelForReport(metric.winner, isRu))}</span>
      </div>
      <div class="metric-values">
        <div class="metric-value"><strong>${escapeHtml(String(metric.textA ?? "—"))}${escapeHtml(metric.textA !== null ? metric.suffix : "")}</strong><span>A</span></div>
        <div class="metric-value"><strong>${escapeHtml(String(metric.textB ?? "—"))}${escapeHtml(metric.textB !== null ? metric.suffix : "")}</strong><span>B</span></div>
      </div>
      <p>${escapeHtml(metric.description)}</p>
    </article>`;
}

function compareMetricWinnerLabelForReport(
  winner: NonNullable<RuntimeAuditReport["articleCompare"]>["metrics"][number]["winner"],
  isRu: boolean,
): string {
  if (winner === "textA") return isRu ? "лучше A" : "A is stronger";
  if (winner === "textB") return isRu ? "лучше B" : "B is stronger";
  if (winner === "risk") return isRu ? "риск" : "risk";
  if (winner === "tie") return isRu ? "примерно равно" : "about equal";
  return isRu ? "ожидаем" : "waiting";
}

function compareMetricShortWinnerLabelForReport(
  winner: NonNullable<RuntimeAuditReport["articleCompare"]>["metrics"][number]["winner"],
  isRu: boolean,
): string {
  if (winner === "textA") return "A";
  if (winner === "textB") return "B";
  if (winner === "risk") return isRu ? "риск" : "risk";
  if (winner === "tie") return isRu ? "равно" : "tie";
  return "—";
}

function renderArticleCompareTextSideHtml(
  side: NonNullable<RuntimeAuditReport["articleCompare"]>["textA"],
  isRu: boolean,
): string {
  const roleLabel =
    side.role === "own"
      ? isRu ? "Ваш текст" : "Your text"
      : side.role === "competitor"
        ? isRu ? "Текст конкурента" : "Competitor text"
        : side.label;
  return `
    <article class="text-card">
      <header>
        <p class="eyebrow">${escapeHtml(roleLabel)}</p>
        <h3>${escapeHtml(side.title)}</h3>
        <div class="chips">
          <span class="chip">${escapeHtml(String(side.wordCount))} ${isRu ? "слов" : "words"}</span>
          <span class="chip">${escapeHtml(String(side.paragraphCount))} ${isRu ? "абзацев" : "paragraphs"}</span>
          <span class="chip">${escapeHtml(String(side.headingCount))} ${isRu ? "заголовков" : "headings"}</span>
        </div>
      </header>
      <div class="preview">${escapeHtml(side.text)}</div>
    </article>`;
}

function renderCompareInsightColumn(
  title: string,
  strengths: NonNullable<RuntimeAuditReport["articleCompare"]>["textA"]["strengths"],
  weaknesses: NonNullable<RuntimeAuditReport["articleCompare"]>["textA"]["weaknesses"],
  isRu: boolean,
): string {
  const render = (items: typeof strengths, fallback: string) =>
    items.length
      ? items
          .map(
            (item) => `
              <article class="insight">
                <h4>${escapeHtml(compareReportTitle(item.title, isRu))}</h4>
                <p>${escapeHtml(localizeToolDataText(item.detail, isRu))}</p>
              </article>`,
          )
          .join("")
      : `<article class="insight"><p class="muted">${escapeHtml(fallback)}</p></article>`;
  return `
    <div class="finding-side">
      <h3>${escapeHtml(title)}</h3>
      <div class="finding-list">
        <strong>${isRu ? "Сильные стороны" : "Strengths"}</strong>
        ${render(strengths, isRu ? "Явные сильные стороны не выделены." : "No clear strengths were highlighted.").replaceAll('class="insight"', 'class="insight good"')}
        <strong>${isRu ? "Слабые стороны" : "Weaknesses"}</strong>
        ${render(weaknesses, isRu ? "Явные слабые стороны не выделены." : "No clear weaknesses were highlighted.").replaceAll('class="insight"', 'class="insight warn"')}
      </div>
    </div>`;
}

function renderArticleCompareToolCardHtml(
  fact: RuntimeAuditReport["confirmedFacts"][number],
  isRu: boolean,
): string {
  const title = compareReportTitle(fact.title, isRu);
  return `
    <article class="tool-card">
      <div class="tool-card-head">
        <span class="tool-icon">≡</span>
        <div>
          <h3>${escapeHtml(title)}</h3>
          <small>${isRu ? "Проверка текста ToraSEO." : "ToraSEO text check."}</small>
        </div>
        <span class="done-pill">${isRu ? "Готово" : "Done"}</span>
      </div>
      <div class="tool-note-block">
        <h4>${isRu ? "Что найдено" : "Findings"}</h4>
        <p>${escapeHtml(localizeToolDataText(fact.detail, isRu))}</p>
      </div>
      <div class="tool-note-block">
        <h4>${isRu ? "Источник" : "Source"}</h4>
        <p>${escapeHtml(fact.sourceToolIds.join(", "))}</p>
      </div>
    </article>`;
}

function compareReportTitle(title: string, isRu: boolean): string {
  const normalized = title.trim().toLowerCase();
  const ruMap: Record<string, string> = {
    "intent gap": "Сравнение интента",
    "content gap": "Разрывы по содержанию",
    "semantic gap": "Смысловое покрытие",
    "specificity gap": "Сравнение конкретики",
    "trust gap": "Сравнение доверия",
    "similarity risk": "Риск похожести",
    "title / ctr": "Заголовок и клик",
    "platform fit": "Сравнение под платформу",
    "improvement plan": "Что улучшить дальше",
    "text advantage": "Текстовое преимущество",
    "confirmed facts": "Подтвержденные факты",
  };
  const enMap: Record<string, string> = {
    "сравнение интента": "Intent comparison",
    "разрывы по содержанию": "Content gaps",
    "смысловое покрытие": "Semantic coverage",
    "сравнение конкретики": "Specificity comparison",
    "сравнение доверия": "Trust comparison",
    "риск похожести": "Similarity risk",
    "заголовок и клик": "Title and click",
    "сравнение под платформу": "Platform fit comparison",
    "что улучшить дальше": "Improvement plan",
    "текстовое преимущество": "Text advantage",
    "подтвержденные факты": "Confirmed facts",
    "подтверждённые факты": "Confirmed facts",
  };
  return (isRu ? ruMap[normalized] : enMap[normalized]) ?? title;
}

function compareGapSideLabel(
  side: NonNullable<RuntimeAuditReport["articleCompare"]>["gaps"][number]["side"],
  isRu: boolean,
): string {
  if (side === "missing_in_a") return isRu ? "Нет в A" : "Missing in A";
  if (side === "missing_in_b") return isRu ? "Нет в B" : "Missing in B";
  if (side === "missing_in_both") return isRu ? "Нет в обоих" : "Missing in both";
  return isRu ? "Есть в обоих" : "Present in both";
}

function renderProcessingHtml(): string {
  return `<!doctype html>
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>ToraSEO Processing</title>
      <style>
        :root {
          color-scheme: light;
          --bg: #fff7f0;
          --surface: #ffffff;
          --border: #efd9ca;
          --text: #1a0f08;
          --muted: #70554a;
          --accent: #ff6b35;
        }
        * { box-sizing: border-box; }
        body {
          margin: 0;
          min-height: 100vh;
          display: grid;
          place-items: center;
          padding: 32px;
          font-family: Inter, "Segoe UI", system-ui, sans-serif;
          color: var(--text);
          background: var(--bg);
        }
        .panel {
          width: min(720px, 100%);
          border: 1px solid var(--border);
          border-radius: 16px;
          background: var(--surface);
          padding: 32px;
          box-shadow: 0 18px 60px rgba(83, 45, 23, 0.12);
        }
        .pulse {
          height: 8px;
          overflow: hidden;
          border-radius: 999px;
          background: #f3dfd2;
        }
        .pulse::before {
          content: "";
          display: block;
          height: 100%;
          width: 38%;
          border-radius: inherit;
          background: linear-gradient(90deg, transparent, var(--accent), transparent);
          animation: move 1.65s ease-in-out infinite;
        }
        h1 { margin: 18px 0 8px; font-size: 28px; }
        p { margin: 0; color: var(--muted); line-height: 1.6; }
        @keyframes move {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(270%); }
        }
        ${viewportSizeOverlayStyle()}
      </style>
    </head>
    <body>
      <main class="panel">
        <div class="pulse" aria-hidden="true"></div>
        <h1>Processing the new analysis</h1>
        <p>The previous report is hidden while ToraSEO prepares the refreshed result.</p>
      </main>
      ${viewportSizeOverlayMarkup()}
    </body>
  </html>`;
}

function renderEndedHtml(locale: SupportedLocale): string {
  const isRu = locale === "ru";
  const title = isRu ? "Анализ завершён" : "Analysis ended";
  const detail = isRu
    ? "Вы вышли из текущего анализа. Запустите новый анализ в главном окне ToraSEO, чтобы обновить это окно."
    : "Start a new analysis in the main ToraSEO window to refresh this details view.";
  return `<!doctype html>
  <html lang="${locale}">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>ToraSEO Details</title>
      <style>
        :root {
          color-scheme: light;
          --bg: #fff7f0;
          --surface: #ffffff;
          --border: #efd9ca;
          --text: #1a0f08;
          --muted: #70554a;
        }
        * { box-sizing: border-box; }
        body {
          margin: 0;
          min-height: 100vh;
          display: grid;
          place-items: center;
          padding: 32px;
          font-family: Inter, "Segoe UI", system-ui, sans-serif;
          color: var(--text);
          background: var(--bg);
        }
        main {
          width: min(560px, 100%);
          border: 1px solid var(--border);
          border-radius: 12px;
          background: var(--surface);
          padding: 28px;
          text-align: center;
        }
        h1 {
          margin: 0;
          font-size: 24px;
        }
        p {
          margin: 12px 0 0;
          color: var(--muted);
          line-height: 1.6;
        }
        ${viewportSizeOverlayStyle()}
      </style>
    </head>
    <body>
      <main>
        <h1>${escapeHtml(title)}</h1>
        <p>${escapeHtml(detail)}</p>
      </main>
      ${viewportSizeOverlayMarkup()}
    </body>
  </html>`;
}

function renderReportMarkdown(report: RuntimeAuditReport): string {
  if (report.articleCompare) {
    const isRu =
      report.locale === "ru" ||
      (report.locale !== "en" &&
        /[А-Яа-яЁё]/.test(`${report.summary} ${report.nextStep}`));
    const compare = report.articleCompare;
    const metrics = compare.metrics
      .map(
        (metric) =>
          `- ${metric.label}: A ${metric.textA ?? "—"}${metric.textA !== null ? metric.suffix : ""} / B ${metric.textB ?? "—"}${metric.textB !== null ? metric.suffix : ""}`,
      )
      .join("\n");
    const side = (label: string, items: typeof compare.textA.strengths) =>
      [
        `### ${label}`,
        "",
        items.map((item) => `- ${item.title}: ${item.detail}`).join("\n") ||
          (isRu ? "Явных пунктов нет." : "No clear items."),
      ].join("\n");

    return [
      isRu ? "# ToraSEO: сравнение двух текстов" : "# ToraSEO: two-text comparison",
      "",
      `${isRu ? "Вердикт" : "Verdict"}: ${compare.verdict.label}`,
      "",
      compare.verdict.detail,
      "",
      `${isRu ? "Главный разрыв" : "Main gap"}: ${compare.verdict.mainGap}`,
      "",
      `${isRu ? "Риск похожести" : "Similarity risk"}: ${copyRiskLabelForReport(compare.similarity.copyRisk, isRu)}`,
      "",
      `${isRu ? "Дословные совпадения" : "Exact overlap"}: ${compare.similarity.exactOverlap ?? "—"}%`,
      "",
      analysisVersionLine(isRu, report.analysisVersion),
      "",
      isRu ? "## Метрики" : "## Metrics",
      "",
      metrics,
      "",
      isRu ? "## Сильные стороны" : "## Strengths",
      "",
      side(isRu ? "Текст A" : "Text A", compare.textA.strengths),
      "",
      side(isRu ? "Текст B" : "Text B", compare.textB.strengths),
      "",
      isRu ? "## Слабые стороны" : "## Weaknesses",
      "",
      side(isRu ? "Текст A" : "Text A", compare.textA.weaknesses),
      "",
      side(isRu ? "Текст B" : "Text B", compare.textB.weaknesses),
      "",
      isRu ? "## План улучшения" : "## Improvement plan",
      "",
      compare.actionPlan.map((item) => `- ${item.title}: ${item.detail}`).join("\n") ||
        (isRu ? "План появится после выполнения инструментов." : "The plan will appear after the tools finish."),
      "",
      isRu ? "## Ограничения" : "## Limitations",
      "",
      compare.limitations.map((item) => `- ${item}`).join("\n"),
      "",
    ].join("\n");
  }

  if (report.articleText) {
    const isRu = articleReportIsRussian(report);
    const localized = (value: string) => localizeToolDataText(value, isRu);
    const article = report.articleText;
    const metrics = article.metrics
      .map(
        (metric) =>
          `- ${localized(metric.label)}: ${
            metric.value === null ? "pending" : `${metric.value}${metric.suffix}`
          }`,
      )
      .join("\n");
    const dimensions = article.dimensions
      .map(
        (dimension) =>
          [
            `### ${localized(dimension.label)}`,
            "",
            `Status: ${dimension.status}`,
            "",
            localized(dimension.detail),
            "",
            `Recommendation: ${localized(dimension.recommendation)}`,
          ].join("\n"),
      )
      .join("\n\n");
    const priorities = article.priorities
      .map(
        (item) =>
          [
            `### ${localized(item.title)}`,
            "",
            `Priority: ${priorityLabel(item.priority)}`,
            "",
            localized(item.detail),
            "",
            `Sources: ${item.sourceToolIds.join(", ")}`,
          ].join("\n"),
      )
      .join("\n\n");
    const annotationRows = article.annotations
      .map((annotation) =>
        [
          `### ${annotation.id}. ${localized(annotation.title?.trim() || annotation.label)}`,
          "",
          `Type: ${annotation.kind}`,
          "",
          annotation.severity ? `Severity: ${annotation.severity}` : "",
          annotation.marker ? `Marker: ${annotation.marker}` : "",
          annotation.paragraphId ? `Paragraph: ${annotation.paragraphId}` : "",
          annotation.sourceToolIds.length
            ? `Sources: ${annotation.sourceToolIds.join(", ")}`
            : "",
          annotation.quote?.trim()
            ? `Quote: "${localized(annotation.quote.trim())}"`
            : "",
          "",
          localized(annotation.shortMessage?.trim() || annotation.detail),
        ]
          .filter((line) => line !== "")
          .join("\n"),
      )
      .join("\n\n");
    const annotationByParagraph = new Map<string, typeof article.annotations>();
    for (const annotation of article.annotations) {
      const id = annotation.paragraphId;
      if (!id) continue;
      annotationByParagraph.set(id, [
        ...(annotationByParagraph.get(id) ?? []),
        annotation,
      ]);
    }
    const annotatedParagraphs = articleParagraphEntries(article.document.text)
      .map((paragraph) => {
        const annotations = annotationByParagraph.get(paragraph.id) ?? [];
        if (annotations.length === 0) return "";
        return [
          `### ${paragraph.id}`,
          "",
          paragraph.text,
          "",
          annotations
            .map((annotation) => {
              const quote = annotation.quote?.trim()
                ? ` Quote: "${localized(annotation.quote.trim())}".`
                : "";
              return `- [${annotation.id}] ${annotation.kind}${annotation.severity ? `/${annotation.severity}` : ""}: ${localized(annotation.shortMessage?.trim() || annotation.detail)}${quote}`;
            })
            .join("\n"),
        ].join("\n");
      })
      .filter(Boolean)
      .join("\n\n");
    const intentForecast = article.intentForecast
      ? [
          "## Intent forecast and SEO package",
          "",
          `Intent: ${localized(article.intentForecast.intentLabel)}`,
          "",
          `Hook score: ${article.intentForecast.hookScore ?? "pending"}`,
          "",
          `CTR potential: ${article.intentForecast.ctrPotential ?? "pending"}`,
          "",
          `Trend potential: ${article.intentForecast.trendPotential ?? "pending"}`,
          "",
          `Demand source: ${localized(article.intentForecast.internetDemandSource)}`,
          "",
          "### CMS package",
          "",
          `SEO title: ${localized(article.intentForecast.seoPackage.seoTitle)}`,
          "",
          `Meta description: ${localized(article.intentForecast.seoPackage.metaDescription)}`,
          "",
          `Primary keyword: ${localized(article.intentForecast.seoPackage.primaryKeyword)}`,
          "",
          `Keywords: ${localized(article.intentForecast.seoPackage.keywords.join(", "))}`,
          "",
          `Category: ${localized(article.intentForecast.seoPackage.category)}`,
          "",
          `Tags: ${localized(article.intentForecast.seoPackage.tags.join(", "))}`,
          "",
          `Slug: ${localizeSeoSlugForReport(toLatinSlug(article.intentForecast.seoPackage.slug || article.intentForecast.seoPackage.seoTitle || article.intentForecast.seoPackage.keywords.join(" ")), isRu)}`,
          "",
          "### Hook ideas",
          "",
          article.intentForecast.hookIdeas.map((item) => `- ${localized(item)}`).join("\n"),
          "",
        ].join("\n")
      : "";

    return [
      "# ToraSEO Article Analytics",
      "",
      `Verdict: ${localized(article.verdictLabel)}`,
      "",
      localized(article.verdictDetail),
      "",
      analysisVersionLine(false, report.analysisVersion),
      "",
      formatReportDuration(report.durationMs)
        ? `Report formed in: ${formatReportDuration(report.durationMs)}`
        : "",
      "",
      `Evidence coverage: ${article.coverage.percent}% (${article.coverage.completed}/${article.coverage.total} tools)`,
      "",
      `Warnings: ${article.warningCount}`,
      "",
      "## Metrics",
      "",
      metrics,
      "",
      "## Dimension breakdown",
      "",
      dimensions,
      "",
      "## Priority fixes",
      "",
      priorities,
      "",
      "## Strengths",
      "",
      article.strengths.map((item) => `- ${item.title}: ${item.detail}`).join("\n") ||
        "No strengths recorded yet.",
      "",
      "## Weaknesses",
      "",
      article.weaknesses.map((item) => `- ${item.title}: ${item.detail}`).join("\n") ||
        "No weaknesses recorded yet.",
      "",
      "## How the article looks in the details window",
      "",
      "This is the text representation of the details-window article view. It includes only annotated paragraphs to avoid duplicating the full source text.",
      "",
      annotatedParagraphs || "No paragraph-level annotations were recorded.",
      "",
      "## Notes and recommendations shown in the details window",
      "",
      annotationRows || "No notes or recommendations were recorded.",
      "",
      intentForecast,
      "",
      "## Next actions",
      "",
      article.nextActions.map((action) => `- ${action}`).join("\n"),
      "",
    ].join("\n");
  }

  const facts = report.confirmedFacts
    .map(
      (fact) =>
        [
          `### ${fact.title}`,
          "",
          `Priority: ${priorityLabel(fact.priority)}`,
          "",
          fact.detail,
          "",
          `Sources: ${fact.sourceToolIds.join(", ")}`,
        ].join("\n"),
    )
    .join("\n\n");

  const hypotheses = report.expertHypotheses.length
    ? report.expertHypotheses
        .map(
          (item) =>
            [
              `### ${item.title}`,
              "",
              `Priority: ${priorityLabel(item.priority)}`,
              "",
              item.detail,
              "",
              `Expected impact: ${item.expectedImpact}`,
              "",
              `Validation: ${item.validationMethod}`,
            ].join("\n"),
        )
        .join("\n\n")
    : "No expert hypotheses for this report.";

  return [
    "# ToraSEO Audit Report",
    "",
    report.summary,
    "",
    `Provider: ${report.providerId}`,
    `Model: ${report.model}`,
    `Mode: ${report.mode}`,
    analysisVersionLine(false, report.analysisVersion),
    `Generated: ${report.generatedAt}`,
    formatReportDuration(report.durationMs)
      ? `Report formed in: ${formatReportDuration(report.durationMs)}`
      : "",
    "",
    "## Confirmed facts",
    "",
    facts,
    "",
    "## Expert hypotheses",
    "",
    hypotheses,
    "",
    "## Recommended next step",
    "",
    report.nextStep,
    "",
  ].join("\n");
}

function renderPresentationHtml(report: RuntimeAuditReport): string {
  const factSlides = report.confirmedFacts
    .map(
      (fact) => `
        <section class="slide">
          <p class="eyebrow">Confirmed fact</p>
          <h2>${escapeHtml(fact.title)}</h2>
          <p>${escapeHtml(fact.detail)}</p>
          <span class="pill">${priorityLabel(fact.priority)}</span>
        </section>`,
    )
    .join("");

  const hypothesisSlides = report.expertHypotheses
    .map(
      (item) => `
        <section class="slide">
          <p class="eyebrow">Expert hypothesis</p>
          <h2>${escapeHtml(item.title)}</h2>
          <p>${escapeHtml(item.detail)}</p>
          <p class="meta">Expected impact: ${escapeHtml(item.expectedImpact)}</p>
          <p class="meta">Validation: ${escapeHtml(item.validationMethod)}</p>
        </section>`,
    )
    .join("");

  return `<!doctype html>
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>ToraSEO Presentation</title>
      <style>
        :root {
          --bg: #fff7f0;
          --surface: #ffffff;
          --border: #efd9ca;
          --text: #1a0f08;
          --muted: #70554a;
          --accent: #ff6b35;
        }
        * { box-sizing: border-box; }
        body {
          margin: 0;
          padding: 32px;
          font-family: Inter, "Segoe UI", system-ui, sans-serif;
          background: var(--bg);
          color: var(--text);
        }
        .deck {
          display: grid;
          gap: 24px;
        }
        .slide {
          min-height: 520px;
          border: 1px solid var(--border);
          border-radius: 16px;
          background: var(--surface);
          padding: 48px;
          display: flex;
          flex-direction: column;
          justify-content: center;
          page-break-after: always;
        }
        h1, h2 {
          margin: 0;
          max-width: 860px;
        }
        h1 { font-size: 48px; line-height: 1.05; }
        h2 { font-size: 34px; line-height: 1.15; }
        p {
          max-width: 860px;
          margin: 18px 0 0;
          font-size: 18px;
          line-height: 1.6;
        }
        .eyebrow {
          margin: 0 0 12px;
          color: var(--accent);
          font-size: 13px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: .08em;
        }
        .meta { color: var(--muted); font-size: 15px; }
        .pill {
          width: fit-content;
          margin-top: 24px;
          border: 1px solid var(--border);
          border-radius: 999px;
          padding: 8px 12px;
          color: var(--accent);
          font-weight: 700;
        }
      </style>
    </head>
    <body>
      <main class="deck">
        <section class="slide">
          <p class="eyebrow">ToraSEO audit</p>
          <h1>${escapeHtml(report.summary)}</h1>
          <p>${escapeHtml(report.nextStep)}</p>
        </section>
        ${factSlides}
        ${hypothesisSlides}
      </main>
    </body>
  </html>`;
}

async function ensureReportWindow(report: RuntimeAuditReport): Promise<BrowserWindow> {
  const navigationToken = ++reportWindowNavigationToken;
  reportWindowViewState = "report";
  const displays = screen.getAllDisplays();
  const externalDisplay = displays.length > 1 ? displays[1] : null;

  if (!reportWindow || reportWindow.isDestroyed()) {
    reportWindow = new BrowserWindow({
      width: 1200,
      height: 900,
      show: false,
      backgroundColor: "#FFF7F0",
      title: "ToraSEO Details",
      autoHideMenuBar: true,
      x: externalDisplay ? externalDisplay.bounds.x + 40 : undefined,
      y: externalDisplay ? externalDisplay.bounds.y + 40 : undefined,
      webPreferences: {
        sandbox: true,
        contextIsolation: true,
      },
    });
    reportWindow.on("closed", () => {
      reportWindow = null;
      reportWindowViewState = "closed";
      reportWindowExportReport = null;
    });
    reportWindow.webContents.on("will-navigate", (event, url) => {
      if (url !== "toraseo://export-report-pdf") return;
      event.preventDefault();
      void exportReportFromReportWindow();
    });
    reportWindow.webContents.setWindowOpenHandler(({ url }) => {
      if (url !== "toraseo://export-report-pdf") return { action: "deny" };
      void exportReportFromReportWindow();
      return { action: "deny" };
    });
  }

  const hydratedReport = await hydrateArticleTextReport(report);
  reportWindowExportReport = hydratedReport;
  if (navigationToken !== reportWindowNavigationToken) return reportWindow;
  const html = renderReportHtml(hydratedReport);
  await loadReportWindowHtml(reportWindow, html);
  if (
    navigationToken !== reportWindowNavigationToken &&
    reportWindowViewState === "ended" &&
    !reportWindow.isDestroyed()
  ) {
    const locale = await getCurrentLocale();
    await loadReportWindowHtml(reportWindow, renderEndedHtml(locale));
    return reportWindow;
  }
  if (!reportWindow.isVisible()) {
    reportWindow.show();
  }
  reportWindow.focus();
  return reportWindow;
}

export async function openReportWindow(
  report: RuntimeAuditReport,
): Promise<{ ok: boolean }> {
  await ensureReportWindow(report);
  return { ok: true };
}

export async function closeReportWindow(): Promise<{ ok: boolean }> {
  reportWindowNavigationToken += 1;
  reportWindowViewState = "closed";
  reportWindowExportReport = null;
  if (reportWindow && !reportWindow.isDestroyed()) {
    reportWindow.close();
    reportWindow = null;
  }
  return { ok: true };
}

export async function showReportWindowProcessing(): Promise<{ ok: boolean }> {
  reportWindowNavigationToken += 1;
  reportWindowViewState = "processing";
  if (reportWindow && !reportWindow.isDestroyed()) {
    await loadReportWindowHtml(reportWindow, renderProcessingHtml());
    if (!reportWindow.isVisible()) {
      reportWindow.show();
    }
  }
  return { ok: true };
}

export async function endReportWindowSession(): Promise<{ ok: boolean }> {
  reportWindowNavigationToken += 1;
  reportWindowViewState = "ended";
  if (reportWindow && !reportWindow.isDestroyed()) {
    const locale = await getCurrentLocale();
    await loadReportWindowHtml(reportWindow, renderEndedHtml(locale));
    if (!reportWindow.isVisible()) {
      reportWindow.show();
    }
  }
  return { ok: true };
}

export async function exportReportPdf(
  report: RuntimeAuditReport,
): Promise<{ ok: boolean; filePath?: string; error?: string }> {
  const tempWindow = new BrowserWindow({
    width: 1280,
    height: 920,
    show: false,
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
    },
  });
  let tempHtmlPath: string | null = null;

  try {
    const hydratedReport = await hydrateArticleTextReport(report);
    const html = renderReportHtml(hydratedReport);
    tempHtmlPath = path.join(
      app.getPath("temp"),
      `toraseo-report-${process.pid}-${Date.now()}.html`,
    );
    await fs.writeFile(tempHtmlPath, html, "utf8");
    await tempWindow.loadFile(tempHtmlPath);
    await tempWindow.webContents.executeJavaScript(
      "document.fonts ? document.fonts.ready.then(() => true) : true",
      true,
    );
    await tempWindow.webContents.executeJavaScript(
      "new Promise((resolve) => window.setTimeout(resolve, 950))",
      true,
    );
    await tempWindow.webContents.executeJavaScript(PDF_EXPORT_PREPARE_SCRIPT, true);
    const isLandscapeReport = report.analysisType === "site_compare" || Boolean(report.siteCompare);
    const pdf = await tempWindow.webContents.printToPDF({
      printBackground: true,
      pageSize: isLandscapeReport
        ? { width: 11.69, height: 8.27 }
        : { width: 8.27, height: 11.69 },
      margins: { marginType: "none" },
      scale: isLandscapeReport ? 0.82 : 0.88,
    });
    if (pdf.byteLength === 0) {
      throw new Error("Generated PDF is empty.");
    }

    const defaultPath = defaultExportPath("pdf");
    const parentWindow =
      BrowserWindow.getFocusedWindow() ??
      (reportWindow && !reportWindow.isDestroyed() ? reportWindow : undefined);
    const saveResult = parentWindow
      ? await dialog.showSaveDialog(parentWindow, {
          title: "Export ToraSEO report to PDF",
          defaultPath,
          filters: [{ name: "PDF", extensions: ["pdf"] }],
        })
      : await dialog.showSaveDialog({
          title: "Export ToraSEO report to PDF",
          defaultPath,
          filters: [{ name: "PDF", extensions: ["pdf"] }],
        });
    if (saveResult.canceled || !saveResult.filePath) {
      return { ok: false, error: "cancelled" };
    }

    const filePath = normalizePdfPath(saveResult.filePath);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, Buffer.from(pdf));
    const saved = await fs.stat(filePath);
    if (saved.size === 0) {
      throw new Error("Saved PDF is empty.");
    }
    return { ok: true, filePath };
  } catch (error) {
    log.error(
      `[runtime:reporting] PDF export failed: ${
        error instanceof Error ? error.stack ?? error.message : String(error)
      }`,
    );
    return {
      ok: false,
      error:
        error instanceof Error ? error.message : "Failed to export report PDF.",
    };
  } finally {
    if (!tempWindow.isDestroyed()) {
      tempWindow.close();
    }
    if (tempHtmlPath) {
      await fs.unlink(tempHtmlPath).catch(() => undefined);
    }
  }
}

export async function copyArticleSourceText(
  report: RuntimeAuditReport,
): Promise<{ ok: boolean; charCount?: number; error?: string }> {
  try {
    const text = stripMediaPlaceholderLines(await articleSourceTextFromReport(report));
    if (!text) {
      return {
        ok: false,
        error: "No article source text is available for copying.",
      };
    }
    clipboard.writeText(text);
    return { ok: true, charCount: text.length };
  } catch (error) {
    log.error(
      `[runtime:reporting] Copy article source failed: ${
        error instanceof Error ? error.stack ?? error.message : String(error)
      }`,
    );
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to copy article source text.",
    };
  }
}

function buildReportForAiPrompt(report: RuntimeAuditReport): string {
  return [
    "ToraSEO visual report package for AI review.",
    "Treat this package as the current visible ToraSEO report. When answering the user, distinguish between source text edits, visual report interpretation, and manual UI actions.",
    "Do not claim you changed the app UI or source article unless the user explicitly asked for a rewrite and you produced new text.",
    "",
    renderReportMarkdown(report),
  ].join("\n");
}

export async function prepareReportForAi(
  report: RuntimeAuditReport,
): Promise<{ ok: boolean; text?: string; error?: string }> {
  try {
    const hydratedReport = await hydrateArticleTextReport(report);
    const text = buildReportForAiPrompt(hydratedReport).trim();
    if (!text) {
      return {
        ok: false,
        error: "No report content is available for AI review.",
      };
    }
    return { ok: true, text };
  } catch (error) {
    log.error(
      `[runtime:reporting] Prepare report for AI failed: ${
        error instanceof Error ? error.stack ?? error.message : String(error)
      }`,
    );
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to prepare the report for AI.",
    };
  }
}

export async function copyReportForAi(
  report: RuntimeAuditReport,
): Promise<{ ok: boolean; charCount?: number; error?: string }> {
  const result = await prepareReportForAi(report);
  if (!result.ok || !result.text) {
    return { ok: false, error: result.error };
  }
  clipboard.writeText(result.text);
  return { ok: true, charCount: result.text.length };
}

export async function exportReportDocument(
  report: RuntimeAuditReport,
): Promise<{ ok: boolean; filePath?: string; error?: string }> {
  const defaultPath = defaultExportPath("md");
  const saveResult = await dialog.showSaveDialog({
    title: "Export ToraSEO report as document",
    defaultPath,
    filters: [{ name: "Markdown document", extensions: ["md"] }],
  });
  if (saveResult.canceled || !saveResult.filePath) {
    return { ok: false, error: "cancelled" };
  }

  try {
    const hydratedReport = await hydrateArticleTextReport(report);
    await fs.writeFile(
      saveResult.filePath,
      renderReportMarkdown(hydratedReport),
      "utf8",
    );
    return { ok: true, filePath: saveResult.filePath };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to export report document.",
    };
  }
}

export async function exportReportPresentation(
  report: RuntimeAuditReport,
): Promise<{ ok: boolean; filePath?: string; error?: string }> {
  const defaultPath = defaultExportPath("html");
  const saveResult = await dialog.showSaveDialog({
    title: "Export ToraSEO report as presentation",
    defaultPath,
    filters: [{ name: "HTML presentation", extensions: ["html"] }],
  });
  if (saveResult.canceled || !saveResult.filePath) {
    return { ok: false, error: "cancelled" };
  }

  try {
    const hydratedReport = await hydrateArticleTextReport(report);
    await fs.writeFile(
      saveResult.filePath,
      renderPresentationHtml(hydratedReport),
      "utf8",
    );
    return { ok: true, filePath: saveResult.filePath };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to export report presentation.",
    };
  }
}

export async function exportReportJson(
  report: RuntimeAuditReport,
): Promise<{ ok: boolean; filePath?: string; error?: string }> {
  const hydratedReport = await hydrateArticleTextReport(report);
  const defaultPath = defaultExportPath("json");
  const result = await dialog.showSaveDialog({
    title: "Export ToraSEO report JSON",
    defaultPath,
    filters: [{ name: "JSON", extensions: ["json"] }],
  });
  if (result.canceled || !result.filePath) {
    return { ok: false, error: "cancelled" };
  }

  try {
    await fs.writeFile(
      result.filePath,
      `${JSON.stringify(hydratedReport, null, 2)}\n`,
      "utf8",
    );
    return { ok: true, filePath: result.filePath };
  } catch (error) {
    log.error("[runtime:reporting] JSON export failed", error);
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
