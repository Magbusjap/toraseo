import {
  Component,
  StrictMode,
  type ErrorInfo,
  type ReactNode,
} from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { initI18n } from "./i18n";
import "./index.css";

class AppErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error): { error: Error } {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error("[renderer] render failed:", error, errorInfo);
  }

  render(): ReactNode {
    if (!this.state.error) {
      return this.props.children;
    }

    return (
      <div className="flex min-h-screen items-center justify-center bg-orange-50/40 px-6 text-outline-900">
        <div className="max-w-lg rounded-xl border border-orange-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-orange-600">
            ToraSEO
          </p>
          <h1 className="mt-2 font-display text-2xl font-semibold">
            The interface could not be rendered
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-outline-900/65">
            ToraSEO caught a renderer error instead of leaving the app blank.
            Reload the window and try the last action again.
          </p>
          <pre className="mt-4 max-h-40 overflow-auto rounded-lg bg-orange-50 px-3 py-2 text-xs text-outline-900/70">
            {this.state.error.message}
          </pre>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-5 rounded-md bg-orange-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-orange-600"
          >
            Reload ToraSEO
          </button>
        </div>
      </div>
    );
  }
}

/**
 * Initialize i18next BEFORE rendering, so the very first paint
 * already has translations resolved. Otherwise components that
 * call `t()` during their initial render would briefly show keys
 * (or English fallbacks) before re-rendering with the correct
 * locale once i18next finishes loading.
 *
 * Failure to init is non-fatal — i18next falls back to "en" with
 * the bundle baked into the JS, and the UI continues. We log to
 * console so dev-time issues are visible in DevTools.
 */
async function bootstrap(): Promise<void> {
  try {
    await initI18n();
  } catch (err) {
    console.error("[i18n] init failed:", err);
  }

  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <AppErrorBoundary>
        <App />
      </AppErrorBoundary>
    </StrictMode>,
  );
}

void bootstrap();
