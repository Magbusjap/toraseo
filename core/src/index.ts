/**
 * Public API of @toraseo/core.
 *
 * Consumers (the MCP server, the desktop app, future workspaces) should
 * import from this entry point or from the named subpath exports declared
 * in package.json. Internal modules — analyzer implementations, crawlers,
 * private helpers — are reachable but not part of the stable surface.
 *
 * Two import styles are supported:
 *
 *   import { scanSiteMinimal, USER_AGENT } from "@toraseo/core";
 *   import { scanSiteMinimal } from "@toraseo/core/tools/site/scan-site";
 *
 * The barrel form is convenient for general use; the subpath form keeps
 * tree-shaking friendly imports possible for code-size-sensitive callers
 * (e.g. the Electron main process bundle).
 */

// --- Constants -----------------------------------------------------------

export { VERSION, USER_AGENT, USER_AGENT_TOKEN } from "./constants.js";

// --- Types ---------------------------------------------------------------

export type {
  ScanSiteMinimalResult,
  CheckRobotsResult,
  MetaIssue,
  AnalyzeMetaResult,
  HeadingIssue,
  HeadingEntry,
  AnalyzeHeadingsResult,
  SitemapIssue,
  SitemapUrlEntry,
  SitemapIndexEntry,
  AnalyzeSitemapResult,
  RedirectIssue,
  RedirectStep,
  CheckRedirectsResult,
  ContentIssue,
  AnalyzeContentResult,
  StackDetection,
  StackIssue,
  DetectStackResult,
} from "./types.js";

// --- Tools: Mode A (Site Audit) ------------------------------------------

export {
  scanSiteMinimal,
  scanSiteMinimalInputSchema,
  ScanSiteError,
} from "./tools/site/scan-site.js";

export {
  checkRobots,
  checkRobotsInputSchema,
} from "./tools/site/check-robots.js";

export {
  analyzeMeta,
  analyzeMetaInputSchema,
  AnalyzeMetaError,
} from "./tools/site/analyze-meta.js";

export {
  analyzeHeadings,
  analyzeHeadingsInputSchema,
  AnalyzeHeadingsError,
} from "./tools/site/analyze-headings.js";

export {
  analyzeSitemap,
  analyzeSitemapInputSchema,
  AnalyzeSitemapError,
} from "./tools/site/analyze-sitemap.js";

export {
  checkRedirects,
  checkRedirectsInputSchema,
  CheckRedirectsError,
} from "./tools/site/check-redirects.js";

export {
  analyzeContent,
  analyzeContentInputSchema,
  AnalyzeContentError,
} from "./tools/site/analyze-content.js";

export {
  detectStack,
  detectStackInputSchema,
  DetectStackError,
} from "./tools/site/detect-stack.js";
