import { ArrowLeft, History } from "lucide-react";

import type { SupportedLocale } from "../../types/ipc";

interface ChangelogViewProps {
  currentLocale: SupportedLocale;
  onReturnHome: () => void;
}

type ChangelogEntry = {
  version: string;
  date: string;
  status?: string;
  title: Record<SupportedLocale, string>;
  points: Record<SupportedLocale, string[]>;
};

const ENTRIES: ChangelogEntry[] = [
  {
    version: "App 0.0.9",
    date: "Unreleased",
    status: "active",
    title: {
      ru: "Подготовка расширения типов анализа",
      en: "Analysis-type expansion groundwork",
    },
    points: {
      ru: [
        "готовится единый релиз приложения с ZIP-пакетами Claude Bridge Instructions и Codex Workflow Instructions;",
        "добавлена основа для расширения типов анализа и карты инструментов 0.0.9;",
        "улучшается Codex bridge: подсказки, подтверждение MCP-доступа и сохранение результатов после очистки временного состояния;",
        "исправляется отображение bridge-результатов, чтобы факты из MCP попадали в видимый отчет.",
      ],
      en: [
        "prepares one app release with Claude Bridge Instructions and Codex Workflow Instructions ZIP assets;",
        "adds groundwork for analysis-type expansion and the 0.0.9 tool map;",
        "improves the Codex bridge path with helper prompts, MCP approval guidance, and result persistence;",
        "fixes bridge result rendering so MCP facts appear in the visible report.",
      ],
    },
  },
  {
    version: "App 0.0.8",
    date: "Released",
    title: {
      ru: "Фундамент единой публикации и надежности Codex bridge",
      en: "Unified release and Codex bridge reliability foundation",
    },
    points: {
      ru: [
        "релиз закрепил направление на единый список ассетов приложения;",
        "усилена надежность Codex bridge и полировка native chat;",
        "инструкционные пакеты больше не должны жить как отдельные публичные релизы по умолчанию.",
      ],
      en: [
        "established the direction toward one unified app asset list;",
        "hardened Codex bridge reliability and native chat polish;",
        "instruction packages should no longer create separate public releases by default.",
      ],
    },
  },
  {
    version: "App 0.0.7",
    date: "2026-04-30",
    title: {
      ru: "Два режима выполнения",
      en: "Dual execution modes",
    },
    points: {
      ru: [
        "появились режимы MCP + Instructions и API + AI Chat;",
        "добавлены отдельные setup-пути для Claude Desktop, Codex и native-провайдера;",
        "OpenRouter получил реальный adapter, хранение ключа и профили моделей;",
        "добавлены отдельные окна чата и деталей отчета, а также экспорт отчетов.",
      ],
      en: [
        "introduced MCP + Instructions and API + AI Chat modes;",
        "added separate setup paths for Claude Desktop, Codex, and native providers;",
        "OpenRouter gained a real adapter, key storage, and model profiles;",
        "added separate chat/report windows and report export formats.",
      ],
    },
  },
  {
    version: "App 0.0.6",
    date: "Unreleased",
    title: {
      ru: "Локализация и настройки",
      en: "Localization and Settings",
    },
    points: {
      ru: [
        "добавлен i18next и переключение языка внутри приложения;",
        "появился экран настроек с защитой от потери несохраненных изменений;",
        "строки интерфейса вынесены в английский и русский JSON-бандлы.",
      ],
      en: [
        "added i18next and runtime language switching;",
        "introduced the Settings screen with unsaved-changes protection;",
        "moved UI strings into English and Russian JSON bundles.",
      ],
    },
  },
  {
    version: "App 0.0.5",
    date: "2026-04-27",
    title: {
      ru: "Верхний тулбар и обновления",
      en: "Top toolbar and updates",
    },
    points: {
      ru: [
        "добавлен верхний тулбар с About, обновлениями, документацией, FAQ, настройками и GitHub;",
        "release notes в карточке обновлений очищаются от HTML-разметки;",
        "установка обновления из приложения стала тихой, без лишнего окна NSIS.",
      ],
      en: [
        "added the top toolbar with About, updates, documentation, FAQ, settings, and GitHub;",
        "release notes in the update card are stripped from raw HTML;",
        "in-app update installation became silent without an extra NSIS window.",
      ],
    },
  },
  {
    version: "App 0.0.4",
    date: "2026-04-27",
    title: {
      ru: "Ручной fallback и иконка приложения",
      en: "Manual fallback and app icon",
    },
    points: {
      ru: [
        "добавлен ручной выбор MCP config для нестандартных установок Claude Desktop;",
        "вернулась гибридная проверка Skill / Instructions;",
        "исправлены иконки окна, панели задач и установщика.",
      ],
      en: [
        "added manual MCP config selection for non-standard Claude Desktop installs;",
        "restored hybrid Skill / Instructions detection;",
        "fixed window, taskbar, and installer icons.",
      ],
    },
  },
  {
    version: "App 0.0.3",
    date: "2026-04-26",
    title: {
      ru: "Detector зависимостей и onboarding",
      en: "Dependency detector and onboarding",
    },
    points: {
      ru: [
        "приложение начало проверять Claude Desktop и регистрацию ToraSEO MCP;",
        "добавлен экран onboarding, который блокирует сканирование до готовности компонентов;",
        "появился launcher для запуска Claude Desktop из приложения.",
      ],
      en: [
        "started checking Claude Desktop and ToraSEO MCP registration;",
        "added onboarding that blocks scanning until required components are ready;",
        "introduced a launcher for opening Claude Desktop from the app.",
      ],
    },
  },
  {
    version: "App 0.0.2",
    date: "2026-04-26",
    title: {
      ru: "Автообновления",
      en: "Auto-update infrastructure",
    },
    points: {
      ru: [
        "добавлен electron-updater и карточка обновления в правом нижнем углу;",
        "обновления скачиваются и устанавливаются только после явного действия пользователя;",
        "GitHub Actions начал собирать Windows-релизы приложения.",
      ],
      en: [
        "added electron-updater and the bottom-right update card;",
        "updates download and install only after explicit user action;",
        "GitHub Actions started building Windows app releases.",
      ],
    },
  },
];

