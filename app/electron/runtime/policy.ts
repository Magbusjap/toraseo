/**
 * Native Runtime — Policy layer (SKILL inside app).
 *
 * Stage 1 (skeleton): provides a tiny, deterministic policy
 * compiler that builds a system prompt + rule bundle for a given
 * mode/locale. A fuller policy system will land later, but it
 * should stay split into curated fragments rather than mirroring
 * a giant external SKILL.md wholesale.
 *
 * Why this lives in main process:
 *   - System prompts assemble inputs that may include provider
 *     credentials, MCP scan results, and user data. Composing
 *     them outside the sandbox keeps the renderer ignorant of
 *     secrets.
 *   - Later policy stages may read curated rule files from disk;
 *     only main has fs access in our sandboxed setup.
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
 * skeleton deterministic; later stages can replace them with
 * curated rule packs without forcing the runtime to ingest a
 * monolithic instruction file.
 */
const STAGE1_RULES: RuntimePolicyRule[] = [
  {
    id: "scope.toraseo-only",
    text: "You operate strictly inside the ToraSEO product context. Decline tasks unrelated to SEO audit, content review, or interpretation of MCP tool results.",
  },
  {
    id: "scope.active-analysis",
    text: "Answer only for the active analysis type and current scan evidence. Redirect generic assistant requests back to the active ToraSEO workflow.",
  },
  {
    id: "facts.vs.hypotheses",
    text: "Always separate confirmed facts (sourced from MCP tool outputs) from expert hypotheses. Mark hypotheses explicitly.",
  },
  {
    id: "format.structured",
    text: "Respond with structured audit data: confirmed facts first, optional expert hypotheses second, then one concrete next step.",
    modes: ["audit_plus_ideas"],
  },
  {
    id: "format.facts-only",
    text: "Respond using only confirmed facts from the provided scan evidence. Do NOT add speculative recommendations in this mode.",
    modes: ["strict_audit"],
  },
  {
    id: "analysis.priority",
    text: "Every fact and hypothesis must include a priority. Hypotheses must also include expected impact and a validation method.",
  },
  {
    id: "text.workflow-scope",
    text: "For text/content workflows, keep the dialog focused on analysis, recommendations, contradiction checks, or article drafting. If the user asks for unrelated search, offer to gather material for the article instead.",
  },
  {
    id: "text.generate-vs-analyze",
    text: "If the user asks to analyze a ready text, do not abruptly rewrite the whole article; ask whether they want a rewrite. If they explicitly ask for an AI solution or draft and there is enough context, provide a separate copyable article block and recommend re-running text analysis on the finished version.",
  },
  {
    id: "text.media-placement-before-rewrite",
    text: "Before rewriting or substantially reworking an article, immediately ask whether the user wants recommended image positions marked for better SEO. If the user agrees, or already asked for image placement guidance, insert exact ToraSEO media placeholder lines at the intended positions inside the article. Russian markers: ------------------------- место для изображения -------------------------- / ------------------------- место для анимации ---------------------------- / ------------------------- место для видео ------------------------------- / ------------------------- место для аудио -------------------------------. English markers: ------------------------- image placeholder ------------------------- / ------------------------ animation placeholder ----------------------- / ------------------------- video placeholder -------------------------- / ------------------------- audio placeholder --------------------------. Do not move all media markers to the end and do not invent alternate labels.",
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
    locale === "ru"
      ? "Critical language requirement: every user-facing string in the final answer and JSON fields must be in Russian. Keep only product names, tool IDs, URLs, and technical constants in English."
      : "Critical language requirement: every user-facing string in the final answer and JSON fields must be in English. Keep product names, tool IDs, URLs, and technical constants unchanged.",
    "Stay within the ToraSEO scope at all times.",
    "Return machine-parseable structured audit content when scan evidence is available. Before scan evidence exists, answer as a scoped ToraSEO guide in plain text.",
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
