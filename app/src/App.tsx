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
  type PageByUrlPromptData,
  type SiteComparePromptData,
} from "./components/MainArea/PlannedAnalysisView";
import ChangelogView from "./components/Changelog/ChangelogView";
import DocumentationView from "./components/Documentation/DocumentationView";
import FaqView from "./components/FAQ/FaqView";
import { LaboratoryPlaceholderView } from "./components/Laboratory";
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

import type {
  BridgeClient,
  CurrentScanState,
  ScanComplete,
  StageUpdate,
  SupportedLocale,
} from "./types/ipc";
import type {
  AuditExecutionMode,
  ProviderId,
  ProviderInfo,
  RuntimeArticleCompareGoalMode,
  RuntimeAuditReport,
  RuntimeChatWindowSession,
  RuntimeSiteCompareContext,
  RuntimeSiteCompareToolResult,
} from "./types/runtime";

export type AppMode =
  | "idle"
  | "site"
  | "analysis"
  | "settings"
  | "documentation"
  | "changelog"
  | "toolCatalog"
  | "qualityLab"
  | "formulas"
  | "faq";

type NavigationTarget = {
  mode: Exclude<
    AppMode,
    | "settings"
    | "documentation"
    | "changelog"
    | "toolCatalog"
    | "qualityLab"
    | "formulas"
    | "faq"
  >;
  selectedAnalysisType: AnalysisTypeId | null;
};

type SettingsTab = "general" | "language" | "providers";

type ReferenceMode = Extract<
  AppMode,
  "documentation" | "changelog" | "toolCatalog" | "qualityLab" | "formulas" | "faq"
>;

type PendingAnalysisExitTarget =
  | { type: "home" }
  | { type: "settings"; tab: SettingsTab }
  | { type: "reference"; mode: ReferenceMode };

type ProviderModelOption = {
  id: string;
  sourceProfileId: string;
  providerId: ProviderId;
  providerLabel: string;
  displayName: string;
  modelId: string;
  usageHint?: string;
};

