import { compilePolicy } from "./policy.js";
import { getProvider } from "./providers/registry.js";

import type { SupportedLocale } from "../../src/types/ipc.js";
import type {
  ProviderConnectionTestResult,
  ProviderId,
  RuntimeScanContext,
} from "../../src/types/runtime.js";

const DIAGNOSTIC_SCAN_CONTEXT: RuntimeScanContext = {
  url: "https://example.com",
  selectedTools: ["scan_site_minimal"],
  completedTools: ["scan_site_minimal"],
  totals: {
    critical: 0,
    warning: 0,
    info: 1,
    errors: 0,
  },
  facts: [
    {
      toolId: "scan_site_minimal",
      title: "Provider readiness check",
      detail:
        "This is a local ToraSEO readiness probe. Use it only to confirm that the configured AI provider can return a structured audit response.",
      severity: "ok",
      source: "local_scan",
    },
  ],
};

export async function testProviderConnection(
  providerId: ProviderId,
  locale: SupportedLocale,
  modelOverride?: string,
): Promise<ProviderConnectionTestResult> {
  let adapter;
  try {
    adapter = getProvider(providerId);
  } catch {
    return {
      ok: false,
      providerId,
      errorCode: "provider_not_registered",
      errorMessage: "Provider is not configured.",
    };
  }

  const response = await adapter.sendChat({
    policy: compilePolicy("strict_audit", locale),
    userText:
      "Check that the provider connection is ready. Return only the structured audit response for the supplied diagnostic fact.",
    analysisType: "site",
    scanContext: DIAGNOSTIC_SCAN_CONTEXT,
    modelOverride,
  });

  if (!response.ok) {
    return {
      ok: false,
      providerId,
      errorCode: response.errorCode ?? "provider_test_failed",
      errorMessage:
        response.errorMessage ?? "Provider connection test failed.",
    };
  }

  const model = response.model ?? response.report?.model ?? modelOverride ?? "";
  if (!response.report) {
    return {
      ok: true,
      providerId,
      model,
      structuredReport: false,
      usage: response.usage,
      warningMessage:
        locale === "ru"
          ? "Модель отвечает, но не вернула структурированный audit-отчет."
          : "The model responded, but it did not return a structured audit report.",
    };
  }

  return {
    ok: true,
    providerId,
    model,
    structuredReport: true,
    usage: response.usage,
  };
}
