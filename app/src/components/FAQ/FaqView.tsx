import { ArrowLeft } from "lucide-react";
import { useTranslation } from "react-i18next";

interface FaqViewProps {
  onReturnHome: () => void;
}

type FaqItem = {
  question: string;
  answer: string[];
};

type FaqSectionCopy = {
  title: string;
  items: FaqItem[];
};

const COPY: Record<"en" | "ru", {
  back: string;
  title: string;
  lead: string;
  sections: FaqSectionCopy[];
}> = {
  en: {
    back: "Back home",
    title: "Frequently Asked Questions",
    lead:
      "Short answers about ToraSEO modes, analytics tools, AI providers, reports, and privacy.",
    sections: [
      {
        title: "Modes",
        items: [
          {
            question: "What is MCP + Instructions?",
            answer: [
              "This mode works through Claude Desktop or Codex. ToraSEO prepares the scan context, the external AI app calls the MCP tools, and the app receives structured results.",
              "Use it when you want the assistant to run ToraSEO tools explicitly and summarize the evidence in the external chat.",
            ],
          },
          {
            question: "What is API + AI Chat?",
            answer: [
              "This mode opens the built-in chat. ToraSEO collects local scan facts first, then sends those facts to the selected provider model for interpretation.",
              "Use it when you want the whole workflow inside ToraSEO without pasting bridge commands into another app.",
            ],
          },
        ],
      },
      {
        title: "Analytics Tools",
        items: [
          {
            question: "Why does the sidebar say Additional checks?",
            answer: [
              "Core checks run as part of the selected analysis package. The sidebar shows optional checks that can expand or narrow the report.",
            ],
          },
          {
            question: "Why does site comparison not show three full audits side by side?",
            answer: [
              "Site comparison answers who is stronger, why, where the gaps are, and what to fix first. The UI uses compact site cards, comparative metrics, direction heatmaps, winners, and actionable insights instead of three long reports.",
            ],
          },
        ],
      },
      {
        title: "AI Providers",
        items: [
          {
            question: "Which AI providers are supported?",
            answer: [
              "OpenRouter is the international model router. RouterAI is the Russian OpenAI-compatible router with ruble billing.",
              "Both are configured in Settings. You add a provider key, save one or more model IDs, then choose one model as the app default.",
            ],
          },
          {
            question: "Does RouterAI need special code in settings?",
            answer: [
              "No for the normal chat flow. RouterAI exposes an OpenAI-compatible API endpoint, so ToraSEO uses the same chat completion adapter with RouterAI's base URL.",
              "RouterAI plugins such as web search can be added later as provider options, but they should not require pasting a large function into the model ID field.",
            ],
          },
        ],
      },
      {
        title: "Reports",
        items: [
          {
            question: "Where is the analysis version?",
            answer: [
              "Reports show the app version separately from the analysis version. The analysis version identifies which user-facing rules produced the report.",
            ],
          },
          {
            question: "Can reports be exported?",
            answer: [
              "PDF export is available for reports. Site comparison uses landscape layout because a wide comparison dashboard reads better than a narrow vertical page.",
            ],
          },
        ],
      },
      {
        title: "Privacy",
        items: [
          {
            question: "What is sent to the internet?",
            answer: [
              "ToraSEO sends requests to the URLs you choose to analyze. In API + AI Chat, the selected provider also receives the scan facts and the prompt needed to form the report.",
              "Stored API keys are kept through the app's secure provider settings and are not shown back in plain text.",
            ],
          },
        ],
      },
    ],
  },
  ru: {
    back: "На главную",
    title: "Часто задаваемые вопросы",
    lead:
      "Короткие ответы про режимы ToraSEO, инструменты аналитики, ИИ-провайдеров, отчёты и приватность.",
    sections: [
      {
        title: "Режимы",
        items: [
          {
            question: "Что такое MCP + Instructions?",
            answer: [
              "Этот режим работает через Claude Desktop или Codex. ToraSEO готовит контекст анализа, внешнее ИИ-приложение вызывает MCP-инструменты, а приложение получает структурированные результаты.",
              "Используйте его, когда нужно явно запускать инструменты ToraSEO и получать итоговую сводку во внешнем чате.",
            ],
          },
          {
            question: "Что такое API + AI Chat?",
            answer: [
              "Этот режим открывает встроенный чат. ToraSEO сначала собирает локальные факты сканирования, затем отправляет их выбранной модели провайдера для интерпретации.",
              "Используйте его, когда нужен весь сценарий внутри ToraSEO без вставки bridge-команд во внешнее приложение.",
            ],
          },
        ],
      },
      {
        title: "Инструменты аналитики",
        items: [
          {
            question: "Почему в сайдбаре написано Дополнительные проверки?",
            answer: [
              "Базовые проверки входят в пакет выбранного анализа. В сайдбаре показываются дополнительные проверки, которыми можно расширить или сузить отчёт.",
            ],
          },
          {
            question: "Почему сравнение сайтов не показывает три полных аудита рядом?",
            answer: [
              "Сравнение сайтов отвечает на вопросы: кто сильнее, почему, где разрыв и что исправить первым. Поэтому интерфейс использует компактные карточки сайтов, сравнительные метрики, heatmap направлений, победителей и практические выводы.",
            ],
          },
        ],
      },
      {
        title: "ИИ-провайдеры",
        items: [
          {
            question: "Какие ИИ-провайдеры поддерживаются?",
            answer: [
              "OpenRouter — международный роутер моделей. RouterAI — российский OpenAI-compatible роутер с оплатой в рублях.",
              "Оба настраиваются в разделе настроек: добавьте ключ провайдера, сохраните нужные ID моделей и выберите одну модель по умолчанию для всего приложения.",
            ],
          },
          {
            question: "Для RouterAI нужно вставлять функцию в настройки?",
            answer: [
              "Для обычного чата и анализов не нужно. RouterAI даёт OpenAI-compatible API endpoint, поэтому ToraSEO использует тот же адаптер chat completions с базовым адресом RouterAI.",
              "Плагины RouterAI, например web search, лучше добавить позже как отдельные опции провайдера, а не как большой код в поле ID модели.",
            ],
          },
        ],
      },
      {
        title: "Отчёты",
        items: [
          {
            question: "Где указана версия анализа?",
            answer: [
              "В отчётах отдельно показываются версия приложения и версия анализа. Версия анализа показывает, по каким пользовательским правилам был собран отчёт.",
            ],
          },
          {
            question: "Можно ли экспортировать отчёт?",
            answer: [
              "PDF-экспорт доступен для отчётов. Для сравнения сайтов используется горизонтальная ориентация, потому что широкий сравнительный dashboard читается лучше узкого вертикального листа.",
            ],
          },
        ],
      },
      {
        title: "Приватность",
        items: [
          {
            question: "Что отправляется в интернет?",
            answer: [
              "ToraSEO отправляет запросы к тем URL, которые вы сами анализируете. В API + AI Chat выбранный провайдер также получает факты сканирования и промпт, нужный для отчёта.",
              "Сохранённые API-ключи хранятся через настройки провайдеров и не показываются обратно открытым текстом.",
            ],
          },
        ],
      },
    ],
  },
};

