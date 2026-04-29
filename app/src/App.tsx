import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import i18n from "./i18n";

import IdleSidebar from "./components/Sidebar/IdleSidebar";
import ActiveSidebar from "./components/Sidebar/ActiveSidebar";
import ModeSelection from "./components/MainArea/ModeSelection";
import { OnboardingView } from "./components/Onboarding";
import { SettingsView } from "./components/Settings";
import { TopToolbar } from "./components/TopToolbar";
import { UpdateNotification } from "./components/UpdateNotification";
import { NativeLayout } from "./components/NativeLayout";
import { DEFAULT_SELECTED_TOOLS, TOOLS, type ToolId } from "./config/tools";
import { useScan } from "./hooks/useScan";
import { useDetector } from "./hooks/useDetector";
import { useNativeRuntimeFlag } from "./runtime/useNativeRuntimeFlag";
import { useBridgeScan } from "./hooks/useBridgeScan";
import {
  buildBridgeScanFacts,
  buildNativeScanContext,
} from "./runtime/scanContext";

import type { SupportedLocale } from "./types/ipc";
import type {
  AuditExecutionMode,
  RuntimeAuditReport,
} from "./types/runtime";

export type AppMode = "idle" | "site" | "content" | "settings";

export default function App() {
  const { t } = useTranslation();

  const [mode, setMode] = useState<AppMode>("idle");
  const [url, setUrl] = useState("");
  const [selectedTools, setSelectedTools] = useState<Set<ToolId>>(
    () => new Set(DEFAULT_SELECTED_TOOLS),
  );
  const [preflightError, setPreflightError] = useState<string | null>(null);
  const [executionMode, setExecutionMode] =
    useState<AuditExecutionMode>("native");
  const [runtimeReport, setRuntimeReport] = useState<RuntimeAuditReport | null>(
    null,
  );

  const [currentLocale, setCurrentLocale] = useState<SupportedLocale>(
    () => (i18n.resolvedLanguage as SupportedLocale) ?? "en",
  );

  const { stages, scanState, summary, startScan } = useScan();
  const bridge = useBridgeScan();
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
  const { enabled: nativeRuntimeEnabled } = useNativeRuntimeFlag();
  const bridgeStatus = bridge.state?.status;

  useEffect(() => {
    if (!nativeRuntimeEnabled && executionMode === "native") {
      setExecutionMode("bridge");
    }
  }, [executionMode, nativeRuntimeEnabled]);

  useEffect(() => {
    if (executionMode === "native") {
      setPreflightError(null);
    }
    setRuntimeReport(null);
    if (
      executionMode === "native" &&
      (bridgeStatus === "awaiting_handshake" || bridgeStatus === "in_progress")
    ) {
      void bridge.cancelScan();
    }
  }, [bridge.cancelScan, bridgeStatus, executionMode]);

  const isBridgeBlocked =
    executionMode === "bridge" &&
    detectorStatus !== null &&
    !detectorStatus.allGreen;

  const handleModeSelect = (selected: "site" | "content") => {
    if (selected === "content") {
      return;
    }
    setMode(selected);
  };

  const handleReturnHome = () => {
    const bridgeBusy =
      bridge.state?.status === "awaiting_handshake" ||
      bridge.state?.status === "in_progress";
    if (
      (executionMode === "native" && scanState === "scanning") ||
      (executionMode === "bridge" && bridgeBusy)
    ) {
      const confirmed = window.confirm(t("siteAudit.confirmCancelScan"));
      if (!confirmed) return;
      if (executionMode === "bridge") {
        void bridge.cancelScan();
      }
    }
    setMode("idle");
    setUrl("");
    setRuntimeReport(null);
    setPreflightError(null);
  };

  const handleToggleTool = (toolId: ToolId) => {
    setSelectedTools((prev) => {
      const next = new Set(prev);
      if (next.has(toolId)) next.delete(toolId);
      else next.add(toolId);
      return next;
    });
  };

  const handleStartNativeScan = async () => {
    setPreflightError(null);
    setRuntimeReport(null);
    const orderedIds = TOOLS.map((item) => item.id).filter((id) =>
      selectedTools.has(id),
    );
    await startScan(url.trim(), orderedIds);
  };

  const handleRunBridgeScan = async () => {
    setPreflightError(null);
    setRuntimeReport(null);
    const fresh = await checkNow();
    if (!fresh.allGreen) {
      setPreflightError(t("preflight.depsFailed"));
      return;
    }

    if (
      bridge.state?.status === "awaiting_handshake" ||
      bridge.state?.status === "in_progress"
    ) {
      await bridge.cancelScan();
      return;
    }
    if (bridge.state?.status === "error") {
      await bridge.retryHandshake();
      return;
    }

    const orderedIds = TOOLS.map((item) => item.id).filter((id) =>
      selectedTools.has(id),
    );
    await bridge.startScan(url.trim(), orderedIds);
  };

  const handleOpenSettings = () => {
    setMode("settings");
  };

  const handleSaveLocale = async (locale: SupportedLocale): Promise<void> => {
    try {
      await window.toraseo.locale.set(locale);
    } catch (err) {
      console.warn("[locale] persist failed:", err);
    }
    await i18n.changeLanguage(locale);
    setCurrentLocale(locale);
  };

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

  const nativeScanContext = useMemo(
    () => buildNativeScanContext(url, selectedTools, stages, summary),
    [selectedTools, stages, summary, url],
  );
  const bridgeFacts = useMemo(
    () => buildBridgeScanFacts(bridge.state, bridge.stages),
    [bridge.stages, bridge.state],
  );

  const isBusy =
    executionMode === "native"
      ? scanState === "scanning"
      : bridge.state?.status === "awaiting_handshake" ||
        bridge.state?.status === "in_progress";

  const scanButtonLabel =
    executionMode === "native"
      ? scanState === "scanning"
        ? t("sidebar.scanning")
        : scanState === "complete"
          ? t("sidebar.scanAgain")
          : t("sidebar.scan")
      : bridge.state?.status === "awaiting_handshake" ||
          bridge.state?.status === "in_progress"
        ? t("sidebar.cancel", { defaultValue: "Cancel" })
        : bridge.state?.status === "error"
          ? t("sidebar.retry", { defaultValue: "Retry" })
          : bridge.state?.status === "complete"
            ? t("sidebar.scanAgain")
            : t("sidebar.scan");

  const canRun =
    url.trim().length > 0 &&
    selectedTools.size > 0 &&
    (executionMode === "native"
      ? scanState !== "scanning"
      : !isBridgeBlocked || Boolean(bridge.state));

  const scanButtonTooltip =
    executionMode === "bridge" && isBridgeBlocked
      ? t("preflight.depsFailed")
      : undefined;

  const sidebar =
    mode === "idle" ? (
      <IdleSidebar />
    ) : (
      <ActiveSidebar
        url={url}
        onUrlChange={setUrl}
        selectedTools={selectedTools}
        onToggleTool={handleToggleTool}
        executionMode={executionMode}
        onExecutionModeChange={setExecutionMode}
        isBusy={Boolean(isBusy)}
        scanButtonLabel={scanButtonLabel}
        scanButtonTooltip={scanButtonTooltip}
        canRun={canRun}
        onReturnHome={handleReturnHome}
        onRun={
          executionMode === "native" ? handleStartNativeScan : handleRunBridgeScan
        }
      />
    );

  if (mode === "settings") {
    return (
      <div className="flex h-full flex-col bg-orange-50/30">
        <TopToolbar onOpenSettings={handleOpenSettings} />
        <div className="flex flex-1 overflow-hidden">
          <SettingsView
            currentLocale={currentLocale}
            onReturnHome={() => setMode("idle")}
            onSaveLocale={handleSaveLocale}
            nativeRuntimeEnabled={true}
          />
        </div>
        <UpdateNotification />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-orange-50/30">
      <TopToolbar onOpenSettings={handleOpenSettings} />
      <div className="flex flex-1 overflow-hidden">
        <aside className="relative w-[260px] shrink-0">{sidebar}</aside>

        <main className="flex-1 overflow-hidden">
          {mode === "idle" ? (
            <ModeSelection onSelect={handleModeSelect} />
          ) : executionMode === "bridge" && isBridgeBlocked ? (
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
          ) : (
            <NativeLayout
              locale={currentLocale}
              executionMode={executionMode}
              runtimeScanContext={nativeScanContext}
              runtimeReport={runtimeReport}
              onRuntimeReportChange={setRuntimeReport}
              bridgeState={bridge.state}
              bridgePrompt={bridge.prompt}
              bridgeFacts={bridgeFacts}
              localSummary={summary}
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
