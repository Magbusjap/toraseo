import {
  type MouseEvent as ReactMouseEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, Clipboard, X } from "lucide-react";
import i18n from "./i18n";

import IdleSidebar from "./components/Sidebar/IdleSidebar";
import ActiveSidebar from "./components/Sidebar/ActiveSidebar";
import AnalysisDraftSidebar from "./components/Sidebar/AnalysisDraftSidebar";
import ModeSelection, {
  type BridgeProgram,
} from "./components/MainArea/ModeSelection";
import PlannedAnalysisView, {
  inferArticleCompareGoalMode,
  type ArticleComparePromptData,
  type ArticleTextAction,
  type ArticleTextPromptData,
} from "./components/MainArea/PlannedAnalysisView";
import ChangelogView from "./components/Changelog/ChangelogView";
import DocumentationView from "./components/Documentation/DocumentationView";
import FaqView from "./components/FAQ/FaqView";
import { SettingsView } from "./components/Settings";
import ToolCatalogView from "./components/ToolCatalog/ToolCatalogView";
import { TopToolbar } from "./components/TopToolbar";
import { UpdateNotification } from "./components/UpdateNotification";
import { NativeLayout } from "./components/NativeLayout";
import ChatWindow from "./components/Chat/ChatWindow";
import {
  SidebarWidthOverlay,
  WindowSizeOverlay,
} from "./components/ViewportSizeOverlay";
import { DEFAULT_SELECTED_TOOLS, TOOLS, type ToolId } from "./config/tools";
import type { AnalysisTypeId } from "./config/analysisTypes";
import {
  ANALYSIS_TOOLS,
  getDefaultAnalysisToolSet,
  type AnalysisToolId,
} from "./config/analysisTools";
import { useScan } from "./hooks/useScan";
import { useDetector } from "./hooks/useDetector";
import { useNativeRuntimeFlag } from "./runtime/useNativeRuntimeFlag";
import { useBridgeScan } from "./hooks/useBridgeScan";
import {
  buildBridgeScanFacts,
  buildNativeScanContext,
} from "./runtime/scanContext";

import type { BridgeClient, SupportedLocale } from "./types/ipc";
import type { CurrentScanState } from "./types/ipc";
import type {
  AuditExecutionMode,
  ProviderInfo,
  RuntimeArticleCompareGoalMode,
  RuntimeAuditReport,
  RuntimeChatWindowSession,
} from "./types/runtime";

export type AppMode =
  | "idle"
  | "site"
  | "analysis"
  | "settings"
  | "documentation"
  | "changelog"
  | "toolCatalog"
  | "faq";

type NavigationTarget = {
  mode: Exclude<
    AppMode,
    "settings" | "documentation" | "changelog" | "toolCatalog" | "faq"
  >;
  selectedAnalysisType: AnalysisTypeId | null;
};

const EXECUTION_MODE_STORAGE_KEY = "toraseo.executionMode";
const OPENROUTER_MODEL_STORAGE_KEY = "toraseo.openrouterModelProfileId";
const SIDEBAR_WIDTH_STORAGE_KEY = "toraseo.sidebarWidth";
const RETURN_HOME_SHORTCUTS_STORAGE_KEY = "toraseo.returnHomeShortcuts";
const SIDEBAR_DEFAULT_WIDTH = 260;
const SIDEBAR_MIN_WIDTH = 220;
const SIDEBAR_MAX_WIDTH = 390;
const BUILT_IN_ARTICLE_TEXT_TOOLS = [
  "article_uniqueness",
  "language_syntax",
  "ai_writing_probability",
  "naturalness_indicators",
  "logic_consistency_check",
  "intent_seo_forecast",
  "safety_science_review",
] as const;
const BUILT_IN_ARTICLE_COMPARE_TOOLS = [
  "analyze_text_structure",
  "analyze_text_style",
  "analyze_tone_fit",
  "media_placeholder_review",
  "article_uniqueness",
  "language_syntax",
  "ai_writing_probability",
  "naturalness_indicators",
  "logic_consistency_check",
  "intent_seo_forecast",
  "safety_science_review",
  "compare_intent_gap",
  "compare_article_structure",
  "compare_content_gap",
  "compare_semantic_gap",
  "compare_specificity_gap",
  "compare_trust_gap",
  "compare_article_style",
  "similarity_risk",
  "compare_title_ctr",
  "compare_platform_fit",
  "compare_strengths_weaknesses",
  "compare_improvement_plan",
] as const;

function effectiveArticleTextToolIds(
  selectedToolIds: Iterable<AnalysisToolId>,
): string[] {
  const result = Array.from(selectedToolIds, String);
  for (const toolId of BUILT_IN_ARTICLE_TEXT_TOOLS) {
    if (!result.includes(toolId)) result.push(toolId);
  }
  return result;
}

function effectiveArticleCompareToolIds(
  selectedToolIds: Iterable<AnalysisToolId>,
): string[] {
  const result = Array.from(selectedToolIds, String);
  for (const toolId of BUILT_IN_ARTICLE_COMPARE_TOOLS) {
    if (!result.includes(toolId)) result.push(toolId);
  }
  return result;
}

function countCoveredReportTools(
  report: RuntimeAuditReport | null,
  expectedToolIds: string[],
): number {
  if (!report) return 0;
  const expected = new Set(expectedToolIds);
  const covered = new Set<string>();
  for (const fact of report.confirmedFacts) {
    for (const toolId of fact.sourceToolIds) {
      if (expected.has(toolId)) covered.add(toolId);
    }
  }
  return covered.size;
}

function joinPromptLines(lines: Array<string | null | undefined>): string {
  return lines.filter((line): line is string => Boolean(line)).join("\n");
}

function buildClaudeSkillFallbackArticleTextPrompt(options: {
  action: ArticleTextAction;
  data: ArticleTextPromptData;
  locale: SupportedLocale;
  analysisRole?: string;
  textPlatform: string;
  customPlatform?: string;
  selectedTools: string[];
}): string {
  return joinPromptLines([
    "Используй ToraSEO Claude Bridge Instructions.",
    "",
    "/toraseo chat-only-fallback article-text",
    "",
    "ToraSEO Desktop App и/или MCP сейчас недоступны, но SKILL подключен.",
    "Если можешь загрузить SKILL, прочитай только references/chat-only-fallback.md и не читай лишние fallback-файлы при рабочем Bridge.",
    "Не запускай MCP-инструменты, если они недоступны. Не утверждай, что результаты записаны в приложение или results/*.json.",
    "В ответе пользователю используй нормальные названия проверок, а не технические id инструментов.",
    "Сделай анализ прямо в чате по правилам ToraSEO: факты отдельно от гипотез, осторожно с медицинскими/юридическими/финансовыми утверждениями, без обещаний ранжирования.",
    "",
    `Локаль интерфейса: ${options.locale}`,
    `Тип анализа: ${options.action === "solution" ? "предложить решение по тексту" : "анализ текста"}`,
    `Платформа: ${options.textPlatform}`,
    options.customPlatform ? `Своя платформа: ${options.customPlatform}` : null,
    options.analysisRole ? `Роль/цель анализа: ${options.analysisRole}` : null,
    `Выбранные проверки ToraSEO: ${options.selectedTools.join(", ")}`,
    "",
    "Тема/заголовок:",
    options.data.topic.trim() || "Не указано.",
    "",
    "Текст:",
    options.data.body,
  ]);
}

