#!/usr/bin/env node
/**
 * ToraSEO MCP Server — entry point.
 *
 * This file is the executable that Claude Desktop launches as a child
 * process. Communication happens over stdio (stdin/stdout) using the
 * MCP JSON-RPC protocol.
 *
 * Day 2 scope: a single zero-argument tool that returns a static string.
 * The goal is to prove the architecture works end-to-end:
 *   Claude Desktop ← stdio → this server → response back to Claude.
 *
 * Real SEO tools (scan_site, check_robots_txt, etc.) will be added on
 * Day 3 and beyond.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

// --- Server setup ---------------------------------------------------------

const server = new McpServer({
  name: "toraseo-mcp",
  version: "0.0.1",
});

// --- Tools ----------------------------------------------------------------

/**
 * `hello` tool — proof of life.
 *
 * Takes no arguments. Returns a fixed string identifying the server.
 * Will be removed once real SEO tools land.
 */
server.registerTool(
  "hello",
  {
    title: "ToraSEO Hello",
    description:
      "Returns a greeting from the ToraSEO MCP server. Use this to verify " +
      "the server is connected and reachable. Takes no arguments.",
  },
  async () => {
    return {
      content: [
        {
          type: "text",
          text: "🐯 Hello from ToraSEO MCP server v0.0.1. Connection works.",
        },
      ],
    };
  },
);

// --- Transport & startup --------------------------------------------------

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Note: do NOT write anything to stdout here. stdout is reserved for
  // MCP protocol messages. Diagnostic output goes to stderr only.
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
