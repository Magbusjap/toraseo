import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";

import {
  readManualAppPath,
  type LaunchAppId,
} from "./appPathStore.js";

export function launchCandidates(appId: LaunchAppId): string[] {
  if (process.platform === "win32") {
    return appId === "claude"
      ? windowsClaudeCandidates()
      : windowsCodexCandidates();
  }

  if (process.platform === "darwin") {
    return appId === "claude" ? macClaudeCandidates() : macCodexCandidates();
  }

  return appId === "claude" ? linuxClaudeCandidates() : linuxCodexCandidates();
}

export async function resolveLaunchPath(
  appId: LaunchAppId,
): Promise<string | null> {
  const manual = await readManualAppPath(appId);
  if (manual && (await canRead(manual))) {
    return manual;
  }

  if (process.platform === "win32" && appId === "codex") {
    const packagedAppTarget = await windowsPackagedAppFallback(appId);
    if (packagedAppTarget) {
      return packagedAppTarget;
    }
  }

  const directPath = await firstExisting(launchCandidates(appId));
  if (directPath) {
    return directPath;
  }

  if (process.platform === "win32") {
    const protocolTarget = await windowsProtocolFallback(appId);
    if (protocolTarget) {
      return protocolTarget;
    }
  }

  return null;
}

async function firstExisting(paths: string[]): Promise<string | null> {
  for (const p of paths) {
    if (await canRead(p)) {
      return p;
    }
  }
  return null;
}

async function canRead(p: string): Promise<boolean> {
  try {
    await fs.access(p, fs.constants.F_OK);
    return true;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "EACCES" || code === "EPERM") {
      return true;
    }
    return false;
  }
}

async function windowsProtocolFallback(
  appId: LaunchAppId,
): Promise<string | null> {
  const localAppData =
    process.env.LOCALAPPDATA ??
    path.join(os.homedir(), "AppData", "Local");

  if (appId === "claude") {
    if (await canRead(path.join(localAppData, "Claude"))) {
      return "claude://";
    }
    return null;
  }

  if (
    (await canRead(path.join(localAppData, "Codex"))) ||
    (await canRead(path.join(localAppData, "OpenAI", "Codex")))
  ) {
    return "codex://";
  }

  return null;
}

async function windowsPackagedAppFallback(
  appId: LaunchAppId,
): Promise<string | null> {
  if (appId !== "codex") return null;

  const localAppData =
    process.env.LOCALAPPDATA ??
    path.join(os.homedir(), "AppData", "Local");
  const packagesDir = path.join(localAppData, "Packages");

  try {
    const entries = await fs.readdir(packagesDir, { withFileTypes: true });
    const codexPackage = entries.find(
      (entry) => entry.isDirectory() && entry.name.startsWith("OpenAI.Codex_"),
    );
    if (codexPackage) {
      return `shell:AppsFolder\\${codexPackage.name}!App`;
    }
  } catch {
    // Package discovery is best-effort; direct/protocol candidates still run.
  }

  return null;
}

function windowsClaudeCandidates(): string[] {
  const localAppData =
    process.env.LOCALAPPDATA ??
    path.join(os.homedir(), "AppData", "Local");
  const programFiles =
    process.env["PROGRAMFILES"] ?? "C:\\Program Files";
  const programFilesX86 =
    process.env["PROGRAMFILES(X86)"] ?? "C:\\Program Files (x86)";

  return [
    path.join(localAppData, "Claude", "Claude.exe"),
    path.join(localAppData, "Claude", "app", "Claude.exe"),
    path.join(localAppData, "Programs", "claude", "Claude.exe"),
    path.join(localAppData, "Programs", "Claude", "Claude.exe"),
    path.join(programFiles, "Claude", "Claude.exe"),
    path.join(programFilesX86, "Claude", "Claude.exe"),
  ];
}

function windowsCodexCandidates(): string[] {
  const localAppData =
    process.env.LOCALAPPDATA ??
    path.join(os.homedir(), "AppData", "Local");
  const programFiles =
    process.env["PROGRAMFILES"] ?? "C:\\Program Files";
  const programFilesX86 =
    process.env["PROGRAMFILES(X86)"] ?? "C:\\Program Files (x86)";

  return [
    path.join(localAppData, "Codex", "Codex.exe"),
    path.join(localAppData, "Codex", "app", "Codex.exe"),
    path.join(localAppData, "OpenAI", "Codex", "bin", "codex.exe"),
    path.join(localAppData, "OpenAI", "Codex", "Codex.exe"),
    path.join(localAppData, "OpenAI", "Codex", "app", "Codex.exe"),
    path.join(localAppData, "Microsoft", "WindowsApps", "Codex.exe"),
    path.join(localAppData, "Programs", "Codex", "Codex.exe"),
    path.join(localAppData, "Programs", "OpenAI Codex", "Codex.exe"),
    path.join(programFiles, "Codex", "Codex.exe"),
    path.join(programFiles, "OpenAI Codex", "Codex.exe"),
    path.join(programFilesX86, "Codex", "Codex.exe"),
    path.join(programFilesX86, "OpenAI Codex", "Codex.exe"),
  ];
}

function macClaudeCandidates(): string[] {
  const home = os.homedir();
  return [
    "/Applications/Claude.app",
    path.join(home, "Applications", "Claude.app"),
  ];
}

function macCodexCandidates(): string[] {
  const home = os.homedir();
  return [
    "/Applications/Codex.app",
    "/Applications/OpenAI Codex.app",
    path.join(home, "Applications", "Codex.app"),
    path.join(home, "Applications", "OpenAI Codex.app"),
  ];
}

function linuxClaudeCandidates(): string[] {
  const home = os.homedir();
  return [
    "/usr/bin/claude",
    "/usr/local/bin/claude",
    path.join(home, ".local", "bin", "claude"),
  ];
}

function linuxCodexCandidates(): string[] {
  const home = os.homedir();
  return [
    "/usr/bin/codex",
    "/usr/local/bin/codex",
    path.join(home, ".local", "bin", "codex"),
  ];
}
