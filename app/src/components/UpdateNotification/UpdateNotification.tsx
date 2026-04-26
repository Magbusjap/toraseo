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
          aria-label="Закрыть уведомление"
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
            Доступно обновление
          </h3>
        </div>
        <p className="mb-3 text-sm text-outline/70">
          ToraSEO {info.version} готова к загрузке.
          {info.releaseNotes && (
            <span className="mt-1 block text-xs text-outline/50">
              {truncate(info.releaseNotes, 120)}
            </span>
          )}
        </p>
        <div className="flex gap-2">
          <button
            onClick={download}
            className="flex-1 rounded-md bg-orange-500 px-3 py-2 text-sm font-medium text-white hover:bg-orange-600"
          >
            Скачать
          </button>
          <button
            onClick={dismiss}
            className="rounded-md border border-outline/20 px-3 py-2 text-sm text-outline/70 hover:bg-orange-50"
          >
            Позже
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
            Загрузка обновления
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
            Обновление готово
          </h3>
        </div>
        <p className="mb-3 text-sm text-outline/70">
          ToraSEO {info.version} скачана. Приложение перезапустится
          для установки.
        </p>
        <div className="flex gap-2">
          <button
            onClick={install}
            className="flex-1 rounded-md bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-700"
          >
            Установить и перезапустить
          </button>
          <button
            onClick={dismiss}
            className="rounded-md border border-outline/20 px-3 py-2 text-sm text-outline/70 hover:bg-orange-50"
          >
            Позже
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
            Ошибка обновления
          </h3>
        </div>
        <p className="mb-3 text-sm text-outline/70">
          {truncate(errorMessage, 200)}
        </p>
        <button
          onClick={dismiss}
          className="w-full rounded-md border border-outline/20 px-3 py-2 text-sm text-outline/70 hover:bg-orange-50"
        >
          Закрыть
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

function formatBytesPerSec(bps: number): string {
  if (bps < 1024) return `${Math.round(bps)} B/s`;
  if (bps < 1024 * 1024) return `${(bps / 1024).toFixed(1)} KB/s`;
  return `${(bps / 1024 / 1024).toFixed(1)} MB/s`;
}
