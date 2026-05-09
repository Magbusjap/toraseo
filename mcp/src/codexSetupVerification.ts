import { promises as fs } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  APP_PRODUCT_NAME,
  CODEX_SETUP_VERIFICATION_FILE,
} from "./constants.js";

const ALIVE_FILE_NAME = "app-alive.json";
const STATE_FILE_NAME = "current-scan.json";

function userDataDirs(): string[] {
  const product = APP_PRODUCT_NAME;
  const devProduct = "ToraSEO Dev";
  const legacyDevSegments = ["@toraseo", "app"];

  switch (process.platform) {
    case "win32": {
      const appdata =
        process.env.APPDATA ??
        path.join(homedir(), "AppData", "Roaming");
      return [
        path.join(appdata, product),
        path.join(appdata, devProduct),
        path.join(appdata, ...legacyDevSegments),
      ];
    }
    case "darwin": {
      const base = path.join(homedir(), "Library", "Application Support");
      return [
        path.join(base, product),
        path.join(base, devProduct),
        path.join(base, ...legacyDevSegments),
      ];
    }
    default: {
      const base =
        process.env.XDG_CONFIG_HOME ?? path.join(homedir(), ".config");
      return [
        path.join(base, product),
        path.join(base, devProduct),
        path.join(base, ...legacyDevSegments),
      ];
    }
  }
}

function sharedBridgeDirs(): string[] {
  const explicit = process.env.TORASEO_BRIDGE_STATE_DIR?.trim();
  const dirs = explicit ? [explicit] : [];
  const cwd = process.cwd();
  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  dirs.push(
    path.resolve(cwd, ".toraseo-bridge"),
    path.resolve(cwd, "..", ".toraseo-bridge"),
    path.resolve(moduleDir, "..", "..", ".toraseo-bridge"),
  );
  return Array.from(new Set(dirs));
}

async function resolveVerificationFilePath(): Promise<string> {
  const sharedDirs = sharedBridgeDirs();
  for (const dir of sharedDirs) {
    try {
      await fs.access(path.join(dir, ALIVE_FILE_NAME));
      return path.join(dir, CODEX_SETUP_VERIFICATION_FILE);
    } catch {
      // try next
    }
  }

  for (const dir of sharedDirs) {
    try {
      await fs.access(path.join(dir, STATE_FILE_NAME));
      return path.join(dir, CODEX_SETUP_VERIFICATION_FILE);
    } catch {
      // try next
    }
  }

  const dirs = userDataDirs();

  for (const dir of dirs) {
    try {
      await fs.access(path.join(dir, ALIVE_FILE_NAME));
      return path.join(dir, CODEX_SETUP_VERIFICATION_FILE);
    } catch {
      // try next
    }
  }

  for (const dir of dirs) {
    try {
      await fs.access(path.join(dir, STATE_FILE_NAME));
      return path.join(dir, CODEX_SETUP_VERIFICATION_FILE);
    } catch {
      // try next
    }
  }

  const fallbackDir = dirs[0] ?? path.join(homedir(), ".config", APP_PRODUCT_NAME);
  await fs.mkdir(fallbackDir, { recursive: true });
  return path.join(fallbackDir, CODEX_SETUP_VERIFICATION_FILE);
}

export async function writeCodexSetupVerification(payload: {
  verifiedAt: string;
  appVersion?: string;
  appPid?: number;
}): Promise<void> {
  const filePath = await resolveVerificationFilePath();
  await fs.writeFile(filePath, JSON.stringify(payload, null, 2), "utf-8");
}
