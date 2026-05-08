import { app, BrowserWindow, ipcMain, shell } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { IPC_CHANNELS, startScan } from "./tools.js";
import { setupAutoUpdater } from "./updater.js";
import { setupDetector } from "./detector.js";
import { setupLauncher } from "./launcher.js";
import { setupLocale } from "./locale.js";
import { setupBridge } from "./bridge/index.js";
import {
  detectExistingInstance,
  setupAliveFile,
  teardownAliveFile,
} from "./bridge/aliveFile.js";
import { setupRuntime } from "./runtime/index.js";
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
    width: 1400,
    height: 900,
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
    if (process.env.TORASEO_OPEN_DEVTOOLS === "1") {
      mainWindow.webContents.openDevTools({ mode: "detach" });
    }
  } else {
    // Production: the renderer is built into out/renderer/index.html
    // and loaded via file:// — no HTTP server, no VPN interference.
    mainWindow.loadFile(path.join(__dirname, "..", "renderer", "index.html"));
  }

  mainWindow.on("close", () => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (win === mainWindow || win.isDestroyed()) continue;
      win.close();
    }
  });

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

app.whenReady().then(async () => {
  // Stale-lock detection. If a previous app instance crashed and
  // left the alive-file behind, we may need to either ignore it
  // (PID dead) or surface an error (another copy of the app is
  // already running).
  //
  // For v0.0.7 we don't enforce single-instance: detectExistingInstance
  // is informational only. If kind === "alive", we log a warning and
  // continue — the second instance will just overwrite the alive-file
  // on its first heartbeat. A future release can call app.quit() here
  // for hard single-instance enforcement (issue tracking pending).
  const existing = await detectExistingInstance();
  if (existing.kind === "alive") {
    // eslint-disable-next-line no-console
    console.warn(
      `[startup] another ToraSEO instance appears to be running (pid=${existing.pid}); continuing anyway`,
    );
  } else if (existing.kind === "stale") {
    // eslint-disable-next-line no-console
    console.info(
      `[startup] removing stale alive-file from previous instance (pid=${existing.pid})`,
    );
  }

  // Initialize the alive-file so MCP can detect that the App is
  // running. This must happen BEFORE setupBridge() so by the time
  // a user could click Scan, the alive-file already reflects this
  // instance's PID.
  await setupAliveFile();

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
  setupLauncher(() => mainWindow);

  // UI locale persistence: read/write userData/locale.txt and
  // expose app.getLocale() to the renderer for OS-derived defaults.
  // See electron/locale.ts for the storage format and supported
  // values.
  setupLocale();

  // Bridge Mode (v0.0.7+): orchestrates scan lifecycle through a
  // shared state-file with the MCP server. App writes the request,
  // MCP writes results as Claude calls tools, App polls and renders.
  // See electron/bridge/index.ts for IPC channels and lifecycle.
  setupBridge(() => mainWindow);

  // Native Runtime (v0.0.7 redesign): registers IPC handlers for
  // the in-app SKILL runtime, provider adapters, and orchestrator.
  // Disabled by default via feature flag — turn on with
  // TORASEO_NATIVE_RUNTIME=1. See electron/runtime/.
  //
  // Awaited because Stage 2 reads the encrypted-store-backed provider
  // registry from disk; the IPC handlers should be registered by the
  // time the renderer makes its first runtime call.
  await setupRuntime();

  app.on("activate", () => {
    // macOS: re-create the window when the dock icon is clicked
    // and all windows are closed.
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

/**
 * Graceful shutdown: remove the alive-file so MCP sees the App
 * as "not running" on its next probe.
 *
 * before-quit fires before windows close, while we still have a
 * chance to do async work. We pause quit (event.preventDefault),
 * tear down the alive-file, then call app.quit() again — which
 * skips the handler the second time because we set a flag.
 *
 * If something goes wrong with the async cleanup (file locked,
 * disk error), we still proceed with quit — the worst case is a
 * stale alive-file, and MCP's PID-check handles that.
 */
let teardownStarted = false;
app.on("before-quit", (event) => {
  if (teardownStarted) return;
  teardownStarted = true;
  event.preventDefault();
  void (async () => {
    try {
      await teardownAliveFile();
    } catch {
      // ignore; we still need to quit
    }
    app.quit();
  })();
});

app.on("window-all-closed", () => {
  // Quit when all windows are closed, except on macOS where the
  // convention is to keep the app alive in the dock.
  if (process.platform !== "darwin") {
    app.quit();
  }
});
