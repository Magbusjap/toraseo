import { mutateBuffer, readState, type ToolBufferEntry } from "./stateFile.js";
import { readActiveInputMarkdown, writeWorkspaceResult } from "./workspace.js";

type TextToolId =
  | "detect_text_platform"
  | "analyze_text_structure"
  | "analyze_text_style"
  | "analyze_tone_fit"
  | "language_audience_fit"
  | "media_placeholder_review"
  | "article_uniqueness"
  | "language_syntax"
  | "ai_writing_probability"
  | "naturalness_indicators"
  | "intent_seo_forecast"
  | "safety_science_review"
  | "fact_distortion_check"
  | "logic_consistency_check"
  | "ai_hallucination_check";

interface TextContext {
  action: "scan" | "solution";
  topic: string;
  analysisRole: string;
  textPlatform: string;
  customPlatform: string;
  text: string;
}

interface TextIssue {
  severity: "critical" | "warning" | "info";
  code: string;
  message: string;
}

interface TextAnnotation {
  category: string;
  severity: "critical" | "warning" | "info";
  marker: "underline" | "outline" | "strike" | "muted" | "note";
  paragraphId?: string;
  quote?: string;
  title: string;
  shortMessage: string;
  recommendation?: string;
  confidence: number;
  global?: boolean;
}

interface TextToolResult {
  tool: TextToolId;
  summary: Record<string, unknown>;
  issues: TextIssue[];
  recommendations: string[];
  annotations?: TextAnnotation[];
}

type McpHandlerResult = {
  isError?: boolean;
  content: Array<{ type: "text"; text: string }>;
};

export const emptyInputSchema = {};

