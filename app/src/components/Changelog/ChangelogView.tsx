import { ArrowLeft, History } from "lucide-react";

import { APP_VERSION, DEFAULT_ANALYSIS_VERSION } from "../../config/versions";
import type { SupportedLocale } from "../../types/ipc";

interface ChangelogViewProps {
  currentLocale: SupportedLocale;
  onReturnHome: () => void;
}

type ChangeGroup = {
  title: Record<SupportedLocale, string>;
  items: Record<SupportedLocale, string[]>;
};

type ChangelogEntry = {
  version: string;
  date: string;
  status?: "active";
  title: Record<SupportedLocale, string>;
  summary: Record<SupportedLocale, string>;
  groups: ChangeGroup[];
};

const ENTRIES: ChangelogEntry[] = [
  {
    version: "ToraSEO 0.0.9",
    date: "2026-05-09",
    status: "active",
    title: {
      ru: "Новые типы анализа, визуальные отчеты и документация",
      en: "Analysis expansion, visual reports, and documentation",
    },
    summary: {
      ru: "Версия 0.0.9 превращает ToraSEO из двухрежимного SEO-аудита в более широкое рабочее пространство: больше типов анализа, понятнее режимы, аккуратнее отчеты и сильнее документация.",
      en: "Version 0.0.9 turns ToraSEO from a dual-mode SEO audit tool into a broader workspace: more analysis types, clearer modes, stronger reports, and better documentation.",
    },
    groups: [
      {
        title: { ru: "Добавлено", en: "Added" },
        items: {
          ru: [
            "Добавлены новые направления анализа: Текст, Сравнение двух текстов, Страница по URL, Сайт по URL и Сравнение сайтов по URL.",
            "Добавлены карточки будущих анализов: Дизайн и контент по URL и Анализ изображения, пока со статусом «В разработке».",
            "Добавлен RouterAI как российский OpenAI-compatible провайдер рядом с OpenRouter.",
            "Добавлены модели провайдера, проверка модели и общая кнопка «Сделать по умолчанию» для модели приложения.",
            "Добавлена версия анализа в отчетах, отдельно от версии приложения.",
            "Добавлены визуальные report-блоки и infographic-экран для результатов анализа текста.",
            "Добавлены третьи окна/подробные представления для отчетов, чтобы основной экран не перегружался.",
            "Добавлена новая GitHub-документация: центр документации, FAQ на двух языках и обновленные README.",
          ],
          en: [
            "Added new analysis areas: Text, Compare two texts, Page by URL, Site by URL, and Site comparison by URL.",
            "Added future analysis cards for Design and content by URL and Image analysis, currently marked as In development.",
            "Added RouterAI as a Russian OpenAI-compatible provider alongside OpenRouter.",
            "Added provider models, model testing, and one app-wide Set default action.",
            "Added analysis version display in reports, separate from the app version.",
            "Added visual report blocks and an infographic result screen for text analysis.",
            "Added separate detailed report views so the main screen stays lighter.",
            "Added GitHub documentation hub, bilingual FAQ, and refreshed README files.",
          ],
        },
      },
      {
        title: { ru: "Расширено", en: "Expanded" },
        items: {
          ru: [
            "Расширены инструменты аналитики для Текста, Страницы по URL, Сайта по URL и Сравнения сайтов по URL.",
            "Сравнение сайтов по URL переработано как competitive comparison dashboard: summary, краткие site cards, метрики, heatmap, победители и actionable insights.",
            "Для Сайта по URL и Сравнения сайтов по URL сайдбар теперь использует смысл «Дополнительные проверки», а не общий термин «Проверки».",
            "Расширена логика API + AI Chat для анализа, ответа в чате и follow-up после отчета.",
            "Расширены Codex Workflow Instructions и Claude Bridge Instructions: MCP + Instructions, API path boundaries и Skill fallback.",
            "Расширена документация внутри приложения: отдельные страницы для MCP + Instructions, API + AI Chat и Skill без MCP и APP.",
            "Расширена система маскотов: ожидание, готовность к анализу, анализ в процессе, ошибка и успешный отчет.",
          ],
          en: [
            "Expanded analytics tools for Text, Page by URL, Site by URL, and Site comparison by URL.",
            "Reworked Site comparison by URL as a competitive comparison dashboard: summary, compact site cards, metrics, heatmap, winners, and actionable insights.",
            "Site by URL and Site comparison by URL now use Additional checks in the sidebar instead of a generic Checks label.",
            "Expanded API + AI Chat logic for analysis, chat response, and report follow-up.",
            "Expanded Codex Workflow Instructions and Claude Bridge Instructions for MCP + Instructions, API boundaries, and Skill fallback.",
            "Expanded in-app documentation with dedicated pages for MCP + Instructions, API + AI Chat, and Skill without MCP and APP.",
            "Expanded mascot states for waiting, ready, analyzing, error, and completed report states.",
          ],
        },
      },
      {
        title: { ru: "Исправлено", en: "Fixed" },
        items: {
          ru: [
            "Исправлена лицензия в окне «О ToraSEO»: теперь Apache-2.0 вместо MIT.",
            "Исправлено устаревшее описание «О ToraSEO», которое раньше сводило продукт только к Claude Desktop.",
            "Исправлена языковая логика для Claude Desktop и Codex: ответ должен следовать языку интерфейса/промпта, если пользователь сам не начал писать на другом языке.",
            "Исправлено отображение результатов bridge: MCP-факты попадают в видимый отчет, а результат не пропадает после очистки временного состояния.",
            "Исправлен сценарий возврата на главную и повторного открытия анализа, где прогресс мог показываться как завершенный без нового запуска.",
            "Исправлены устаревшие и битые русские строки в FAQ, документации и README.",
            "Исправлен порядок пунктов в верхнем тулбаре.",
          ],
          en: [
            "Fixed the About ToraSEO license: Apache-2.0 is now shown instead of MIT.",
            "Fixed outdated About ToraSEO copy that described the product only as a Claude Desktop companion.",
            "Fixed Claude Desktop and Codex language rules: responses should follow the interface/prompt language unless the user starts in another language.",
            "Fixed bridge result rendering so MCP facts appear in the visible report and completed results survive temporary state cleanup.",
            "Fixed return-home/reopen behavior where progress could appear completed without a fresh run.",
            "Fixed outdated and broken Russian text in FAQ, documentation, and README files.",
            "Fixed the top toolbar item order.",
            "Packaged releases now use a separate ToraSEO user-data profile so local development API-provider settings are not picked up by installed builds.",
          ],
        },
      },
      {
        title: { ru: "Документация и релиз", en: "Documentation and release" },
        items: {
          ru: [
            "README на английском и русском переписаны как визуальный elevator pitch с превью, режимами и маскотами.",
            "Добавлены preview-изображения для GitHub README с понятными именами файлов.",
            "Обновлены README для app, mcp, Claude Bridge Instructions и Codex Workflow Instructions.",
            "Обновлены ARCHITECTURE и FAQ под текущую структуру продукта.",
            "Подготовлена логика единого релиза: installer assets, Claude Bridge Instructions ZIP и Codex Workflow Instructions ZIP в одном релизе v0.0.9.",
          ],
          en: [
            "Rewrote English and Russian README files as a visual elevator pitch with previews, modes, and mascots.",
            "Added README preview images with stable descriptive filenames.",
            "Updated README files for app, mcp, Claude Bridge Instructions, and Codex Workflow Instructions.",
            "Updated ARCHITECTURE and FAQ for the current product structure.",
            "Prepared the unified release direction: installer assets, Claude Bridge Instructions ZIP, and Codex Workflow Instructions ZIP under one v0.0.9 release.",
          ],
        },
      },
    ],
  },
  {
    version: "ToraSEO 0.0.8",
    date: "2026-04-30",
    title: {
      ru: "Единая публикация и надежность Codex bridge",
      en: "Unified release and Codex bridge reliability",
    },
    summary: {
      ru: "Версия закрепила направление на единый релиз приложения с ZIP-пакетами инструкций и улучшила надежность Codex bridge.",
      en: "This version established the app-led release direction with instruction ZIP assets and hardened Codex bridge reliability.",
    },
    groups: [
      {
        title: { ru: "Главное", en: "Highlights" },
        items: {
          ru: [
            "Единый список assets для релиза приложения.",
            "Усилена надежность Codex bridge и полировка native chat.",
            "Instruction packages больше не должны жить как отдельные публичные релизы по умолчанию.",
          ],
          en: [
            "Unified app release asset list.",
            "Improved Codex bridge reliability and native chat polish.",
            "Instruction packages should no longer create separate public releases by default.",
          ],
        },
      },
    ],
  },
  {
    version: "ToraSEO 0.0.7",
    date: "2026-04-30",
    title: {
      ru: "Два режима выполнения",
      en: "Dual execution modes",
    },
    summary: {
      ru: "Версия добавила основу двух режимов: MCP + Instructions и API + AI Chat.",
      en: "This version introduced the dual-mode foundation: MCP + Instructions and API + AI Chat.",
    },
    groups: [
      {
        title: { ru: "Главное", en: "Highlights" },
        items: {
          ru: [
            "Появились режимы MCP + Instructions и API + AI Chat.",
            "Добавлены отдельные setup-пути для Claude Desktop, Codex и native-провайдера.",
            "OpenRouter получил реальный adapter, хранение ключа и профили моделей.",
            "Добавлены отдельные окна чата и деталей отчета, а также экспорт отчетов.",
          ],
          en: [
            "Introduced MCP + Instructions and API + AI Chat modes.",
            "Added separate setup paths for Claude Desktop, Codex, and native providers.",
            "OpenRouter gained a real adapter, key storage, and model profiles.",
            "Added separate chat/report windows and report export formats.",
          ],
        },
      },
    ],
  },
  {
    version: "ToraSEO 0.0.6",
    date: "Unreleased",
    title: {
      ru: "Локализация и настройки",
      en: "Localization and Settings",
    },
    summary: {
      ru: "Добавлена основа локализации и экран настроек.",
      en: "Added localization groundwork and the Settings screen.",
    },
    groups: [
      {
        title: { ru: "Главное", en: "Highlights" },
        items: {
          ru: [
            "Добавлен i18next и переключение языка внутри приложения.",
            "Появился экран настроек с защитой от потери несохраненных изменений.",
            "Строки интерфейса вынесены в английский и русский JSON-бандлы.",
          ],
          en: [
            "Added i18next and runtime language switching.",
            "Introduced the Settings screen with unsaved-changes protection.",
            "Moved UI strings into English and Russian JSON bundles.",
          ],
        },
      },
    ],
  },
  {
    version: "ToraSEO 0.0.5",
    date: "2026-04-27",
    title: {
      ru: "Верхний тулбар и обновления",
      en: "Top toolbar and updates",
    },
    summary: {
      ru: "Добавлен верхний тулбар и улучшен сценарий обновлений.",
      en: "Added the top toolbar and improved the update flow.",
    },
    groups: [
      {
        title: { ru: "Главное", en: "Highlights" },
        items: {
          ru: [
            "Добавлен верхний тулбар с About, обновлениями, документацией, FAQ, настройками и GitHub.",
            "Release notes в карточке обновлений очищаются от HTML-разметки.",
            "Установка обновления из приложения стала тихой, без лишнего окна NSIS.",
          ],
          en: [
            "Added the top toolbar with About, updates, documentation, FAQ, settings, and GitHub.",
            "Release notes in the update card are stripped from raw HTML.",
            "In-app update installation became silent without an extra NSIS window.",
          ],
        },
      },
    ],
  },
];