const COPY = {
  ru: {
    back: "На главную",
    sidebarTitle: "История обновлений",
    eyebrow: "CHANGELOG",
    title: "История обновлений",
    lead:
      "Краткая история изменений из CHANGELOG до версии 0.0.9. Пока это обзор внутри приложения; полный технический журнал остается в репозитории.",
    active: "активная",
  },
  en: {
    back: "Back home",
    sidebarTitle: "Changelog",
    eyebrow: "CHANGELOG",
    title: "Changelog",
    lead:
      "A compact in-app history based on CHANGELOG up to version 0.0.9. The full technical log still lives in the repository.",
    active: "active",
  },
} as const;

export default function ChangelogView({
  currentLocale,
  onReturnHome,
}: ChangelogViewProps) {
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
        <div className="flex flex-1 items-center justify-center text-center">
          <h1 className="font-display text-3xl font-semibold tracking-wide text-white">
            {copy.sidebarTitle}
          </h1>
        </div>
      </aside>

      <main className="toraseo-sidebar-scrollbar min-w-0 flex-1 overflow-y-auto px-8 py-8">
        <article className="mx-auto w-full max-w-4xl rounded-lg border border-outline/10 bg-white px-8 py-7">
          <div className="flex items-start gap-4">
            <span className="rounded-lg bg-primary/10 p-3 text-primary">
              <History size={22} />
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

          <div className="mt-8 space-y-4 border-t border-outline/10 pt-7">
            {ENTRIES.map((entry) => (
              <section
                key={entry.version}
                className="rounded-lg border border-outline/10 bg-orange-50/30 px-5 py-4"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-display text-lg font-semibold text-outline-900">
                    {entry.version}
                  </h3>
                  <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-outline-900/55">
                    {entry.date}
                  </span>
                  {entry.status === "active" && (
                    <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
                      {copy.active}
                    </span>
                  )}
                </div>
                <p className="mt-2 text-sm font-semibold text-outline-900/80">
                  {entry.title[currentLocale]}
                </p>
                <ul className="mt-3 space-y-2 text-sm leading-relaxed text-outline-900/70">
                  {entry.points[currentLocale].map((point) => (
                    <li key={point} className="ml-5 list-disc">
                      {point}
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </article>
      </main>
    </div>
  );
}
