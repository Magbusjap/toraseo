<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/Magbusjap/toraseo/main/branding/logos/tora-logo-horizontal-dark.svg">
  <img src="https://raw.githubusercontent.com/Magbusjap/toraseo/main/branding/logos/tora-logo-horizontal.svg" alt="ToraSEO" width="480">
</picture>

**Open-source SEO toolkit built as a desktop app + MCP server + AI instructions**

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
[![Release: v0.1.0-alpha](https://img.shields.io/badge/Release-v0.1.0--alpha-FF6B35.svg)](https://github.com/Magbusjap/toraseo/releases)
[![Made with Claude](https://img.shields.io/badge/Made_with-Claude-D97757.svg)](https://claude.ai)
[![Made with Codex](https://img.shields.io/badge/Made_with-Codex-4D6BFE.svg)](https://openai.com/codex/)

</div>

**Язык:** [English](README.md) | Русский

---

ToraSEO - это open-source SEO workspace для структурированных аудитов сайтов. Он объединяет desktop app, MCP server и переиспользуемые AI instruction packages, чтобы аудит можно было запускать через `MCP + Instructions` или через `API + AI Chat`.

Проект специально разделен на независимые компоненты: app, MCP server и instruction packages можно использовать вместе или по отдельности, в зависимости от сценария.

> [!NOTE]
> **App 0.0.8 сейчас является активным release candidate.** App release теперь считается основной публичной release entry и должен включать сразу три группы assets: desktop installer assets, `Claude Bridge Instructions` ZIP и `Codex Workflow Instructions` ZIP.

> [!TIP]
> **ToraSEO поддерживает и Claude, и Codex workflows.** Для Claude используется `claude-bridge-instructions`, для Codex - `toraseo-codex-workflow`, а для встроенного сценария можно идти через `API + AI Chat` прямо внутри desktop app.

## Быстрая навигация

- [Что находится в этом репозитории](#что-находится-в-этом-репозитории)
- [Быстрый старт](#быстрый-старт)
- [Пути Claude и Codex](#пути-claude-и-codex)
- [Текущий статус релиза](#текущий-статус-релиза)
- [Что ToraSEO умеет уже сейчас](#что-toraseo-умеет-уже-сейчас)
- [Архитектура](#архитектура)
- [Стандарт release notes](#стандарт-release-notes)
- [Карта документации](#карта-документации)
- [Как помочь проекту](#как-помочь-проекту)
- [Лицензия](#лицензия)

## Что находится в этом репозитории

ToraSEO - это multi-surface repository. Несколько `README.md` здесь являются нормой, потому что часть директорий - это самостоятельные входные точки, а не просто внутренние папки.

| Surface | Назначение | Entry point |
|---|---|---|
| **Root repo** | Обзор продукта, статус релиза, карта документации | [`README.md`](README.md) |
| **Desktop app** | Native UI, bridge mode, native AI runtime | [`app/README.md`](app/README.md) |
| **MCP server** | Слой исполнения tools для scan и bridge data | [`mcp/README.md`](mcp/README.md) |
| **Claude Bridge Instructions** | Claude-side setup и workflow package | [`claude-bridge-instructions/README.md`](claude-bridge-instructions/README.md) |
| **Codex Workflow Instructions** | Codex-side setup и workflow package | [`toraseo-codex-workflow/README.md`](toraseo-codex-workflow/README.md) |
| **QA docs** | Manual checks и smoke-test support | [`qa/README.md`](qa/README.md) |

Это сделано специально: root README помогает выбрать путь, а component READMEs раскрывают детали для своей аудитории.

## Быстрый старт

Выбери путь в зависимости от того, как ты хочешь использовать ToraSEO.

### Путь A - пользователь desktop app

Подходит тем, кто хочет визуальный workspace, release assets и один из двух runtime paths:

- `MCP + Instructions` для Claude Desktop / Codex bridge-driven audits
- `API + AI Chat` для встроенного native chat flow

Начать можно так:

1. Скачай последний app release из [GitHub Releases](https://github.com/Magbusjap/toraseo/releases).
2. Установи desktop app.
3. Если нужен `MCP + Instructions`, дополнительно установи MCP server и нужный instructions ZIP package.
4. Если нужен `API + AI Chat`, настрой provider в Settings внутри app.

### Путь B - пользователь MCP

Подходит тем, кому нужны сами scan tools без desktop UI.

```bash
git clone https://github.com/Magbusjap/toraseo.git
cd toraseo/mcp
npm install
npm run build
```

После этого зарегистрируй server в своем MCP-compatible client:

```json
{
  "mcpServers": {
    "toraseo": {
      "command": "node",
      "args": ["/absolute/path/to/toraseo/mcp/dist/index.js"]
    }
  }
}
```

Полная настройка описана в [`mcp/README.md`](mcp/README.md).

### Путь C - пользователь bridge instructions

Подходит тем, кто хочет guided audit workflows внутри AI client.

- Для Claude используй [`claude-bridge-instructions/README.md`](claude-bridge-instructions/README.md)
- Для Codex используй [`toraseo-codex-workflow/README.md`](toraseo-codex-workflow/README.md)

ZIP assets скачиваются с общей [Releases page](https://github.com/Magbusjap/toraseo/releases). Не используй auto-generated source-code archives для установки.

## Пути Claude и Codex

ToraSEO рассматривает Claude и Codex как first-class workflow paths, а не как второстепенные дополнения.

| Path | Для чего лучше подходит | Entry point |
|---|---|---|
| **Claude Bridge Instructions** | Guided audits внутри Claude Desktop / Claude.ai / Claude Code | [`claude-bridge-instructions/README.md`](claude-bridge-instructions/README.md) |
| **Codex Workflow Instructions** | Repository-aware Codex workflows и bridge-mode доставка scan results в app | [`toraseo-codex-workflow/README.md`](toraseo-codex-workflow/README.md) |
| **API + AI Chat** | In-app interpretation flow без обязательной внешней chat-среды | [`app/README.md`](app/README.md) |

Если смотреть на ToraSEO как на продукт, это одно из ключевых различий: Claude и Codex могут оркестрировать scan через instructions, а desktop app также умеет запускать собственный provider-backed interpretation path.

## Текущий статус релиза

### Стабильная база

- **`0.0.7`** - это выпущенная dual-mode baseline для desktop app.

### Активный release candidate

- **`0.0.8`** сфокусирован на unified release packaging, Codex bridge result delivery и native chat polish.

### Unified release assets

Начиная с app `0.0.8`, одна GitHub release entry должна включать:

1. Desktop installer assets
2. `Claude Bridge Instructions` ZIP
3. `Codex Workflow Instructions` ZIP

Сами instruction packages при этом остаются самостоятельными компонентами в структуре репозитория и в build flows, но публичная дистрибуция группируется под app release.

## Что ToraSEO умеет уже сейчас

Текущий публичный feature set сосредоточен вокруг **Mode A - Site Audit**.

| Tool | Что он проверяет |
|---|---|
| `scan_site_minimal` | Reachability, title, h1, meta description, status, response timing |
| `check_robots_txt` | Crawl allowance, crawl-delay, robots availability |
| `analyze_meta` | Title, description, canonical, Open Graph, Twitter tags, viewport, lang |
| `analyze_headings` | Heading outline quality, skips, empty headings, h1 sanity |
| `analyze_sitemap` | Sitemap discovery, structure, fallback behavior, URL sampling |
| `check_redirects` | Redirect chains, loops, downgrade risks, terminal status |
| `analyze_content` | Main-text extraction, word count, link inventory, image alt coverage |

Результаты могут использоваться в двух product paths:

- **`MCP + Instructions`** - внешний AI client выполняет workflow, а app может получать bridge results
- **`API + AI Chat`** - app сам выполняет scan и интерпретирует его через настроенный provider

## Что сейчас специально вне scope

Это текущие границы продукта, а не скрытые bugs:

- Mode B content-audit и humanizer workflows
- Site-wide multi-page crawling orchestration
- Core Web Vitals / PageSpeed analysis
- Backlink research, keyword tracking и rank monitoring
- Paid third-party SEO data integrations как обязательная база продукта

Детали по релизам смотри в [CHANGELOG.md](CHANGELOG.md).

## Архитектура

ToraSEO спроектирован так, чтобы каждый слой оставался полезным сам по себе:

- **App** для status, progress, reports и native AI chat
- **MCP server** для scan execution и structured bridge data
- **Instruction packages** для Claude-side и Codex-side workflow orchestration

Три принципа лежат в основе:

1. **Loose coupling** - app, MCP и instruction packages должны быть composable, а не жестко слиты
2. **Structured outputs first** - UI и AI слои потребляют нормализованные findings, а не raw page dumps
3. **Security and trust boundaries matter** - provider secrets, bridge handshakes и approval flows должны оставаться явными

Более глубокое объяснение находится в [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Карта документации

- [App README](app/README.md) - настройка desktop app и runtime behavior
- [MCP README](mcp/README.md) - настройка server и детали tools
- [Claude Bridge Instructions README](claude-bridge-instructions/README.md) - установка и workflow для Claude
- [Codex Workflow Instructions README](toraseo-codex-workflow/README.md) - установка и workflow для Codex
- [Architecture overview](docs/ARCHITECTURE.md)
- [Release notes for App 0.0.8](docs/RELEASE_NOTES_0.0.8.md)
- [Release template](docs/RELEASE_TEMPLATE.md)
- [Release draft for App 0.0.8](docs/RELEASE_DRAFT_0.0.8.md)
- [Crawling policy](CRAWLING_POLICY.md)
- [Security policy](SECURITY.md)
- [Changelog](CHANGELOG.md)

## Стандарт release notes

Описание релизов ToraSEO должно использовать sectioned GitHub release format:

- короткий summary block вверху
- `Highlights`
- `Included assets`
- `Installation / upgrade notes`
- `What changed`
- `Verification`
- `Known limits`
- `Docs`

Опционально, но желательно для публичных релизов:

- logo или lightweight header image
- прямые ссылки на installer, docs и instruction packages
- компактный status callout, если это release candidate с особыми ожиданиями

Так релизы остаются читаемыми и инженерными, без превращения в marketing pages. Рабочий шаблон лежит в [`docs/RELEASE_TEMPLATE.md`](docs/RELEASE_TEMPLATE.md), а первый конкретный draft для будущего выпуска хранится в [`docs/RELEASE_DRAFT_0.0.8.md`](docs/RELEASE_DRAFT_0.0.8.md).

## Как помочь проекту

Самые быстрые и полезные способы помочь прямо сейчас:

- Поставить звезду репозиторию
- Открыть issue с product feedback, bugs или workflow friction
- Прогнать реальный аудит и поделиться тем, что сработало или сломалось
- Сообщать о security issues приватно по правилам из [`SECURITY.md`](SECURITY.md)

Формальный contribution guide можно расширить позже, но practical feedback и targeted fixes уже уместны.

## SVG workflow

SVG assets в этом репозитории можно править напрямую как код. Для repo-level SVG updates отдельный plugin не нужен, включая подготовку отдельных logo variants под GitHub light/dark surfaces.

Если позже понадобится более сложное редактирование иллюстраций в визуальном редакторе, это будет вопросом удобства, а не ограничением для сопровождения SVG в source control.

## Лицензия

Проект распространяется по [Apache License 2.0](LICENSE).

---

<div align="center">

**Built by [@Magbusjap](https://github.com/Magbusjap)** ·
[Report issue](https://github.com/Magbusjap/toraseo/issues) ·
[Security policy](SECURITY.md) ·
[Latest release](https://github.com/Magbusjap/toraseo/releases)

</div>