const EXECUTION_MODE_STORAGE_KEY = "toraseo.executionMode";
const BRIDGE_PROGRAM_STORAGE_KEY = "toraseo.bridgeProgram";
const LEGACY_OPENROUTER_MODEL_STORAGE_KEY = "toraseo.openrouterModelProfileId";
const PROVIDER_MODEL_STORAGE_KEY = "toraseo.providerModelProfileId";
const SIDEBAR_WIDTH_STORAGE_KEY = "toraseo.sidebarWidth";
const RETURN_HOME_SHORTCUTS_STORAGE_KEY = "toraseo.returnHomeShortcuts";
const SIDEBAR_DEFAULT_WIDTH = 260;
const SIDEBAR_MIN_WIDTH = 220;
const SIDEBAR_MAX_WIDTH = 390;
const BUILT_IN_ARTICLE_TEXT_TOOLS = [
  "article_uniqueness",
  "language_syntax",
  "ai_writing_probability",
  "genericness_water_check",
  "readability_complexity",
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
const BUILT_IN_PAGE_BY_URL_TOOLS = [
  "check_robots_txt",
  "analyze_meta",
  "analyze_headings",
  "analyze_content",
  "detect_stack",
  "extract_main_text",
  "article_uniqueness",
  "language_syntax",
  "ai_writing_probability",
  "genericness_water_check",
  "readability_complexity",
  "naturalness_indicators",
  "logic_consistency_check",
  "intent_seo_forecast",
  "safety_science_review",
] as const;
const BUILT_IN_SITE_COMPARE_TOOLS = [
  "scan_site_minimal",
  "analyze_indexability",
  "check_robots_txt",
  "analyze_sitemap",
  "check_redirects",
  "analyze_meta",
  "analyze_canonical",
  "analyze_headings",
  "analyze_content",
  "analyze_links",
  "compare_site_positioning",
  "compare_site_metadata",
  "compare_site_structure",
  "compare_site_content_depth",
  "compare_site_technical_basics",
  "compare_site_delta",
  "compare_site_direction_matrix",
  "compare_site_competitive_insights",
  "compare_strengths_weaknesses",
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

function effectivePageByUrlToolIds(
  selectedToolIds: Iterable<AnalysisToolId>,
): string[] {
  const result = Array.from(selectedToolIds, String);
  for (const toolId of BUILT_IN_PAGE_BY_URL_TOOLS) {
    if (!result.includes(toolId)) result.push(toolId);
  }
  return result;
}

function effectiveSiteCompareToolIds(
  selectedToolIds: Iterable<AnalysisToolId>,
): string[] {
  const result = Array.from(selectedToolIds, String);
  for (const toolId of BUILT_IN_SITE_COMPARE_TOOLS) {
    if (!result.includes(toolId)) result.push(toolId);
  }
  return result;
}

function siteToolIdsFromAnalysisTools(toolIds: string[]): ToolId[] {
  const siteIds = new Set(TOOLS.map((tool) => tool.id));
  const result = toolIds.filter((toolId): toolId is ToolId =>
    siteIds.has(toolId as ToolId),
  );
  if (!result.includes("analyze_content")) result.push("analyze_content");
  return Array.from(new Set(result));
}

async function runSingleNativeSiteCompareScan(
  url: string,
  toolIds: ToolId[],
): Promise<RuntimeSiteCompareToolResult[]> {
  if (typeof window === "undefined" || !window.toraseo) {
    return toolIds.map((toolId) => ({
      url,
      toolId,
      status: "error",
      errorCode: "preload_missing",
      errorMessage: "ToraSEO preload API is unavailable.",
    }));
  }

  return new Promise((resolve) => {
    const results = new Map<string, RuntimeSiteCompareToolResult>();
    let activeScanId: string | null = null;
    let settled = false;
    let unsubscribeUpdate: (() => void) | null = null;
    let unsubscribeComplete: (() => void) | null = null;
    const earlyUpdates: StageUpdate[] = [];
    const earlyCompletes: ScanComplete[] = [];

    const finish = () => {
      if (settled) return;
      settled = true;
      unsubscribeUpdate?.();
      unsubscribeComplete?.();
      resolve(
        toolIds.map(
          (toolId) =>
            results.get(toolId) ?? {
              url,
              toolId,
              status: "error",
              errorCode: "missing_stage",
              errorMessage: "The scan finished without a tool result.",
            },
        ),
      );
    };

    const acceptUpdate = (update: StageUpdate) => {
      if (!activeScanId || update.scanId !== activeScanId) return;
      if (update.status === "pending" || update.status === "running") return;
      results.set(update.toolId, {
        url,
        toolId: update.toolId,
        status: update.status,
        summary: update.summary,
        result: update.result,
        errorCode: update.errorCode,
        errorMessage: update.errorMessage,
      });
    };
    const acceptComplete = (complete: ScanComplete) => {
      if (!activeScanId || complete.scanId !== activeScanId) return;
      finish();
    };

    unsubscribeUpdate = window.toraseo.onStageUpdate((update) => {
      if (!activeScanId) {
        earlyUpdates.push(update);
        return;
      }
      acceptUpdate(update);
    });
    unsubscribeComplete = window.toraseo.onScanComplete((complete) => {
      if (!activeScanId) {
        earlyCompletes.push(complete);
        return;
      }
      acceptComplete(complete);
    });

    window.toraseo
      .startScan({ url, toolIds })
      .then(({ scanId }) => {
        activeScanId = scanId;
        earlyUpdates.forEach(acceptUpdate);
        earlyCompletes.forEach(acceptComplete);
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        for (const toolId of toolIds) {
          results.set(toolId, {
            url,
            toolId,
            status: "error",
            errorCode: "ipc_failure",
            errorMessage: message,
          });
        }
        finish();
      });
  });
}

async function runNativeSiteCompareScans(
  urls: string[],
  toolIds: ToolId[],
): Promise<RuntimeSiteCompareToolResult[]> {
  const batches: RuntimeSiteCompareToolResult[][] = [];
  for (const url of urls) {
    batches.push(await runSingleNativeSiteCompareScan(url, toolIds));
  }
  return batches.flat();
}

function extractedMainTextFromAnalyzeContent(result: unknown): string {
  const data = result as {
    main_text?: unknown;
    text_blocks?: unknown;
    summary?: { word_count?: unknown };
  };
  if (typeof data.main_text === "string" && data.main_text.trim()) {
    return data.main_text.trim();
  }
  if (Array.isArray(data.text_blocks)) {
    return data.text_blocks
      .filter((block): block is string => typeof block === "string")
      .join("\n\n")
      .trim();
  }
  return "";
}

function normalizePageAnalysisUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  try {
    const url = new URL(trimmed);
    const unwrapParams = [
      "url",
      "u",
      "target",
      "to",
      "redirect",
      "redirect_url",
      "redirectUrl",
      "amp_url",
      "ampUrl",
    ];
    for (const key of unwrapParams) {
      const nested = url.searchParams.get(key);
      if (nested && /^https?:\/\//i.test(nested)) {
        return normalizePageAnalysisUrl(nested);
      }
    }

    for (const key of Array.from(url.searchParams.keys())) {
      if (
        /^(utm_|fbclid$|gclid$|yclid$|mc_|_hs|igshid$|ref$|referrer$|spm$|feature$|source$)/i.test(
          key,
        )
      ) {
        url.searchParams.delete(key);
      }
    }
    url.hash = "";
    const cleaned = url.toString();
    try {
      return decodeURI(cleaned);
    } catch {
      return cleaned;
    }
  } catch {
    return trimmed;
  }
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

function fallbackToolNames(toolIds: string[], locale: SupportedLocale): string {
  const defaults: Record<string, { ru: string; en: string }> = {
    ai_trace_map: { ru: "Карта AI-фрагментов", en: "AI trace map" },
    genericness_water_check: {
      ru: "Водность и шаблонность",
      en: "Genericness and watery text",
    },
    readability_complexity: {
      ru: "Читаемость и сложность",
      en: "Readability and complexity",
    },
    claim_source_queue: {
      ru: "Очередь фактов на проверку",
      en: "Claim source queue",
    },
  };
  return toolIds
    .map((toolId) =>
      i18n.t(`analysisTools.${toolId}.label`, {
        lng: locale,
        defaultValue: defaults[toolId]?.[locale] ?? toolId,
      }),
    )
    .join(", ");
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
    "Use ToraSEO Claude Bridge Instructions.",
    "",
    "/toraseo chat-only-fallback article-text",
    "",
    "ToraSEO Desktop App and/or MCP are unavailable right now, but the SKILL is installed.",
    "If you can load the SKILL, read only references/chat-only-fallback.md and avoid extra fallback files when the bridge path works.",
    "Do not call MCP tools when they are unavailable. Do not claim that results were written into the app or results/*.json.",
    "Use normal check names in the user-facing response, not internal tool ids.",
    "Do the analysis directly in chat using ToraSEO rules: keep facts separate from hypotheses, be careful with medical, legal, and financial claims, and do not promise rankings.",
    "",
    `Interface locale: ${options.locale}`,
    "Language rule: reply in the interface language by default. Only switch to another language if the user explicitly changed language in their own new message.",
    `Analysis type: ${options.action === "solution" ? "propose a text solution" : "text analysis"}`,
    `Platform: ${options.textPlatform}`,
    options.customPlatform ? `Custom platform: ${options.customPlatform}` : null,
    options.analysisRole ? `Analysis role/goal: ${options.analysisRole}` : null,
    `Selected ToraSEO checks: ${fallbackToolNames(options.selectedTools, options.locale)}`,
    "Keep AI-writing checks, AI trace map, genericness and watery text, readability and complexity, and claim source queue separate in the report: these are different editorial signals, not one detector.",
    "",
    "Topic/title:",
    options.data.topic.trim() || "Not specified.",
    "",
    "Text:",
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
    "Use ToraSEO Claude Bridge Instructions.",
    "",
    "/toraseo chat-only-fallback article-compare",
    "",
    "ToraSEO Desktop App and/or MCP are unavailable right now, but the SKILL is installed.",
    "If you can load the SKILL, read only references/chat-only-fallback.md and avoid extra fallback files when the bridge path works.",
    "Do not call MCP tools when they are unavailable. Do not claim that results were written into the app or results/*.json.",
    "Use normal check names in the user-facing response, not internal tool ids.",
    "Build the comparison report directly in chat. If the analysis goal focuses on Text A or Text B, do not over-explain the second text beyond what the comparison needs.",
    "Do not claim ranking causes from two texts alone. Focus on text advantages, gaps, similarity risk, and the improvement plan.",
    "",
    `Interface locale: ${options.locale}`,
    "Language rule: reply in the interface language by default. Only switch to another language if the user explicitly changed language in their own new message.",
    `Analysis goal mode: ${options.goalMode}`,
    `Analysis goal: ${options.data.goal.trim() || "Not specified. Use the standard comparison report."}`,
    `Platform: ${options.textPlatform}`,
    options.customPlatform ? `Custom platform: ${options.customPlatform}` : null,
    `Role of Text A: ${options.data.roleA}`,
    `Role of Text B: ${options.data.roleB}`,
    `Selected ToraSEO checks: ${fallbackToolNames(options.selectedTools, options.locale)}`,
    "",
    "Required report blocks:",
    "1. A short summary aligned to the analysis goal.",
    "2. Compare intent, structure, completeness, semantic coverage, specificity, trust, style, title and click potential, and platform fit.",
    "3. Similarity risk: keep exact overlap separate from semantic closeness; do not describe a local metric as an external plagiarism check.",
    "4. Strengths and weaknesses in one compact, readable column.",
    "5. Content gap in plain language: what exists in one text and is missing from the other.",
    "6. An improvement plan tied to the user's goal.",
    "",
    "Text A:",
    options.data.textA,
    "",
    "Text B:",
    options.data.textB,
  ]);
}

