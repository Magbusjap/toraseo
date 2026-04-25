/**
 * analyze_meta — MCP tool wrapper.
 *
 * Thin adapter on top of `analyzers/site/meta.ts`. Validates the input
 * URL with zod, delegates the work, and packages the result for the
 * MCP layer. No business logic lives here.
 *
 * Lives in `tools/site/` (Mode A — URL-based audits). Sibling tools
 * `scan_site_minimal` and `check_robots_txt` will move into this folder
 * during the next refactor; for now they remain in the flat `tools/`.
 */

import { z } from "zod";

import { analyzeMeta, AnalyzeMetaError } from "../../analyzers/site/meta.js";

// --- Input schema --------------------------------------------------------

export const analyzeMetaInputSchema = {
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
      "The full URL to analyze (must include http:// or https://)",
    ),
};

// --- Re-export for the MCP handler in index.ts ---------------------------

export { analyzeMeta, AnalyzeMetaError };
