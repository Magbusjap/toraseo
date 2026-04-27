import { useState } from "react";
import DependencyCheck from "./DependencyCheck";
import type {
  DetectorStatus,
  DownloadSkillZipResult,
  PickMcpConfigResult,
} from "../../types/ipc";

interface OnboardingViewProps {
  status: DetectorStatus | null;
  onOpenClaude: () => Promise<{ ok: boolean; error?: string }>;
  onPickMcpConfig: () => Promise<PickMcpConfigResult>;
  onClearManualMcpConfig: () => Promise<{ ok: boolean }>;
  onDownloadSkillZip: () => Promise<DownloadSkillZipResult>;
  onOpenSkillReleasesPage: () => Promise<{ ok: boolean }>;
  onConfirmSkillInstalled: () => Promise<{ ok: boolean }>;
  onClearSkillConfirmation: () => Promise<{ ok: boolean }>;
}

/**
 * Onboarding screen shown when one or more of the three hard
 * dependencies are missing. Replaces the normal main area until
 * `status.allGreen === true`, at which point App.tsx routes back
 * to the regular ModeSelection.
 *
 * The screen is purposely calm: each row explains what's missing
 * and offers minimal actions. Three rows:
 *
 *   1. Claude Desktop running — primary action: open Claude (uses
 *      known install paths or claude:// fallback)
 *   2. MCP registered — escape hatch: pick config file manually
 *      (covers Microsoft Store sandbox redirects, portable installs,
 *      future hash changes)
 *   3. Skill installed — hybrid: filesystem auto-detect for Claude
 *      Code users, plus a download-ZIP-and-confirm flow for Claude
 *      Desktop users (skills there are server-side, not file-based)
 */
