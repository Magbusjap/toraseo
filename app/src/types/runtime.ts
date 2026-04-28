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

// =====================================================================
// Policy layer — SKILL rules executed inside the app
// =====================================================================

/**
 * High-level mode that the orchestrator runs in. Strict mode
 * limits the model to facts coming out of MCP tools; the plus
 * mode also allows expert hypotheses, clearly separated.
 */
export type RuntimePolicyMode = "strict_audit" | "audit_plus_ideas";

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
 * Lightweight metadata about an installed provider adapter, used
 * by UI screens to render the provider list without exposing the
 * raw config (which contains the API key).
 */
export interface ProviderInfo {
  id: ProviderId;
  label: string;
  configured: boolean;
  defaultModel: string | null;
  capabilities: ProviderCapabilities;
}

// =====================================================================
// Orchestrator surface
// =====================================================================

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
  /** Provider id to route the request to. */
  providerId: ProviderId;
  /** UI locale for response language. */
  locale: SupportedLocale;
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
  /** Error code (set when ok=false). */
  errorCode?: string;
  /** Human-readable error message (set when ok=false). */
  errorMessage?: string;
}

/**
 * Renderer-facing surface exposed under `window.toraseo.runtime`.
 * Stage 1 ships only the placeholders needed to render the new
 * three-column layout and prove the IPC plumbing.
 */
export interface RuntimeApi {
  /** True if the native runtime feature flag is on for this build. */
  isEnabled(): Promise<boolean>;

  /** List configured providers (without API keys). */
  listProviders(): Promise<ProviderInfo[]>;

  /** Echo a message through the orchestrator (skeleton — no real call yet). */
  sendMessage(
    input: OrchestratorMessageInput,
  ): Promise<OrchestratorMessageResult>;
}
