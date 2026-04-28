/**
 * Native Runtime — Orchestrator (skeleton).
 *
 * Owns the message lifecycle:
 *   1. compile policy for the requested mode + locale
 *   2. resolve provider adapter via registry
 *   3. delegate to provider.sendChat
 *   4. (Stage 2) post-validate the response against the output
 *      contract, retrying or refusing if guardrails fail
 *
 * Stage 1 keeps steps 1-3 only. The post-validation hook is
 * documented but not yet enforced; this lets us prove IPC and
 * UI wiring before adding the heavier reasoning checks.
 */

import { compilePolicy } from "./policy.js";
import { getProvider } from "./providers/registry.js";

import type {
  OrchestratorMessageInput,
  OrchestratorMessageResult,
} from "../../src/types/runtime.js";

/**
 * Handle a single user message. Pure async function — no side
 * effects beyond calling the chosen provider.
 */
export async function handleUserMessage(
  input: OrchestratorMessageInput,
): Promise<OrchestratorMessageResult> {
  let adapter;
  try {
    adapter = getProvider(input.providerId);
  } catch {
    return {
      ok: false,
      errorCode: "provider_not_registered",
      errorMessage: `Provider '${input.providerId}' is not registered. Configure it in Settings.`,
    };
  }

  const policy = compilePolicy(input.mode, input.locale);

  const response = await adapter.sendChat({
    policy,
    userText: input.text,
  });

  if (!response.ok) {
    return {
      ok: false,
      errorCode: response.errorCode ?? "provider_error",
      errorMessage: response.errorMessage ?? "Unknown provider error.",
    };
  }

  // Stage 2 will hook output-contract validation here. For Stage
  // 1, we trust the placeholder response.
  return {
    ok: true,
    text: response.text,
  };
}
