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
  ProviderUsage,
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
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
    cost?: number;
  };
  error?: {
    message?: string;
    code?: string | number;
    type?: string;
  };
}

type OutputContractMode = "json_schema" | "prompt_only";

function buildSchema(mode: RuntimeAuditReport["mode"]): object {
  const hypothesisMin = mode === "strict_audit" ? 0 : 0;
  const hypothesisMax = mode === "strict_audit" ? 0 : 8;

  return {
    type: "object",
    additionalProperties: false,
    required: ["summary", "nextStep", "confirmedFacts", "expertHypotheses"],
    properties: {
      summary: {
        type: "string",
        minLength: 40,
        maxLength: 1600,
        description:
          "A concise but useful audit summary in the user's interface language.",
      },
      nextStep: {
        type: "string",
        minLength: 30,
        maxLength: 500,
        description:
          "The single most important next action, written in the user's interface language.",
      },
      confirmedFacts: {
        type: "array",
        minItems: 1,
        maxItems: 12,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["title", "detail", "priority", "sourceToolIds"],
          properties: {
            title: {
              type: "string",
              minLength: 1,
              maxLength: 200,
              description: "Finding title in the user's interface language.",
            },
            detail: {
              type: "string",
              minLength: 20,
              maxLength: 700,
              description:
                "Evidence-backed explanation in the user's interface language.",
            },
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
            detail: { type: "string", minLength: 20, maxLength: 700 },
            priority: { type: "string", enum: ["high", "medium", "low"] },
            expectedImpact: { type: "string", minLength: 20, maxLength: 400 },
            validationMethod: { type: "string", minLength: 20, maxLength: 400 },
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

function normaliseUsage(
  usage: OpenRouterSuccessPayload["usage"],
): ProviderUsage | undefined {
  if (!usage || typeof usage !== "object") return undefined;
  const result: ProviderUsage = {};
  if (typeof usage.prompt_tokens === "number") {
    result.promptTokens = usage.prompt_tokens;
  }
  if (typeof usage.completion_tokens === "number") {
    result.completionTokens = usage.completion_tokens;
  }
  if (typeof usage.total_tokens === "number") {
    result.totalTokens = usage.total_tokens;
  }
  if (typeof usage.cost === "number") {
    result.cost = usage.cost;
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

function parseJson(text: string): unknown | null {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function parseProviderPayload(rawText: string): OpenRouterSuccessPayload | null {
  const parsed = parseJson(rawText);
  return parsed && typeof parsed === "object"
    ? (parsed as OpenRouterSuccessPayload)
    : null;
}

function extractProviderErrorMessage(rawText: string): string | null {
  const payload = parseProviderPayload(rawText);
  if (typeof payload?.error?.message === "string") {
    return payload.error.message;
  }
  const trimmed = rawText.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, 300);
}

function looksLikeStructuredOutputRejection(message: string | null): boolean {
  if (!message) return false;
  const lower = message.toLowerCase();
  return (
    lower.includes("response_format") ||
    lower.includes("json_schema") ||
    lower.includes("structured output") ||
    lower.includes("structured outputs")
  );
}

function looksLikeGenericProviderRejection(message: string | null): boolean {
  if (!message) return false;
  const lower = message.toLowerCase();
  return (
    lower.includes("provider returned error") ||
    lower.includes("provider error") ||
    lower.includes("upstream error")
  );
}

function parseAuditContent(content: string): unknown | null {
  const trimmed = content.trim();
  if (!trimmed) return null;

  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const candidate = fenced?.[1]?.trim() ?? trimmed;
  const direct = parseJson(candidate);
  if (direct) return direct;

  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start >= 0 && end > start) {
    return parseJson(candidate.slice(start, end + 1));
  }

  return null;
}

function isRetryableProviderResult(result: ProviderChatResponse): boolean {
  return (
    result.errorCode === "provider_temporary_failure" ||
    result.errorCode === "provider_network_error" ||
    result.errorCode === "provider_rate_limited"
  );
}

function shouldTryPromptOnlyFallback(result: ProviderChatResponse): boolean {
  return (
    result.errorCode === "provider_bad_response" ||
    result.errorCode === "provider_structured_output_unsupported"
  );
}

function hasScanEvidence(request: ProviderChatRequest): boolean {
  return Boolean(
    request.scanContext &&
      (request.scanContext.completedTools.length > 0 ||
        request.scanContext.facts.length > 0),
  );
}

function resolveBaseUrl(configBaseUrl?: string): string {
  const raw = configBaseUrl?.trim();
  if (!raw) return DEFAULT_BASE_URL;

  try {
    const parsed = new URL(raw);
    const isOpenRouterHost =
      parsed.hostname === "openrouter.ai" ||
      parsed.hostname.endsWith(".openrouter.ai");

    if (isOpenRouterHost && !parsed.pathname.startsWith("/api/")) {
      return DEFAULT_BASE_URL;
    }
  } catch {
    return raw;
  }

  return raw;
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
    if (!hasScanEvidence(request)) {
      const languageInstruction =
        request.policy.locale === "ru"
          ? "Ответь по-русски."
          : "Reply in English.";

      return [
        "This is a pre-scan ToraSEO chat turn. Do not return JSON.",
        languageInstruction,
        "You may explain how ToraSEO works, what the current analysis mode can do, how the user should run a site audit, and what kind of questions can be asked after scan results exist.",
        "If the user asks you to analyze a site, article, pasted content, or anything outside the active ToraSEO workflow, explain that the analysis must be started from the main ToraSEO window first.",
        "Keep the answer helpful and concise.",
        "",
        `User message: ${request.userText}`,
      ].join("\n");
    }

    const factsSection = request.scanContext
      ? JSON.stringify(request.scanContext, null, 2)
      : "No structured scan context is available yet.";
    const languageInstruction =
      request.policy.locale === "ru"
        ? "Write every user-facing JSON string value in Russian. Keep only product names, URLs, tool IDs, and fixed SEO terms such as Open Graph in English when that is the normal term."
        : "Write every user-facing JSON string value in English.";

    return [
      "Produce a ToraSEO audit response using the required JSON schema only.",
      "Do not wrap the JSON in markdown fences.",
      languageInstruction,
      "Make the answer substantial: include concrete evidence from the scan, prioritized recommendations, and one practical next step.",
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
    outputContractMode: OutputContractMode,
  ): Promise<ProviderChatResponse> {
    const endpoint = `${resolveBaseUrl(this.config.baseUrl).replace(/\/+$/, "")}/chat/completions`;
    const requestBody: Record<string, unknown> = {
      model,
      temperature: request.policy.mode === "strict_audit" ? 0.1 : 0.35,
      max_tokens: hasScanEvidence(request) ? 1800 : 700,
      messages: [
        { role: "system", content: request.policy.systemPrompt },
        { role: "user", content: this.buildUserPrompt(request) },
      ],
    };

    if (outputContractMode === "json_schema") {
      requestBody.response_format = {
        type: "json_schema",
        json_schema: {
          name: "toraseo_audit_report",
          strict: true,
          schema: buildSchema(request.policy.mode),
        },
      };
    }

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
        body: JSON.stringify(requestBody),
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

    let rawBody: string;
    try {
      rawBody = await response.text();
    } catch {
      return {
        ok: false,
        errorCode: "provider_bad_response",
        errorMessage: "OpenRouter response body could not be read.",
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
      const providerMessage = extractProviderErrorMessage(rawBody);
      if (
        response.status === 400 &&
        outputContractMode === "json_schema" &&
        (looksLikeStructuredOutputRejection(providerMessage) ||
          looksLikeGenericProviderRejection(providerMessage))
      ) {
        return {
          ok: false,
          errorCode: "provider_structured_output_unsupported",
          errorMessage:
            "The selected OpenRouter model does not support strict structured output.",
        };
      }
      return {
        ok: false,
        errorCode:
          response.status >= 500
            ? "provider_temporary_failure"
            : "provider_http_error",
        errorMessage: providerMessage
          ? `OpenRouter returned HTTP ${response.status}: ${providerMessage}`
          : `OpenRouter returned HTTP ${response.status}.`,
      };
    }

    const payload = parseProviderPayload(rawBody);
    if (!payload) {
      return {
        ok: false,
        errorCode: "provider_bad_response",
        errorMessage:
          outputContractMode === "json_schema"
            ? "OpenRouter returned a non-JSON API response."
            : "OpenRouter returned a non-JSON API response after compatibility fallback.",
      };
    }
    if (payload.error?.message) {
      return {
        ok: false,
        errorCode: "provider_http_error",
        errorMessage: payload.error.message,
      };
    }

    const content = extractMessageContent(payload);
    const usage = normaliseUsage(payload.usage);
    if (!content) {
      return {
        ok: false,
        errorCode: "provider_bad_response",
        errorMessage: "OpenRouter response did not include message content.",
      };
    }

    const parsed = parseAuditContent(content);
    if (!parsed) {
      if (outputContractMode === "prompt_only") {
        return {
          ok: true,
          model,
          usage,
          text: content.trim(),
        };
      }
      return {
        ok: false,
        errorCode: "provider_bad_response",
        errorMessage: "OpenRouter returned non-JSON message content.",
      };
    }

    const report = coerceReport(parsed, request, model);
    if (!report) {
      if (outputContractMode === "prompt_only") {
        return {
          ok: true,
          model,
          usage,
          text: content.trim(),
        };
      }
      return {
        ok: false,
        errorCode: "provider_bad_response",
        errorMessage: "OpenRouter response did not satisfy the audit contract.",
      };
    }

    return {
      ok: true,
      model,
      usage,
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
        const initialContractMode: OutputContractMode = hasScanEvidence(request)
          ? "json_schema"
          : "prompt_only";
        const result = await this.executeAttempt(
          request,
          model,
          controller.signal,
          initialContractMode,
        );
        const shouldRetry =
          attempt < MAX_ATTEMPTS && isRetryableProviderResult(result);
        if (shouldRetry) {
          await wait(attempt * 500);
          continue;
        }
        if (shouldTryPromptOnlyFallback(result)) {
          const fallbackController = new AbortController();
          const fallbackTimeout = setTimeout(
            () => fallbackController.abort(),
            REQUEST_TIMEOUT_MS,
          );
          try {
            const fallback = await this.executeAttempt(
              request,
              model,
              fallbackController.signal,
              "prompt_only",
            );
            if (fallback.ok) return fallback;
            if (fallback.errorCode === "provider_bad_response") {
              return {
                ok: false,
                errorCode: "provider_bad_response",
                errorMessage:
                  "The selected OpenRouter model did not return parseable audit content. Try a model with structured JSON support.",
              };
            }
            return fallback;
          } finally {
            clearTimeout(fallbackTimeout);
          }
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
