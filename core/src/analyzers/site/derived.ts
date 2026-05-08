import { analyzeContent } from "./content.js";
import { analyzeMeta } from "./meta.js";
import { checkRobots } from "../../tools/site/check-robots.js";
import type { AnalyzeContentResult, AnalyzeMetaResult, MetaIssue } from "../../types.js";

export interface DerivedSiteIssue {
  severity: "critical" | "warning" | "info";
  code: string;
  message: string;
}

export interface AnalyzeIndexabilityResult {
  url: string;
  status: number;
  response_time_ms: number;
  indexable: boolean;
  reasons: string[];
  robots_txt: {
    allowed: boolean;
    reason: string | null;
    robots_txt_url: string | null;
  };
  meta_robots: AnalyzeMetaResult["basic"]["robots"];
  issues: DerivedSiteIssue[];
}

export interface AnalyzeCanonicalResult {
  url: string;
  status: number;
  response_time_ms: number;
  canonical: AnalyzeMetaResult["basic"]["canonical"];
  issues: DerivedSiteIssue[];
}

export interface AnalyzeLinksResult {
  url: string;
  status: number;
  response_time_ms: number;
  links: AnalyzeContentResult["links"];
  issues: DerivedSiteIssue[];
}

export async function analyzeIndexability(
  url: string,
): Promise<AnalyzeIndexabilityResult> {
  const [robots, meta] = await Promise.all([checkRobots(url), analyzeMeta(url)]);
  const issues: DerivedSiteIssue[] = [];
  const reasons: string[] = [];

  if (!robots.allowed) {
    reasons.push("robots_disallow");
    issues.push({
      severity: "critical",
      code: "robots_disallow",
      message:
        robots.reason ??
        "robots.txt disallows crawling this URL for ToraSEO's user agent.",
    });
  }

  if (meta.basic.robots !== null && !meta.basic.robots.indexable) {
    reasons.push("meta_noindex");
    issues.push({
      severity: "critical",
      code: "meta_noindex",
      message:
        `Page declares meta robots "${meta.basic.robots.value}", so search engines are instructed not to index it.`,
    });
  }

  if (issues.length === 0) {
    issues.push({
      severity: "info",
      code: "indexability_clear",
      message:
        "No robots.txt block or meta noindex directive was detected for this URL.",
    });
  }

  return {
    url: meta.url,
    status: meta.status,
    response_time_ms: meta.response_time_ms,
    indexable: issues.every((issue) => issue.severity !== "critical"),
    reasons,
    robots_txt: {
      allowed: robots.allowed,
      reason: robots.reason,
      robots_txt_url: robots.robots_txt_url,
    },
    meta_robots: meta.basic.robots,
    issues,
  };
}

export async function analyzeCanonical(
  url: string,
): Promise<AnalyzeCanonicalResult> {
  const meta = await analyzeMeta(url);
  const canonicalIssues = meta.issues.filter((issue: MetaIssue) =>
    issue.code.includes("canonical"),
  );
  const issues: DerivedSiteIssue[] =
    canonicalIssues.length > 0
      ? canonicalIssues
      : [
          {
            severity: "info",
            code: "canonical_ok",
            message:
              "Canonical is present and does not show an obvious local configuration problem.",
          },
        ];

  return {
    url: meta.url,
    status: meta.status,
    response_time_ms: meta.response_time_ms,
    canonical: meta.basic.canonical,
    issues,
  };
}

export async function analyzeLinks(url: string): Promise<AnalyzeLinksResult> {
  const content = await analyzeContent(url);
  const linkIssues = content.issues.filter((issue) =>
    issue.code.includes("link"),
  );
  const issues: DerivedSiteIssue[] =
    linkIssues.length > 0
      ? linkIssues
      : [
          {
            severity: "info",
            code: "links_checked",
            message:
              "Internal, external, and invalid links were checked in the extracted page content.",
          },
        ];

  return {
    url: content.url,
    status: content.status,
    response_time_ms: content.response_time_ms,
    links: content.links,
    issues,
  };
}
