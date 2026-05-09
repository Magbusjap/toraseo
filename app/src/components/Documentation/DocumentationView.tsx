import { useState } from "react";
import type { ReactNode } from "react";
import { ArrowLeft, BookOpen, Cpu, MessageSquare, WifiOff } from "lucide-react";

import { APP_VERSION, VERSION_REGISTRY } from "../../config/versions";
import type { SupportedLocale } from "../../types/ipc";

interface DocumentationViewProps {
  currentLocale: SupportedLocale;
  onReturnHome: () => void;
}

type PageKey = "overview" | "mcp" | "api" | "skill";

type ModePageCopy = {
  title: string;
  lead: string;
  imageLabel: string;
  bulletsTitle: string;
  bullets: string[];
  stepsTitle: string;
  steps: string[];
};

const COPY = {
  en: {
    back: "Back home",
    sidebarTitle: "Documentation",
    title: "Documentation",
    lead:
      "A compact guide to ToraSEO modes, analytics tools, AI providers, bridge commands, and report versioning.",
    nav: [
      ["overview", "Overview"],
      ["mcp", "Mode: MCP + Instructions"],
      ["api", "Mode API + AI Chat"],
      ["skill", "Skill (without MCP and APP)"],
    ] as [PageKey, string][],
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
    inDevelopment: "In development",
    modePages: {
      mcp: {
        title: "Mode: MCP + Instructions",
        lead:
          "This mode connects ToraSEO with Codex or Claude Desktop through MCP tools and a dedicated instruction package.",
        imageLabel: "MCP workflow screenshot placeholder",
        bulletsTitle: "Best for",
        bullets: [
          "users who want the external AI app to call ToraSEO tools explicitly",
          "audits where the chat answer must be grounded in tool evidence",
          "Codex and Claude Desktop workflows that should also update the ToraSEO report",
        ],
        stepsTitle: "How it works",
        steps: [
          "Open ToraSEO and choose MCP + Instructions.",
          "Choose the analysis type and selected checks.",
          "Copy the generated command into Codex or Claude Desktop.",
          "The AI client performs the handshake, calls the selected MCP tools, and summarizes the evidence.",
        ],
      },
      api: {
        title: "Mode API + AI Chat",
        lead:
          "This mode keeps the whole workflow inside ToraSEO: scan facts are collected locally and interpreted by the selected provider model.",
        imageLabel: "API chat screenshot placeholder",
        bulletsTitle: "Best for",
        bullets: [
          "users who want one app window instead of an external AI chat",
          "provider-backed analysis through OpenRouter, RouterAI, or another configured OpenAI-compatible endpoint",
          "follow-up questions after the report is formed",
        ],
        stepsTitle: "How it works",
        steps: [
          "Open Settings and add an AI provider key.",
          "Save one or more model IDs and choose the app default model.",
          "Return home, choose API + AI Chat, and start an analysis.",
          "ToraSEO sends only the needed scan facts and asks the selected model to form the report.",
        ],
      },
      skill: {
        title: "Skill (without MCP and APP)",
        lead:
          "This fallback path is for moments when the instruction package is installed, but the desktop app, MCP server, or active scan is unavailable.",
        imageLabel: "Skill fallback screenshot placeholder",
        bulletsTitle: "Best for",
        bullets: [
          "quick chat-only recommendations when ToraSEO cannot receive report data",
          "fallback analysis from pasted text or visible evidence",
          "keeping token usage focused on the needed output instead of a full app report",
        ],
        stepsTitle: "How it works",
        steps: [
          "Use the chat-only fallback command for the needed analysis type.",
          "Paste only the evidence required for that fallback.",
          "The AI reads the fallback rules and answers in chat.",
          "The desktop report is not updated in this path.",
        ],
      },
    },
  },
  ru: {
    back: "На главную",
    sidebarTitle: "Документация",
    title: "Документация",
    lead:
      "Короткий справочник по режимам ToraSEO, инструментам аналитики, ИИ-провайдерам, bridge-командам и версиям отчетов.",
    nav: [
      ["overview", "Обзор"],
      ["mcp", "Режим: MCP + Instructions"],
      ["api", "Режим API + AI Chat"],
      ["skill", "Skill (без MCP и APP)"],
    ] as [PageKey, string][],
    sections: {
      quickStart: "Быстрый старт",
      commands: "Команды MCP + Instructions",
      fallbackCommands: "Команды Skill без активного MCP/APP",
      providers: "ИИ-провайдеры",
      versions: "Версии",
    },
    quickStart: [
      "Выберите тип анализа на главном экране.",
      "Выберите MCP + Instructions для Claude Desktop или Codex, либо API + AI Chat для встроенного чата.",
      "В API + AI Chat выберите настроенную модель провайдера. В MCP + Instructions вставьте созданную команду во внешнее ИИ-приложение.",
      "Читайте отчет по принципу: сначала факты, затем интерпретация.",
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
      "Используйте эти команды только если Skill установлен, но ToraSEO Desktop App, MCP-сервер или активный запуск недоступны. ИИ читает только fallback-справку и отвечает в чате; отчет в приложении не обновляется.",
    fallbackHeaders: ["Анализ", "Команда", "Граница"],
    fallbackCommands: [
      ["Текст статьи", "/toraseo chat-only-fallback article-text", "Только вставленный текст статьи."],
      ["Два текста", "/toraseo chat-only-fallback article-compare", "Только вставленные тексты A и B."],
      ["Страница по URL", "/toraseo chat-only-fallback page-by-url", "Нужен текст страницы или видимый фрагмент; URL-only требует browsing."],
      ["Сайт по URL", "/toraseo chat-only-fallback site-by-url", "Нужны доступные публичные факты; URL-only требует browsing."],
      ["Сравнение сайтов", "/toraseo chat-only-fallback site-compare", "Сравнение доступных фактов без трех полных аудитов рядом."],
    ],
    providersLead:
      "OpenRouter обозначен как международный роутер моделей. RouterAI обозначен как российский OpenAI-compatible роутер. Для обоих используются ключ провайдера и сохраненные ID моделей; одну модель можно сделать общей моделью по умолчанию для приложения.",
    routerAiNote:
      "RouterAI использует OpenAI-compatible endpoint https://routerai.ru/api/v1. Дополнительные плагины RouterAI лучше позже оформить как опции провайдера, а не вставлять большим кодом в поле ID модели.",
    versionsLead:
      "Интерфейс показывает версию приложения ToraSEO и версию анализа. Версия анализа помогает понять, какие пользовательские правила сформировали отчет, без показа внутренних schema или prompt versions.",
    appVersionLabel: "Версия приложения",
    versionHeaders: ["Функция", "Версия анализа"],
    inDevelopment: "В разработке",
    modePages: {
      mcp: {
        title: "Режим: MCP + Instructions",
        lead:
          "Этот режим связывает ToraSEO с Codex или Claude Desktop через MCP-инструменты и отдельный пакет инструкций.",
        imageLabel: "Заглушка скриншота MCP workflow",
        bulletsTitle: "Лучше всего подходит для",
        bullets: [
          "пользователей, которым важно, чтобы внешнее ИИ-приложение явно вызывало инструменты ToraSEO",
          "аудитов, где ответ в чате должен опираться на tool evidence",
          "workflow Codex и Claude Desktop, которые также должны обновлять отчет ToraSEO",
        ],
        stepsTitle: "Как работает",
        steps: [
          "Откройте ToraSEO и выберите MCP + Instructions.",
          "Выберите тип анализа и нужные проверки.",
          "Скопируйте созданную команду в Codex или Claude Desktop.",
          "ИИ-клиент выполнит handshake, вызовет выбранные MCP-инструменты и кратко объяснит результат.",
        ],
      },
      api: {
        title: "Режим API + AI Chat",
        lead:
          "Этот режим оставляет весь workflow внутри ToraSEO: факты сканирования собираются локально и интерпретируются выбранной моделью провайдера.",
        imageLabel: "Заглушка скриншота API chat",
        bulletsTitle: "Лучше всего подходит для",
        bullets: [
          "пользователей, которым нужно одно окно приложения без внешнего AI-чата",
          "анализа через OpenRouter, RouterAI или другой настроенный OpenAI-compatible endpoint",
          "дополнительных вопросов после формирования отчета",
        ],
        stepsTitle: "Как работает",
        steps: [
          "Откройте настройки и добавьте ключ ИИ-провайдера.",
          "Сохраните один или несколько ID моделей и выберите модель приложения по умолчанию.",
          "Вернитесь на главную, выберите API + AI Chat и запустите анализ.",
          "ToraSEO отправит только нужные факты сканирования и попросит выбранную модель сформировать отчет.",
        ],
      },
      skill: {
        title: "Skill (без MCP и APP)",
        lead:
          "Это fallback-путь для ситуаций, когда пакет инструкций установлен, но desktop app, MCP-сервер или активный запуск недоступны.",
        imageLabel: "Заглушка скриншота Skill fallback",
        bulletsTitle: "Лучше всего подходит для",
        bullets: [
          "быстрых рекомендаций в чате, когда ToraSEO не может принять данные отчета",
          "fallback-анализа по вставленному тексту или видимым фактам",
          "экономии токенов: ИИ использует только нужные правила и вывод, а не полный app report",
        ],
        stepsTitle: "Как работает",
        steps: [
          "Используйте chat-only fallback команду для нужного типа анализа.",
          "Вставьте только те факты, которые нужны для fallback.",
          "ИИ читает fallback-правила и отвечает в чате.",
          "Отчет в desktop-приложении в этом режиме не обновляется.",
        ],
      },
    },
  },
} as const;

function Placeholder({ label, text }: { label: string; text: string }) {
  return (
    <div className="mt-5 flex min-h-[220px] items-center justify-center rounded-lg border border-dashed border-primary/30 bg-orange-50/45 px-6 text-center">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-primary/70">
          {label}
        </p>
        <p className="mt-3 font-display text-3xl font-semibold text-outline-900/70">
          {text}
        </p>
      </div>
    </div>
  );
}

function ModePage({
  copy,
  page,
  icon,
}: {
  copy: (typeof COPY)["en"] | (typeof COPY)["ru"];
  page: ModePageCopy;
  icon: ReactNode;
}) {
  return (
    <article className="mx-auto w-full max-w-5xl rounded-lg border border-outline/10 bg-white px-8 py-7">
      <div className="flex items-start gap-4">
        <span className="rounded-lg bg-primary/10 p-3 text-primary">{icon}</span>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">
            ToraSEO
          </p>
          <h2 className="mt-2 font-display text-3xl font-semibold text-outline-900">
            {page.title}
          </h2>
          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-outline-900/65">
            {page.lead}
          </p>
        </div>
      </div>

      <Placeholder label={page.imageLabel} text={copy.inDevelopment} />

      <section className="mt-7 grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border border-outline/10 bg-orange-50/30 px-5 py-4">
          <h3 className="font-display text-lg font-semibold text-outline-900">
            {page.bulletsTitle}
          </h3>
          <ul className="mt-3 space-y-2 text-sm leading-relaxed text-outline-900/70">
            {page.bullets.map((item) => (
              <li key={item} className="ml-4 list-disc">
                {item}
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-lg border border-outline/10 bg-white px-5 py-4">
          <h3 className="font-display text-lg font-semibold text-outline-900">
            {page.stepsTitle}
          </h3>
          <ol className="mt-3 space-y-2 text-sm leading-relaxed text-outline-900/70">
            {page.steps.map((item) => (
              <li key={item} className="ml-4 list-decimal">
                {item}
              </li>
            ))}
          </ol>
        </div>
      </section>
    </article>
  );
}

export default function DocumentationView({
  currentLocale,
  onReturnHome,
}: DocumentationViewProps) {
  const copy = COPY[currentLocale] ?? COPY.en;
  const [page, setPage] = useState<PageKey>("overview");

  const modeIcon =
    page === "mcp" ? <Cpu size={22} /> : page === "api" ? <MessageSquare size={22} /> : <WifiOff size={22} />;

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
        <div className="mt-8">
          <p className="text-xs font-semibold uppercase tracking-wider text-white/45">
            ToraSEO
          </p>
          <h1 className="mt-2 font-display text-3xl font-semibold tracking-wide text-white">
            {copy.sidebarTitle}
          </h1>
        </div>
        <nav className="mt-8 space-y-2">
          {copy.nav.map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setPage(key)}
              className={`w-full rounded-md border px-3 py-2 text-left text-sm transition ${
                page === key
                  ? "border-primary bg-primary/15 text-white"
                  : "border-white/10 text-white/70 hover:border-primary/60 hover:text-white"
              }`}
            >
              {label}
            </button>
          ))}
        </nav>
      </aside>

      <main className="toraseo-sidebar-scrollbar min-w-0 flex-1 overflow-y-auto px-8 py-8">
        {page === "overview" ? (
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
        ) : (
          <ModePage copy={copy} page={copy.modePages[page]} icon={modeIcon} />
        )}
      </main>
    </div>
  );
}