function buildClaudeSkillFallbackPageByUrlPrompt(options: {
  data: PageByUrlPromptData;
  locale: SupportedLocale;
  textPlatform: string;
  customPlatform?: string;
  analysisRole?: string;
  selectedTools: string[];
}): string {
  return joinPromptLines([
    "Use ToraSEO Claude Bridge Instructions.",
    "",
    "/toraseo chat-only-fallback page-by-url",
    "",
    "ToraSEO Desktop App and/or MCP are unavailable right now, but the SKILL is installed.",
    "Do the page-by-URL analysis directly in chat using ToraSEO text-analysis rules.",
    "If the excerpt below is filled in, treat it as the main page text. If you only have a URL and no accessible text, do not pretend the page was fetched: ask for pasted text, title/meta, or a page excerpt.",
    "If the user provides page text, ignore ads, navigation, comments, related materials, and utility blocks. Do not bypass login walls, paywalls, CAPTCHA, or robots.txt.",
    "Do not claim that results were written into the app or results/*.json. Use normal check names, not internal tool ids.",
    "If Google or Yandex search visibility, clicks, impressions, or demand data are unavailable without Search Console, Yandex Webmaster, or an official SEO provider, state that honestly as a limitation.",
    "",
    `Interface locale: ${options.locale}`,
    "Language rule: reply in the interface language by default. Only switch to another language if the user explicitly changed language in their own new message.",
    `URL: ${options.data.url}`,
    `Platform: ${options.textPlatform}`,
    options.customPlatform ? `Custom platform: ${options.customPlatform}` : null,
    options.analysisRole ? `Analysis role/goal: ${options.analysisRole}` : null,
    `Selected ToraSEO checks: ${fallbackToolNames(options.selectedTools, options.locale)}`,
    "Keep AI-writing checks, AI trace map, genericness and watery text, readability and complexity, and claim source queue separate in the report: these are different editorial signals, not one detector.",
    "",
    "If the user-provided excerpt below is filled in, analyze it as the main page text:",
    options.data.textBlock.trim() ||
      "No excerpt was provided. Without accessible text, do not claim that the page was analyzed; provide a checklist of what to paste for a chat-based review.",
  ]);
}

function buildClaudeSkillFallbackSiteByUrlPrompt(options: {
  url: string;
  locale: SupportedLocale;
  selectedTools: string[];
}): string {
  return joinPromptLines([
    "Use ToraSEO Claude Bridge Instructions.",
    "",
    "/toraseo chat-only-fallback site-by-url",
    "",
    "ToraSEO Desktop App and/or MCP are unavailable, but the SKILL is installed.",
    "Read only references/chat-only-fallback.md for this fallback path. Do not call MCP tools and do not claim that the app report was updated.",
    "If you can browse the public URL in your current environment, analyze only observable evidence. If browsing is unavailable, do not pretend that the page or site was fetched; ask for pasted page text, title/meta, screenshots, or exported facts.",
    "Return the result directly in chat with normal check names, not internal tool ids. Keep facts separate from assumptions.",
    "",
    `Interface locale: ${options.locale}`,
    "Language rule: reply in the interface language by default. Only switch to another language if the user explicitly changed language in their own new message.",
    `URL: ${options.url}`,
    `Selected ToraSEO checks: ${fallbackToolNames(options.selectedTools, options.locale)}`,
  ]);
}

