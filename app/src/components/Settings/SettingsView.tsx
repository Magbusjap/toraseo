import { useState } from "react";

import LanguageTab from "./LanguageTab";
import ProvidersTab from "./ProvidersTab";
import SettingsSidebar, { type SettingsTabId } from "./SettingsSidebar";
import UnsavedChangesModal from "./UnsavedChangesModal";

import type { SupportedLocale } from "../../types/ipc";

interface SettingsViewProps {
  /** The persisted (saved) locale — i18n's current language. */
  currentLocale: SupportedLocale;
  /** Notify parent that the user wants to leave Settings. */
  onReturnHome: () => void;
  /**
   * Persist a new locale and switch i18n.
   * Parent owns the "current locale" state; this callback writes
   * to userData/locale.txt via IPC and updates the parent's state.
   */
  onSaveLocale: (locale: SupportedLocale) => Promise<void>;
  /**
   * True when TORASEO_NATIVE_RUNTIME is on. Gates the AI providers
   * settings tab — legacy/bridge users don't need it.
   */
  nativeRuntimeEnabled: boolean;
}

/**
 * Settings view orchestrator.
 *
 * Owns:
 *   - Active tab state (only "language" exists in v0.0.6, but the
 *     shape is forward-compatible for more tabs)
 *   - Pending locale value while the user is editing
 *   - Dirty-state guard: when the user tries to leave (back to home,
 *     switch tabs) with unsaved changes, an UnsavedChangesModal
 *     intercepts and offers Discard / Stay
 *
 * The whole Settings UI renders as `aside (sidebar) + main (tab
 * content)` inside the parent layout. App.tsx wraps this in the
 * same outer toolbar/flex layout used by every other mode.
 *
 * Save flow:
 *   1. User picks a new locale in the dropdown → pendingLocale
 *      diverges from currentLocale → isDirty = true → Save button
 *      enables.
 *   2. User clicks Save → onSaveLocale runs (IPC + i18n.changeLanguage
 *      via the parent) → parent updates currentLocale → pendingLocale
 *      catches up via the synchronization in handlePendingChange.
 *   3. UI flashes "Saved" for 2 seconds (handled inside LanguageTab).
 *
 * Discard flow:
 *   1. User changes the dropdown but doesn't save.
 *   2. User clicks "Back to home" or another tab.
 *   3. We compute isDirty → show UnsavedChangesModal → user picks
 *      Discard → reset pendingLocale to currentLocale → execute the
 *      pending navigation.
 */
export default function SettingsView({
  currentLocale,
  onReturnHome,
  onSaveLocale,
  nativeRuntimeEnabled,
}: SettingsViewProps) {
  const [activeTab, setActiveTab] = useState<SettingsTabId>("language");
  const [pendingLocale, setPendingLocale] =
    useState<SupportedLocale>(currentLocale);

  // The pending navigation parked by the dirty-state guard. When the
  // user clicks "Back to home" or a different tab while dirty, we
  // store the action they wanted to perform and only execute it if
  // they confirm "Discard" in the modal.
  const [pendingNav, setPendingNav] = useState<null | (() => void)>(null);

  const isDirty = pendingLocale !== currentLocale;

  // Try to navigate; if dirty, intercept with the modal.
  const guardedNavigate = (action: () => void) => {
    if (isDirty) {
      setPendingNav(() => action);
    } else {
      action();
    }
  };

  const handleReturnHome = () => guardedNavigate(onReturnHome);

  const handleTabChange = (next: SettingsTabId) => {
    if (next === activeTab) return;
    guardedNavigate(() => setActiveTab(next));
  };

  const handleSave = async () => {
    await onSaveLocale(pendingLocale);
    // Parent updates currentLocale → on next render isDirty becomes
    // false. We don't need to touch pendingLocale: it already equals
    // the new currentLocale.
  };

  const handleDiscard = () => {
    // Reset the form, then run the parked navigation.
    setPendingLocale(currentLocale);
    const next = pendingNav;
    setPendingNav(null);
    if (next) next();
  };

  const handleStay = () => {
    setPendingNav(null);
  };

  return (
    <div className="flex h-full">
      <aside className="relative w-[260px] shrink-0">
        <SettingsSidebar
          activeTab={activeTab}
          onTabChange={handleTabChange}
          onReturnHome={handleReturnHome}
          showProvidersTab={nativeRuntimeEnabled}
        />
      </aside>

      <main className="flex-1 overflow-auto px-8 py-8">
        {activeTab === "language" && (
          <LanguageTab
            pendingLocale={pendingLocale}
            onPendingChange={setPendingLocale}
            isDirty={isDirty}
            onSave={handleSave}
          />
        )}
        {activeTab === "providers" && nativeRuntimeEnabled && (
          <ProvidersTab />
        )}
      </main>

      {pendingNav && (
        <UnsavedChangesModal
          onDiscard={handleDiscard}
          onStay={handleStay}
        />
      )}
    </div>
  );
}
