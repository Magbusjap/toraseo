/**
 * Builds the short clipboard prompt for ToraSEO bridge runs.
 *
 * The prompt is only a trigger. Protocol tokens, selected-tool details,
 * language rules, final-summary rules, and report-submission rules live in
 * the installed SKILL package and the ToraSEO MCP handshake.
 */

import { bridgePromptCopy } from "../../src/i18n/bridgePrompts.js";
import type {
  BridgeClient,
  CurrentScanState,
  SupportedLocale,
} from "../../src/types/ipc.js";

type PromptState = Pick<CurrentScanState, "analysisType" | "input"> | undefined;
type PromptLocale = keyof typeof bridgePromptCopy;

function promptLocale(locale: SupportedLocale): PromptLocale {
  return locale === "ru" ? "ru" : "en";
}

function compareGoalLabel(state: PromptState, fallback: string): string {
  return state?.input?.goal?.trim() || fallback;
}

function interpolate(template: string, values: Record<string, string>): string {
  return Object.entries(values).reduce(
    (result, [key, value]) => result.replaceAll(`{{${key}}}`, value),
    template,
  );
}

function articleTextLabel(state: PromptState, locale: SupportedLocale): string {
  const copy = bridgePromptCopy[promptLocale(locale)].articleKind;
  return state?.input?.action === "solution" ? copy.solution : copy.analysis;
}

function bridgePrefix(
  bridgeClient: BridgeClient,
  locale: SupportedLocale,
): string {
  if (bridgeClient === "codex") {
    return `${bridgePromptCopy[promptLocale(locale)].codexPrefix}\n\n/toraseo codex-bridge-mode`;
  }
  return "/toraseo bridge-mode";
}

function bridgeSuffix(locale: SupportedLocale): string {
  return bridgePromptCopy[promptLocale(locale)].suffix;
}

function runSelectedToolsLine(locale: SupportedLocale): string {
  return bridgePromptCopy[promptLocale(locale)].runSelectedTools;
}

function isSiteCompare(url: string, state: PromptState): boolean {
  return (
    state?.analysisType === "site_compare" ||
    url === "toraseo://site-compare" ||
    Boolean(state?.input?.siteUrls?.length)
  );
}

function isPageByUrl(state: PromptState): boolean {
  return (
    state?.analysisType === "page_by_url" ||
    state?.input?.sourceType === "page_by_url"
  );
}

export function buildScanPrompt(
  url: string,
  _toolIds: string[],
  locale: SupportedLocale,
  bridgeClient: BridgeClient = "claude",
  state?: Pick<CurrentScanState, "analysisType" | "input">,
): string {
  const copy = bridgePromptCopy[promptLocale(locale)];
  const prefix = bridgePrefix(bridgeClient, locale);
  const suffix = bridgeSuffix(locale);

  if (isSiteCompare(url, state)) {
    return `${prefix} site-compare

${copy.waiting.siteCompare}
${runSelectedToolsLine(locale)}
${suffix}`;
  }

  if (isPageByUrl(state)) {
    return `${prefix} page-by-url

${copy.waiting.pageByUrl}
${runSelectedToolsLine(locale)}
${suffix}`;
  }

  if (state?.analysisType === "article_text") {
    return `${prefix} article-text

${interpolate(copy.waiting.articleText, { kind: articleTextLabel(state, locale) })}
${runSelectedToolsLine(locale)}
${suffix}`;
  }

  if (state?.analysisType === "article_compare") {
    return `${prefix} article-compare

${copy.waiting.articleCompare}
${copy.goalLabel}: ${compareGoalLabel(state, copy.standardCompareGoal)}.
${runSelectedToolsLine(locale)}
${suffix}`;
  }

  return `${prefix} site-by-url

${copy.waiting.siteByUrl}
${runSelectedToolsLine(locale)}
${suffix}`;
}

export function buildBridgeSetupPrompt(
  locale: SupportedLocale,
  bridgeClient: BridgeClient,
): string {
  const copy = bridgePromptCopy[promptLocale(locale)];
  const prefix = bridgePrefix(bridgeClient, locale);
  return `${prefix} setup-check

${copy.waiting.setupCheck}
${bridgeSuffix(locale)}`;
}

export function buildCodexSetupPrompt(locale: SupportedLocale): string {
  return buildBridgeSetupPrompt(locale, "codex");
}
