/**
 * Shared constants for the ToraSEO MCP server.
 *
 * Single source of truth for values that appeared in multiple files
 * before centralization (notably the User-Agent string, which was
 * duplicated across all seven Mode A tools).
 *
 * The package version is read from `mcp/package.json` at module load
 * time so the User-Agent and the package metadata can never drift
 * apart. The relative path `../package.json` resolves correctly both
 * in TypeScript source (this file is `src/constants.ts`, package.json
 * is one level up) and in the compiled output (the file becomes
 * `dist/constants.js`, and the same `../` step lands in `mcp/` where
 * package.json lives). No build-step copying needed.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// --- Package metadata (read once at module load) -------------------------

const packageJsonPath = fileURLToPath(
  new URL("../package.json", import.meta.url),
);

interface PackageJson {
  readonly name: string;
  readonly version: string;
}

const pkg = JSON.parse(
  readFileSync(packageJsonPath, "utf-8"),
) as PackageJson;

/**
 * The package's semantic version. Sourced from `mcp/package.json`
 * at module load. Update package.json to bump this everywhere it's
 * used (User-Agent, future telemetry, etc.).
 */
export const VERSION: string = pkg.version;

// --- User-Agent ----------------------------------------------------------

/**
 * Project URL embedded in the User-Agent so site operators reading
 * their access logs can identify ToraSEO and find the project. Per
 * `CRAWLING_POLICY.md` and the User-Agent guidance in RFC 9309 §2.2.1.
 */
const PROJECT_URL = "https://github.com/Magbusjap/toraseo";

/**
 * Honest User-Agent header used by every outbound HTTP request from
 * this MCP server. Format follows the convention recommended by
 * `CRAWLING_POLICY.md`:
 *
 *   `<Product>/<Version> (+<URL>)`
 *
 * Example at v0.1.0-alpha:
 *   `ToraSEO/0.1.0-alpha (+https://github.com/Magbusjap/toraseo)`
 *
 * Note the `+` prefix on the URL — it's a long-standing convention
 * from web crawlers (originally documented for Googlebot and similar)
 * to mark the URL as an informational reference, not a target.
 */
export const USER_AGENT: string = `ToraSEO/${VERSION} (+${PROJECT_URL})`;

/**
 * Just the product token (without version), used by `robots-parser`
 * to match against User-Agent groups in robots.txt. Per RFC 9309 §2.2.1
 * the matching uses only the product token, not the full header.
 */
export const USER_AGENT_TOKEN = "ToraSEO";
