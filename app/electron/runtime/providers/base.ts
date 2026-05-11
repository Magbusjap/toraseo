/**
 * Provider adapter base contract.
 *
 * Every supported LLM (OpenRouter, OpenAI, Anthropic, Google,
 * local) must implement this interface. The orchestrator never
 * talks to a provider directly — it goes through the registry,
 * which returns one of these.
 *
 * Stage 1 (skeleton): only `sendChat` is required, returning a
 * single completed text. Stage 2 introduces streaming
 * (`streamChat`) and tool-call hooks; adapters that don't yet
 * support those will throw `not_supported` errors that the
 * orchestrator handles gracefully.
 */

import type {
  ProviderCapabilities,
  ProviderConfig,
  ProviderUsage,
  ProviderId,
  RuntimeAnalysisType,
  RuntimeArticleCompareContext,
  RuntimeArticleTextContext,
  RuntimeAuditReport,
  RuntimePolicyBundle,
  RuntimeScanContext,
  RuntimeSiteCompareContext,
  RuntimeWebEvidenceContext,
} from "../../../src/types/runtime.js";

/**
 * Minimal request payload for a single chat turn. The orchestrator
 * is responsible for assembling history, tool results, and policy
 * bundle into a coherent prompt — adapters just forward.
 */
export interface ProviderChatRequest {
  /** Compiled policy (system prompt + rules). */
  policy: RuntimePolicyBundle;
  /** User message text for this turn. */
  userText: string;
  /** Active analysis type that bounds the answer. */
  analysisType: RuntimeAnalysisType;
  /** Scan facts the assistant may cite. */
  scanContext?: RuntimeScanContext | null;
  /** Article text context for native API text analysis. */
  articleTextContext?: RuntimeArticleTextContext | null;
  /** Two-text comparison context for native API article comparison. */
  articleCompareContext?: RuntimeArticleCompareContext | null;
  /** Site comparison context for native API site comparison. */
  siteCompareContext?: RuntimeSiteCompareContext | null;
  /** Public web evidence gathered by ToraSEO before the provider call. */
  webEvidenceContext?: RuntimeWebEvidenceContext | null;
  /** Override default model for this request. */
  modelOverride?: string;
}

export interface ProviderChatResponse {
  ok: boolean;
  /** Set when ok=true. */
  text?: string;
  /** Structured report payload for the analysis panel. */
  report?: RuntimeAuditReport;
  /** Resolved model used for the request. */
  model?: string;
  /** Provider-reported token/cost usage, when available. */
  usage?: ProviderUsage;
  /** Set when ok=false. */
  errorCode?: string;
  errorMessage?: string;
}

/**
 * Common shape every adapter exports. Stage 1 only requires the
 * synchronous `sendChat`; future iterations add `streamChat` and
 * `cancel`, with adapters that don't implement them returning
 * `not_supported`.
 */
export interface ProviderAdapter {
  readonly id: ProviderId;
  readonly label: string;
  readonly capabilities: ProviderCapabilities;

  /** True when API key + endpoint are present and minimally valid. */
  isConfigured(): boolean;

  /**
   * Single-turn chat call. Stage 1 implementations may return a
   * deterministic placeholder ("not implemented yet") rather than
   * doing real network I/O — the surface still exercises end-to-
   * end through preload + IPC.
   */
  sendChat(request: ProviderChatRequest): Promise<ProviderChatResponse>;
}

/**
 * Default capability map applied when an adapter doesn't override.
 * Conservative — Stage 1 features only.
 */
export const DEFAULT_CAPABILITIES: ProviderCapabilities = {
  streaming: false,
  toolCalls: false,
  structuredOutput: false,
};

/**
 * Helper: validate the minimum config a provider needs (id +
 * apiKey). Adapters can call this in their constructor to fail
 * loudly on misconfiguration.
 */
export function validateProviderConfig(
  config: ProviderConfig,
): { ok: true } | { ok: false; reason: string } {
  if (!config.id) {
    return { ok: false, reason: "missing_id" };
  }
  if (!config.apiKey || typeof config.apiKey !== "string") {
    return { ok: false, reason: "missing_api_key" };
  }
  return { ok: true };
}