function words(text: string): string[] {
  return text.match(/[\p{L}\p{N}]+(?:[-'][\p{L}\p{N}]+)?/gu) ?? [];
}

function sentences(text: string): string[] {
  return text
    .split(/[.!?…]+|\n{2,}/g)
    .map((item) => item.trim())
    .filter(Boolean);
}

function paragraphs(text: string): string[] {
  return text
    .split(/\n\s*\n/g)
    .map((item) => item.trim())
    .filter(Boolean);
}

function paragraphEntries(text: string): Array<{ id: string; text: string }> {
  return paragraphs(text).map((paragraph, index) => ({
    id: `p${String(index + 1).padStart(3, "0")}`,
    text: paragraph,
  }));
}

function findParagraphForQuote(
  text: string,
  quote: string,
): { paragraphId: string; quote: string } | null {
  const normalizedQuote = quote.trim();
  if (!normalizedQuote) return null;
  const lowerQuote = normalizedQuote.toLowerCase();
  for (const paragraph of paragraphEntries(text)) {
    if (paragraph.text.toLowerCase().includes(lowerQuote)) {
      return { paragraphId: paragraph.id, quote: normalizedQuote };
    }
  }
  return null;
}

function firstPatternAnnotation(
  text: string,
  pattern: RegExp,
  base: Omit<TextAnnotation, "paragraphId" | "quote">,
): TextAnnotation | null {
  const match = text.match(pattern);
  const quote = match?.[0]?.trim();
  if (!quote) return null;
  const target = findParagraphForQuote(text, quote);
  if (!target) return null;
  return { ...base, ...target };
}

function firstLongSentenceAnnotation(
  text: string,
  minWords: number,
  base: Omit<TextAnnotation, "paragraphId" | "quote">,
): TextAnnotation | null {
  const quote = sentences(text).find((sentence) => words(sentence).length >= minWords);
  if (!quote) return null;
  const target = findParagraphForQuote(text, quote);
  if (!target) return null;
  return { ...base, ...target };
}

function firstDuplicateSentenceAnnotation(
  text: string,
  base: Omit<TextAnnotation, "paragraphId" | "quote">,
): TextAnnotation | null {
  const seen = new Set<string>();
  for (const sentence of sentences(text)) {
    const normalized = sentence.toLowerCase().replace(/\s+/g, " ").trim();
    if (!normalized || !seen.has(normalized)) {
      seen.add(normalized);
      continue;
    }
    const target = findParagraphForQuote(text, sentence);
    if (target) return { ...base, ...target };
  }
  return null;
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function repeatedTermCounts(text: string): Record<string, number> {
  return [...text.toLowerCase().matchAll(/[\p{L}\p{N}]{4,}/gu)]
    .map((match) => match[0])
    .reduce<Record<string, number>>((acc, word) => {
      acc[word] = (acc[word] ?? 0) + 1;
      return acc;
    }, {});
}

function topRepeatedTerms(text: string, minCount = 5): string[] {
  return Object.entries(repeatedTermCounts(text))
    .filter(([word, count]) => {
      if (count < minCount) return false;
      if (word.length < 5) return false;
      if (/^(часть|загрузить|скачать|download|место|изображения|placeholder|pdf)$/iu.test(word)) {
        return false;
      }
      if (RU_STOP_WORDS.has(word) || EN_STOP_WORDS.has(word)) return false;
      return !/^\d+$/.test(word);
    })
    .sort((a, b) => b[1] - a[1])
    .map(([word]) => word)
    .slice(0, 8);
}

const RU_STOP_WORDS = new Set([
  "это",
  "как",
  "что",
  "или",
  "для",
  "при",
  "если",
  "его",
  "она",
  "они",
  "вы",
  "вам",
  "ваш",
  "ваша",
  "так",
  "уже",
  "еще",
  "ещё",
  "будет",
  "может",
  "нужно",
  "после",
  "перед",
  "когда",
  "которые",
  "который",
  "этот",
  "этого",
  "также",
  "более",
  "менее",
  "очень",
  "чтобы",
  "потому",
  "поэтому",
  "между",
  "через",
]);

const EN_STOP_WORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "from",
  "this",
  "that",
  "your",
  "you",
  "are",
  "can",
  "will",
  "not",
  "how",
  "what",
  "why",
  "when",
  "after",
  "before",
  "about",
  "into",
  "over",
  "more",
]);

const SERVICE_TEXT_LINE_PATTERN =
  /^(?:\d{1,3}|часть\s+\d{1,3}|part\s+\d{1,3}|загрузить\s+pdf|скачать\s+pdf|download\s+pdf|get\s+pdf|[-–—_]{5,}.*|.*место\s+для\s+(?:изображения|анимации|видео|аудио).*)$/iu;

function isServiceTextLine(value: string): boolean {
  return SERVICE_TEXT_LINE_PATTERN.test(value.trim());
}

function stripMarkdownHeading(value: string): string {
  return value.trim().replace(/^#{1,6}\s+/, "");
}

function stripListMarker(value: string): string {
  return value
    .trim()
    .replace(/^[-*•]\s+/, "")
    .replace(/^\d+[.)]\s+/, "")
    .trim();
}

function startsWithLowercaseLetter(value: string): boolean {
  return /^[a-zа-яё]/u.test(value.trim());
}

function isLikelyListLeadInLine(value: string): boolean {
  const line = stripMarkdownHeading(value).trim();
  if (!line) return false;
  if (/[:：]\s*$/.test(line)) return true;
  return /^(?:эта статья поможет понять|в этой статье|вы узнаете|разбер[её]м|ниже разбер[её]м|практически|важно(?:\s+помнить)?|this article|in this article|you will learn|we will cover)\b/iu.test(
    line,
  );
}

function isLikelyListContinuationLine(
  value: string,
  previousMeaningfulLine = "",
): boolean {
  const raw = stripMarkdownHeading(value).trim();
  const line = stripListMarker(raw);
  if (!line) return false;
  if (/^[-*•]\s+/.test(raw)) return true;
  if (previousMeaningfulLine && isLikelyListLeadInLine(previousMeaningfulLine)) {
    return true;
  }
  const previousLine = stripListMarker(previousMeaningfulLine);
  if (
    previousLine &&
    startsWithLowercaseLetter(previousLine) &&
    startsWithLowercaseLetter(line) &&
    words(line).length <= 12
  ) {
    return true;
  }
  if (startsWithLowercaseLetter(line) && words(line).length <= 12 && /[,;]$/.test(line)) {
    return true;
  }
  return startsWithLowercaseLetter(line) && words(line).length <= 8 && !/[.!?…]$/.test(line);
}

function isLikelySeoTitleLine(
  value: string,
  options: { allowLowercaseStart?: boolean } = {},
): boolean {
  const line = value.trim().replace(/^#{1,6}\s+/, "");
  if (line.length < 4 || line.length > 90) return false;
  if (isServiceTextLine(line)) return false;
  if (isLikelyListLeadInLine(line)) return false;
  if (!options.allowLowercaseStart && startsWithLowercaseLetter(stripListMarker(line))) return false;
  if (/\[[0-9]+\]/.test(line)) return false;
  if (/[.!?…\]]$/.test(line)) return false;
  return words(line).length <= 14;
}

function capitalizeFirst(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  return `${trimmed[0]?.toUpperCase() ?? ""}${trimmed.slice(1)}`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function meaningfulTerms(text: string, limit = 12): string[] {
  return Object.entries(repeatedTermCounts(text))
    .filter(([word]) => {
      if (word.length < 4) return false;
      if (/^(часть|загрузить|скачать|download|место|изображения|placeholder|pdf)$/iu.test(word)) {
        return false;
      }
      if (RU_STOP_WORDS.has(word) || EN_STOP_WORDS.has(word)) return false;
      return !/^\d+$/.test(word);
    })
    .sort((left, right) => right[1] - left[1])
    .slice(0, limit)
    .map(([word]) => word);
}

function firstReadableSentence(text: string, maxLength = 155): string {
  const cleanedText = text
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .filter((line) => line && !isServiceTextLine(line))
    .join("\n");
  const first = sentences(cleanedText).find((sentence) => sentence.length >= 45) ?? "";
  if (!first) return "";
  return first.length <= maxLength
    ? first
    : `${first.slice(0, maxLength - 1).trim()}…`;
}

function inferContentIntent(text: string): string {
  if (/как|почему|что такое|how to|why|what is/iu.test(text)) return "informational_how_to";
  if (/купить|цена|заказать|стоимость|скидк|buy|price|order|deal/iu.test(text)) {
    return "commercial";
  }
  if (/мнение|личный опыт|я считаю|разбор|opinion|my experience|review/iu.test(text)) {
    return "expert_opinion";
  }
  if (words(text).length < 140) return "social_engagement";
  return "informational";
}

function humanIntentLabel(intent: string): string {
  const labels: Record<string, string> = {
    informational_how_to: "Информационный / решение проблемы",
    commercial: "Коммерческий",
    expert_opinion: "Экспертное мнение",
    social_engagement: "Социальное вовлечение",
    informational: "Информационный",
  };
  return labels[intent] ?? intent;
}

function platformHookLabel(platform: string): string {
  if (platform === "short_social_post") return "короткий хук для поста";
  if (platform === "x_short") return "хук первой строки";
  if (platform.includes("social")) return "хук для ленты";
  return "SEO-хук заголовка и вступления";
}

function inferCategory(terms: string[], intent: string): string {
  const joined = terms.join(" ");
  if (/seo|cms|laravel|wordpress|api|код|разработ|техн|python|css|html/i.test(joined)) {
    return "Технологии";
  }
  if (/здоров|организм|диабет|трениров|питани|медиц|гликоген|глюкоз|углевод|спорт|упражнен|health|diet|fitness/i.test(joined)) {
    return "Здоровье и спорт";
  }
  if (/бизнес|продаж|маркет|клиент|conversion|sales/i.test(joined)) {
    return "Бизнес";
  }
  return intent === "commercial" ? "Обзоры и покупки" : "Полезные материалы";
}

const CYRILLIC_SLUG_MAP: Record<string, string> = {
  а: "a",
  б: "b",
  в: "v",
  г: "g",
  д: "d",
  е: "e",
  ё: "e",
  ж: "zh",
  з: "z",
  и: "i",
  й: "y",
  к: "k",
  л: "l",
  м: "m",
  н: "n",
  о: "o",
  п: "p",
  р: "r",
  с: "s",
  т: "t",
  у: "u",
  ф: "f",
  х: "h",
  ц: "ts",
  ч: "ch",
  ш: "sh",
  щ: "sch",
  ъ: "",
  ы: "y",
  ь: "",
  э: "e",
  ю: "yu",
  я: "ya",
};

function toLatinSlug(value: string): string {
  return value
    .toLowerCase()
    .split("")
    .map((char) => CYRILLIC_SLUG_MAP[char] ?? char)
    .join("")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 72);
}

function slugSuggestion(title: string, terms: string[]): string {
  const base = title || terms.slice(0, 5).join(" ");
  return toLatinSlug(base) || toLatinSlug(terms.slice(0, 5).join(" "));
}

function generatedSeoTitleFromTerms(text: string, terms: string[]): string {
  const lowered = text.toLowerCase();
  if (/гликоген/u.test(lowered) && /трениров|упражнен|нагруз/u.test(lowered)) {
    return "Восстановление гликогена после тренировки";
  }
  if (terms.length >= 3) {
    return `${capitalizeFirst(terms.slice(0, 3).join(" "))}: что важно знать`;
  }
  if (terms.length > 0) return `${capitalizeFirst(terms[0] ?? "")}: что важно знать`;
  return "";
}

function firstExplicitTitleLine(text: string): string {
  let previousMeaningfulLine = "";
  let sawIntroFlowBeforeTitle = false;
  for (const rawLine of text.split(/\r?\n/g)) {
    const line = stripMarkdownHeading(rawLine).trim();
    if (!line) continue;
    if (isServiceTextLine(line)) {
      if (/место\s+для|placeholder|[-–—_]{5,}/iu.test(line)) break;
      previousMeaningfulLine = line;
      continue;
    }
    if (isLikelyListLeadInLine(line) || isLikelyListContinuationLine(line, previousMeaningfulLine)) {
      sawIntroFlowBeforeTitle = true;
      previousMeaningfulLine = line;
      continue;
    }
    if (sawIntroFlowBeforeTitle) break;
    if (isLikelySeoTitleLine(line)) return line;
    break;
  }
  return "";
}

function titleFromText(context: TextContext): string {
  if (isLikelySeoTitleLine(context.topic, { allowLowercaseStart: true })) {
    return context.topic.trim();
  }
  const firstLine = firstExplicitTitleLine(context.text);
  if (firstLine) return firstLine;
  const terms = meaningfulTerms(context.text, 4);
  return generatedSeoTitleFromTerms(context.text, terms);
}

function estimateHookScore(text: string): number {
  const allSentences = sentences(text);
  const first = allSentences[0] ?? "";
  const preview = `${first} ${allSentences[1] ?? ""}`;
  const question = /[?]|как|почему|что будет|зачем|how|why|what/iu.test(first) ? 16 : 0;
  const concrete = /\d|пример|способ|ошибк|чек-лист|guide|mistake|example/iu.test(first) ? 14 : 0;
  const pain =
    /пустот|упадок сил|тяжелее|устал|не успел|мотивац|выгора|проседа|проблем|pain|fatigue|harder|problem/iu.test(
      first,
    )
      ? 14
      : 0;
  const payoff =
    /поможет понять|что делать|чек-лист|план|сможете|получит|узнаете|обещан|understand|checklist|plan|you will learn/iu.test(
      preview,
    )
      ? 8
      : 0;
  const hasUsefulOpening = question + concrete + pain + payoff > 0;
  const lengthPenalty = first.length > 180 ? (hasUsefulOpening ? 10 : 18) : first.length < 35 ? 10 : 0;
  const genericPenalty = /важно отметить|следует отметить|в наше время|overall|in conclusion/iu.test(first)
    ? 16
    : 0;
  return clampScore(58 + question + concrete + pain + payoff - lengthPenalty - genericPenalty);
}

function estimateCtrPotential(text: string, title: string, intent: string): number {
  const titleWords = words(title).length;
  const titleScore = titleWords >= 4 && titleWords <= 12 ? 22 : 8;
  const intentScore = intent === "informational_how_to" || intent === "commercial" ? 18 : 11;
  const introScore = estimateHookScore(text) * 0.35;
  const keywordScore = meaningfulTerms(`${title} ${text}`, 8).length >= 5 ? 14 : 8;
  return clampScore(titleScore + intentScore + introScore + keywordScore);
}

function countMatches(text: string, pattern: RegExp): number {
  return (text.match(pattern) ?? []).length;
}

function hasCyrillicText(text: string): boolean {
  return /[А-Яа-яЁё]/u.test(text);
}

function inferJurisdictionContext(context: TextContext): string {
  const destination = `${context.textPlatform} ${context.customPlatform}`.toLowerCase();
  if (/reddit|x_short|x_long|twitter|facebook|linkedin|habr/.test(destination)) {
    return hasCyrillicText(context.text)
      ? "ru_language_international_platform"
      : "platform_rules_first";
  }
  if (/росси|рф|ru\b|\.ru|яндекс|дзен|вк|vc\.ru|habr/.test(destination)) {
    return "ru_law_context";
  }
  if (hasCyrillicText(context.text)) return "ru_language_assumed";
  return "unspecified";
}

function safetyScienceAnnotation(
  category: string,
  severity: "critical" | "warning" | "info",
  shortMessage: string,
  recommendation: string,
): TextAnnotation {
  return {
    category,
    severity,
    marker: severity === "critical" ? "outline" : "note",
    paragraphId: "p001",
    title: severity === "critical" ? "Предупреждение!" : "Проверка риска",
    shortMessage,
    recommendation,
    confidence: severity === "critical" ? 0.78 : 0.68,
    global: true,
  };
}

function sentenceLengthStats(text: string): { avg: number; variance: number } {
  const lengths = sentences(text).map((sentence) => words(sentence).length);
  if (lengths.length === 0) return { avg: 0, variance: 0 };
  const avg = lengths.reduce((sum, item) => sum + item, 0) / lengths.length;
  const variance =
    lengths.reduce((sum, item) => sum + (item - avg) ** 2, 0) / lengths.length;
  return { avg: Math.round(avg), variance: Math.round(variance) };
}

function inferPlatform(text: string, wordCount: number): string {
  if (/^#{1,3}\s|\*\*|^- /m.test(text)) return "markdown_article";
  if (wordCount > 700) return "site_article";
  if (wordCount < 120) return "short_social_post";
  return "short_article_or_long_social_post";
}

function resolveTextPlatform(context: TextContext, wordCount: number): string {
  if (context.textPlatform && context.textPlatform !== "auto") {
    return context.textPlatform === "custom" && context.customPlatform
      ? "custom"
      : context.textPlatform;
  }
  return inferPlatform(context.text, wordCount);
}

function inferTextStyle(text: string): string {
  if (/я\s|мой|личн|опыт|I\s|my\s/iu.test(text)) return "personal";
  if (/исследован|данн|таблиц|метод|анализ|study|data|research/iu.test(text)) {
    return "analytical";
  }
  if (/как|почему|что такое|объясн|пример|how to|why|what is/iu.test(text)) {
    return "educational";
  }
  if (/купить|цена|клиент|продаж|conversion|customer|sales/iu.test(text)) {
    return "business";
  }
  return "informational";
}

function inferTone(text: string): string {
  if (/врач|диабет|болезн|беремен|риск|doctor|risk|disease/iu.test(text)) {
    return "cautious_expert";
  }
  if (/!{1,2}|круто|легко|быстро|wow|easy/iu.test(text)) return "energetic";
  if (/я\s|мой|личн|I\s|my\s/iu.test(text)) return "personal";
  return "neutral_explaining";
}

function headings(text: string): string[] {
  const detected: string[] = [];
  let previousMeaningfulLine = "";
  for (const rawLine of text.split(/\r?\n/g)) {
    const raw = rawLine.trim();
    const line = stripMarkdownHeading(raw);
    const comparable = stripListMarker(line);
    if (!line) continue;
    if (isServiceTextLine(line)) {
      previousMeaningfulLine = line;
      continue;
    }
    if (line.length > 90 || words(comparable).length > 14) {
      previousMeaningfulLine = line;
      continue;
    }
    if (isLikelyListLeadInLine(line) || isLikelyListContinuationLine(line, previousMeaningfulLine)) {
      previousMeaningfulLine = line;
      continue;
    }
    if (/[.!?…,:;]$/.test(line)) {
      previousMeaningfulLine = line;
      continue;
    }
    if (/^#{1,6}\s+/.test(raw) || !startsWithLowercaseLetter(comparable)) {
      detected.push(line);
    }
    previousMeaningfulLine = line;
  }
  return detected;
}

function lowercaseSentenceStartCount(text: string): number {
  const inlineLowercaseStarts = (text.match(/[.!?…]\s+[a-zа-яё]/gu) ?? []).length;
  let lineStartIssues = 0;
  let previousMeaningfulLine = "";
  for (const rawLine of text.split(/\r?\n/g)) {
    const line = stripMarkdownHeading(rawLine).trim();
    if (!line) continue;
    if (isServiceTextLine(line)) {
      previousMeaningfulLine = line;
      continue;
    }
    if (isLikelyListLeadInLine(line) || isLikelyListContinuationLine(line, previousMeaningfulLine)) {
      previousMeaningfulLine = line;
      continue;
    }
    const comparable = stripListMarker(line);
    if (startsWithLowercaseLetter(comparable) && /[.!?…]$/.test(comparable)) {
      lineStartIssues += 1;
    }
    previousMeaningfulLine = line;
  }
  return inlineLowercaseStarts + lineStartIssues;
}

function issueCounts(issues: TextIssue[]): ToolBufferEntry["summary"] {
  return {
    critical: issues.filter((issue) => issue.severity === "critical").length,
    warning: issues.filter((issue) => issue.severity === "warning").length,
    info: issues.filter((issue) => issue.severity === "info").length,
  };
}

function verdict(issues: TextIssue[]): "ok" | "warning" | "critical" {
  if (issues.some((issue) => issue.severity === "critical")) return "critical";
  if (issues.some((issue) => issue.severity === "warning")) return "warning";
  return "ok";
}

async function getContext(): Promise<TextContext> {
  const state = await readState();
  const workspaceText = await readActiveInputMarkdown(state);
  const text = (workspaceText ?? state?.input?.text ?? "").trim();
  if (state && state.analysisType !== "article_text") {
    throw new Error("The active ToraSEO context is not article_text.");
  }
  if (!text) {
    throw new Error("No active ToraSEO article_text context is available.");
  }
  return {
    action: state?.input?.action === "solution" ? "solution" : "scan",
    topic: state?.input?.topic?.trim() ?? "",
    analysisRole: state?.input?.analysisRole?.trim() || "default",
    textPlatform: state?.input?.textPlatform?.trim() || "auto",
    customPlatform: state?.input?.customPlatform?.trim() || "",
    text,
  };
}

async function runTextTool(
  toolId: TextToolId,
  analyzer: (context: TextContext) => TextToolResult,
): Promise<McpHandlerResult> {
  const startedAt = new Date().toISOString();
  await mutateBuffer(toolId, () => ({
    status: "running",
    startedAt,
    completedAt: null,
  }));

  try {
    const result = analyzer(await getContext());
    const completedAt = new Date().toISOString();
    const counts = issueCounts(result.issues);
    const next = await mutateBuffer(toolId, () => ({
      status: "complete",
      startedAt,
      completedAt,
      verdict: verdict(result.issues),
      data: result,
      summary: counts,
    }));
    await writeWorkspaceResult(next, toolId, result);

    return {
      content: [
        {
          type: "text",
          text: [
            `Tool ${toolId} completed. Structured result:`,
            JSON.stringify(result, null, 2),
            next ? "The same result was written to the ToraSEO app." : "",
          ]
            .filter(Boolean)
            .join("\n"),
        },
      ],
    };
  } catch (error) {
    const completedAt = new Date().toISOString();
    const message = error instanceof Error ? error.message : String(error);
    const next = await mutateBuffer(toolId, () => ({
      status: "error",
      startedAt,
      completedAt,
      errorCode: "text_context_error",
      errorMessage: message,
    }));
    await writeWorkspaceResult(next, toolId, {
      errorCode: "text_context_error",
      errorMessage: message,
    });
    return {
      isError: true,
      content: [{ type: "text", text: `[text_context_error] ${message}` }],
    };
  }
}

export const articleRewriteContextHandler = async (): Promise<McpHandlerResult> => {
  const state = await readState();
  if (state && state.analysisType !== "article_text") {
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: "[text_context_error] The active ToraSEO context is not article_text.",
        },
      ],
    };
  }

  const text = (await readActiveInputMarkdown(state))?.trim();
  if (!text) {
    return {
      isError: true,
      content: [
        {
          type: "text",
          text:
            "[text_context_error] No active or cached ToraSEO article_text input is available. " +
            "Ask the user to run article analysis again instead of reading input.md directly.",
        },
      ],
    };
  }

  const completedResults = Object.fromEntries(
    Object.entries(state?.buffer ?? {})
      .filter(([, entry]) => entry.status === "complete" && entry.data)
      .map(([toolId, entry]) => [toolId, entry.data]),
  );

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(
          {
            source: "toraseo_article_text_workspace",
            guidance:
              "Use this only when the user explicitly asks to rewrite or draft the analyzed article. Write the rewritten article directly in chat as a separate copyable article block; do not write it back into ToraSEO and do not ask the user to paste the source article again. The user will copy the rewritten article into ToraSEO and run a new scan. Follow the active ToraSEO Workflow Instructions/SKILL behavior, the selected tool set, completed MCP results, platform/style/audience context, SEO package, media-placeholder policy, and safety/risk warnings. Keep the rewrite bounded by ToraSEO evidence and mark uncertainties instead of inventing facts.",
            input: {
              action: state?.input?.action ?? "scan",
              topic: state?.input?.topic ?? "",
              analysisRole: state?.input?.analysisRole ?? "default",
              textPlatform: state?.input?.textPlatform ?? "auto",
              customPlatform: state?.input?.customPlatform ?? "",
            },
            selectedTools: state?.selectedTools ?? [],
            completedResults,
            articleText: text,
          },
          null,
          2,
        ),
      },
    ],
  };
};

