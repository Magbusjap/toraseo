import { z } from "zod";

import { analyzeCanonical } from "../../analyzers/site/derived.js";

export const analyzeCanonicalInputSchema = {
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
    .describe("The full URL to analyze (must include http:// or https://)"),
};

export { analyzeCanonical };
