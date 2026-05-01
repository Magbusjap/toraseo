import { useTranslation } from "react-i18next";
import { Globe } from "lucide-react";

import type { SupportedLocale } from "../../types/ipc";

interface LanguageTabProps {
  pendingLocale: SupportedLocale;
  onPendingChange: (locale: SupportedLocale) => void;
  disabled?: boolean;
}

export default function LanguageTab({
  pendingLocale,
  onPendingChange,
  disabled = false,
}: LanguageTabProps) {
  const { t } = useTranslation();

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
            disabled={disabled}
            className="w-full rounded-md border border-outline/15 bg-white px-3 py-2 text-sm text-outline-900 transition focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-60"
          >
            <option value="en">{t("settings.language.options.en")}</option>
            <option value="ru">{t("settings.language.options.ru")}</option>
          </select>
        </label>

        <p className="mt-3 text-xs text-outline-900/50">
          {t("settings.language.hint")}
        </p>
      </div>
    </div>
  );
}