function buildClaudeSkillFallbackArticleComparePrompt(options: {
  data: ArticleComparePromptData;
  locale: SupportedLocale;
  goalMode: RuntimeArticleCompareGoalMode;
  textPlatform: string;
  customPlatform?: string;
  selectedTools: string[];
}): string {
  return joinPromptLines([
    "Используй ToraSEO Claude Bridge Instructions.",
    "",
    "/toraseo chat-only-fallback article-compare",
    "",
    "ToraSEO Desktop App и/или MCP сейчас недоступны, но SKILL подключен.",
    "Если можешь загрузить SKILL, прочитай только references/chat-only-fallback.md и не читай лишние fallback-файлы при рабочем Bridge.",
    "Не запускай MCP-инструменты, если они недоступны. Не утверждай, что результаты записаны в приложение или results/*.json.",
    "В ответе пользователю используй нормальные названия проверок, а не технические id инструментов.",
    "Сделай сравнительный отчёт прямо в чате. Если цель анализа фокусируется на тексте A или B, не расписывай второй текст сверх того, что нужно для сравнения.",
    "Не утверждай причины ранжирования только по двум текстам. Пиши про текстовые преимущества, разрывы, риск похожести и план улучшения.",
    "",
    `Локаль интерфейса: ${options.locale}`,
    `Режим цели анализа: ${options.goalMode}`,
    `Цель анализа: ${options.data.goal.trim() || "Не указана. Используй стандартный отчёт сравнения."}`,
    `Платформа: ${options.textPlatform}`,
    options.customPlatform ? `Своя платформа: ${options.customPlatform}` : null,
    `Роль текста A: ${options.data.roleA}`,
    `Роль текста B: ${options.data.roleB}`,
    `Выбранные проверки ToraSEO: ${options.selectedTools.join(", ")}`,
    "",
    "Обязательные блоки отчёта:",
    "1. Краткая сводка под цель анализа.",
    "2. Сравнение интента, структуры, полноты, смыслового покрытия, конкретики, доверия, стиля, заголовка/клика и платформенной пригодности.",
    "3. Риск похожести: дословные совпадения отдельно от смысловой близости; не называй локальную метрику внешней проверкой плагиата.",
    "4. Сильные и слабые стороны в удобной одной колонке.",
    "5. Content Gap простыми словами: что есть в одном тексте и отсутствует в другом.",
    "6. План улучшения под цель пользователя.",
    "",
    "Текст A:",
    options.data.textA,
    "",
    "Текст B:",
    options.data.textB,
  ]);
}

async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function clampSidebarWidth(width: number): number {
  return Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, width));
}

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

function readPersistedSidebarWidth(): number {
  const width = Number(window.localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY));
  return Number.isFinite(width)
    ? clampSidebarWidth(width)
    : SIDEBAR_DEFAULT_WIDTH;
}

function persistSidebarWidth(width: number): void {
  window.localStorage.setItem(
    SIDEBAR_WIDTH_STORAGE_KEY,
    String(clampSidebarWidth(width)),
  );
}

function readReturnHomeShortcutsEnabled(): boolean {
  return window.localStorage.getItem(RETURN_HOME_SHORTCUTS_STORAGE_KEY) === "1";
}

