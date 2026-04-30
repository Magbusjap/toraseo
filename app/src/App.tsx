import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Clipboard, X } from "lucide-react";
import i18n from "./i18n";

import IdleSidebar from "./components/Sidebar/IdleSidebar";
import ActiveSidebar from "./components/Sidebar/ActiveSidebar";
import ModeSelection, {
  type BridgeProgram,
} from "./components/MainArea/ModeSelection";
import { SettingsView } from "./components/Settings";
import { TopToolbar } from "./components/TopToolbar";
import { UpdateNotification } from "./components/UpdateNotification";
import { NativeLayout } from "./components/NativeLayout";
import ChatWindow from "./components/Chat/ChatWindow";
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
  ProviderInfo,
  RuntimeAuditReport,
  RuntimeChatWindowSession,
} from "./types/runtime";

export type AppMode = "idle" | "site" | "content" | "settings";

const EXECUTION_MODE_STORAGE_KEY = "toraseo.executionMode";
const OPENROUTER_MODEL_STORAGE_KEY = "toraseo.openrouterModelProfileId";

function readPersistedExecutionMode(): AuditExecutionMode | null {
  const value = window.localStorage.getItem(EXECUTION_MODE_STORAGE_KEY);
  return value === "bridge" || value === "native" ? value : null;
}

function persistExecutionMode(mode: AuditExecutionMode): void {
  window.localStorage.setItem(EXECUTION_MODE_STORAGE_KEY, mode);
}

function readSelectedOpenRouterModel(): string | null {
  return window.localStorage.getItem(OPENROUTER_MODEL_STORAGE_KEY);
}

function persistSelectedOpenRouterModel(profileId: string): void {
  window.localStorage.setItem(OPENROUTER_MODEL_STORAGE_KEY, profileId);
}

export default function App() {
  if (window.location.hash === "#ai-chat") {
    return <ChatWindow />;
  }
  return <MainApp />;
}