export const detectTextPlatformHandler = () =>
  runTextTool("detect_text_platform", (context) => {
    const text = context.text;
    const hasMarkdown = /^#{1,3}\s|\*\*|^- /m.test(text);
    const wordCount = words(text).length;
    const inferredPlatform = resolveTextPlatform(context, wordCount);
    const issue: TextIssue = {
      severity: "info",
      code: "platform_inferred",
      message:
        inferredPlatform === "site_article"
          ? "The text behaves like a long-form site article."
          : "The text behaves like a short article or platform post draft.",
    };
    return {
      tool: "detect_text_platform",
      summary: {
        topic: context.topic,
        analysisRole: context.analysisRole,
        selectedPlatform: context.textPlatform,
        customPlatform: context.customPlatform,
        wordCount,
        hasMarkdown,
        inferredPlatform,
      },
      issues: [issue],
      recommendations: [
        "Keep platform-specific metadata separate from the body: title, description, tags, and social preview text.",
      ],
    };
  });

export const analyzeTextStructureHandler = () =>
  runTextTool("analyze_text_structure", (context) => {
    const text = context.text;
    const wordCount = words(text).length;
    const paragraphCount = paragraphs(text).length;
    const headingCount = headings(text).length;
    const issues: TextIssue[] = [];
    const annotations: TextAnnotation[] = [];
    if (wordCount < 300) {
      issues.push({
        severity: "warning",
        code: "thin_text",
        message: "The article is short for a search-oriented text; expand the useful answer before optimizing.",
      });
      annotations.push({
        category: "structure",
        severity: "warning",
        marker: "outline",
        paragraphId: "p001",
        title: "Short text for search intent",
        shortMessage:
          "The text may not fully answer the search intent yet; expand the useful answer before polishing SEO.",
        confidence: 0.72,
        global: true,
      });
    }
    if (paragraphCount < 3) {
      issues.push({
        severity: "warning",
        code: "low_paragraph_structure",
        message: "The text has too few clear paragraphs, which makes scanning harder.",
      });
      annotations.push({
        category: "structure",
        severity: "warning",
        marker: "outline",
        paragraphId: "p001",
        title: "Weak paragraph structure",
        shortMessage:
          "The draft has too few clear paragraphs, so quick scanning is harder.",
        confidence: 0.76,
        global: true,
      });
    }
    if (headingCount < 2) {
      issues.push({
        severity: "warning",
        code: "weak_heading_structure",
        message: "Add clear section headings so readers and search systems can understand the structure faster.",
      });
      annotations.push({
        category: "structure",
        severity: "warning",
        marker: "outline",
        paragraphId: "p001",
        title: "Section headings are weak",
        shortMessage:
          "Add clear section headings so readers and search systems understand the structure faster.",
        confidence: 0.74,
        global: true,
      });
    }
    return {
      tool: "analyze_text_structure",
      summary: { wordCount, paragraphCount, headingCount },
      issues,
      recommendations: [
        "Use one clear title or main heading, then split the body into intent-based sections with short headings.",
      ],
      annotations,
    };
  });

