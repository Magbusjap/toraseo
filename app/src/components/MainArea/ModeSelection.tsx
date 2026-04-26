import { Globe, FileText } from "lucide-react";
import SleepingMascot from "../Mascot/SleepingMascot";

interface ModeSelectionProps {
  onSelect: (mode: "site" | "content") => void;
}

/**
 * ModeSelection — main area в Initial state.
 *
 * Логотип + статус Idle + спящий маскот + заголовок + две карточки выбора.
 * Карточка "Текст статьи" disabled до v0.2.
 */
export default function ModeSelection({ onSelect }: ModeSelectionProps) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-8 px-8 py-12">
      {/* Header — logo + tagline */}
      <header className="text-center">
        <h1 className="font-display text-4xl font-bold tracking-tight text-outline-900">
          ToraSEO
        </h1>
        <p className="mt-1 font-mono text-xs uppercase tracking-[0.2em] text-outline-900/60">
          See the top
        </p>
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
