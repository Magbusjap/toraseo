/**
 * Builds the prompt that gets copied to the user's clipboard when
 * they click Scan. The prompt is an instruction to Claude Desktop:
 * call verify_skill_loaded() first, then run the listed tools.
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
 */
const TEMPLATE_RU = (url: string, tools: string, token: string): string =>
  `Запусти SEO-анализ для сайта ${url} через ToraSEO.

Сначала вызови verify_skill_loaded("${token}").
Затем вызови инструменты: ${tools}.

Результаты будут отображены в приложении ToraSEO.
После завершения анализа дай рекомендации в чате на основе данных.`;

/**
 * English template. Mirrors the Russian structure verb-for-verb
 * so behavior is consistent across locales.
 */
const TEMPLATE_EN = (url: string, tools: string, token: string): string =>
  `Run a SEO audit for ${url} via ToraSEO.

First, call verify_skill_loaded("${token}").
Then call the tools: ${tools}.

Results will be displayed in the ToraSEO app.
After all tools complete, provide recommendations in chat based on the data.`;

/**
 * Build the full prompt for clipboard.
 *
 * @param url           The site to audit (already validated by App)
 * @param toolIds       Selected tools, in display order
 * @param protocolToken The Bridge Mode protocol token expected from
 *                      Claude (passed via verify_skill_loaded)
 * @param locale        UI locale; chooses RU or EN template
 */
export function buildScanPrompt(
  url: string,
  toolIds: ToolId[],
  protocolToken: string,
  locale: SupportedLocale,
): string {
  // Comma-separated tool names — Claude reads this as a list.
  const toolsList = toolIds.join(", ");
  const template = locale === "ru" ? TEMPLATE_RU : TEMPLATE_EN;
  return template(url, toolsList, protocolToken);
}
