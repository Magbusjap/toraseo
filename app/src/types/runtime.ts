/**
 * Native Runtime contract — types shared between main process,
 * preload, and renderer.
 *
 * Stage 1 (skeleton): defines the shape of the runtime surface
 * without locking in transport details. Real provider calls,
 * orchestrator steps, and policy enforcement are added in Stage 2.
 *
 * Why a separate file from ipc.ts: runtime is a large enough
 * subsystem that mixing it into ipc.ts would obscure the existing
 * Bridge / Detector / Updater contracts. Renderer code imports
 * runtime types from here, ipc.ts re-exports them for convenience.
 */

import type { SupportedLocale } from "./ipc";
import type { ToolId } from "../config/tools";

// =====================================================================
// Policy layer — SKILL rules executed inside the app
// =====================================================================

/**
 * High-level mode that the orchestrator runs in. Strict mode
 * limits the model to facts coming out of MCP tools; the plus
 * mode also allows expert hypotheses, clearly separated.
 */
export type RuntimePolicyMode = "strict_audit" | "audit_plus_ideas";
export type AuditExecutionMode = "bridge" | "native";
export type RuntimeAnalysisType =
  | "site"
  | "article_text"
  | "article_compare"
  | "site_compare";
export type RuntimeReportAnalysisType =
  | "article_text"
  | "article_compare"
  | "page_by_url"
  | "site_by_url"
  | "site_compare";

/**
 * A single rule the policy layer enforces. Keep this minimal in
 * Stage 1 — full rule grammar (validators, regex constraints,
 * tool gating) lands in Stage 2.
 */
export interface RuntimePolicyRule {
  id: string;
  /** Plain-text rule text injected into the system prompt. */
  text: string;
  /** Modes this rule applies to. Empty = all modes. */
  modes?: RuntimePolicyMode[];
}

/**
 * Compiled policy bundle the orchestrator hands to the provider.
 * Stage 1 carries the SKILL system prompt + the active mode;
 * Stage 2 will add output contract schemas and tool gating.
 */
export interface RuntimePolicyBundle {
  mode: RuntimePolicyMode;
  locale: SupportedLocale;
  systemPrompt: string;
  rules: RuntimePolicyRule[];
}

// =====================================================================
// Provider adapter layer — multi-LLM support through one interface
// =====================================================================

/**
 * Stable internal id for a provider. Adapter modules register
 * themselves in the registry with one of these.
 */
export type ProviderId =
  | "openrouter"
  | "routerai"
  | "openai"
  | "anthropic"
  | "google"
  | "local";

/**
 * Capability flags a provider may or may not support. The
 * orchestrator reads these to decide whether to attempt streaming,
 * tool-calls, structured output, etc. on a given provider.
 *
 * Conservative default: no caps assumed. Adapters opt in.
 */
export interface ProviderCapabilities {
  streaming: boolean;
  toolCalls: boolean;
  structuredOutput: boolean;
}

/**
 * Per-provider config the user supplies (API key, base URL,
 * default model). Stored at rest in user data, never bundled
 * into the binary.
 */
export interface ProviderConfig {
  id: ProviderId;
  /** Human-readable label, e.g. "OpenRouter (default)". */
  label: string;
  /** API key from the user's account dashboard. */
  apiKey: string;
  /** Override the default endpoint, e.g. for proxies/regional. */
  baseUrl?: string;
  /** Default model id to send if no per-call override given. */
  defaultModel?: string;
  /** Capability map; defaults applied if missing. */
  capabilities?: Partial<ProviderCapabilities>;
}

/**
 * User-saved model profile under a configured provider. OpenRouter
 * usually uses one account API key with many selectable model IDs, so
 * the app stores model choices separately from the secret provider key.
 */
export interface ProviderModelProfile {
  id: string;
  displayName: string;
  modelId: string;
  usageHint?: string;
}

/**
 * Lightweight metadata about an installed provider adapter, used
 * by UI screens to render the provider list without exposing the
 * raw config (which contains the API key).
 */
export interface ProviderInfo {
  id: ProviderId;
  label: string;
  configured: boolean;
  baseUrl: string | null;
  defaultModel: string | null;
  defaultModelProfileId: string | null;
  modelProfiles: ProviderModelProfile[];
  capabilities: ProviderCapabilities;
  /** Last 4 chars of the stored API key, or null when not configured. */
  lastFour: string | null;
}

/**
 * Input the renderer passes to runtime.setProviderConfig(). Mirrors
 * the secure-store contract; the API key is the only secret-bearing
 * field and never goes back to the renderer once persisted.
 */
