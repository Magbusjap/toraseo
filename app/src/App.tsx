import { useState } from "react";
import IdleSidebar from "./components/Sidebar/IdleSidebar";
import ActiveSidebar from "./components/Sidebar/ActiveSidebar";
import ModeSelection from "./components/MainArea/ModeSelection";
import SiteAuditView from "./components/MainArea/SiteAuditView";
import { OnboardingView } from "./components/Onboarding";
import { TopToolbar } from "./components/TopToolbar";
import { UpdateNotification } from "./components/UpdateNotification";
import { DEFAULT_SELECTED_TOOLS, TOOLS, type ToolId } from "./config/tools";
import { useScan } from "./hooks/useScan";
import { useDetector } from "./hooks/useDetector";

export type AppMode = "idle" | "site" | "content";

/**
 * Корень приложения.
 *
 * Управляет глобальным состоянием:
 * - mode: текущий режим работы (idle / site / content)
 * - url: введённый адрес сайта для аудита (только в site mode)
 * - selectedTools: какие tools юзер выбрал для запуска
 *
 * Состояние скана (stages, scanState, summary) живёт в `useScan` —
 * хук подписан на IPC main process и хранит per-tool результаты.
 *
 * Состояние hard dependencies (Claude/MCP/Skill) живёт в `useDetector` —
 * пока allGreen=false, основной экран заменён на OnboardingView,
 * сайдбар — на «locked» панель. Когда все три зелёные — UI
 * автоматически возвращается в обычный режим без явного клика юзера.
 *
 * Skill detection — гибридный: filesystem (`~/.claude/skills/toraseo/`)
 * для Claude Code юзеров, или manual confirmation флаг для Claude
 * Desktop (skills server-side, filesystem detect невозможен). UI
 * предлагает скачать ZIP и подтвердить установку.
 *
 * Pre-flight check: при клике "Сканировать" мы заново проверяем
 * статус (синхронно) — это закрывает race window между последним
 * polling-тиком и кликом. Если что-то упало — toast + переход
 * в onboarding. См. wiki/toraseo/hard-dependency-pivot.md.
 *
 * URL и состояние скана сбрасываются при возврате на главную, но
 * selectedTools сохраняются — юзер может несколько раз сканировать
 * один сайт с одной подборкой tool'ов.
 */
