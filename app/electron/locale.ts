/**
 * Locale persistence — read and write the user's UI language choice.
 *
 * Storage: a single-line plain text file at
 * `userData/locale.txt` containing either "en" or "ru". Anything
 * else (missing file, unrecognized value, read error) means "no
 * choice yet" — the renderer will then fall back to OS detection.
 *
 * Why a plain text file and not a JSON config:
 * - Single value, no schema to evolve
 * - Trivial to inspect / hand-edit during dev
 * - No risk of JSON parse errors corrupting the whole settings file
 *   when more settings land in v0.0.7+
 *
 * IPC surface:
 *   - getLocale(): read persisted choice, or null if none
 *   - setLocale(locale): write choice, fail-soft on errors
 *   - getOsLocale(): app.getLocale() result, exposed for the
 *     renderer's "no persisted choice → fall back to OS" branch
 */

import { app, ipcMain } from "electron";
import { promises as fs } from "node:fs";
import path from "node:path";
import log from "electron-log";

import type { SupportedLocale } from "../src/types/ipc";

export const LOCALE_CHANNELS = {
  get: "toraseo:locale:get",
  set: "toraseo:locale:set",
  getOs: "toraseo:locale:get-os",
} as const;

const SUPPORTED: ReadonlySet<string> = new Set(["en", "ru"]);

function localeFile(): string {
  return path.join(app.getPath("userData"), "locale.txt");
}

/**
 * Read the persisted locale, normalizing whitespace and case.
 * Returns null when the file is missing or contains something we
 * don't recognize — let the caller decide on fallback behavior.
 */
async function readLocale(): Promise<SupportedLocale | null> {
  try {
    const raw = await fs.readFile(localeFile(), "utf-8");
    const value = raw.trim().toLowerCase();
    if (SUPPORTED.has(value)) {
      return value as SupportedLocale;
    }
    log.warn(
      `[locale] persisted value "${value}" is not in supported set; ignoring`,
    );
    return null;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") {
      log.warn(`[locale] read failed: ${(err as Error).message}`);
    }
    return null;
  }
}

async function writeLocale(locale: SupportedLocale): Promise<void> {
  await fs.writeFile(localeFile(), locale, "utf-8");
}

/**
 * Map Electron's `app.getLocale()` to one of our supported locales.
 *
 * Rule (matches the v0.0.6 design decision): Russian system locale
 * (`ru`, `ru-RU`, etc.) → "ru"; everything else → "en". This keeps
 * the bilingual product simple while we have only two locales; when
 * a third lands, this mapping table grows.
 */
function mapOsLocaleToSupported(osLocale: string): SupportedLocale {
  const lower = osLocale.toLowerCase();
  if (lower === "ru" || lower.startsWith("ru-")) {
    return "ru";
  }
  return "en";
}

export function setupLocale(): void {
  ipcMain.handle(LOCALE_CHANNELS.get, async (): Promise<SupportedLocale | null> => {
    return readLocale();
  });

  ipcMain.handle(
    LOCALE_CHANNELS.set,
    async (_event, locale: SupportedLocale): Promise<{ ok: boolean }> => {
      if (!SUPPORTED.has(locale)) {
        log.warn(`[locale] rejected unknown locale "${locale}"`);
        return { ok: false };
      }
      try {
        await writeLocale(locale);
        log.info(`[locale] persisted: ${locale}`);
        return { ok: true };
      } catch (err) {
        log.error(`[locale] write failed: ${(err as Error).message}`);
        return { ok: false };
      }
    },
  );

  ipcMain.handle(LOCALE_CHANNELS.getOs, async (): Promise<SupportedLocale> => {
    return mapOsLocaleToSupported(app.getLocale());
  });
}