export const analyzeTextStyleHandler = () =>
  runTextTool("analyze_text_style", (context) => {
    const allWords = words(context.text);
    const allSentences = sentences(context.text);
    const detectedStyle = inferTextStyle(context.text);
    const avgSentenceWords =
      allSentences.length > 0 ? Math.round(allWords.length / allSentences.length) : 0;
    const issues: TextIssue[] = [];
    const annotations: TextAnnotation[] = [];
    if (avgSentenceWords > 24) {
      issues.push({
        severity: "warning",
        code: "long_sentences",
        message: "Average sentence length is high; shorten dense sentences to improve readability.",
      });
      const denseAnnotation = firstLongSentenceAnnotation(context.text, 25, {
        category: "readability",
        severity: "warning",
        marker: "underline",
        title: "Dense sentence",
        shortMessage:
          "This sentence is long enough that the reader may lose the thread.",
        recommendation: "Split it into two simpler thoughts or add a clearer transition.",
        confidence: 0.72,
      });
      if (denseAnnotation) annotations.push(denseAnnotation);
    }
    if (/является|осуществляется|производится|обеспечивает|utilize|leverage/i.test(context.text)) {
      issues.push({
        severity: "info",
        code: "formal_phrasing",
        message: "The text contains formal or mechanical phrasing; make key explanations more direct.",
      });
      const formalAnnotation = firstPatternAnnotation(
        context.text,
        /является|осуществляется|производится|обеспечивает|utilize|leverage/i,
        {
          category: "style",
          severity: "info",
          marker: "strike",
          title: "Formal phrasing",
          shortMessage:
            "This word often makes the sentence sound mechanical or bureaucratic.",
          recommendation: "Use a more direct verb if the meaning allows it.",
          confidence: 0.78,
        },
      );
      if (formalAnnotation) annotations.push(formalAnnotation);
    }
    return {
      tool: "analyze_text_style",
      summary: {
        words: allWords.length,
        sentences: allSentences.length,
        avgSentenceWords,
        detectedStyle,
      },
      issues,
      recommendations: [
        `Detected style: ${detectedStyle}. Prefer concrete verbs, shorter sentences, and examples where the reader may hesitate.`,
      ],
      annotations,
    };
  });

export const analyzeToneFitHandler = () =>
  runTextTool("analyze_tone_fit", (context) => {
    const detectedTone = inferTone(context.text);
    return {
      tool: "analyze_tone_fit",
      summary: { action: context.action, detectedTone },
      issues: [
        {
          severity: "info",
          code: "tone_review",
          message:
            detectedTone === "cautious_expert"
              ? "Tone appears cautious and expert-oriented; keep warnings precise instead of making every paragraph defensive."
              : "Tone should match the platform and risk of the topic; for health or finance topics, avoid overconfident promises.",
        },
      ],
      recommendations: [
        `Detected tone: ${detectedTone}. Add precise caveats only where they protect the reader; avoid making every paragraph cautious.`,
      ],
      annotations: [
        {
          category: "tone",
          severity: "info",
          marker: "note",
          paragraphId: "p001",
          title: "Tone check",
          shortMessage:
            detectedTone === "cautious_expert"
              ? "The tone is cautious and expert-oriented; keep warnings precise, not defensive."
              : "The tone should match the platform and topic risk.",
          confidence: 0.7,
          global: true,
        },
      ],
    };
  });

