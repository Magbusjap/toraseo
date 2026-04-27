import { ArrowRight } from "lucide-react";

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
  return (
    <div className="flex h-full items-center justify-center bg-outline-900/85 px-6 text-center">
      <div className="space-y-6 text-white/95">
        <p className="font-display text-base leading-relaxed">
          Выберите режим
          <br />
          работы
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
