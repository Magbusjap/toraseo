import { ArrowLeft, BookOpen } from "lucide-react";

import { APP_VERSION, VERSION_REGISTRY } from "../../config/versions";
import type { SupportedLocale } from "../../types/ipc";

interface DocumentationViewProps {
  currentLocale: SupportedLocale;
  onReturnHome: () => void;
}

const COPY = {
  en: {
    back: "Back home",
    sidebarTitle: "Documentation",
    title: "Documentation",
    lead:
      "A compact guide to ToraSEO modes, analytics tools, AI providers, bridge commands, and report versioning.",
    sections: {
      quickStart: "Quick Start",
      commands: "MCP + Instructions Commands",
      fallbackCommands: "SKILL Chat-Only Fallback Commands",
      providers: "AI Providers",
      versions: "Versions",
    },
    quickStart: [
      "Choose an analysis type on the home screen.",
      "Choose MCP + Instructions for Claude Desktop or Codex, or API + AI Chat for the built-in chat.",
      "In API + AI Chat, select a configured provider model. In MCP + Instructions, paste the generated command into the external AI app.",
      "Read the report as evidence first, interpretation second.",
    ],
    commandLead:
      "API + AI Chat does not need bridge commands. These commands are for Claude Desktop and Codex in MCP + Instructions mode.",
    commandHeaders: ["Analysis", "Codex", "Claude Desktop"],
    commands: [
      ["Setup check", "/toraseo codex-bridge-mode setup-check", "/toraseobridge setup-check"],
      ["Article text", "/toraseo codex-bridge-mode article-text", "/toraseobridge article-text"],
      ["Two texts", "/toraseo codex-bridge-mode article-compare", "/toraseobridge article-compare"],
      ["Page by URL", "/toraseo codex-bridge-mode page-by-url", "/toraseobridge page-by-url"],
      ["Site by URL", "/toraseo codex-bridge-mode site-by-url", "/toraseo bridge-mode site-by-url"],
      ["Site comparison", "/toraseo codex-bridge-mode site-compare", "/toraseobridge site-compare"],
    ],
    fallbackLead:
      "Use these only when the SKILL is installed but the live ToraSEO Desktop App, MCP server, or active scan is unavailable. The AI reads only the fallback reference and answers in chat; the app report is not updated.",
    fallbackHeaders: ["Analysis", "Command", "Boundary"],
    fallbackCommands: [
      ["Article text", "/toraseo chat-only-fallback article-text", "Uses pasted article text only."],
      ["Two texts", "/toraseo chat-only-fallback article-compare", "Uses pasted Text A and Text B only."],
      ["Page by URL", "/toraseo chat-only-fallback page-by-url", "Uses pasted page text or a visible extract; URL-only needs browsing."],
      ["Site by URL", "/toraseo chat-only-fallback site-by-url", "Uses available public evidence; URL-only needs browsing."],
      ["Site comparison", "/toraseo chat-only-fallback site-compare", "Compares available evidence without three full audits side by side."],
    ],
    providersLead:
      "OpenRouter is marked as an international model router. RouterAI is marked as a Russian OpenAI-compatible router. Both use provider keys plus saved model IDs; one model can be set as the app default across providers.",
    routerAiNote:
      "RouterAI uses the OpenAI-compatible endpoint https://routerai.ru/api/v1. Its optional plugins should be exposed as provider options later, not pasted into the model ID field.",
    versionsLead:
      "The app shows the ToraSEO app version and the analysis version. The analysis version identifies the user-facing report rules without exposing internal schema or prompt versions.",
    appVersionLabel: "App version",
    versionHeaders: ["Feature", "Analysis version"],
  },
  ru: {
    back: "На главную",
    sidebarTitle: "Документация",
    title: "Документация",
    lead:
      "Короткий справочник по режимам ToraSEO, инструментам аналитики, ИИ-провайдерам, bridge-командам и версиям отчётов.",
    sections: {
      quickStart: "Быстрый старт",
      commands: "Команды MCP + Instructions",
      fallbackCommands: "Команды SKILL без активного MCP/APP",
      providers: "ИИ-провайдеры",
      versions: "Версии",
    },
    quickStart: [
      "Выберите тип анализа на главном экране.",
      "Выберите MCP + Instructions для Claude Desktop или Codex, либо API + AI Chat для встроенного чата.",
      "В API + AI Chat выберите настроенную модель провайдера. В MCP + Instructions вставьте созданную команду во внешнее ИИ-приложение.",
      "Читайте отчёт по принципу: сначала факты, затем интерпретация.",
    ],
    commandLead:
      "Для API + AI Chat bridge-команды не нужны. Эти команды используются только для Claude Desktop и Codex в режиме MCP + Instructions.",
    commandHeaders: ["Анализ", "Codex", "Claude Desktop"],
    commands: [
      ["Проверка настройки", "/toraseo codex-bridge-mode setup-check", "/toraseobridge setup-check"],
      ["Текст статьи", "/toraseo codex-bridge-mode article-text", "/toraseobridge article-text"],
      ["Два текста", "/toraseo codex-bridge-mode article-compare", "/toraseobridge article-compare"],
      ["Страница по URL", "/toraseo codex-bridge-mode page-by-url", "/toraseobridge page-by-url"],
      ["Сайт по URL", "/toraseo codex-bridge-mode site-by-url", "/toraseo bridge-mode site-by-url"],
      ["Сравнение сайтов", "/toraseo codex-bridge-mode site-compare", "/toraseobridge site-compare"],
    ],
    fallbackLead:
      "Используйте эти команды только если SKILL установлен, но ToraSEO Desktop App, MCP-сервер или активный запуск недоступны. ИИ читает только fallback-справку и отвечает в чате; отчет в приложении не обновляется.",
    fallbackHeaders: ["Анализ", "Команда", "Граница"],
    fallbackCommands: [
      ["Текст статьи", "/toraseo chat-only-fallback article-text", "Только вставленный текст статьи."],
      ["Два текста", "/toraseo chat-only-fallback article-compare", "Только вставленные тексты A и B."],
      ["Страница по URL", "/toraseo chat-only-fallback page-by-url", "Нужен текст страницы или доступ к URL."],
      ["Сайт по URL", "/toraseo chat-only-fallback site-by-url", "Нужны доступные факты или доступ к URL."],
      ["Сравнение сайтов", "/toraseo chat-only-fallback site-compare", "Сравнение доступных фактов без трех полных аудитов рядом."],
    ],
    providersLead:
      "OpenRouter обозначен как международный роутер моделей. RouterAI обозначен как российский OpenAI-compatible роутер. Для обоих используется ключ провайдера и сохранённые ID моделей; одну модель можно сделать общей моделью по умолчанию для приложения.",
    routerAiNote:
      "RouterAI использует OpenAI-compatible endpoint https://routerai.ru/api/v1. Его дополнительные плагины лучше позже оформить как опции провайдера, а не вставлять большим кодом в поле ID модели.",
    versionsLead:
      "Интерфейс показывает версию приложения ToraSEO и версию анализа. Версия анализа помогает понять, какие пользовательские правила сформировали отчёт, без показа внутренних schema или prompt versions.",
    appVersionLabel: "Версия приложения",
    versionHeaders: ["Функция", "Версия анализа"],
  },
} as const;