export const languageAudienceFitHandler = () =>
  runTextTool("language_audience_fit", (context) => {
    const cyrillic = (context.text.match(/\p{Script=Cyrillic}/gu) ?? []).length;
    const latin = (context.text.match(/\p{Script=Latin}/gu) ?? []).length;
    return {
      tool: "language_audience_fit",
      summary: {
        dominantScript: cyrillic >= latin ? "cyrillic" : "latin",
        cyrillic,
        latin,
      },
      issues: [
        {
          severity: "info",
          code: "audience_fit",
          message:
            "Check that examples, terminology, and assumed knowledge match the intended audience.",
        },
      ],
      recommendations: [
        "Name the target reader explicitly in the intro when the topic can serve several audiences.",
      ],
      annotations: [
        {
          category: "audience",
          severity: "info",
          marker: "note",
          paragraphId: "p001",
          title: "Audience fit",
          shortMessage:
            "Check that examples, terms, and explanation depth match the intended reader.",
          confidence: 0.68,
          global: true,
        },
      ],
    };
  });

export const mediaPlaceholderReviewHandler = () =>
  runTextTool("media_placeholder_review", (context) => {
    const markers = (context.text.match(/место для изображения|image placeholder|место для видео|место для аудио/giu) ?? []).length;
    const needsMediaQuestion = markers === 0;
    const issues: TextIssue[] = markers
      ? []
      : [
          {
            severity: "warning",
            code: "no_media_markers",
            message: "No media placeholders were found. Add them only where an image, animation, video, or audio improves understanding.",
          },
        ];
    return {
      tool: "media_placeholder_review",
      summary: {
        markers,
        needsMediaQuestion,
        suggestedMarkerTypes: ["image", "animation", "video", "audio"],
      },
      issues,
      recommendations: [
        needsMediaQuestion
          ? "Ask the user whether they want ToraSEO to add media placement markers; choose image, animation, video, or audio based on the article section."
          : "Place media markers inside the relevant section, not all at the end of the article.",
      ],
      annotations: needsMediaQuestion
        ? [
            {
              category: "media",
              severity: "warning",
              marker: "note",
              paragraphId: "p001",
              title: "Media positions are not marked",
              shortMessage:
                "If media will improve understanding, mark the intended image/video/audio positions before rewriting.",
              confidence: 0.66,
              global: true,
            },
          ]
        : [],
    };
  });

export const articleUniquenessHandler = () =>
  runTextTool("article_uniqueness", (context) => {
    const allWords = words(context.text).map((word) => word.toLowerCase());
    const uniqueWordRatio =
      allWords.length > 0 ? new Set(allWords).size / allWords.length : 0;
    const normalizedSentences = sentences(context.text).map((sentence) =>
      sentence.toLowerCase().replace(/\s+/g, " ").trim(),
    );
    const duplicateSentences =
      normalizedSentences.length - new Set(normalizedSentences).size;
    const duplicateSentenceRate =
      normalizedSentences.length > 0
        ? duplicateSentences / normalizedSentences.length
        : 0;
    const repeated = topRepeatedTerms(context.text, 5);
    const score = clampScore(
      92 -
        duplicateSentenceRate * 80 -
        Math.max(0, 0.42 - uniqueWordRatio) * 80,
    );
    const issues: TextIssue[] = [];
    const annotations: TextAnnotation[] = [];
    if (score < 70) {
      issues.push({
        severity: "warning",
        code: "uniqueness_risk",
        message:
          "The text has local repetition or duplicate-pattern risk. This is not an internet plagiarism check.",
      });
      const repeatedAnnotation = repeated[0]
        ? firstPatternAnnotation(context.text, new RegExp(`\\b${escapeRegExp(repeated[0])}\\b`, "iu"), {
            category: "repetition",
            severity: "warning",
            marker: "underline",
            title: "Repeated term",
            shortMessage:
              "This term appears often enough to create a local repetition risk.",
            recommendation: "Keep the term where it is necessary, but vary nearby wording.",
            confidence: 0.7,
          })
        : null;
      if (repeatedAnnotation) annotations.push(repeatedAnnotation);
    }
    if (duplicateSentences > 0) {
      issues.push({
        severity: "warning",
        code: "duplicate_sentences",
        message: "Some sentences repeat almost exactly inside the article.",
      });
      const duplicateAnnotation = firstDuplicateSentenceAnnotation(context.text, {
        category: "duplicate",
        severity: "warning",
        marker: "underline",
        title: "Repeated sentence",
        shortMessage:
          "This sentence appears to repeat another sentence almost exactly.",
        recommendation:
          "Rewrite one occurrence with a narrower claim, example, or transition.",
        confidence: 0.84,
      });
      if (duplicateAnnotation) annotations.push(duplicateAnnotation);
    }
    return {
      tool: "article_uniqueness",
      summary: {
        score,
        uniqueWordRatio,
        duplicateSentenceRate,
        repeatedTerms: repeated,
        method: "local_repetition_risk",
      },
      issues,
      recommendations: [
        "Rewrite repeated fragments with new examples, narrower claims, or more specific transitions.",
      ],
      annotations,
    };
  });

