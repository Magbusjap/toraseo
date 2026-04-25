/**
 * analyze_headings — MCP tool wrapper.
 *
 * Thin adapter on top of `analyzers/site/headings.ts`. Validates the
 * input URL with zod, delegates the work, and packages the result for
 * the MCP layer. No business logic lives here.
 *
 * Lives in `tools/site/` (Mode A — URL-based audits). Sibling tools
 * `scan_site_minimal` and `check_robots_txt` will move into this folder
 * during the refactor that follows this commit.
 */

import { z } from "zod";

import {
  analyzeHeadings,
  AnalyzeHeadingsError,
} from "../../analyzers/site/headings.js";

// --- Input schema --------------------------------------------------------

export const analyzeHeadingsInputSchema = {
  url: z
    .string()
    .url()
    .refine(
      (value) => {
        try {
          const parsed = new URL(value);
          return parsed.protocol === "http:" || parsed.protocol === "https:";
        } catch {
          return false;
        }
      },
      { message: "URL must use http:// or https:// protocol" },
    )
    .describe(
      "The full URL whose heading structure should be analyzed " +
        "(must include http:// or https://)",
    ),
};

// --- Re-export for the MCP handler in index.ts ---------------------------

export { analyzeHeadings, AnalyzeHeadingsError };
