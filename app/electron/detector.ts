/**
 * Hard-dependency detector for ToraSEO companion-app architecture.
 *
 * The app requires three components to be present before scanning is
 * unlocked. See `wiki/toraseo/hard-dependency-pivot.md` for the
 * design rationale and `wiki/toraseo/hard-deps-phase-1.md` for the
 * implementation notes.
 *
 *   1. Claude Desktop is currently running (a process named "Claude"
 *      / "claude.exe" exists on the system).
 *   2. claude_desktop_config.json contains an `mcpServers.toraseo`
 *      entry — meaning ToraSEO MCP is registered.
 *   3. Claude Bridge Instructions are confirmed installed — either via
 *      filesystem (Claude Code users have them at
 *      `~/.claude/skills/toraseo/`) or via the user's manual
 *      confirmation that they installed the Claude ZIP through Claude
 *      Desktop's Settings → Skills UI.
 *
 * Why three checks, including the manual one:
 *
 * MCP gives Claude the *tools*. Claude Bridge Instructions give Claude
 * the *rules* — CRAWLING_POLICY, verdict-mapping, the CGS scoring
 * formula, the report format, etc. Without those instructions loaded
 * into Claude's context,
 * the user's "analyze this site" request still works mechanically
 * (MCP tools return raw JSON), but the answer is no longer the
 * ToraSEO methodology — it's whatever generic interpretation the
 * underlying Claude does. That's a silent quality regression we
 * can't accept: users came for ToraSEO, and we owe them ToraSEO.
 *
 * The original v0.0.3 plan tried to detect the Claude package via
 * filesystem, then
 * dropped detection entirely after realising Claude Desktop skills
 * are server-side (account-bound) and `~/.claude/skills/` only applies
 * to Claude Code (CLI). The drop was wrong in retrospect: it solved
 * a technical truth-in-detection problem at the cost of a product
 * gate. Returning the check with hybrid semantics lets us be both
 * honest and disciplined:
 *
 *   - Claude Code users: filesystem says yes → ✓ automatically
 *   - Claude Desktop users: there's no filesystem signal we can
 *     trust, so we ask them to install the Claude package via the
 *     in-app download/install flow and click
 *     "I installed Claude Bridge Instructions" — which writes a marker
 *     file in userData. Honest manual confirmation, not pretend
 *     automatic detection.
 *
 * Two access patterns:
 *
 *   - Polling (started in main on app ready). Every POLL_INTERVAL_MS
 *     re-checks all three and emits a status update event to the
 *     renderer. This drives the live checkboxes in the onboarding
 *     screen.
 *
 *   - On-demand `checkNow()` — bypasses the polling cache and runs
 *     all checks synchronously. Used by the renderer immediately
 *     before kicking off a scan, to close the race window between
 *     the last poll tick and the user click.
 */

import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import { execFile as execFileCallback } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { promisify } from "node:util";
import psList from "ps-list";
import log from "electron-log";
import { resolveLaunchPath } from "./launchPaths.js";

const execFile = promisify(execFileCallback);
const CODEX_SETUP_VERIFICATION_FILE = "codex-setup-verification.json";

// 5 seconds is the compromise from hard-dependency-pivot Q3:
// fast enough that "Claude closed" → UI reflects it within 5s
// (perceived as "instant"), light enough that pslist polling
// stays under 1% CPU on average.
const POLL_INTERVAL_MS = 5000;

export const DETECTOR_CHANNELS = {
  // renderer → main
  checkNow: "toraseo:detector:check-now",
  installMcpConfig: "toraseo:detector:install-mcp-config",
  pickMcpConfig: "toraseo:detector:pick-mcp-config",
  clearManualMcpConfig: "toraseo:detector:clear-manual-mcp-config",
  getManualMcpConfig: "toraseo:detector:get-manual-mcp-config",
  confirmSkillInstalled: "toraseo:detector:confirm-skill-installed",
  clearSkillConfirmation: "toraseo:detector:clear-skill-confirmation",
  downloadSkillZip: "toraseo:detector:download-skill-zip",
  downloadCodexWorkflowZip: "toraseo:detector:download-codex-workflow-zip",
  openSkillReleasesPage: "toraseo:detector:open-skill-releases-page",
  // main → renderer (push)
  statusUpdate: "toraseo:detector:status-update",
} as const;

