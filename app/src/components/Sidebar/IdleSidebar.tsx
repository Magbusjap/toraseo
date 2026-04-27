import { ArrowRight } from "lucide-react";
import { useTranslation } from "react-i18next";

/**
 * IdleSidebar — sidebar state before any mode is selected.
 *
 * A fully darkened panel with centered text and a right-pointing
 * arrow. No visible menu items — the overlay completely hides
 * any structural detail.
 *
 * Once a mode is selected, this component is replaced by
 * ActiveSidebar (Site Audit or Content Audit), bound to that mode.
 */
export default function IdleSidebar() {
  const { t } = useTranslation();
  // Translation may legitimately contain a literal newline (the
  // "Choose a mode" text wants two lines: "Choose a mode" + "of
  // operation" in some locales). We split on \n to render those as
  // separate visual lines via <br/>.
  const heading = t("sidebar.idleHeading");
  return (
    <div className="flex h-full items-center justify-center bg-surface px-6 text-center">
      <div className="space-y-6 text-white">
        <p className="font-display text-base leading-relaxed">
          {heading.split("\n").map((line, i, arr) => (
            <span key={i}>
              {line}
              {i < arr.length - 1 && <br />}
            </span>
          ))}
        </p>
        <ArrowRight
          className="mx-auto h-8 w-8 text-primary"
          strokeWidth={2}
          aria-hidden="true"
        />
      </div>
    </div>
  );
}
