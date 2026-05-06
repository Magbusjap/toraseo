import { app } from "electron";
import { promises as fs } from "node:fs";
import path from "node:path";
import log from "electron-log";

import type {
  BridgeAnalysisInput,
  BridgeAnalysisType,
  BridgeClient,
  BridgeWorkspace,
} from "../../src/types/ipc.js";

const CACHE_DIR_NAME = "bridge-cache";
const TTL_DAYS = 7;
const TTL_MS = TTL_DAYS * 24 * 60 * 60 * 1000;

interface CreateWorkspaceOptions {
  scanId: string;
  bridgeClient: BridgeClient;
  analysisType: BridgeAnalysisType;
  url: string;
  selectedTools: string[];
  input?: BridgeAnalysisInput;
  createdAt: string;
}

function cacheRoot(): string {
  return path.join(app.getPath("userData"), CACHE_DIR_NAME);
}

async function writeJsonAtomic(filePath: string, payload: unknown): Promise<void> {
  const tmpPath = `${filePath}.${process.pid}.tmp`;
  await fs.writeFile(tmpPath, JSON.stringify(payload, null, 2), "utf-8");
  await fs.rename(tmpPath, filePath);
}

async function writeTextAtomic(filePath: string, content: string): Promise<void> {
  const tmpPath = `${filePath}.${process.pid}.tmp`;
  await fs.writeFile(tmpPath, content, "utf-8");
  await fs.rename(tmpPath, filePath);
}

function buildInputMarkdown(options: CreateWorkspaceOptions): string {
  if (options.analysisType === "article_compare") {
    return [
      "# ToraSEO Article Compare Input",
      "",
      `Goal: ${options.input?.goal?.trim() || "стандартный отчет сравнения"}`,
      `Goal mode: ${options.input?.goalMode ?? "standard_comparison"}`,
      `Text A role: ${options.input?.roleA ?? "auto"}`,
      `Text B role: ${options.input?.roleB ?? "auto"}`,
      `Platform: ${options.input?.customPlatform?.trim() || options.input?.textPlatform || "auto"}`,
      "",
      "## Text A",
      "",
      options.input?.textA?.trim() ?? "",
      "",
      "## Text B",
      "",
      options.input?.textB?.trim() ?? "",
      "",
    ].join("\n");
  }

  if (options.analysisType === "article_text") {
    const body = options.input?.text?.trim() ?? "";
    if (body) return body;
    const topic = options.input?.topic?.trim() ?? "";
    if (topic && options.input?.action === "solution") {
      return [
        `Тема / запрос: ${topic}`,
        "",
        "Задача пользователя: предложить решение или черновик статьи на основе этой темы и настроек ToraSEO.",
        "Если контекста недостаточно для готового текста, ИИ должен честно назвать, чего не хватает, и предложить следующий шаг.",
        "",
      ].join("\n");
    }
    return "";
  }

  if (options.analysisType === "page_by_url") {
    return options.input?.pageTextBlock?.trim() || options.input?.text?.trim() || "";
  }

  return [
    "# ToraSEO Site Analysis Input",
    "",
    `URL: ${options.url}`,
    `Bridge client: ${options.bridgeClient}`,
    `Selected tools: ${options.selectedTools.join(", ")}`,
    "",
  ].join("\n");
}

export async function cleanupExpiredBridgeWorkspaces(
  activeScanId?: string,
): Promise<void> {
  const root = cacheRoot();
  let entries: string[];
  try {
    entries = await fs.readdir(root);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      log.warn(
        `[bridge:workspace] cleanup failed to list cache: ${
          (error as Error).message
        }`,
      );
    }
    return;
  }

  const now = Date.now();
  for (const entry of entries) {
    if (entry === activeScanId || entry === "latest.json") continue;
    const workspaceDir = path.join(root, entry);
    try {
      const metaRaw = await fs.readFile(
        path.join(workspaceDir, "input.meta.json"),
        "utf-8",
      );
      const meta = JSON.parse(metaRaw) as { expiresAt?: string };
      const expiresAt = meta.expiresAt ? Date.parse(meta.expiresAt) : NaN;
      if (Number.isFinite(expiresAt) && expiresAt > now) continue;
      await fs.rm(workspaceDir, { recursive: true, force: true });
    } catch (error) {
      try {
        const stat = await fs.stat(workspaceDir);
        if (now - stat.mtimeMs > TTL_MS) {
          await fs.rm(workspaceDir, { recursive: true, force: true });
        }
      } catch {
        log.debug(
          `[bridge:workspace] skipped cache cleanup for ${workspaceDir}: ${
            (error as Error).message
          }`,
        );
      }
    }
  }
}

export async function createBridgeWorkspace(
  options: CreateWorkspaceOptions,
): Promise<BridgeWorkspace> {
  await cleanupExpiredBridgeWorkspaces(options.scanId);

  const root = cacheRoot();
  const workspaceDir = path.join(root, options.scanId);
  const resultsDir = path.join(workspaceDir, "results");
  const inputFile = path.join(workspaceDir, "input.md");
  const metaFile = path.join(workspaceDir, "input.meta.json");
  const expiresAt = new Date(Date.parse(options.createdAt) + TTL_MS).toISOString();

  await fs.mkdir(resultsDir, { recursive: true });

  const workspace: BridgeWorkspace = {
    workspaceDir,
    inputFile,
    metaFile,
    resultsDir,
    createdAt: options.createdAt,
    expiresAt,
    ttlDays: TTL_DAYS,
  };

  await writeTextAtomic(inputFile, buildInputMarkdown(options));
  await writeJsonAtomic(metaFile, {
    scanId: options.scanId,
    bridgeClient: options.bridgeClient,
    analysisType: options.analysisType,
    url: options.url,
    selectedTools: options.selectedTools,
    input: options.input
      ? {
          action: options.input.action,
          topic: options.input.topic,
          sourceType: options.input.sourceType,
          goal: options.input.goal,
          goalMode: options.input.goalMode,
          roleA: options.input.roleA,
          roleB: options.input.roleB,
          analysisRole: options.input.analysisRole,
          textPlatform: options.input.textPlatform,
          customPlatform: options.input.customPlatform,
          selectedAnalysisTools: options.input.selectedAnalysisTools,
          hasText: Boolean(options.input.text?.trim()),
          textLength: options.input.text?.length ?? 0,
          hasPageTextBlock: Boolean(options.input.pageTextBlock?.trim()),
          pageTextBlockLength: options.input.pageTextBlock?.length ?? 0,
          hasTextA: Boolean(options.input.textA?.trim()),
          hasTextB: Boolean(options.input.textB?.trim()),
          textALength: options.input.textA?.length ?? 0,
          textBLength: options.input.textB?.length ?? 0,
        }
      : undefined,
    workspace,
  });
  await writeJsonAtomic(path.join(root, "latest.json"), {
    scanId: options.scanId,
    analysisType: options.analysisType,
    workspace,
    updatedAt: new Date().toISOString(),
  });

  return workspace;
}
