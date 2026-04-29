import { useEffect, useState, useCallback } from "react";

import type {
  DetectorStatus,
  DownloadSkillZipResult,
  OpenClaudeResult,
  OpenCodexResult,
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
 * Skill (hybrid detect-or-confirm):
 *   - downloadSkillZip() — fetch latest skill-v* ZIP into Downloads
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
  openClaude: () => Promise<OpenClaudeResult>;
  openCodex: () => Promise<OpenCodexResult>;
  pickMcpConfig: () => Promise<PickMcpConfigResult>;
  clearManualMcpConfig: () => Promise<{ ok: boolean }>;
  downloadSkillZip: () => Promise<DownloadSkillZipResult>;
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
    return window.toraseo.launcher.openClaude();
  }, []);

  const openCodex = useCallback(async () => {
    return window.toraseo.launcher.openCodex();
  }, []);

  const pickMcpConfig = useCallback(async () => {
    return window.toraseo.detector.pickMcpConfig();
  }, []);

  const clearManualMcpConfig = useCallback(async () => {
    return window.toraseo.detector.clearManualMcpConfig();
  }, []);

  const downloadSkillZip = useCallback(async () => {
    return window.toraseo.detector.downloadSkillZip();
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
    openClaude,
    openCodex,
    pickMcpConfig,
    clearManualMcpConfig,
    downloadSkillZip,
    openSkillReleasesPage,
    confirmSkillInstalled,
    clearSkillConfirmation,
  };
}
