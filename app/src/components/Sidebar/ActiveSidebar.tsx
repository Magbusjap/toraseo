import { ArrowLeft, Globe, Play } from "lucide-react";
import { useTranslation } from "react-i18next";

import { TOOLS, type ToolId } from "../../config/tools";

interface ActiveSidebarProps {
  url: string;
  onUrlChange: (url: string) => void;
  selectedTools: Set<ToolId>;
  onToggleTool: (toolId: ToolId) => void;
  onToggleAllTools: () => void;
  isBusy: boolean;
  scanButtonLabel: string;
  scanButtonTooltip?: string;
  canRun: boolean;
  onReturnHome: () => void;
  onRun: () => void;
}

export default function ActiveSidebar({
  url,
  onUrlChange,
  selectedTools,
  onToggleTool,
  onToggleAllTools,
  isBusy,
  scanButtonLabel,
  scanButtonTooltip,
  canRun,
  onReturnHome,
  onRun,
}: ActiveSidebarProps) {
  const { t } = useTranslation();

  const trimmedUrl = url.trim();
  const hasValidUrl = trimmedUrl.length > 0 && isLikelyUrl(trimmedUrl);
  const hasSelectedTools = selectedTools.size > 0;
  const toolPackages = [
    {
      id: "basic",
      title: t("sidebar.siteGroups.basic", { defaultValue: "Basic checks" }),
      description: t("sidebar.siteGroups.basicDescription", {
        defaultValue: "URL, indexability, robots.txt, sitemap, and redirects",
      }),
      tools: TOOLS.filter((tool) => tool.group === "basic").map((tool) => tool.id),
    },
    {
      id: "onPage",
      title: t("sidebar.siteGroups.onPage", { defaultValue: "On-page SEO" }),
      description: t("sidebar.siteGroups.onPageDescription", {
        defaultValue: "Meta tags, canonical, headings, content, and links",
      }),
      tools: TOOLS.filter((tool) => tool.group === "onPage").map((tool) => tool.id),
    },
    {
      id: "advanced",
      title: t("sidebar.siteGroups.advanced", { defaultValue: "Advanced" }),
      description: t("sidebar.siteGroups.advancedDescription", {
        defaultValue: "Optional checks that are not needed for every audit",
      }),
      tools: TOOLS.filter((tool) => tool.group === "advanced").map((tool) => tool.id),
    },
  ];
  const togglePackage = (tools: ToolId[]) => {
    const shouldSelect = tools.some((toolId) => !selectedTools.has(toolId));
    for (const toolId of tools) {
      if (selectedTools.has(toolId) !== shouldSelect) {
        onToggleTool(toolId);
      }
    }
  };
  const computedTooltip = !hasValidUrl
    ? t("sidebar.tooltip.noUrl")
    : !hasSelectedTools
      ? t("sidebar.tooltip.noChecks")
      : isBusy
        ? t("sidebar.tooltip.alreadyScanning")
        : scanButtonTooltip;

  return (
    <div className="flex h-full flex-col bg-surface text-white">
      <div className="toraseo-sidebar-scrollbar flex-1 space-y-6 overflow-y-auto px-5 py-6">
        <button
          type="button"
          onClick={onReturnHome}
          className="inline-flex items-center gap-2 rounded-md border border-white/10 px-3 py-2 text-sm font-medium text-white/80 transition hover:border-primary/70 hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" strokeWidth={2} />
          <span>{t("sidebar.backToHomeTitle")}</span>
        </button>

        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-white/45">
            {t("plannedAnalysis.sidebar.version", {
              defaultValue: "0.1.0 setup",
            })}
          </p>
          <h2 className="mt-2 font-display text-xl font-semibold leading-snug">
            {t("modeSelection.analysisTypes.siteByUrl.title", {
              defaultValue: "Site by URL",
            })}
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-white/65">
            {t("plannedAnalysis.sidebar.body", {
              defaultValue:
                "Input and analysis boundaries are prepared here. Full execution will connect after the formula and tool contract is wired.",
            })}
          </p>
        </div>

        <SidebarSection title={t("sidebar.section.project")}>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-white/60">
              {t("sidebar.urlLabel")}
            </span>
            <div className="relative">
              <Globe
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40"
                strokeWidth={2}
                aria-hidden="true"
              />
              <input
                type="text"
                value={url}
                onChange={(e) => onUrlChange(e.target.value)}
                placeholder={t("sidebar.urlPlaceholder")}
                disabled={isBusy}
                spellCheck={false}
                autoCorrect="off"
                autoCapitalize="off"
                className="w-full rounded-md border border-white/15 bg-white/5 py-2 pl-9 pr-3 text-sm text-white transition placeholder:text-white/30 focus:border-primary focus:bg-white/10 focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-50"
              />
            </div>
            {trimmedUrl.length > 0 && !isLikelyUrl(trimmedUrl) && (
              <span className="mt-1.5 block text-xs text-status-issues">
                {t("sidebar.urlInvalid")}
              </span>
            )}
          </label>
        </SidebarSection>

        <SidebarSection
          title={t("plannedAnalysis.sidebar.additionalChecks", {
            defaultValue: "Additional checks",
          })}
        >
          <div className="space-y-2">
            {toolPackages.map((pack) => {
              if (pack.tools.length === 0) return null;
              const checked = pack.tools.every((toolId) => selectedTools.has(toolId));
              const partial =
                !checked && pack.tools.some((toolId) => selectedTools.has(toolId));
              return (
                <label
                  key={pack.id}
                  className="flex cursor-pointer items-start gap-2 rounded-md px-1 py-1.5 transition hover:bg-white/5"
                  title={pack.description}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={isBusy}
                    onChange={() => togglePackage(pack.tools)}
                    className="mt-0.5 h-4 w-4 rounded border-white/20 bg-white/10 text-primary focus:ring-primary disabled:opacity-40"
                    aria-checked={partial ? "mixed" : checked}
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-white/80">
                      {pack.title}
                    </span>
                    <span className="mt-0.5 block text-xs leading-snug text-white/45">
                      {pack.description}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
          <button
            type="button"
            onClick={onToggleAllTools}
            disabled={isBusy}
            className="mt-4 w-full rounded-md border border-white/15 px-3 py-2 text-xs font-medium text-white/70 transition hover:border-primary/70 hover:text-white disabled:opacity-40"
          >
            {selectedTools.size === TOOLS.length
              ? t("sidebar.tools.clearAll")
              : t("sidebar.tools.selectAll")}
          </button>
        </SidebarSection>
      </div>

      <footer className="border-t border-white/10 p-5">
        <button
          type="button"
          onClick={onRun}
          disabled={!canRun}
          title={computedTooltip}
          className="flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-white transition hover:bg-primary-600 disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-white/40"
        >
          <Play className="h-4 w-4 fill-current" strokeWidth={2} />
          <span>{scanButtonLabel}</span>
        </button>
      </footer>
    </div>
  );
}

interface SidebarSectionProps {
  title: string;
  children: React.ReactNode;
}

function SidebarSection({ title, children }: SidebarSectionProps) {
  return (
    <section>
      <h3 className="mb-3 font-mono text-[10px] font-semibold uppercase tracking-[0.15em] text-white/50">
        - {title} -
      </h3>
      {children}
    </section>
  );
}

function isLikelyUrl(value: string): boolean {
  const pattern =
    /^(https?:\/\/)?[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)+(\/.*)?$/;
  return pattern.test(value);
}
