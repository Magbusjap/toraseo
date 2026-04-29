import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import ChatPanel from "./ChatPanel";

import type {
  RuntimeAuditReport,
  RuntimeChatWindowSession,
} from "../../types/runtime";

export default function ChatWindow() {
  const { t } = useTranslation();
  const [session, setSession] = useState<RuntimeChatWindowSession | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    if (!window.toraseo?.runtime) {
      setLoadError("ToraSEO preload API is unavailable in the chat window.");
      return () => {
        mounted = false;
      };
    }
    void window.toraseo.runtime
      .getChatWindowSession()
      .then((next) => {
        if (mounted) setSession(next);
      })
      .catch((err) => {
        if (mounted) {
          setLoadError(
            err instanceof Error ? err.message : "Failed to load chat session.",
          );
        }
      });
    const unsubscribe = window.toraseo.runtime.onChatWindowSessionUpdate(
      (next) => {
        setSession(next);
        setLoadError(null);
      },
    );
    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  const handleReport = useCallback((report: RuntimeAuditReport | null) => {
    setSession((prev) => {
      if (!prev) return prev;
      const next: RuntimeChatWindowSession = {
        ...prev,
        report,
      };
      void window.toraseo.runtime.updateChatWindowSession(next);
      return next;
    });
  }, []);

  if (loadError) {
    return (
      <main className="grid h-screen place-items-center bg-orange-50/30 p-8">
        <section className="w-full max-w-md rounded-xl border border-red-200 bg-white p-7 text-center shadow-sm">
          <h1 className="text-xl font-semibold text-red-800">
            {t("chat.loadErrorTitle", { defaultValue: "AI chat did not load" })}
          </h1>
          <p className="mt-3 font-mono text-xs leading-relaxed text-red-700/80">
            {loadError}
          </p>
        </section>
      </main>
    );
  }

  if (!session) {
    return (
      <main className="grid h-full place-items-center bg-orange-50/30 p-8">
        <p className="text-sm text-orange-900/70">
          {t("chat.loading", { defaultValue: "Loading..." })}
        </p>
      </main>
    );
  }

  if (session.status === "ended") {
    return (
      <main className="grid h-full place-items-center bg-orange-50/30 p-8">
        <section className="w-full max-w-md rounded-xl border border-orange-200 bg-white p-7 text-center shadow-sm">
          <h1 className="text-xl font-semibold text-orange-950">
            {t("chat.endedTitle", { defaultValue: "Session ended" })}
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-orange-900/70">
            {t("chat.endedBody", {
              defaultValue:
                "Start a new API + AI Chat analysis in the main ToraSEO window to continue.",
            })}
          </p>
        </section>
      </main>
    );
  }

  return (
    <main className="h-screen min-h-screen bg-white">
      <ChatPanel
        locale={session.locale}
        executionMode="native"
        scanContext={session.scanContext}
        selectedModelProfile={session.selectedModelProfile}
        bridgeState={null}
        bridgePrompt={null}
        onReport={handleReport}
      />
    </main>
  );
}
