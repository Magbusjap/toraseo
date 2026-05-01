import { useTranslation } from "react-i18next";

interface GeneralTabProps {
  returnHomeShortcutsEnabled: boolean;
  onReturnHomeShortcutsChange: (enabled: boolean) => void;
  disabled?: boolean;
}

export default function GeneralTab({
  returnHomeShortcutsEnabled,
  onReturnHomeShortcutsChange,
  disabled = false,
}: GeneralTabProps) {
  const { t } = useTranslation();

  return (
    <section className="mx-auto max-w-3xl">
      <header>
        <h1 className="font-display text-2xl font-semibold text-outline-900">
          {t("settings.general.title")}
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-outline-900/65">
          {t("settings.general.intro")}
        </p>
      </header>

      <div className="mt-6 rounded-lg border border-outline/10 bg-white p-5">
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={returnHomeShortcutsEnabled}
            onChange={(event) =>
              onReturnHomeShortcutsChange(event.target.checked)
            }
            disabled={disabled}
            className="mt-1 h-4 w-4 rounded border-outline/30 accent-primary"
          />
          <span>
            <span className="block text-sm font-semibold text-outline-900">
              {t("settings.general.returnHomeShortcuts")}
            </span>
            <span className="mt-1 block text-sm leading-relaxed text-outline-900/60">
              {t("settings.general.returnHomeShortcutsHint")}
            </span>
          </span>
        </label>
      </div>
    </section>
  );
}
