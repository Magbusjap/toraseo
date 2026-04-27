import { Globe, FileText } from "lucide-react";
import SleepingMascot from "../Mascot/SleepingMascot";
import toraLogoWordmark from "@branding/logos/tora-logo-wordmark.svg";

interface ModeSelectionProps {
  onSelect: (mode: "site" | "content") => void;
}

/**
 * ModeSelection — main area in the Initial state.
 *
 * Wordmark logo + Idle status + sleeping mascot + heading + two
 * mode cards. The "Article text" card is disabled until v0.2.
 *
 * The header logo is the wordmark-only version
 * (tora-logo-wordmark.svg, no mascot face). The screen already
 * shows a large SleepingMascot below, and a horizontal logo with
 * a second small mascot beside it killed the visual balance — two
 * of the same character in one frame split the user's gaze. The
 * full mascot+wordmark tora-logo-horizontal.svg stays as the
 * canonical logo for README and external contexts where no
 * separate mascot illustration is in view.
 *
 * Layout: justify-start instead of justify-center so the header
 * sits closer to the toolbar instead of glued to the vertical
 * center of the window. pt-8 gives breathing room from the
 * toolbar; gap-7 between blocks is a hair tighter than gap-8 to
 * keep the composition compact.
 */
export default function ModeSelection({ onSelect }: ModeSelectionProps) {
  return (
    <div className="flex h-full flex-col items-center justify-start gap-7 px-8 pt-8 pb-12">
      {/* Header — wordmark only (no mascot face). The screen already
          shows a large SleepingMascot below; two of the same character
          in one frame killed the visual focus. The full mascot+wordmark
          tora-logo-horizontal.svg stays as-is for README and external
          contexts where there's no separate mascot nearby. */}
      <header className="text-center">
        <img
          src={toraLogoWordmark}
          alt="ToraSEO — See the top. Rank the top."
          className="h-16 w-auto"
          draggable={false}
        />
      </header>

      {/* Status indicator */}
      <div className="flex items-center gap-2 text-sm text-outline-900/70">
        <span
          className="h-2.5 w-2.5 rounded-full bg-status-idle"
          aria-hidden="true"
        />
        <span>Idle</span>
      </div>

      {/* Mascot */}
      <SleepingMascot className="h-40 w-40" />

      {/* Question */}
      <p className="font-display text-lg text-outline-900">
        Что вы хотите проверить?
      </p>

      {/* Mode cards */}
      <div className="flex gap-4">
        <ModeCard
          icon={<Globe className="h-8 w-8" strokeWidth={1.5} />}
          title="Сайт по URL"
          subtitle="Site Audit"
          onClick={() => onSelect("site")}
        />
        <ModeCard
          icon={<FileText className="h-8 w-8" strokeWidth={1.5} />}
          title="Текст статьи"
          subtitle="v0.2 — coming soon"
          disabled
          onClick={() => onSelect("content")}
        />
      </div>

      {/* Connection hint */}
      <p className="mt-2 text-xs text-outline-900/50">
        Подключение к Claude Desktop опционально
      </p>
    </div>
  );
}

interface ModeCardProps {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  disabled?: boolean;
  onClick: () => void;
}

function ModeCard({ icon, title, subtitle, disabled, onClick }: ModeCardProps) {
  const baseClasses =
    "flex w-44 flex-col items-center gap-3 rounded-xl border bg-white p-6 text-center transition";
  const stateClasses = disabled
    ? "cursor-not-allowed border-outline/10 opacity-50"
    : "cursor-pointer border-outline/15 hover:-translate-y-0.5 hover:border-primary hover:shadow-md";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`${baseClasses} ${stateClasses}`}
      aria-disabled={disabled}
    >
      <span className={disabled ? "text-outline-900/40" : "text-primary"}>
        {icon}
      </span>
      <span className="font-display text-base font-medium text-outline-900">
        {title}
      </span>
      <span className="font-mono text-[10px] uppercase tracking-wider text-outline-900/50">
        {subtitle}
      </span>
    </button>
  );
}
