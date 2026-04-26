import { app, BrowserWindow, ipcMain, shell } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { IPC_CHANNELS, startScan } from "./tools.js";
import type { StartScanArgs } from "../src/types/ipc";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: "ToraSEO",
    backgroundColor: "#FFF7F0",
    autoHideMenuBar: true,
    show: false, // показываем окно после ready-to-show, чтобы не было flash
    webPreferences: {
      // electron-vite кладёт preload в out/preload/preload.js
      // (CommonJS, потому что sandbox прелоад требует CJS —
      // см. комментарий в electron.vite.config.ts).
      preload: path.join(__dirname, "..", "preload", "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.on("ready-to-show", () => {
    mainWindow?.show();
  });

  // Открываем внешние ссылки в системном браузере, не внутри окна
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http://") || url.startsWith("https://")) {
      shell.openExternal(url);
    }
    return { action: "deny" };
  });

  // electron-vite инжектит ELECTRON_RENDERER_URL в dev-режиме
  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
    mainWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    // Production: рендерер собран в out/renderer/index.html, грузим
    // через file:// — никакого HTTP-сервера, VPN никак не влияет.
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

  app.on("activate", () => {
    // macOS: пересоздать окно при клике на иконку в доке если все
    // окна закрыты
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  // Выходим когда все окна закрыты, кроме macOS где принято
  // оставлять приложение активным
  if (process.platform !== "darwin") {
    app.quit();
  }
});
