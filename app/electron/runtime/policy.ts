/**
 * Native Runtime — Policy layer (SKILL inside app).
 *
 * Stage 1 (skeleton): provides a tiny, deterministic policy
 * compiler that builds a system prompt + rule bundle for a given
 * mode/locale. Real SKILL.md mirroring (full ruleset extracted
 * from skill/SKILL.md) lands in Stage 2.
 *
 * Why this lives in main process:
 *   - System prompts assemble inputs that may include provider
 *     credentials, MCP scan results, and user data. Composing
 *     them outside the sandbox keeps the renderer ignorant of
 *     secrets.
 *   - Stage 2 will read SKILL.md from disk; only main has fs
 *     access in our sandboxed setup.
 *
 * Contract guarantee: the orchestrator never builds a system
 * prompt itself — it always asks the policy layer. This is the
 * single hook for tightening the rules without touching the
 * orchestrator or providers.
 */

import type {
  RuntimePolicyBundle,
  RuntimePolicyMode,
  RuntimePolicyRule,
} from "../../src/types/runtime.js";
import type { SupportedLocale } from "../../src/types/ipc.js";

/**
 * Stage-1 placeholder rules. Hardcoded for now to keep the
 * skeleton deterministic; Stage 2 swaps these out for rules
 * loaded from `skill/SKILL.md` at runtime.
 */
const STAGE1_RULES: RuntimePolicyRule[] = [
  {
    id: "scope.toraseo-only",
    text: "You operate strictly inside the ToraSEO product context. Decline tasks unrelated to SEO audit, content review, or interpretation of MCP tool results.",
  },
  {
    id: "facts.vs.hypotheses",
    text: "Always separate confirmed facts (sourced from MCP tool outputs) from expert hypotheses. Mark hypotheses explicitly.",
  },
  {
    id: "format.structured",
    text: "Respond with a clear structure: confirmed facts first, then optional expert recommendations, then suggested next step.",
    modes: ["audit_plus_ideas"],
  },
  {
    id: "format.facts-only",
    text: "Respond using only facts available in the provided MCP results. Do NOT add speculative recommendations in this mode.",
    modes: ["strict_audit"],
  },
];

/**
 * Compose the system prompt header. Kept short and stable so the
 * provider's first turn is predictable. Stage 2 will extend this
 * with localized SKILL excerpts.
 */
function buildSystemPromptHeader(
  mode: RuntimePolicyMode,
  locale: SupportedLocale,
): string {
  const modeLabel =
    mode === "strict_audit"
      ? "Strict audit mode (facts only)"
      : "Audit + expert ideas mode";
  return [
    "You are the ToraSEO native runtime assistant.",
    `Active mode: ${modeLabel}.`,
    `User locale: ${locale}. Reply in the user's language.`,
    "Stay within the ToraSEO scope at all times.",
  ].join("\n");
}

/**
 * Build the policy bundle for the given mode/locale. Pure function;
 * deterministic; safe to call on every request.
 */
export function compilePolicy(
  mode: RuntimePolicyMode,
  locale: SupportedLocale,
): RuntimePolicyBundle {
  const rules = STAGE1_RULES.filter(
    (rule) => !rule.modes || rule.modes.includes(mode),
  );

  const systemPrompt = [
    buildSystemPromptHeader(mode, locale),
    "",
    "Rules:",
    ...rules.map((rule, idx) => `${idx + 1}. ${rule.text}`),
  ].join("\n");

  return {
    mode,
    locale,
    systemPrompt,
    rules,
  };
}
