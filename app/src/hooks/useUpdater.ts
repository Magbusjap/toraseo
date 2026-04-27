import { useEffect, useState } from "react";

import type {
  DownloadProgress,
  UpdateInfo,
} from "../types/ipc";

/**
 * Auto-updater state machine + IPC subscriptions.
 *
 * States:
 * - "idle":        no update info yet (or already installed)
 * - "available":   server has newer version, awaiting user "Download" click
 * - "downloading": download in progress; `progress` is populated
 * - "downloaded":  ready to install, awaiting user "Install" click
 * - "error":       last operation failed; `errorMessage` is populated
 *
 * Transitions are driven by IPC events from `electron/updater.ts`.
 * Actions (check/download/install) are exposed for UI buttons.
 */

export type UpdateState =
  | "idle"
  | "available"
  | "downloading"
  | "downloaded"
  | "error";

export interface UseUpdaterReturn {
  state: UpdateState;
  info: UpdateInfo | null;
  progress: DownloadProgress | null;
  errorMessage: string | null;

  check: () => Promise<void>;
  download: () => Promise<void>;
  install: () => Promise<void>;
  dismiss: () => void;
}

export function useUpdater(): UseUpdaterReturn {
  const [state, setState] = useState<UpdateState>("idle");
  const [info, setInfo] = useState<UpdateInfo | null>(null);
  const [progress, setProgress] = useState<DownloadProgress | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Subscribe to all updater events from main process. Cleanup
  // unsubscribes on unmount, which never happens in practice (the
  // hook lives at app root) but is correct hook hygiene.
  useEffect(() => {
    const updater = window.toraseo.updater;

    const unsubAvailable = updater.onUpdateAvailable((u) => {
      setInfo(u);
      setState("available");
      setErrorMessage(null);
    });

    const unsubNotAvailable = updater.onUpdateNotAvailable(() => {
      // Stay in idle; no UI to show. The check button (when we add a
      // manual one) can show "Вы используете последнюю версию" toast,
      // but on auto-checks at startup we just stay quiet.
    });

    const unsubProgress = updater.onDownloadProgress((p) => {
      setProgress(p);
      setState("downloading");
    });

    const unsubDownloaded = updater.onUpdateDownloaded((u) => {
      setInfo(u);
      setState("downloaded");
      setProgress(null);
    });

    const unsubError = updater.onUpdateError((err) => {
      setErrorMessage(err.message);
      setState("error");
    });

    return () => {
      unsubAvailable();
      unsubNotAvailable();
      unsubProgress();
      unsubDownloaded();
      unsubError();
    };
  }, []);

  const check = async () => {
    setErrorMessage(null);
    const result = await window.toraseo.updater.check();
    if (!result.ok && result.error) {
      setErrorMessage(result.error);
      setState("error");
    }
    // If there's a newer version, the "update-available" event has
    // already fired by this point and pushed us into "available".
  };

  const download = async () => {
    if (state !== "available") return;
    setErrorMessage(null);
    setState("downloading");
    const result = await window.toraseo.updater.download();
    if (!result.ok && result.error) {
      setErrorMessage(result.error);
      setState("error");
    }
    // Otherwise wait for the "update-downloaded" event.
  };

  const install = async () => {
    if (state !== "downloaded") return;
    await window.toraseo.updater.install();
    // App will quit and relaunch; nothing to do here.
  };

  const dismiss = () => {
    // Only allow dismissing notifications that aren't mid-flight.
    if (state === "downloading") return;
    setState("idle");
    setProgress(null);
    setErrorMessage(null);
  };

  return {
    state,
    info,
    progress,
    errorMessage,
    check,
    download,
    install,
    dismiss,
  };
}

// Augment the global Window type so `window.toraseo` is typed.
declare global {
  interface Window {
    toraseo: import("../types/ipc").ToraseoApi;
  }
}
