import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import i18n from "./i18n";

import IdleSidebar from "./components/Sidebar/IdleSidebar";
import ActiveSidebar from "./components/Sidebar/ActiveSidebar";
import ModeSelection from "./components/MainArea/ModeSelection";
import SiteAuditView from "./components/MainArea/SiteAuditView";
import { OnboardingView } from "./components/Onboarding";
import { SettingsView } from "./components/Settings";
import { TopToolbar } from "./components/TopToolbar";
import { UpdateNotification } from "./components/UpdateNotification";
import { NativeLayout } from "./components/NativeLayout";
import { DEFAULT_SELECTED_TOOLS, TOOLS, type ToolId } from "./config/tools";
import { useScan } from "./hooks/useScan";
import { useDetector } from "./hooks/useDetector";
import { useNativeRuntimeFlag } from "./runtime/useNativeRuntimeFlag";

import type { SupportedLocale } from "./types/ipc";

/**
 * App-wide modes. "settings" is a top-level destination reachable
 * from the toolbar, layered on top of the same outer toolbar /
 * onboarding gate as everything else.
 */
export type AppMode = "idle" | "site" | "content" | "settings";

/**
 * Application root.
 *
 * Owns global state:
 *  - mode: which screen is active (idle / site / content / settings)
 *  - url, selectedTools: scan inputs
 *  - currentLocale: the persisted UI language; mirrored here so that
 *    when the user saves a new language in Settings, components below
 *    re-render with the new translations
 *
 * Per-feature state lives in dedicated hooks:
 *  - useScan owns scan progress and IPC subscriptions
 *  - useDetector owns hard-dependency status (Claude/MCP/Skill)
 *
 * Hard dependencies gate: until all three are green, the onboarding
 * screen replaces the main area and the sidebar is swapped for a
 * calm "locked" panel. Toolbar stays visible in both states so the
 * user can reach About / Settings / etc. before scanning unlocks.
 *
 * Pre-flight check: when the user clicks Scan we re-check dependencies
 * synchronously to close the race window between the last polling
 * tick and the click. Failed pre-flight pushes back to onboarding.
 *
 * URL and scan state reset when returning home; selectedTools persist
 * so the user can re-scan with the same picks.
 */