function buildClaudeSkillFallbackSiteComparePrompt(options: {
  data: SiteComparePromptData;
  locale: SupportedLocale;
  selectedTools: string[];
}): string {
  return joinPromptLines([
    "Use ToraSEO Claude Bridge Instructions.",
    "",
    "/toraseo chat-only-fallback site-compare",
    "",
    "ToraSEO Desktop App and/or MCP are unavailable, but the SKILL is installed.",
    "Read only references/chat-only-fallback.md for this fallback path. Do not call MCP tools and do not claim that the app report was updated.",
    "Build one compact competitive comparison in chat when evidence is available: summary, site KPI cards, comparative metrics, direction heatmap, winners by block, and actionable insights.",
    "Do not render three full audits side by side. If browsing is unavailable and only URLs were provided, say that live site facts were not fetched and ask for page text, screenshots, or exported facts.",
    "",
    `Interface locale: ${options.locale}`,
    "Language rule: reply in the interface language by default. Only switch to another language if the user explicitly changed language in their own new message.",
    `URLs: ${options.data.urls.join(", ")}`,
    `Focus: ${options.data.focus || "Not specified"}`,
    `Selected ToraSEO checks: ${fallbackToolNames(options.selectedTools, options.locale)}`,
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

function readPersistedBridgeProgram(): BridgeProgram | null {
  const value = window.localStorage.getItem(BRIDGE_PROGRAM_STORAGE_KEY);
  return value === "codex" || value === "claude" ? value : null;
}

function persistBridgeProgram(program: BridgeProgram): void {
  window.localStorage.setItem(BRIDGE_PROGRAM_STORAGE_KEY, program);
}

function providerModelOptionId(providerId: ProviderId, profileId: string): string {
  return `${providerId}:${profileId}`;
}

function readSelectedProviderModel(): string | null {
  return (
    window.localStorage.getItem(PROVIDER_MODEL_STORAGE_KEY) ??
    window.localStorage.getItem(LEGACY_OPENROUTER_MODEL_STORAGE_KEY)
  );
}

function persistSelectedProviderModel(profileId: string): void {
  window.localStorage.setItem(PROVIDER_MODEL_STORAGE_KEY, profileId);
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
      image_analysis: getDefaultAnalysisToolSet("image_analysis"),
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
  const [pageByUrlStartedOnce, setPageByUrlStartedOnce] = useState(false);
  const [pageByUrlInput, setPageByUrlInput] =
    useState<PageByUrlPromptData | null>(null);
  const [nativePageByUrlActiveRun, setNativePageByUrlActiveRun] =
    useState<"scan" | null>(null);
  const [articleCompareStartedOnce, setArticleCompareStartedOnce] =
    useState(false);
  const [nativeArticleCompareActiveRun, setNativeArticleCompareActiveRun] =
    useState<"scan" | null>(null);
  const [articleCompareInput, setArticleCompareInput] =
    useState<ArticleComparePromptData | null>(null);
  const [siteCompareStartedOnce, setSiteCompareStartedOnce] = useState(false);
  const [siteCompareInput, setSiteCompareInput] =
    useState<SiteComparePromptData | null>(null);
  const [nativeSiteCompareActiveRun, setNativeSiteCompareActiveRun] =
    useState<"scan" | null>(null);
  const [preflightError, setPreflightError] = useState<string | null>(null);
  const [codexClosedNotice, setCodexClosedNotice] = useState<string | null>(
    null,
  );
  const [codexClosedNoticeShake, setCodexClosedNoticeShake] = useState(false);
  const [executionModeDraft, setExecutionModeDraft] =
    useState<AuditExecutionMode>(() => readPersistedExecutionMode() ?? "bridge");
  const [confirmedExecutionMode, setConfirmedExecutionMode] =
    useState<AuditExecutionMode | null>(() => readPersistedExecutionMode());
  const [bridgeProgram, setBridgeProgram] =
    useState<BridgeProgram>(() => readPersistedBridgeProgram() ?? "codex");
  const [settingsInitialTab, setSettingsInitialTab] =
    useState<"general" | "language" | "providers">("general");
  const [settingsReturnTarget, setSettingsReturnTarget] =
    useState<NavigationTarget | null>(null);
  const [referenceReturnTarget, setReferenceReturnTarget] =
    useState<NavigationTarget | null>(null);
  const [pendingAnalysisExitTarget, setPendingAnalysisExitTarget] =
    useState<PendingAnalysisExitTarget | null>(null);
  const [returnHomeShortcutsEnabled, setReturnHomeShortcutsEnabled] =
    useState(readReturnHomeShortcutsEnabled);
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [providersLoading, setProvidersLoading] = useState(true);
  const [selectedModelProfileId, setSelectedModelProfileId] = useState<
    string | null
  >(() => readSelectedProviderModel());
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
  const pageByUrlChatRunRef = useRef<string | null>(null);
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
    installMcpConfig,
    openClaude,
    openCodex,
    pickClaudePath,
    pickCodexPath,
    pickMcpConfig,
    clearManualMcpConfig,
    downloadSkillZip,
    downloadCodexWorkflowZip,
    openSkillReleasesPage,
    confirmSkillInstalled,
    clearSkillConfirmation,
  } = useDetector();
  const { enabled: nativeRuntimeEnabled } = useNativeRuntimeFlag();
  const bridgeStatus = bridge.state?.status;
  const executionMode = confirmedExecutionMode ?? executionModeDraft;
  const providerConfigured = providers.some((provider) => provider.configured);
  const providerModelProfiles: ProviderModelOption[] = useMemo(
    () =>
      providers.flatMap((provider) =>
        provider.modelProfiles.map((profile) => ({
          ...profile,
          id: providerModelOptionId(provider.id, profile.id),
          sourceProfileId: profile.id,
          providerId: provider.id,
          providerLabel: provider.label,
          displayName: profile.displayName,
        })),
      ),
    [providers],
  );
  const selectedModelProfile =
    providerModelProfiles.find(
      (profile) => profile.id === selectedModelProfileId,
    ) ?? null;
  const selectedProviderId = selectedModelProfile?.providerId ?? null;

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
    const configuredDefault = providers
      .filter((provider) => provider.configured)
      .map((provider) =>
        provider.defaultModelProfileId
          ? providerModelOptionId(provider.id, provider.defaultModelProfileId)
          : null,
      )
      .find((value): value is string =>
        Boolean(value && providerModelProfiles.some((profile) => profile.id === value)),
      );
    const fallbackId = configuredDefault ?? providerModelProfiles[0].id;
    setSelectedModelProfileId(fallbackId);
    persistSelectedProviderModel(fallbackId);
  }, [
    providers,
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

  const bridgeAnalysisBusy =
    bridge.state?.status === "awaiting_handshake" ||
    bridge.state?.status === "in_progress";
  const nativeAnalysisBusy =
    scanState === "scanning" ||
    nativeArticleTextActiveRun !== null ||
    nativePageByUrlActiveRun !== null ||
    nativeArticleCompareActiveRun !== null ||
    nativeSiteCompareActiveRun !== null;
  const bridgeSelectedAnalysisComplete =
    executionMode === "bridge" &&
    bridge.state?.status === "complete" &&
    bridge.state.analysisType === selectedAnalysisType;
  const nativeSelectedAnalysisComplete =
    executionMode === "native" && runtimeReport !== null;
  const startedAnalysisWithoutResult =
    mode === "analysis" &&
    !bridgeSelectedAnalysisComplete &&
    !nativeSelectedAnalysisComplete &&
    ((selectedAnalysisType === "article_text" && articleTextScanStartedOnce) ||
      (selectedAnalysisType === "page_by_url" && pageByUrlStartedOnce) ||
      (selectedAnalysisType === "article_compare" && articleCompareStartedOnce) ||
      (selectedAnalysisType === "site_compare" && siteCompareStartedOnce));
  const hasActiveUnfinishedAnalysis =
    mode !== "idle" &&
    mode !== "settings" &&
    mode !== "documentation" &&
    mode !== "changelog" &&
    mode !== "toolCatalog" &&
    mode !== "qualityLab" &&
    mode !== "formulas" &&
    mode !== "faq" &&
    ((executionMode === "bridge" && bridgeAnalysisBusy) ||
      (executionMode === "native" && nativeAnalysisBusy) ||
      startedAnalysisWithoutResult);

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
    await resetAnalysisSession();
    if (selected !== "site_by_url") {
      setSelectedAnalysisType(selected);
      setMode("analysis");
      setPreflightError(null);
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
    if (
      confirmedExecutionMode === "native" &&
      providerConfigured &&
      selectedModelProfile
    ) {
      await window.toraseo.runtime.openChatWindow({
        status: "active",
        locale: currentLocale,
        analysisType: "site",
        selectedProviderId,
        selectedModelProfile,
        scanContext: nativeScanContext,
        articleTextContext: null,
        articleCompareContext: null,
        siteCompareContext: null,
        report: runtimeReport,
      });
    }
    setSelectedAnalysisType(selected);
    setMode("site");
  };

  const resetAnalysisSession = async () => {
    if (bridge.state) {
      await bridge.cancelScan();
      bridge.clearRetainedState();
    }
    setCodexPromptHelperVisible(false);
    setCodexPromptHelperScanId(null);
    setCodexClosedNotice(null);
    setCodexClosedNoticeShake(false);
    if (codexClosedNoticeShakeTimer.current) {
      window.clearTimeout(codexClosedNoticeShakeTimer.current);
      codexClosedNoticeShakeTimer.current = null;
    }
    setArticleTextScanStartedOnce(false);
    setArticleTextSolutionProvidedOnce(false);
    setNativeArticleTextState(null);
    setNativeArticleTextActiveRun(null);
    setPageByUrlStartedOnce(false);
    setPageByUrlInput(null);
    setNativePageByUrlActiveRun(null);
    pageByUrlChatRunRef.current = null;
    setArticleCompareStartedOnce(false);
    setNativeArticleCompareActiveRun(null);
    setArticleCompareInput(null);
    setSiteCompareStartedOnce(false);
    setSiteCompareInput(null);
    setNativeSiteCompareActiveRun(null);
    setRuntimeReport(null);
    setPreflightError(null);
    setAnalysisRole("");
    setReferenceReturnTarget(null);
    setSettingsReturnTarget(null);
    setUrl("");
    await window.toraseo.runtime.endChatWindowSession();
    await window.toraseo.runtime.endReportWindowSession();
  };

  const performReturnHome = async () => {
    await resetAnalysisSession();
    setMode("idle");
    setSelectedAnalysisType(null);
  };

  const handleReturnHome = () => {
    if (hasActiveUnfinishedAnalysis) {
      setPendingAnalysisExitTarget({ type: "home" });
      return;
    }
    void performReturnHome();
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
      mode === "qualityLab" ||
      mode === "formulas" ||
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
    if (providerConfigured && selectedModelProfile) {
      void window.toraseo.runtime.showReportWindowProcessing();
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
      if (fresh.skillInstalled) {
        const orderedIds = TOOLS.map((item) => item.id).filter((id) =>
          selectedTools.has(id),
        );
        const copied = await copyTextToClipboard(
          buildClaudeSkillFallbackSiteByUrlPrompt({
            url: url.trim(),
            locale: currentLocale,
            selectedTools: orderedIds,
          }),
        );
        if (!copied) {
          setPreflightError(
            t("preflight.skillFallbackCopyFailed", {
              defaultValue:
                "Claude Bridge Instructions are installed, but ToraSEO could not copy the fallback prompt.",
            }),
          );
          return;
        }
        showPromptCopiedToast();
        return;
      }
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

  const performOpenSettings = (tab: SettingsTab = "general") => {
    if (
      mode !== "settings" &&
      mode !== "documentation" &&
      mode !== "changelog" &&
      mode !== "toolCatalog" &&
      mode !== "qualityLab" &&
      mode !== "formulas" &&
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

  const handleOpenSettings = (tab: SettingsTab = "general") => {
    performOpenSettings(tab);
  };

  const performOpenReferencePage = (nextMode: ReferenceMode) => {
    if (
      mode !== "settings" &&
      mode !== "documentation" &&
      mode !== "changelog" &&
      mode !== "toolCatalog" &&
      mode !== "qualityLab" &&
      mode !== "formulas" &&
      mode !== "faq"
    ) {
      setReferenceReturnTarget({
        mode,
        selectedAnalysisType,
      });
    }
    setMode(nextMode);
  };

  const openReferencePage = (nextMode: ReferenceMode) => {
    performOpenReferencePage(nextMode);
  };

  const handleConfirmAnalysisExit = () => {
    const target = pendingAnalysisExitTarget;
    setPendingAnalysisExitTarget(null);
    if (!target) return;
    void (async () => {
      if (target.type === "home") {
        await performReturnHome();
        return;
      }
      await resetAnalysisSession();
      setSelectedAnalysisType(null);
      if (target.type === "settings") {
        setSettingsReturnTarget(null);
        setSettingsInitialTab(target.tab);
        setMode("settings");
        return;
      }
      setReferenceReturnTarget(null);
      setMode(target.mode);
    })();
  };

  const handleStayInAnalysis = () => {
    setPendingAnalysisExitTarget(null);
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

  const handleOpenQualityLab = () => {
    openReferencePage("qualityLab");
  };

  const handleOpenFormulas = () => {
    openReferencePage("formulas");
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

  const handleBridgeProgramChange = (next: BridgeProgram) => {
    setBridgeProgram(next);
    persistBridgeProgram(next);
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
    persistSelectedProviderModel(profileId);
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
    executionMode === "native" && selectedAnalysisType === "site_compare"
      ? nativeSiteCompareActiveRun
      : executionMode === "native" && selectedAnalysisType === "article_compare"
      ? nativeArticleCompareActiveRun
      : executionMode === "native" && selectedAnalysisType === "page_by_url"
        ? nativePageByUrlActiveRun
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
        : bridge.state?.analysisType === "page_by_url" &&
            (bridge.state.status === "awaiting_handshake" ||
              bridge.state.status === "in_progress")
          ? "scan"
        : bridge.state?.analysisType === "site_compare" &&
            (bridge.state.status === "awaiting_handshake" ||
              bridge.state.status === "in_progress")
          ? "scan"
        : null;
  const completedArticleTextAction =
    (bridge.state?.analysisType === "article_text" ||
      bridge.state?.analysisType === "article_compare" ||
      bridge.state?.analysisType === "page_by_url" ||
      bridge.state?.analysisType === "site_compare") &&
    bridge.state.status === "complete"
      ? bridge.state.input?.action ?? "scan"
      : null;
  const displayedCompletedArticleTextAction =
    executionMode === "native"
      ? articleTextSolutionProvidedOnce
        ? "solution"
        : runtimeReport && selectedAnalysisType === "article_text"
          ? "scan"
          : runtimeReport && selectedAnalysisType === "page_by_url"
            ? "scan"
          : runtimeReport && selectedAnalysisType === "article_compare"
            ? "scan"
          : runtimeReport && selectedAnalysisType === "site_compare"
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
  const effectivePageByUrlTools =
    selectedAnalysisType === "page_by_url"
      ? effectivePageByUrlToolIds(selectedAnalysisToolsByType.page_by_url)
      : [];
  const effectiveSiteCompareTools =
    selectedAnalysisType === "site_compare"
      ? effectiveSiteCompareToolIds(selectedAnalysisToolsByType.site_compare)
      : [];
  const plannedCompletedTools =
    executionMode === "native" &&
    selectedAnalysisType === "article_text" &&
    runtimeReport
      ? countCoveredReportTools(runtimeReport, effectiveArticleTextTools)
      : executionMode === "native" &&
          selectedAnalysisType === "page_by_url" &&
          runtimeReport
        ? countCoveredReportTools(runtimeReport, effectivePageByUrlTools)
      : executionMode === "native" &&
          selectedAnalysisType === "article_compare" &&
          runtimeReport
        ? countCoveredReportTools(runtimeReport, effectiveArticleCompareTools)
      : executionMode === "native" &&
          selectedAnalysisType === "site_compare" &&
          runtimeReport
        ? countCoveredReportTools(runtimeReport, effectiveSiteCompareTools)
      : displayedArticleTextState?.analysisType === "article_compare"
        ? displayedArticleTextState.selectedTools.filter((toolId) => {
            const entry = displayedArticleTextState.buffer[toolId];
            return entry?.status === "complete" || entry?.status === "error";
          }).length
      : displayedArticleTextState?.analysisType === "site_compare"
        ? displayedArticleTextState.selectedTools.filter((toolId) => {
            const entry = displayedArticleTextState.buffer[toolId];
            return entry?.status === "complete" || entry?.status === "error";
          }).length
      : displayedArticleTextState?.analysisType === "article_text" ||
          displayedArticleTextState?.analysisType === "page_by_url"
        ? displayedArticleTextState.selectedTools.filter((toolId) => {
            const entry = displayedArticleTextState.buffer[toolId];
            return entry?.status === "complete" || entry?.status === "error";
          }).length
      : 0;
  const plannedTotalTools =
    executionMode === "native" && selectedAnalysisType === "article_text"
      ? effectiveArticleTextTools.length
      : executionMode === "native" && selectedAnalysisType === "page_by_url"
        ? effectivePageByUrlTools.length
      : executionMode === "native" && selectedAnalysisType === "article_compare"
        ? effectiveArticleCompareTools.length
      : executionMode === "native" && selectedAnalysisType === "site_compare"
        ? effectiveSiteCompareTools.length
      : displayedArticleTextState?.analysisType === "article_text" ||
          displayedArticleTextState?.analysisType === "article_compare" ||
          displayedArticleTextState?.analysisType === "page_by_url" ||
          displayedArticleTextState?.analysisType === "site_compare"
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

  useEffect(() => {
    if (
      bridge.state?.analysisType === "page_by_url" &&
      bridge.state.status === "complete"
    ) {
      setPageByUrlStartedOnce(true);
    }
    if (
      bridge.state?.analysisType === "article_compare" &&
      bridge.state.status === "complete"
    ) {
      setArticleCompareStartedOnce(true);
    }
    if (
      bridge.state?.analysisType === "site_compare" &&
      bridge.state.status === "complete"
    ) {
      setSiteCompareStartedOnce(true);
    }
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
          selectedProviderId,
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
    } else {
      const fresh = await checkNow();
      if (!fresh.allGreen) {
        if (fresh.skillInstalled) {
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
      selectedAnalysisTools: toolIds,
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
        selectedProviderId,
        selectedModelProfile,
        scanContext: null,
        articleTextContext: null,
        articleCompareContext: null,
        siteCompareContext: null,
        articleTextRunState: "idle",
        report: runtimeReport,
      });
      return;
    }
    void bridge.cancelScan();
  };

  const handleRunPageByUrl = async (
    data: PageByUrlPromptData,
  ): Promise<boolean | "fallback"> => {
    const normalizedData = {
      ...data,
      url: normalizePageAnalysisUrl(data.url),
    };
    const visibleToolIds = Array.from(
      selectedAnalysisToolsByType.page_by_url,
      String,
    );
    const toolIds = effectivePageByUrlToolIds(
      selectedAnalysisToolsByType.page_by_url,
    );

    setPreflightError(null);
    setPageByUrlInput(normalizedData);

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
      } else {
        const fresh = await checkNow();
        if (!fresh.allGreen) {
          if (fresh.skillInstalled) {
            const copied = await copyTextToClipboard(
              buildClaudeSkillFallbackPageByUrlPrompt({
                data: normalizedData,
                locale: currentLocale,
                textPlatform,
                customPlatform: customPlatform.trim() || undefined,
                analysisRole: analysisRole.trim() || undefined,
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
            setPageByUrlStartedOnce(true);
            showPromptCopiedToast();
            return "fallback";
          }
          setPreflightError(t("preflight.depsFailed"));
          return false;
        }
      }

      setPageByUrlStartedOnce(true);
      void window.toraseo.runtime.showReportWindowProcessing();
      await bridge.startScan(normalizedData.url, toolIds, bridgeProgram, {
        action: "scan",
        sourceType: "page_by_url",
        topic: normalizedData.url,
        text: normalizedData.textBlock,
        pageTextBlock: normalizedData.textBlock,
        analysisRole: analysisRole.trim() || undefined,
        textPlatform,
        customPlatform: customPlatform.trim() || undefined,
        selectedAnalysisTools: toolIds,
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

    setRuntimeReport(null);
    setNativeArticleTextState(null);
    setNativePageByUrlActiveRun("scan");
    setPageByUrlStartedOnce(true);
    pageByUrlChatRunRef.current = null;
    void window.toraseo.runtime.showReportWindowProcessing();
    await startScan(normalizedData.url, siteToolIdsFromAnalysisTools(toolIds));
    return true;
  };

  const handleCancelPageByUrl = () => {
    if (executionMode !== "native") {
      void bridge.cancelScan();
      return;
    }
    setNativePageByUrlActiveRun(null);
    void window.toraseo.runtime.updateChatWindowSession({
      status: "active",
      locale: currentLocale,
      analysisType: "article_text",
      selectedProviderId,
      selectedModelProfile,
      scanContext: nativeScanContext,
      articleTextContext: null,
      articleCompareContext: null,
      siteCompareContext: null,
      articleTextRunState: "idle",
      report: runtimeReport,
    });
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
      } else {
        const fresh = await checkNow();
        if (!fresh.allGreen) {
          if (fresh.skillInstalled) {
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
        selectedProviderId,
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
        siteCompareContext: null,
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
      selectedProviderId,
      selectedModelProfile,
      scanContext: null,
      articleTextContext: null,
      articleCompareContext: null,
      siteCompareContext: null,
      articleTextRunState: "idle",
      report: runtimeReport,
    });
  };

  const handleRunSiteCompare = async (
    data: SiteComparePromptData,
  ): Promise<boolean | "fallback"> => {
    const toolIds = effectiveSiteCompareToolIds(
      selectedAnalysisToolsByType.site_compare,
    );
    const normalizedData: SiteComparePromptData = {
      urls: data.urls.map((item) => item.trim()).filter(Boolean).slice(0, 3),
      focus: data.focus.trim(),
    };
    setPreflightError(null);
    setRuntimeReport(null);
    setSiteCompareInput(normalizedData);

    if (executionMode !== "bridge") {
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

      const siteTools = siteToolIdsFromAnalysisTools(toolIds);
      const runId = `site-compare-${Date.now()}`;
      const initialContext: RuntimeSiteCompareContext = {
        runId,
        urls: normalizedData.urls,
        focus: normalizedData.focus,
        selectedTools: toolIds,
        siteTools,
        scanResults: [],
      };
      setNativeSiteCompareActiveRun("scan");
      setSiteCompareStartedOnce(true);
      let result: { ok: boolean };
      try {
        result = await window.toraseo.runtime.openChatWindow({
          status: "active",
          locale: currentLocale,
          analysisType: "site_compare",
          selectedProviderId,
          selectedModelProfile,
          scanContext: null,
          articleTextContext: null,
          articleCompareContext: null,
          siteCompareContext: initialContext,
          articleTextRunState: "running",
          report: null,
        });
      } catch {
        result = { ok: false };
      }
      if (!result.ok) {
        setNativeSiteCompareActiveRun(null);
        setPreflightError(
          t("preflight.nativeUnavailable", {
            defaultValue: "API + AI Chat is unavailable in this build.",
          }),
        );
        return false;
      }

      void (async () => {
        const scanResults = await runNativeSiteCompareScans(
          normalizedData.urls,
          siteTools,
        );
        const completedContext: RuntimeSiteCompareContext = {
          ...initialContext,
          scanResults,
        };
        await window.toraseo.runtime.updateChatWindowSession({
          status: "active",
          locale: currentLocale,
          analysisType: "site_compare",
          selectedProviderId,
          selectedModelProfile,
          scanContext: null,
          articleTextContext: null,
          articleCompareContext: null,
          siteCompareContext: completedContext,
          articleTextRunState: "running",
          report: null,
        });
      })();
      return true;
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
    } else {
      const fresh = await checkNow();
      if (!fresh.allGreen) {
        if (fresh.skillInstalled) {
          const copied = await copyTextToClipboard(
            buildClaudeSkillFallbackSiteComparePrompt({
              data: normalizedData,
              locale: currentLocale,
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
          setSiteCompareStartedOnce(true);
          showPromptCopiedToast();
          return "fallback";
        }
        setPreflightError(t("preflight.depsFailed"));
        return false;
      }
    }

    setSiteCompareStartedOnce(true);
    void window.toraseo.runtime.showReportWindowProcessing();
    const result = await bridge.startScan("toraseo://site-compare", toolIds, bridgeProgram, {
      action: "scan",
      topic: normalizedData.focus,
      siteUrls: normalizedData.urls,
      selectedAnalysisTools: toolIds,
    });
    if (
      bridgeProgram === "codex" &&
      !result.prompt.includes("codex-bridge-mode site-compare")
    ) {
      const fallbackPrompt = [
        "Use $toraseo-codex-workflow.",
        "",
        "/toraseo codex-bridge-mode site-compare",
        "",
        "ToraSEO is waiting for: site comparison by URL.",
        "After the handshake, run only site_compare_internal. Build one competitive comparison dashboard: summary, compact site cards, comparative metrics, direction heatmap, winners by block, and actionable insights. Do not render three full audits side by side. Do not ask the user to send a summary, screenshot, or JSON.",
      ].join("\n");
      await copyTextToClipboard(fallbackPrompt);
    }
    return true;
  };

  const handleCancelSiteCompare = () => {
    if (executionMode !== "native") {
      void bridge.cancelScan();
      return;
    }
    setNativeSiteCompareActiveRun(null);
    void window.toraseo.runtime.updateChatWindowSession({
      status: "active",
      locale: currentLocale,
      analysisType: "site_compare",
      selectedProviderId,
      selectedModelProfile,
      scanContext: null,
      articleTextContext: null,
      articleCompareContext: null,
      siteCompareContext: null,
      articleTextRunState: "idle",
      report: runtimeReport,
    });
  };

  const chatSession = useMemo<RuntimeChatWindowSession>(
    () => ({
      status: "active",
      locale: currentLocale,
      analysisType: "site",
      selectedProviderId,
      selectedModelProfile,
      scanContext: nativeScanContext,
      articleTextContext: null,
      articleCompareContext: null,
      siteCompareContext: null,
      report: runtimeReport,
    }),
    [
      currentLocale,
      nativeScanContext,
      runtimeReport,
      selectedModelProfile,
      selectedProviderId,
    ],
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
    if (
      mode !== "analysis" ||
      selectedAnalysisType !== "page_by_url" ||
      executionMode !== "native" ||
      nativePageByUrlActiveRun !== "scan" ||
      scanState !== "complete" ||
      !pageByUrlInput
    ) {
      return;
    }
    const runKey = `${pageByUrlInput.url}|${pageByUrlInput.textBlock.length}`;
    if (pageByUrlChatRunRef.current === runKey) return;

    const body =
      pageByUrlInput.textBlock.trim() ||
      extractedMainTextFromAnalyzeContent(stages.analyze_content?.result);
    if (!body) {
      setNativePageByUrlActiveRun(null);
      setPreflightError(
        t("preflight.pageByUrlExtractionFailed", {
          defaultValue:
            "Could not extract the main page text. Paste the needed excerpt into the text field and run the analysis again.",
        }),
      );
      return;
    }

    const toolIds = effectivePageByUrlToolIds(
      selectedAnalysisToolsByType.page_by_url,
    );
    pageByUrlChatRunRef.current = runKey;
    void window.toraseo.runtime.openChatWindow({
      status: "active",
      locale: currentLocale,
      analysisType: "article_text",
      selectedProviderId,
      selectedModelProfile,
      scanContext: nativeScanContext,
      articleTextContext: {
        action: "scan",
        runId: `page-url-${Date.now()}`,
        sourceType: "page_by_url",
        topic: pageByUrlInput.url,
        body,
        analysisRole: analysisRole.trim() || undefined,
        textPlatform,
        customPlatform: customPlatform.trim() || undefined,
        selectedTools: toolIds,
      },
      report: null,
      articleTextRunState: "running",
    });
  }, [
    analysisRole,
    currentLocale,
    customPlatform,
    executionMode,
    mode,
    nativePageByUrlActiveRun,
    nativeScanContext,
    pageByUrlInput,
    scanState,
    selectedAnalysisToolsByType.page_by_url,
    selectedAnalysisType,
    selectedModelProfile,
    selectedProviderId,
    stages.analyze_content?.result,
    t,
    textPlatform,
  ]);

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
      if (now - backShortcutTimerRef.current < 900) {
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
  }, [
    activeArticleTextRun,
    bridgeStatus,
    hasActiveUnfinishedAnalysis,
    mode,
    returnHomeShortcutsEnabled,
    scanState,
    settingsReturnTarget,
  ]);

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
            if (selectedAnalysisType === "page_by_url") {
              setPageByUrlStartedOnce(true);
            } else {
              setArticleTextScanStartedOnce(true);
            }
          }
          if (session.analysisType === "article_compare") {
            setArticleCompareStartedOnce(true);
          }
          if (session.analysisType === "site_compare") {
            setSiteCompareStartedOnce(true);
          }
        }
        if (
          session.status === "active" &&
          (session.analysisType === "article_text" ||
            session.analysisType === "article_compare" ||
            session.analysisType === "site_compare") &&
          (session.articleTextRunState === "complete" ||
            session.articleTextRunState === "failed")
        ) {
          if (session.analysisType === "article_text") {
            if (selectedAnalysisType === "page_by_url") {
              setNativePageByUrlActiveRun(null);
            } else {
              setNativeArticleTextActiveRun(null);
            }
          } else {
            if (session.analysisType === "article_compare") {
              setNativeArticleCompareActiveRun(null);
            } else {
              setNativeSiteCompareActiveRun(null);
            }
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
  }, [selectedAnalysisType, t]);

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
      : bridgeProgram === "codex"
        ? (codexPathReady && codexSetupVerified) ||
          Boolean(bridge.state && bridge.state.status !== "complete")
        : !isBridgeBlocked ||
          Boolean(bridge.state && bridge.state.status !== "complete"));

  const scanButtonTooltip =
    executionMode === "bridge" && isBridgeBlocked
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

  const analysisExitModal = pendingAnalysisExitTarget ? (
    <AnalysisExitModal
      onExit={handleConfirmAnalysisExit}
      onStay={handleStayInAnalysis}
    />
  ) : null;

  if (mode === "settings") {
    return (
      <div className="flex h-full flex-col bg-orange-50/30">
        <TopToolbar
          onOpenSettings={handleOpenSettings}
          onOpenDocumentation={handleOpenDocumentation}
          onOpenChangelog={handleOpenChangelog}
          onOpenToolCatalog={handleOpenToolCatalog}
          onOpenQualityLab={handleOpenQualityLab}
          onOpenFormulas={handleOpenFormulas}
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
              void performReturnHome();
              void refreshProviders();
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
        {analysisExitModal}
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
          onOpenQualityLab={handleOpenQualityLab}
          onOpenFormulas={handleOpenFormulas}
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
          onOpenQualityLab={handleOpenQualityLab}
          onOpenFormulas={handleOpenFormulas}
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

  if (mode === "qualityLab" || mode === "formulas") {
    return (
      <div className="flex h-full flex-col bg-orange-50/30">
        <TopToolbar
          onOpenSettings={handleOpenSettings}
          onOpenDocumentation={handleOpenDocumentation}
          onOpenChangelog={handleOpenChangelog}
          onOpenToolCatalog={handleOpenToolCatalog}
          onOpenQualityLab={handleOpenQualityLab}
          onOpenFormulas={handleOpenFormulas}
          onOpenFaq={handleOpenFaq}
        />
        <div className="flex flex-1 overflow-hidden">
          <LaboratoryPlaceholderView
            kind={mode}
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

  if (mode === "documentation") {
    return (
      <div className="flex h-full flex-col bg-orange-50/30">
        <TopToolbar
          onOpenSettings={handleOpenSettings}
          onOpenDocumentation={handleOpenDocumentation}
          onOpenChangelog={handleOpenChangelog}
          onOpenToolCatalog={handleOpenToolCatalog}
          onOpenQualityLab={handleOpenQualityLab}
          onOpenFormulas={handleOpenFormulas}
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
          onOpenQualityLab={handleOpenQualityLab}
          onOpenFormulas={handleOpenFormulas}
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
        onOpenQualityLab={handleOpenQualityLab}
        onOpenFormulas={handleOpenFormulas}
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
              onBridgeProgramChange={handleBridgeProgramChange}
              onOpenCodex={handleOpenCodex}
              onPickCodexPath={pickCodexPath}
              onCopyCodexSetupPrompt={handleCopyCodexSetupPrompt}
              onCopyBridgeSetupPrompt={handleCopyBridgeSetupPrompt}
              onModelProfileChange={handleModelProfileChange}
              onOpenProviderSettings={handleOpenProviderSettings}
              onOpenClaude={openClaude}
              onPickClaudePath={pickClaudePath}
              onPickMcpConfig={pickMcpConfig}
              onInstallMcpConfig={installMcpConfig}
              onClearManualMcpConfig={clearManualMcpConfig}
              onDownloadSkillZip={downloadSkillZip}
              onDownloadCodexWorkflowZip={downloadCodexWorkflowZip}
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
              bridgeState={executionMode === "bridge" ? bridge.state : null}
              articleTextState={displayedArticleTextState}
              runtimeReport={runtimeReport}
              articleCompareInput={articleCompareInput}
              siteCompareInput={siteCompareInput}
              scanStartedOnce={articleTextScanStartedOnce}
              pageByUrlStartedOnce={pageByUrlStartedOnce}
              compareStartedOnce={articleCompareStartedOnce}
              siteCompareStartedOnce={siteCompareStartedOnce}
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
              onPageByUrlRun={handleRunPageByUrl}
              onPageByUrlCancel={handleCancelPageByUrl}
              onArticleCompareRun={handleRunArticleCompare}
              onArticleCompareCancel={handleCancelArticleCompare}
              onSiteCompareRun={handleRunSiteCompare}
              onSiteCompareCancel={handleCancelSiteCompare}
              onOpenFormulas={handleOpenFormulas}
              showArticleTextToraRank={
                executionMode === "bridge" && bridgeProgram === "codex"
              }
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
      {analysisExitModal}
      <WindowSizeOverlay />
    </div>
  );
}

function AnalysisExitModal({
  onExit,
  onStay,
}: {
  onExit: () => void;
  onStay: () => void;
}) {
  const { t } = useTranslation();

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/30"
      onClick={onStay}
      role="dialog"
      aria-modal="true"
      aria-labelledby="analysis-exit-modal-title"
    >
      <div
        className="relative w-[420px] max-w-[90vw] rounded-lg border border-outline/15 bg-white p-5 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          onClick={onStay}
          aria-label={t("common.close")}
          className="absolute right-3 top-3 rounded p-1 text-outline-900/40 hover:bg-orange-50 hover:text-outline-900"
        >
          <X size={16} />
        </button>

        <div className="mb-3 flex items-center gap-2">
          <AlertTriangle className="text-orange-500" size={20} />
          <h2
            id="analysis-exit-modal-title"
            className="font-display text-base font-semibold text-outline-900"
          >
            {t("analysisExit.title", {
              defaultValue: "Analysis is still running",
            })}
          </h2>
        </div>

        <p className="mb-4 text-sm leading-relaxed text-outline-900/70">
          {t("analysisExit.body", {
            defaultValue:
              "If you leave now, the unfinished analysis will be stopped and the next launch will start from scratch.",
          })}
        </p>

        <div className="flex flex-col gap-2 sm:flex-row-reverse">
          <button
            type="button"
            onClick={onStay}
            className="flex-1 rounded-md bg-orange-500 px-3 py-2 text-sm font-medium text-white transition hover:bg-orange-600"
          >
            {t("analysisExit.stay", { defaultValue: "Back" })}
          </button>
          <button
            type="button"
            onClick={onExit}
            className="flex-1 rounded-md border border-outline/20 px-3 py-2 text-sm text-outline-900/70 transition hover:bg-orange-50"
          >
            {t("analysisExit.exit", { defaultValue: "Leave anyway" })}
          </button>
        </div>
      </div>
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
                    defaultValue: "Setup prompt copied",
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
                    "Open a new session in {{appName}}, paste the prompt, and press Enter. This checks whether {{appName}} can see the ToraSEO SKILL and MCP.",
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
