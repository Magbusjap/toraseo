import { ArrowLeft, BookOpen } from "lucide-react";

import { APP_VERSION, VERSION_REGISTRY } from "../../config/versions";
import type { SupportedLocale } from "../../types/ipc";

interface DocumentationViewProps {
  currentLocale: SupportedLocale;
  onReturnHome: () => void;
}

const COPY = {
  ru: {
    back: "На главную",
    sidebarTitle: "Документация",
    eyebrow: "ToraSEO",
    title: "Документация",
    lead:
      "Эта страница будет внутренним справочником ToraSEO. Пока здесь заглушка, чтобы раздел уже был доступен из приложения, а не только через GitHub.",
    statusTitle: "Что появится здесь позже",
    items: [
      "быстрый старт для MCP + Instructions и API + AI Chat;",
      "отдельные инструкции для Claude Desktop и Codex;",
      "описание типов анализа и ожидаемых результатов;",
      "правила работы с временными файлами, Skill / Instructions и MCP;",
      "ссылки на FAQ, историю обновлений и список инструментов аналитики.",
    ],
    noteTitle: "Текущий статус",
    note:
      "Публичная документация уже остается в репозитории, но приложение постепенно получит собственные страницы для пользователей, которым удобнее читать справку внутри ToraSEO.",
    fallbackNoteTitle: "Если MCP или приложение недоступны",
    fallbackNote:
      "Если Claude Bridge Instructions установлены, но MCP или активный запуск приложения недоступны, ToraSEO копирует отдельный fallback-промпт. В этом режиме Claude анализирует текст по SKILL прямо в чате, честно пишет, что приложение не будет обновлено, и не утверждает, что MCP-инструменты были выполнены.",
    commandsTitle: "Команды MCP + Instructions",
    commandsLead:
      "Для API + AI Chat команды не нужны: приложение открывает встроенный чат само. Команды ниже нужны только для Claude Desktop и Codex в режиме MCP + Instructions.",
    commandHeaders: ["Codex", "Claude Desktop", "Описание"],
    commands: [
      {
        codex: "/toraseo codex-bridge-mode setup-check",
        claude: "/toraseobridge setup-check",
        description:
          "Проверка работоспособности: ИИ должен подтвердить доступ к ToraSEO MCP, активные инструкции и то, что приложение ToraSEO запущено.",
      },
      {
        codex: "/toraseo codex-bridge-mode article-text",
        claude: "/toraseobridge article-text",
        description:
          "Анализ текста: текст уже лежит во временной папке ToraSEO, ИИ не должен просить вставлять его в чат и запускает выбранные MCP-инструменты.",
      },
      {
        codex: "/toraseo codex-bridge-mode article-compare",
        claude: "/toraseobridge article-compare",
        description:
          "Сравнение двух текстов: Text A и Text B уже лежат в ToraSEO, ИИ запускает выбранные проверки сравнения и оценивает только текстовые признаки.",
      },
      {
        codex: "/toraseo codex-bridge-mode page-by-url",
        claude: "/toraseobridge page-by-url",
        description:
          "Анализ страницы по URL: ToraSEO извлекает основной текст страницы, очищает шум страницы и запускает проверки текста статьи.",
      },
      {
        codex: "/toraseo codex-bridge-mode site-by-url",
        claude: "/toraseo bridge-mode site-by-url",
        description:
          "Анализ сайта по URL: один внутренний MCP-вызов запускает выбранные проверки сайта и отдаёт ИИ готовые факты для пользовательской сводки.",
      },
    ],
    versioningTitle: "Версионирование приложения и функций",
    versioningLead:
      "В интерфейсе показываем только версию приложения и версию конкретного анализа. Этого достаточно, чтобы понимать, какими правилами был сформирован отчёт, без перегруза техническими версиями.",
    versionKindsTitle: "Что показывается пользователю",
    versionKinds: [
      {
        title: "Версия приложения",
        description:
          "Общий релиз ToraSEO: интерфейс, Electron, окна, экспорт, документация и системные функции.",
      },
      {
        title: "Версия анализа",
        description:
          "Версия пользовательской логики конкретной функции: набор проверок, правила группировки, рекомендации и вид отчёта.",
      },
    ],
    versionHeaders: ["Функция", "Версия анализа"],
    appVersionLabel: "Версия приложения",
  },
  en: {
    back: "Back home",
    sidebarTitle: "Documentation",
    eyebrow: "ToraSEO",
    title: "Documentation",
    lead:
      "This page will become the internal ToraSEO documentation hub. For now it is a placeholder, so the section is already available inside the app instead of only through GitHub.",
    statusTitle: "Planned contents",
    items: [
      "quick start for MCP + Instructions and API + AI Chat;",
      "separate instructions for Claude Desktop and Codex;",
      "analysis type descriptions and expected outputs;",
      "temporary workspace, Skill / Instructions, and MCP rules;",
      "links to FAQ, changelog, and the analytics tools list.",
    ],
    noteTitle: "Current status",
    note:
      "Public documentation still lives in the repository, but the app will gradually get its own user-facing help pages for people who prefer reading inside ToraSEO.",
    fallbackNoteTitle: "When MCP or the app is unavailable",
    fallbackNote:
      "If Claude Bridge Instructions are installed but MCP or an active app scan is unavailable, ToraSEO copies a separate fallback prompt. In this mode Claude analyzes the text through the Skill directly in chat, clearly says the app will not be updated, and does not claim MCP tools ran.",
    commandsTitle: "MCP + Instructions commands",
    commandsLead:
      "API + AI Chat does not need commands: the app opens the built-in chat itself. The commands below are only for Claude Desktop and Codex in MCP + Instructions mode.",
    commandHeaders: ["Codex", "Claude Desktop", "Description"],
    commands: [
      {
        codex: "/toraseo codex-bridge-mode setup-check",
        claude: "/toraseobridge setup-check",
        description:
          "Setup check: AI should confirm access to ToraSEO MCP, active instructions, and the running ToraSEO app.",
      },
      {
        codex: "/toraseo codex-bridge-mode article-text",
        claude: "/toraseobridge article-text",
        description:
          "Article text analysis: the text is already in the temporary ToraSEO workspace, so AI should not ask for it again and should run selected MCP tools.",
      },
      {
        codex: "/toraseo codex-bridge-mode article-compare",
        claude: "/toraseobridge article-compare",
        description:
          "Two-text comparison: Text A and Text B are already in ToraSEO, so AI runs the selected comparison checks and compares text evidence only.",
      },
      {
        codex: "/toraseo codex-bridge-mode page-by-url",
        claude: "/toraseobridge page-by-url",
        description:
          "Page by URL analysis: ToraSEO extracts the main page article, removes page noise, and runs article-text checks.",
      },
      {
        codex: "/toraseo codex-bridge-mode site-by-url",
        claude: "/toraseo bridge-mode site-by-url",
        description:
          "Site by URL analysis: one internal MCP call runs selected site checks and returns facts for the user-facing summary.",
      },
    ],
    versioningTitle: "Application and feature versioning",
    versioningLead:
      "The interface shows only the app version and the current analysis version. This is enough to identify which user-facing rules produced the report without exposing internal schema, prompt, or score formula versions.",
    versionKindsTitle: "What users see",
    versionKinds: [
      {
        title: "App version",
        description:
          "The ToraSEO release: UI, Electron, windows, export, documentation, and system features.",
      },
      {
        title: "Analysis version",
        description:
          "The user-facing logic version for a specific feature: checks, grouping rules, recommendations, and report UX.",
      },
    ],
    versionHeaders: ["Feature", "Analysis version"],
    appVersionLabel: "App version",
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
        <article className="mx-auto w-full max-w-4xl rounded-lg border border-outline/10 bg-white px-8 py-7">
          <div className="flex items-start gap-4">
            <span className="rounded-lg bg-primary/10 p-3 text-primary">
              <BookOpen size={22} />
            </span>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-primary">
                {copy.eyebrow}
              </p>
              <h2 className="mt-2 font-display text-3xl font-semibold text-outline-900">
                {copy.title}
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-outline-900/65">
                {copy.lead}
              </p>
            </div>
          </div>

          <section className="mt-8 border-t border-outline/10 pt-7">
            <h3 className="font-display text-xl font-semibold text-outline-900">
              {copy.statusTitle}
            </h3>
            <ul className="mt-4 space-y-2 text-sm leading-relaxed text-outline-900/70">
              {copy.items.map((item) => (
                <li key={item} className="ml-5 list-disc">
                  {item}
                </li>
              ))}
            </ul>
          </section>

          <section className="mt-6 rounded-lg border border-outline/10 bg-orange-50/30 px-5 py-4">
            <h3 className="font-display text-base font-semibold text-outline-900">
              {copy.noteTitle}
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-outline-900/70">
              {copy.note}
            </p>
          </section>

          <section className="mt-4 rounded-lg border border-amber-200 bg-amber-50/50 px-5 py-4">
            <h3 className="font-display text-base font-semibold text-outline-900">
              {copy.fallbackNoteTitle}
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-outline-900/70">
              {copy.fallbackNote}
            </p>
          </section>

          <section className="mt-6 border-t border-outline/10 pt-7">
            <h3 className="font-display text-xl font-semibold text-outline-900">
              {copy.commandsTitle}
            </h3>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-outline-900/65">
              {copy.commandsLead}
            </p>
            <div className="mt-4 overflow-hidden rounded-lg border border-outline/10">
              <table className="w-full border-collapse text-left text-sm">
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
                  {copy.commands.map((command) => (
                    <tr key={command.codex} className="align-top">
                      <td className="w-[28%] px-4 py-3">
                        <code className="rounded bg-orange-50 px-2 py-1 text-xs text-outline-900">
                          {command.codex}
                        </code>
                      </td>
                      <td className="w-[28%] px-4 py-3">
                        <code className="rounded bg-orange-50 px-2 py-1 text-xs text-outline-900">
                          {command.claude}
                        </code>
                      </td>
                      <td className="px-4 py-3 leading-relaxed text-outline-900/70">
                        {command.description}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="mt-6 border-t border-outline/10 pt-7">
            <h3 className="font-display text-xl font-semibold text-outline-900">
              {copy.versioningTitle}
            </h3>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-outline-900/65">
              {copy.versioningLead}
            </p>
            <div className="mt-4 rounded-lg border border-outline/10 bg-white">
              <div className="border-b border-outline/10 px-4 py-3">
                <h4 className="text-sm font-semibold text-outline-900">
                  {copy.versionKindsTitle}
                </h4>
              </div>
              <div className="grid gap-0 divide-y divide-outline/10">
                {copy.versionKinds.map((item) => (
                  <div
                    key={item.title}
                    className="grid gap-2 px-4 py-3 text-sm md:grid-cols-[180px_1fr]"
                  >
                    <strong className="text-outline-900/80">
                      {item.title}
                    </strong>
                    <span className="leading-relaxed text-outline-900/65">
                      {item.description}
                    </span>
                  </div>
                ))}
              </div>
            </div>
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
