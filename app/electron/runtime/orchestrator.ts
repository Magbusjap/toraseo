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
import { collectWebEvidence } from "./webEvidence.js";
import log from "electron-log";

import type {
  OrchestratorMessageInput,
  OrchestratorMessageResult,
  RuntimeAuditReport,
  RuntimeReportProvenance,
} from "../../src/types/runtime.js";

/**
 * Handle a single user message. Pure async function — no side
 * effects beyond calling the chosen provider.
 */
export async function handleUserMessage(
  input: OrchestratorMessageInput,
): Promise<OrchestratorMessageResult> {
  const startedAtMs = Date.now();
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
  const webEvidenceContext = await collectWebEvidence(input);

  const response = await adapter.sendChat({
    policy,
    userText: input.text,
    analysisType: input.analysisType,
    scanContext: input.scanContext,
    articleTextContext: input.articleTextContext,
    articleCompareContext: input.articleCompareContext,
    siteCompareContext: input.siteCompareContext,
    webEvidenceContext,
    modelOverride: input.modelOverride,
  });

  if (!response.ok) {
    return {
      ok: false,
      errorCode: response.errorCode ?? "provider_error",
      errorMessage: response.errorMessage ?? "Unknown provider error.",
    };
  }

  if (!response.report) {
    const text = response.text?.trim();
    if (text) {
      return {
        ok: true,
        text,
      };
    }
    return {
      ok: false,
      errorCode: "provider_bad_response",
      errorMessage: "The AI provider did not return a structured audit report.",
    };
  }
  const missingVisualBlock = missingProviderVisualBlock(input, response.report);
  if (missingVisualBlock) {
    return {
      ok: false,
      errorCode: "provider_incomplete_report",
      errorMessage: missingVisualBlock,
    };
  }
  if (
    input.mode === "strict_audit" &&
    response.report.expertHypotheses.length > 0
  ) {
    return {
      ok: false,
      errorCode: "policy_violation",
      errorMessage:
        "Strict audit mode forbids expert hypotheses, but the provider returned them.",
    };
  }

  const factsCount = response.report.confirmedFacts.length;
  const report = attachProviderProvenance(
    {
    ...response.report,
    durationMs: response.report.durationMs ?? Date.now() - startedAtMs,
    },
    input,
  );
  logReportProvenance(report, input);
  const text =
    response.text ??
    `${report.summary}\n\nConfirmed facts: ${factsCount}.`;

  return {
    ok: true,
    text,
    report,
  };
}

function selectedToolIdsForInput(input: OrchestratorMessageInput): string[] {
  return [
    ...(input.articleTextContext?.selectedTools ?? []),
    ...(input.articleCompareContext?.selectedTools ?? []),
    ...(input.siteCompareContext?.selectedTools ?? []),
    ...(input.scanContext?.selectedTools ?? []),
  ];
}

function collectSourceToolIds(value: unknown, output = new Set<string>()): Set<string> {
  if (!value || typeof value !== "object") return output;
  if (Array.isArray(value)) {
    for (const item of value) collectSourceToolIds(item, output);
    return output;
  }
  const record = value as Record<string, unknown>;
  const sourceToolIds = record.sourceToolIds;
  if (Array.isArray(sourceToolIds)) {
    for (const toolId of sourceToolIds) {
      if (typeof toolId === "string" && toolId.trim()) {
        output.add(toolId.trim());
      }
    }
  }
  for (const item of Object.values(record)) {
    collectSourceToolIds(item, output);
  }
  return output;
}

function attachProviderProvenance(
  report: RuntimeAuditReport,
  input: OrchestratorMessageInput,
): RuntimeAuditReport {
  const selectedToolIds = Array.from(new Set(selectedToolIdsForInput(input)));
  const coveredToolIds = collectSourceToolIds(report);
  const internalProvenance: RuntimeReportProvenance = {
    generatedBy: "ai",
    source: "api_provider",
    checkedAt: new Date().toISOString(),
    tools: selectedToolIds.map((toolId) => {
      const coveredByReport = coveredToolIds.has(toolId);
      return {
        toolId,
        aiAuthored: coveredByReport,
        coveredByReport,
        source: "api_provider",
      };
    }),
  };
  return {
    ...report,
    internalProvenance,
  };
}

function logReportProvenance(
  report: RuntimeAuditReport,
  input: OrchestratorMessageInput,
): void {
  for (const item of report.internalProvenance?.tools ?? []) {
    log.info(
      `[report-provenance] analysis=${input.analysisType ?? "unknown"} provider=${input.providerId} model=${input.modelOverride ?? "default"} source=${item.source} tool=${item.toolId} aiAuthored=${item.aiAuthored} coveredByReport=${item.coveredByReport}`,
    );
  }
}

function missingProviderVisualBlock(
  input: OrchestratorMessageInput,
  report: RuntimeAuditReport,
): string | null {
  if (
    input.articleTextContext?.action === "scan" &&
    input.articleTextContext.body.trim() &&
    !report.articleText
  ) {
    return "The AI provider returned findings without the required articleText visual report block. ToraSEO did not create a visual report from local fallback data.";
  }
  if (
    input.articleCompareContext?.textA.trim() &&
    input.articleCompareContext.textB.trim() &&
    !report.articleCompare
  ) {
    return "The AI provider returned findings without the required articleCompare visual report block. ToraSEO did not create a comparison report from local fallback data.";
  }
  if (
    input.siteCompareContext?.urls.length &&
    input.siteCompareContext.urls.length >= 2 &&
    input.siteCompareContext.scanResults.length > 0 &&
    !report.siteCompare
  ) {
    return "The AI provider returned findings without the required siteCompare visual report block. ToraSEO did not create a site comparison report from local fallback data.";
  }
  return null;
}
