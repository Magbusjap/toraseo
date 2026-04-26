import { useState } from "react";
import IdleSidebar from "./components/Sidebar/IdleSidebar";
import ActiveSidebar from "./components/Sidebar/ActiveSidebar";
import ModeSelection from "./components/MainArea/ModeSelection";
import SiteAuditView from "./components/MainArea/SiteAuditView";
import { DEFAULT_SELECTED_TOOLS, type ToolId } from "./config/tools";

export type AppMode = "idle" | "site" | "content";

export type ScanState = "ready" | "scanning" | "complete";

/**
 * Корень приложения.
 *
 * Управляет глобальным состоянием:
 * - mode: текущий режим работы (idle / site / content)
 * - url: введённый адрес сайта для аудита (только в site mode)
 * - selectedTools: какие tools юзер выбрал для запуска
 * - scanState: статус скана (ready / scanning / complete)
 *
 * URL и scanState сбрасываются при возврате на главную, но selectedTools
 * сохраняются — юзер может несколько раз сканировать один сайт с одной
 * подборкой tool'ов.
 */
export default function App() {
  const [mode, setMode] = useState<AppMode>("idle");
  const [url, setUrl] = useState("");
  const [selectedTools, setSelectedTools] = useState<Set<ToolId>>(
    () => new Set(DEFAULT_SELECTED_TOOLS),
  );
  const [scanState, setScanState] = useState<ScanState>("ready");

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
    setScanState("ready");
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
    setScanState("scanning");
    // TODO (next iteration): здесь будет вызов IPC к main process,
    // который запустит выбранные core/ tools. Пока — заглушка с
    // таймером для демонстрации перехода между состояниями.
    setTimeout(() => {
      setScanState("complete");
    }, 2000);
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
          />
        )}
      </main>
    </div>
  );
}
