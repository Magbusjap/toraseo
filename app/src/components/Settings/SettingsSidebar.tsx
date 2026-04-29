import { useTranslation } from "react-i18next";
import { ArrowLeft, Globe, Key } from "lucide-react";

export type SettingsTabId = "language" | "providers";

interface SettingsSidebarProps {
  activeTab: SettingsTabId;
  /** Switch tabs inside Settings (guarded by parent if dirty). */
  onTabChange: (tab: SettingsTabId) => void;
  /** Return to home (guarded by parent if dirty). */
  onReturnHome: () => void;
  /**
   * Whether to render the AI providers tab. Hidden in legacy
   * (non-native-runtime) builds so users without the Native
   * Runtime feature flag don't see a tab they cannot use.
   */
  showProvidersTab: boolean;
}

/**
 * Sidebar shown in Settings mode.
 *
 * Layout:
 *   1. "Back to home" button at the top (guarded by parent if the
 *      form is dirty)
 *   2. List of settings tabs underneath; the active tab is
 *      highlighted with the primary brand color
 *
 * Future tabs slot in as additional <TabButton> entries: account,
 * appearance, advanced, etc. For v0.0.6 only "Language settings"
 * exists, but the layout is built to grow.
 *
 * Visual design: dark outline-colored panel matching IdleSidebar
 * and ActiveSidebar — the sidebar background is a brand constant
 * across all app modes. Active tab gets primary/15 background tint
 * and primary text; inactive tabs use white/70 text and white/5
 * hover, all readable against the dark surface.
 */
export default function SettingsSidebar({
  activeTab,
  onTabChange,
  onReturnHome,
  showProvidersTab,
}: SettingsSidebarProps) {
  const { t } = useTranslation();

  return (
    <div className="flex h-full flex-col bg-surface text-white">
      <header className="border-b border-white/10 px-4 py-3">
        <button
          type="button"
          onClick={onReturnHome}
          className="flex items-center gap-2 text-sm text-white/70 transition hover:text-primary"
          title={t("sidebar.backToHomeTitle")}
        >
          <ArrowLeft className="h-4 w-4" strokeWidth={2} />
          <span>{t("settings.backToHome")}</span>
        </button>
      </header>

      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <h3 className="mb-3 px-1 font-mono text-[10px] font-semibold uppercase tracking-[0.15em] text-white/50">
          — {t("sidebar.settingsTabs")} —
        </h3>
        <ul className="space-y-1">
          <li>
            <TabButton
              icon={<Globe size={14} />}
              label={t("settings.tabs.language")}
              active={activeTab === "language"}
              onClick={() => onTabChange("language")}
            />
          </li>
          {showProvidersTab && (
            <li>
              <TabButton
                icon={<Key size={14} />}
                label={t("settings.tabs.providers")}
                active={activeTab === "providers"}
                onClick={() => onTabChange("providers")}
              />
            </li>
          )}
        </ul>
      </nav>
    </div>
  );
}

interface TabButtonProps {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
}

function TabButton({ icon, label, active, onClick }: TabButtonProps) {
  const baseClasses =
    "flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm transition";
  const stateClasses = active
    ? "bg-primary/15 text-primary font-medium"
    : "text-white/70 hover:bg-white/5 hover:text-white";

  return (
    <button
      type="button"
      onClick={onClick}
      className={`${baseClasses} ${stateClasses}`}
    >
      <span className={active ? "text-primary" : "text-white/50"}>
        {icon}
      </span>
      <span>{label}</span>
    </button>
  );
}
