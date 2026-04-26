import type { ScanState } from "../../App";
import type { ToolId } from "../../config/tools";
import { TOOLS } from "../../config/tools";
import sleepingMascot from "@branding/mascots/tora-sleeping.svg";
import focusedMascot from "@branding/mascots/tora-focused.svg";
import happyMascot from "@branding/mascots/tora-happy.svg";

interface SiteAuditViewProps {
  url: string;
  scanState: ScanState;
  selectedTools: Set<ToolId>;
}

/**
 * SiteAuditView — main area в режиме Site Audit.
 *
 * MVP-версия: показывает текущий статус сканирования + маскот +
 * количество выбранных tool'ов. Прогресс-бар, список этапов и
 * финальный отчёт — в следующей итерации (после рефакторинга
 * mcp/ → core/ и подключения IPC).
 */
export default function SiteAuditView({
  url,
  scanState,
  selectedTools,
}: SiteAuditViewProps) {
  const trimmedUrl = url.trim();
  const selectedCount = selectedTools.size;
  const totalCount = TOOLS.length;

  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 px-8 py-12">
      {/* Logo header */}
      <header className="text-center">
        <h1 className="font-display text-2xl font-bold tracking-tight text-outline-900">
          ToraSEO
        </h1>
      </header>

      {/* Status indicator */}
      <StatusIndicator scanState={scanState} />

      {/* Mascot */}
      <img
        src={getMascotForState(scanState)}
        alt={getMascotAlt(scanState)}
        className="h-40 w-40"
        draggable={false}
      />

      {/* Body — depends on state */}
      <div className="text-center">
        {scanState === "ready" && (
          <ReadyView
            hasUrl={trimmedUrl.length > 0}
            url={trimmedUrl}
            selectedCount={selectedCount}
            totalCount={totalCount}
          />
        )}
        {scanState === "scanning" && (
          <ScanningView url={trimmedUrl} selectedCount={selectedCount} />
        )}
        {scanState === "complete" && (
          <CompleteView url={trimmedUrl} selectedCount={selectedCount} />
        )}
      </div>
    </div>
  );
}

function StatusIndicator({ scanState }: { scanState: ScanState }) {
  const { dotClass, label } = getStatusMeta(scanState);
  return (
    <div className="flex items-center gap-2 text-sm text-outline-900/70">
      <span
        className={`h-2.5 w-2.5 rounded-full ${dotClass}`}
        aria-hidden="true"
      />
      <span>{label}</span>
    </div>
  );
}

interface ReadyViewProps {
  hasUrl: boolean;
  url: string;
  selectedCount: number;
  totalCount: number;
}

function ReadyView({ hasUrl, url, selectedCount, totalCount }: ReadyViewProps) {
  if (!hasUrl) {
    return (
      <p className="text-base text-outline-900/70">
        Введите URL сайта в боковой панели,
        <br />
        чтобы начать аудит
      </p>
    );
  }
  return (
    <div className="space-y-2">
      <p className="text-base text-outline-900/70">Готов к сканированию</p>
      <p className="font-mono text-sm text-outline-900">{url}</p>
      <p className="text-sm text-outline-900/50">
        Выбрано проверок: {selectedCount} / {totalCount}
        <br />
        Нажмите «Сканировать» в боковой панели
      </p>
    </div>
  );
}

function ScanningView({ url, selectedCount }: { url: string; selectedCount: number }) {
  return (
    <div className="space-y-2">
      <p className="text-base text-outline-900">Анализ сайта</p>
      <p className="font-mono text-sm text-outline-900/70">{url}</p>
      <p className="mt-4 text-sm text-outline-900/50">
        Запущено проверок: {selectedCount}
        <br />
        <span className="text-xs">Прогресс по этапам появится здесь (в разработке)</span>
      </p>
    </div>
  );
}

function CompleteView({ url, selectedCount }: { url: string; selectedCount: number }) {
  return (
    <div className="space-y-2">
      <p className="text-base text-outline-900">Анализ завершён</p>
      <p className="font-mono text-sm text-outline-900/70">{url}</p>
      <p className="mt-4 text-sm text-outline-900/50">
        Проверено: {selectedCount} {pluralChecks(selectedCount)}
        <br />
        <span className="text-xs">Отчёт появится здесь (в разработке)</span>
      </p>
    </div>
  );
}

function pluralChecks(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return "проверка";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return "проверки";
  return "проверок";
}

function getStatusMeta(scanState: ScanState): {
  dotClass: string;
  label: string;
} {
  switch (scanState) {
    case "ready":
      return { dotClass: "bg-status-ready", label: "Ready" };
    case "scanning":
      return { dotClass: "bg-status-working animate-pulse", label: "Working" };
    case "complete":
      return { dotClass: "bg-status-complete", label: "Complete" };
  }
}

function getMascotForState(scanState: ScanState): string {
  switch (scanState) {
    case "ready":
      return sleepingMascot;
    case "scanning":
      return focusedMascot;
    case "complete":
      return happyMascot;
  }
}

function getMascotAlt(scanState: ScanState): string {
  switch (scanState) {
    case "ready":
      return "Маскот ToraSEO в режиме ожидания";
    case "scanning":
      return "Маскот ToraSEO сосредоточен на анализе";
    case "complete":
      return "Маскот ToraSEO — анализ завершён";
  }
}