export default function App() {
  const [mode, setMode] = useState<AppMode>("idle");
  const [url, setUrl] = useState("");
  const [selectedTools, setSelectedTools] = useState<Set<ToolId>>(
    () => new Set(DEFAULT_SELECTED_TOOLS),
  );
  const [preflightError, setPreflightError] = useState<string | null>(null);

  const { stages, scanState, summary, startScan } = useScan();
  const {
    status: detectorStatus,
    checkNow,
    openClaude,
    pickMcpConfig,
    clearManualMcpConfig,
    downloadSkillZip,
    openSkillReleasesPage,
    confirmSkillInstalled,
    clearSkillConfirmation,
  } = useDetector();

  // Hard dependencies gate. Until allGreen, the onboarding screen
  // takes over. We allow allGreen===undefined (status not yet
  // received) to fall through to the regular UI for one render —
  // but useDetector typically delivers the first status within
  // 100ms thanks to the immediate first tick in detector.ts.
  const isOnboarding =
    detectorStatus !== null && !detectorStatus.allGreen;

  const handleModeSelect = (selected: "site" | "content") => {
    if (selected === "content") {
      // v0.2 — disabled in MVP
      return;
    }
    setMode(selected);
  };

  const handleReturnHome = () => {
    if (scanState === "scanning") {
      const confirmed = window.confirm(
        "Прервать текущий анализ?\n\nРезультаты сканирования будут потеряны.",
      );
      if (!confirmed) return;
    }
    setMode("idle");
    setUrl("");
    // useScan сам перезапишет stages при следующем startScan;
    // визуально это эквивалентно сбросу.
  };

  const handleToggleTool = (toolId: ToolId) => {
    setSelectedTools((prev) => {
      const next = new Set(prev);
      if (next.has(toolId)) {
        next.delete(toolId);
      } else {
        next.add(toolId);
      }
      return next;
    });
  };

  const handleStartScan = async () => {
    setPreflightError(null);

    // Pre-flight: re-check dependencies right now, bypassing the
    // polling cache. This closes the race window where the user
    // clicks the scan button within the 5-second poll interval
    // after Claude was closed.
    const fresh = await checkNow();
    if (!fresh.allGreen) {
      setPreflightError(
        "Проверка зависимостей не пройдена. Откройте Claude Desktop, убедитесь что MCP подключён и Skill установлен.",
      );
      // Returning to idle takes the user back to the main screen,
      // which now renders the onboarding overlay automatically
      // (because isOnboarding is now true).
      setMode("idle");
      return;
    }

    // Preserve UI order from TOOLS config (alphabetical insertion into
    // a Set isn't guaranteed). The renderer doesn't depend on this for
    // correctness — main runs them in parallel — but ordering keeps the
    // sidebar tooltip text and the main-area stage list in sync.
    const orderedIds = TOOLS.map((t) => t.id).filter((id) =>
      selectedTools.has(id),
    );
    startScan(url.trim(), orderedIds);
  };

  // ===================================================================
  // Onboarding mode — replaces the entire main area until allGreen
  // ===================================================================
  if (isOnboarding) {
    return (
      <div className="flex h-full flex-col bg-orange-50/30">
        <TopToolbar />
        <div className="flex flex-1 overflow-hidden">
          {/* During onboarding the sidebar is fully replaced by a calm
              "locked" panel — we don't render IdleSidebar underneath
              because its text bleeds through any translucent overlay.
              Once allGreen flips, the normal layout takes over and the
              real sidebar comes back. */}
          <aside className="flex w-[260px] shrink-0 items-center justify-center border-r border-outline/10 bg-white p-6">
            <p className="text-center text-sm font-medium leading-relaxed text-slate-700">
              Завершите проверку справа,<br />
              чтобы продолжить
            </p>
          </aside>

          <main className="flex-1 overflow-auto">
            <OnboardingView
              status={detectorStatus}
              onOpenClaude={openClaude}
              onPickMcpConfig={pickMcpConfig}
              onClearManualMcpConfig={clearManualMcpConfig}
              onDownloadSkillZip={downloadSkillZip}
              onOpenSkillReleasesPage={openSkillReleasesPage}
              onConfirmSkillInstalled={confirmSkillInstalled}
              onClearSkillConfirmation={clearSkillConfirmation}
            />
          </main>
        </div>

        <UpdateNotification />
      </div>
    );
  }

  // ===================================================================
  // Normal mode — all hard dependencies satisfied
  // ===================================================================
  return (
    <div className="flex h-full flex-col bg-orange-50/30">
      <TopToolbar />
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar — fixed 260px */}
        <aside className="relative w-[260px] shrink-0 border-r border-outline/10 bg-white">
          {mode === "idle" ? (
            <IdleSidebar />
          ) : (
            <ActiveSidebar
              url={url}
              onUrlChange={setUrl}
              selectedTools={selectedTools}
              onToggleTool={handleToggleTool}
              scanState={scanState}
              onReturnHome={handleReturnHome}
              onStartScan={handleStartScan}
            />
          )}
        </aside>

        {/* Main area — flexible */}
        <main className="flex-1 overflow-auto">
          {mode === "idle" ? (
            <ModeSelection onSelect={handleModeSelect} />
          ) : (
            <SiteAuditView
              url={url}
              scanState={scanState}
              selectedTools={selectedTools}
              stages={stages}
              summary={summary}
            />
          )}

          {/* Pre-flight error toast: shown briefly when the user
              clicked Scan but a hard dependency had just dropped. */}
          {preflightError && (
            <div className="fixed left-1/2 top-16 z-50 -translate-x-1/2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 shadow-lg">
              {preflightError}
            </div>
          )}
        </main>
      </div>

      {/* Auto-update notification — fixed bottom-right, non-modal.
          Renders only when there's an update event in flight. */}
      <UpdateNotification />
    </div>
  );
}
