/**
 * Builds the prompt that gets copied to the user's clipboard when
 * they click Scan. The prompt is an instruction to Claude Desktop:
 * the ToraSEO Desktop App is running and waiting for an audit.
 *
 * SECURITY DESIGN: The prompt deliberately does NOT contain the
 * Bridge Mode protocol token. The token lives ONLY in SKILL.md
 * and the MCP server. This means:
 *
 *   - If the user has the toraseo Skill installed, Claude reads
 *     the token from SKILL.md §2.2 and calls verify_skill_loaded
 *     correctly. Handshake passes.
 *   - If the user does NOT have the Skill installed, Claude has
 *     no way to know the token. Even if Claude tries to call
 *     verify_skill_loaded with a guessed value, MCP rejects it
 *     (token_mismatch). Bridge Mode refuses to proceed.
 *
 * This makes the Skill a HARD dependency — without it, scans
 * cannot complete. Previously the prompt embedded the token and
 * effectively bypassed the Skill (any model with MCP access could
 * pass handshake by reading the token from chat). That was a
 * defense-in-depth gap discovered during v0.0.7 dogfooding.
 *
 * COMMAND PREFIX: The prompt begins with `/toraseo bridge-mode`,
 * which SKILL.md §2.1 recognizes as an unambiguous trigger. This
 * is more robust than relying on Claude to parse natural-language
 * mentions of "приложение ToraSEO" — slash-prefixed commands are
 * the closest thing to a wire protocol Claude can reliably detect.
 *
 * The phrase "Приложение ToraSEO запущено" / "The ToraSEO Desktop
 * App is running" is also kept in the body as a fallback signal
 * for free-form interpretation (e.g. if the user truncates the
 * paste before the slash command for some reason). SKILL.md
 * recognizes both.
 *
 * Why a hardcoded template instead of pulling from i18n locales:
 *   - The prompt is a wire-format directed at Claude, not at the
 *     user. Localization choices here affect Claude's parsing
 *     reliability, not UX readability.
 *   - The prompt is built in the main process (no React, no
 *     i18next available). We could load JSON files manually but
 *     that adds complexity for two strings.
 *   - Keeping the templates here lets us hand-tune them as we
 *     learn how Claude responds to phrasing variations, without
 *     a renderer rebuild.
 *
 * If Mikhail's translation team ever wants to manage these as
 * normal i18n keys, this module can be replaced by an IPC call
 * from the renderer (which has i18next loaded). For v0.0.7 the
 * inline approach is simplest and reliable.
 */

import type { ToolId, SupportedLocale } from "../../src/types/ipc.js";

/**
 * Russian template. Kept terse and direct — Claude follows
 * imperative instructions more reliably than questions, and a
 * shorter prompt is easier to paste without truncation.
 *
 * The `/toraseo bridge-mode` prefix is the primary trigger —
 * SKILL.md §2.1 treats it as definitive. The "Приложение ToraSEO
 * запущено" phrase is a secondary natural-language trigger.
 */
const TEMPLATE_RU = (url: string, tools: string): string =>
  `/toraseo bridge-mode

Приложение ToraSEO запущено и ожидает анализа сайта ${url}.

Используй инструменты: ${tools}.

Результаты будут отображены в приложении ToraSEO.
После завершения анализа дай рекомендации в чате на основе данных.`;

/**
 * English template. Mirrors the Russian structure verb-for-verb
 * so behavior is consistent across locales.
 */
const TEMPLATE_EN = (url: string, tools: string): string =>
  `/toraseo bridge-mode

The ToraSEO Desktop App is running and waiting for a scan of ${url}.

Use the tools: ${tools}.

Results will be displayed in the ToraSEO Desktop App.
After all tools complete, provide recommendations in chat based on the data.`;

/**
 * Build the full prompt for clipboard.
 *
 * @param url     The site to audit (already validated by App)
 * @param toolIds Selected tools, in display order
 * @param locale  UI locale; chooses RU or EN template
 *
 * Note: this function intentionally does NOT take a token
 * parameter. See the SECURITY DESIGN note at the top of this
 * file for the reasoning.
 */
export function buildScanPrompt(
  url: string,
  toolIds: ToolId[],
  locale: SupportedLocale,
): string {
  // Comma-separated tool names — Claude reads this as a list.
  const toolsList = toolIds.join(", ");
  const template = locale === "ru" ? TEMPLATE_RU : TEMPLATE_EN;
  return template(url, toolsList);
}
