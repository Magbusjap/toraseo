import { useState } from "react";
import DependencyCheck from "./DependencyCheck";
import type { DetectorStatus } from "../../types/ipc";

interface OnboardingViewProps {
  status: DetectorStatus | null;
  onOpenClaude: () => Promise<{ ok: boolean; error?: string }>;
}

/**
 * Onboarding screen shown when one or both hard dependencies are
 * missing. Replaces the normal main area until both checks
 * are satisfied (status.allGreen === true), at which point App.tsx
 * routes back to the regular ModeSelection.
 *
 * The screen is purposely calm: it doesn't blame the user for not
 * having things set up, it just shows what's missing and offers a
 * single button to fix the most actionable item (launching Claude
 * Desktop). MCP installation is explained but not automated yet —
 * that's slated for Phase 3 when the smart NSIS installer is in
 * place. Skill installation is documentation-only (Phase 2 overlay)
 * because Skills in Claude Desktop are server-side and can't be
 * detected from disk — see detector.ts header for rationale.
 */
export default function OnboardingView({
  status,
  onOpenClaude,
}: OnboardingViewProps) {
  const [openingClaude, setOpeningClaude] = useState(false);
  const [openError, setOpenError] = useState<string | null>(null);

  const handleOpenClaude = async () => {
    setOpenError(null);
    setOpeningClaude(true);
    try {
      const result = await onOpenClaude();
      if (!result.ok) {
        setOpenError(
          result.error ??
            "Не удалось открыть Claude Desktop. Запустите его вручную.",
        );
      }
    } finally {
      setOpeningClaude(false);
    }
  };

  // Until the first detector tick lands, show a calm loading state
  // rather than flashing all-failed checkmarks.
  if (!status) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-outline/50">Проверяем компоненты…</div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 p-8">
      <header className="text-center">
        <h1 className="text-2xl font-semibold text-outline">
          ToraSEO работает в связке с Claude Desktop
        </h1>
        <p className="mt-2 text-outline/70">
          Для запуска нужно два компонента. Когда оба зелёные —
          сканирование разблокируется автоматически.
        </p>
      </header>

      <div className="flex flex-col gap-3">
        <DependencyCheck
          label="Claude Desktop запущен"
          hint={
            status.claudeRunning
              ? "Процесс найден"
              : "Откройте Claude Desktop, чтобы продолжить"
          }
          satisfied={status.claudeRunning}
          action={{
            label: "Открыть Claude Desktop",
            onClick: handleOpenClaude,
            busy: openingClaude,
          }}
        />

        <DependencyCheck
          label="MCP-сервер ToraSEO подключён"
          hint={
            status.mcpRegistered
              ? "Запись найдена в claude_desktop_config.json"
              : "Установщик ToraSEO добавляет MCP автоматически. См. инструкцию в документации."
          }
          satisfied={status.mcpRegistered}
        />
      </div>

      {openError && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {openError}
        </div>
      )}

      <footer className="text-center text-xs text-outline/40">
        Проверка обновляется каждые 5 секунд автоматически.
        <br />
        Skill ToraSEO устанавливается отдельно через Claude Desktop —
        Settings → Skills → Install ZIP. Подробнее в документации.
      </footer>
    </div>
  );
}