export interface SetProviderConfigInput {
  id: ProviderId;
  apiKey: string;
  baseUrl?: string;
  defaultModel?: string;
  modelProfiles?: ProviderModelProfile[];
  defaultModelProfileId?: string | null;
}

/**
 * Result of setProviderConfig(). On success, returns the public
 * (key-less) view of what was persisted. On failure, includes a
 * structured error code the UI maps to a localized message.
 */
export type SetProviderConfigResult =
  | { ok: true; config: ProviderInfo }
  | {
      ok: false;
      errorCode:
        | "encryption_unavailable"
        | "invalid_input"
        | "write_failed";
      errorMessage: string;
    };

// =====================================================================
// Orchestrator surface
// =====================================================================

export interface RuntimeScanFact {
  toolId: ToolId;
  title: string;
  detail: string;
  severity: "ok" | "warning" | "critical" | "error";
  source: "local_scan" | "bridge_scan";
}

export interface RuntimeScanContext {
  url: string;
  selectedTools: ToolId[];
  completedTools: ToolId[];
  totals: {
    critical: number;
    warning: number;
    info: number;
    errors: number;
  };
  facts: RuntimeScanFact[];
}

export interface RuntimeArticleTextContext {
  action: "scan" | "solution";
  runId?: string;
  sourceType?: "article_text" | "page_by_url";
  topic: string;
  body: string;
  analysisRole?: string;
  textPlatform: string;
  customPlatform?: string;
  selectedTools: string[];
}

export type RuntimeArticleCompareRole = "auto" | "own" | "competitor";
export type RuntimeArticleCompareGoalMode =
  | "standard_comparison"
  | "focus_text_a"
  | "focus_text_b"
  | "beat_competitor"
  | "style_match"
  | "similarity_check"
  | "version_compare"
  | "ab_post";

export interface RuntimeArticleCompareContext {
  runId?: string;
  goal: string;
  goalMode?: RuntimeArticleCompareGoalMode;
  textA: string;
  textB: string;
  roleA: RuntimeArticleCompareRole;
  roleB: RuntimeArticleCompareRole;
  textPlatform: string;
  customPlatform?: string;
  selectedTools: string[];
}

export interface RuntimeSiteCompareToolResult {
  url: string;
  toolId: string;
  status: "ok" | "warning" | "critical" | "error";
  summary?: {
    critical: number;
    warning: number;
    info: number;
  };
  result?: unknown;
  errorCode?: string;
  errorMessage?: string;
}

export interface RuntimeSiteCompareContext {
  runId?: string;
  urls: string[];
  focus: string;
  selectedTools: string[];
  siteTools: string[];
  scanResults: RuntimeSiteCompareToolResult[];
}

export interface RuntimeWebEvidenceItem {
  kind: "direct_url" | "search_result";
  url: string;
  title?: string;
  status?: number;
  source?: string;
  snippet?: string;
  textSample?: string;
  error?: string;
}

export interface RuntimeWebEvidenceContext {
  collectedAt: string;
  enabled: boolean;
  queries: string[];
  items: RuntimeWebEvidenceItem[];
  limitations: string[];
}

export interface RuntimeConfirmedFact {
  title: string;
  detail: string;
  priority: "high" | "medium" | "low";
  sourceToolIds: string[];
}

export interface RuntimeReportToolProvenance {
  toolId: string;
  aiAuthored: boolean;
  coveredByReport: boolean;
  source: "app_local" | "mcp_submit_ai_report" | "api_provider";
}

export interface RuntimeReportProvenance {
  generatedBy: "app" | "ai";
  source: "app_local" | "mcp_submit_ai_report" | "api_provider";
  checkedAt: string;
  tools: RuntimeReportToolProvenance[];
}

export interface RuntimeExpertHypothesis {
  title: string;
  detail: string;
  priority: "high" | "medium" | "low";
  expectedImpact: string;
  validationMethod: string;
}

export type RuntimeArticleTextVerdict =
  | "ready"
  | "needs_revision"
  | "high_risk";

export type RuntimeArticleTextDimensionStatus =
  | "healthy"
  | "watch"
  | "problem";

export interface RuntimeArticleTextMetric {
  id: string;
  label: string;
  value: number | null;
  suffix: string;
  tone: "good" | "warn" | "bad" | "pending";
  description: string;
}

export interface RuntimeArticleTextPlatform {
  key: string;
  label: string;
  detail: string;
}

