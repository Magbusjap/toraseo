#!/usr/bin/env node
/**
 * ToraSEO MCP Server — entry point.
 *
 * Launches as a child process under Claude Desktop, communicates over
 * stdio JSON-RPC, and exposes tools that perform SEO analysis.
 *
 * Architecture:
 *   The actual analyzer logic lives in `@toraseo/core` — a sibling
 *   workspace shared with the desktop app. This file is now a pure
 *   transport: it imports the tool functions from core, registers them
 *   with the MCP SDK via `bridgeWrap`, and bridges stdio JSON-RPC to
 *   those functions.
 *
 *   `bridgeWrap` adds Bridge Mode behavior: each tool checks for an
 *   active scan in the shared state-file, writes "running" + result
 *   entries to it, and falls back to legacy chat-only mode when no
 *   scan is active. See `bridgeWrapper.ts` for details.
 *
 * Tool grouping (per `wiki/toraseo/product-modes.md`):
 *   Mode A — Site Audit:    scan_site_minimal, check_robots_txt,
 *                            analyze_meta, analyze_headings,
 *                            analyze_sitemap, check_redirects,
 *                            analyze_content, detect_stack
 *   Mode B — Content Audit: (none yet)
 *
 *   Plus the v0.0.7+ Bridge Mode handshake tool:
 *     verify_skill_loaded — required first call when an active
 *     ToraSEO scan is waiting; never called in standalone use.
 *
 * Mode A baseline is complete and now includes the first expansion
 * tool (`detect_stack`). Schema.org analysis is intentionally deferred
 * to post-MVP (see day-9 wiki for rationale).
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import {
  VERSION,
  scanSiteMinimal,
  scanSiteMinimalInputSchema,
  ScanSiteError,
  checkRobots,
  checkRobotsInputSchema,
  analyzeMeta,
  analyzeMetaInputSchema,
  AnalyzeMetaError,
  analyzeHeadings,
  analyzeHeadingsInputSchema,
  AnalyzeHeadingsError,
  analyzeSitemap,
  analyzeSitemapInputSchema,
  AnalyzeSitemapError,
  checkRedirects,
  checkRedirectsInputSchema,
  CheckRedirectsError,
  analyzeContent,
  analyzeContentInputSchema,
  AnalyzeContentError,
  detectStack,
  detectStackInputSchema,
  DetectStackError,
} from "@toraseo/core";

import { bridgeWrap } from "./bridgeWrapper.js";
import {
  verifySkillLoadedHandler,
  verifySkillLoadedInputSchema,
} from "./verifySkillLoaded.js";
import {
  verifyCodexWorkflowLoadedHandler,
  verifyCodexWorkflowLoadedInputSchema,
} from "./verifyCodexWorkflowLoaded.js";
import {
  emptyInputSchema,
  detectTextPlatformHandler,
  analyzeTextStructureHandler,
  analyzeTextStyleHandler,
  analyzeToneFitHandler,
  languageAudienceFitHandler,
  mediaPlaceholderReviewHandler,
  articleUniquenessHandler,
  languageSyntaxHandler,
  aiWritingProbabilityHandler,
  naturalnessIndicatorsHandler,
  intentSeoForecastHandler,
  safetyScienceReviewHandler,
  articleRewriteContextHandler,
  factDistortionCheckHandler,
  logicConsistencyCheckHandler,
  aiHallucinationCheckHandler,
} from "./textAnalysisTools.js";
import {
  articleCompareInternalHandler,
  compareIntentGapHandler,
  compareArticleStructureHandler,
  compareContentGapHandler,
  compareSemanticGapHandler,
  compareSpecificityGapHandler,
  compareTrustGapHandler,
  compareArticleStyleHandler,
  similarityRiskHandler,
  compareTitleCtrHandler,
  comparePlatformFitHandler,
  compareStrengthsWeaknessesHandler,
  compareImprovementPlanHandler,
} from "./articleCompareTools.js";

// --- Server setup ---------------------------------------------------------

const server = new McpServer({
  name: "toraseo-mcp",
  version: VERSION,
});

// --- Bridge Mode handshake tool -------------------------------------------

server.registerTool(
  "verify_skill_loaded",
  {
    title: "Verify Claude Bridge Instructions Loaded (Bridge Mode handshake)",
    description:
      "Required first call when the user has an active ToraSEO scan " +
      "waiting (i.e. they clicked 'Scan' in the desktop app). Confirms " +
      "that Claude Bridge Instructions are loaded with a compatible protocol version. The " +
      "response includes the scan parameters (URL and selected tools) " +
      "so Claude can proceed without those fields being explicitly in " +
      "the prompt. " +
      "If no scan is waiting, the call returns ok=false with " +
      "error=no_active_scan and Claude can ignore it. " +
      "When the user mentions ToraSEO and a URL together, ALWAYS call " +
      "this first before any analysis tools. SKILL.md contains the " +
      "exact token to pass.",
    inputSchema: verifySkillLoadedInputSchema,
  },
  verifySkillLoadedHandler,
);

server.registerTool(
  "verify_codex_workflow_loaded",
  {
    title: "Verify Codex Workflow Loaded (Bridge Mode handshake)",
    description:
      "Required first call when the user has an active ToraSEO Codex " +
      "bridge scan waiting, and also required when the user manually asks " +
      "whether Codex can see/access ToraSEO, ToraSEO MCP, the ToraSEO " +
      "SKILL, or Codex Workflow Instructions. Confirms that Codex can " +
      "reach the ToraSEO MCP server and that the Codex Workflow Instructions are loaded " +
      "with a compatible protocol token. The prompt never contains the " +
      "token; the Codex Workflow Instructions package contains the exact " +
      "token to pass. If the response is token_mismatch, do not ask the " +
      "user to reveal or paste a token; tell them to update or reinstall " +
      "the ToraSEO Codex Workflow Instructions package and restart Codex.",
    inputSchema: verifyCodexWorkflowLoadedInputSchema,
  },
  verifyCodexWorkflowLoadedHandler,
);

// --- Tools: Mode A (Site Audit) ------------------------------------------
//
// Each tool is wrapped via `bridgeWrap`, which transparently:
//   - writes "running" → state-file when an active scan exists
//   - calls the core function with the user's input
//   - on success: writes complete entry with verdict + summary, returns
//     a brief summary to Claude (or full JSON in legacy mode)
//   - on error: writes error entry to state-file, returns formatted
//     error string to Claude
//
// The wrapper handles all the try/catch + JSON formatting that used
// to live in each handler inline. See bridgeWrapper.ts.

server.registerTool(
  "scan_site_minimal",
  {
    title: "Scan Site (Minimal)",
    description:
      "Fetches a single URL and returns five basic SEO signals: " +
      "final URL after redirects, HTTP status, page title, first H1, " +
      "meta description, and response time in milliseconds. " +
      "Honors robots.txt (refuses scan if disallowed) and enforces a " +
      "minimum 2-second interval between requests to the same host. " +
      "Use this for a quick check of a single page.",
    inputSchema: scanSiteMinimalInputSchema,
  },
  bridgeWrap("scan_site_minimal", scanSiteMinimal, ScanSiteError),
);

server.registerTool(
  "check_robots_txt",
  {
    title: "Check robots.txt",
    description:
      "Checks whether ToraSEO is permitted to scan a given URL according " +
      "to the site's robots.txt file (RFC 9309). Returns the verdict, the " +
      "reason for it, and any Crawl-delay the site has set for our " +
      "User-Agent. Use this when the user wants to know if a scan WILL be " +
      "allowed before launching one, or to inspect a site's crawler policy.",
    inputSchema: checkRobotsInputSchema,
  },
  bridgeWrap("check_robots_txt", checkRobots, null),
);

server.registerTool(
  "analyze_meta",
  {
    title: "Analyze Meta Tags",
    description:
      "Audits a single page's meta tags across four blocks: basic SEO " +
      "(title, description, robots, canonical), Open Graph (title, " +
      "description, image, url, type), Twitter Cards (with OG fallback " +
      "detection), and page-level technical tags (charset, viewport, " +
      "html lang). Returns raw values plus a list of severity-tagged " +
      "verdicts (critical / warning / info) ready to display. " +
      "Honors robots.txt and rate limits. " +
      "Use this when the user wants a meta-tag audit of a specific page.",
    inputSchema: analyzeMetaInputSchema,
  },
  bridgeWrap("analyze_meta", analyzeMeta, AnalyzeMetaError),
);

server.registerTool(
  "analyze_headings",
  {
    title: "Analyze Heading Structure",
    description:
      "Walks every <h1>..<h6> on a page in document order and reports " +
      "structural issues: missing h1, multiple h1, empty headings, " +
      "level skips (e.g. h1 → h3 bypassing h2), and h1 length anomalies. " +
      "Returns the full heading list, an aggregate summary (per-level " +
      "counts, h1 count, skip count), and a list of severity-tagged " +
      "verdicts (critical / warning / info). " +
      "Honors robots.txt and rate limits. " +
      "Use this when the user wants to audit a page's outline / heading " +
      "hierarchy.",
    inputSchema: analyzeHeadingsInputSchema,
  },
  bridgeWrap("analyze_headings", analyzeHeadings, AnalyzeHeadingsError),
);

server.registerTool(
  "analyze_sitemap",
  {
    title: "Analyze Sitemap",
    description:
      "Discovers and analyzes the sitemap for the given URL's origin. " +
      "Discovery first reads robots.txt for `Sitemap:` directives " +
      "(RFC 9309 §2.6); if none are declared, falls back to probing " +
      "<origin>/sitemap.xml. Parses the result as either a <urlset> " +
      "(regular sitemap) or <sitemapindex>, and reports structural " +
      "issues: missing sitemap, invalid XML, empty file, oversize " +
      "(>50k entries), missing <lastmod>, host mismatches in entries, " +
      "empty index. Returns the top-level kind, an aggregate summary, " +
      "and the first 20 entries as a sample (full lists of 50k+ URLs " +
      "would not fit in a tool-call response). For sitemap indexes, " +
      "does NOT recursively follow children — it lists them so the user " +
      "can decide which to inspect next. Honors per-host rate limits.",
    inputSchema: analyzeSitemapInputSchema,
  },
  bridgeWrap("analyze_sitemap", analyzeSitemap, AnalyzeSitemapError),
);

server.registerTool(
  "check_redirects",
  {
    title: "Check Redirects",
    description:
      "Walks the HTTP redirect chain starting at the given URL, one " +
      "step at a time, using HEAD requests (with GET fallback if the " +
      "server returns 405/501). Returns the full chain as an ordered " +
      "list of steps — each with URL, status, Location header, and " +
      "method used — plus severity-tagged verdicts: redirect loops, " +
      "broken redirects (3xx without Location), terminal failures " +
      "(chain ending in 4xx/5xx), HTTPS→HTTP downgrades, chains over " +
      "the SEO recommendation of 2 hops, relative Location headers, " +
      "and the no-redirect happy case. Caps at 10 hops and detects " +
      "loops via URL set membership. Honors robots.txt at the entry " +
      "point and per-host rate limits at every step.",
    inputSchema: checkRedirectsInputSchema,
  },
  bridgeWrap("check_redirects", checkRedirects, CheckRedirectsError),
);

server.registerTool(
  "analyze_content",
  {
    title: "Analyze Page Content",
    description:
      "Identifies the main content of a page using a semantic cascade " +
      "(<article> if present, otherwise <main>, otherwise <body> with " +
      "<header>/<nav>/<footer>/<aside> stripped). Reports word count, " +
      "character count, sentence count, paragraph count, average words " +
      "per sentence, text-to-code ratio over the whole document, plus " +
      "inventories of internal/external/invalid links and images with/" +
      "without alt text. Surfaces severity-tagged verdicts: thin or " +
      "borderline content (Yoast thresholds 300/600 words), low or " +
      "very-low text-to-code ratio (10% / 3% thresholds), missing " +
      "paragraphs on text-heavy pages, many external links, no internal " +
      "links on substantial content, missing alts on the majority or " +
      "all images. Honors robots.txt and per-host rate limits.",
    inputSchema: analyzeContentInputSchema,
  },
  bridgeWrap("analyze_content", analyzeContent, AnalyzeContentError),
);

server.registerTool(
  "detect_stack",
  {
    title: "Detect Public Technology Stack",
    description:
      "Detects public technology-stack signals from one HTML page and " +
      "response headers: likely CMS, builder, ecommerce platform, " +
      "framework, SEO plugins, analytics, tag managers, CDN, server, " +
      "and language/runtime hints. Returns evidence-backed detections " +
      "with confidence levels and severity-tagged informational issues. " +
      "This tool does not scan admin paths, ports, private endpoints, or " +
      "claim vulnerabilities. Use it to make recommendations more " +
      "platform-aware after the classic site audit tools run.",
    inputSchema: detectStackInputSchema,
  },
  bridgeWrap("detect_stack", detectStack, DetectStackError),
);

// --- Tools: Content/Text analysis ----------------------------------------

server.registerTool(
  "detect_text_platform",
  {
    title: "Detect Text Platform",
    description:
      "Analyzes the active ToraSEO article_text context or compares Text A/B platform signals in an article_compare bridge run.",
    inputSchema: emptyInputSchema,
  },
  detectTextPlatformHandler,
);

server.registerTool(
  "analyze_text_structure",
  {
    title: "Analyze Text Structure",
    description:
      "Analyzes article structure, headings, paragraphs, and thin-content risk for article_text, or compares those signals for Text A/B in article_compare.",
    inputSchema: emptyInputSchema,
  },
  analyzeTextStructureHandler,
);

server.registerTool(
  "analyze_text_style",
  {
    title: "Analyze Text Style",
    description:
      "Analyzes sentence length, directness, and mechanical phrasing for article_text, or compares those signals for Text A/B in article_compare.",
    inputSchema: emptyInputSchema,
  },
  analyzeTextStyleHandler,
);

server.registerTool(
  "analyze_tone_fit",
  {
    title: "Analyze Tone Fit",
    description:
      "Reviews whether tone fits the topic risk and platform for article_text, or compares tone fit for Text A/B in article_compare.",
    inputSchema: emptyInputSchema,
  },
  analyzeToneFitHandler,
);

server.registerTool(
  "language_audience_fit",
  {
    title: "Language and Audience Fit",
    description:
      "Reviews language and audience fit for article_text, or compares audience readability for Text A/B in article_compare.",
    inputSchema: emptyInputSchema,
  },
  languageAudienceFitHandler,
);

server.registerTool(
  "media_placeholder_review",
  {
    title: "Media Placeholder Review",
    description:
      "Checks image/video/audio placeholder placement for article_text, or compares media planning for Text A/B in article_compare.",
    inputSchema: emptyInputSchema,
  },
  mediaPlaceholderReviewHandler,
);

server.registerTool(
  "article_uniqueness",
  {
    title: "Article Uniqueness",
    description:
      "Built-in text check. Estimates local uniqueness/repetition for article_text, or exact phrase overlap between Text A/B in article_compare. This is not an internet plagiarism check.",
    inputSchema: emptyInputSchema,
  },
  articleUniquenessHandler,
);

server.registerTool(
  "language_syntax",
  {
    title: "Language Syntax",
    description:
      "Built-in text check. Reviews syntax, punctuation, and sentence boundary risks for article_text, or compares local syntax signals for Text A/B in article_compare.",
    inputSchema: emptyInputSchema,
  },
  languageSyntaxHandler,
);

server.registerTool(
  "ai_writing_probability",
  {
    title: "AI Writing Probability",
    description:
      "Built-in text check. Estimates AI-style signals for article_text, or compares AI-style signals for Text A/B in article_compare.",
    inputSchema: emptyInputSchema,
  },
  aiWritingProbabilityHandler,
);

server.registerTool(
  "fact_distortion_check",
  {
    title: "Fact Distortion Check",
    description:
      "Optional text check. Flags fact-sensitive claims for article_text, or compares fact-sensitive signals for Text A/B in article_compare.",
    inputSchema: emptyInputSchema,
  },
  factDistortionCheckHandler,
);

server.registerTool(
  "logic_consistency_check",
  {
    title: "Logic Consistency Check",
    description:
      "Built-in text check. Reviews logical transitions for article_text, or compares local logic-risk signals for Text A/B in article_compare.",
    inputSchema: emptyInputSchema,
  },
  logicConsistencyCheckHandler,
);

server.registerTool(
  "ai_hallucination_check",
  {
    title: "AI Hallucination Check",
    description:
      "Optional text check. Reviews vague authorities and unverifiable detail signals for article_text, or compares those risks for Text A/B in article_compare.",
    inputSchema: emptyInputSchema,
  },
  aiHallucinationCheckHandler,
);

server.registerTool(
  "naturalness_indicators",
  {
    title: "Naturalness Indicators",
    description:
      "Checks repetition and mechanical phrasing indicators for article_text, or compares naturalness signals for Text A/B in article_compare.",
    inputSchema: emptyInputSchema,
  },
  naturalnessIndicatorsHandler,
);

server.registerTool(
  "intent_seo_forecast",
  {
    title: "Intent and SEO Forecast",
    description:
      "Built-in text check. Builds a local intent forecast for article_text, or compares intent/title signals for Text A/B in article_compare. It does not fetch live SERP or social trend data.",
    inputSchema: emptyInputSchema,
  },
  intentSeoForecastHandler,
);

server.registerTool(
  "safety_science_review",
  {
    title: "Safety, Legal and Science Review",
    description:
      "Built-in text check. Flags safety/legal/science risk for article_text, or compares those boundaries for Text A/B in article_compare. This does not replace expert review.",
    inputSchema: emptyInputSchema,
  },
  safetyScienceReviewHandler,
);

server.registerTool(
  "article_rewrite_context",
  {
    title: "Article Rewrite Context",
    description:
      "Use only after the user explicitly asks to rewrite, improve, or draft the active article_text analysis. Reads the cached ToraSEO article input and completed tool results through MCP, so the assistant must write the rewritten article in chat and must not ask the user to paste the article or try to read input.md directly.",
    inputSchema: emptyInputSchema,
  },
  articleRewriteContextHandler,
);

// --- Tools: Article comparison -------------------------------------------

server.registerTool(
  "article_compare_internal",
  {
    title: "Внутренний пакет сравнения текстов",
    description:
      "Runs the full internal ToraSEO A/B text comparison package in one MCP call and writes all structured comparison results into the active article_compare state.",
    inputSchema: emptyInputSchema,
  },
  articleCompareInternalHandler,
);

server.registerTool(
  "compare_intent_gap",
  {
    title: "Сравнение интента",
    description:
      "Compares whether Text A and Text B appear to answer the same user intent in the active ToraSEO article_compare context.",
    inputSchema: emptyInputSchema,
  },
  compareIntentGapHandler,
);

server.registerTool(
  "compare_article_structure",
  {
    title: "Сравнение структуры",
    description:
      "Compares headings, paragraph structure, lists, and visible reader path for the active ToraSEO article_compare context.",
    inputSchema: emptyInputSchema,
  },
  compareArticleStructureHandler,
);

server.registerTool(
  "compare_content_gap",
  {
    title: "Разрывы по содержанию",
    description:
      "Finds local topic terms present in one text and missing from the other for the active ToraSEO article_compare context.",
    inputSchema: emptyInputSchema,
  },
  compareContentGapHandler,
);

server.registerTool(
  "compare_semantic_gap",
  {
    title: "Смысловое покрытие",
    description:
      "Compares entity and concept coverage between Text A and Text B in the active ToraSEO article_compare context.",
    inputSchema: emptyInputSchema,
  },
  compareSemanticGapHandler,
);

server.registerTool(
  "compare_specificity_gap",
  {
    title: "Сравнение конкретики",
    description:
      "Compares concrete examples, numbers, questions, and list/step signals in the active ToraSEO article_compare context.",
    inputSchema: emptyInputSchema,
  },
  compareSpecificityGapHandler,
);

server.registerTool(
  "compare_trust_gap",
  {
    title: "Сравнение доверия",
    description:
      "Compares local trust signals, caveats, sources, and sensitive-claim indicators in the active ToraSEO article_compare context.",
    inputSchema: emptyInputSchema,
  },
  compareTrustGapHandler,
);

server.registerTool(
  "compare_article_style",
  {
    title: "Сравнение стиля",
    description:
      "Compares sentence rhythm, readability, and style distance for the active ToraSEO article_compare context.",
    inputSchema: emptyInputSchema,
  },
  compareArticleStyleHandler,
);

server.registerTool(
  "similarity_risk",
  {
    title: "Риск похожести",
    description:
      "Estimates local exact phrase overlap and copying risk between Text A and Text B. This is not an external plagiarism database check.",
    inputSchema: emptyInputSchema,
  },
  similarityRiskHandler,
);

server.registerTool(
  "compare_title_ctr",
  {
    title: "Заголовок и клик",
    description:
      "Compares headline/title clarity, promise, and local click-potential signals for the active ToraSEO article_compare context.",
    inputSchema: emptyInputSchema,
  },
  compareTitleCtrHandler,
);

server.registerTool(
  "compare_platform_fit",
  {
    title: "Сравнение под платформу",
    description:
      "Compares which text better fits the selected platform or resource in the active ToraSEO article_compare context.",
    inputSchema: emptyInputSchema,
  },
  comparePlatformFitHandler,
);

server.registerTool(
  "compare_strengths_weaknesses",
  {
    title: "Сильные и слабые стороны",
    description:
      "Summarizes side-by-side strengths and weaknesses for Text A and Text B in the active ToraSEO article_compare context.",
    inputSchema: emptyInputSchema,
  },
  compareStrengthsWeaknessesHandler,
);

server.registerTool(
  "compare_improvement_plan",
  {
    title: "Что улучшить дальше",
    description:
      "Builds a text-only improvement plan from comparison evidence without copying the other text.",
    inputSchema: emptyInputSchema,
  },
  compareImprovementPlanHandler,
);

// --- Transport & startup --------------------------------------------------

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write("ToraSEO MCP server started on stdio.\n");
}

main().catch((error: unknown) => {
  process.stderr.write(
    `Fatal error in ToraSEO MCP server: ${
      error instanceof Error ? error.message : String(error)
    }\n`,
  );
  process.exit(1);
});
