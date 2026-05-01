import { Check, X, RotateCw } from "lucide-react";
import { useTranslation } from "react-i18next";

interface DependencyCheckProps {
  /** Display label of the dependency. */
  label: string;
  /** Short hint shown below the label. */
  hint: string;
  /** Whether the dependency is currently satisfied. */
  satisfied: boolean;
  /** Optional action button (right side of the row). */
  action?: {
    label: string;
    onClick: () => void;
    busy?: boolean;
  };
}

/**
 * One row in the onboarding checklist.
 *
 * Visual states:
 *   - satisfied=true:  green check, no action button (even if passed),
 *                      because there's nothing to do
 *   - satisfied=false: orange X, action button visible if provided
 *   - action.busy=true: action button shows spinner instead of label
 */
export default function DependencyCheck({
  label,
  hint,
  satisfied,
  action,
}: DependencyCheckProps) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-outline/10 bg-white p-4">
      <div
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
          satisfied
            ? "bg-green-100 text-green-700"
            : "bg-orange-100 text-orange-600"
        }`}
        aria-label={
          satisfied
            ? t("onboarding.dep.satisfiedLabel")
            : t("onboarding.dep.actionRequiredLabel")
        }
      >
        {satisfied ? <Check size={16} /> : <X size={16} />}
      </div>

      <div className="min-w-0 flex-1">
        <div className="font-medium text-outline">{label}</div>
        <div className="text-sm text-outline/60">{hint}</div>
      </div>

      {!satisfied && action && (
        <button
          onClick={action.onClick}
          disabled={action.busy}
          className="shrink-0 rounded-md bg-orange-500 px-3 py-2 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-50"
        >
          {action.busy ? (
            <span className="flex items-center gap-2">
              <RotateCw className="animate-spin" size={14} />
              {t("onboarding.dep.opening")}
            </span>
          ) : (
            action.label
          )}
        </button>
      )}
    </div>
  );
}
