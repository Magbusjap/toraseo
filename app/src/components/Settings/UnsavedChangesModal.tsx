import { useTranslation } from "react-i18next";
import { AlertCircle, X } from "lucide-react";

interface UnsavedChangesModalProps {
  /** Confirm and discard the pending changes, then perform the navigation. */
  onDiscard: () => void;
  /** Stay on the current view, keep the pending changes. */
  onStay: () => void;
}

/**
 * Guard modal shown when the user tries to leave the Settings view
 * (or switch tabs inside it) while there are unsaved changes.
 *
 * Two outcomes:
 *   - Discard: throw away the local edits and proceed with whatever
 *     navigation the user requested (back to home, switch tab, etc.)
 *   - Stay: dismiss the modal, keep the form dirty
 *
 * Pressing the X or clicking the backdrop is treated as "Stay" —
 * we never silently discard. The destructive option is always an
 * explicit click on the labeled "Discard" button.
 */
export default function UnsavedChangesModal({
  onDiscard,
  onStay,
}: UnsavedChangesModalProps) {
  const { t } = useTranslation();

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
      onClick={onStay}
      role="dialog"
      aria-modal="true"
      aria-labelledby="unsaved-modal-title"
    >
      <div
        className="relative w-[420px] max-w-[90vw] rounded-lg border border-outline/15 bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onStay}
          aria-label={t("common.close")}
          className="absolute right-3 top-3 rounded p-1 text-outline-900/40 hover:bg-orange-50 hover:text-outline-900"
        >
          <X size={16} />
        </button>

        <div className="mb-3 flex items-center gap-2">
          <AlertCircle className="text-orange-500" size={20} />
          <h2
            id="unsaved-modal-title"
            className="font-display text-base font-semibold text-outline-900"
          >
            {t("settings.unsaved.title")}
          </h2>
        </div>

        <p className="mb-4 text-sm text-outline-900/70">
          {t("settings.unsaved.body")}
        </p>

        <div className="flex flex-col gap-2 sm:flex-row-reverse">
          <button
            onClick={onStay}
            className="flex-1 rounded-md bg-orange-500 px-3 py-2 text-sm font-medium text-white transition hover:bg-orange-600"
          >
            {t("settings.unsaved.stay")}
          </button>
          <button
            onClick={onDiscard}
            className="flex-1 rounded-md border border-outline/20 px-3 py-2 text-sm text-outline-900/70 transition hover:bg-orange-50"
          >
            {t("settings.unsaved.discard")}
          </button>
        </div>
      </div>
    </div>
  );
}