export interface DetectorStatus {
  /** Claude Desktop process running anywhere on the system. */
  claudeRunning: boolean;
  /** Codex desktop process running anywhere on the system. */
  codexRunning: boolean;
  /** Codex setup was verified in a live no-scan session. */
  codexSetupVerified: boolean;
  /** Timestamp of the last successful Codex setup verification. */
  codexSetupVerifiedAt: string | null;
  /** mcpServers.toraseo present in claude_desktop_config.json. */
  mcpRegistered: boolean;
  /**
   * Skill is confirmed installed via filesystem OR manual flag.
   * `skillSource` tells us which path produced the truth, so the UI
   * can show different copy ("found at ~/.claude/skills/..." vs
   * "manually confirmed"); falsy → red card.
   */
  skillInstalled: boolean;
  skillSource: "filesystem" | "manual" | null;
  /** Full Claude Bridge path is ready. Text flows can still use Skill-only fallback. */
  allGreen: boolean;
  /** ISO-8601 timestamp; for staleness checks if needed. */
  checkedAt: string;
  /**
   * Path the user picked manually via the file dialog, if any.
   * Null means MCP detection is using only the canonical four-path
   * fallback.
   */
  manualMcpPath: string | null;
  /** Claude Desktop path found automatically or selected manually. */
  claudeAppPath: string | null;
  /** Codex path found automatically or selected manually. */
  codexAppPath: string | null;
}

export interface PickMcpConfigResult {
  ok: boolean;
  path?: string;
  hasToraseo?: boolean;
  reason?: "cancelled" | "read-error" | "parse-error";
  errorMessage?: string;
}

export interface DownloadSkillZipResult {
  ok: boolean;
  /** Path on disk where the ZIP was saved (in user's Downloads). */
  filePath?: string;
  /** Tag name of the release that was downloaded (e.g., "v0.0.9"). */
  releaseTag?: string;
  /** Set when ok=false. */
  error?: string;
}

// =====================================================================
// Manual marker file persistence (MCP path + Skill confirmation)
// =====================================================================

function manualMcpPathFile(): string {
  return path.join(app.getPath("userData"), "manual-mcp-path.txt");
}

function skillConfirmationFile(): string {
  return path.join(app.getPath("userData"), "skill-installed.flag");
}

function codexSetupVerificationFile(): string {
  return path.join(app.getPath("userData"), CODEX_SETUP_VERIFICATION_FILE);
}

function packagedMcpEntryPath(): string {
  if (app.isPackaged) {
    return path.join(
      process.resourcesPath,
      "mcp-runtime",
      "mcp",
      "dist",
      "index.js",
    );
  }

  return path.resolve(app.getAppPath(), "..", "mcp", "dist", "index.js");
}

async function resolveNodeCommand(): Promise<string> {
  if (process.platform === "win32") {
    const programFiles = process.env.ProgramFiles ?? "C:\\Program Files";
    const candidate = path.join(programFiles, "nodejs", "node.exe");
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      return "node";
    }
  }

  return "node";
}

function userDataCandidateDirs(): string[] {
  const current = app.getPath("userData");
  const home = os.homedir();
  const candidates = [current];

  if (process.platform === "win32") {
    const appData =
      process.env.APPDATA ?? path.join(home, "AppData", "Roaming");
    candidates.push(
      path.join(appData, "ToraSEO"),
      path.join(appData, "ToraSEO Dev"),
      path.join(appData, "@toraseo", "app"),
    );
  } else if (process.platform === "darwin") {
    const base = path.join(home, "Library", "Application Support");
    candidates.push(
      path.join(base, "ToraSEO"),
      path.join(base, "ToraSEO Dev"),
      path.join(base, "@toraseo", "app"),
    );
  } else {
    const base = process.env.XDG_CONFIG_HOME ?? path.join(home, ".config");
    candidates.push(
      path.join(base, "ToraSEO"),
      path.join(base, "ToraSEO Dev"),
      path.join(base, "@toraseo", "app"),
    );
  }

  return Array.from(new Set(candidates));
}

function userDataCandidateFiles(fileName: string): string[] {
  return userDataCandidateDirs().map((dir) => path.join(dir, fileName));
}

