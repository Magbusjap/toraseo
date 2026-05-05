import {
  TOOLS,
  type ToolId,
  getToolI18nKeyBase,
} from "./tools";
import type { AnalysisTypeId } from "./analysisTypes";

export type AnalysisToolId =
  | ToolId
  | "extract_main_text"
  | "detect_text_platform"
  | "analyze_text_structure"
  | "analyze_text_style"
  | "analyze_tone_fit"
  | "language_audience_fit"
  | "media_placeholder_review"
  | "article_uniqueness"
  | "language_syntax"
  | "ai_writing_probability"
  | "naturalness_indicators"
  | "fact_distortion_check"
  | "logic_consistency_check"
  | "ai_hallucination_check"
  | "intent_seo_forecast"
  | "safety_science_review"
  | "compare_article_structure"
  | "compare_article_style"
  | "compare_platform_fit"
  | "compare_strengths_weaknesses"
  | "compare_intent_gap"
  | "compare_content_gap"
  | "compare_semantic_gap"
  | "compare_specificity_gap"
  | "compare_trust_gap"
  | "compare_title_ctr"
  | "similarity_risk"
  | "compare_improvement_plan"
  | "compare_site_positioning"
  | "compare_site_content_depth"
  | "compare_site_technical_basics"
  | "visual_hierarchy"
  | "content_ux"
  | "design_content_alignment"
  | "trust_signals";

export interface AnalysisToolMeta {
  id: AnalysisToolId;
  i18nKeyBase: string;
  source: "site" | "analysis";
  defaultSelected?: boolean;
}

function siteTool(id: ToolId): AnalysisToolMeta {
  return {
    id,
    i18nKeyBase: getToolI18nKeyBase(id),
    source: "site",
  };
}

function analysisTool(
  id: Exclude<AnalysisToolId, ToolId>,
  options: { defaultSelected?: boolean } = {},
): AnalysisToolMeta {
  return {
    id,
    i18nKeyBase: id,
    source: "analysis",
    ...options,
  };
}

export const ANALYSIS_TOOLS: Record<AnalysisTypeId, AnalysisToolMeta[]> = {
  site_by_url: TOOLS.map((tool) => siteTool(tool.id)),
  page_by_url: [
    siteTool("check_robots_txt"),
    siteTool("analyze_meta"),
    siteTool("analyze_headings"),
    siteTool("analyze_content"),
    siteTool("detect_stack"),
    analysisTool("extract_main_text"),
    analysisTool("detect_text_platform"),
    analysisTool("analyze_text_style"),
    analysisTool("language_audience_fit"),
  ],
  article_text: [
    analysisTool("detect_text_platform"),
    analysisTool("analyze_text_structure"),
    analysisTool("analyze_text_style"),
    analysisTool("analyze_tone_fit"),
    analysisTool("language_audience_fit"),
    analysisTool("media_placeholder_review"),
    analysisTool("fact_distortion_check", { defaultSelected: false }),
    analysisTool("ai_hallucination_check", { defaultSelected: false }),
  ],
  article_compare: [
    analysisTool("detect_text_platform"),
    analysisTool("language_audience_fit"),
    analysisTool("fact_distortion_check", { defaultSelected: false }),
    analysisTool("ai_hallucination_check", { defaultSelected: false }),
  ],
  site_compare: [
    siteTool("analyze_meta"),
    siteTool("analyze_headings"),
    siteTool("analyze_content"),
    siteTool("detect_stack"),
    analysisTool("compare_site_positioning"),
    analysisTool("compare_site_content_depth"),
    analysisTool("compare_site_technical_basics"),
    analysisTool("compare_strengths_weaknesses"),
  ],
  site_design_by_url: [
    siteTool("analyze_meta"),
    siteTool("analyze_headings"),
    siteTool("detect_stack"),
    analysisTool("visual_hierarchy"),
    analysisTool("content_ux"),
    analysisTool("design_content_alignment"),
    analysisTool("trust_signals"),
  ],
};

export function getDefaultAnalysisToolSet(
  analysisType: AnalysisTypeId,
): Set<AnalysisToolId> {
  return new Set(
    ANALYSIS_TOOLS[analysisType]
      .filter((tool) => tool.defaultSelected !== false)
      .map((tool) => tool.id),
  );
}
