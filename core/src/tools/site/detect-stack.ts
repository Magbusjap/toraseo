/**
 * detect_stack — MCP tool wrapper.
 *
 * Thin adapter on top of `analyzers/site/stack.ts`. Keeps validation in
 * the public tool layer and deterministic detection in core analyzer code.
 */

import { z } from "zod";

import {
  detectStack,
  DetectStackError,
} from "../../analyzers/site/stack.js";

export const detectStackInputSchema = {
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
      "The full URL whose public technology stack should be detected " +
        "(must include http:// or https://)",
    ),
};

export { detectStack, DetectStackError };