export const languageSyntaxHandler = () =>
  runTextTool("language_syntax", (context) => {
    const stats = sentenceLengthStats(context.text);
    const spacingIssues =
      (context.text.match(/\s+[,.!?;:]/g) ?? []).length +
      (context.text.match(/[,.!?;:][^\s\n)"»]/g) ?? []).length;
    const lowercaseStarts = lowercaseSentenceStartCount(context.text);
    const repeatedPunctuation = (context.text.match(/[!?.,]{3,}/g) ?? []).length;
    const issueTotal = spacingIssues + lowercaseStarts + repeatedPunctuation;
    const score = clampScore(
      96 - issueTotal * 5 - Math.max(0, stats.avg - 26) * 1.5,
    );
    const issues: TextIssue[] = [];
    const annotations: TextAnnotation[] = [];
    if (score < 78) {
      issues.push({
        severity: "warning",
        code: "syntax_risk",
        message:
          "The text has visible syntax or punctuation risks that should be checked before publishing.",
      });
      const syntaxAnnotation = firstPatternAnnotation(context.text, /\s+[,.!?;:]|[,.!?;:][^\s\n)"»]/u, {
        category: "syntax",
        severity: "warning",
        marker: "underline",
        title: "Punctuation spacing",
        shortMessage:
          "This place may contain a punctuation spacing or sentence-boundary issue.",
        recommendation: "Check punctuation manually before publication.",
        confidence: 0.78,
      });
      if (syntaxAnnotation) annotations.push(syntaxAnnotation);
    }
    if (stats.avg > 26) {
      issues.push({
        severity: "info",
        code: "dense_sentences",
        message: "Several sentences are dense; grammar may be correct, but readability suffers.",
      });
      const denseAnnotation = firstLongSentenceAnnotation(context.text, 27, {
        category: "readability",
        severity: "info",
        marker: "underline",
        title: "Dense sentence",
        shortMessage:
          "The sentence is dense; grammar may be correct, but readability can suffer.",
        recommendation: "Split the sentence or add a clearer pause.",
        confidence: 0.68,
      });
      if (denseAnnotation) annotations.push(denseAnnotation);
    }
    return {
      tool: "language_syntax",
      summary: {
        score,
        suspectedIssues: issueTotal,
        spacingIssues,
        lowercaseSentenceStarts: lowercaseStarts,
        repeatedPunctuation,
        avgSentenceWords: stats.avg,
      },
      issues,
      recommendations: [
        "Run a final human grammar pass for punctuation, sentence boundaries, and overloaded clauses.",
      ],
      annotations,
    };
  });

export const aiWritingProbabilityHandler = () =>
  runTextTool("ai_writing_probability", (context) => {
    const repeated = topRepeatedTerms(context.text, 5);
    const stats = sentenceLengthStats(context.text);
    const genericSignals = (
      context.text.match(
        /важно отметить|следует отметить|таким образом|в заключение|it is important to note|in conclusion|overall|moreover/giu,
      ) ?? []
    ).length;
    const formalSignals = (
      context.text.match(/является|осуществляется|производится|обеспечивает|utilize|leverage/giu) ?? []
    ).length;
    const lowVarianceSignal = stats.variance > 0 && stats.variance < 18 ? 18 : 0;
    const probability = clampScore(
      18 + genericSignals * 10 + formalSignals * 5 + lowVarianceSignal,
    );
    const issues: TextIssue[] =
      probability >= 60
        ? [
            {
              severity: "warning",
              code: "ai_style_probability",
              message:
                "The text has signals often associated with AI-assisted writing: generic transitions, uniform rhythm, or repeated terms.",
            },
          ]
        : [];
    const annotations =
      probability >= 60
        ? [
            firstPatternAnnotation(
              context.text,
              /важно отметить|следует отметить|таким образом|в заключение|it is important to note|in conclusion|overall|moreover/iu,
              {
                category: "ai_like",
                severity: "warning",
                marker: "strike",
                title: "AI-like wording",
                shortMessage:
                  "This phrase can make the text feel generic or AI-assisted.",
                recommendation:
                  "Replace it with a more specific author transition or remove it.",
                confidence: 0.7,
              },
            ),
          ].filter((item): item is TextAnnotation => item !== null)
        : [];
    return {
      tool: "ai_writing_probability",
      summary: {
        probability,
        genericSignals,
        formalSignals,
        repeatedTerms: repeated,
        sentenceLengthVariance: stats.variance,
        method: "heuristic_style_probability",
      },
      issues,
      recommendations: [
        "Add specific lived examples, clearer author intent, and less uniform sentence rhythm where the topic allows it.",
      ],
      annotations,
    };
  });

export const factDistortionCheckHandler = () =>
  runTextTool("fact_distortion_check", (context) => {
    const exactNumbers = (context.text.match(/\b\d+(?:[.,]\d+)?\s?%|\b\d{4}\b|\b\d+(?:[.,]\d+)?\s?(?:кг|мг|г|км|мл|час|мин|day|days|kg|mg|km)\b/giu) ?? [])
      .length;
    const absoluteClaims = (
      context.text.match(
        /всегда|никогда|доказано|гарантирует|без исключений|единственный|точно|100%|always|never|proven|guarantees|only|without exception/giu,
      ) ?? []
    ).length;
    const sensitiveClaims = (
      context.text.match(
        /врач|болезн|диабет|лекарств|лечение|беремен|инвестици|налог|закон|doctor|disease|treatment|medicine|investment|tax|law/giu,
      ) ?? []
    ).length;
    const sourceSignals = (
      context.text.match(/https?:\/\/|\[[0-9]+\]|источник|исследован|study|source|according to/giu) ?? []
    ).length;
    const risk = clampScore(
      exactNumbers * 5 + absoluteClaims * 10 + sensitiveClaims * 7 - sourceSignals * 6,
    );
    const issues: TextIssue[] = [];
    const annotations: TextAnnotation[] = [];
    if (risk >= 45) {
      issues.push({
        severity: "warning",
        code: "fact_distortion_risk",
        message:
          "The text contains fact-sensitive claims that may need source verification before publication.",
      });
      annotations.push({
        category: "facts",
        severity: "warning",
        marker: "note",
        paragraphId: "p001",
        title: "Fact-sensitive topic",
        shortMessage:
          "The article contains exact numbers or sensitive claims that need source verification.",
        confidence: 0.74,
        global: true,
      });
    }
    if (absoluteClaims > 0) {
      issues.push({
        severity: "info",
        code: "absolute_claims",
        message:
          "Absolute wording can distort facts if the article does not prove the claim.",
      });
      const absoluteAnnotation = firstPatternAnnotation(
        context.text,
        /всегда|никогда|доказано|гарантирует|без исключений|единственный|точно|100%|always|never|proven|guarantees|only|without exception/iu,
        {
          category: "facts",
          severity: "info",
          marker: "underline",
          title: "Absolute wording",
          shortMessage:
            "Absolute wording needs strong support or it can distort the claim.",
          recommendation: "Soften the wording or add evidence.",
          confidence: 0.76,
        },
      );
      if (absoluteAnnotation) annotations.push(absoluteAnnotation);
    }
    if (sensitiveClaims > 0 && sourceSignals === 0) {
      issues.push({
        severity: "warning",
        code: "sensitive_claims_without_sources",
        message:
          "Sensitive medical, legal, financial, or technical claims should be supported by sources or cautious wording.",
      });
      annotations.push({
        category: "facts",
        severity: "warning",
        marker: "note",
        paragraphId: "p001",
        title: "Sources are needed",
        shortMessage:
          "Sensitive claims appear without obvious source signals.",
        recommendation:
          "Add sources or use more cautious wording for medical, legal, finance, or technical claims.",
        confidence: 0.72,
        global: true,
      });
    }
    return {
      tool: "fact_distortion_check",
      summary: {
        risk,
        exactNumbers,
        absoluteClaims,
        sensitiveClaims,
        sourceSignals,
        method: "claim_risk_heuristic",
      },
      issues,
      recommendations: [
        "Verify exact numbers, named facts, and sensitive claims; soften statements that cannot be supported confidently.",
      ],
      annotations,
    };
  });

export const logicConsistencyCheckHandler = () =>
  runTextTool("logic_consistency_check", (context) => {
    const allSentences = sentences(context.text);
    const contradictionPairs = [
      ["всегда", "иногда"],
      ["никогда", "иногда"],
      ["невозможно", "можно"],
      ["обязательно", "не обязательно"],
      ["always", "sometimes"],
      ["never", "sometimes"],
      ["impossible", "can"],
      ["must", "optional"],
    ] as const;
    const lowerText = context.text.toLowerCase();
    const contradictionSignals = contradictionPairs.filter(
      ([left, right]) => lowerText.includes(left) && lowerText.includes(right),
    ).length;
    const causalityClaims = (
      context.text.match(/поэтому|из-за этого|следовательно|значит|because|therefore|as a result/giu) ?? []
    ).length;
    const unsupportedCausality = Math.max(
      0,
      causalityClaims -
        (context.text.match(/например|данн|исследован|потому что|example|data|study|because/giu) ?? [])
          .length,
    );
    const abruptTurns = (
      context.text.match(/однако|но при этом|с другой стороны|however|but at the same time/giu) ?? []
    ).length;
    const score = clampScore(
      94 - contradictionSignals * 18 - unsupportedCausality * 8 - Math.max(0, abruptTurns - allSentences.length / 6) * 4,
    );
    const issues: TextIssue[] = [];
    const annotations: TextAnnotation[] = [];
    if (contradictionSignals > 0) {
      issues.push({
        severity: "warning",
        code: "possible_internal_contradiction",
        message:
          "The text may contain statements that pull in opposite directions.",
      });
      annotations.push({
        category: "logic",
        severity: "warning",
        marker: "note",
        paragraphId: "p001",
        title: "Possible contradiction",
        shortMessage:
          "The text may contain claims that pull conclusions in different directions.",
        recommendation: "Check the argument chain before publishing.",
        confidence: 0.66,
        global: true,
      });
    }
    if (unsupportedCausality > 1) {
      issues.push({
        severity: "info",
        code: "unsupported_causality",
        message:
          "Some cause-and-effect transitions may need examples, evidence, or clearer intermediate steps.",
      });
      const causalityAnnotation = firstPatternAnnotation(
        context.text,
        /поэтому|из-за этого|следовательно|значит|because|therefore|as a result/iu,
        {
          category: "logic",
          severity: "info",
          marker: "underline",
          title: "Causality needs support",
          shortMessage:
            "This transition may need an example, evidence, or an intermediate explanation.",
          recommendation:
            "Add why this follows, not only that it follows.",
          confidence: 0.7,
        },
      );
      if (causalityAnnotation) annotations.push(causalityAnnotation);
    }
    return {
      tool: "logic_consistency_check",
      summary: {
        score,
        contradictionSignals,
        causalityClaims,
        unsupportedCausality,
        abruptTurns,
        method: "internal_logic_heuristic",
      },
      issues,
      recommendations: [
        "Check claims that use 'therefore', 'because', 'always', or 'never'; add missing intermediate reasoning where the conclusion jumps too quickly.",
      ],
      annotations,
    };
  });

export const aiHallucinationCheckHandler = () =>
  runTextTool("ai_hallucination_check", (context) => {
    const fabricatedCitationSignals = (
      context.text.match(/\[[^\]]*(?:нужен источник|citation needed|source needed|источник\?)[^\]]*\]/giu) ?? []
    ).length;
    const vagueAuthorities = (
      context.text.match(/эксперты считают|исследования показывают|многие специалисты|according to experts|studies show|researchers say/giu) ?? []
    ).length;
    const exactFacts = (
      context.text.match(/\b\d+(?:[.,]\d+)?\s?%|\b\d{4}\b|[A-ZА-ЯЁ][\p{L}]+(?:\s+[A-ZА-ЯЁ][\p{L}]+){1,3}/gu) ?? []
    ).length;
    const sourceSignals = (
      context.text.match(/https?:\/\/|\[[0-9]+\]|источник|исследован|study|source|doi\.org/giu) ?? []
    ).length;
    const aiArtifactSignals = (
      context.text.match(/как искусственный интеллект|я не могу подтвердить|as an ai|i cannot verify/giu) ?? []
    ).length;
    const hallucinationRisk = clampScore(
      fabricatedCitationSignals * 22 +
        vagueAuthorities * 12 +
        Math.max(0, exactFacts - sourceSignals * 2) * 4 +
        aiArtifactSignals * 12,
    );
    const aiInvolvementSignals = clampScore(
      aiArtifactSignals * 28 + vagueAuthorities * 8 + fabricatedCitationSignals * 18,
    );
    const issues: TextIssue[] = [];
    const annotations: TextAnnotation[] = [];
    if (hallucinationRisk >= 45) {
      issues.push({
        severity: "warning",
        code: "hallucination_risk",
        message:
          "The text contains signals that AI-generated factual details may need verification.",
      });
      annotations.push({
        category: "trust",
        severity: "warning",
        marker: "note",
        paragraphId: "p001",
        title: "Verification needed",
        shortMessage:
          "Factual details may need verification before publication.",
        confidence: 0.7,
        global: true,
      });
    }
    if (vagueAuthorities > 0) {
      issues.push({
        severity: "info",
        code: "vague_authorities",
        message:
          "Phrases like 'experts say' or 'studies show' should point to a concrete source.",
      });
      const authorityAnnotation = firstPatternAnnotation(
        context.text,
        /эксперты считают|исследования показывают|многие специалисты|according to experts|studies show|researchers say/iu,
        {
          category: "trust",
          severity: "info",
          marker: "underline",
          title: "Vague authority",
          shortMessage:
            "This source signal is too vague for a fact-sensitive claim.",
          recommendation: "Name the source or remove the vague authority.",
          confidence: 0.78,
        },
      );
      if (authorityAnnotation) annotations.push(authorityAnnotation);
    }
    return {
      tool: "ai_hallucination_check",
      summary: {
        hallucinationRisk,
        aiInvolvementSignals,
        fabricatedCitationSignals,
        vagueAuthorities,
        exactFacts,
        sourceSignals,
        method: "ai_claim_hallucination_heuristic",
      },
      issues,
      recommendations: [
        "Ask the model to list claims that need verification, then replace vague authorities with concrete sources or remove unsupported details.",
      ],
      annotations,
    };
  });