function sharedBridgeCandidateFiles(fileName: string): string[] {
  const explicit = process.env.TORASEO_BRIDGE_STATE_DIR?.trim();
  const dirs = explicit ? [explicit] : [];
  const cwd = process.cwd();
  const candidates = [
    path.resolve(cwd, "..", ".toraseo-bridge"),
    path.resolve(cwd, ".toraseo-bridge"),
  ];
  const repoLike = candidates.find((candidate) =>
    candidate.toLowerCase().includes(`${path.sep}toraseo${path.sep}`),
  );
  dirs.push(repoLike ?? candidates[0]);
  dirs.push(...candidates);
  return Array.from(new Set(dirs)).map((dir) => path.join(dir, fileName));
}

function setupCandidateFiles(fileName: string): string[] {
  return Array.from(
    new Set([
      ...sharedBridgeCandidateFiles(fileName),
      ...userDataCandidateFiles(fileName),
    ]),
  );
}

async function readManualMcpPath(): Promise<string | null> {
  for (const filePath of setupCandidateFiles("manual-mcp-path.txt")) {
    try {
      const raw = await fs.readFile(filePath, "utf-8");
      const trimmed = raw.trim();
      if (trimmed.length > 0) return trimmed;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== "ENOENT") {
        log.warn(
          `[detector] failed to read manual mcp path at ${filePath}: ${
            (err as Error).message
          }`,
        );
      }
    }
  }
  return null;
}

async function writeManualMcpPath(p: string): Promise<void> {
  await fs.writeFile(manualMcpPathFile(), p, "utf-8");
}

async function clearManualMcpPath(): Promise<void> {
  for (const filePath of setupCandidateFiles("manual-mcp-path.txt")) {
    try {
      await fs.unlink(filePath);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== "ENOENT") {
        log.warn(
          `[detector] failed to clear manual mcp path at ${filePath}: ${
            (err as Error).message
          }`,
        );
      }
    }
  }
}

async function readSkillConfirmation(): Promise<boolean> {
  for (const filePath of setupCandidateFiles("skill-installed.flag")) {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      // try next candidate
    }
  }
  return false;
}

async function writeSkillConfirmation(): Promise<void> {
  await fs.writeFile(
    skillConfirmationFile(),
    new Date().toISOString(),
    "utf-8",
  );
}

async function clearSkillConfirmationFile(): Promise<void> {
  for (const filePath of setupCandidateFiles("skill-installed.flag")) {
    try {
      await fs.unlink(filePath);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== "ENOENT") {
        log.warn(
          `[detector] failed to clear skill confirmation at ${filePath}: ${
            (err as Error).message
          }`,
        );
      }
    }
  }
}

async function readCodexSetupVerification(): Promise<{
  verified: boolean;
  verifiedAt: string | null;
}> {
  for (const filePath of setupCandidateFiles(CODEX_SETUP_VERIFICATION_FILE)) {
    try {
      const raw = await fs.readFile(filePath, "utf-8");
      const parsed = JSON.parse(raw) as { verifiedAt?: unknown };
      return {
        verified: typeof parsed.verifiedAt === "string",
        verifiedAt:
          typeof parsed.verifiedAt === "string" ? parsed.verifiedAt : null,
      };
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code && code !== "ENOENT") {
        log.warn(
          `[detector] failed to read Codex setup verification at ${filePath}: ${
            (err as Error).message
          }`,
        );
      }
    }
  }
  return { verified: false, verifiedAt: null };
}

// =====================================================================
// Individual checks
// =====================================================================

/**
 * Look for a running Claude Desktop process.
 *
 * Process names vary across platforms:
 *   - Windows: "Claude.exe" or "claude.exe"
 *   - macOS:   "Claude" (the .app bundle's main binary)
 *   - Linux:   "claude" (if/when there's a Linux build)
 *
 * We match case-insensitively on the basename equality (not substring)
 * to avoid false positives from things like "claude-code" or
 * "anthropic-claude-cli".
 */
async function checkClaudeProcess(): Promise<boolean> {
  if (process.platform === "win32") {
    return checkClaudeDesktopWindowOnWindows();
  }

  try {
    const processes = await psList();
    return processes.some((p) => {
      const name = p.name.toLowerCase();
      return (
        name === "claude" ||
        name === "claude.exe"
      );
    });
  } catch (err) {
    log.warn(`[detector] ps-list failed: ${(err as Error).message}`);
    return false;
  }
}

