export type AnalysisTypeId =
  | "site_by_url"
  | "page_by_url"
  | "article_text"
  | "article_compare"
  | "site_compare"
  | "site_design_by_url"
  | "image_analysis";

export type AnalysisAvailability = "ready" | "planned" | "development";

export interface AnalysisTypeMeta {
  id: AnalysisTypeId;
  availability: AnalysisAvailability;
  i18nKeyBase: string;
}

export const ANALYSIS_TYPES: AnalysisTypeMeta[] = [
  {
    id: "article_text",
    availability: "planned",
    i18nKeyBase: "articleText",
  },
  {
    id: "article_compare",
    availability: "planned",
    i18nKeyBase: "articleCompare",
  },
  {
    id: "page_by_url",
    availability: "planned",
    i18nKeyBase: "pageByUrl",
  },
  {
    id: "site_by_url",
    availability: "ready",
    i18nKeyBase: "siteByUrl",
  },
  {
    id: "site_compare",
    availability: "planned",
    i18nKeyBase: "siteCompare",
  },
  {
    id: "site_design_by_url",
    availability: "development",
    i18nKeyBase: "siteDesignByUrl",
  },
  {
    id: "image_analysis",
    availability: "development",
    i18nKeyBase: "imageAnalysis",
  },
];