export default function OnboardingView({
  status,
  onOpenClaude,
  onPickMcpConfig,
  onClearManualMcpConfig,
  onDownloadSkillZip,
  onOpenSkillReleasesPage,
  onConfirmSkillInstalled,
  onClearSkillConfirmation,
}: OnboardingViewProps) {
  const [openingClaude, setOpeningClaude] = useState(false);
  const [openError, setOpenError] = useState<string | null>(null);

  const [pickingConfig, setPickingConfig] = useState(false);
  const [pickError, setPickError] = useState<string | null>(null);
  const [pickInfo, setPickInfo] = useState<string | null>(null);

  const [downloadingSkill, setDownloadingSkill] = useState(false);
  const [skillDownloadError, setSkillDownloadError] = useState<string | null>(
    null,
  );
  const [skillDownloadInfo, setSkillDownloadInfo] = useState<string | null>(
    null,
  );
  const [confirmingSkill, setConfirmingSkill] = useState(false);

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

  const handlePickConfig = async () => {
    setPickError(null);
    setPickInfo(null);
    setPickingConfig(true);
    try {
      const result = await onPickMcpConfig();
      if (!result.ok) {
        if (result.reason === "cancelled") return;
        if (result.reason === "parse-error") {
          setPickError(
            "Файл не является корректным JSON. Откройте его в редакторе и проверьте формат.",
          );
          return;
        }
        setPickError(
          result.errorMessage ?? "Не удалось прочитать файл.",
        );
        return;
      }
      if (!result.hasToraseo) {
        setPickInfo(
          "Файл выбран, но запись mcpServers.toraseo пока не найдена. Установщик ToraSEO добавит её при следующей установке.",
        );
      }
    } finally {
      setPickingConfig(false);
    }
  };

  const handleDownloadSkill = async () => {
    setSkillDownloadError(null);
    setSkillDownloadInfo(null);
    setDownloadingSkill(true);
    try {
      const result = await onDownloadSkillZip();
      if (!result.ok) {
        setSkillDownloadError(
          result.error ?? "Не удалось скачать ZIP с GitHub.",
        );
        return;
      }
      setSkillDownloadInfo(
        `ZIP скачан (${result.releaseTag}). Папка с файлом открыта — перетащите его в Claude Desktop: Settings → Skills → Install from ZIP. После установки вернитесь сюда и нажмите «Я установил Skill».`,
      );
    } finally {
      setDownloadingSkill(false);
    }
  };

  const handleConfirmSkill = async () => {
    // Light confirmation step — we're trusting the user, but it's
    // their product gate, so a deliberate click is appropriate.
    const confirmed = window.confirm(
      "Подтверждаете, что Skill ToraSEO установлен в Claude Desktop через Settings → Skills?\n\nБез установленного Skill анализ через Claude будет неполным — он проигнорирует CRAWLING_POLICY, verdict-mapping и формулу CGS-балла.",
    );
    if (!confirmed) return;
    setConfirmingSkill(true);
    try {
      await onConfirmSkillInstalled();
    } finally {
      setConfirmingSkill(false);
    }
  };

  const handleClearSkill = async () => {
    setSkillDownloadError(null);
    setSkillDownloadInfo(null);
    await onClearSkillConfirmation();
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
          Для запуска нужно три компонента. Когда все три зелёные —
          сканирование разблокируется автоматически.
        </p>
      </header>

      <div className="flex flex-col gap-3">
        {/* Row 1 — Claude Desktop process */}
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

        {/* Row 2 — MCP registration with manual picker fallback */}
        <div className="flex flex-col gap-2">
          <DependencyCheck
            label="MCP-сервер ToraSEO подключён"
            hint={
              status.mcpRegistered
                ? "Запись найдена в claude_desktop_config.json"
                : "Установщик ToraSEO добавляет MCP автоматически. Если конфиг лежит в нестандартном месте — укажите вручную."
            }
            satisfied={status.mcpRegistered}
          />

          <div className="flex flex-wrap items-center gap-2 pl-11 text-xs text-outline/60">
            <button
              type="button"
              onClick={handlePickConfig}
              disabled={pickingConfig}
              className="rounded-md border border-outline/20 bg-white px-2 py-1 hover:bg-orange-50 disabled:opacity-50"
            >
              {pickingConfig ? "Открываю диалог…" : "Указать config вручную"}
            </button>

            {status.manualMcpPath && (
              <>
                <span className="truncate" title={status.manualMcpPath}>
                  Используется: <code>{status.manualMcpPath}</code>
                </span>
                <button
                  type="button"
                  onClick={onClearManualMcpConfig}
                  className="text-orange-600 hover:underline"
                >
                  сбросить
                </button>
              </>
            )}
          </div>

          {pickError && (
            <div className="ml-11 rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-800">
              {pickError}
            </div>
          )}
          {pickInfo && (
            <div className="ml-11 rounded-md border border-orange-200 bg-orange-50 p-2 text-xs text-orange-800">
              {pickInfo}
            </div>
          )}
        </div>

        {/* Row 3 — Skill (hybrid: filesystem OR manual confirmation) */}
        <div className="flex flex-col gap-2">
          <DependencyCheck
            label="Skill ToraSEO установлен"
            hint={skillRowHint(status)}
            satisfied={status.skillInstalled}
          />

          <div className="flex flex-wrap items-center gap-2 pl-11 text-xs text-outline/60">
            <button
              type="button"
              onClick={handleDownloadSkill}
              disabled={downloadingSkill}
              className="rounded-md border border-outline/20 bg-white px-2 py-1 hover:bg-orange-50 disabled:opacity-50"
            >
              {downloadingSkill
                ? "Скачиваю с GitHub…"
                : "Скачать ZIP с GitHub"}
            </button>

            <button
              type="button"
              onClick={onOpenSkillReleasesPage}
              className="rounded-md border border-outline/20 bg-white px-2 py-1 hover:bg-orange-50"
            >
              Открыть страницу релизов
            </button>

            <button
              type="button"
              onClick={handleConfirmSkill}
              disabled={
                confirmingSkill ||
                // Already satisfied via either source — manual
                // confirmation would be a no-op (or worse, confusing
                // if it overrode an active filesystem detect with an
                // identical-looking manual flag).
                status.skillInstalled
              }
              title={
                status.skillInstalled
                  ? status.skillSource === "filesystem"
                    ? "Skill уже определён через файловую систему (Claude Code) — подтверждение не требуется"
                    : "Ручное подтверждение уже активно — сбросьте его ниже, если хотите переподтвердить"
                  : undefined
              }
              className="rounded-md border border-outline/20 bg-white px-2 py-1 hover:bg-orange-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {confirmingSkill ? "Подтверждаю…" : "Я установил Skill"}
            </button>
          </div>

          {/* Active source indicator + reset for manual flag.
              Filesystem source has no reset (user owns those files
              outside of our app), only manual flags are user-undoable
              from inside ToraSEO. */}
          {status.skillInstalled && status.skillSource && (
            <div className="flex flex-wrap items-center gap-2 pl-11 text-xs text-outline/60">
              {status.skillSource === "filesystem" && (
                <span>
                  Используется: <code>~/.claude/skills/toraseo/SKILL.md</code>
                </span>
              )}
              {status.skillSource === "manual" && (
                <>
                  <span>Используется: ручное подтверждение</span>
                  <button
                    type="button"
                    onClick={handleClearSkill}
                    className="text-orange-600 hover:underline"
                  >
                    сбросить
                  </button>
                </>
              )}
            </div>
          )}

          {skillDownloadError && (
            <div className="ml-11 rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-800">
              {skillDownloadError}
            </div>
          )}
          {skillDownloadInfo && (
            <div className="ml-11 rounded-md border border-orange-200 bg-orange-50 p-2 text-xs text-orange-800">
              {skillDownloadInfo}
            </div>
          )}
        </div>
      </div>

      {openError && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {openError}
        </div>
      )}

      <footer className="text-center text-xs text-outline/40">
        Проверка обновляется каждые 5 секунд автоматически.
      </footer>
    </div>
  );
}

/**
 * Human-readable hint for the Skill row, picking copy based on the
 * current source of truth. Filesystem path mentions `~/.claude/skills`
 * directly so power users know where it's reading from; manual path
 * acknowledges the trust mode; empty state explains the two options.
 */
function skillRowHint(status: DetectorStatus): string {
  if (!status.skillInstalled) {
    return "Скачайте ZIP с GitHub и установите через Claude Desktop: Settings → Skills → Install ZIP. После установки нажмите «Я установил Skill».";
  }
  if (status.skillSource === "filesystem") {
    return "Файл найден на диске (Claude Code)";
  }
  return "Установка подтверждена пользователем";
}
