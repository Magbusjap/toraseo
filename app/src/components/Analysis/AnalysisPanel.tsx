/**
 * AnalysisPanel — right column of the native runtime layout.
 *
 * Stage 1 (skeleton): static placeholder cards for the future
 * metrics, charts, issue summary, and PDF export. The actual
 * data wiring (hooked to MCP scan results) lands in Stage 2/3.
 *
 * The "Подробнее" button placeholder is wired here so the second-
 * screen toggle has a stable home before we implement the real
 * window-management code.
 */

interface AnalysisPanelProps {
  onOpenSecondScreen?: () => void;
}

export default function AnalysisPanel({
  onOpenSecondScreen,
}: AnalysisPanelProps) {
  return (
    <section className="flex h-full min-w-0 flex-col border-l border-orange-100 bg-orange-50/40">
      <header className="flex items-center justify-between border-b border-orange-100 bg-white px-5 py-3">
        <div>
          <h2 className="text-sm font-semibold text-orange-900">
            Analysis Results
          </h2>
          <p className="text-xs text-orange-700/70">
            Metrics · charts · facts vs hypotheses
          </p>
        </div>
        <span className="rounded-full bg-orange-50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-orange-700">
          Stage 1 skeleton
        </span>
      </header>

      <div className="flex-1 space-y-4 overflow-auto px-5 py-4">
        <div className="rounded-xl border border-dashed border-orange-200 bg-white p-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-orange-700">
            Overview KPIs
          </h3>
          <p className="mt-1 text-sm text-orange-950/70">
            Total issues, severity breakdown, scan coverage — wired in
            Stage 2 from MCP scan buffer.
          </p>
        </div>

        <div className="rounded-xl border border-dashed border-orange-200 bg-white p-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-orange-700">
            Issue distribution
          </h3>
          <p className="mt-1 text-sm text-orange-950/70">
            Critical / Warning / Info chart placeholder.
          </p>
        </div>

        <div className="rounded-xl border border-dashed border-orange-200 bg-white p-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-orange-700">
            Facts vs Expert hypotheses
          </h3>
          <p className="mt-1 text-sm text-orange-950/70">
            Two columns side by side once orchestrator output contract
            lands in Stage 2.
          </p>
        </div>

        <div className="rounded-xl border border-dashed border-orange-200 bg-white p-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-orange-700">
            Export
          </h3>
          <p className="mt-1 text-sm text-orange-950/70">
            PDF export with charts and recommendations — Stage 3.
          </p>
        </div>
      </div>

      <footer className="border-t border-orange-100 bg-white px-5 py-3">
        <button
          type="button"
          onClick={onOpenSecondScreen}
          disabled={!onOpenSecondScreen}
          className="w-full rounded-lg border border-orange-200 bg-white px-4 py-2 text-sm font-medium text-orange-700 shadow-sm transition-colors hover:bg-orange-50 disabled:opacity-50"
        >
          Подробнее (Stage 3 second-screen)
        </button>
      </footer>
    </section>
  );
}