async function checkClaudeDesktopWindowOnWindows(): Promise<boolean> {
  const script = [
    "$ErrorActionPreference = 'SilentlyContinue'",
    "$hits = Get-Process Claude,claude | Where-Object {",
    "  $_.MainWindowHandle -ne 0 -and",
    "  -not [string]::IsNullOrWhiteSpace($_.Path) -and",
    "  $_.Path -notlike '*\\.vscode\\extensions*' -and",
    "  $_.Path -notlike '*\\.codex\\.sandbox-bin*'",
    "}",
    "if ($hits) { 'true' } else { 'false' }",
  ].join("\n");

  try {
    const { stdout } = await execFile(
      "powershell.exe",
      ["-NoProfile", "-Command", script],
      { windowsHide: true, encoding: "utf8" },
    );
    return stdout.trim().toLowerCase() === "true";
  } catch (err) {
    log.warn(
      `[detector] Windows Claude window probe failed: ${(err as Error).message}`,
    );
    return false;
  }
}

async function checkCodexProcess(): Promise<boolean> {
  if (process.platform === "win32") {
    return checkCodexDesktopWindowOnWindows();
  }

  try {
    const processes = await psList();
    return processes.some((p) => {
      const name = p.name.toLowerCase();
      const command = p.cmd?.toLowerCase() ?? "";
      return (
        (name === "codex" ||
          name === "codex.exe" ||
          name === "openai codex" ||
          name === "openai codex.exe" ||
          command.includes("openai.codex_")) &&
        !command.includes(".vscode\\extensions") &&
        !command.includes(".codex\\.sandbox-bin")
      );
    });
  } catch (err) {
    log.warn(`[detector] ps-list failed for Codex: ${(err as Error).message}`);
    return false;
  }
}

async function checkCodexDesktopWindowOnWindows(): Promise<boolean> {
  const script = [
    "$ErrorActionPreference = 'SilentlyContinue'",
    "$hits = Get-Process Codex,codex | Where-Object {",
    "  $p = [string]$_.Path",
    "  $_.MainWindowHandle -ne 0 -and",
    "  (",
    "    $_.ProcessName -ceq 'Codex' -or",
    "    (",
    "      -not [string]::IsNullOrWhiteSpace($p) -and",
    "      (",
    "        $p -like '*\\WindowsApps\\OpenAI.Codex_*' -or",
    "        $p -like '*\\AppData\\Local\\OpenAI\\Codex*'",
    "      )",
    "    )",
    "  ) -and",
    "  $p -notlike '*\\.vscode\\extensions*' -and",
    "  $p -notlike '*\\.codex\\.sandbox-bin*'",
    "}",
    "if ($hits) { 'true' } else { 'false' }",
  ].join("\n");

  try {
    const { stdout } = await execFile(
      "powershell.exe",
      ["-NoProfile", "-Command", script],
      { windowsHide: true, encoding: "utf8" },
    );
    return stdout.trim().toLowerCase() === "true";
  } catch (err) {
    log.warn(
      `[detector] Windows Codex window probe failed: ${(err as Error).message}`,
    );
    return false;
  }
}

/**
 * Path(s) to claude_desktop_config.json by platform. See the file
 * header for the rationale on multi-path lookup.
 */
function claudeConfigPaths(): string[] {
  const home = os.homedir();

  if (process.platform === "win32") {
    const appData =
      process.env.APPDATA ?? path.join(home, "AppData", "Roaming");
    const localAppData =
      process.env.LOCALAPPDATA ?? path.join(home, "AppData", "Local");

    return [
      // Canonical — standalone installer.
      path.join(appData, "Claude", "claude_desktop_config.json"),

      // Microsoft Store package. Sandbox-redirected from %APPDATA%.
      path.join(
        localAppData,
        "Packages",
        "Claude_pzs8sxrjxfjjc",
        "LocalCache",
        "Roaming",
        "Claude",
        "claude_desktop_config.json",
      ),

      // Legacy: very old preview builds.
      path.join(localAppData, "Claude", "claude_desktop_config.json"),
      path.join(home, ".claude", "claude_desktop_config.json"),
    ];
  }

  if (process.platform === "darwin") {
    return [
      path.join(
        home,
        "Library",
        "Application Support",
        "Claude",
        "claude_desktop_config.json",
      ),
    ];
  }

  return [
    path.join(home, ".config", "Claude", "claude_desktop_config.json"),
  ];
}

