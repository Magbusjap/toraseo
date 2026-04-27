import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Globe, Check } from "lucide-react";

import type { SupportedLocale } from "../../types/ipc";

interface LanguageTabProps {
  /**
   * Pending locale value held by the parent — this lets the parent
   * own the dirty-state guard (parent compares pending to the
   * persisted value to decide whether to show the unsaved-changes
   * modal).
   */
  pendingLocale: SupportedLocale;
  /** Notify parent of a selection change. */
  onPendingChange: (locale: SupportedLocale) => void;
  /** Whether the form is currently dirty (parent's calculation). */
  isDirty: boolean;
  /** Save the pending locale. Resolves when persisted + i18n switched. */
  onSave: () => Promise<void>;
}

/**
 * Language settings tab content.
 *
 * Layout: a heading and helper text at the top, a labeled dropdown
 * in the middle, a hint about scope, and a Save button at the bottom
 * that's disabled when the form is clean (nothing to save).
 *
 * The dropdown is a native <select> — accessible by default,
 * keyboard-navigable, and renders the OS-themed combobox on each
 * platform. We don't need a custom component for two options.
 *
 * After Save resolves, we briefly flash a "Saved" check next to
 * the button as feedback. The flash auto-dismisses after 2 seconds.
 */
export default function LanguageTab({
  pendingLocale,
  onPendingChange,
  isDirty,
  onSave,
}: LanguageTabProps) {
  const { t } = useTranslation();
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  // Clear the "just saved" flash whenever the user touches the
  // form again — otherwise the green check would linger over a
  // dirty form and confuse the user.
  useEffect(() => {
    if (isDirty && justSaved) setJustSaved(false);
  }, [isDirty, justSaved]);

  const handleSave = async () => {
    if (saving || !isDirty) return;
    setSaving(true);
    try {
      await onSave();
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-xl">
      <header className="mb-6 flex items-center gap-2">
        <Globe className="text-primary" size={20} />
        <h1 className="font-display text-xl font-semibold text-outline-900">
          {t("settings.language.title")}
        </h1>
      </header>

      <div className="rounded-lg border border-outline/10 bg-white p-5">
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-outline-900/60">
            {t("settings.language.label")}
          </span>
          <select
            value={pendingLocale}
            onChange={(e) =>
              onPendingChange(e.target.value as SupportedLocale)
            }
            disabled={saving}
            className="w-full rounded-md border border-outline/15 bg-white px-3 py-2 text-sm text-outline-900 transition focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-60"
          >
            <option value="en">{t("settings.language.options.en")}</option>
            <option value="ru">{t("settings.language.options.ru")}</option>
          </select>
        </label>

        <p className="mt-3 text-xs text-outline-900/50">
          {t("settings.language.hint")}
        </p>

        <div className="mt-5 flex items-center justify-end gap-3">
          {justSaved && (
            <span
              className="flex items-center gap-1 text-xs text-green-600"
              role="status"
              aria-live="polite"
            >
              <Check size={14} />
              {t("settings.saved")}
            </span>
          )}
          <button
            type="button"
            onClick={handleSave}
            disabled={!isDirty || saving}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-600 disabled:cursor-not-allowed disabled:bg-outline-900/20"
          >
            {t("settings.save")}
          </button>
        </div>
      </div>
    </div>
  );
}
