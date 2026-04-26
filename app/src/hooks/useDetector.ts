import { useEffect, useState, useCallback } from "react";

import type { DetectorStatus, OpenClaudeResult } from "../types/ipc";

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
 * Two helper actions:
 *   - checkNow(): force a fresh check, bypassing the polling cache.
 *     Used right before starting a scan to close the race window
 *     between the last poll tick and the user click.
 *   - openClaude(): launch Claude Desktop. Result tells the UI
 *     whether to show "Opening..." vs an error toast.
 */
export interface UseDetectorReturn {
  status: DetectorStatus | null;
  checkNow: () => Promise<DetectorStatus>;
  openClaude: () => Promise<OpenClaudeResult>;
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

  return { status, checkNow, openClaude };
}
