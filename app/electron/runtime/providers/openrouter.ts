/**
 * OpenRouter provider adapter.
 *
 * Production-ready implementation for the native runtime:
 *   - OpenAI-compatible `/chat/completions` request
 *   - 20s timeout with one retry on retryable failures
 *   - stable provider error mapping
 *   - strict JSON output contract for analysis-panel rendering
 */

import {
  DEFAULT_CAPABILITIES,
  validateProviderConfig,
  type ProviderAdapter,
  type ProviderChatRequest,
  type ProviderChatResponse,
} from "./base.js";
import type {
  ProviderCapabilities,
  ProviderConfig,
  RuntimeAuditReport,
} from "../../../src/types/runtime.js";

const DEFAULT_MODEL = "openrouter/auto";
const DEFAULT_BASE_URL = "https://openrouter.ai/api/v1";
const REQUEST_TIMEOUT_MS = 20_000;
const MAX_ATTEMPTS = 2;

interface OpenRouterSuccessPayload {
  choices?: Array<{
    message?: {
      content?: string | Array<{ type?: string; text?: string }>;
    };
  }>;
}

function buildSchema(mode: RuntimeAuditReport["mode"]): object {
  const hypothesisMin = mode === "strict_audit" ? 0 : 0;
  const hypothesisMax = mode === "strict_audit" ? 0 : 8;

  return {
    type: "object",
    additionalProperties: false,
    required: ["summary", "nextStep", "confirmedFacts", "expertHypotheses"],
    properties: {
      summary: { type: "string", minLength: 1, maxLength: 1200 },
      nextStep: { type: "string", minLength: 1, maxLength: 300 },
      confirmedFacts: {
        type: "array",
        minItems: 1,
        maxItems: 12,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["title", "detail", "priority", "sourceToolIds"],
          properties: {
            title: { type: "string", minLength: 1, maxLength: 200 },
            detail: { type: "string", minLength: 1, maxLength: 500 },
            priority: { type: "string", enum: ["high", "medium", "low"] },
            sourceToolIds: {
              type: "array",
              minItems: 1,
              maxItems: 7,
              items: { type: "string" },
            },
          },
        },
      },
      expertHypotheses: {
        type: "array",
        minItems: hypothesisMin,
        maxItems: hypothesisMax,
        items: {
          type: "object",
          additionalProperties: false,
          required: [
            "title",
            "detail",
            "priority",
            "expectedImpact",
            "validationMethod",
          ],
          properties: {
            title: { type: "string", minLength: 1, maxLength: 200 },
            detail: { type: "string", minLength: 1, maxLength: 500 },
            priority: { type: "string", enum: ["high", "medium", "low"] },
            expectedImpact: { type: "string", minLength: 1, maxLength: 300 },
            validationMethod: { type: "string", minLength: 1, maxLength: 300 },
          },
        },
      },
    },
  };
}

function extractMessageContent(
  payload: OpenRouterSuccessPayload,
): string | null {
  const content = payload.choices?.[0]?.message?.content;
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .map((part) => (typeof part?.text === "string" ? part.text : ""))
      .join("")
      .trim();
  }
  return null;
}

function normaliseToolIds(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return input.filter((value): value is string => typeof value === "string");
}

