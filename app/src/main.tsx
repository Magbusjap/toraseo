import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { initI18n } from "./i18n";
import "./index.css";

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
      <App />
    </StrictMode>,
  );
}

void bootstrap();
