/**
 * Builds the prompt that gets copied to the user's clipboard when
 * they click Scan. The prompt is an instruction to the selected bridge
 * client (Claude Desktop or Codex): the ToraSEO Desktop App is running
 * and waiting for an audit.
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

import type {
  BridgeClient,
  CurrentScanState,
  SupportedLocale,
} from "../../src/types/ipc.js";

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

const CODEX_TEMPLATE_EN = (url: string): string =>
  `Use $toraseo-codex-workflow.

/toraseo codex-bridge-mode

ToraSEO is waiting for a site scan: ${url}.
Use SKILL + MCP for the details.`;

const CODEX_TEMPLATE_RU = (url: string): string =>
  `Используй $toraseo-codex-workflow.

/toraseo codex-bridge-mode

ToraSEO ожидает анализ сайта: ${url}.
Детали возьми из SKILL + MCP.`;

const TEXT_EVIDENCE_BOUNDARY =
  "Base recommendations only on selected MCP tool evidence. Use intent_seo_forecast for intent, hook, CTR, and CMS metadata suggestions when present. Keep backend IDs out of user-facing wording: translate platform/tool/issue keys into human-readable language and show raw IDs only in parentheses when useful for debugging. If the CMS metadata looks copied from a service line such as Part 1, Download PDF, or a numeric navigation line, call it a weak draft and suggest a clearer title, description, keywords, category, tags, and slug from the article topic. Use safety_science_review warnings for unsafe, legal-sensitive, scientific, or calculation-heavy content, while noting that AI can be wrong and does not replace expert review. Do not claim live SERP/social demand unless an external data source explicitly provides it. Do not rewrite, rank, or add editorial claims outside that evidence. If the user later asks to rewrite or improve the analyzed article, call article_rewrite_context instead of reading input.md directly or asking the user to paste the article again. Write the rewritten article directly in chat as a separate copyable article block; the user will copy it into ToraSEO and run a new scan. Keep rewrite choices aligned with the active workflow instructions, selected tools, platform/style/audience fit, SEO intent, media-marker policy, and risk warnings.";

function articleTextRunLabel(state?: Pick<CurrentScanState, "input">): {
  isSolution: boolean;
  labelEn: string;
  labelRu: string;
} {
  const isSolution = state?.input?.action === "solution";
  return {
    isSolution,
    labelEn: isSolution
      ? "article solution / draft proposal"
      : "article text analysis",
    labelRu: isSolution
      ? "предложение решения / черновика по статье"
      : "анализ текста статьи",
  };
}

function compareGoalLabel(
  state: Pick<CurrentScanState, "input"> | undefined,
  fallback: string,
): string {
  return state?.input?.goal?.trim() || fallback;
}

function compareGoalModeLabel(
  state: Pick<CurrentScanState, "input"> | undefined,
  locale: SupportedLocale,
): string {
  const mode = state?.input?.goalMode ?? "standard_comparison";
  const labels: Record<string, { en: string; ru: string }> = {
    standard_comparison: {
      en: "standard comparison",
      ru: "стандартное сравнение",
    },
    focus_text_a: { en: "focus on Text A", ru: "фокус на тексте A" },
    focus_text_b: { en: "focus on Text B", ru: "фокус на тексте B" },
    beat_competitor: {
      en: "competitor comparison",
      ru: "сравнение с конкурентом",
    },
    style_match: { en: "style matching", ru: "подражание стилю" },
    similarity_check: {
      en: "similarity check",
      ru: "проверка похожести",
    },
    version_compare: {
      en: "version comparison",
      ru: "сравнение версий",
    },
    ab_post: { en: "A/B post comparison", ru: "A/B-анализ поста" },
  };
  return labels[mode]?.[locale] ?? labels.standard_comparison[locale];
}

const COMPARE_TEMPLATE_EN = (
  _tools: string,
  state?: Pick<CurrentScanState, "input">,
): string =>
  `/toraseobridge article-compare

ToraSEO is waiting for two-text comparison.
Goal: ${compareGoalLabel(state, "standard comparison report")}.
Goal mode: ${compareGoalModeLabel(state, "en")}.
Texts, roles, selected tools, and boundaries are already inside ToraSEO MCP + Instructions.
Use the required ToraSEO connection check, then run the comparison checks.
In the final chat answer, do not mention service details of the connection check, scan identifiers, tool ids, aggregate comparison tools, or result files. Write a normal user-facing comparison summary.`;

const COMPARE_TEMPLATE_RU = (
  _tools: string,
  state?: Pick<CurrentScanState, "input">,
): string =>
  `/toraseobridge article-compare

ToraSEO ожидает сравнение двух текстов.
Цель: ${compareGoalLabel(state, "стандартный отчет сравнения")}.
Режим отчета по цели: ${compareGoalModeLabel(state, "ru")}.
Тексты, роли, выбранные инструменты и границы анализа уже внутри ToraSEO MCP + Instructions.
Сделай обязательную проверку подключения ToraSEO, затем запусти проверки сравнения.
В финальном ответе в чате не упоминай служебные детали проверки подключения, идентификаторы запуска, технические id инструментов, агрегатор сравнения или файлы результатов. Напиши обычную пользовательскую сводку сравнения.`;

const CODEX_COMPARE_TEMPLATE_EN = (
  state?: Pick<CurrentScanState, "input">,
): string =>
  `Use $toraseo-codex-workflow.

/toraseo codex-bridge-mode article-compare

ToraSEO is waiting for two-text comparison.
Goal: ${compareGoalLabel(state, "standard comparison report")}.
Goal mode: ${compareGoalModeLabel(state, "en")}.
Texts, roles, selected tools, and boundaries are already inside the app, SKILL, and MCP.
Use the required ToraSEO connection check, then run the comparison checks.
In the final chat answer, do not mention service details of the connection check, scan identifiers, tool ids, aggregate comparison tools, or result files. Write a normal user-facing comparison summary.`;

const CODEX_COMPARE_TEMPLATE_RU = (
  state?: Pick<CurrentScanState, "input">,
): string =>
  `Используй $toraseo-codex-workflow.

/toraseo codex-bridge-mode article-compare

ToraSEO ожидает сравнение двух текстов.
Цель: ${compareGoalLabel(state, "стандартный отчет сравнения")}.
Режим отчета по цели: ${compareGoalModeLabel(state, "ru")}.
Тексты, роли, выбранные инструменты и границы анализа уже внутри приложения, SKILL и MCP.
Сделай обязательную проверку подключения ToraSEO, затем запусти проверки сравнения.
В финальном ответе в чате не упоминай служебные детали проверки подключения, идентификаторы запуска, технические id инструментов, агрегатор сравнения или файлы результатов. Напиши обычную пользовательскую сводку сравнения.`;

const TEXT_TEMPLATE_EN = (
  tools: string,
  state?: Pick<CurrentScanState, "input">,
): string => {
  const run = articleTextRunLabel(state);
  return (
  `/toraseobridge article-text

The ToraSEO Desktop App is running and waiting for ${run.labelEn}.

Do not ask the user to paste the article here. Use ToraSEO MCP tools; they read input.md from the temporary ToraSEO workspace.
Use these tools: ${tools}.
Base recommendations only on selected MCP tool evidence.
Use intent_seo_forecast for intent, hook, CTR, and CMS metadata suggestions when present.
Use safety_science_review warnings for unsafe, legal-sensitive, scientific, or calculation-heavy content. Note that AI can be wrong and does not replace expert review.
Do not claim live SERP/social demand unless an external data source explicitly provides it.
Do not rewrite, rank, or add editorial claims outside that evidence.
If the user later asks to rewrite or improve the analyzed article, call article_rewrite_context instead of reading input.md directly or asking the user to paste the article again.
Write the rewritten article directly in chat as a separate copyable article block; the user will copy it into ToraSEO and run a new scan.
Keep rewrite choices aligned with the active workflow instructions, selected tools, platform/style/audience fit, SEO intent, media-marker policy, and risk warnings.
${run.isSolution ? "\nThis run was started from Suggest solution. First run all selected MCP tools, then propose a concrete solution in chat based on their results. If the input is only a topic or too thin for a full article, do not pretend otherwise: give a brief plan, missing-context questions, and the next best draft direction instead of claiming a finished analysis.\n" : ""}

Results will be displayed in the ToraSEO Desktop App.
After all tools complete, provide recommendations in chat based on the MCP results.`
  );
};

const TEXT_TEMPLATE_RU = (
  tools: string,
  state?: Pick<CurrentScanState, "input">,
): string => {
  const run = articleTextRunLabel(state);
  return `/toraseobridge article-text

Приложение ToraSEO Desktop App запущено и ожидает: ${run.labelRu}.

Не проси пользователя вставлять статью в чат. Используй инструменты ToraSEO MCP; они читают input.md из временной рабочей папки ToraSEO.
Используй инструменты: ${tools}.
${run.isSolution ? "\nЭтот запуск сделан через кнопку «Предложить решение». Сначала выполни все выбранные MCP-инструменты, затем предложи конкретное решение в чате на основе их результатов. Если в input.md только тема или слишком мало контекста для готовой статьи, честно скажи, чего не хватает, и дай краткий план/направление черновика вместо имитации полноценного анализа.\n" : ""}

Результаты будут отображены в приложении ToraSEO Desktop App.
После завершения всех инструментов дай рекомендации в чате на основе результатов MCP.`;
};

const CODEX_TEXT_TEMPLATE_EN = (
  state?: Pick<CurrentScanState, "input">,
): string => {
  const run = articleTextRunLabel(state);
  return `Use $toraseo-codex-workflow.

/toraseo codex-bridge-mode article-text

ToraSEO is waiting for ${run.labelEn}.
${run.isSolution ? "This was started from Suggest solution: after the handshake and all selected MCP tools complete, propose the solution or draft direction directly in chat using the tool evidence. If the input is only a topic or too thin, ask the minimum necessary clarifying question or give a bounded outline instead of pretending there is a full article." : "After the handshake and all selected MCP tools complete, summarize recommendations in chat using the tool evidence."}
Use SKILL + MCP for the details.`;
};

const CODEX_TEXT_TEMPLATE_RU = (
  state?: Pick<CurrentScanState, "input">,
): string => {
  const run = articleTextRunLabel(state);
  return `Используй $toraseo-codex-workflow.

/toraseo codex-bridge-mode article-text

ToraSEO ожидает: ${run.labelRu}.
${run.isSolution ? "Запуск сделан кнопкой «Предложить решение»: после handshake и завершения всех выбранных MCP-инструментов предложи решение или направление черновика прямо в чате, опираясь на результаты инструментов. Если в input.md только тема или контекста мало, задай минимальный уточняющий вопрос или дай ограниченный план, не имитируя полноценную готовую статью." : "После handshake и завершения всех выбранных MCP-инструментов дай рекомендации в чате на основе результатов инструментов."}
Детали возьми из SKILL + MCP.`;
};

const CODEX_SETUP_TEMPLATE_EN = (): string =>
  `Use $toraseo-codex-workflow.

/toraseo codex-bridge-mode setup-check

Check access to ToraSEO MCP and Codex Workflow Instructions.
Use SKILL + MCP for the details.`;

const CODEX_SETUP_TEMPLATE_RU = (): string =>
  `Используй $toraseo-codex-workflow.

/toraseo codex-bridge-mode setup-check

Проверь, есть ли у Codex доступ к ToraSEO MCP и Codex Workflow Instructions.
Детали возьми из SKILL + MCP.`;

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
  toolIds: string[],
  locale: SupportedLocale,
  bridgeClient: BridgeClient = "claude",
  state?: Pick<CurrentScanState, "analysisType" | "input">,
): string {
  // Comma-separated tool names — Claude reads this as a list.
  const toolsList = toolIds.join(", ");
  if (state?.analysisType === "article_text") {
    if (bridgeClient === "codex") {
      return locale === "ru"
        ? CODEX_TEXT_TEMPLATE_RU(state)
        : CODEX_TEXT_TEMPLATE_EN(state);
    }
    return locale === "ru"
      ? `${TEXT_TEMPLATE_RU(toolsList, state)}\n${TEXT_EVIDENCE_BOUNDARY}`
      : TEXT_TEMPLATE_EN(toolsList, state);
  }
  if (state?.analysisType === "article_compare") {
    if (bridgeClient === "codex") {
      return locale === "ru"
        ? CODEX_COMPARE_TEMPLATE_RU(state)
        : CODEX_COMPARE_TEMPLATE_EN(state);
    }
    return locale === "ru"
      ? COMPARE_TEMPLATE_RU(toolsList, state)
      : COMPARE_TEMPLATE_EN(toolsList, state);
  }
  const template =
    bridgeClient === "codex"
      ? locale === "ru"
        ? CODEX_TEMPLATE_RU
        : CODEX_TEMPLATE_EN
      : locale === "ru"
        ? TEMPLATE_RU
        : TEMPLATE_EN;
  return template(url, toolsList);
}

const CLAUDE_SETUP_TEMPLATE_EN = (): string =>
  `/toraseobridge setup-check

The ToraSEO Desktop App is already running in MCP + Instructions -> Claude Desktop mode.

This is a setup check, not a site scan.
First call verify_skill_loaded(token="bridge-v1-2026-04-27") from the ToraSEO MCP server.

If the tool returns app_running_no_scan, treat that as a successful setup check: it proves that Claude Desktop can see both the ToraSEO MCP server and the ToraSEO Claude Bridge Instructions. In that case, send this short confirmation:
1. ToraSEO MCP is connected and reachable from Claude Desktop.
2. The ToraSEO SKILL / Claude Bridge Instructions are active in this session.
3. SKILL and MCP are configured correctly.
4. You can safely choose an analysis in ToraSEO.`;

const CLAUDE_SETUP_TEMPLATE_RU = (): string =>
  `/toraseobridge setup-check

Приложение ToraSEO Desktop App уже запущено в режиме MCP + Instructions -> Claude Desktop.

Это проверка настройки, а не сканирование сайта.
Сначала вызови verify_skill_loaded(token="bridge-v1-2026-04-27") из ToraSEO MCP-сервера.

Если инструмент вернул app_running_no_scan, считай это успешной проверкой настройки: это доказывает, что Claude Desktop видит и ToraSEO MCP-сервер, и ToraSEO Claude Bridge Instructions. В таком случае отправь короткое подтверждение:
1. ToraSEO MCP подключен и доступен из Claude Desktop.
2. ToraSEO SKILL / Claude Bridge Instructions активны в этой сессии.
3. SKILL и MCP настроены корректно.
4. Можете спокойно выбирать анализ в ToraSEO.`;

export function buildBridgeSetupPrompt(
  locale: SupportedLocale,
  bridgeClient: BridgeClient,
): string {
  if (bridgeClient === "codex") {
    return locale === "ru"
      ? CODEX_SETUP_TEMPLATE_RU()
      : CODEX_SETUP_TEMPLATE_EN();
  }
  return locale === "ru"
    ? CLAUDE_SETUP_TEMPLATE_RU()
    : CLAUDE_SETUP_TEMPLATE_EN();
}

export function buildCodexSetupPrompt(locale: SupportedLocale): string {
  return buildBridgeSetupPrompt(locale, "codex");
}