function coerceReport(
  raw: unknown,
  request: ProviderChatRequest,
  model: string,
): RuntimeAuditReport | null {
  if (!raw || typeof raw !== "object") return null;
  const candidate = raw as Record<string, unknown>;
  if (
    typeof candidate.summary !== "string" ||
    typeof candidate.nextStep !== "string" ||
    !Array.isArray(candidate.confirmedFacts) ||
    !Array.isArray(candidate.expertHypotheses)
  ) {
    return null;
  }

  const confirmedFacts = candidate.confirmedFacts
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"))
    .map((item) => ({
      title: typeof item.title === "string" ? item.title.trim() : "",
      detail: typeof item.detail === "string" ? item.detail.trim() : "",
      priority:
        item.priority === "high" || item.priority === "low"
          ? item.priority
          : "medium",
      sourceToolIds: normaliseToolIds(item.sourceToolIds),
    }))
    .filter((item) => item.title && item.detail && item.sourceToolIds.length > 0);

  const expertHypotheses = candidate.expertHypotheses
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"))
    .map((item) => ({
      title: typeof item.title === "string" ? item.title.trim() : "",
      detail: typeof item.detail === "string" ? item.detail.trim() : "",
      priority:
        item.priority === "high" || item.priority === "low"
          ? item.priority
          : "medium",
      expectedImpact:
        typeof item.expectedImpact === "string" ? item.expectedImpact.trim() : "",
      validationMethod:
        typeof item.validationMethod === "string"
          ? item.validationMethod.trim()
          : "",
    }))
    .filter(
      (item) =>
        item.title &&
        item.detail &&
        item.expectedImpact &&
        item.validationMethod,
    );

  if (confirmedFacts.length === 0) {
    return null;
  }
  if (request.policy.mode === "strict_audit" && expertHypotheses.length > 0) {
    return null;
  }

  return {
    mode: request.policy.mode,
    providerId: "openrouter",
    model,
    generatedAt: new Date().toISOString(),
    summary: candidate.summary.trim(),
    nextStep: candidate.nextStep.trim(),
    confirmedFacts,
    expertHypotheses,
  };
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class OpenRouterAdapter implements ProviderAdapter {
  public readonly id = "openrouter" as const;
  public readonly label = "OpenRouter";
  public readonly capabilities: ProviderCapabilities = {
    ...DEFAULT_CAPABILITIES,
    streaming: false,
    toolCalls: false,
    structuredOutput: true,
  };

  private config: ProviderConfig;

  constructor(config: ProviderConfig) {
    const check = validateProviderConfig(config);
    if (!check.ok) {
      throw new Error(`openrouter adapter init failed: ${check.reason}`);
    }
    this.config = config;
  }

  isConfigured(): boolean {
    return this.config.apiKey.trim().length > 0;
  }

  private buildUserPrompt(request: ProviderChatRequest): string {
    const factsSection = request.scanContext
      ? JSON.stringify(request.scanContext, null, 2)
      : "No structured scan context is available yet.";

    return [
      "Produce a ToraSEO audit response using the required JSON schema only.",
      "Do not wrap the JSON in markdown fences.",
      "",
      "User request:",
      request.userText,
      "",
      "Active analysis type:",
      request.analysisType === "site"
        ? "Site audit by URL. Redirect unrelated or generic assistant requests back to the current site audit."
        : "Unsupported analysis type. Do not answer outside the active ToraSEO workflow.",
      "",
      "Current scan context:",
      factsSection,
      "",
      "Important mode rules:",
      request.policy.mode === "strict_audit"
        ? "- Expert hypotheses are forbidden in this mode."
        : "- Expert hypotheses are allowed, but must be clearly actionable and explicitly framed as hypotheses.",
    ].join("\n");
  }

  private async executeAttempt(
    request: ProviderChatRequest,
    model: string,
    signal: AbortSignal,
  ): Promise<ProviderChatResponse> {
    const endpoint = `${(this.config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "")}/chat/completions`;

    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: "POST",
        signal,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.config.apiKey}`,
          "HTTP-Referer": "https://github.com/Magbusjap/toraseo",
          "X-Title": "ToraSEO",
        },
        body: JSON.stringify({
          model,
          temperature: request.policy.mode === "strict_audit" ? 0.1 : 0.35,
          messages: [
            { role: "system", content: request.policy.systemPrompt },
            { role: "user", content: this.buildUserPrompt(request) },
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "toraseo_audit_report",
              strict: true,
              schema: buildSchema(request.policy.mode),
            },
          },
        }),
      });
    } catch (error) {
      if ((error as Error).name === "AbortError") {
        return {
          ok: false,
          errorCode: "provider_timeout",
          errorMessage: "The AI provider took too long to respond.",
        };
      }
      return {
        ok: false,
        errorCode: "provider_network_error",
        errorMessage:
          error instanceof Error
            ? error.message
            : "Network error while contacting OpenRouter.",
      };
    }

    if (response.status === 401 || response.status === 403) {
      return {
        ok: false,
        errorCode: "provider_auth_failed",
        errorMessage: "OpenRouter rejected the API key.",
      };
    }
    if (response.status === 429) {
      return {
        ok: false,
        errorCode: "provider_rate_limited",
        errorMessage: "OpenRouter rate-limited the request.",
      };
    }
    if (!response.ok) {
      return {
        ok: false,
        errorCode:
          response.status >= 500
            ? "provider_temporary_failure"
            : "provider_http_error",
        errorMessage: `OpenRouter returned HTTP ${response.status}.`,
      };
    }

    let payload: OpenRouterSuccessPayload;
    try {
      payload = (await response.json()) as OpenRouterSuccessPayload;
    } catch {
      return {
        ok: false,
        errorCode: "provider_bad_response",
        errorMessage: "OpenRouter returned invalid JSON.",
      };
    }

    const content = extractMessageContent(payload);
    if (!content) {
      return {
        ok: false,
        errorCode: "provider_bad_response",
        errorMessage: "OpenRouter response did not include message content.",
      };
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      return {
        ok: false,
        errorCode: "provider_bad_response",
        errorMessage: "OpenRouter returned non-JSON content.",
      };
    }

    const report = coerceReport(parsed, request, model);
    if (!report) {
      return {
        ok: false,
        errorCode: "provider_bad_response",
        errorMessage: "OpenRouter response did not satisfy the audit contract.",
      };
    }

    return {
      ok: true,
      model,
      report,
      text: report.summary,
    };
  }

  async sendChat(request: ProviderChatRequest): Promise<ProviderChatResponse> {
    if (!this.isConfigured()) {
      return {
        ok: false,
        errorCode: "provider_not_configured",
        errorMessage:
          "OpenRouter is not configured. Add an API key in Settings.",
      };
    }

    const model =
      request.modelOverride ?? this.config.defaultModel ?? DEFAULT_MODEL;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      try {
        const result = await this.executeAttempt(request, model, controller.signal);
        const shouldRetry =
          attempt < MAX_ATTEMPTS &&
          (result.errorCode === "provider_temporary_failure" ||
            result.errorCode === "provider_network_error" ||
            result.errorCode === "provider_rate_limited");
        if (shouldRetry) {
          await wait(attempt * 500);
          continue;
        }
        return result;
      } finally {
        clearTimeout(timeout);
      }
    }

    return {
      ok: false,
      errorCode: "provider_temporary_failure",
      errorMessage: "OpenRouter did not complete the request after retrying.",
    };
  }
}
