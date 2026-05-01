import { CheckSquare, Square } from "lucide-react";
import { useTranslation } from "react-i18next";

export interface ToolChecklistItem<T extends string> {
  id: T;
  label: string;
  tooltip: string;
}

interface ToolChecklistProps<T extends string> {
  tools: ToolChecklistItem<T>[];
  selectedTools: Set<T>;
  disabled: boolean;
  onToggleTool: (toolId: T) => void;
  onToggleAllTools: () => void;
}

export default function ToolChecklist<T extends string>({
  tools,
  selectedTools,
  disabled,
  onToggleTool,
  onToggleAllTools,
}: ToolChecklistProps<T>) {
  const { t } = useTranslation();
  const allSelected = selectedTools.size === tools.length;
  const hasSelectedTools = selectedTools.size > 0;

  return (
    <>
      <ul className="space-y-1.5">
        {tools.map((tool) => (
          <ToolCheckbox
            key={tool.id}
            id={tool.id}
            label={tool.label}
            tooltip={tool.tooltip}
            checked={selectedTools.has(tool.id)}
            disabled={disabled}
            onChange={() => onToggleTool(tool.id)}
          />
        ))}
      </ul>

      <button
        type="button"
        onClick={onToggleAllTools}
        disabled={disabled}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-md border border-white/15 px-3 py-2 text-xs font-medium text-white/75 transition hover:border-primary/70 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
      >
        {allSelected ? (
          <CheckSquare className="h-3.5 w-3.5" strokeWidth={2} />
        ) : (
          <Square className="h-3.5 w-3.5" strokeWidth={2} />
        )}
        <span>
          {allSelected
            ? t("sidebar.tools.clearAll")
            : t("sidebar.tools.selectAll")}
        </span>
      </button>

      {!hasSelectedTools && (
        <p className="mt-2 text-xs text-status-issues">
          {t("sidebar.noChecks")}
        </p>
      )}
    </>
  );
}

interface ToolCheckboxProps<T extends string> {
  id: T;
  label: string;
  tooltip: string;
  checked: boolean;
  disabled: boolean;
  onChange: () => void;
}

function ToolCheckbox<T extends string>({
  id,
  label,
  tooltip,
  checked,
  disabled,
  onChange,
}: ToolCheckboxProps<T>) {
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