async function configHasToraseo(cfgPath: string): Promise<boolean> {
  try {
    const raw = await fs.readFile(cfgPath, "utf-8");
    const parsed = JSON.parse(raw) as {
      mcpServers?: Record<string, unknown>;
    };
    return Boolean(parsed.mcpServers && "toraseo" in parsed.mcpServers);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") {
      log.debug(
        `[detector] config read failed at ${cfgPath} (${code}): ${(err as Error).message}`,
      );
    }
    return false;
  }
}

async function checkMcpRegistered(): Promise<boolean> {
  // 1. User-chosen manual path takes precedence.
  const manual = await readManualMcpPath();
  if (manual && (await configHasToraseo(manual))) {
    return true;
  }

  // 2. Canonical fallback paths, in order.
  for (const cfgPath of claudeConfigPaths()) {
    if (await configHasToraseo(cfgPath)) {
      return true;
    }
  }

  return false;
}

/**
 * Path to the Skill on disk for Claude Code users.
 *
 * Claude Code (the CLI client) reads skills from ~/.claude/skills/.
 * Claude Desktop does NOT — it manages skills server-side via the
 * user's Anthropic account. So this path produces a true positive
 * only for Claude Code users; Claude Desktop users will need to
 * use the manual confirmation flow instead.
 */
function skillFilesystemPath(): string {
  return path.join(
    os.homedir(),
    ".claude",
    "skills",
    "toraseo",
    "SKILL.md",
  );
}

/**
 * Check whether Skill is satisfied via either of the two paths:
 * filesystem (Claude Code) or manual marker file (Claude Desktop).
 *
 * Returns the source of truth alongside the boolean so the UI can
 * display different copy and offer "reset" only for manual flags.
 */
async function checkSkillInstalled(): Promise<{
  installed: boolean;
  source: "filesystem" | "manual" | null;
}> {
  // Filesystem first — if a Claude Code user actually has the skill
  // on disk, we trust it without asking them to click anything.
  try {
    await fs.access(skillFilesystemPath(), fs.constants.R_OK);
    return { installed: true, source: "filesystem" };
  } catch {
    // ENOENT or read-denied — fall through to manual flag.
  }

  if (await readSkillConfirmation()) {
    return { installed: true, source: "manual" };
  }

  return { installed: false, source: null };
}

// =====================================================================
// Aggregated check + lifecycle
// =====================================================================

/**
 * Run all checks in parallel. Total wall time ≈ slowest of
 * (process scan ~100ms, file reads ~5ms each) = ~100ms.
 */
export async function checkAll(): Promise<DetectorStatus> {
  const [
    claudeRunning,
    codexRunning,
    codexSetup,
    mcpRegistered,
    skill,
    manualMcpPath,
    claudeAppPath,
    codexAppPath,
  ] =
    await Promise.all([
      checkClaudeProcess(),
      checkCodexProcess(),
      readCodexSetupVerification(),
      checkMcpRegistered(),
      checkSkillInstalled(),
      readManualMcpPath(),
      resolveLaunchPath("claude"),
      resolveLaunchPath("codex"),
    ]);

  return {
    claudeRunning,
    codexRunning,
    codexSetupVerified: codexSetup.verified,
    codexSetupVerifiedAt: codexSetup.verifiedAt,
    mcpRegistered,
    skillInstalled: skill.installed,
    skillSource: skill.source,
    allGreen: claudeRunning && mcpRegistered && skill.installed,
    checkedAt: new Date().toISOString(),
    manualMcpPath,
    claudeAppPath,
    codexAppPath,
  };
}

let pollInterval: NodeJS.Timeout | null = null;

const GITHUB_RELEASES_URL =
  "https://api.github.com/repos/Magbusjap/toraseo/releases";

const SKILL_RELEASES_PAGE_URL =
  "https://github.com/Magbusjap/toraseo/releases";