function persistReturnHomeShortcutsEnabled(enabled: boolean): void {
  window.localStorage.setItem(
    RETURN_HOME_SHORTCUTS_STORAGE_KEY,
    enabled ? "1" : "0",
  );
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
  const [sidebarWidth, setSidebarWidth] = useState(readPersistedSidebarWidth);
  const [sidebarWidthOverlayVisible, setSidebarWidthOverlayVisible] =
    useState(false);
  const sidebarResizeRef = useRef({
    startX: 0,
    startWidth: SIDEBAR_DEFAULT_WIDTH,
  });
  const [selectedAnalysisType, setSelectedAnalysisType] =
    useState<AnalysisTypeId | null>(null);
  const [url, setUrl] = useState("");
  const [selectedTools, setSelectedTools] = useState<Set<ToolId>>(
    () => new Set(DEFAULT_SELECTED_TOOLS),
  );
  const [selectedAnalysisToolsByType, setSelectedAnalysisToolsByType] =
    useState<Record<AnalysisTypeId, Set<AnalysisToolId>>>(() => ({
      site_by_url: getDefaultAnalysisToolSet("site_by_url"),
      page_by_url: getDefaultAnalysisToolSet("page_by_url"),
      article_text: getDefaultAnalysisToolSet("article_text"),
      article_compare: getDefaultAnalysisToolSet("article_compare"),
      site_compare: getDefaultAnalysisToolSet("site_compare"),
      site_design_by_url: getDefaultAnalysisToolSet("site_design_by_url"),
    }));
  const [analysisRole, setAnalysisRole] = useState("");
  const [textPlatform, setTextPlatform] = useState("site_article");
  const [customPlatform, setCustomPlatform] = useState("");
  const [articleTextScanStartedOnce, setArticleTextScanStartedOnce] =
    useState(false);
  const [articleTextSolutionProvidedOnce, setArticleTextSolutionProvidedOnce] =
    useState(false);
  const [nativeArticleTextState, setNativeArticleTextState] =
    useState<CurrentScanState | null>(null);
  const [nativeArticleTextActiveRun, setNativeArticleTextActiveRun] =
    useState<ArticleTextAction | null>(null);
  const [articleCompareStartedOnce, setArticleCompareStartedOnce] =
    useState(false);
  const [nativeArticleCompareActiveRun, setNativeArticleCompareActiveRun] =
    useState<"scan" | null>(null);
  const [articleCompareInput, setArticleCompareInput] =
    useState<ArticleComparePromptData | null>(null);
  const [preflightError, setPreflightError] = useState<string | null>(null);
  const [codexClosedNotice, setCodexClosedNotice] = useState<string | null>(
    null,
  );
  const [codexClosedNoticeShake, setCodexClosedNoticeShake] = useState(false);
  const [executionModeDraft, setExecutionModeDraft] =
    useState<AuditExecutionMode>(() => readPersistedExecutionMode() ?? "native");
  const [confirmedExecutionMode, setConfirmedExecutionMode] =
    useState<AuditExecutionMode | null>(() => readPersistedExecutionMode());
  const [bridgeProgram, setBridgeProgram] =
    useState<BridgeProgram>("claude");
  const [settingsInitialTab, setSettingsInitialTab] =
    useState<"general" | "language" | "providers">("general");
  const [settingsReturnTarget, setSettingsReturnTarget] =
    useState<NavigationTarget | null>(null);
  const [referenceReturnTarget, setReferenceReturnTarget] =
    useState<NavigationTarget | null>(null);
  const [returnHomeShortcutsEnabled, setReturnHomeShortcutsEnabled] =
    useState(readReturnHomeShortcutsEnabled);
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
  const [bridgeSetupPromptNotice, setBridgeSetupPromptNotice] =
    useState<BridgeClient | null>(null);
  const promptCopyToastTimer = useRef<
    ReturnType<typeof window.setTimeout> | null
  >(null);
  const bridgeSetupPromptNoticeTimer = useRef<
    ReturnType<typeof window.setTimeout> | null
  >(null);
  const sidebarWidthOverlayTimer = useRef<
    ReturnType<typeof window.setTimeout> | null
  >(null);
  const codexClosedNoticeShakeTimer = useRef<
    ReturnType<typeof window.setTimeout> | null
  >(null);
  const lastCodexRunningRef = useRef<boolean | null>(null);
  const backShortcutTimerRef = useRef(0);

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
    pickClaudePath,
    pickCodexPath,
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
    !detectorStatus.allGreen &&
    !detectorStatus.skillInstalled;
  const claudeSkillFallbackAvailable =
    executionMode === "bridge" &&
    bridgeProgram === "claude" &&
    Boolean(detectorStatus?.skillInstalled);
  const bridgeExternalAppClosed =
    executionMode === "bridge" &&
    detectorStatus !== null &&
    (bridgeProgram === "codex"
      ? !detectorStatus.codexRunning
      : !detectorStatus.claudeRunning);
  const bridgeExternalAppName =
    bridgeProgram === "codex" ? "Codex" : "Claude Desktop";

  const showCodexClosedNotice = useCallback((message: string) => {
    setCodexClosedNotice(message);
  }, []);

  useEffect(() => {
    const codexBridgeBusy =
      codexBridgeState?.status === "awaiting_handshake" ||
      codexBridgeState?.status === "in_progress";

    if (!codexBridgeBusy || detectorStatus?.codexRunning !== false) {
      return;
    }

    showCodexClosedNotice(
      t("preflight.codexClosedDuringScan", {
        defaultValue:
          "Codex closed during the bridge flow. The active Codex scan was cancelled.",
      }),
    );
    void bridge.cancelScan();
  }, [
    bridge.cancelScan,
    codexBridgeState,
    detectorStatus?.codexRunning,
    showCodexClosedNotice,
    t,
  ]);

  useEffect(() => {
    if (detectorStatus === null) return;

    if (detectorStatus.codexRunning) {
      setCodexClosedNotice(null);
      setPreflightError((current) => {
        if (!current) return current;
        const lower = current.toLowerCase();
        return current.includes("Codex") &&
          (lower.includes("closed") || current.includes("закрыт"))
          ? null
          : current;
      });
    }

    const previous = lastCodexRunningRef.current;
    lastCodexRunningRef.current = detectorStatus.codexRunning;

    const codexBridgeBusy =
      codexBridgeState?.status === "awaiting_handshake" ||
      codexBridgeState?.status === "in_progress";

    if (
      previous === true &&
      detectorStatus.codexRunning === false &&
      executionMode === "bridge" &&
      bridgeProgram === "codex" &&
      !codexBridgeBusy
    ) {
      showCodexClosedNotice(
        t("preflight.codexClosed", {
          defaultValue: "Codex is closed. Open Codex to continue.",
        }),
      );
      setCodexPromptHelperVisible(false);
      setCodexPromptHelperScanId(null);
    }
  }, [
    bridgeProgram,
    codexBridgeState?.status,
    detectorStatus,
    executionMode,
    showCodexClosedNotice,
    t,
  ]);

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
      if (bridgeSetupPromptNoticeTimer.current) {
        window.clearTimeout(bridgeSetupPromptNoticeTimer.current);
      }
      if (codexClosedNoticeShakeTimer.current) {
        window.clearTimeout(codexClosedNoticeShakeTimer.current);
      }
      if (sidebarWidthOverlayTimer.current) {
        window.clearTimeout(sidebarWidthOverlayTimer.current);
      }
    };
  }, []);

  const handleDismissCodexClosedNotice = () => {
    if (detectorStatus?.codexRunning) {
      setCodexClosedNotice(null);
      setCodexClosedNoticeShake(false);
      return;
    }

    setCodexClosedNoticeShake(false);
    if (codexClosedNoticeShakeTimer.current) {
      window.clearTimeout(codexClosedNoticeShakeTimer.current);
    }
    window.requestAnimationFrame(() => {
      setCodexClosedNoticeShake(true);
      codexClosedNoticeShakeTimer.current = window.setTimeout(() => {
        setCodexClosedNoticeShake(false);
        codexClosedNoticeShakeTimer.current = null;
      }, 420);
    });
  };

  const handleModeSelect = async (selected: AnalysisTypeId) => {
    if (!confirmedExecutionMode) {
      setPreflightError(
        t("preflight.executionModeMissing", {
          defaultValue: "Confirm an execution mode first.",
        }),
      );
      return;
    }
    if (selected !== "site_by_url") {
      setSelectedAnalysisType(selected);
      setMode("analysis");
      setPreflightError(null);
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
          defaultValue:
            "Choose the AI provider model before starting analysis.",
        }),
      );
      return;
    }
    if (confirmedExecutionMode === "bridge" && bridgeProgram === "codex") {
      const fresh = await checkNow();
      if (!fresh.codexRunning) {
        showCodexClosedNotice(
          t("preflight.codexNeedsConfirmation", {
            defaultValue:
              "Open Codex before starting the Codex bridge path.",
          }),
        );
        return;
      }
      if (!fresh.codexSetupVerified) {
        setPreflightError(
          t("preflight.codexSetupMissing", {
            defaultValue:
              "Run the Codex setup check first so ToraSEO can confirm MCP and Codex Workflow Instructions.",
          }),
        );
        return;
      }
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
        articleTextContext: null,
        articleCompareContext: null,
        report: runtimeReport,
      });
    }
    setSelectedAnalysisType(selected);
    setMode("site");
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
    if (executionMode === "bridge" && bridge.state) {
      void bridge.cancelScan();
      setCodexPromptHelperVisible(false);
      setCodexPromptHelperScanId(null);
    }
    setMode("idle");
    setSelectedAnalysisType(null);
    setArticleTextScanStartedOnce(false);
    setArticleTextSolutionProvidedOnce(false);
    setNativeArticleTextState(null);
    setNativeArticleTextActiveRun(null);
    setArticleCompareStartedOnce(false);
    setNativeArticleCompareActiveRun(null);
    setArticleCompareInput(null);
    setAnalysisRole("");
    setReferenceReturnTarget(null);
    setUrl("");
    setRuntimeReport(null);
    setPreflightError(null);
    if (executionMode === "native") {
      void window.toraseo.runtime.endChatWindowSession();
    }
    void window.toraseo.runtime.endReportWindowSession();
  };

  const handleRestoreSettingsReturnTarget = () => {
    const target = settingsReturnTarget;
    if (!target) {
      handleReturnHome();
      return;
    }
    setMode(target.mode);
    setSelectedAnalysisType(target.selectedAnalysisType);
    setPreflightError(null);
    setSettingsReturnTarget(null);
  };

  const restoreReferenceReturnTarget = () => {
    const target = referenceReturnTarget;
    setReferenceReturnTarget(null);
    if (!target) {
      handleReturnHome();
      return;
    }
    setMode(target.mode);
    setSelectedAnalysisType(target.selectedAnalysisType);
    setPreflightError(null);
  };

  const handleNavigateBack = () => {
    if (
      mode === "documentation" ||
      mode === "changelog" ||
      mode === "toolCatalog" ||
      mode === "faq"
    ) {
      restoreReferenceReturnTarget();
      return;
    }
    if (mode === "settings") {
      handleRestoreSettingsReturnTarget();
      return;
    }
    if (mode !== "idle") {
      handleReturnHome();
    }
  };

  const handleToggleTool = (toolId: ToolId) => {
    setSelectedTools((prev) => {
      const next = new Set(prev);
      if (next.has(toolId)) next.delete(toolId);
      else next.add(toolId);
      return next;
    });
  };

  const handleToggleAllTools = () => {
    setSelectedTools((prev) =>
      prev.size === TOOLS.length
        ? new Set()
        : new Set(TOOLS.map((tool) => tool.id)),
    );
  };

  const handleToggleAnalysisTool = (toolId: AnalysisToolId) => {
    if (!selectedAnalysisType) return;
    setSelectedAnalysisToolsByType((prev) => {
      const nextSet = new Set(prev[selectedAnalysisType]);
      if (nextSet.has(toolId)) nextSet.delete(toolId);
      else nextSet.add(toolId);
      return {
        ...prev,
        [selectedAnalysisType]: nextSet,
      };
    });
  };

  const handleToggleAllAnalysisTools = () => {
    if (!selectedAnalysisType) return;
    const tools = ANALYSIS_TOOLS[selectedAnalysisType];
    setSelectedAnalysisToolsByType((prev) => ({
      ...prev,
      [selectedAnalysisType]:
        prev[selectedAnalysisType].size === tools.length
          ? new Set()
          : new Set(tools.map((tool) => tool.id)),
    }));
  };

  const handleStartNativeScan = async () => {
    setPreflightError(null);
    setRuntimeReport(null);
    void window.toraseo.runtime.showReportWindowProcessing();
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
          defaultValue:
            "Choose the AI provider model before starting analysis.",
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

  const showBridgeSetupPromptNotice = (bridgeClient: BridgeClient) => {
    setBridgeSetupPromptNotice(bridgeClient);
    if (bridgeSetupPromptNoticeTimer.current) {
      window.clearTimeout(bridgeSetupPromptNoticeTimer.current);
    }
    bridgeSetupPromptNoticeTimer.current = window.setTimeout(() => {
      setBridgeSetupPromptNotice(null);
      bridgeSetupPromptNoticeTimer.current = null;
    }, 10000);
  };

  const dismissBridgeSetupPromptNotice = () => {
    setBridgeSetupPromptNotice(null);
    if (bridgeSetupPromptNoticeTimer.current) {
      window.clearTimeout(bridgeSetupPromptNoticeTimer.current);
      bridgeSetupPromptNoticeTimer.current = null;
    }
  };

  const handleRunBridgeScan = async () => {
    setPreflightError(null);
    setRuntimeReport(null);
    if (bridgeProgram === "codex") {
      const fresh = await checkNow();
      if (!fresh.codexRunning) {
        showCodexClosedNotice(
          t("preflight.codexNeedsConfirmation", {
            defaultValue: "Open Codex before starting the Codex bridge path.",
          }),
        );
        return;
      }
      if (!fresh.codexSetupVerified) {
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
        void window.toraseo.runtime.showReportWindowProcessing();
        await bridge.retryHandshake();
        showCodexPromptHelper(bridge.state.scanId);
        showPromptCopiedToast();
        return;
      }

      const orderedIds = TOOLS.map((item) => item.id).filter((id) =>
        selectedTools.has(id),
      );
      void window.toraseo.runtime.showReportWindowProcessing();
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
      void window.toraseo.runtime.showReportWindowProcessing();
      await bridge.retryHandshake();
      return;
    }

    const orderedIds = TOOLS.map((item) => item.id).filter((id) =>
      selectedTools.has(id),
    );
    void window.toraseo.runtime.showReportWindowProcessing();
    await bridge.startScan(url.trim(), orderedIds, "claude");
  };

  const handleOpenSettings = (
    tab: "general" | "language" | "providers" = "general",
  ) => {
    if (
      mode !== "settings" &&
      mode !== "documentation" &&
      mode !== "changelog" &&
      mode !== "toolCatalog" &&
      mode !== "faq"
    ) {
      setSettingsReturnTarget({
        mode,
        selectedAnalysisType,
      });
    }
    setSettingsInitialTab(tab);
    setMode("settings");
  };

  const openReferencePage = (nextMode: Extract<AppMode, "documentation" | "changelog" | "toolCatalog" | "faq">) => {
    if (
      mode !== "settings" &&
      mode !== "documentation" &&
      mode !== "changelog" &&
      mode !== "toolCatalog" &&
      mode !== "faq"
    ) {
      setReferenceReturnTarget({
        mode,
        selectedAnalysisType,
      });
    }
    setMode(nextMode);
  };

  const handleOpenDocumentation = () => {
    openReferencePage("documentation");
  };

  const handleOpenChangelog = () => {
    openReferencePage("changelog");
  };

  const handleOpenToolCatalog = () => {
    openReferencePage("toolCatalog");
  };

  const handleOpenFaq = () => {
    openReferencePage("faq");
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

  const handleCopyBridgeSetupPrompt = async (bridgeClient: BridgeClient) => {
    const prompt = await bridge.copyBridgeSetupPrompt(bridgeClient);
    showBridgeSetupPromptNotice(bridgeClient);
    return prompt;
  };

  const handleModelProfileChange = (profileId: string) => {
    setSelectedModelProfileId(profileId);
    persistSelectedOpenRouterModel(profileId);
    setPreflightError(null);
  };

  const handleReturnHomeShortcutsChange = (enabled: boolean) => {
    setReturnHomeShortcutsEnabled(enabled);
    persistReturnHomeShortcutsEnabled(enabled);
  };

  const handleSidebarResizeStart = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      event.preventDefault();
      setSidebarWidthOverlayVisible(true);
      sidebarResizeRef.current = {
        startX: event.clientX,
        startWidth: sidebarWidth,
      };
      const previousCursor = document.body.style.cursor;
      const previousUserSelect = document.body.style.userSelect;
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const nextWidth = clampSidebarWidth(
          sidebarResizeRef.current.startWidth +
            moveEvent.clientX -
            sidebarResizeRef.current.startX,
        );
        setSidebarWidth(nextWidth);
        setSidebarWidthOverlayVisible(true);
      };

      const handleMouseUp = (upEvent: MouseEvent) => {
        const finalWidth = clampSidebarWidth(
          sidebarResizeRef.current.startWidth +
            upEvent.clientX -
            sidebarResizeRef.current.startX,
        );
        setSidebarWidth(finalWidth);
        persistSidebarWidth(finalWidth);
        if (sidebarWidthOverlayTimer.current) {
          window.clearTimeout(sidebarWidthOverlayTimer.current);
        }
        sidebarWidthOverlayTimer.current = window.setTimeout(() => {
          setSidebarWidthOverlayVisible(false);
          sidebarWidthOverlayTimer.current = null;
        }, 1000);
        document.body.style.cursor = previousCursor;
        document.body.style.userSelect = previousUserSelect;
        window.removeEventListener("mousemove", handleMouseMove);
        window.removeEventListener("mouseup", handleMouseUp);
      };

      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
    },
    [sidebarWidth],
  );

  const handleSidebarResizeDoubleClick = () => {
    setSidebarWidth(SIDEBAR_DEFAULT_WIDTH);
    persistSidebarWidth(SIDEBAR_DEFAULT_WIDTH);
    setSidebarWidthOverlayVisible(true);
    if (sidebarWidthOverlayTimer.current) {
      window.clearTimeout(sidebarWidthOverlayTimer.current);
    }
    sidebarWidthOverlayTimer.current = window.setTimeout(() => {
      setSidebarWidthOverlayVisible(false);
      sidebarWidthOverlayTimer.current = null;
    }, 1000);
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
  const activeArticleTextRun =
    executionMode === "native" && selectedAnalysisType === "article_compare"
      ? nativeArticleCompareActiveRun
      : executionMode === "native"
      ? nativeArticleTextActiveRun
      : bridge.state?.analysisType === "article_compare" &&
          (bridge.state.status === "awaiting_handshake" ||
            bridge.state.status === "in_progress")
        ? "scan"
      : bridge.state?.analysisType === "article_text" &&
          (bridge.state.status === "awaiting_handshake" ||
            bridge.state.status === "in_progress")
        ? bridge.state.input?.action ?? "scan"
        : null;
  const completedArticleTextAction =
    (bridge.state?.analysisType === "article_text" ||
      bridge.state?.analysisType === "article_compare") &&
    bridge.state.status === "complete"
      ? bridge.state.input?.action ?? "scan"
      : null;
  const displayedCompletedArticleTextAction =
    executionMode === "native"
      ? articleTextSolutionProvidedOnce
        ? "solution"
        : runtimeReport && selectedAnalysisType === "article_text"
          ? "scan"
          : runtimeReport && selectedAnalysisType === "article_compare"
            ? "scan"
          : null
      : completedArticleTextAction;
  const displayedArticleTextState =
    executionMode === "native" ? nativeArticleTextState : bridge.state;
  const effectiveArticleTextTools =
    selectedAnalysisType === "article_text"
      ? effectiveArticleTextToolIds(selectedAnalysisToolsByType.article_text)
      : [];
  const effectiveArticleCompareTools =
    selectedAnalysisType === "article_compare"
      ? effectiveArticleCompareToolIds(selectedAnalysisToolsByType.article_compare)
      : [];
  const plannedCompletedTools =
    executionMode === "native" &&
    selectedAnalysisType === "article_text" &&
    runtimeReport
      ? countCoveredReportTools(runtimeReport, effectiveArticleTextTools)
      : executionMode === "native" &&
          selectedAnalysisType === "article_compare" &&
          runtimeReport
        ? countCoveredReportTools(runtimeReport, effectiveArticleCompareTools)
      : displayedArticleTextState?.analysisType === "article_compare"
        ? displayedArticleTextState.selectedTools.filter((toolId) => {
            const entry = displayedArticleTextState.buffer[toolId];
            return entry?.status === "complete" || entry?.status === "error";
          }).length
      : displayedArticleTextState?.analysisType === "article_text"
        ? Object.values(displayedArticleTextState.buffer).filter(
            (entry) => entry.status === "complete" || entry.status === "error",
          ).length
      : 0;
  const plannedTotalTools =
    executionMode === "native" && selectedAnalysisType === "article_text"
      ? effectiveArticleTextTools.length
      : executionMode === "native" && selectedAnalysisType === "article_compare"
        ? effectiveArticleCompareTools.length
      : displayedArticleTextState?.analysisType === "article_text" ||
          displayedArticleTextState?.analysisType === "article_compare"
      ? displayedArticleTextState.selectedTools.length
      : selectedAnalysisType
        ? selectedAnalysisToolsByType[selectedAnalysisType].size
        : 0;

  useEffect(() => {
    if (
      bridge.state?.analysisType !== "article_text" ||
      bridge.state.status !== "complete"
    ) {
      return;
    }
    const action = bridge.state.input?.action ?? "scan";
    if (action === "scan") {
      setArticleTextScanStartedOnce(true);
      return;
    }
    setArticleTextSolutionProvidedOnce(true);
  }, [bridge.state]);

  const handleRunArticleTextBridge = async (
    action: ArticleTextAction,
    data: ArticleTextPromptData,
  ): Promise<boolean> => {
    const visibleToolIds = Array.from(selectedAnalysisToolsByType.article_text);
    const toolIds = effectiveArticleTextToolIds(visibleToolIds);

    if (executionMode === "native") {
      setPreflightError(null);
      if (!nativeRuntimeEnabled || !window.toraseo?.runtime?.openChatWindow) {
        setPreflightError(
          t("preflight.nativeUnavailable", {
            defaultValue: "API + AI Chat is unavailable in this build.",
          }),
        );
        return false;
      }
      if (!providerConfigured) {
        setPreflightError(
          t("preflight.providerMissing", {
            defaultValue: "Add an AI provider before using API + AI Chat.",
          }),
        );
        handleOpenProviderSettings();
        return false;
      }
      if (!selectedModelProfile) {
        setPreflightError(
          t("preflight.modelMissing", {
            defaultValue:
              "Choose the AI provider model before starting analysis.",
          }),
        );
        return false;
      }
      if (action === "scan") {
        setNativeArticleTextActiveRun("scan");
        setNativeArticleTextState(null);
        setRuntimeReport(null);
      }

      let result: { ok: boolean };
      try {
        result = await window.toraseo.runtime.openChatWindow({
          status: "active",
          locale: currentLocale,
          analysisType: "article_text",
          selectedModelProfile,
          scanContext: null,
          articleTextContext: {
            action,
            runId: `${action}-${Date.now()}`,
            topic: data.topic,
            body: data.body,
            analysisRole: analysisRole.trim() || undefined,
            textPlatform,
            customPlatform: customPlatform.trim() || undefined,
            selectedTools: toolIds,
          },
          report: null,
          articleTextRunState: action === "scan" ? "running" : "idle",
        });
      } catch {
        result = { ok: false };
      }
      if (!result.ok) {
        if (action === "scan") {
          setNativeArticleTextActiveRun(null);
          setPreflightError(
            t("preflight.nativeUnavailable", {
              defaultValue:
                "API + AI Chat is unavailable in this build.",
            }),
          );
          return true;
        }
        setPreflightError(
          t("preflight.nativeUnavailable", {
            defaultValue: "API + AI Chat is unavailable in this build.",
          }),
        );
        return false;
      }
      if (action === "scan") {
        setArticleTextScanStartedOnce(true);
      } else {
        setArticleTextSolutionProvidedOnce(true);
      }
      return true;
    }

    if (executionMode !== "bridge") {
      setPreflightError(
        t("preflight.articleTextBridgeRequired", {
          defaultValue:
            "Text analysis through Codex or Claude Desktop requires MCP + Instructions mode.",
        }),
      );
      return false;
    }

    if (bridgeProgram === "codex") {
      const fresh = await checkNow();
      if (!fresh.codexRunning) {
        showCodexClosedNotice(
          t("preflight.codexNeedsConfirmation", {
            defaultValue: "Open Codex before starting the Codex bridge path.",
          }),
        );
        return false;
      }
      if (!fresh.codexSetupVerified) {
        setPreflightError(
          t("preflight.codexSetupMissing", {
            defaultValue:
              "Run the Codex setup check first so ToraSEO can confirm MCP and Codex Workflow Instructions.",
          }),
        );
        return false;
      }
    } else if (detectorStatus && !detectorStatus.allGreen) {
      if (detectorStatus.skillInstalled) {
        const copied = await copyTextToClipboard(
          buildClaudeSkillFallbackArticleTextPrompt({
            action,
            data,
            locale: currentLocale,
            analysisRole: analysisRole.trim() || undefined,
            textPlatform,
            customPlatform: customPlatform.trim() || undefined,
            selectedTools: toolIds,
          }),
        );
        if (!copied) {
          setPreflightError(
            t("preflight.skillFallbackCopyFailed", {
              defaultValue:
                "Claude Bridge Instructions are installed, but ToraSEO could not copy the fallback prompt.",
            }),
          );
          return false;
        }
        if (action === "scan") {
          setArticleTextScanStartedOnce(true);
        } else {
          setArticleTextSolutionProvidedOnce(true);
        }
        showPromptCopiedToast();
        return true;
      }
      setPreflightError(t("preflight.depsFailed"));
      return false;
    }

    if (action === "scan") {
      setArticleTextScanStartedOnce(true);
      void window.toraseo.runtime.showReportWindowProcessing();
    }
    await bridge.startScan("toraseo://article-text", toolIds, bridgeProgram, {
      action,
      topic: data.topic,
      text: data.body,
      analysisRole: analysisRole.trim() || undefined,
      textPlatform,
      customPlatform: customPlatform.trim() || undefined,
      selectedAnalysisTools: visibleToolIds,
    });
    return true;
  };

  const handleCancelArticleTextBridge = () => {
    if (executionMode === "native") {
      setNativeArticleTextActiveRun(null);
      void window.toraseo.runtime.updateChatWindowSession({
        status: "active",
        locale: currentLocale,
        analysisType: "article_text",
        selectedModelProfile,
        scanContext: null,
        articleTextContext: null,
        articleCompareContext: null,
        articleTextRunState: "idle",
        report: runtimeReport,
      });
      return;
    }
    void bridge.cancelScan();
  };

  const handleRunArticleCompare = async (
    data: ArticleComparePromptData,
  ): Promise<boolean | "fallback"> => {
    const visibleToolIds = Array.from(
      selectedAnalysisToolsByType.article_compare,
      String,
    );
    const toolIds = effectiveArticleCompareToolIds(
      selectedAnalysisToolsByType.article_compare,
    );

    setPreflightError(null);
    const goalMode = data.goalMode ?? inferArticleCompareGoalMode(data.goal);
    const compareData = { ...data, goalMode };
    setArticleCompareInput(compareData);

    if (executionMode === "bridge") {
      if (bridgeProgram === "codex") {
        const fresh = await checkNow();
        if (!fresh.codexRunning) {
          showCodexClosedNotice(
            t("preflight.codexNeedsConfirmation", {
              defaultValue: "Open Codex before starting the Codex bridge path.",
            }),
          );
          return false;
        }
        if (!fresh.codexSetupVerified) {
          setPreflightError(
            t("preflight.codexSetupMissing", {
              defaultValue:
                "Run the Codex setup check first so ToraSEO can confirm MCP and Codex Workflow Instructions.",
            }),
          );
          return false;
        }
      } else if (detectorStatus && !detectorStatus.allGreen) {
        if (detectorStatus.skillInstalled) {
          const copied = await copyTextToClipboard(
            buildClaudeSkillFallbackArticleComparePrompt({
              data: compareData,
              locale: currentLocale,
              goalMode,
              textPlatform,
              customPlatform: customPlatform.trim() || undefined,
              selectedTools: toolIds,
            }),
          );
          if (!copied) {
            setPreflightError(
              t("preflight.skillFallbackCopyFailed", {
                defaultValue:
                  "Claude Bridge Instructions are installed, but ToraSEO could not copy the fallback prompt.",
              }),
            );
            return false;
          }
          setArticleCompareStartedOnce(true);
          showPromptCopiedToast();
          return "fallback";
        }
        setPreflightError(t("preflight.depsFailed"));
        return false;
      }

      setArticleCompareStartedOnce(true);
      await bridge.startScan("toraseo://article-compare", toolIds, bridgeProgram, {
        action: "scan",
        goal: compareData.goal,
        goalMode,
        textA: compareData.textA,
        textB: compareData.textB,
        roleA: compareData.roleA,
        roleB: compareData.roleB,
        textPlatform,
        customPlatform: customPlatform.trim() || undefined,
        selectedAnalysisTools: visibleToolIds,
      });
      return true;
    }

    if (!nativeRuntimeEnabled || !window.toraseo?.runtime?.openChatWindow) {
      setPreflightError(
        t("preflight.nativeUnavailable", {
          defaultValue: "API + AI Chat is unavailable in this build.",
        }),
      );
      return false;
    }
    if (!providerConfigured) {
      setPreflightError(
        t("preflight.providerMissing", {
          defaultValue: "Add an AI provider before using API + AI Chat.",
        }),
      );
      handleOpenProviderSettings();
      return false;
    }
    if (!selectedModelProfile) {
      setPreflightError(
        t("preflight.modelMissing", {
          defaultValue: "Choose the AI provider model before starting analysis.",
        }),
      );
      return false;
    }

    setNativeArticleCompareActiveRun("scan");
    setRuntimeReport(null);

    let result: { ok: boolean };
    try {
      result = await window.toraseo.runtime.openChatWindow({
        status: "active",
        locale: currentLocale,
        analysisType: "article_compare",
        selectedModelProfile,
        scanContext: null,
        articleTextContext: null,
        articleCompareContext: {
          runId: `compare-${Date.now()}`,
          goal: compareData.goal,
          goalMode,
          textA: compareData.textA,
          textB: compareData.textB,
          roleA: compareData.roleA,
          roleB: compareData.roleB,
          textPlatform,
          customPlatform: customPlatform.trim() || undefined,
          selectedTools: toolIds,
        },
        articleTextRunState: "running",
        report: null,
      });
    } catch {
      result = { ok: false };
    }
    if (!result.ok) {
      setNativeArticleCompareActiveRun(null);
      setPreflightError(
        t("preflight.nativeUnavailable", {
          defaultValue: "API + AI Chat is unavailable in this build.",
        }),
      );
      return false;
    }
    setArticleCompareStartedOnce(true);
    return true;
  };

  const handleCancelArticleCompare = () => {
    if (executionMode !== "native") {
      void bridge.cancelScan();
      return;
    }
    setNativeArticleCompareActiveRun(null);
    void window.toraseo.runtime.updateChatWindowSession({
      status: "active",
      locale: currentLocale,
      analysisType: "article_compare",
      selectedModelProfile,
      scanContext: null,
      articleTextContext: null,
      articleCompareContext: null,
      articleTextRunState: "idle",
      report: runtimeReport,
    });
  };

  const chatSession = useMemo<RuntimeChatWindowSession>(
    () => ({
      status: "active",
      locale: currentLocale,
      analysisType: "site",
      selectedModelProfile,
      scanContext: nativeScanContext,
      articleTextContext: null,
      articleCompareContext: null,
      report: runtimeReport,
    }),
    [currentLocale, nativeScanContext, runtimeReport, selectedModelProfile],
  );

  useEffect(() => {
    if (mode !== "site" || executionMode !== "native") return;
    void window.toraseo.runtime.updateChatWindowSession(chatSession);
  }, [chatSession, executionMode, mode]);

  useEffect(() => {
    if (mode === "site" && executionMode === "native") return;
    void window.toraseo.runtime.endChatWindowSession();
  }, [executionMode, mode]);

  useEffect(() => {
    if (mode !== "idle") return;
    void window.toraseo.runtime.endReportWindowSession();
  }, [mode]);

  useEffect(() => {
    if (!returnHomeShortcutsEnabled) return;

    const isEditableTarget = (target: EventTarget | null) => {
      const element = target as HTMLElement | null;
      if (!element) return false;
      return Boolean(
        element.closest("input, textarea, select, [contenteditable='true']"),
      );
    };

    const maybeNavigateBack = (event: KeyboardEvent | MouseEvent) => {
      if (mode === "idle") return;
      if (isEditableTarget(event.target)) return;
      const now = Date.now();
      if (now - backShortcutTimerRef.current < 250) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      backShortcutTimerRef.current = now;
      event.preventDefault();
      event.stopPropagation();
      handleNavigateBack();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "BrowserBack") {
        maybeNavigateBack(event);
        return;
      }
      if (event.altKey && event.key === "ArrowLeft") {
        maybeNavigateBack(event);
      }
    };

    const handleMouseBack = (event: MouseEvent) => {
      if (event.button === 3) {
        maybeNavigateBack(event);
      }
    };

    window.addEventListener("keydown", handleKeyDown, true);
    window.addEventListener("mousedown", handleMouseBack, true);
    window.addEventListener("mouseup", handleMouseBack, true);
    window.addEventListener("auxclick", handleMouseBack, true);
    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
      window.removeEventListener("mousedown", handleMouseBack, true);
      window.removeEventListener("mouseup", handleMouseBack, true);
      window.removeEventListener("auxclick", handleMouseBack, true);
    };
  }, [mode, returnHomeShortcutsEnabled, settingsReturnTarget]);

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
          if (session.analysisType === "article_text") {
            setArticleTextScanStartedOnce(true);
          }
          if (session.analysisType === "article_compare") {
            setArticleCompareStartedOnce(true);
          }
        }
        if (
          session.status === "active" &&
          (session.analysisType === "article_text" ||
            session.analysisType === "article_compare") &&
          (session.articleTextRunState === "complete" ||
            session.articleTextRunState === "failed")
        ) {
          if (session.analysisType === "article_text") {
            setNativeArticleTextActiveRun(null);
          } else {
            setNativeArticleCompareActiveRun(null);
          }
          if (session.articleTextRunState === "failed") {
            setPreflightError(
              session.articleTextRunError ||
                t("preflight.articleTextAiReportFailed", {
                  defaultValue:
                    "AI returned an answer, but ToraSEO could not convert it into a structured report.",
                }),
            );
          }
        }
      },
    );
    return unsubscribe;
  }, [t]);

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
            defaultValue:
              "Choose the AI provider model before starting analysis.",
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
    ) : mode === "analysis" && selectedAnalysisType ? (
      <AnalysisDraftSidebar
        analysisType={selectedAnalysisType}
        selectedTools={selectedAnalysisToolsByType[selectedAnalysisType]}
        analysisRole={analysisRole}
        textPlatform={textPlatform}
        customPlatform={customPlatform}
        onAnalysisRoleChange={setAnalysisRole}
        onTextPlatformChange={setTextPlatform}
        onCustomPlatformChange={setCustomPlatform}
        onToggleTool={handleToggleAnalysisTool}
        onToggleAllTools={handleToggleAllAnalysisTools}
        onReturnHome={handleReturnHome}
      />
    ) : (
      <ActiveSidebar
        url={url}
        onUrlChange={setUrl}
        selectedTools={selectedTools}
        onToggleTool={handleToggleTool}
        onToggleAllTools={handleToggleAllTools}
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
        <TopToolbar
          onOpenSettings={handleOpenSettings}
          onOpenDocumentation={handleOpenDocumentation}
          onOpenChangelog={handleOpenChangelog}
          onOpenToolCatalog={handleOpenToolCatalog}
          onOpenFaq={handleOpenFaq}
        />
        <div className="flex flex-1 overflow-hidden">
          <SettingsView
            currentLocale={currentLocale}
            initialTab={settingsInitialTab}
            returnHomeShortcutsEnabled={returnHomeShortcutsEnabled}
            onReturnHomeShortcutsChange={handleReturnHomeShortcutsChange}
            onReturnHome={() => {
              setSettingsReturnTarget(null);
              setMode("idle");
              setSelectedAnalysisType(null);
              setArticleTextScanStartedOnce(false);
              setArticleTextSolutionProvidedOnce(false);
              setNativeArticleTextState(null);
              setNativeArticleTextActiveRun(null);
              void refreshProviders();
              void window.toraseo.runtime.endChatWindowSession();
              void window.toraseo.runtime.endReportWindowSession();
            }}
            onSaveLocale={handleSaveLocale}
            nativeRuntimeEnabled={true}
            onProviderSaved={handleProviderSaved}
          />
        </div>
        {bridgeSetupPromptNotice && (
          <BridgeSetupPromptNotice
            bridgeClient={bridgeSetupPromptNotice}
            onDismiss={dismissBridgeSetupPromptNotice}
          />
        )}
        <WindowSizeOverlay />
        <UpdateNotification />
      </div>
    );
  }

  if (mode === "toolCatalog") {
    return (
      <div className="flex h-full flex-col bg-orange-50/30">
        <TopToolbar
          onOpenSettings={handleOpenSettings}
          onOpenDocumentation={handleOpenDocumentation}
          onOpenChangelog={handleOpenChangelog}
          onOpenToolCatalog={handleOpenToolCatalog}
          onOpenFaq={handleOpenFaq}
        />
        <div className="flex flex-1 overflow-hidden">
          <ToolCatalogView
            currentLocale={currentLocale}
            onReturnHome={handleReturnHome}
          />
        </div>
        {bridgeSetupPromptNotice && (
          <BridgeSetupPromptNotice
            bridgeClient={bridgeSetupPromptNotice}
            onDismiss={dismissBridgeSetupPromptNotice}
          />
        )}
        <WindowSizeOverlay />
        <UpdateNotification />
      </div>
    );
  }

  if (mode === "faq") {
    return (
      <div className="flex h-full flex-col bg-orange-50/30">
        <TopToolbar
          onOpenSettings={handleOpenSettings}
          onOpenDocumentation={handleOpenDocumentation}
          onOpenChangelog={handleOpenChangelog}
          onOpenToolCatalog={handleOpenToolCatalog}
          onOpenFaq={handleOpenFaq}
        />
        <div className="flex flex-1 overflow-hidden">
          <FaqView onReturnHome={handleReturnHome} />
        </div>
        {bridgeSetupPromptNotice && (
          <BridgeSetupPromptNotice
            bridgeClient={bridgeSetupPromptNotice}
            onDismiss={dismissBridgeSetupPromptNotice}
          />
        )}
        <WindowSizeOverlay />
        <UpdateNotification />
      </div>
    );
  }

  if (mode === "documentation") {
    return (
      <div className="flex h-full flex-col bg-orange-50/30">
        <TopToolbar
          onOpenSettings={handleOpenSettings}
          onOpenDocumentation={handleOpenDocumentation}
          onOpenChangelog={handleOpenChangelog}
          onOpenToolCatalog={handleOpenToolCatalog}
          onOpenFaq={handleOpenFaq}
        />
        <div className="flex flex-1 overflow-hidden">
          <DocumentationView
            currentLocale={currentLocale}
            onReturnHome={handleReturnHome}
          />
        </div>
        {bridgeSetupPromptNotice && (
          <BridgeSetupPromptNotice
            bridgeClient={bridgeSetupPromptNotice}
            onDismiss={dismissBridgeSetupPromptNotice}
          />
        )}
        <WindowSizeOverlay />
        <UpdateNotification />
      </div>
    );
  }

  if (mode === "changelog") {
    return (
      <div className="flex h-full flex-col bg-orange-50/30">
        <TopToolbar
          onOpenSettings={handleOpenSettings}
          onOpenDocumentation={handleOpenDocumentation}
          onOpenChangelog={handleOpenChangelog}
          onOpenToolCatalog={handleOpenToolCatalog}
          onOpenFaq={handleOpenFaq}
        />
        <div className="flex flex-1 overflow-hidden">
          <ChangelogView
            currentLocale={currentLocale}
            onReturnHome={handleReturnHome}
          />
        </div>
        {bridgeSetupPromptNotice && (
          <BridgeSetupPromptNotice
            bridgeClient={bridgeSetupPromptNotice}
            onDismiss={dismissBridgeSetupPromptNotice}
          />
        )}
        <WindowSizeOverlay />
        <UpdateNotification />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-orange-50/30">
      <TopToolbar
        onOpenSettings={handleOpenSettings}
        onOpenDocumentation={handleOpenDocumentation}
        onOpenChangelog={handleOpenChangelog}
        onOpenToolCatalog={handleOpenToolCatalog}
        onOpenFaq={handleOpenFaq}
      />
      <div className="flex flex-1 overflow-hidden">
        <aside
          className="relative shrink-0"
          style={{ width: sidebarWidth }}
        >
          {sidebar}
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label={t("sidebar.resizeHandle", {
              defaultValue: "Resize sidebar",
            })}
            title={t("sidebar.resizeHandle", {
              defaultValue: "Resize sidebar",
            })}
            onMouseDown={handleSidebarResizeStart}
            onDoubleClick={handleSidebarResizeDoubleClick}
            className="group absolute right-0 top-0 z-30 flex h-full w-3 translate-x-1/2 cursor-col-resize items-center justify-center"
          >
            <span className="h-12 w-1 rounded-full bg-outline-900/10 transition group-hover:bg-primary/70" />
          </div>
        </aside>
        <SidebarWidthOverlay
          width={sidebarWidth}
          visible={sidebarWidthOverlayVisible}
        />

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
              onPickCodexPath={pickCodexPath}
              onCopyCodexSetupPrompt={handleCopyCodexSetupPrompt}
              onCopyBridgeSetupPrompt={handleCopyBridgeSetupPrompt}
              onModelProfileChange={handleModelProfileChange}
              onOpenProviderSettings={handleOpenProviderSettings}
              onOpenClaude={openClaude}
              onPickClaudePath={pickClaudePath}
              onPickMcpConfig={pickMcpConfig}
              onClearManualMcpConfig={clearManualMcpConfig}
              onDownloadSkillZip={downloadSkillZip}
              onOpenSkillReleasesPage={openSkillReleasesPage}
              onConfirmSkillInstalled={confirmSkillInstalled}
              onClearSkillConfirmation={clearSkillConfirmation}
              onSelect={handleModeSelect}
            />
          ) : mode === "analysis" && selectedAnalysisType ? (
            <PlannedAnalysisView
              analysisType={selectedAnalysisType}
              executionMode={executionMode}
              selectedToolIds={Array.from(
                selectedAnalysisToolsByType[selectedAnalysisType],
              )}
              activeRun={activeArticleTextRun}
              completedArticleTextAction={displayedCompletedArticleTextAction}
              completedTools={plannedCompletedTools}
              totalTools={plannedTotalTools}
              bridgeState={bridge.state}
              articleTextState={displayedArticleTextState}
              runtimeReport={runtimeReport}
              articleCompareInput={articleCompareInput}
              scanStartedOnce={articleTextScanStartedOnce}
              compareStartedOnce={articleCompareStartedOnce}
              solutionProvidedOnce={articleTextSolutionProvidedOnce}
              bridgeUnavailable={
                executionMode === "bridge" &&
                bridgeExternalAppClosed &&
                !claudeSkillFallbackAvailable
              }
              bridgeUnavailableAppName={bridgeExternalAppName}
              bridgeTargetAppName={bridgeExternalAppName}
              onArticleTextRun={handleRunArticleTextBridge}
              onArticleTextCancel={handleCancelArticleTextBridge}
              onArticleCompareRun={handleRunArticleCompare}
              onArticleCompareCancel={handleCancelArticleCompare}
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
          {codexClosedNotice && mode !== "idle" && (
            <CodexClosedNotice
              message={codexClosedNotice}
              shake={codexClosedNoticeShake}
              onDismiss={handleDismissCodexClosedNotice}
            />
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
      {bridgeSetupPromptNotice && (
        <BridgeSetupPromptNotice
          bridgeClient={bridgeSetupPromptNotice}
          onDismiss={dismissBridgeSetupPromptNotice}
        />
      )}
      <WindowSizeOverlay />
    </div>
  );
}

function CodexClosedNotice({
  message,
  shake,
  onDismiss,
}: {
  message: string;
  shake: boolean;
  onDismiss: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="pointer-events-none fixed bottom-6 right-6 z-[60] w-[360px] max-w-[calc(100vw-32px)]">
      <div
        className={`pointer-events-auto rounded-lg border border-red-200 bg-white px-4 py-3 shadow-xl ${
          shake ? "toraseo-shake" : ""
        }`}
      >
        <div className="flex items-start gap-3">
          <span className="mt-0.5 rounded-md bg-red-50 p-2 text-red-600">
            <AlertTriangle size={16} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-sm font-semibold text-outline-900">
                {t("preflight.codexClosedTitle", {
                  defaultValue: "Codex unavailable",
                })}
              </h3>
              <button
                type="button"
                onClick={onDismiss}
                aria-label={t("common.close")}
                className="rounded-md p-1 text-outline-900/45 transition hover:bg-red-50 hover:text-outline-900"
              >
                <X size={14} />
              </button>
            </div>
            <p className="mt-1 text-sm leading-relaxed text-outline-900/70">
              {message}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function BridgeSetupPromptNotice({
  bridgeClient,
  onDismiss,
}: {
  bridgeClient: BridgeClient;
  onDismiss: () => void;
}) {
  const { t } = useTranslation();
  const appName = bridgeClient === "codex" ? "Codex" : "Claude Desktop";

  return (
    <div className="pointer-events-none fixed bottom-6 right-6 z-[70] w-[430px] max-w-[calc(100vw-32px)]">
      <div className="pointer-events-auto overflow-hidden rounded-lg border border-primary/30 bg-white shadow-xl">
        <div className="px-4 py-3">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 rounded-md bg-primary/10 p-2 text-primary">
              <Clipboard size={16} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-3">
                <h3 className="text-sm font-semibold text-outline-900">
                  {t("modeSelection.bridge.setupPromptNoticeTitle", {
                    defaultValue: "Промпт проверки скопирован",
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
                {t("modeSelection.bridge.setupPromptNoticeBody", {
                  appName,
                  defaultValue:
                    "Откройте новую сессию в {{appName}}, вставьте промпт и нажмите Enter. Так можно проверить, видит ли {{appName}} ToraSEO SKILL и MCP.",
                })}
              </p>
            </div>
          </div>
        </div>
        <div className="h-1 bg-primary/15">
          <div className="h-full bg-primary toraseo-toast-progress" />
        </div>
      </div>
    </div>
  );
}

function CodexPromptHelper({ onDismiss }: { onDismiss: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="pointer-events-none fixed bottom-6 right-6 z-40 w-[420px] max-w-[calc(100vw-32px)]">
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