export default function FaqView({ onReturnHome }: FaqViewProps) {
  const { i18n } = useTranslation();
  const copy = i18n.language === "en" ? COPY.en : COPY.ru;

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
            FAQ
          </h1>
        </div>
      </aside>

      <main className="toraseo-sidebar-scrollbar min-w-0 flex-1 overflow-y-auto px-8 py-8">
        <article className="mx-auto w-full max-w-4xl rounded-lg border border-outline/10 bg-white px-8 py-7">
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">
            ToraSEO
          </p>
          <h2 className="mt-2 font-display text-3xl font-semibold text-outline-900">
            {copy.title}
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-outline-900/65">
            {copy.lead}
          </p>

          {copy.sections.map((section) => (
            <section key={section.title} className="mt-8 border-t border-outline/10 pt-7">
              <h3 className="font-display text-xl font-semibold text-outline-900">
                {section.title}
              </h3>
              <div className="mt-4 space-y-4">
                {section.items.map((item) => (
                  <section
                    key={item.question}
                    className="rounded-lg border border-outline/10 bg-orange-50/30 px-5 py-4"
                  >
                    <h4 className="font-display text-base font-semibold text-outline-900">
                      {item.question}
                    </h4>
                    <div className="mt-2 space-y-2 text-sm leading-relaxed text-outline-900/70">
                      {item.answer.map((paragraph) => (
                        <p key={paragraph}>{paragraph}</p>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            </section>
          ))}
        </article>
      </main>
    </div>
  );
}
