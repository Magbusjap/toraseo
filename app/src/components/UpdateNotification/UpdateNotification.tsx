import { useTranslation } from "react-i18next";
import { Download, RotateCw, X, AlertCircle } from "lucide-react";
import { useUpdater } from "../../hooks/useUpdater";

/**
 * Floating notification card that appears in the bottom-right corner
 * when an update is available, downloading, ready to install, or
 * errored. Hidden when state is "idle".
 *
 * The card is intentionally non-modal: it doesn't block any other
 * interaction with the app. The user can dismiss it (in available /
 * error states) or act on it via the primary button.
 *
 * Both download and install require an explicit click — auto-update
 * has autoDownload=false and autoInstallOnAppQuit=false in
 * electron/updater.ts.
 */
export default function UpdateNotification() {
  const { t } = useTranslation();
  const {
    state,
    info,
    progress,
    errorMessage,
    download,
    install,
    dismiss,
  } = useUpdater();

  if (state === "idle") return null;

  const card = (
    children: React.ReactNode,
    canDismiss: boolean = true,
  ) => (
    <div
      className="fixed bottom-6 right-6 z-50 w-[340px] rounded-lg border border-outline/15 bg-white p-4 shadow-lg"
      role="status"
      aria-live="polite"
    >
      {canDismiss && (
        <button
          onClick={dismiss}
          aria-label={t("updater.dismiss")}
          className="absolute right-2 top-2 rounded p-1 text-outline/50 hover:bg-orange-50 hover:text-outline"
        >
          <X size={16} />
        </button>
      )}
      {children}
    </div>
  );

  if (state === "available" && info) {
    return card(
      <>
        <div className="mb-2 flex items-center gap-2">
          <Download className="text-orange-500" size={20} />
          <h3 className="font-semibold text-outline">
            {t("updater.available.title")}
          </h3>
        </div>
        <p className="mb-3 text-sm text-outline/70">
          {t("updater.available.body", { version: info.version })}
          {info.releaseNotes && (
            <span className="mt-1 block text-xs text-outline/50">
              {truncate(stripHtml(info.releaseNotes), 120)}
            </span>
          )}
        </p>
        <div className="flex gap-2">
          <button
            onClick={download}
            className="flex-1 rounded-md bg-orange-500 px-3 py-2 text-sm font-medium text-white hover:bg-orange-600"
          >
            {t("updater.available.download")}
          </button>
          <button
            onClick={dismiss}
            className="rounded-md border border-outline/20 px-3 py-2 text-sm text-outline/70 hover:bg-orange-50"
          >
            {t("updater.available.later")}
          </button>
        </div>
      </>,
    );
  }

  if (state === "downloading") {
    const percent = progress ? Math.round(progress.percent) : 0;
    const speed = progress
      ? formatBytesPerSec(progress.bytesPerSecond)
      : null;

    return card(
      <>
        <div className="mb-2 flex items-center gap-2">
          <RotateCw className="animate-spin text-orange-500" size={20} />
          <h3 className="font-semibold text-outline">
            {t("updater.downloading.title")}
          </h3>
        </div>
        <div className="mb-2 flex items-baseline justify-between text-sm">
          <span className="text-outline">{percent}%</span>
          {speed && <span className="text-xs text-outline/50">{speed}</span>}
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-orange-100">
          <div
            className="h-full bg-orange-500 transition-all duration-300"
            style={{ width: `${percent}%` }}
          />
        </div>
      </>,
      false, // can't dismiss while downloading
    );
  }

  if (state === "downloaded" && info) {
    return card(
      <>
        <div className="mb-2 flex items-center gap-2">
          <Download className="text-green-600" size={20} />
          <h3 className="font-semibold text-outline">
            {t("updater.downloaded.title")}
          </h3>
        </div>
        <p className="mb-3 text-sm text-outline/70">
          {t("updater.downloaded.body", { version: info.version })}
        </p>
        <div className="flex gap-2">
          <button
            onClick={install}
            className="flex-1 rounded-md bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-700"
          >
            {t("updater.downloaded.install")}
          </button>
          <button
            onClick={dismiss}
            className="rounded-md border border-outline/20 px-3 py-2 text-sm text-outline/70 hover:bg-orange-50"
          >
            {t("updater.downloaded.later")}
          </button>
        </div>
      </>,
    );
  }

  if (state === "error" && errorMessage) {
    return card(
      <>
        <div className="mb-2 flex items-center gap-2">
          <AlertCircle className="text-red-500" size={20} />
          <h3 className="font-semibold text-outline">
            {t("updater.error.title")}
          </h3>
        </div>
        <p className="mb-3 text-sm text-outline/70">
          {truncate(errorMessage, 200)}
        </p>
        <button
          onClick={dismiss}
          className="w-full rounded-md border border-outline/20 px-3 py-2 text-sm text-outline/70 hover:bg-orange-50"
        >
          {t("updater.error.close")}
        </button>
      </>,
    );
  }

  return null;
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max - 1).trimEnd() + "…";
}

/**
 * Strip HTML tags from a release notes string and collapse
 * whitespace into single spaces.
 *
 * GitHub Releases stores notes as Markdown but electron-updater
 * delivers them already rendered to HTML in the `releaseNotes`
 * field — we get strings like `<h2>[App 0.0.4]</h2><p>Quality
 * fixes...</p><br>`. Rendering that as plain text in our card
 * shows the raw tags, which is what users see today.
 *
 * We don't render the HTML — release notes in a 120-char preview
 * don't need formatting, and `dangerouslySetInnerHTML` would open
 * an XSS surface for whatever gets pasted into a GitHub release
 * body. The tradeoff is fine: full notes are a click away on
 * GitHub, the card just teases them.
 *
 * `<br>` and block tags become spaces (otherwise headings glue to
 * the next paragraph: "App 0.0.4Quality fixes"). Then we collapse
 * runs of whitespace.
 */
function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/?(h[1-6]|p|div|li|ul|ol|tr|td|th)[^>]*>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function formatBytesPerSec(bps: number): string {
  if (bps < 1024) return `${Math.round(bps)} B/s`;
  if (bps < 1024 * 1024) return `${(bps / 1024).toFixed(1)} KB/s`;
  return `${(bps / 1024 / 1024).toFixed(1)} MB/s`;
}
