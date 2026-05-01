import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check } from "lucide-react";

import GeneralTab from "./GeneralTab";
import LanguageTab from "./LanguageTab";
import ProvidersTab, { type ProviderSettingsSaveState } from "./ProvidersTab";
import SettingsSidebar, { type SettingsTabId } from "./SettingsSidebar";
import UnsavedChangesModal from "./UnsavedChangesModal";

import type { SupportedLocale } from "../../types/ipc";

interface SettingsViewProps {
  currentLocale: SupportedLocale;
  initialTab?: SettingsTabId;
  returnHomeShortcutsEnabled: boolean;
  onReturnHomeShortcutsChange: (enabled: boolean) => void;
  onReturnHome: () => void;
  onSaveLocale: (locale: SupportedLocale) => Promise<void>;
  nativeRuntimeEnabled: boolean;
  onProviderSaved?: () => void | Promise<void>;
}

export default function SettingsView({
  currentLocale,
  initialTab = "general",
  returnHomeShortcutsEnabled,
  onReturnHomeShortcutsChange,
  onReturnHome,
  onSaveLocale,
  nativeRuntimeEnabled,
  onProviderSaved,
}: SettingsViewProps) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<SettingsTabId>(initialTab);
  const [pendingLocale, setPendingLocale] =
    useState<SupportedLocale>(currentLocale);
  const [pendingReturnHomeShortcuts, setPendingReturnHomeShortcuts] = useState(
    returnHomeShortcutsEnabled,
  );
  const [pendingNav, setPendingNav] = useState<null | (() => void)>(null);
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [providerSaveState, setProviderSaveState] =
    useState<ProviderSettingsSaveState>({
      dirty: false,
      saving: false,
      save: async () => {},
    });
  const [providersResetToken, setProvidersResetToken] = useState(0);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    setPendingLocale(currentLocale);
  }, [currentLocale]);

  useEffect(() => {
    setPendingReturnHomeShortcuts(returnHomeShortcutsEnabled);
  }, [returnHomeShortcutsEnabled]);

  const isGeneralDirty =
    pendingReturnHomeShortcuts !== returnHomeShortcutsEnabled;
  const isLanguageDirty = pendingLocale !== currentLocale;
  const isDirty = isGeneralDirty || isLanguageDirty || providerSaveState.dirty;

  useEffect(() => {
    if (isDirty && justSaved) setJustSaved(false);
  }, [isDirty, justSaved]);

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
    if (saving || !isDirty) return;
    setSaving(true);
    try {
      if (providerSaveState.dirty) {
        await providerSaveState.save();
      }
      if (isGeneralDirty) {
        onReturnHomeShortcutsChange(pendingReturnHomeShortcuts);
      }
      if (isLanguageDirty) {
        await onSaveLocale(pendingLocale);
      }
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  const handleDiscard = () => {
    setPendingLocale(currentLocale);
    setPendingReturnHomeShortcuts(returnHomeShortcutsEnabled);
    if (providerSaveState.dirty) {
      setProvidersResetToken((value) => value + 1);
      setProviderSaveState({
        dirty: false,
        saving: false,
        save: async () => {},
      });
    }
    const next = pendingNav;
    setPendingNav(null);
    if (next) next();
  };

  const handleStay = () => {
    setPendingNav(null);
  };

  return (
    <div className="flex h-full w-full min-w-0 flex-1">
      <aside className="relative w-[260px] shrink-0">
        <SettingsSidebar
          activeTab={activeTab}
          onTabChange={handleTabChange}
          onReturnHome={handleReturnHome}
          showProvidersTab={nativeRuntimeEnabled}
        />
      </aside>

      <main className="min-w-0 flex-1 overflow-auto px-8 py-8">
        {activeTab === "general" && (
          <>
            <GeneralTab
              returnHomeShortcutsEnabled={pendingReturnHomeShortcuts}
              onReturnHomeShortcutsChange={setPendingReturnHomeShortcuts}
              disabled={saving}
            />
            <SaveCascade
              maxWidthClassName="max-w-3xl"
              justSaved={justSaved}
              saving={saving}
              disabled={!isGeneralDirty}
              onSave={handleSave}
              saveLabel={t("settings.save")}
              savedLabel={t("settings.saved")}
            />
          </>
        )}
        {activeTab === "language" && (
          <>
            <LanguageTab
              pendingLocale={pendingLocale}
              onPendingChange={setPendingLocale}
              disabled={saving}
            />
            <SaveCascade
              maxWidthClassName="max-w-xl"
              justSaved={justSaved}
              saving={saving}
              disabled={!isLanguageDirty}
              onSave={handleSave}
              saveLabel={t("settings.save")}
              savedLabel={t("settings.saved")}
            />
          </>
        )}
        {activeTab === "providers" && nativeRuntimeEnabled && (
          <>
            <ProvidersTab
              resetToken={providersResetToken}
              onProviderSaved={onProviderSaved}
              onSaveStateChange={setProviderSaveState}
            />
            <SaveCascade
              maxWidthClassName="max-w-3xl"
              justSaved={justSaved}
              saving={saving || providerSaveState.saving}
              disabled={!providerSaveState.dirty}
              onSave={handleSave}
              saveLabel={t("settings.save")}
              savedLabel={t("settings.saved")}
            />
          </>
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

function SaveCascade({
  maxWidthClassName,
  justSaved,
  saving,
  disabled,
  onSave,
  saveLabel,
  savedLabel,
}: {
  maxWidthClassName: string;
  justSaved: boolean;
  saving: boolean;
  disabled: boolean;
  onSave: () => void;
  saveLabel: string;
  savedLabel: string;
}) {
  return (
    <div className={`mx-auto mt-4 flex ${maxWidthClassName} items-center justify-end gap-3`}>
      {justSaved && (
        <span
          className="flex items-center gap-1 text-xs text-green-600"
          role="status"
          aria-live="polite"
        >
          <Check size={14} />
          {savedLabel}
        </span>
      )}
      <button
        type="button"
        onClick={onSave}
        disabled={disabled || saving}
        className="rounded-md bg-primary px-5 py-2 text-sm font-medium text-white transition hover:bg-primary-600 disabled:cursor-not-allowed disabled:bg-outline-900/20"
      >
        {saving ? "..." : saveLabel}
      </button>
    </div>
  );
}
