/**
 * check_robots_txt — MCP tool wrapper.
 *
 * Thin adapter on top of the `crawlers/robots-txt` module. Validates
 * the input URL with zod, delegates the work, and packages the result
 * for the MCP layer. No business logic lives here.
 *
 * Day 6 placement:
 *   Moved from flat `tools/check-robots.ts` to `tools/site/check-robots.ts`
 *   alongside `scan-site.ts`, `analyze-meta.ts`, and `analyze-headings.ts`.
 *   No logic changes; only relative-import depth changed (`../` → `../../`).
 *
 * When to use this tool: the user wants to know whether a particular
 * URL is permitted for ToraSEO to scan, without actually scanning it.
 * Example questions Claude might handle with it:
 *   - "Will ToraSEO be allowed to audit example.com?"
 *   - "Does the site set a Crawl-delay?"
 */

import { z } from "zod";

import { checkRobots } from "../../crawlers/robots-txt.js";

// --- Input schema --------------------------------------------------------

export const checkRobotsInputSchema = {
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
      "The full URL to check against robots.txt rules (must include http:// or https://)",
    ),
};

// --- Re-export the implementation for the index.ts handler --------------

export { checkRobots };
