import { ArrowLeft, BookOpen } from "lucide-react";

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
        </article>
      </main>
    </div>
  );
}
