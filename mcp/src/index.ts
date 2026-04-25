#!/usr/bin/env node
/**
 * ToraSEO MCP Server — entry point.
 *
 * Launches as a child process under Claude Desktop, communicates over
 * stdio JSON-RPC, and exposes tools that perform SEO analysis.
 *
 * Day 3 scope: a single tool — `scan_site_minimal` — that fetches one
 * URL and returns five SEO signals (title, h1, meta description,
 * status, response time). Real crawler infrastructure (robots.txt,
 * rate limiter, three-tier modes) lands on Day 4.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import {
  scanSiteMinimal,
  scanSiteMinimalInputSchema,
  ScanSiteError,
} from "./tools/scan-site.js";

// --- Server setup ---------------------------------------------------------

const server = new McpServer({
  name: "toraseo-mcp",
  version: "0.0.1",
});

// --- Tools ----------------------------------------------------------------

server.registerTool(
  "scan_site_minimal",
  {
    title: "Scan Site (Minimal)",
    description:
      "Fetches a single URL and returns five basic SEO signals: " +
      "final URL after redirects, HTTP status, page title, first H1, " +
      "meta description, and response time in milliseconds. " +
      "Use this for a quick check of a single page. Does not crawl, " +
      "does not follow links, does not read robots.txt yet.",
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