interface GitHubAsset {
  name: string;
  browser_download_url: string;
}

interface GitHubRelease {
  tag_name: string;
  draft: boolean;
  prerelease: boolean;
  assets: GitHubAsset[];
}

type InstructionZipKind = "claude" | "codex";

const INSTRUCTION_ZIP_ASSETS: Record<
  InstructionZipKind,
  { assetPrefix: string; label: string }
> = {
  claude: {
    assetPrefix: "toraseo-claude-bridge-instructions-",
    label: "Claude Bridge Instructions",
  },
  codex: {
    assetPrefix: "toraseo-codex-workflow-",
    label: "Codex Workflow Instructions",
  },
};

/**
 * Download the latest instruction ZIP attached to the canonical app
 * release (`v0.0.x+`). Older standalone `skill-v*` releases remain
 * historical downloads, but the app now owns the public asset list.
 */
async function downloadLatestInstructionZip(
  kind: InstructionZipKind,
): Promise<DownloadSkillZipResult> {
  let releases: GitHubRelease[];
  const assetConfig = INSTRUCTION_ZIP_ASSETS[kind];
  try {
    const response = await fetch(GITHUB_RELEASES_URL, {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "ToraSEO-Desktop-App",
      },
    });
    if (!response.ok) {
      return {
        ok: false,
        error: `GitHub API ${response.status} ${response.statusText}`,
      };
    }
    releases = (await response.json()) as GitHubRelease[];
  } catch (err) {
    return {
      ok: false,
      error: `Failed to reach GitHub: ${(err as Error).message}`,
    };
  }

  const appRelease = releases.find(
    (r) =>
      /^v\d+\.\d+\.\d+/.test(r.tag_name) && !r.draft && !r.prerelease,
  );

  if (!appRelease) {
    return {
      ok: false,
      error:
        "No ToraSEO app release found on GitHub. Open the releases page manually.",
    };
  }

  const zipAsset = appRelease.assets.find((a) =>
    a.name.toLowerCase().startsWith(assetConfig.assetPrefix) &&
    a.name.toLowerCase().endsWith(".zip"),
  );
  if (!zipAsset) {
    return {
      ok: false,
      error: `Release ${appRelease.tag_name} does not contain ${assetConfig.label} ZIP`,
    };
  }

  // Save into user's Downloads folder under the asset's original name.
  const downloadsDir = app.getPath("downloads");
  const destPath = path.join(downloadsDir, zipAsset.name);

  try {
    const dlResponse = await fetch(zipAsset.browser_download_url, {
      headers: { "User-Agent": "ToraSEO-Desktop-App" },
    });
    if (!dlResponse.ok) {
      return {
        ok: false,
        error: `Download failed: ${dlResponse.status}`,
      };
    }
    const buf = Buffer.from(await dlResponse.arrayBuffer());
    await fs.writeFile(destPath, buf);
  } catch (err) {
    return {
      ok: false,
      error: `Failed to write file: ${(err as Error).message}`,
    };
  }

  log.info(
    `[detector] ${assetConfig.label} ZIP downloaded: ${destPath} (${appRelease.tag_name})`,
  );

  // Open the Downloads folder with the file selected so the user can
  // immediately install it in Claude Desktop or unpack it for Codex.
  shell.showItemInFolder(destPath);

  return {
    ok: true,
    filePath: destPath,
    releaseTag: appRelease.tag_name,
  };
}

function primaryClaudeConfigPath(): string {
  return claudeConfigPaths()[0] ?? path.join(os.homedir(), ".claude", "claude_desktop_config.json");
}