export interface RuntimeArticleTextDocument {
  title: string;
  titleNote: string | null;
  text: string;
  sourceFile?: string;
  wordCount: number | null;
  paragraphCount: number | null;
}

export interface RuntimeArticleTextAnnotation {
  id: number;
  kind: "issue" | "recommendation" | "style" | "note";
  label: string;
  detail: string;
  sourceToolIds: string[];
  category?: string;
  severity?: "critical" | "warning" | "info";
  marker?: "underline" | "outline" | "strike" | "muted" | "note";
  paragraphId?: string;
  quote?: string;
  title?: string;
  shortMessage?: string;
  confidence?: number;
  global?: boolean;
}

export interface RuntimeArticleTextDimension {
  id: string;
  label: string;
  status: RuntimeArticleTextDimensionStatus;
  detail: string;
  recommendation: string;
  sourceToolIds: string[];
}

export interface RuntimeArticleTextPriority {
  title: string;
  detail: string;
  priority: "high" | "medium" | "low";
  sourceToolIds: string[];
}

export interface RuntimeArticleTextInsight {
  title: string;
  detail: string;
  sourceToolIds: string[];
}

export interface RuntimeArticleTextSeoPackage {
  seoTitle: string;
  metaDescription: string;
  primaryKeyword: string;
  secondaryKeywords: string[];
  keywords: string[];
  category: string;
  tags: string[];
  slug: string;
}

export interface RuntimeArticleTextIntentForecast {
  intent: string;
  intentLabel: string;
  hookType: string;
  hookScore: number | null;
  ctrPotential: number | null;
  trendPotential: number | null;
  internetDemandAvailable: boolean;
  internetDemandSource: string;
  hookIdeas: string[];
  seoPackage: RuntimeArticleTextSeoPackage;
}

export interface RuntimeArticleTextSummary {
  verdict: RuntimeArticleTextVerdict;
  verdictLabel: string;
  verdictDetail: string;
  coverage: {
    completed: number;
    total: number;
    percent: number;
  };
  platform: RuntimeArticleTextPlatform;
  document: RuntimeArticleTextDocument;
  annotationStatus: string;
  annotations: RuntimeArticleTextAnnotation[];
  dimensions: RuntimeArticleTextDimension[];
  priorities: RuntimeArticleTextPriority[];
  metrics: RuntimeArticleTextMetric[];
  warningCount: number;
  strengths: RuntimeArticleTextInsight[];
  weaknesses: RuntimeArticleTextInsight[];
  intentForecast?: RuntimeArticleTextIntentForecast;
  nextActions: string[];
}

export interface RuntimeArticleCompareMetric {
  id: string;
  label: string;
  textA: number | null;
  textB: number | null;
  delta: number | null;
  suffix: string;
  winner: "textA" | "textB" | "tie" | "risk" | "pending";
  description: string;
}

export interface RuntimeArticleCompareTextSide {
  id: "textA" | "textB";
  label: string;
  role: RuntimeArticleCompareRole;
  title: string;
  text: string;
  wordCount: number;
  paragraphCount: number;
  headingCount: number;
  sentenceCount: number;
  averageSentenceWords: number | null;
  strengths: RuntimeArticleTextInsight[];
  weaknesses: RuntimeArticleTextInsight[];
}

export interface RuntimeArticleCompareGap {
  title: string;
  detail: string;
  side: "missing_in_a" | "missing_in_b" | "missing_in_both" | "shared";
  sourceToolIds: string[];
}

export interface RuntimeArticleCompareSummary {
  verdict: {
    winner: "textA" | "textB" | "tie" | "unclear";
    label: string;
    detail: string;
    mainGap: string;
  };
  goal: string;
  goalMode: RuntimeArticleCompareGoalMode;
  goalLabel: string;
  goalDescription: string;
  focusSide: "textA" | "textB" | null;
  platform: RuntimeArticleTextPlatform;
  coverage: {
    completed: number;
    total: number;
    percent: number;
  };
  textA: RuntimeArticleCompareTextSide;
  textB: RuntimeArticleCompareTextSide;
  metrics: RuntimeArticleCompareMetric[];
  gaps: RuntimeArticleCompareGap[];
  priorities: RuntimeArticleTextPriority[];
  similarity: {
    exactOverlap: number | null;
    semanticSimilarity: number | null;
    copyRisk: "low" | "medium" | "high" | "unknown";
    detail: string;
  };
  actionPlan: RuntimeArticleTextPriority[];
  limitations: string[];
}

export interface RuntimeSiteCompareSite {
  url: string;
  score: number;
  critical: number;
  warning: number;
  metadata: number;
  content: number;
  indexability: number;
}

