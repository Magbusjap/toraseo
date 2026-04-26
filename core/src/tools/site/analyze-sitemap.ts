/**
 * analyze_sitemap — MCP tool wrapper.
 *
 * Thin adapter on top of `analyzers/site/sitemap.ts`. Validates the
 * input URL with zod, delegates the work, and packages the result for
 * the MCP layer. No business logic lives here.
 *
 * The input URL can be any URL on the target site — a page, the
 * homepage, or even a deep link. The analyzer always derives the
 * origin from it and looks for the sitemap there.
 */

import { z } from "zod";

import {
  analyzeSitemap,
  AnalyzeSitemapError,
} from "../../analyzers/site/sitemap.js";

// --- Input schema --------------------------------------------------------

export const analyzeSitemapInputSchema = {
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
      "Any URL on the target site (must include http:// or https://). " +
        "The tool derives the origin and discovers the sitemap from there.",
    ),
};

// --- Re-export for the MCP handler in index.ts ---------------------------

export { analyzeSitemap, AnalyzeSitemapError };
