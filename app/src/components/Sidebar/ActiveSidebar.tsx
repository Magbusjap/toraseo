import { ArrowLeft, Globe, Play } from "lucide-react";
import { useTranslation } from "react-i18next";

import { TOOLS, type ToolId, getToolI18nKeyBase } from "../../config/tools";

interface ActiveSidebarProps {
  url: string;
  onUrlChange: (url: string) => void;
  selectedTools: Set<ToolId>;
  onToggleTool: (toolId: ToolId) => void;
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
  const computedTooltip = !hasValidUrl
    ? t("sidebar.tooltip.noUrl")
    : !hasSelectedTools
      ? t("sidebar.tooltip.noChecks")
      : isBusy
        ? t("sidebar.tooltip.alreadyScanning")
        : scanButtonTooltip;

  return (
    <div className="flex h-full flex-col bg-surface text-white">
      <header className="border-b border-white/10 px-4 py-3">
        <button
          type="button"
          onClick={onReturnHome}
          className="flex items-center gap-2 text-sm text-white/70 transition hover:text-primary"
        >
          <ArrowLeft className="h-4 w-4" strokeWidth={2} />
          <span>{t("sidebar.backToHomeTitle")}</span>
        </button>
      </header>

      <div className="flex-1 space-y-6 overflow-y-auto px-4 py-5">
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

        <SidebarSection title={t("sidebar.section.checks")}>
          <ul className="space-y-1.5">
            {TOOLS.map((tool) => {
              const keyBase = getToolI18nKeyBase(tool.id);
              return (
                <ToolCheckbox
                  key={tool.id}
                  id={tool.id}
                  label={t(`tools.${keyBase}.label`)}
                  tooltip={t(`tools.${keyBase}.tooltip`)}
                  checked={selectedTools.has(tool.id)}
                  disabled={isBusy}
                  onChange={() => onToggleTool(tool.id)}
                />
              );
            })}
          </ul>
          {!hasSelectedTools && (
            <p className="mt-2 text-xs text-status-issues">
              {t("sidebar.noChecks")}
            </p>
          )}
        </SidebarSection>
      </div>

      <footer className="border-t border-white/10 p-4">
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

interface ToolCheckboxProps {
  id: ToolId;
  label: string;
  tooltip: string;
  checked: boolean;
  disabled: boolean;
  onChange: () => void;
}

function ToolCheckbox({
  id,
  label,
  tooltip,
  checked,
  disabled,
  onChange,
}: ToolCheckboxProps) {
  return (
    <li>
      <label
        title={tooltip}
        className={`flex cursor-pointer items-center gap-2.5 rounded px-2 py-1.5 text-sm transition ${
          disabled ? "cursor-not-allowed opacity-60" : "hover:bg-white/5"
        }`}
      >
        <input
          type="checkbox"
          checked={checked}
          onChange={onChange}
          disabled={disabled}
          className="h-4 w-4 cursor-pointer rounded border-white/30 bg-white/5 text-primary accent-primary focus:ring-2 focus:ring-primary/40 disabled:cursor-not-allowed"
          data-tool-id={id}
        />
        <span className="select-none text-white/90">{label}</span>
      </label>
    </li>
  );
}

function isLikelyUrl(value: string): boolean {
  const pattern =
    /^(https?:\/\/)?[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)+(\/.*)?$/;
  return pattern.test(value);
}