export interface RuntimeSiteCompareMetric {
  id: string;
  label: string;
  values: Array<{ url: string; value: number }>;
}

export interface RuntimeSiteCompareDirection {
  label: string;
  values: Array<{ url: string; status: "good" | "warn" | "bad" | "pending" }>;
}

export interface RuntimeSiteCompareSummary {
  focus: string;
  winnerUrl: string | null;
  completed: number;
  total: number;
  sites: RuntimeSiteCompareSite[];
  metrics: RuntimeSiteCompareMetric[];
  directions: RuntimeSiteCompareDirection[];
  insights: string[];
}

export interface RuntimeAuditReport {
  analysisType?: RuntimeReportAnalysisType;
  analysisVersion?: string;
  locale?: SupportedLocale;
  mode: RuntimePolicyMode;
  providerId: ProviderId;
  model: string;
  generatedAt: string;
  durationMs?: number;
  summary: string;
  nextStep: string;
  confirmedFacts: RuntimeConfirmedFact[];
  expertHypotheses: RuntimeExpertHypothesis[];
  internalProvenance?: RuntimeReportProvenance;
  articleText?: RuntimeArticleTextSummary;
  articleCompare?: RuntimeArticleCompareSummary;
  siteCompare?: RuntimeSiteCompareSummary;
}

export interface ProviderUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  cost?: number;
}

export interface RuntimeChatWindowSession {
  status: "active" | "ended";
  locale: SupportedLocale;
  analysisType: RuntimeAnalysisType;
  selectedProviderId?: ProviderId | null;
  selectedModelProfile: ProviderModelProfile | null;
  scanContext: RuntimeScanContext | null;
  articleTextContext?: RuntimeArticleTextContext | null;
  articleCompareContext?: RuntimeArticleCompareContext | null;
  siteCompareContext?: RuntimeSiteCompareContext | null;
  articleTextRunState?: "idle" | "running" | "complete" | "failed";
  articleTextRunError?: string;
  chatNotice?: string;
  hostManagedRun?: boolean;
  reportAttachmentText?: string;
  reportAttachmentName?: string;
  report: RuntimeAuditReport | null;
  endedReason?: string;
}

export type ProviderConnectionTestResult =
  | {
      ok: true;
      providerId: ProviderId;
      model: string;
      structuredReport: boolean;
      usage?: ProviderUsage;
      warningMessage?: string;
    }
  | {
      ok: false;
      providerId: ProviderId;
      errorCode: string;
      errorMessage: string;
    };

export interface SetProviderModelProfilesInput {
  id: ProviderId;
  modelProfiles: ProviderModelProfile[];
  defaultModelProfileId: string | null;
}

export type SetProviderModelProfilesResult =
  | { ok: true; config: ProviderInfo }
  | {
      ok: false;
      errorCode:
        | "provider_not_configured"
        | "invalid_input"
        | "write_failed";
      errorMessage: string;
    };

/**
 * Input the renderer hands to the orchestrator when the user
 * sends a message in the chat panel. Stage 1 keeps this minimal;
 * Stage 2 expands it with attached MCP tool results, scoped scan
 * context, and conversation history.
 */
export interface OrchestratorMessageInput {
  /** Free-form user text. */
  text: string;
  /** Active runtime mode. */
  mode: RuntimePolicyMode;
  /** Which app execution mode is active. */
  executionMode: AuditExecutionMode;
  /** Current analysis surface that bounds the assistant's scope. */
  analysisType: RuntimeAnalysisType;
  /** Provider id to route the request to. */
  providerId: ProviderId;
  /** Optional model id selected from a saved provider model profile. */
  modelOverride?: string;
  /** UI locale for response language. */
  locale: SupportedLocale;
  /** Current scan evidence, if any. */
  scanContext?: RuntimeScanContext | null;
  /** Current article text context for API + AI Chat text workflows. */
  articleTextContext?: RuntimeArticleTextContext | null;
  /** Current two-text comparison context for API + AI Chat workflows. */
  articleCompareContext?: RuntimeArticleCompareContext | null;
  /** Current site comparison context for API + AI Chat workflows. */
  siteCompareContext?: RuntimeSiteCompareContext | null;
}

/**
 * Result the orchestrator returns. Stage 1 returns a single
 * synchronous text payload (or an explicit error). Stage 2 will
 * stream tokens and structured output.
 */
