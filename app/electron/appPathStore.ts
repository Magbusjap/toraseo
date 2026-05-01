import { app } from "electron";
import { promises as fs } from "node:fs";
import path from "node:path";

export type LaunchAppId = "claude" | "codex";

type StoredPaths = Partial<Record<LaunchAppId, string>>;

const STORE_FILE = "manual-app-paths.json";

function storePath(): string {
  return path.join(app.getPath("userData"), STORE_FILE);
}

async function readStore(): Promise<StoredPaths> {
  try {
    const raw = await fs.readFile(storePath(), "utf-8");
    const parsed = JSON.parse(raw) as StoredPaths;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

async function writeStore(next: StoredPaths): Promise<void> {
  await fs.mkdir(path.dirname(storePath()), { recursive: true });
  await fs.writeFile(storePath(), JSON.stringify(next, null, 2), "utf-8");
}

export async function readManualAppPath(
  appId: LaunchAppId,
): Promise<string | null> {
  const store = await readStore();
  const candidate = store[appId];
  return typeof candidate === "string" && candidate.trim() ? candidate : null;
}

export async function writeManualAppPath(
  appId: LaunchAppId,
  appPath: string,
): Promise<void> {
  const store = await readStore();
  store[appId] = appPath;
  await writeStore(store);
}
