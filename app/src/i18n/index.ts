/**
 * i18next initialization.
 *
 * Bilingual baseline (EN primary, RU secondary). The EN bundle is
 * the source of truth — keys are added there first; missing RU keys
 * fall back to EN automatically (`fallbackLng: "en"`).
 *
 * Initialization is async — the renderer must call `initI18n()`
 * before mounting `<App />` so the very first render already has
 * translations in place. See `main.tsx`.
 *
 * Locale resolution order at startup:
 *   1. `window.toraseo.locale.get()` — user's persisted choice from
 *      `userData/locale.txt`
 *   2. `window.toraseo.locale.getOs()` — Electron's `app.getLocale()`
 *      mapped to one of our supported locales by main process
 *   3. Hardcoded "en" — only if both IPC calls fail (preload missing)
 *
 * Changing language at runtime: call `i18n.changeLanguage(locale)`
 * from the Settings UI, then call `window.toraseo.locale.set(locale)`
 * to persist. The two operations are independent — the in-memory
 * change updates the UI immediately; the IPC call survives the
 * next app start.
 */

import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import en from "./locales/en.json";
import ru from "./locales/ru.json";

import type { SupportedLocale } from "../types/ipc";

const LOCALE_IPC_TIMEOUT_MS = 1_200;

function withTimeout<T>(promise: Promise<T>, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => {
      resolve(fallback);
    }, LOCALE_IPC_TIMEOUT_MS);

    promise
      .then(resolve)
      .catch(() => resolve(fallback))
      .finally(() => {
        window.clearTimeout(timer);
      });
  });
}

/**
 * Resolve the initial language using the three-step fallback chain.
 * Defensive against preload being unavailable (e.g. dev sandbox
 * misconfiguration) — falls back to "en" silently rather than
 * throwing during init.
 */
async function resolveInitialLocale(): Promise<SupportedLocale> {
  if (typeof window === "undefined" || !window.toraseo) {
    return "en";
  }
  try {
    const persisted = await withTimeout(window.toraseo.locale.get(), null);
    if (persisted) {
      return persisted;
    }
  } catch {
    // fall through to OS detection
  }
  try {
    return await withTimeout(window.toraseo.locale.getOs(), "en");
  } catch {
    return "en";
  }
}

export async function initI18n(): Promise<void> {
  const lng = await resolveInitialLocale();

  await i18n.use(initReactI18next).init({
    resources: {
      en: { translation: en },
      ru: { translation: ru },
    },
    lng,
    fallbackLng: "en",
    interpolation: {
      // React already escapes everything — i18next double-escaping
      // would corrupt characters like apostrophes inside our copy.
      escapeValue: false,
    },
    returnNull: false,
  });
}

export default i18n;