async function backupConfigFile(configPath: string): Promise<void> {
  try {
    await fs.access(configPath);
  } catch {
    return;
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  await fs.copyFile(configPath, `${configPath}.toraseo-backup-${stamp}`);
}

async function installClaudeMcpConfig(): Promise<InstallMcpConfigResult> {
  const configPath = (await readManualMcpPath()) ?? primaryClaudeConfigPath();
  const mcpEntryPath = packagedMcpEntryPath();
  const command = await resolveNodeCommand();

  try {
    await fs.mkdir(path.dirname(configPath), { recursive: true });
    let parsed: { mcpServers?: Record<string, unknown>; [key: string]: unknown } = {};
    try {
      parsed = JSON.parse(await fs.readFile(configPath, "utf8")) as typeof parsed;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== "ENOENT") {
        return {
          ok: false,
          target: "claude",
          configPath,
          mcpEntryPath,
          error: `Could not parse Claude Desktop config: ${(err as Error).message}`,
        };
      }
    }

    await backupConfigFile(configPath);
    parsed.mcpServers = {
      ...(parsed.mcpServers ?? {}),
      toraseo: {
        command,
        args: [mcpEntryPath],
      },
    };
    await fs.writeFile(configPath, `${JSON.stringify(parsed, null, 2)}\n`, "utf8");
    await writeManualMcpPath(configPath);
    return { ok: true, target: "claude", configPath, mcpEntryPath };
  } catch (err) {
    return {
      ok: false,
      target: "claude",
      configPath,
      mcpEntryPath,
      error: (err as Error).message,
    };
  }
}

function codexConfigPath(): string {
  return path.join(os.homedir(), ".codex", "config.toml");
}

function tomlLiteral(value: string): string {
  return `'${value.replace(/'/g, "\\'")}'`;
}

function upsertCodexMcpBlock(raw: string, command: string, mcpEntryPath: string): string {
  const block = [
    "[mcp_servers.toraseo]",
    `command = ${tomlLiteral(command)}`,
    `args = [${tomlLiteral(mcpEntryPath)}]`,
    "",
  ].join("\n");
  const lines = raw.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === "[mcp_servers.toraseo]");
  if (start === -1) {
    const prefix = raw.trimEnd();
    return `${prefix}${prefix ? "\n\n" : ""}${block}`;
  }

  let end = start + 1;
  while (end < lines.length && !/^\s*\[/.test(lines[end] ?? "")) {
    end += 1;
  }

  return [...lines.slice(0, start), ...block.trimEnd().split("\n"), ...lines.slice(end)].join("\n").trimEnd() + "\n";
}

async function installCodexMcpConfig(): Promise<InstallMcpConfigResult> {
  const configPath = codexConfigPath();
  const mcpEntryPath = packagedMcpEntryPath();
  const command = await resolveNodeCommand();

  try {
    await fs.mkdir(path.dirname(configPath), { recursive: true });
    let raw = "";
    try {
      raw = await fs.readFile(configPath, "utf8");
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== "ENOENT") throw err;
    }

    await backupConfigFile(configPath);
    await fs.writeFile(configPath, upsertCodexMcpBlock(raw, command, mcpEntryPath), "utf8");
    return { ok: true, target: "codex", configPath, mcpEntryPath };
  } catch (err) {
    return {
      ok: false,
      target: "codex",
      configPath,
      mcpEntryPath,
      error: (err as Error).message,
    };
  }
}

export interface InstallMcpConfigResult {
  ok: boolean;
  target: "claude" | "codex";
  configPath?: string;
  mcpEntryPath?: string;
  error?: string;
}

/**
 * Wire up detector polling and all on-demand IPC handlers.
 */