export interface OrchestratorMessageResult {
  ok: boolean;
  /** Final assistant text (set when ok=true). */
  text?: string;
  /** Structured report for the analysis panel and exports. */
  report?: RuntimeAuditReport;
  /** Error code (set when ok=false). */
  errorCode?: string;
  /** Human-readable error message (set when ok=false). */
  errorMessage?: string;
}

/**
 * Renderer-facing surface exposed under `window.toraseo.runtime`.
 * Stage 2 expands provider management into a CRUD-ish surface backed
 * by encrypted local storage in the main process.
 */
export interface RuntimeApi {
  /** True if the native runtime feature flag is on for this build. */
  isEnabled(): Promise<boolean>;

  /** True if the OS supports encrypted credential storage. */
  isEncryptionAvailable(): Promise<boolean>;

  /** List installed providers with their configuration state. */
  listProviders(): Promise<ProviderInfo[]>;

  /** Persist a provider's API key + optional overrides. */
  setProviderConfig(
    input: SetProviderConfigInput,
  ): Promise<SetProviderConfigResult>;

  /** Persist provider model profiles without requiring the API key again. */
  setProviderModelProfiles(
    input: SetProviderModelProfilesInput,
  ): Promise<SetProviderModelProfilesResult>;

  /** Remove a provider config, including its encrypted API key. */
  deleteProviderConfig(id: ProviderId): Promise<{ ok: boolean }>;

  /** Send a chat message through the orchestrator. */
  sendMessage(
    input: OrchestratorMessageInput,
  ): Promise<OrchestratorMessageResult>;

  /** Open or refresh the second-screen details window. */
  openReportWindow(report: RuntimeAuditReport): Promise<{ ok: boolean }>;

  /** Close the second-screen details window if one is open. */
  closeReportWindow(): Promise<{ ok: boolean }>;

  /** Replace an open second-screen details window with a processing state. */
  showReportWindowProcessing(): Promise<{ ok: boolean }>;

  /** Mark the second-screen details window as inactive without closing it. */
  endReportWindowSession(): Promise<{ ok: boolean }>;

  /** Copy the original analyzed article text, without media placeholders. */
  copyArticleSourceText(report: RuntimeAuditReport): Promise<{
    ok: boolean;
    charCount?: number;
    error?: string;
  }>;

  /** Prepare a current report package that can be pasted or attached to AI chat. */
  prepareReportForAi(report: RuntimeAuditReport): Promise<{
    ok: boolean;
    text?: string;
    error?: string;
  }>;

  /** Copy a current report package for an external AI chat. */
  copyReportForAi(report: RuntimeAuditReport): Promise<{
    ok: boolean;
    charCount?: number;
    error?: string;
  }>;

  /** Export the current report to PDF. */
  exportReportPdf(report: RuntimeAuditReport): Promise<{
    ok: boolean;
    filePath?: string;
    error?: string;
  }>;

  /** Export the current report as a standard Markdown document. */
  exportReportDocument(report: RuntimeAuditReport): Promise<{
    ok: boolean;
    filePath?: string;
    error?: string;
  }>;

  /** Export the current report as a lightweight HTML presentation. */
  exportReportPresentation(report: RuntimeAuditReport): Promise<{
    ok: boolean;
    filePath?: string;
    error?: string;
  }>;

  /** Export the raw structured report JSON for private Eval Lab runs. */
  exportReportJson(report: RuntimeAuditReport): Promise<{
    ok: boolean;
    filePath?: string;
    error?: string;
  }>;

  /** Probe the selected provider with a minimal scoped audit request. */
  testProviderConnection(
    providerId: ProviderId,
    locale: SupportedLocale,
    modelOverride?: string,
  ): Promise<ProviderConnectionTestResult>;

  /** Open or refresh the standalone AI chat window. */
  openChatWindow(session: RuntimeChatWindowSession): Promise<{ ok: boolean }>;

  /** Push the latest scan context/report into the chat window session. */
  updateChatWindowSession(
    session: RuntimeChatWindowSession,
  ): Promise<{ ok: boolean }>;

  /** Mark the standalone chat window as inactive without closing it. */
  endChatWindowSession(): Promise<{ ok: boolean }>;

  /** Close the standalone chat window, used when leaving native mode. */
  closeChatWindow(): Promise<{ ok: boolean }>;

  /** Read the current standalone chat window session snapshot. */
  getChatWindowSession(): Promise<RuntimeChatWindowSession>;

  /** Subscribe to standalone chat window session changes. */
  onChatWindowSessionUpdate(
    listener: (session: RuntimeChatWindowSession) => void,
  ): () => void;
}
