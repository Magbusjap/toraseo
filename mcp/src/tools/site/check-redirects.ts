/**
 * check_redirects — MCP tool wrapper.
 *
 * Thin adapter on top of `analyzers/site/redirects.ts`. Validates the
 * input URL with zod, delegates the work, and packages the result for
 * the MCP layer. No business logic lives here.
 *
 * Naming note: this file is `check-redirects.ts` (matching the tool
 * name `check_redirects`), parallel to the existing `check-robots.ts`.
 * It does NOT shadow the latter — different file, different folder
 * concerns aside (both live in `tools/site/` now).
 */

import { z } from "zod";

import {
  checkRedirects,
  CheckRedirectsError,
} from "../../analyzers/site/redirects.js";

// --- Input schema --------------------------------------------------------

export const checkRedirectsInputSchema = {
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
      "The full URL whose redirect chain should be walked " +
        "(must include http:// or https://)",
    ),
};

// --- Re-export for the MCP handler in index.ts ---------------------------

export { checkRedirects, CheckRedirectsError };
