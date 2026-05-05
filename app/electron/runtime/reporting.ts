import { app, BrowserWindow, clipboard, dialog, screen } from "electron";
import fs from "node:fs/promises";
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

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
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
    document.querySelectorAll(".toggle-wrap, #export-report, #toraseo-viewport-size").forEach((el) => {
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
  if (!isRu) return title;
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
    return detail;
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
    .map((item) => `<li>${escapeHtml(item)}</li>`)
    .join("");
  return `
    <section class="panel forecast-panel">
      <div class="forecast-head">
        <div>
          <p class="eyebrow">${escapeHtml(labels.title)}</p>
          <h3>${escapeHtml(forecast.intentLabel)}</h3>
          <p>${escapeHtml(forecast.internetDemandAvailable ? forecast.internetDemandSource : noInternet)}</p>
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
            <dt>${escapeHtml(labels.seoTitle)}</dt><dd>${escapeHtml(seo.seoTitle || "—")}</dd>
            <dt>${escapeHtml(labels.description)}</dt><dd>${escapeHtml(seo.metaDescription || "—")}</dd>
            <dt>${escapeHtml(labels.keywords)}</dt><dd>${escapeHtml(seo.keywords.join(", ") || "—")}</dd>
            <dt>${escapeHtml(labels.category)}</dt><dd>${escapeHtml(seo.category || "—")}</dd>
            <dt>${escapeHtml(labels.tags)}</dt><dd>${escapeHtml(seo.tags.join(", ") || "—")}</dd>
            <dt>${escapeHtml(labels.slug)}</dt><dd>${escapeHtml(toLatinSlug(seo.slug || seo.seoTitle || seo.keywords.join(" ")) || "—")}</dd>
          </dl>
        </article>
        <article class="forecast-card">
          <h3>${escapeHtml(labels.hooks)}</h3>
          <ul>${hookItems}</ul>
        </article>
      </div>
    </section>`;
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
              `<article><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.detail)}</p></article>`,
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
  if (!isRu) return value;
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
                    <strong>${escapeHtml(title)}</strong>
                    <small>${escapeHtml(priorityToneLabel(item.priority, labels))}</small>
                  </header>
                  <p>${escapeHtml(item.detail)}</p>
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
          <h3>${escapeHtml(metric.label)}</h3>
          <div class="ring" style="background:${scoreRingBackground(value)}"><strong data-count="${value}">0</strong><span>${escapeHtml(metric.suffix)}</span></div>
          <div class="metric-meter"><i class="${metricToneClass(metric.tone)}" style="--value:${value}%"></i></div>
          <p>${escapeHtml(metric.description)}</p>
        </article>`;
    })
    .join("");
  const dimensions = article.dimensions
    .map(
      (dimension) => `
        <article class="dimension-tile ${dimensionStatusClass(dimension.status)}">
          <span>${escapeHtml(dimensionStatusCopy(dimension.status, isRu))}</span>
          <h3>${escapeHtml(dimension.label)}</h3>
          <p>${escapeHtml(dimension.detail)}</p>
          <strong>${escapeHtml(dimension.recommendation)}</strong>
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

function renderReportHtml(report: RuntimeAuditReport): string {
  if (report.articleText) {
    return renderArticleTextReportDashboardHtml(report);
  }

  const facts = report.confirmedFacts
    .map(
      (fact) => `
        <article class="card">
          <header class="card-header">
            <h3>${escapeHtml(fact.title)}</h3>
            <span class="pill">${priorityLabel(fact.priority)}</span>
          </header>
          <p>${escapeHtml(fact.detail)}</p>
          <p class="meta">Sources: ${escapeHtml(fact.sourceToolIds.join(", "))}</p>
        </article>`,
    )
    .join("");

  const hypotheses = report.expertHypotheses.length
    ? report.expertHypotheses
        .map(
          (item) => `
          <article class="card hypothesis">
            <header class="card-header">
              <h3>${escapeHtml(item.title)}</h3>
              <span class="pill">${priorityLabel(item.priority)}</span>
            </header>
            <p>${escapeHtml(item.detail)}</p>
            <p><strong>Expected impact:</strong> ${escapeHtml(item.expectedImpact)}</p>
            <p><strong>Validation:</strong> ${escapeHtml(item.validationMethod)}</p>
          </article>`,
        )
        .join("")
    : `<article class="card empty"><p>No expert hypotheses for this report.</p></article>`;

  return `<!doctype html>
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>ToraSEO Report</title>
      <style>
        :root {
          color-scheme: light;
          --bg: #fff7f0;
          --surface: #ffffff;
          --border: #efd9ca;
          --text: #1a0f08;
          --muted: #70554a;
          --accent: #ff6b35;
          --accent-soft: #fff0e8;
        }
        * { box-sizing: border-box; }
        body {
          margin: 0;
          padding: 32px;
          font-family: Inter, "Segoe UI", system-ui, sans-serif;
          color: var(--text);
          background: var(--bg);
        }
        .shell {
          max-width: 1120px;
          margin: 0 auto;
          display: grid;
          gap: 24px;
        }
        .hero, .section {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 12px;
          padding: 24px;
        }
        .hero h1, .section h2, .card h3 {
          margin: 0;
        }
        .hero p {
          margin: 12px 0 0;
          line-height: 1.6;
        }
        .meta-row {
          margin-top: 16px;
          display: flex;
          gap: 12px;
          flex-wrap: wrap;
        }
        .meta-chip, .pill {
          display: inline-flex;
          align-items: center;
          border-radius: 999px;
          border: 1px solid var(--border);
          background: var(--accent-soft);
          color: var(--text);
          padding: 6px 10px;
          font-size: 12px;
          font-weight: 600;
        }
        .grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 16px;
        }
        .card {
          border: 1px solid var(--border);
          border-radius: 10px;
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
        .next-step {
          border-left: 4px solid var(--accent);
          padding-left: 16px;
        }
        .empty {
          color: var(--muted);
        }
        @media print {
          body { padding: 0; background: white; }
          .hero, .section, .card { break-inside: avoid; }
        }
        ${viewportSizeOverlayStyle()}
      </style>
    </head>
    <body>
      <div class="shell">
        <section class="hero">
          <h1>ToraSEO Audit Report</h1>
          <p>${escapeHtml(report.summary)}</p>
          <div class="meta-row">
            <span class="meta-chip">Provider: ${escapeHtml(report.providerId)}</span>
            <span class="meta-chip">Model: ${escapeHtml(report.model)}</span>
            <span class="meta-chip">Mode: ${escapeHtml(report.mode)}</span>
            <span class="meta-chip">Generated: ${escapeHtml(report.generatedAt)}</span>
          </div>
        </section>

        <section class="section">
          <h2>Confirmed facts</h2>
          <div class="grid">${facts}</div>
        </section>

        <section class="section">
          <h2>Expert hypotheses</h2>
          <div class="grid">${hypotheses}</div>
        </section>

        <section class="section next-step">
          <h2>Recommended next step</h2>
          <p>${escapeHtml(report.nextStep)}</p>
        </section>
      </div>
      ${viewportSizeOverlayMarkup()}
    </body>
  </html>`;
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
  if (report.articleText) {
    const article = report.articleText;
    const metrics = article.metrics
      .map(
        (metric) =>
          `- ${metric.label}: ${
            metric.value === null ? "pending" : `${metric.value}${metric.suffix}`
          }`,
      )
      .join("\n");
    const dimensions = article.dimensions
      .map(
        (dimension) =>
          [
            `### ${dimension.label}`,
            "",
            `Status: ${dimension.status}`,
            "",
            dimension.detail,
            "",
            `Recommendation: ${dimension.recommendation}`,
          ].join("\n"),
      )
      .join("\n\n");
    const priorities = article.priorities
      .map(
        (item) =>
          [
            `### ${item.title}`,
            "",
            `Priority: ${priorityLabel(item.priority)}`,
            "",
            item.detail,
            "",
            `Sources: ${item.sourceToolIds.join(", ")}`,
          ].join("\n"),
      )
      .join("\n\n");
    const intentForecast = article.intentForecast
      ? [
          "## Intent forecast and SEO package",
          "",
          `Intent: ${article.intentForecast.intentLabel}`,
          "",
          `Hook score: ${article.intentForecast.hookScore ?? "pending"}`,
          "",
          `CTR potential: ${article.intentForecast.ctrPotential ?? "pending"}`,
          "",
          `Trend potential: ${article.intentForecast.trendPotential ?? "pending"}`,
          "",
          `Demand source: ${article.intentForecast.internetDemandSource}`,
          "",
          "### CMS package",
          "",
          `SEO title: ${article.intentForecast.seoPackage.seoTitle}`,
          "",
          `Meta description: ${article.intentForecast.seoPackage.metaDescription}`,
          "",
          `Primary keyword: ${article.intentForecast.seoPackage.primaryKeyword}`,
          "",
          `Keywords: ${article.intentForecast.seoPackage.keywords.join(", ")}`,
          "",
          `Category: ${article.intentForecast.seoPackage.category}`,
          "",
          `Tags: ${article.intentForecast.seoPackage.tags.join(", ")}`,
          "",
          `Slug: ${toLatinSlug(article.intentForecast.seoPackage.slug || article.intentForecast.seoPackage.seoTitle || article.intentForecast.seoPackage.keywords.join(" "))}`,
          "",
          "### Hook ideas",
          "",
          article.intentForecast.hookIdeas.map((item) => `- ${item}`).join("\n"),
          "",
        ].join("\n")
      : "";

    return [
      "# ToraSEO Article Analytics",
      "",
      `Verdict: ${article.verdictLabel}`,
      "",
      article.verdictDetail,
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
    `Generated: ${report.generatedAt}`,
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
    const pdf = await tempWindow.webContents.printToPDF({
      printBackground: true,
      pageSize: { width: 8.27, height: 11.69 },
      margins: { marginType: "none" },
      scale: 0.88,
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
  const hydratedReport = await hydrateArticleReport(report);
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
