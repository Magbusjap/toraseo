# FAQ - ToraSEO

**Language:** English | [Russian](FAQ.ru.md)

Short answers about ToraSEO modes, analytics tools, AI providers, reports, exports, and privacy.

## Modes

### What is MCP + Instructions?

`MCP + Instructions` connects ToraSEO with Codex or Claude Desktop. ToraSEO prepares the analysis context, the external AI client calls selected MCP tools, and the app receives structured results.

Use this mode when you want tool evidence in the external chat and a structured report in ToraSEO.

### What is API + AI Chat?

`API + AI Chat` keeps the workflow inside ToraSEO. The app gathers scan facts, sends only the needed evidence to the selected provider model, and forms the report in the app.

Use this mode when you want to avoid bridge commands and continue with follow-up questions in the built-in chat.

### What is Skill without MCP and APP?

This is a chat-only fallback. It is useful when the instruction package is installed, but ToraSEO Desktop App, the MCP server, or an active scan is unavailable.

The AI answers in chat from pasted or visible evidence. The desktop report is not updated.

## Analytics Tools

### Why does the sidebar say Additional checks?

Core checks belong to the selected analysis package. The sidebar shows optional checks that can expand or narrow the report.

### Why does site comparison not show three full audits side by side?

Site comparison is a competitive dashboard, not three separate reports. It should answer:

- who is stronger
- why
- where the gaps are
- what to fix first

That is why ToraSEO uses compact site cards, comparative metrics, heatmaps, winners, and actionable insights.

## AI Providers

### Which AI providers are supported?

OpenRouter is marked as an international model router. RouterAI is marked as a Russian OpenAI-compatible router with ruble billing.

Both are configured in Settings. Add a provider key, save one or more model IDs, and choose one model as the app default.

### Does RouterAI need special code in settings?

No for normal chat and analysis. RouterAI exposes an OpenAI-compatible API endpoint, so ToraSEO can use the same chat completions adapter with the RouterAI base URL.

RouterAI plugins such as web search can be added later as provider options. They should not require pasting a large function into the model ID field.

## Reports And Exports

### Where is the analysis version?

Reports show the app version separately from the analysis version. The analysis version identifies which user-facing rules produced the report.

### Can reports be exported?

PDF export is available for reports. Site comparison should use landscape layout because a wide comparison dashboard reads better than a narrow vertical page.

A presentation export is also a strong future fit for competitive comparison reports.

## Privacy

### What is sent to the internet?

ToraSEO sends requests to the URLs you choose to analyze. In `API + AI Chat`, the selected provider also receives the scan facts and the prompt needed to form the report.

Stored API keys are kept through secure provider settings and are not shown back in plain text.

### Does ToraSEO respect robots.txt?

Yes. Crawling behavior is governed by [CRAWLING_POLICY.md](../CRAWLING_POLICY.md).

## Development

### Where should I report a bug?

Open a GitHub issue and include:

- app version
- steps to reproduce
- expected result
- actual result
- relevant logs or screenshots when possible

### Which parts are still in development?

`Design and content by URL` and `Image analysis` are currently marked as in development. Tora Rank is a future direction, not a finished public scoring system in this release.