function MainApp() {
  const { t } = useTranslation();

  const [mode, setMode] = useState<AppMode>("idle");
  const [url, setUrl] = useState("");
  const [selectedTools, setSelectedTools] = useState<Set<ToolId>>(
    () => new Set(DEFAULT_SELECTED_TOOLS),
  );
  const [preflightError, setPreflightError] = useState<string | null>(null);
  const [executionModeDraft, setExecutionModeDraft] =
    useState<AuditExecutionMode>(() => readPersistedExecutionMode() ?? "native");
  const [confirmedExecutionMode, setConfirmedExecutionMode] =
    useState<AuditExecutionMode | null>(() => readPersistedExecutionMode());
  const [bridgeProgram, setBridgeProgram] =
    useState<BridgeProgram>("claude");
  const [settingsInitialTab, setSettingsInitialTab] =
    useState<"language" | "providers">("language");
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [providersLoading, setProvidersLoading] = useState(true);
  const [selectedModelProfileId, setSelectedModelProfileId] = useState<
    string | null
  >(() => readSelectedOpenRouterModel());
  const [runtimeReport, setRuntimeReport] = useState<RuntimeAuditReport | null>(
    null,
  );
  const [codexPromptHelperVisible, setCodexPromptHelperVisible] =
    useState(false);
  const [codexPromptHelperScanId, setCodexPromptHelperScanId] = useState<
    string | null
  >(null);
  const [promptCopyToastVisible, setPromptCopyToastVisible] = useState(false);
  const promptCopyToastTimer = useRef<
    ReturnType<typeof window.setTimeout> | null
  >(null);

  const [currentLocale, setCurrentLocale] = useState<SupportedLocale>(
    () => (i18n.resolvedLanguage as SupportedLocale) ?? "en",
  );

  const { stages, scanState, summary, startScan } = useScan();
  const bridge = useBridgeScan();
  const {
    status: detectorStatus,
    checkNow,
    openClaude,
    openCodex,
    pickMcpConfig,
    clearManualMcpConfig,
    downloadSkillZip,
    openSkillReleasesPage,
    confirmSkillInstalled,
    clearSkillConfirmation,
  } = useDetector();
  const { enabled: nativeRuntimeEnabled } = useNativeRuntimeFlag();
  const bridgeStatus = bridge.state?.status;
  const executionMode = confirmedExecutionMode ?? executionModeDraft;
  const openRouterProvider = providers.find(
    (provider) => provider.id === "openrouter",
  );
  const providerConfigured = providers.some(
    (provider) => provider.id === "openrouter" && provider.configured,
  );
  const providerModelProfiles = openRouterProvider?.modelProfiles ?? [];
  const selectedModelProfile =
    providerModelProfiles.find(
      (profile) => profile.id === selectedModelProfileId,
    ) ?? null;

  const refreshProviders = useCallback(async () => {
    setProvidersLoading(true);
    try {
      const list = await window.toraseo.runtime.listProviders();
      setProviders(list);
    } finally {
      setProvidersLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!nativeRuntimeEnabled && executionModeDraft === "native") {
      setExecutionModeDraft("bridge");
    }
    if (!nativeRuntimeEnabled && confirmedExecutionMode === "native") {
      setConfirmedExecutionMode("bridge");
      persistExecutionMode("bridge");
    }
  }, [confirmedExecutionMode, executionModeDraft, nativeRuntimeEnabled]);

  useEffect(() => {
    void refreshProviders();
  }, [refreshProviders]);

  useEffect(() => {
    if (providerModelProfiles.length === 0) {
      if (selectedModelProfileId !== null) {
        setSelectedModelProfileId(null);
      }
      return;
    }
    if (
      selectedModelProfileId &&
      providerModelProfiles.some((profile) => profile.id === selectedModelProfileId)
    ) {
      return;
    }
    const fallbackId =
      openRouterProvider?.defaultModelProfileId ?? providerModelProfiles[0].id;
    setSelectedModelProfileId(fallbackId);
    persistSelectedOpenRouterModel(fallbackId);
  }, [
    openRouterProvider?.defaultModelProfileId,
    providerModelProfiles,
    selectedModelProfileId,
  ]);

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

  const codexPathReady = Boolean(detectorStatus?.codexRunning);
  const codexSetupVerified = Boolean(detectorStatus?.codexSetupVerified);
  const codexHandshakeVerified =
    bridge.state?.bridgeClient === "codex" &&
    bridge.state.handshake.status === "verified";
  const codexBridgeState =
    bridge.state?.bridgeClient === "codex" ? bridge.state : null;

  const isBridgeBlocked =
    executionMode === "bridge" &&
    bridgeProgram === "claude" &&
    detectorStatus !== null &&
    !detectorStatus.allGreen;

  useEffect(() => {
    const codexBridgeBusy =
      codexBridgeState?.status === "awaiting_handshake" ||
      codexBridgeState?.status === "in_progress";

    if (!codexBridgeBusy || detectorStatus?.codexRunning !== false) {
      return;
    }

    setPreflightError(
      t("preflight.codexClosedDuringScan", {
        defaultValue:
          "Codex closed during the bridge flow. The active Codex scan was cancelled.",
      }),
    );
    void bridge.cancelScan();
  }, [bridge.cancelScan, codexBridgeState, detectorStatus?.codexRunning, t]);

  useEffect(() => {
    if (!codexPromptHelperVisible) return;
    if (bridge.state?.bridgeClient !== "codex") return;
    if (
      codexPromptHelperScanId !== null &&
      bridge.state.scanId !== codexPromptHelperScanId
    ) {
      return;
    }
    if (
      codexPromptHelperScanId === null &&
      bridge.state.status !== "awaiting_handshake" &&
      bridge.state.status !== "in_progress"
    ) {
      return;
    }
    const hasIncomingScanData = Object.values(bridge.state.buffer).some(
      (entry) => entry !== undefined,
    );
    if (hasIncomingScanData) {
      setCodexPromptHelperVisible(false);
      setCodexPromptHelperScanId(null);
    }
  }, [bridge.state, codexPromptHelperScanId, codexPromptHelperVisible]);

  useEffect(() => {
    return () => {
      if (promptCopyToastTimer.current) {
        window.clearTimeout(promptCopyToastTimer.current);
      }
    };
  }, []);

  const handleModeSelect = async (selected: "site" | "content") => {
    if (selected === "content") {
      return;
    }
    if (!confirmedExecutionMode) {
      setPreflightError(
        t("preflight.executionModeMissing", {
          defaultValue: "Confirm an execution mode first.",
        }),
      );
      return;
    }
    if (confirmedExecutionMode === "native" && !providerConfigured) {
      setPreflightError(
        t("preflight.providerMissing", {
          defaultValue: "Add an AI provider before using API + AI Chat.",
        }),
      );
      handleOpenProviderSettings();
      return;
    }
    if (confirmedExecutionMode === "native" && !selectedModelProfile) {
      setPreflightError(
        t("preflight.modelMissing", {
          defaultValue: "Choose an OpenRouter model before starting analysis.",
        }),
      );
      return;
    }
    if (
      confirmedExecutionMode === "bridge" &&
      bridgeProgram === "codex" &&
      !codexPathReady
    ) {
      setPreflightError(
        t("preflight.codexNeedsConfirmation", {
          defaultValue:
            "Open Codex before starting the Codex bridge path.",
        }),
      );
      return;
    }
    if (
      confirmedExecutionMode === "bridge" &&
      bridgeProgram === "codex" &&
      !codexSetupVerified
    ) {
      setPreflightError(
        t("preflight.codexSetupMissing", {
          defaultValue:
            "Run the Codex setup check first so ToraSEO can confirm MCP and Codex Workflow Instructions.",
        }),
      );
      return;
    }
    if (
      confirmedExecutionMode === "bridge" &&
      bridgeProgram === "claude" &&
      detectorStatus &&
      !detectorStatus.allGreen
    ) {
      setPreflightError(t("preflight.depsFailed"));
      return;
    }
    if (confirmedExecutionMode === "native") {
      await window.toraseo.runtime.openChatWindow({
        status: "active",
        locale: currentLocale,
        analysisType: "site",
        selectedModelProfile,
        scanContext: nativeScanContext,
        report: runtimeReport,
      });
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
        setCodexPromptHelperVisible(false);
        setCodexPromptHelperScanId(null);
      }
    }
    setMode("idle");
    setUrl("");
    setRuntimeReport(null);
    setPreflightError(null);
    if (executionMode === "native") {
      void window.toraseo.runtime.endChatWindowSession();
    }
    void window.toraseo.runtime.endReportWindowSession();
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
    if (!providerConfigured) {
      setPreflightError(
        t("preflight.providerMissing", {
          defaultValue: "Add an AI provider before using API + AI Chat.",
        }),
      );
      handleOpenProviderSettings();
      return;
    }
    if (!selectedModelProfile) {
      setPreflightError(
        t("preflight.modelMissing", {
          defaultValue: "Choose an OpenRouter model before starting analysis.",
        }),
      );
      return;
    }
    const orderedIds = TOOLS.map((item) => item.id).filter((id) =>
      selectedTools.has(id),
    );
    await startScan(url.trim(), orderedIds);
  };

  const showCodexPromptHelper = (scanId: string | null = null) => {
    setCodexPromptHelperVisible(true);
    setCodexPromptHelperScanId(scanId);
  };

  const showPromptCopiedToast = () => {
    setPromptCopyToastVisible(true);
    if (promptCopyToastTimer.current) {
      window.clearTimeout(promptCopyToastTimer.current);
    }
    promptCopyToastTimer.current = window.setTimeout(() => {
      setPromptCopyToastVisible(false);
      promptCopyToastTimer.current = null;
    }, 1800);
  };

  const handleRunBridgeScan = async () => {
    setPreflightError(null);
    setRuntimeReport(null);
    if (bridgeProgram === "codex") {
      if (!codexPathReady) {
        setPreflightError(
          t("preflight.codexNeedsConfirmation", {
            defaultValue: "Open Codex before starting the Codex bridge path.",
          }),
        );
        return;
      }
      if (!codexSetupVerified) {
        setPreflightError(
          t("preflight.codexSetupMissing", {
            defaultValue:
              "Run the Codex setup check first so ToraSEO can confirm MCP and Codex Workflow Instructions.",
          }),
        );
        return;
      }
      if (
        bridge.state?.status === "awaiting_handshake" ||
        bridge.state?.status === "in_progress"
      ) {
        await bridge.cancelScan();
        setCodexPromptHelperVisible(false);
        setCodexPromptHelperScanId(null);
        return;
      }
      if (bridge.state?.status === "error") {
        await bridge.retryHandshake();
        showCodexPromptHelper(bridge.state.scanId);
        showPromptCopiedToast();
        return;
      }

      const orderedIds = TOOLS.map((item) => item.id).filter((id) =>
        selectedTools.has(id),
      );
      const result = await bridge.startScan(url.trim(), orderedIds, "codex");
      showCodexPromptHelper(result.scanId);
      showPromptCopiedToast();
      return;
    }

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
    await bridge.startScan(url.trim(), orderedIds, "claude");
  };

  const handleOpenSettings = (tab: "language" | "providers" = "language") => {
    setSettingsInitialTab(tab);
    setMode("settings");
  };

  const handleOpenProviderSettings = () => {
    handleOpenSettings("providers");
  };

  const handleProviderSaved = async () => {
    await refreshProviders();
    setExecutionModeDraft("native");
    setConfirmedExecutionMode("native");
    persistExecutionMode("native");
  };

  const handleConfirmExecutionMode = async () => {
    if (executionModeDraft === "native" && !nativeRuntimeEnabled) {
      setPreflightError(
        t("preflight.nativeUnavailable", {
          defaultValue: "API + AI Chat is unavailable in this build.",
        }),
      );
      return;
    }
    if (confirmedExecutionMode === "native" && executionModeDraft === "bridge") {
      await window.toraseo.runtime.closeChatWindow();
    }
    setConfirmedExecutionMode(executionModeDraft);
    persistExecutionMode(executionModeDraft);
    setPreflightError(null);
  };

  const handleChangeConfirmedExecutionMode = () => {
    setConfirmedExecutionMode(null);
  };

  const handleExecutionModeDraftChange = (next: AuditExecutionMode) => {
    setExecutionModeDraft(next);
  };

  const handleOpenCodex = async () => {
    const result = await openCodex();
    void checkNow();
    return result;
  };

  const handleCopyCodexSetupPrompt = async () => {
    const prompt = await bridge.copyCodexSetupPrompt();
    showCodexPromptHelper();
    showPromptCopiedToast();
    return prompt;
  };

  const handleModelProfileChange = (profileId: string) => {
    setSelectedModelProfileId(profileId);
    persistSelectedOpenRouterModel(profileId);
    setPreflightError(null);
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

  const chatSession = useMemo<RuntimeChatWindowSession>(
    () => ({
      status: "active",
      locale: currentLocale,
      analysisType: "site",
      selectedModelProfile,
      scanContext: nativeScanContext,
      report: runtimeReport,
    }),
    [currentLocale, nativeScanContext, runtimeReport, selectedModelProfile],
  );

  useEffect(() => {
    if (mode !== "site" || executionMode !== "native") return;
    void window.toraseo.runtime.updateChatWindowSession(chatSession);
  }, [chatSession, executionMode, mode]);

  useEffect(() => {
    const unsubscribe = window.toraseo.runtime.onChatWindowSessionUpdate(
      (session) => {
        if (session.status === "active" && session.report) {
          setRuntimeReport((prev) =>
            prev?.generatedAt === session.report?.generatedAt &&
            prev?.model === session.report?.model
              ? prev
              : session.report,
          );
        }
      },
    );
    return unsubscribe;
  }, []);

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
      ? scanState !== "scanning" &&
        providerConfigured &&
        Boolean(selectedModelProfile)
      : bridgeProgram === "codex"
        ? (codexPathReady && codexSetupVerified) ||
          Boolean(bridge.state && bridge.state.status !== "complete")
        : !isBridgeBlocked ||
          Boolean(bridge.state && bridge.state.status !== "complete"));

  const scanButtonTooltip =
    executionMode === "native" && !providerConfigured
      ? t("preflight.providerMissing", {
          defaultValue: "Add an AI provider before using API + AI Chat.",
        })
      : executionMode === "native" && !selectedModelProfile
        ? t("preflight.modelMissing", {
            defaultValue: "Choose an OpenRouter model before starting analysis.",
          })
      : executionMode === "bridge" && isBridgeBlocked
      ? t("preflight.depsFailed")
      : executionMode === "bridge" &&
          bridgeProgram === "codex" &&
          !codexPathReady
        ? t("preflight.codexNeedsConfirmation", {
            defaultValue: "Open Codex before starting the Codex bridge path.",
          })
      : executionMode === "bridge" &&
          bridgeProgram === "codex" &&
          !codexSetupVerified
        ? t("preflight.codexSetupMissing", {
            defaultValue:
              "Run the Codex setup check first so ToraSEO can confirm MCP and Codex Workflow Instructions.",
          })
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
            initialTab={settingsInitialTab}
            onReturnHome={() => {
              setMode("idle");
              void refreshProviders();
            }}
            onSaveLocale={handleSaveLocale}
            nativeRuntimeEnabled={true}
            onProviderSaved={handleProviderSaved}
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
            <ModeSelection
              selectedExecutionMode={executionModeDraft}
              confirmedExecutionMode={confirmedExecutionMode}
              nativeRuntimeEnabled={nativeRuntimeEnabled}
              providerConfigured={providerConfigured}
              providersLoading={providersLoading}
              providerModelProfiles={providerModelProfiles}
              selectedModelProfileId={selectedModelProfileId}
              bridgeProgram={bridgeProgram}
              codexSetupVerified={codexSetupVerified}
              codexHandshakeVerified={codexHandshakeVerified}
              codexBridgeState={codexBridgeState}
              detectorStatus={detectorStatus}
              onExecutionModeDraftChange={handleExecutionModeDraftChange}
              onConfirmExecutionMode={handleConfirmExecutionMode}
              onChangeConfirmedExecutionMode={handleChangeConfirmedExecutionMode}
              onBridgeProgramChange={setBridgeProgram}
              onOpenCodex={handleOpenCodex}
              onCopyCodexSetupPrompt={handleCopyCodexSetupPrompt}
              onModelProfileChange={handleModelProfileChange}
              onOpenProviderSettings={handleOpenProviderSettings}
              onOpenClaude={openClaude}
              onPickMcpConfig={pickMcpConfig}
              onClearManualMcpConfig={clearManualMcpConfig}
              onDownloadSkillZip={downloadSkillZip}
              onOpenSkillReleasesPage={openSkillReleasesPage}
              onConfirmSkillInstalled={confirmSkillInstalled}
              onClearSkillConfirmation={clearSkillConfirmation}
              onSelect={handleModeSelect}
            />
          ) : (
            <NativeLayout
              executionMode={executionMode}
              nativeScanState={scanState}
              runtimeScanContext={nativeScanContext}
              runtimeReport={runtimeReport}
              bridgeState={bridge.state}
              bridgeFacts={bridgeFacts}
              localSummary={summary}
            />
          )}

          {preflightError && (
            <div className="fixed left-1/2 top-16 z-50 -translate-x-1/2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 shadow-lg">
              {preflightError}
            </div>
          )}
          {promptCopyToastVisible && (
            <div className="fixed left-1/2 top-16 z-50 -translate-x-1/2 rounded-lg border border-primary/20 bg-white px-4 py-2 text-sm font-semibold text-outline-900 shadow-lg">
              {t("modeSelection.bridge.codexPromptCopiedToast", {
                defaultValue: "Prompt copied",
              })}
            </div>
          )}
          {codexPromptHelperVisible &&
            executionModeDraft === "bridge" &&
            bridgeProgram === "codex" && (
              <CodexPromptHelper
                onDismiss={() => {
                  setCodexPromptHelperVisible(false);
                  setCodexPromptHelperScanId(null);
                }}
              />
            )}
        </main>
      </div>

      <UpdateNotification />
    </div>
  );
}

function CodexPromptHelper({ onDismiss }: { onDismiss: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="pointer-events-none fixed bottom-6 left-[276px] z-40 w-[420px] max-w-[calc(100vw-300px)]">
      <div className="pointer-events-auto rounded-lg border border-primary/30 bg-white px-4 py-3 shadow-xl">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 rounded-md bg-primary/10 p-2 text-primary">
            <Clipboard size={16} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-sm font-semibold text-outline-900">
                {t("modeSelection.bridge.codexPromptHelperTitle", {
                  defaultValue: "Codex prompt copied",
                })}
              </h3>
              <button
                type="button"
                onClick={onDismiss}
                aria-label={t("common.close")}
                className="rounded-md p-1 text-outline-900/45 transition hover:bg-orange-50 hover:text-outline-900"
              >
                <X size={14} />
              </button>
            </div>
            <p className="mt-1 text-sm leading-relaxed text-outline-900/70">
              {t("modeSelection.bridge.codexPromptHelperBody", {
                defaultValue:
                  "Switch to Codex chat, paste the prompt, and press Enter. If Codex asks for ToraSEO MCP permission, tick the chat/session approval checkbox and click Allow.",
              })}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
