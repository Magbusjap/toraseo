import type { AnalysisTypeId } from "./analysisTypes";

export const APP_VERSION = "0.1.0";
export const DEFAULT_ANALYSIS_VERSION = "0.0.2";

export type VersionRegistryRow = {
  id: AnalysisTypeId;
  labelRu: string;
  labelEn: string;
  analysisVersion: string;
  development?: boolean;
};

const ROWS: VersionRegistryRow[] = [
  {
    id: "article_text",
    labelRu: "Анализ текста",
    labelEn: "Text analysis",
    analysisVersion: DEFAULT_ANALYSIS_VERSION,
  },
  {
    id: "article_compare",
    labelRu: "Сравнение двух текстов",
    labelEn: "Two-text comparison",
    analysisVersion: DEFAULT_ANALYSIS_VERSION,
  },
  {
    id: "page_by_url",
    labelRu: "Анализ страницы по URL",
    labelEn: "Page by URL analysis",
    analysisVersion: DEFAULT_ANALYSIS_VERSION,
  },
  {
    id: "site_by_url",
    labelRu: "Анализ сайта по URL",
    labelEn: "Site by URL analysis",
    analysisVersion: DEFAULT_ANALYSIS_VERSION,
  },
  {
    id: "site_compare",
    labelRu: "Сравнение сайтов",
    labelEn: "Site comparison",
    analysisVersion: DEFAULT_ANALYSIS_VERSION,
  },
  {
    id: "site_design_by_url",
    labelRu: "Анализ дизайна сайта по URL",
    labelEn: "Site design by URL analysis",
    analysisVersion: DEFAULT_ANALYSIS_VERSION,
    development: true,
  },
  {
    id: "image_analysis",
    labelRu: "Анализ изображения",
    labelEn: "Image analysis",
    analysisVersion: DEFAULT_ANALYSIS_VERSION,
    development: true,
  },
];

export const VERSION_REGISTRY = ROWS;

export function getVersionRegistryRow(
  analysisType: AnalysisTypeId,
): VersionRegistryRow {
  return (
    ROWS.find((row) => row.id === analysisType) ??
    ROWS.find((row) => row.id === "site_by_url")!
  );
}

export function getAnalysisVersionText(
  analysisType: AnalysisTypeId,
  locale: "ru" | "en",
  analysisVersion?: string,
): string {
  const row = getVersionRegistryRow(analysisType);
  if (row.development) {
    return locale === "ru" ? "В разработке" : "In development";
  }
  const version = analysisVersion ?? row.analysisVersion;
  return locale === "ru"
    ? `Версия анализа: ${version}`
    : `Analysis version: ${version}`;
}

export function getAnalysisVersionBadgeText(
  analysisType: AnalysisTypeId,
  locale: "ru" | "en",
  analysisVersion?: string,
): string {
  const row = getVersionRegistryRow(analysisType);
  if (row.development) {
    return locale === "ru" ? "В разработке" : "In development";
  }
  const version = analysisVersion ?? row.analysisVersion;
  return locale === "ru" ? `версия: ${version}` : `version: ${version}`;
}
