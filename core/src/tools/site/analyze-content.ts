/**
 * analyze_content — MCP tool wrapper.
 *
 * Thin adapter on top of `analyzers/site/content.ts`. Validates the
 * input URL with zod, delegates the work, and packages the result
 * for the MCP layer. No business logic lives here.
 */

import { z } from "zod";

import {
  analyzeContent,
  AnalyzeContentError,
} from "../../analyzers/site/content.js";

// --- Input schema --------------------------------------------------------

export const analyzeContentInputSchema = {
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
      "The full URL whose content should be analyzed " +
        "(must include http:// or https://)",
    ),
};

// --- Re-export for the MCP handler in index.ts ---------------------------

export { analyzeContent, AnalyzeContentError };