export const naturalnessIndicatorsHandler = () =>
  runTextTool("naturalness_indicators", (context) => {
    const overused = topRepeatedTerms(context.text, 5);
    const annotation = overused[0]
      ? firstPatternAnnotation(context.text, new RegExp(`\\b${escapeRegExp(overused[0])}\\b`, "iu"), {
          category: "naturalness",
          severity: "warning",
          marker: "underline",
          title: "Mechanical repetition",
          shortMessage:
            "This term repeats often enough that the rhythm may feel mechanical.",
          recommendation:
            "Vary nearby phrasing without replacing necessary terms everywhere.",
          confidence: 0.7,
        })
      : null;
    return {
      tool: "naturalness_indicators",
      summary: { repeatedTerms: overused },
      issues: overused.length
        ? [
            {
              severity: "warning",
              code: "repeated_terms",
              message: `Repeated terms may make the text feel mechanical: ${overused.join(", ")}.`,
            },
          ]
        : [],
      recommendations: [
        "Vary sentence openings and remove service phrases that do not add meaning.",
      ],
      annotations: annotation ? [annotation] : [],
    };
  });

export const intentSeoForecastHandler = () =>
  runTextTool("intent_seo_forecast", (context) => {
    const wordCount = words(context.text).length;
    const platform = resolveTextPlatform(context, wordCount);
    const intent = inferContentIntent(context.text);
    const title = titleFromText(context);
    const terms = meaningfulTerms(`${title} ${context.text}`, 14);
    const description = firstReadableSentence(context.text);
    const hookScore = estimateHookScore(context.text);
    const ctrPotential = estimateCtrPotential(context.text, title, intent);
    const trendPotential = clampScore(
      Math.round((hookScore + ctrPotential) / 2) +
        (/нов|тренд|ошибк|быстр|сравн|2026|guide|trend|mistake/iu.test(context.text)
          ? 8
          : 0),
    );
    const category = inferCategory(terms, intent);
    const primaryKeyword = terms[0] ?? title;
    const secondaryKeywords = terms.slice(1, 8);
    const tags = terms.slice(0, 10);
    const hookType = platformHookLabel(platform);
    const hookIdeas = [
      primaryKeyword
        ? `Начните с проблемы читателя: «Почему ${primaryKeyword} мешает получить результат?»`
        : "Начните с проблемы читателя, а не с общего вступления.",
      "Покажите обещание пользы в первой строке: что человек поймёт или сможет сделать после чтения.",
      "Если это пост или рилс, вынесите конфликт/боль в первые 1–2 секунды или первую строку.",
    ];
    const issues: TextIssue[] = [];
    if (ctrPotential < 60) {
      issues.push({
        severity: "warning",
        code: "low_ctr_potential",
        message:
          "The title and opening may not make the benefit clear enough for a search result or feed preview.",
      });
    }
    if (hookScore < 60) {
      issues.push({
        severity: "info",
        code: "weak_hook",
        message:
          "The opening hook can be stronger: make the reader's problem, conflict, or payoff visible earlier.",
      });
    }
    return {
      tool: "intent_seo_forecast",
      summary: {
        intent,
        intentLabel: humanIntentLabel(intent),
        platform,
        hookType,
        hookScore,
        ctrPotential,
        trendPotential,
        internetDemandAvailable: false,
        internetDemandSource:
          "Not connected yet. Future SERP/social API data can replace this local forecast.",
        seoPackage: {
          seoTitle: title,
          metaDescription: description,
          primaryKeyword,
          secondaryKeywords,
          keywords: terms,
          category,
          tags,
          slug: slugSuggestion(title, terms),
        },
        hookIdeas,
      },
      issues,
      recommendations: [
        "Use this as a local forecast only. For real demand and trend validation, connect SERP, Search Console, social analytics, or platform APIs later.",
        "For WordPress or Laravel CMS, use the suggested SEO title, meta description, primary keyword, category, tags, and slug as a starting package.",
      ],
      annotations: [
        {
          category: "intent",
          severity: ctrPotential < 60 ? "warning" : "info",
          marker: "note",
          paragraphId: "p001",
          title: "Intent and promotion forecast",
          shortMessage:
            ctrPotential < 60
              ? "The first screen may not explain the reader payoff strongly enough."
              : "The first screen has enough local signals for a useful preview.",
          recommendation:
            "Validate demand with external SERP or social analytics when those sources are connected.",
          confidence: 0.68,
          global: true,
        },
      ],
    };
  });