const COPY = {
  ru: {
    back: "На главную",
    sidebarTitle: "История обновлений",
    eyebrow: "CHANGELOG",
    title: "История обновлений",
    lead:
      "Краткая история изменений ToraSEO. Для 0.0.9 показаны основные изменения продукта, интерфейса, режимов анализа, документации и релизной подготовки.",
    active: "активная версия",
    versionMeta:
      "Версии функций: модули анализа {{version}}, схемы результата {{version}}, промпты {{version}}, формулы score — в разработке.",
  },
  en: {
    back: "Back home",
    sidebarTitle: "Changelog",
    eyebrow: "CHANGELOG",
    title: "Changelog",
    lead:
      "A compact ToraSEO change history. Version 0.0.9 highlights product, interface, analysis mode, documentation, and release preparation updates.",
    active: "active version",
    versionMeta:
      "Feature versions: analysis modules {{version}}, result schemas {{version}}, prompts {{version}}, score formulas in development.",
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
        <article className="mx-auto w-full max-w-5xl rounded-lg border border-outline/10 bg-white px-8 py-7">
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
              <p className="mt-3 max-w-3xl text-sm leading-relaxed text-outline-900/65">
                {copy.lead}
              </p>
            </div>
          </div>

          <div className="mt-8 space-y-5 border-t border-outline/10 pt-7">
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
                <p className="mt-1 max-w-3xl text-sm leading-relaxed text-outline-900/60">
                  {entry.summary[currentLocale]}
                </p>
                {entry.version === `ToraSEO ${APP_VERSION}` && (
                  <p className="mt-2 text-xs leading-relaxed text-outline-900/45">
                    {copy.versionMeta.replaceAll(
                      "{{version}}",
                      DEFAULT_ANALYSIS_VERSION,
                    )}
                  </p>
                )}

                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  {entry.groups.map((group) => (
                    <section
                      key={group.title.en}
                      className="rounded-md border border-outline/10 bg-white px-4 py-3"
                    >
                      <h4 className="font-display text-sm font-semibold text-outline-900">
                        {group.title[currentLocale]}
                      </h4>
                      <ul className="mt-2 space-y-2 text-sm leading-relaxed text-outline-900/70">
                        {group.items[currentLocale].map((point) => (
                          <li key={point} className="ml-4 list-disc">
                            {point}
                          </li>
                        ))}
                      </ul>
                    </section>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </article>
      </main>
    </div>
  );
}