export function setupDetector(getMainWindow: () => BrowserWindow | null): void {
  // ----- Status checks -----

  ipcMain.handle(DETECTOR_CHANNELS.checkNow, async () => {
    return checkAll();
  });

  ipcMain.handle(
    DETECTOR_CHANNELS.installMcpConfig,
    async (
      _event,
      target: "claude" | "codex",
    ): Promise<InstallMcpConfigResult> => {
      const result =
        target === "codex"
          ? await installCodexMcpConfig()
          : await installClaudeMcpConfig();
      log.info(
        `[detector] install MCP config target=${target} ok=${result.ok}`,
      );
      void pushFreshStatus(getMainWindow);
      return result;
    },
  );

  // ----- Manual MCP config picker -----

  ipcMain.handle(
    DETECTOR_CHANNELS.pickMcpConfig,
    async (): Promise<PickMcpConfigResult> => {
      const win = getMainWindow();
      const result = await dialog.showOpenDialog(win ?? undefined!, {
        title: "Select claude_desktop_config.json",
        properties: ["openFile"],
        filters: [
          { name: "JSON config", extensions: ["json"] },
          { name: "All files", extensions: ["*"] },
        ],
      });

      if (result.canceled || result.filePaths.length === 0) {
        return { ok: false, reason: "cancelled" };
      }

      const picked = result.filePaths[0];

      try {
        const raw = await fs.readFile(picked, "utf-8");
        try {
          JSON.parse(raw);
        } catch (parseErr) {
          return {
            ok: false,
            reason: "parse-error",
            errorMessage: (parseErr as Error).message,
          };
        }
      } catch (readErr) {
        return {
          ok: false,
          reason: "read-error",
          errorMessage: (readErr as Error).message,
        };
      }

      await writeManualMcpPath(picked);
      const hasToraseo = await configHasToraseo(picked);
      log.info(
        `[detector] manual mcp path set: ${picked} (hasToraseo=${hasToraseo})`,
      );

      void pushFreshStatus(getMainWindow);
      return { ok: true, path: picked, hasToraseo };
    },
  );

  ipcMain.handle(
    DETECTOR_CHANNELS.clearManualMcpConfig,
    async (): Promise<{ ok: boolean }> => {
      await clearManualMcpPath();
      log.info("[detector] manual mcp path cleared");
      void pushFreshStatus(getMainWindow);
      return { ok: true };
    },
  );

  ipcMain.handle(
    DETECTOR_CHANNELS.getManualMcpConfig,
    async (): Promise<{ path: string | null }> => {
      return { path: await readManualMcpPath() };
    },
  );

  // ----- Skill confirmation flow -----

  ipcMain.handle(
    DETECTOR_CHANNELS.confirmSkillInstalled,
    async (): Promise<{ ok: boolean }> => {
      await writeSkillConfirmation();
      log.info("[detector] skill confirmed by user");
      void pushFreshStatus(getMainWindow);
      return { ok: true };
    },
  );

  ipcMain.handle(
    DETECTOR_CHANNELS.clearSkillConfirmation,
    async (): Promise<{ ok: boolean }> => {
      await clearSkillConfirmationFile();
      log.info("[detector] skill confirmation cleared");
      void pushFreshStatus(getMainWindow);
      return { ok: true };
    },
  );

  ipcMain.handle(
    DETECTOR_CHANNELS.downloadSkillZip,
    async (): Promise<DownloadSkillZipResult> => {
      log.info(
        "[detector] downloading latest Claude Bridge Instructions ZIP from GitHub",
      );
      return downloadLatestInstructionZip("claude");
    },
  );

  ipcMain.handle(
    DETECTOR_CHANNELS.downloadCodexWorkflowZip,
    async (): Promise<DownloadSkillZipResult> => {
      log.info(
        "[detector] downloading latest Codex Workflow Instructions ZIP from GitHub",
      );
      return downloadLatestInstructionZip("codex");
    },
  );

  ipcMain.handle(
    DETECTOR_CHANNELS.openSkillReleasesPage,
    async (): Promise<{ ok: boolean }> => {
      await shell.openExternal(SKILL_RELEASES_PAGE_URL);
      return { ok: true };
    },
  );

  // ----- Polling -----

  const tick = async () => {
    try {
      const status = await checkAll();
      const win = getMainWindow();
      if (win && !win.isDestroyed()) {
        win.webContents.send(DETECTOR_CHANNELS.statusUpdate, status);
      }
    } catch (err) {
      log.error(`[detector] tick failed: ${(err as Error).message}`);
    }
  };

  void tick();
  pollInterval = setInterval(tick, POLL_INTERVAL_MS);

  app.on("before-quit", () => {
    if (pollInterval) {
      clearInterval(pollInterval);
      pollInterval = null;
    }
  });

  log.info(
    `[detector] polling started (interval ${POLL_INTERVAL_MS}ms)`,
  );
}

/**
 * Force one fresh status push to the renderer. Used after the user
 * picks/clears manual marker files so the UI updates within ~100ms
 * instead of waiting for the next 5-second poll tick.
 */
async function pushFreshStatus(
  getMainWindow: () => BrowserWindow | null,
): Promise<void> {
  try {
    const status = await checkAll();
    const win = getMainWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send(DETECTOR_CHANNELS.statusUpdate, status);
    }
  } catch (err) {
    log.error(
      `[detector] pushFreshStatus failed: ${(err as Error).message}`,
    );
  }
}
