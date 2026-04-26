import { ArrowLeft, Play, Globe } from "lucide-react";
import type { ScanState } from "../../hooks/useScan";
import { TOOLS, type ToolId } from "../../config/tools";

interface ActiveSidebarProps {
  url: string;
  onUrlChange: (url: string) => void;
  selectedTools: Set<ToolId>;
  onToggleTool: (toolId: ToolId) => void;
  scanState: ScanState;
  onReturnHome: () => void;
  onStartScan: () => void;
}

/**
 * ActiveSidebar — sidebar в состоянии Site Audit.
 *
 * MVP-версия: кнопка возврата + URL + selective tools (7 чекбоксов с
 * tooltip) + кнопка запуска скана. Блок «Настройки скана» (timeout,
 * polite mode) и «Подключение» (статус Claude Desktop) — будут
 * добавлены в следующих итерациях.
 */
export default function ActiveSidebar({
  url,
  onUrlChange,
  selectedTools,
  onToggleTool,
  scanState,
  onReturnHome,
  onStartScan,
}: ActiveSidebarProps) {
  const isScanning = scanState === "scanning";
  const isComplete = scanState === "complete";
  const trimmedUrl = url.trim();
  const hasValidUrl = trimmedUrl.length > 0 && isLikelyUrl(trimmedUrl);
  const hasSelectedTools = selectedTools.size > 0;
  const canScan = hasValidUrl && hasSelectedTools && !isScanning;

  const scanButtonTooltip = !hasValidUrl
    ? "Введите URL сайта"
    : !hasSelectedTools
      ? "Выберите хотя бы одну проверку"
      : isScanning
        ? "Сканирование уже идёт"
        : undefined;

  const scanButtonLabel = isScanning
    ? "Сканирование..."
    : isComplete
      ? "Сканировать заново"
      : "Сканировать";

  return (
    <div className="flex h-full flex-col">
      {/* Header — return button */}
      <header className="border-b border-outline/10 px-4 py-3">
        <button
          type="button"
          onClick={onReturnHome}
          className="flex items-center gap-2 text-sm text-outline-900/70 transition hover:text-primary"
        >
          <ArrowLeft className="h-4 w-4" strokeWidth={2} />
          <span>На главную</span>
        </button>
      </header>

      {/* Body — settings */}
      <div className="flex-1 overflow-y-auto px-4 py-5 space-y-6">
        <SidebarSection title="Проект">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-outline-900/60">
              URL сайта
            </span>
            <div className="relative">
              <Globe
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-outline-900/40"
                strokeWidth={2}
                aria-hidden="true"
              />
              <input
                type="text"
                value={url}
                onChange={(e) => onUrlChange(e.target.value)}
                placeholder="example.com"
                disabled={isScanning}
                spellCheck={false}
                autoCorrect="off"
                autoCapitalize="off"
                className="w-full rounded-md border border-outline/15 bg-white py-2 pl-9 pr-3 text-sm text-outline-900 transition placeholder:text-outline-900/30 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:bg-orange-50/50 disabled:opacity-60"
              />
            </div>
            {trimmedUrl.length > 0 && !isLikelyUrl(trimmedUrl) && (
              <span className="mt-1.5 block text-xs text-status-issues">
                Введите корректный адрес сайта
              </span>
            )}
          </label>
        </SidebarSection>

        <SidebarSection title="Проверки">
          <ul className="space-y-1.5">
            {TOOLS.map((tool) => (
              <ToolCheckbox
                key={tool.id}
                tool={tool}
                checked={selectedTools.has(tool.id)}
                disabled={isScanning}
                onChange={() => onToggleTool(tool.id)}
              />
            ))}
          </ul>
          {!hasSelectedTools && (
            <p className="mt-2 text-xs text-status-issues">
              Выберите хотя бы одну проверку
            </p>
          )}
        </SidebarSection>
      </div>

      {/* Footer — primary CTA */}
      <footer className="border-t border-outline/10 p-4">
        <button
          type="button"
          onClick={onStartScan}
          disabled={!canScan}
          title={scanButtonTooltip}
          className="flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-white transition hover:bg-primary-600 disabled:cursor-not-allowed disabled:bg-outline-900/20"
        >
          <Play className="h-4 w-4 fill-current" strokeWidth={2} />
          <span>{scanButtonLabel}</span>
        </button>
      </footer>
    </div>
  );
}

interface SidebarSectionProps {
  title: string;
  children: React.ReactNode;
}

function SidebarSection({ title, children }: SidebarSectionProps) {
  return (
    <section>
      <h3 className="mb-3 font-mono text-[10px] font-semibold uppercase tracking-[0.15em] text-outline-900/50">
        — {title} —
      </h3>
      {children}
    </section>
  );
}

interface ToolCheckboxProps {
  tool: { id: ToolId; label: string; tooltip: string };
  checked: boolean;
  disabled: boolean;
  onChange: () => void;
}

function ToolCheckbox({ tool, checked, disabled, onChange }: ToolCheckboxProps) {
  return (
    <li>
      <label
        title={tool.tooltip}
        className={`flex cursor-pointer items-center gap-2.5 rounded px-2 py-1.5 text-sm transition ${
          disabled
            ? "cursor-not-allowed opacity-60"
            : "hover:bg-orange-50/60"
        }`}
      >
        <input
          type="checkbox"
          checked={checked}
          onChange={onChange}
          disabled={disabled}
          className="h-4 w-4 cursor-pointer rounded border-outline/30 text-primary accent-primary focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed"
        />
        <span className="select-none text-outline-900">{tool.label}</span>
      </label>
    </li>
  );
}

/**
 * Простая проверка "это похоже на URL?".
 *
 * Принимает:
 * - example.com
 * - https://example.com
 * - https://example.com/path
 * - sub.example.com
 *
 * Не принимает:
 * - просто "test"
 * - "example" (без точки)
 * - пробелы
 */
function isLikelyUrl(value: string): boolean {
  const pattern = /^(https?:\/\/)?[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)+(\/.*)?$/;
  return pattern.test(value);
}
