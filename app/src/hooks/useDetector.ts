import { useEffect, useState, useCallback } from "react";

import type {
  DetectorStatus,
  DownloadSkillZipResult,
  InstallMcpConfigResult,
  OpenClaudeResult,
  OpenCodexResult,
  PickAppPathResult,
  PickMcpConfigResult,
} from "../types/ipc";

/**
 * Subscribe to detector status updates and expose actions for the
 * onboarding screen.
 *
 * Lifecycle:
 *   - On mount, subscribe to push updates from main process. The
 *     first push happens within 100ms of app start (immediate first
 *     tick in detector.ts), so the UI doesn't flicker through a
 *     placeholder all-false state.
 *   - On unmount, unsubscribe.
 *
 * Helper actions are grouped by what they fix:
 *
 * Claude / process:
 *   - openClaude() — launch Claude Desktop from known paths or
 *     claude:// fallback
 *
 * MCP config:
 *   - pickMcpConfig() — open file dialog and persist user choice
 *   - clearManualMcpConfig() — revert to canonical-only lookup
 *
 * Instruction packages:
 *   - downloadSkillZip() — fetch latest Claude Bridge ZIP into Downloads
 *   - downloadCodexWorkflowZip() — fetch latest Codex Workflow ZIP
 *     into Downloads
 *   - openSkillReleasesPage() — fallback to GitHub UI
 *   - confirmSkillInstalled() — write manual marker
 *   - clearSkillConfirmation() — undo manual marker
 *
 * Pre-flight:
 *   - checkNow() — synchronous status check, used right before scan
 */
export interface UseDetectorReturn {
  status: DetectorStatus | null;
  checkNow: () => Promise<DetectorStatus>;
  installMcpConfig: (
    target: "claude" | "codex",
  ) => Promise<InstallMcpConfigResult>;
  openClaude: () => Promise<OpenClaudeResult>;
  openCodex: () => Promise<OpenCodexResult>;
  pickClaudePath: () => Promise<PickAppPathResult>;
  pickCodexPath: () => Promise<PickAppPathResult>;
  pickMcpConfig: () => Promise<PickMcpConfigResult>;
  clearManualMcpConfig: () => Promise<{ ok: boolean }>;
  downloadSkillZip: () => Promise<DownloadSkillZipResult>;
  downloadCodexWorkflowZip: () => Promise<DownloadSkillZipResult>;
  openSkillReleasesPage: () => Promise<{ ok: boolean }>;
  confirmSkillInstalled: () => Promise<{ ok: boolean }>;
  clearSkillConfirmation: () => Promise<{ ok: boolean }>;
}

export function useDetector(): UseDetectorReturn {
  const [status, setStatus] = useState<DetectorStatus | null>(null);

  useEffect(() => {
    const unsub = window.toraseo.detector.onStatusUpdate(setStatus);
    return unsub;
  }, []);

  const checkNow = useCallback(async () => {
    const fresh = await window.toraseo.detector.checkNow();
    setStatus(fresh);
    return fresh;
  }, []);

  const openClaude = useCallback(async () => {
    const result = await window.toraseo.launcher.openClaude();
    window.setTimeout(() => {
      void checkNow();
    }, 1200);
    return result;
  }, [checkNow]);

  const openCodex = useCallback(async () => {
    const result = await window.toraseo.launcher.openCodex();
    window.setTimeout(() => {
      void checkNow();
    }, 1200);
    return result;
  }, [checkNow]);

  const pickClaudePath = useCallback(async () => {
    const result = await window.toraseo.launcher.pickClaudePath();
    if (result.ok) {
      void checkNow();
    }
    return result;
  }, [checkNow]);

  const pickCodexPath = useCallback(async () => {
    const result = await window.toraseo.launcher.pickCodexPath();
    if (result.ok) {
      void checkNow();
    }
    return result;
  }, [checkNow]);

  const pickMcpConfig = useCallback(async () => {
    return window.toraseo.detector.pickMcpConfig();
  }, []);

  const clearManualMcpConfig = useCallback(async () => {
    return window.toraseo.detector.clearManualMcpConfig();
  }, []);

  const downloadSkillZip = useCallback(async () => {
    return window.toraseo.detector.downloadSkillZip();
  }, []);

  const installMcpConfig = useCallback(
    async (target: "claude" | "codex") => {
      const result = await window.toraseo.detector.installMcpConfig(target);
      void checkNow();
      return result;
    },
    [checkNow],
  );

  const downloadCodexWorkflowZip = useCallback(async () => {
    return window.toraseo.detector.downloadCodexWorkflowZip();
  }, []);

  const openSkillReleasesPage = useCallback(async () => {
    return window.toraseo.detector.openSkillReleasesPage();
  }, []);

  const confirmSkillInstalled = useCallback(async () => {
    return window.toraseo.detector.confirmSkillInstalled();
  }, []);

  const clearSkillConfirmation = useCallback(async () => {
    return window.toraseo.detector.clearSkillConfirmation();
  }, []);

  return {
    status,
    checkNow,
    installMcpConfig,
    openClaude,
    openCodex,
    pickClaudePath,
    pickCodexPath,
    pickMcpConfig,
    clearManualMcpConfig,
    downloadSkillZip,
    downloadCodexWorkflowZip,
    openSkillReleasesPage,
    confirmSkillInstalled,
    clearSkillConfirmation,
  };
}
