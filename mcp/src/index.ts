#!/usr/bin/env node
/**
 * ToraSEO MCP Server — entry point.
 *
 * Launches as a child process under Claude Desktop, communicates over
 * stdio JSON-RPC, and exposes tools that perform SEO analysis.
 *
 * Day 5 scope: three tools.
 *   - `scan_site_minimal`     — fetch a single URL with full crawler
 *                               etiquette (robots.txt + rate limit).
 *   - `check_robots_txt`      — check whether ToraSEO is allowed to
 *                               scan a URL, without actually scanning.
 *   - `analyze_meta`          — extract title/description/OG/Twitter/
 *                               canonical/charset/viewport with
 *                               severity-tagged verdicts.
 *
 * Tool grouping (per `wiki/toraseo/product-modes.md`):
 *   Mode A — Site Audit:    scan_site_minimal, check_robots_txt, analyze_meta
 *   Mode B — Content Audit: (none yet)
 *
 * The next big addition (Day 6+) is one of: analyze_headings,
 * analyze_schema, analyze_sitemap.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import {
  scanSiteMinimal,
  scanSiteMinimalInputSchema,
  ScanSiteError,
} from "./tools/scan-site.js";
import {
  checkRobots,
  checkRobotsInputSchema,
} from "./tools/check-robots.js";
import {
  analyzeMeta,
  analyzeMetaInputSchema,
  AnalyzeMetaError,
} from "./tools/site/analyze-meta.js";

// --- Server setup ---------------------------------------------------------

const server = new McpServer({
  name: "toraseo-mcp",
  version: "0.0.1",
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