export const safetyScienceReviewHandler = () =>
  runTextTool("safety_science_review", (context) => {
    const text = context.text;
    const illegalIntentSignals = countMatches(
      text,
      /обойти закон|обойти правила|незаконн|взлом|фишинг|украсть|наркотик|оружи|самодельн.*взрыв|malware|phishing|steal|illegal|weapon|explosive/giu,
    );
    const platformEvasionSignals = countMatches(
      text,
      /обойти модерац|бан не получил|скрыть от модерац|нарушить правила|avoid moderation|bypass moderation|evade ban/giu,
    );
    const legalAdviceSignals = countMatches(
      text,
      /договор|иск|суд|штраф|налог|юрист|закон|лицензи|персональн(?:ые|ых|ыми|ым|ой|ая|ое|ую|ого|ому)?\s+данн|contract|lawsuit|tax|legal|license|privacy/giu,
    );
    const medicalSignals = countMatches(
      text,
      /диагноз|лечение|дозиров|препарат|таблет|болезн|симптом|противопоказ|врач|пациент|медицин|diabetes|medicine|dosage|treatment|symptom|contraindication|clinical/giu,
    );
    const investmentSignals = countMatches(
      text,
      /инвестиц|акци[ия]|облигац|ценн.*бумаг|доходност|дивиденд|портфель|брокер|фьючерс|опцион|крипт|купить.*акц|продать.*акц|investment|stock|bond|securities|yield|dividend|portfolio|broker|crypto|not financial advice/giu,
    );
    const technicalEngineeringSignals = countMatches(
      text,
      /черт[её]ж|конструкц|механизм|станок|виброгасител|расточ|подшипник|\bвал(?:а|у|ом|е|ы|ов|ам|ами|ах)?\b|допуск|посадк|прочност|сопромат|сборк|engineering|mechanism|bearing|shaft|tolerance|damper|vibration|assembly|stress/giu,
    );
    const scientificSignals = countMatches(
      text,
      /исследован|эксперимент|гипотез|метод|формул|уравнен|доказательств|выборк|статистик|p-value|correlation|equation|proof|dataset|experiment|study/giu,
    );
    const calculationSignals = countMatches(
      text,
      /\b\d+(?:[.,]\d+)?\s*(?:%|=|\+|-|×|x|\*|\/|кг|мг|г|км|мл|час|мин|kg|mg|km|ml)\b/giu,
    );
    const unsupportedScienceSignals = Math.max(
      0,
      scientificSignals -
        countMatches(text, /источник|doi|https?:\/\/|\[[0-9]+\]|таблиц|данн|source|dataset|methodology|appendix/giu),
    );
    const warningCount =
      illegalIntentSignals +
      platformEvasionSignals +
      (legalAdviceSignals > 0 ? 1 : 0) +
      (medicalSignals > 0 ? 1 : 0) +
      (investmentSignals > 0 ? 1 : 0) +
      (technicalEngineeringSignals > 0 ? 1 : 0) +
      (scientificSignals > 0 && unsupportedScienceSignals > 0 ? 1 : 0) +
      (calculationSignals > 3 ? 1 : 0) +
      (context.customPlatform.trim() || context.textPlatform === "custom" ? 1 : 0);
    const jurisdictionContext = inferJurisdictionContext(context);
    const externalVerificationNeeded =
      legalAdviceSignals > 0 ||
      medicalSignals > 0 ||
      investmentSignals > 0 ||
      technicalEngineeringSignals > 0 ||
      scientificSignals > 0 ||
      calculationSignals > 3 ||
      Boolean(context.customPlatform.trim()) ||
      context.textPlatform === "custom";
    const issues: TextIssue[] = [];
    const annotations: TextAnnotation[] = [];

    if (illegalIntentSignals > 0 || platformEvasionSignals > 0) {
      issues.push({
        severity: "critical",
        code: "unsafe_or_evasion_intent",
        message:
          "The text may encourage illegal activity, platform-rule evasion, or unsafe instructions.",
      });
      annotations.push(
        safetyScienceAnnotation(
          "safety",
          "critical",
          "Текст может выглядеть как попытка нарушить закон, правила платформы или дать опасные инструкции.",
          "Остановите публикацию и перепишите материал в безопасный, образовательный или профилактический формат.",
        ),
      );
    }

    if (legalAdviceSignals > 0) {
      issues.push({
        severity: "warning",
        code: "legal_review_needed",
        message:
          "The text contains legal-sensitive claims. It should not be presented as legal advice without review.",
      });
      annotations.push(
        safetyScienceAnnotation(
          "legal",
          "warning",
          "Есть юридически чувствительные формулировки.",
          "Добавьте дисклеймер, источники и ручную проверку специалистом; не выдавайте текст за юридическую консультацию.",
        ),
      );
    }

    if (medicalSignals > 0) {
      issues.push({
        severity: "warning",
        code: "medical_review_needed",
        message:
          "The text contains medical or health-sensitive claims. It should not replace clinician review or source verification.",
      });
      annotations.push(
        safetyScienceAnnotation(
          "medical",
          "warning",
          "Есть медицинские или health-sensitive утверждения.",
          "Добавьте источники, осторожные формулировки и ручную проверку специалистом; текст не должен выглядеть как персональная медицинская рекомендация.",
        ),
      );
    }

    if (investmentSignals > 0) {
      issues.push({
        severity: "warning",
        code: "investment_review_needed",
        message:
          "The text contains investment-sensitive claims. It should not be presented as personal investment advice.",
      });
      annotations.push(
        safetyScienceAnnotation(
          "investment",
          "warning",
          "Есть инвестиционно чувствительные формулировки.",
          "Добавьте оговорку, что материал не является индивидуальной инвестиционной рекомендацией, и проверьте требования юрисдикции и площадки публикации.",
        ),
      );
    }

    if (technicalEngineeringSignals > 0) {
      issues.push({
        severity: "warning",
        code: "technical_engineering_review_needed",
        message:
          "The text contains technical or engineering claims that may need expert verification, drawings, standards, or manufacturer documentation.",
      });
      annotations.push(
        safetyScienceAnnotation(
          "engineering",
          "warning",
          "Есть технические или конструкторские утверждения, где ошибка может быть критичной.",
          "Если ИИ не уверен в устройстве узла, стандарте, чертеже или расположении детали, отметьте это как гипотезу и проверьте по документации, чертежам или у инженера.",
        ),
      );
    }

    if (scientificSignals > 0 && unsupportedScienceSignals > 0) {
      issues.push({
        severity: "warning",
        code: "scientific_review_needed",
        message:
          "The text contains research or scientific-method claims that may need methodology, sources, or calculation review.",
      });
      annotations.push(
        safetyScienceAnnotation(
          "science",
          "warning",
          "Есть научные или методологические утверждения, которым нужна проверка.",
          "Проверьте метод, выборку, источники, расчёты и границы вывода. ИИ может ошибаться, поэтому финальная проверка должна быть ручной.",
        ),
      );
    }

    if (context.customPlatform.trim() || context.textPlatform === "custom") {
      issues.push({
        severity: "info",
        code: "custom_resource_rules_needed",
        message:
          "The publication resource is custom or user-defined, so platform-specific rules and available interactions should be checked separately.",
      });
      annotations.push(
        safetyScienceAnnotation(
          "source_context",
          "info",
          "Ресурс публикации задан пользователем или отличается от стандартных площадок.",
          "Проверьте правила площадки, формат реакции аудитории и доступные механики: комментарии, лайки, дизлайки, рейтинги, модерацию и ограничения тематики.",
        ),
      );
    }

    if (externalVerificationNeeded) {
      issues.push({
        severity: "info",
        code: "external_verification_needed",
        message:
          "External source, jurisdiction, platform, SERP, or analytics verification was not performed by this local text scan.",
      });
      annotations.push(
        safetyScienceAnnotation(
          "external_verification",
          "info",
          "Интернет-сверка и проверка внешних источников не выполнялись в этом локальном анализе.",
          "Для реальной проверки спроса, правил площадки, законов страны, источников, лайков/дизлайков и SERP подключите внешний источник: GSC, SERP API, соц-API, официальные документы или ручной research.",
        ),
      );
    }

    if (calculationSignals > 3) {
      issues.push({
        severity: "info",
        code: "calculation_review_needed",
        message:
          "The text contains several numeric or formula-like fragments; calculations may need a dedicated check.",
      });
      annotations.push(
        safetyScienceAnnotation(
          "calculation",
          "info",
          "В тексте есть несколько чисел или формул.",
          "Если вывод зависит от расчётов, добавьте отдельную проверку формул, единиц измерения и промежуточных шагов.",
        ),
      );
    }

    return {
      tool: "safety_science_review",
      summary: {
        warningCount,
        jurisdictionContext,
        externalSourcesUsed: false,
        externalVerificationNeeded,
        illegalIntentSignals,
        platformEvasionSignals,
        legalAdviceSignals,
        medicalSignals,
        investmentSignals,
        technicalEngineeringSignals,
        scientificSignals,
        calculationSignals,
        unsupportedScienceSignals,
        limitation:
          "Heuristic review only. It does not replace legal, safety, medical, investment, scientific, engineering, mathematical, jurisdiction, platform, or source verification.",
      },
      issues,
      recommendations: [
        "If the warning is critical, stop publication and rewrite the text into a safe educational or preventive format.",
        "For legal, medical, investment, technical, engineering, scientific, mathematical, or country-specific claims, use this as a risk flag and run expert or official-source review before publishing.",
        "If a custom publication resource is specified, verify that resource's rules and available engagement mechanics before treating the text as platform-ready.",
      ],
      annotations,
    };
  });
