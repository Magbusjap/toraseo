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
  pickMcpConfig: "toraseo:detector:pick-mcp-config",
  clearManualMcpConfig: "toraseo:detector:clear-manual-mcp-config",
  getManualMcpConfig: "toraseo:detector:get-manual-mcp-config",
  confirmSkillInstalled: "toraseo:detector:confirm-skill-installed",
  clearSkillConfirmation: "toraseo:detector:clear-skill-confirmation",
  downloadSkillZip: "toraseo:detector:download-skill-zip",
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
  /** All three above true. UI uses this to enable scanning. */
  allGreen: boolean;
  /** ISO-8601 timestamp; for staleness checks if needed. */
  checkedAt: string;
  /**
   * Path the user picked manually via the file dialog, if any.
   * Null means MCP detection is using only the canonical four-path
   * fallback.
   */
  manualMcpPath: string | null;
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
  /** Tag name of the release that was downloaded (e.g., "skill-v0.2.0"). */
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

async function readManualMcpPath(): Promise<string | null> {
  try {
    const raw = await fs.readFile(manualMcpPathFile(), "utf-8");
    const trimmed = raw.trim();
    return trimmed.length > 0 ? trimmed : null;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") {
      log.warn(
        `[detector] failed to read manual mcp path: ${(err as Error).message}`,
      );
    }
    return null;
  }
}

async function writeManualMcpPath(p: string): Promise<void> {
  await fs.writeFile(manualMcpPathFile(), p, "utf-8");
}

async function clearManualMcpPath(): Promise<void> {
  try {
    await fs.unlink(manualMcpPathFile());
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") {
      log.warn(
        `[detector] failed to clear manual mcp path: ${(err as Error).message}`,
      );
    }
  }
}

async function readSkillConfirmation(): Promise<boolean> {
  try {
    await fs.access(skillConfirmationFile());
    return true;
  } catch {
    return false;
  }
}

async function writeSkillConfirmation(): Promise<void> {
  await fs.writeFile(
    skillConfirmationFile(),
    new Date().toISOString(),
    "utf-8",
  );
}

async function clearSkillConfirmationFile(): Promise<void> {
  try {
    await fs.unlink(skillConfirmationFile());
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") {
      log.warn(
        `[detector] failed to clear skill confirmation: ${(err as Error).message}`,
      );
    }
  }
}

async function readCodexSetupVerification(): Promise<{
  verified: boolean;
  verifiedAt: string | null;
}> {
  try {
    const raw = await fs.readFile(codexSetupVerificationFile(), "utf-8");
    const parsed = JSON.parse(raw) as { verifiedAt?: unknown };
    return {
      verified: typeof parsed.verifiedAt === "string",
      verifiedAt: typeof parsed.verifiedAt === "string" ? parsed.verifiedAt : null,
    };
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code && code !== "ENOENT") {
      log.warn(
        `[detector] failed to read Codex setup verification: ${(err as Error).message}`,
      );
    }
    return { verified: false, verifiedAt: null };
  }
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

async function checkCodexProcess(): Promise<boolean> {
  if (process.platform === "win32") {
    return checkCodexDesktopWindowOnWindows();
  }

  try {
    const processes = await psList();
    return processes.some((p) => {
      const name = p.name.toLowerCase();
      return (
        name === "codex" ||
        name === "codex.exe" ||
        name === "openai codex" ||
        name === "openai codex.exe"
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
    "  -not [string]::IsNullOrWhiteSpace($_.Path) -and",
    "  $_.Path -like '*\\WindowsApps\\OpenAI.Codex_*' -and",
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
  ] =
    await Promise.all([
      checkClaudeProcess(),
      checkCodexProcess(),
      readCodexSetupVerification(),
      checkMcpRegistered(),
      checkSkillInstalled(),
      readManualMcpPath(),
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
  };
}

let pollInterval: NodeJS.Timeout | null = null;

/**
 * GitHub Releases API endpoint for the skill track. We list all
 * releases, filter to those whose tag starts with `skill-v`, take
 * the first non-prerelease/non-draft. There's no
 * `releases/latest` endpoint that respects our two-track scheme
 * (it would return the latest release of any track).
 */
const GITHUB_RELEASES_URL =
  "https://api.github.com/repos/Magbusjap/toraseo/releases";

const SKILL_RELEASES_PAGE_URL =
  "https://github.com/Magbusjap/toraseo/releases?q=skill-v&expanded=true";

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

/**
 * Find the latest skill-v* release on GitHub and download its ZIP
 * asset to the user's Downloads folder.
 *
 * What "latest" means: the first release in the chronologically-
 * sorted-desc API response whose tag starts with `skill-v` and is
 * neither a draft nor a prerelease. If nothing matches, return an
 * error so the UI can suggest the manual GitHub link instead.
 *
 * Asset selection: we look for the first .zip asset attached to the
 * release. The skill release workflow always produces one ZIP, so
 * "first" is unambiguous in practice.
 */
async function downloadLatestSkillZip(): Promise<DownloadSkillZipResult> {
  let releases: GitHubRelease[];
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

  const skillRelease = releases.find(
    (r) =>
      r.tag_name.startsWith("skill-v") && !r.draft && !r.prerelease,
  );

  if (!skillRelease) {
    return {
      ok: false,
      error:
        "No Claude Bridge Instructions release found on GitHub. Open the releases page manually.",
    };
  }

  const zipAsset = skillRelease.assets.find((a) =>
    a.name.toLowerCase().endsWith(".zip"),
  );
  if (!zipAsset) {
    return {
      ok: false,
      error: `Release ${skillRelease.tag_name} does not contain a ZIP file`,
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
    `[detector] skill ZIP downloaded: ${destPath} (${skillRelease.tag_name})`,
  );

  // Open the Downloads folder with the file selected so the user
  // can immediately drag it into Claude Desktop's Settings → Skills.
  shell.showItemInFolder(destPath);

  return {
    ok: true,
    filePath: destPath,
    releaseTag: skillRelease.tag_name,
  };
}

/**
 * Wire up detector polling and all on-demand IPC handlers.
 */
export function setupDetector(getMainWindow: () => BrowserWindow | null): void {
  // ----- Status checks -----

  ipcMain.handle(DETECTOR_CHANNELS.checkNow, async () => {
    return checkAll();
  });

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
      log.info("[detector] downloading latest skill ZIP from GitHub");
      return downloadLatestSkillZip();
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
