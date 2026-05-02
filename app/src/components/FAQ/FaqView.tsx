import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";

interface FaqViewProps {
  onReturnHome: () => void;
}

export default function FaqView({ onReturnHome }: FaqViewProps) {
  return (
    <div className="flex h-full w-full min-w-0 flex-1 overflow-hidden bg-orange-50/30">
      <aside className="flex w-[300px] shrink-0 flex-col bg-surface px-5 py-6 text-white">
        <button
          type="button"
          onClick={onReturnHome}
          className="inline-flex items-center gap-2 self-start rounded-md border border-white/10 px-3 py-2 text-sm font-medium text-white/80 transition hover:border-primary/70 hover:text-white"
        >
          <ArrowLeft size={15} />
          На главную
        </button>
        <div className="flex flex-1 items-center justify-center">
          <h1 className="font-display text-3xl font-semibold tracking-wide text-white">
            FAQ
          </h1>
        </div>
      </aside>

      <main className="toraseo-sidebar-scrollbar min-w-0 flex-1 overflow-y-auto px-8 py-8">
        <article className="mx-auto w-full max-w-4xl rounded-lg border border-outline/10 bg-white px-8 py-7">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-primary">
              ToraSEO
            </p>
            <h2 className="mt-2 font-display text-3xl font-semibold text-outline-900">
              Часто задаваемые вопросы
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-outline-900/65">
              Основная справочная информация из документа FAQ. Если ответа
              на ваш вопрос здесь нет, можно открыть issue на GitHub.
            </p>
          </div>

          <FaqSection title="Что такое ToraSEO?">
            <p>
              ToraSEO — настольное приложение для SEO-аудита веб-страниц,
              работающее в паре с Claude Desktop и Codex. Приложение
              запускает объективные проверки: meta-теги, заголовки, sitemap,
              редиректы, robots.txt и контент. ИИ интерпретирует результаты и
              помогает собрать человеко-читаемый отчет.
            </p>
            <p>
              Смысл проекта — разделить факты и интерпретацию: инструменты
              собирают проверяемые данные, а ИИ объясняет, что с ними делать.
            </p>
          </FaqSection>

          <FaqSection title="Установка и запуск">
            <Question title="Что нужно установить, чтобы ToraSEO заработал?">
              <p>Для режима MCP + Instructions нужны три компонента:</p>
              <ol>
                <li>ToraSEO Desktop App из GitHub Releases.</li>
                <li>Claude Desktop или Codex, в зависимости от выбранного пути.</li>
                <li>
                  Инструкции для выбранного приложения: Claude Bridge
                  Instructions или Codex Workflow Instructions.
                </li>
              </ol>
              <p>
                После установки ToraSEO проверяет готовность компонентов и
                разблокирует запуск анализа.
              </p>
            </Question>

            <Question title="Почему Windows ругается на неизвестного издателя?">
              <p>
                Приложение пока не подписано сертификатом. Windows SmartScreen
                может показать предупреждение о неизвестном издателе. Это не
                означает, что приложение является вирусом: исходный код открыт
                на GitHub.
              </p>
              <p>
                Подписание планируется позже, когда продукт стабилизируется.
              </p>
            </Question>

            <Question title="Поддерживается ли macOS или Linux?">
              <p>
                Архитектурно да: Electron позволяет собирать приложение под
                разные платформы. Сейчас основной публикуемый сценарий — Windows.
                macOS и Linux можно добавить позже, когда появится устойчивый
                спрос и тестовая база.
              </p>
            </Question>
          </FaqSection>

          <FaqSection title="Зависимости и подключение">
            <Question title="Почему приложению нужен Claude Desktop или Codex?">
              <p>
                ToraSEO выполняет техническую часть анализа, а Claude Desktop
                или Codex помогают интерпретировать результаты. Без ИИ можно
                получить сырые данные, но не полноценное объяснение и план
                исправлений.
              </p>
            </Question>

            <Question title="Что такое MCP и зачем он нужен?">
              <p>
                MCP — это Model Context Protocol. Через него ToraSEO отдает ИИ
                доступ к инструментам анализа. Благодаря MCP модель не гадает,
                а вызывает конкретные проверки и получает структурированные
                результаты.
              </p>
            </Question>

            <Question title="Что такое Instructions или Skill?">
              <p>
                Это набор правил для ИИ: как запускать инструменты, как читать
                результаты, как формировать рекомендации и где не делать
                поспешных выводов. MCP дает инструменты, а инструкции задают
                правильное поведение.
              </p>
            </Question>

            <Question title="ToraSEO говорит, что приложение ИИ не запущено, хотя оно открыто">
              <p>Обычно причины такие:</p>
              <ul>
                <li>приложение запущено под другим пользователем;</li>
                <li>используется нестандартный путь установки;</li>
                <li>антивирус блокирует чтение списка процессов;</li>
                <li>приложение было закрыто принудительно и еще не обнаружено заново.</li>
              </ul>
              <p>
                Если автоматический поиск не сработал, можно указать путь
                вручную в настройках режима.
              </p>
            </Question>

            <Question title="ToraSEO говорит, что MCP не зарегистрирован">
              <p>Проверьте три вещи:</p>
              <ul>
                <li>конфиг действительно содержит запись ToraSEO MCP;</li>
                <li>Claude Desktop или Codex были перезапущены после изменения;</li>
                <li>файл конфигурации находится там, где ToraSEO его ищет.</li>
              </ul>
            </Question>
          </FaqSection>

          <FaqSection title="Сканирование и отчеты">
            <Question title="Какие проверки запускает ToraSEO?">
              <p>Для сайта по URL доступны базовые SEO-проверки:</p>
              <ul>
                <li>быстрое сканирование страницы;</li>
                <li>robots.txt;</li>
                <li>sitemap;</li>
                <li>meta-теги;</li>
                <li>структура заголовков;</li>
                <li>редиректы;</li>
                <li>контент страницы;</li>
                <li>публичный технологический стек.</li>
              </ul>
              <p>
                Для текста постепенно добавляются отдельные проверки: структура,
                стиль, тон, аудитория, медиа, уникальность, грамотность,
                естественность, логика и дополнительные проверки фактов.
              </p>
            </Question>

            <Question title="Можно отключить какие-то проверки?">
              <p>
                Да. В сайдбаре анализа часть инструментов отображается как
                чекбоксы. Их можно включать и отключать. Встроенные проверки
                работают по умолчанию и не всегда отображаются как отдельные
                галочки.
              </p>
            </Question>

            <Question title="Почему скан долго не завершается?">
              <p>
                ToraSEO уважает robots.txt и соблюдает задержки между запросами.
                Если сайт медленно отвечает или задает Crawl-delay, анализ может
                идти дольше обычного.
              </p>
            </Question>

            <Question title="Где сохраняются результаты?">
              <p>
                Текущие bridge-анализы используют временную рабочую папку с
                input.md и results/*.json. Эти файлы нужны, чтобы Claude Desktop
                или Codex могли надежно читать входные данные и возвращать
                результаты в приложение.
              </p>
            </Question>
          </FaqSection>

          <FaqSection title="Обновления">
            <Question title="Как обновить приложение?">
              <p>
                ToraSEO проверяет GitHub Releases при запуске и также позволяет
                запустить проверку вручную через кнопку «Проверить обновления» в
                тулбаре.
              </p>
            </Question>

            <Question title="Обновление установится без моего участия?">
              <p>
                Нет. Обновления требуют явного действия пользователя: сначала
                скачать, затем установить и перезапустить приложение.
              </p>
            </Question>
          </FaqSection>

          <FaqSection title="Приватность и безопасность">
            <Question title="Что приложение отправляет в интернет?">
              <p>
                Только запросы к сайтам, которые вы сами анализируете, и
                проверку обновлений на GitHub Releases. Телеметрия о ваших
                запусках, URL и ошибках не отправляется.
              </p>
            </Question>

            <Question title="ToraSEO использует мой API-ключ Claude?">
              <p>
                Нет. В режиме MCP + Instructions ToraSEO работает через
                установленное приложение Claude Desktop или Codex и не хранит
                API-ключи Claude.
              </p>
            </Question>

            <Question title="Соблюдает ли ToraSEO robots.txt?">
              <p>
                Да. ToraSEO использует robots.txt как границу для сканирования
                страниц и ресурсов сайта.
              </p>
            </Question>
          </FaqSection>

          <FaqSection title="Разработка и вклад">
            <Question title="Я нашел баг — куда писать?">
              <p>
                Откройте issue на GitHub и приложите версию приложения, шаги для
                воспроизведения, лог из папки ToraSEO и скриншот, если он
                помогает понять проблему.
              </p>
            </Question>

            <Question title="Какие технологии используются?">
              <ul>
                <li>App: Electron, React, TypeScript, Vite, Tailwind.</li>
                <li>MCP server: Node.js, TypeScript, @toraseo/core.</li>
                <li>Instructions: Markdown и локальные workflow-пакеты.</li>
              </ul>
            </Question>
          </FaqSection>
        </article>
      </main>
    </div>
  );
}

function FaqSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="mt-8 border-t border-outline/10 pt-7">
      <h3 className="font-display text-xl font-semibold text-outline-900">
        {title}
      </h3>
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}

function Question({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-lg border border-outline/10 bg-orange-50/30 px-5 py-4">
      <h4 className="font-display text-base font-semibold text-outline-900">
        {title}
      </h4>
      <div className="mt-2 space-y-2 text-sm leading-relaxed text-outline-900/70 [&_a]:text-primary [&_a]:underline [&_li]:ml-5 [&_ol]:list-decimal [&_ul]:list-disc">
        {children}
      </div>
    </section>
  );
}
