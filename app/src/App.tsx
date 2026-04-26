import { useState } from "react";
import IdleSidebar from "./components/Sidebar/IdleSidebar";
import ActiveSidebar from "./components/Sidebar/ActiveSidebar";
import ModeSelection from "./components/MainArea/ModeSelection";
import SiteAuditView from "./components/MainArea/SiteAuditView";
import { DEFAULT_SELECTED_TOOLS, TOOLS, type ToolId } from "./config/tools";
import { useScan } from "./hooks/useScan";

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

  const { stages, scanState, summary, startScan } = useScan();

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

  const handleStartScan = () => {
    // Preserve UI order from TOOLS config (alphabetical insertion into
    // a Set isn't guaranteed). The renderer doesn't depend on this for
    // correctness — main runs them in parallel — but ordering keeps the
    // sidebar tooltip text and the main-area stage list in sync.
    const orderedIds = TOOLS.map((t) => t.id).filter((id) =>
      selectedTools.has(id),
    );
    startScan(url.trim(), orderedIds);
  };

  return (
    <div className="flex h-full bg-orange-50/30">
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
      </main>
    </div>
  );
}
