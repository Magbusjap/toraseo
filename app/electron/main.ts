import { app, BrowserWindow, ipcMain, shell } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { IPC_CHANNELS, startScan } from "./tools.js";
import { setupAutoUpdater } from "./updater.js";
import { setupDetector } from "./detector.js";
import { setupLauncher } from "./launcher.js";
import { setupLocale } from "./locale.js";
import type { StartScanArgs } from "../src/types/ipc";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Resolve the runtime path to the app icon.
 *
 * Windows prefers `.ico` for native integrations (taskbar, alt-tab,
 * window titlebar) because it's a multi-resolution format.
 * Linux/macOS use `.png` for window icons; macOS additionally has
 * `.icns` baked into the bundle by electron-builder, which we don't
 * load at runtime.
 *
 * Two layouts to support:
 *   - dev (`npm run dev`): __dirname is `app/out/main/`, icons live
 *     at `app/build/icons/`, so we walk up two levels then into
 *     build/icons.
 *   - production (packaged installer): icons are bundled via
 *     `build.files: ["build/icons/**"]` in package.json, so they
 *     end up inside the asar archive at
 *     `<install>/resources/app.asar/build/icons/`. __dirname is
 *     `<install>/resources/app.asar/out/main/` — same relative
 *     traversal works because asar paths behave like filesystem.
 *
 * IMPORTANT — Electron dev caveat on Windows: even with a valid
 * icon path, `npm run dev` shows the default Electron icon in the
 * taskbar because the host process is `electron.exe` whose own
 * .exe metadata icon takes precedence. Only the in-window titlebar
 * picks up our icon in dev. Packaged builds (after
 * `electron-builder`) work correctly because the host is
 * `ToraSEO.exe` with our icon embedded.
 *
 * If the file is missing for any reason, returns undefined and
 * Electron falls back to its default icon — not a hard failure,
 * just a stale-looking window.
 */
function resolveIconPath(): string | undefined {
  const filename = process.platform === "win32" ? "icon.ico" : "icon.png";
  const candidate = path.join(
    __dirname,
    "..",
    "..",
    "build",
    "icons",
    filename,
  );
  return candidate;
}

let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: "ToraSEO",
    icon: resolveIconPath(),
    backgroundColor: "#FFF7F0",
    autoHideMenuBar: true,
    show: false, // show the window after ready-to-show to avoid flash
    webPreferences: {
      // electron-vite places the preload at out/preload/preload.js
      // (CommonJS, because sandboxed preloads require CJS — see
      // the comment in electron.vite.config.ts).
      preload: path.join(__dirname, "..", "preload", "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.on("ready-to-show", () => {
    mainWindow?.show();
  });

  // Open external links in the system browser, not inside the
  // app window.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http://") || url.startsWith("https://")) {
      shell.openExternal(url);
    }
    return { action: "deny" };
  });

  // electron-vite injects ELECTRON_RENDERER_URL in dev mode.
  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
    mainWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    // Production: the renderer is built into out/renderer/index.html
    // and loaded via file:// — no HTTP server, no VPN interference.
    mainWindow.loadFile(path.join(__dirname, "..", "renderer", "index.html"));
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

/**
 * Register IPC handlers exactly once, on app ready.
 *
 * `start-scan` is a request/response handler: renderer awaits the
 * resulting scanId; from there, progress arrives over the
 * `stage-update` and `scan-complete` channels via `webContents.send`.
 * Those are one-way — the renderer just listens.
 */
function registerIpcHandlers(): void {
  ipcMain.handle(
    IPC_CHANNELS.startScan,
    async (event, args: StartScanArgs) => {
      // Trust boundary: validate everything coming from renderer.
      // Even though our own UI built this payload, the contract here
      // is the only thing standing between an untrusted renderer and
      // the Node.js process. Bad input → throw, IPC reflects that as
      // a rejected promise on the caller side.
      if (!args || typeof args !== "object") {
        throw new Error("Invalid args: expected an object");
      }
      const { url, toolIds } = args;
      if (typeof url !== "string" || url.trim().length === 0) {
        throw new Error("Invalid args: 'url' must be a non-empty string");
      }
      if (!Array.isArray(toolIds) || toolIds.length === 0) {
        throw new Error("Invalid args: 'toolIds' must be a non-empty array");
      }

      // The renderer that sent this is the one we stream back to.
      // sender.session is also fine; we want the originating contents.
      return startScan(event.sender, url.trim(), toolIds);
    },
  );
}

app.whenReady().then(() => {
  registerIpcHandlers();
  createWindow();

  // Auto-updater: registers IPC handlers and kicks off a check
  // 3 seconds after start. Behavior: ask before download, ask
  // before install. See electron/updater.ts for details.
  setupAutoUpdater(() => mainWindow);

  // Hard-dependency detector: polling every 5s for Claude process
  // and MCP config entry. Pushes status to renderer for the
  // onboarding screen. Also exposes synchronous checkNow() for
  // pre-flight before scanning. Skill detection was dropped —
  // see detector.ts header for rationale.
  setupDetector(() => mainWindow);

  // Claude Desktop launcher: invoked by the "Open Claude Desktop"
  // button on the onboarding screen. See electron/launcher.ts for
  // platform-specific path discovery.
  setupLauncher();

  // UI locale persistence: read/write userData/locale.txt and
  // expose app.getLocale() to the renderer for OS-derived defaults.
  // See electron/locale.ts for the storage format and supported
  // values.
  setupLocale();

  app.on("activate", () => {
    // macOS: re-create the window when the dock icon is clicked
    // and all windows are closed.
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  // Quit when all windows are closed, except on macOS where the
  // convention is to keep the app alive in the dock.
  if (process.platform !== "darwin") {
    app.quit();
  }
});
