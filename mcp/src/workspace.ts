import { promises as fs } from "node:fs";
import path from "node:path";

import { readState, userDataDirs, type CurrentScanState } from "./stateFile.js";

interface LatestWorkspaceFile {
  scanId: string;
  analysisType?: CurrentScanState["analysisType"];
  workspace?: CurrentScanState["workspace"];
}

async function readTextFile(filePath: string): Promise<string | null> {
  try {
    return await fs.readFile(filePath, "utf-8");
  } catch {
    return null;
  }
}

async function writeJsonAtomic(filePath: string, payload: unknown): Promise<void> {
  const tmpPath = `${filePath}.${process.pid}.tmp`;
  await fs.writeFile(tmpPath, JSON.stringify(payload, null, 2), "utf-8");
  await fs.rename(tmpPath, filePath);
}

async function readLatestWorkspace(): Promise<LatestWorkspaceFile | null> {
  for (const dir of userDataDirs()) {
    const latestPath = path.join(dir, "bridge-cache", "latest.json");
    try {
      const raw = await fs.readFile(latestPath, "utf-8");
      return JSON.parse(raw) as LatestWorkspaceFile;
    } catch {
      // Try the next app-data candidate.
    }
  }
  return null;
}

export async function readActiveInputMarkdown(
  state: CurrentScanState | null = null,
): Promise<string | null> {
  const activeState = state ?? (await readState());
  const activeFile = activeState?.workspace?.inputFile;
  if (activeFile) {
    const text = await readTextFile(activeFile);
    if (text?.trim()) return text;
  }

  const latest = await readLatestWorkspace();
  const expiresAt = latest?.workspace?.expiresAt
    ? Date.parse(latest.workspace.expiresAt)
    : NaN;
  if (
    (latest?.analysisType === "article_text" ||
      latest?.analysisType === "page_by_url") &&
    latest.workspace?.inputFile &&
    Number.isFinite(expiresAt) &&
    expiresAt > Date.now()
  ) {
    return readTextFile(latest.workspace.inputFile);
  }

  return null;
}

export async function writeActiveInputMarkdown(
  state: CurrentScanState | null,
  content: string,
): Promise<void> {
  const inputFile = state?.workspace?.inputFile;
  if (!inputFile) return;
  const tmpPath = `${inputFile}.${process.pid}.tmp`;
  await fs.writeFile(tmpPath, content, "utf-8");
  await fs.rename(tmpPath, inputFile);
}

export async function writeWorkspaceResult(
  state: CurrentScanState | null,
  toolId: string,
  payload: unknown,
): Promise<void> {
  const resultsDir = state?.workspace?.resultsDir;
  if (!resultsDir) return;
  await fs.mkdir(resultsDir, { recursive: true });
  await writeJsonAtomic(path.join(resultsDir, `${toolId}.json`), payload);
}
