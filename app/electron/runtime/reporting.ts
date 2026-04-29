import { BrowserWindow, dialog, screen } from "electron";
import path from "node:path";

import type { RuntimeAuditReport } from "../../src/types/runtime.js";

let reportWindow: BrowserWindow | null = null;

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function priorityLabel(value: "high" | "medium" | "low"): string {
  if (value === "high") return "High";
  if (value === "low") return "Low";
  return "Medium";
}

function renderReportHtml(report: RuntimeAuditReport): string {
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
    </body>
  </html>`;
}

async function ensureReportWindow(report: RuntimeAuditReport): Promise<BrowserWindow> {
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
    });
  }

  const html = renderReportHtml(report);
  await reportWindow.loadURL(
    `data:text/html;charset=UTF-8,${encodeURIComponent(html)}`,
  );
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
  if (reportWindow && !reportWindow.isDestroyed()) {
    reportWindow.close();
    reportWindow = null;
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

  try {
    const html = renderReportHtml(report);
    await tempWindow.loadURL(
      `data:text/html;charset=UTF-8,${encodeURIComponent(html)}`,
    );

    const defaultPath = path.join(
      process.env.USERPROFILE ?? process.cwd(),
      "Desktop",
      `toraseo-report-${Date.now()}.pdf`,
    );
    const saveResult = await dialog.showSaveDialog(tempWindow, {
      title: "Export ToraSEO report to PDF",
      defaultPath,
      filters: [{ name: "PDF", extensions: ["pdf"] }],
    });
    if (saveResult.canceled || !saveResult.filePath) {
      return { ok: false, error: "cancelled" };
    }

    const pdf = await tempWindow.webContents.printToPDF({
      printBackground: true,
      pageSize: "A4",
      margins: { top: 20, bottom: 20, left: 16, right: 16 },
    });
    await import("node:fs/promises").then((fs) =>
      fs.writeFile(saveResult.filePath!, pdf),
    );
    return { ok: true, filePath: saveResult.filePath };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error ? error.message : "Failed to export report PDF.",
    };
  } finally {
    if (!tempWindow.isDestroyed()) {
      tempWindow.close();
    }
  }
}