export default function App() {
  const { t } = useTranslation();

  const [mode, setMode] = useState<AppMode>("idle");
  const [url, setUrl] = useState("");
  const [selectedTools, setSelectedTools] = useState<Set<ToolId>>(
    () => new Set(DEFAULT_SELECTED_TOOLS),
  );
  const [preflightError, setPreflightError] = useState<string | null>(null);

  // Mirror i18next's resolved language as React state. initI18n() in
  // main.tsx already resolved the language before render, so this
  // initial value is correct on first paint. We only update it on
  // explicit Save in Settings — language never changes silently.
  const [currentLocale, setCurrentLocale] = useState<SupportedLocale>(
    () => (i18n.resolvedLanguage as SupportedLocale) ?? "en",
  );

  const { stages, scanState, summary, startScan } = useScan();
  const {
    status: detectorStatus,
    checkNow,
    openClaude,
    pickMcpConfig,
    clearManualMcpConfig,
    downloadSkillZip,
    openSkillReleasesPage,
    confirmSkillInstalled,
    clearSkillConfirmation,
  } = useDetector();

  // Native Runtime feature flag (Stage 1). When ON, the right-most
  // branch in this component renders the new 3-column layout
  // instead of the legacy main-area. Default OFF — existing flow
  // is untouched until the user opts in.
  const { enabled: nativeRuntimeEnabled } = useNativeRuntimeFlag();

  // Hard dependencies gate. Until allGreen, the onboarding screen
  // takes over. Settings is exempt: the user can reach Settings from
  // the toolbar even before dependencies are satisfied — this is
  // important because the Settings → Language tab is exactly where
  // they go to switch the UI language to their preferred one before
  // troubleshooting onboarding hints they can't read.
  const isOnboarding =
    mode !== "settings" &&
    detectorStatus !== null &&
    !detectorStatus.allGreen;

  const handleModeSelect = (selected: "site" | "content") => {
    if (selected === "content") {
      // v0.2 — disabled in MVP
      return;
    }
    setMode(selected);
  };

  const handleReturnHome = () => {
    if (scanState === "scanning") {
      const confirmed = window.confirm(t("siteAudit.confirmCancelScan"));
      if (!confirmed) return;
    }
    setMode("idle");
    setUrl("");
    // useScan rewrites stages on the next startScan; visually this
    // is equivalent to a reset.
  };

  const handleToggleTool = (toolId: ToolId) => {
    setSelectedTools((prev) => {
      const next = new Set(prev);
      if (next.has(toolId)) {
        next.delete(toolId);
      } else {
        next.add(toolId);
      }
      return next;
    });
  };

  const handleStartScan = async () => {
    setPreflightError(null);

    const fresh = await checkNow();
    if (!fresh.allGreen) {
      setPreflightError(t("preflight.depsFailed"));
      setMode("idle");
      return;
    }

    const orderedIds = TOOLS.map((t) => t.id).filter((id) =>
      selectedTools.has(id),
    );
    startScan(url.trim(), orderedIds);
  };

  const handleOpenSettings = () => {
    setMode("settings");
  };

  /**
   * Persist the chosen UI locale, then switch i18next at runtime.
   *
   * Order matters: write to disk first (so a crash between i18n
   * change and write doesn't leave the UI showing the new locale
   * but the file holding the old one), then change i18n.
   *
   * If the disk write fails we still apply the in-memory switch
   * so the user gets the visual feedback they expect — the next
   * launch will simply fall back to OS default detection.
   */
  const handleSaveLocale = async (locale: SupportedLocale): Promise<void> => {
    try {
      await window.toraseo.locale.set(locale);
    } catch (err) {
      // Non-fatal: log and continue, the in-memory switch still works.
      console.warn("[locale] persist failed:", err);
    }
    await i18n.changeLanguage(locale);
    setCurrentLocale(locale);
  };

  // Keep currentLocale in sync if i18n changes through any path
  // outside of handleSaveLocale (none today, but defensive against
  // future code adding direct i18n.changeLanguage() calls).
  useEffect(() => {
    const handler = (lng: string) => {
      if (lng === "en" || lng === "ru") {
        setCurrentLocale(lng);
      }
    };
    i18n.on("languageChanged", handler);
    return () => {
      i18n.off("languageChanged", handler);
    };
  }, []);

  // ===================================================================
  // Settings mode — exempt from the onboarding gate
  // ===================================================================
  if (mode === "settings") {
    return (
      <div className="flex h-full flex-col bg-orange-50/30">
        <TopToolbar onOpenSettings={handleOpenSettings} />
        <div className="flex flex-1 overflow-hidden">
          <SettingsView
            currentLocale={currentLocale}
            onReturnHome={() => setMode("idle")}
            onSaveLocale={handleSaveLocale}
          />
        </div>
        <UpdateNotification />
      </div>
    );
  }

  // ===================================================================
  // Onboarding mode — replaces the entire main area until allGreen
  // ===================================================================
  if (isOnboarding) {
    return (
      <div className="flex h-full flex-col bg-orange-50/30">
        <TopToolbar onOpenSettings={handleOpenSettings} />
        <div className="flex flex-1 overflow-hidden">
          <aside className="flex w-[260px] shrink-0 items-center justify-center bg-surface p-6">
            <p
              className="text-center text-sm font-medium leading-relaxed text-white/80"
              dangerouslySetInnerHTML={{
                __html: t("onboarding.lockedSidebar"),
              }}
            />
          </aside>

          <main className="flex-1 overflow-auto">
            <OnboardingView
              status={detectorStatus}
              onOpenClaude={openClaude}
              onPickMcpConfig={pickMcpConfig}
              onClearManualMcpConfig={clearManualMcpConfig}
              onDownloadSkillZip={downloadSkillZip}
              onOpenSkillReleasesPage={openSkillReleasesPage}
              onConfirmSkillInstalled={confirmSkillInstalled}
              onClearSkillConfirmation={clearSkillConfirmation}
            />
          </main>
        </div>

        <UpdateNotification />
      </div>
    );
  }

  // ===================================================================
  // Native Runtime mode (Stage 1) — three-column layout, opt-in
  // via TORASEO_NATIVE_RUNTIME=1. Reuses the existing sidebar so
  // the user keeps URL/tools selection while we swap the right
  // side to chat + analysis panels.
  // ===================================================================
  if (nativeRuntimeEnabled) {
    const sidebar =
      mode === "idle" ? (
        <IdleSidebar />
      ) : (
        <ActiveSidebar
          url={url}
          onUrlChange={setUrl}
          selectedTools={selectedTools}
          onToggleTool={handleToggleTool}
          scanState={scanState}
          onReturnHome={handleReturnHome}
          onStartScan={handleStartScan}
        />
      );

    return (
      <div className="flex h-full flex-col bg-orange-50/30">
        <TopToolbar onOpenSettings={handleOpenSettings} />
        <NativeLayout sidebar={sidebar} locale={currentLocale} />
        {preflightError && (
          <div className="fixed left-1/2 top-16 z-50 -translate-x-1/2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 shadow-lg">
            {preflightError}
          </div>
        )}
        <UpdateNotification />
      </div>
    );
  }

  // ===================================================================
  // Normal mode — all hard dependencies satisfied
  // ===================================================================
  return (
    <div className="flex h-full flex-col bg-orange-50/30">
      <TopToolbar onOpenSettings={handleOpenSettings} />
      <div className="flex flex-1 overflow-hidden">
        <aside className="relative w-[260px] shrink-0">
          {mode === "idle" ? (
            <IdleSidebar />
          ) : (
            <ActiveSidebar
              url={url}
              onUrlChange={setUrl}
              selectedTools={selectedTools}
              onToggleTool={handleToggleTool}
              scanState={scanState}
              onReturnHome={handleReturnHome}
              onStartScan={handleStartScan}
            />
          )}
        </aside>

        <main className="flex-1 overflow-auto">
          {mode === "idle" ? (
            <ModeSelection onSelect={handleModeSelect} />
          ) : (
            <SiteAuditView
              url={url}
              scanState={scanState}
              selectedTools={selectedTools}
              stages={stages}
              summary={summary}
            />
          )}

          {preflightError && (
            <div className="fixed left-1/2 top-16 z-50 -translate-x-1/2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 shadow-lg">
              {preflightError}
            </div>
          )}
        </main>
      </div>

      <UpdateNotification />
    </div>
  );
}
