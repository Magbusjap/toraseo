import type {
  OrchestratorMessageInput,
  RuntimeWebEvidenceContext,
  RuntimeWebEvidenceItem,
} from "../../src/types/runtime.js";

const DIRECT_FETCH_LIMIT = 5;
const SEARCH_RESULT_LIMIT = 5;
const FETCH_TIMEOUT_MS = 8000;
const USER_AGENT =
  "ToraSEO/0.1.0 (+https://github.com/Magbusjap/toraseo; SEO audit evidence collector)";

function unique<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}

function textFromHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function matchFirst(html: string, pattern: RegExp): string | undefined {
  const match = html.match(pattern);
  return match?.[1]?.replace(/\s+/g, " ").trim();
}

function urlsFromText(text: string): string[] {
  return unique(
    Array.from(text.matchAll(/https?:\/\/[^\s<>"')\]]+/gi))
      .map((match) => match[0].replace(/[.,;:!?]+$/g, ""))
      .filter((url) => {
        try {
          const parsed = new URL(url);
          return parsed.protocol === "http:" || parsed.protocol === "https:";
        } catch {
          return false;
        }
      }),
  );
}

function topicLooksLikeUrl(value: string): string | null {
  const trimmed = value.trim();
  if (!/^https?:\/\//i.test(trimmed)) return null;
  try {
    return new URL(trimmed).toString();
  } catch {
    return null;
  }
}

function selectedToolsNeedWeb(input: OrchestratorMessageInput): boolean {
  const tools = [
    ...(input.articleTextContext?.selectedTools ?? []),
    ...(input.articleCompareContext?.selectedTools ?? []),
    ...(input.siteCompareContext?.selectedTools ?? []),
    ...(input.scanContext?.selectedTools ?? []),
  ];
  return tools.some((toolId) =>
    [
      "claim_source_queue",
      "fact_distortion_check",
      "ai_hallucination_check",
      "safety_science_review",
      "intent_seo_forecast",
      "page_url_article_internal",
      "site_url_internal",
      "site_compare_internal",
      "extract_main_text",
      "analyze_google_page_search",
      "analyze_yandex_page_search",
    ].includes(toolId),
  );
}

function directUrlsForInput(input: OrchestratorMessageInput): string[] {
  const urls: string[] = [];
  if (input.scanContext?.url) urls.push(input.scanContext.url);
  if (input.articleTextContext?.topic) {
    const topicUrl = topicLooksLikeUrl(input.articleTextContext.topic);
    if (topicUrl) urls.push(topicUrl);
  }
  if (input.articleTextContext?.body) {
    urls.push(...urlsFromText(input.articleTextContext.body));
  }
  if (input.articleCompareContext?.textA) {
    urls.push(...urlsFromText(input.articleCompareContext.textA));
  }
  if (input.articleCompareContext?.textB) {
    urls.push(...urlsFromText(input.articleCompareContext.textB));
  }
  if (input.siteCompareContext?.urls.length) {
    urls.push(...input.siteCompareContext.urls);
  }
  return unique(urls).slice(0, DIRECT_FETCH_LIMIT);
}

function searchQueriesForInput(input: OrchestratorMessageInput): string[] {
  const queries: string[] = [];
  const topic = input.articleTextContext?.topic.trim();
  if (topic && !topicLooksLikeUrl(topic)) queries.push(topic);
  if (input.siteCompareContext?.focus.trim()) {
    queries.push(input.siteCompareContext.focus.trim());
  }
  if (input.articleCompareContext?.goal.trim()) {
    queries.push(input.articleCompareContext.goal.trim());
  }
  const firstClaim = input.articleTextContext?.body
    .split(/[.!?]\s+/)
    .map((item) => item.trim())
    .find((item) => item.length >= 55 && item.length <= 180);
  if (firstClaim) queries.push(firstClaim);
  return unique(queries).slice(0, 3);
}

async function fetchText(url: string): Promise<{ status: number; text: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: {
        "user-agent": USER_AGENT,
        accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8",
      },
      redirect: "follow",
      signal: controller.signal,
    });
    const text = await response.text();
    return { status: response.status, text };
  } finally {
    clearTimeout(timeout);
  }
}

async function collectDirectUrlEvidence(url: string): Promise<RuntimeWebEvidenceItem> {
  try {
    const { status, text } = await fetchText(url);
    const title = matchFirst(text, /<title[^>]*>([\s\S]*?)<\/title>/i);
    const description = matchFirst(
      text,
      /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["'][^>]*>/i,
    );
    const h1 = matchFirst(text, /<h1[^>]*>([\s\S]*?)<\/h1>/i);
    const h2 = matchFirst(text, /<h2[^>]*>([\s\S]*?)<\/h2>/i);
    const readable = textFromHtml(text).slice(0, 1600);
    return {
      kind: "direct_url",
      url,
      status,
      title: title || h1,
      snippet: [description, h1, h2].filter(Boolean).join(" | "),
      textSample: readable,
    };
  } catch (error) {
    return {
      kind: "direct_url",
      url,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function collectSearchEvidence(
  query: string,
): Promise<RuntimeWebEvidenceItem[]> {
  const searchUrl = `https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  try {
    const { status, text } = await fetchText(searchUrl);
    const results: RuntimeWebEvidenceItem[] = [];
    const resultPattern =
      /<a[^>]+class=["'][^"']*result__a[^"']*["'][^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>[\s\S]*?<a[^>]+class=["'][^"']*result__snippet[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi;
    for (const match of text.matchAll(resultPattern)) {
      const rawUrl = match[1] ?? "";
      const url = rawUrl.includes("uddg=")
        ? decodeURIComponent(rawUrl.split("uddg=")[1]?.split("&")[0] ?? rawUrl)
        : rawUrl;
      results.push({
        kind: "search_result",
        source: "DuckDuckGo HTML",
        url,
        status,
        title: textFromHtml(match[2] ?? ""),
        snippet: textFromHtml(match[3] ?? ""),
      });
      if (results.length >= SEARCH_RESULT_LIMIT) break;
    }
    if (results.length > 0) return results;
    return [
      {
        kind: "search_result",
        source: "DuckDuckGo HTML",
        url: searchUrl,
        status,
        snippet: "Search completed, but no parseable result snippets were found.",
      },
    ];
  } catch (error) {
    return [
      {
        kind: "search_result",
        source: "DuckDuckGo HTML",
        url: searchUrl,
        error: error instanceof Error ? error.message : String(error),
      },
    ];
  }
}

export async function collectWebEvidence(
  input: OrchestratorMessageInput,
): Promise<RuntimeWebEvidenceContext | null> {
  const directUrls = directUrlsForInput(input);
  const hasAnalysisContext = Boolean(
    input.articleTextContext ||
      input.articleCompareContext ||
      input.siteCompareContext ||
      input.scanContext,
  );
  const queries =
    selectedToolsNeedWeb(input) || hasAnalysisContext
      ? searchQueriesForInput(input)
      : [];
  if (directUrls.length === 0 && queries.length === 0) return null;

  const directItems = await Promise.all(
    directUrls.map((url) => collectDirectUrlEvidence(url)),
  );
  const searchGroups = await Promise.all(
    queries.map((query) => collectSearchEvidence(query)),
  );
  const items = [...directItems, ...searchGroups.flat()];

  return {
    collectedAt: new Date().toISOString(),
    enabled: true,
    queries,
    items,
    limitations: [
      "Public web evidence is best-effort and may be incomplete or blocked.",
      "Search snippets are supporting evidence, not proof of ranking, traffic, or authority.",
      "Private analytics, Search Console, backlink databases, paid SEO tools, and expert review are not included unless separately connected.",
    ],
  };
}
