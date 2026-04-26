import { app, BrowserWindow, shell } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";

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
      // electron-vite кладёт preload в out/preload/preload.mjs
      // (имя берётся из entry: electron/preload.ts → preload.mjs)
      preload: path.join(__dirname, "..", "preload", "preload.mjs"),
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

app.whenReady().then(() => {
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
