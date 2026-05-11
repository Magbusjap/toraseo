export const bridgePromptCopy = {
  en: {
    codexPrefix: "Use ToraSEO Codex Workflow.",
    suffix: "Use SKILL + MCP for the details.",
    runSelectedTools: "After handshake, run selectedTools.",
    goalLabel: "Goal",
    standardCompareGoal: "standard comparison report",
    waiting: {
      articleText: "ToraSEO is waiting for {{kind}}.",
      articleCompare: "ToraSEO is waiting for two-text comparison.",
      pageByUrl: "ToraSEO is waiting for page analysis by URL.",
      siteByUrl: "ToraSEO is waiting for site by URL analysis.",
      siteCompare: "ToraSEO is waiting for site comparison by URL.",
      setupCheck: "ToraSEO is waiting for setup check.",
    },
    articleKind: {
      analysis: "article text analysis",
      solution: "article solution / draft proposal",
    },
  },
  ru: {
    codexPrefix: "Используй ToraSEO Codex Workflow.",
    suffix: "Используй SKILL + MCP для деталей.",
    runSelectedTools: "После handshake запусти selectedTools.",
    goalLabel: "Цель",
    standardCompareGoal: "стандартный отчет сравнения",
    waiting: {
      articleText: "ToraSEO ожидает: {{kind}}.",
      articleCompare: "ToraSEO ожидает сравнение двух текстов.",
      pageByUrl: "ToraSEO ожидает анализ страницы по URL.",
      siteByUrl: "ToraSEO ожидает анализ сайта по URL.",
      siteCompare: "ToraSEO ожидает сравнение сайтов по URL.",
      setupCheck: "ToraSEO ожидает проверку настройки.",
    },
    articleKind: {
      analysis: "анализ текста статьи",
      solution: "предложение решения или черновика по статье",
    },
  },
} as const;
