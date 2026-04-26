#!/usr/bin/env node
/**
 * ToraSEO MCP Server — entry point.
 *
 * Launches as a child process under Claude Desktop, communicates over
 * stdio JSON-RPC, and exposes tools that perform SEO analysis.
 *
 * Architecture (post-Stage-4 refactor):
 *   The actual analyzer logic lives in `@toraseo/core` — a sibling
 *   workspace shared with the desktop app. This file is now a pure
 *   transport: it imports the tool functions from core, registers them
 *   with the MCP SDK, and bridges stdio JSON-RPC to those functions.
 *   No business logic lives here.
 *
 * Tool grouping (per `wiki/toraseo/product-modes.md`):
 *   Mode A — Site Audit:    scan_site_minimal, check_robots_txt,
 *                            analyze_meta, analyze_headings,
 *                            analyze_sitemap, check_redirects,
 *                            analyze_content
 *   Mode B — Content Audit: (none yet)
 *
 * Mode A MVP is complete (7 of 7 standard checks per
 * product-modes.md). Schema.org analysis is intentionally deferred
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
} from "@toraseo/core";

// --- Server setup ---------------------------------------------------------

const server = new McpServer({
  name: "toraseo-mcp",
  version: VERSION,
});

// --- Tools: Mode A (Site Audit) ------------------------------------------

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
  async ({ url }) => {
    try {
      const result = await scanSiteMinimal(url);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error: unknown) {
      const errorText =
        error instanceof ScanSiteError
          ? `[${error.code}] ${error.message}`
          : `[unexpected] ${
              error instanceof Error ? error.message : String(error)
            }`;
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: errorText,
          },
        ],
      };
    }
  },
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
  async ({ url }) => {
    try {
      const result = await checkRobots(url);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error: unknown) {
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: `[unexpected] ${
              error instanceof Error ? error.message : String(error)
            }`,
          },
        ],
      };
    }
  },
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
  async ({ url }) => {
    try {
      const result = await analyzeMeta(url);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error: unknown) {
      const errorText =
        error instanceof AnalyzeMetaError
          ? `[${error.code}] ${error.message}`
          : `[unexpected] ${
              error instanceof Error ? error.message : String(error)
            }`;
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: errorText,
          },
        ],
      };
    }
  },
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
  async ({ url }) => {
    try {
      const result = await analyzeHeadings(url);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error: unknown) {
      const errorText =
        error instanceof AnalyzeHeadingsError
          ? `[${error.code}] ${error.message}`
          : `[unexpected] ${
              error instanceof Error ? error.message : String(error)
            }`;
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: errorText,
          },
        ],
      };
    }
  },
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
  async ({ url }) => {
    try {
      const result = await analyzeSitemap(url);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error: unknown) {
      const errorText =
        error instanceof AnalyzeSitemapError
          ? `[${error.code}] ${error.message}`
          : `[unexpected] ${
              error instanceof Error ? error.message : String(error)
            }`;
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: errorText,
          },
        ],
      };
    }
  },
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
  async ({ url }) => {
    try {
      const result = await checkRedirects(url);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error: unknown) {
      const errorText =
        error instanceof CheckRedirectsError
          ? `[${error.code}] ${error.message}`
          : `[unexpected] ${
              error instanceof Error ? error.message : String(error)
            }`;
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: errorText,
          },
        ],
      };
    }
  },
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
  async ({ url }) => {
    try {
      const result = await analyzeContent(url);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error: unknown) {
      const errorText =
        error instanceof AnalyzeContentError
          ? `[${error.code}] ${error.message}`
          : `[unexpected] ${
              error instanceof Error ? error.message : String(error)
            }`;
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: errorText,
          },
        ],
      };
    }
  },
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