export default function DocumentationView({
  currentLocale,
  onReturnHome,
}: DocumentationViewProps) {
  const copy = COPY[currentLocale] ?? COPY.en;

  return (
    <div className="flex h-full w-full min-w-0 flex-1 overflow-hidden bg-orange-50/30">
      <aside className="flex w-[300px] shrink-0 flex-col bg-surface px-5 py-6 text-white">
        <button
          type="button"
          onClick={onReturnHome}
          className="inline-flex items-center gap-2 self-start rounded-md border border-white/10 px-3 py-2 text-sm font-medium text-white/80 transition hover:border-primary/70 hover:text-white"
        >
          <ArrowLeft size={15} />
          {copy.back}
        </button>
        <div className="flex flex-1 items-center justify-center">
          <h1 className="font-display text-3xl font-semibold tracking-wide text-white">
            {copy.sidebarTitle}
          </h1>
        </div>
      </aside>

      <main className="toraseo-sidebar-scrollbar min-w-0 flex-1 overflow-y-auto px-8 py-8">
        <article className="mx-auto w-full max-w-5xl rounded-lg border border-outline/10 bg-white px-8 py-7">
          <div className="flex items-start gap-4">
            <span className="rounded-lg bg-primary/10 p-3 text-primary">
              <BookOpen size={22} />
            </span>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-primary">
                ToraSEO
              </p>
              <h2 className="mt-2 font-display text-3xl font-semibold text-outline-900">
                {copy.title}
              </h2>
              <p className="mt-3 max-w-3xl text-sm leading-relaxed text-outline-900/65">
                {copy.lead}
              </p>
            </div>
          </div>

          <section className="mt-8 border-t border-outline/10 pt-7">
            <h3 className="font-display text-xl font-semibold text-outline-900">
              {copy.sections.quickStart}
            </h3>
            <ol className="mt-4 space-y-2 text-sm leading-relaxed text-outline-900/70">
              {copy.quickStart.map((item) => (
                <li key={item} className="ml-5 list-decimal">
                  {item}
                </li>
              ))}
            </ol>
          </section>

          <section className="mt-7 border-t border-outline/10 pt-7">
            <h3 className="font-display text-xl font-semibold text-outline-900">
              {copy.sections.commands}
            </h3>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-outline-900/65">
              {copy.commandLead}
            </p>
            <div className="mt-4 overflow-x-auto rounded-lg border border-outline/10">
              <table className="w-full min-w-[760px] border-collapse text-left text-sm">
                <thead className="bg-orange-50/70 text-xs uppercase tracking-wider text-outline-900/50">
                  <tr>
                    {copy.commandHeaders.map((header) => (
                      <th key={header} className="px-4 py-3 font-semibold">
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline/10">
                  {copy.commands.map(([label, codex, claude]) => (
                    <tr key={codex} className="align-top">
                      <td className="px-4 py-3 font-semibold text-outline-900/80">
                        {label}
                      </td>
                      <td className="px-4 py-3">
                        <code className="rounded bg-orange-50 px-2 py-1 text-xs text-outline-900">
                          {codex}
                        </code>
                      </td>
                      <td className="px-4 py-3">
                        <code className="rounded bg-orange-50 px-2 py-1 text-xs text-outline-900">
                          {claude}
                        </code>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="mt-7 border-t border-outline/10 pt-7">
            <h3 className="font-display text-xl font-semibold text-outline-900">
              {copy.sections.fallbackCommands}
            </h3>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-outline-900/65">
              {copy.fallbackLead}
            </p>
            <div className="mt-4 overflow-x-auto rounded-lg border border-outline/10">
              <table className="w-full min-w-[760px] border-collapse text-left text-sm">
                <thead className="bg-orange-50/70 text-xs uppercase tracking-wider text-outline-900/50">
                  <tr>
                    {copy.fallbackHeaders.map((header) => (
                      <th key={header} className="px-4 py-3 font-semibold">
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline/10">
                  {copy.fallbackCommands.map(([label, command, boundary]) => (
                    <tr key={command} className="align-top">
                      <td className="px-4 py-3 font-semibold text-outline-900/80">
                        {label}
                      </td>
                      <td className="px-4 py-3">
                        <code className="rounded bg-orange-50 px-2 py-1 text-xs text-outline-900">
                          {command}
                        </code>
                      </td>
                      <td className="px-4 py-3 text-outline-900/65">
                        {boundary}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="mt-7 grid gap-4 border-t border-outline/10 pt-7 md:grid-cols-2">
            <div className="rounded-lg border border-outline/10 bg-orange-50/30 px-5 py-4">
              <h3 className="font-display text-lg font-semibold text-outline-900">
                {copy.sections.providers}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-outline-900/70">
                {copy.providersLead}
              </p>
            </div>
            <div className="rounded-lg border border-outline/10 bg-white px-5 py-4">
              <h3 className="font-display text-lg font-semibold text-outline-900">
                RouterAI
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-outline-900/70">
                {copy.routerAiNote}
              </p>
            </div>
          </section>

          <section className="mt-7 border-t border-outline/10 pt-7">
            <h3 className="font-display text-xl font-semibold text-outline-900">
              {copy.sections.versions}
            </h3>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-outline-900/65">
              {copy.versionsLead}
            </p>
            <div className="mt-4 rounded-lg border border-outline/10 bg-orange-50/35 px-4 py-3 text-sm">
              <span className="text-xs font-semibold uppercase tracking-wider text-outline-900/45">
                {copy.appVersionLabel}
              </span>
              <strong className="mt-1 block text-outline-900">
                ToraSEO {APP_VERSION}
              </strong>
            </div>
            <div className="mt-4 overflow-hidden rounded-lg border border-outline/10">
              <table className="w-full border-collapse text-left text-sm">
                <thead className="bg-orange-50/70 text-xs uppercase tracking-wider text-outline-900/50">
                  <tr>
                    {copy.versionHeaders.map((header) => (
                      <th key={header} className="px-4 py-3 font-semibold">
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline/10">
                  {VERSION_REGISTRY.map((row) => (
                    <tr key={row.id} className="align-top">
                      <td className="px-4 py-3 font-semibold text-outline-900/80">
                        {currentLocale === "ru" ? row.labelRu : row.labelEn}
                      </td>
                      <td className="px-4 py-3 text-outline-900/70">
                        {row.analysisVersion}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </article>
      </main>
    </div>
  );
}
