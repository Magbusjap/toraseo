import { BrowserWindow, shell } from "electron";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import type { RuntimeChatWindowSession } from "../../src/types/runtime.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const CHAT_WINDOW_CHANNELS = {
  getSession: "toraseo:runtime:chat-window:get-session",
  sessionUpdate: "toraseo:runtime:chat-window:session-update",
} as const;

let chatWindow: BrowserWindow | null = null;
let currentSession: RuntimeChatWindowSession = {
  status: "ended",
  locale: "en",
  analysisType: "site",
  selectedModelProfile: null,
  scanContext: null,
  articleTextContext: null,
  articleTextRunState: "idle",
  report: null,
  endedReason: "No active analysis session.",
};

function rendererEntryUrl(): string {
  const devUrl = process.env.ELECTRON_RENDERER_URL;
  if (devUrl) {
    return `${devUrl}#ai-chat`;
  }
  const rendererPath = path.join(
    __dirname,
    "..",
    "renderer",
    "index.html",
  );
  return `${pathToFileURL(rendererPath).toString()}#ai-chat`;
}

function emitSession(): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed()) continue;
    win.webContents.send(CHAT_WINDOW_CHANNELS.sessionUpdate, currentSession);
  }
}

function ensureChatWindow(): BrowserWindow {
  if (chatWindow && !chatWindow.isDestroyed()) {
    return chatWindow;
  }

  chatWindow = new BrowserWindow({
    width: 780,
    height: 860,
    minWidth: 520,
    minHeight: 620,
    title: "ToraSEO AI Chat",
    backgroundColor: "#ffffff",
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "..", "preload", "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  chatWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http://") || url.startsWith("https://")) {
      shell.openExternal(url);
    }
    return { action: "deny" };
  });

  chatWindow.webContents.on("did-finish-load", emitSession);
  chatWindow.on("ready-to-show", () => {
    chatWindow?.show();
  });
  chatWindow.on("closed", () => {
    chatWindow = null;
  });

  void chatWindow.loadURL(rendererEntryUrl());
  return chatWindow;
}

export async function openChatWindow(
  session: RuntimeChatWindowSession,
): Promise<{ ok: boolean }> {
  currentSession = session;
  const win = ensureChatWindow();
  if (!win.isVisible()) {
    win.show();
  }
  win.focus();
  emitSession();
  return { ok: true };
}

export async function updateChatWindowSession(
  session: RuntimeChatWindowSession,
): Promise<{ ok: boolean }> {
  currentSession = session;
  emitSession();
  return { ok: true };
}

export async function endChatWindowSession(): Promise<{ ok: boolean }> {
  currentSession = {
    ...currentSession,
    status: "ended",
    scanContext: null,
    articleTextRunState: "idle",
    report: null,
    endedReason: "Session ended",
  };
  emitSession();
  return { ok: true };
}

export async function closeChatWindow(): Promise<{ ok: boolean }> {
  if (chatWindow && !chatWindow.isDestroyed()) {
    chatWindow.close();
    chatWindow = null;
  }
  currentSession = {
    ...currentSession,
    status: "ended",
    scanContext: null,
    articleTextRunState: "idle",
    report: null,
    endedReason: "Session ended",
  };
  return { ok: true };
}

export function getChatWindowSession(): RuntimeChatWindowSession {
  return currentSession;
}
