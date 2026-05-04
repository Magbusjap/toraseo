import { ArrowLeft } from "lucide-react";
import { useTranslation } from "react-i18next";

import {
  ANALYSIS_TOOLS,
  type AnalysisToolId,
} from "../../config/analysisTools";
import type { AnalysisTypeId } from "../../config/analysisTypes";
import ToolChecklist from "./ToolChecklist";

interface AnalysisDraftSidebarProps {
  analysisType: AnalysisTypeId;
  selectedTools: Set<AnalysisToolId>;
  analysisRole: string;
  textPlatform: string;
  customPlatform: string;
  onAnalysisRoleChange: (value: string) => void;
  onTextPlatformChange: (value: string) => void;
  onCustomPlatformChange: (value: string) => void;
  onToggleTool: (toolId: AnalysisToolId) => void;
  onToggleAllTools: () => void;
  onReturnHome: () => void;
}

export default function AnalysisDraftSidebar({
  analysisType,
  selectedTools,
  analysisRole,
  textPlatform,
  customPlatform,
  onAnalysisRoleChange,
  onTextPlatformChange,
  onCustomPlatformChange,
  onToggleTool,
  onToggleAllTools,
  onReturnHome,
}: AnalysisDraftSidebarProps) {
  const { t } = useTranslation();
  const title = t(
    `modeSelection.analysisTypes.${keyForAnalysis(analysisType)}.title`,
  );
  const toolItems = ANALYSIS_TOOLS[analysisType].map((tool) => ({
    id: tool.id,
    label:
      tool.source === "site"
        ? t(`tools.${tool.i18nKeyBase}.label`)
        : t(`analysisTools.${tool.i18nKeyBase}.label`),
    tooltip:
      tool.source === "site"
        ? t(`tools.${tool.i18nKeyBase}.tooltip`)
        : t(`analysisTools.${tool.i18nKeyBase}.tooltip`),
  }));
  const showTextContext =
    analysisType === "page_by_url" ||
    analysisType === "article_text" ||
    analysisType === "article_compare";

  return (
    <div className="flex h-full flex-col bg-surface text-white">
      <div className="toraseo-sidebar-scrollbar flex-1 space-y-6 overflow-y-auto px-5 py-6">
        <button
          type="button"
          onClick={onReturnHome}
          className="inline-flex items-center gap-2 self-start rounded-md border border-white/10 px-3 py-2 text-sm font-medium text-white/80 transition hover:border-primary/70 hover:text-white"
        >
          <ArrowLeft size={15} />
          {t("sidebar.backToHomeTitle")}
        </button>
        <div className="space-y-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-white/45">
              {t("plannedAnalysis.sidebar.version", {
                defaultValue: "0.0.9 setup",
              })}
            </p>
            <h2 className="mt-2 font-display text-xl font-semibold leading-snug">
              {title}
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-white/65">
              {t("plannedAnalysis.sidebar.body", {
                defaultValue:
                  "Input and analysis boundaries are prepared here. Full execution will connect after the formula and tool contract is wired.",
              })}
            </p>
          </div>
        </div>

        {showTextContext && (
          <SidebarSection title={t("plannedAnalysis.sidebar.textContext")}>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-white/60">
                {t("plannedAnalysis.sidebar.platform")}
              </span>
              <select
                value={textPlatform}
                onChange={(event) => onTextPlatformChange(event.target.value)}
                className="toraseo-dark-select w-full rounded-md border border-white/15 bg-white/5 px-3 py-2 text-sm text-white outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/40"
              >
                <option value="site_article">
                  {t("plannedAnalysis.platforms.siteArticle")}
                </option>
                <option value="x_short">
                  {t("plannedAnalysis.platforms.xShort")}
                </option>
                <option value="x_long">
                  {t("plannedAnalysis.platforms.xLong")}
                </option>
                <option value="facebook">
                  {t("plannedAnalysis.platforms.facebook")}
                </option>
                <option value="linkedin">
                  {t("plannedAnalysis.platforms.linkedin")}
                </option>
                <option value="habr">
                  {t("plannedAnalysis.platforms.habr")}
                </option>
                <option value="reddit">
                  {t("plannedAnalysis.platforms.reddit")}
                </option>
                <option value="custom">
                  {t("plannedAnalysis.platforms.custom")}
                </option>
              </select>
            </label>

            <label className="mt-3 block">
              <span className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-white/60">
                {t("plannedAnalysis.sidebar.customPlatform")}
              </span>
              <input
                type="text"
                value={customPlatform}
                onChange={(event) => onCustomPlatformChange(event.target.value)}
                placeholder={t("plannedAnalysis.sidebar.customPlatformPlaceholder")}
                title={t("plannedAnalysis.sidebar.customPlatformHint")}
                className="w-full rounded-md border border-white/15 bg-white/5 px-3 py-2 text-sm text-white transition placeholder:text-white/30 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
              <span className="mt-1.5 block text-xs leading-relaxed text-white/45">
                {t("plannedAnalysis.sidebar.customPlatformHint")}
              </span>
            </label>

            <label className="mt-3 block">
              <span className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-white/60">
                {t("plannedAnalysis.sidebar.textStyle")}
              </span>
              <select className="toraseo-dark-select w-full rounded-md border border-white/15 bg-white/5 px-3 py-2 text-sm text-white outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/40">
                <option value="auto">{t("plannedAnalysis.styles.auto")}</option>
                <option value="informational">
                  {t("plannedAnalysis.styles.informational")}
                </option>
                <option value="journalistic">
                  {t("plannedAnalysis.styles.journalistic")}
                </option>
                <option value="business">
                  {t("plannedAnalysis.styles.business")}
                </option>
                <option value="educational">
                  {t("plannedAnalysis.styles.educational")}
                </option>
                <option value="humor">
                  {t("plannedAnalysis.styles.humor")}
                </option>
                <option value="personal">
                  {t("plannedAnalysis.styles.personal")}
                </option>
              </select>
            </label>

            <label className="mt-3 block">
              <span className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-white/60">
                {t("plannedAnalysis.sidebar.analysisRole")}
              </span>
              <input
                type="text"
                value={analysisRole}
                onChange={(event) => onAnalysisRoleChange(event.target.value)}
                placeholder={t("plannedAnalysis.sidebar.analysisRolePlaceholder")}
                title={t("plannedAnalysis.sidebar.analysisRoleHint")}
                className="w-full rounded-md border border-white/15 bg-white/5 px-3 py-2 text-sm text-white transition placeholder:text-white/30 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
              <span className="mt-1.5 block text-xs leading-relaxed text-white/45">
                {t("plannedAnalysis.sidebar.analysisRoleHint")}
              </span>
            </label>
          </SidebarSection>
        )}

        <SidebarSection
          title={
            showTextContext
              ? t("plannedAnalysis.sidebar.additionalChecks", {
                  defaultValue: "Дополнительные проверки",
                })
              : t("sidebar.section.checks")
          }
        >
          <ToolChecklist
            tools={toolItems}
            selectedTools={selectedTools}
            disabled={false}
            onToggleTool={onToggleTool}
            onToggleAllTools={onToggleAllTools}
          />
        </SidebarSection>
      </div>
    </div>
  );
}

function SidebarSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h3 className="mb-3 font-mono text-[10px] font-semibold uppercase tracking-[0.15em] text-white/50">
        - {title} -
      </h3>
      {children}
    </section>
  );
}

function keyForAnalysis(analysisType: AnalysisTypeId): string {
  switch (analysisType) {
    case "site_by_url":
      return "siteByUrl";
    case "page_by_url":
      return "pageByUrl";
    case "article_text":
      return "articleText";
    case "article_compare":
      return "articleCompare";
    case "site_compare":
      return "siteCompare";
    case "site_design_by_url":
      return "siteDesignByUrl";
  }
}
