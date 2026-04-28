/**
 * ChatPanel — central column of the native runtime layout.
 *
 * Stage 1 (skeleton): renders a placeholder visual that proves the
 * IPC pipeline (the input box round-trips through orchestrator and
 * displays the stub response). No streaming, no rich rendering, no
 * history persistence yet — those land in Stage 2/3.
 *
 * Visual style: matches the existing app palette (warm orange,
 * neutral surfaces) so when richer UI comes in Stage 3 it slots
 * in without a redesign pass.
 */

import { useState, type FormEvent } from "react";

import type {
  OrchestratorMessageInput,
  OrchestratorMessageResult,
  RuntimePolicyMode,
} from "../../types/runtime";
import type { SupportedLocale } from "../../types/ipc";

interface ChatTurn {
  role: "user" | "assistant" | "system";
  text: string;
}

interface ChatPanelProps {
  locale: SupportedLocale;
}

const STAGE1_PROVIDER_ID = "openrouter" as const;

export default function ChatPanel({ locale }: ChatPanelProps) {
  const [history, setHistory] = useState<ChatTurn[]>([
    {
      role: "system",
      text: "Stage 1 skeleton — orchestrator returns placeholder responses until Stage 2 wires the real provider call.",
    },
  ]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [mode] = useState<RuntimePolicyMode>("audit_plus_ideas");

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const text = draft.trim();
    if (!text || busy) return;

    setHistory((prev) => [...prev, { role: "user", text }]);
    setDraft("");
    setBusy(true);

    const input: OrchestratorMessageInput = {
      text,
      mode,
      providerId: STAGE1_PROVIDER_ID,
      locale,
    };

    let result: OrchestratorMessageResult;
    try {
      result = await window.toraseo.runtime.sendMessage(input);
    } catch (err) {
      result = {
        ok: false,
        errorCode: "ipc_failure",
        errorMessage:
          err instanceof Error ? err.message : "Unknown IPC failure",
      };
    }

    if (result.ok && result.text) {
      setHistory((prev) => [...prev, { role: "assistant", text: result.text! }]);
    } else {
      setHistory((prev) => [
        ...prev,
        {
          role: "assistant",
          text: `[error: ${result.errorCode ?? "unknown"}] ${result.errorMessage ?? ""}`,
        },
      ]);
    }
    setBusy(false);
  };

  return (
    <section className="flex h-full min-w-0 flex-col bg-white">
      <header className="flex items-center justify-between border-b border-orange-100 px-5 py-3">
        <div>
          <h2 className="text-sm font-semibold text-orange-900">
            ToraSEO AI Chat
          </h2>
          <p className="text-xs text-orange-700/70">
            Native runtime · mode: {mode} · provider: {STAGE1_PROVIDER_ID}
          </p>
        </div>
        <span className="rounded-full bg-orange-50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-orange-700">
          Stage 1 skeleton
        </span>
      </header>

      <ol className="flex-1 space-y-3 overflow-auto px-5 py-4">
        {history.map((turn, idx) => (
          <li
            key={idx}
            className={
              turn.role === "user"
                ? "ml-auto max-w-[80%] rounded-2xl rounded-br-sm bg-orange-500 px-4 py-2 text-sm text-white shadow-sm"
                : turn.role === "assistant"
                  ? "mr-auto max-w-[80%] rounded-2xl rounded-bl-sm bg-orange-50 px-4 py-2 text-sm text-orange-950 shadow-sm"
                  : "mx-auto max-w-[90%] rounded-md border border-dashed border-orange-200 bg-white px-3 py-1.5 text-center text-xs text-orange-600"
            }
          >
            <pre className="whitespace-pre-wrap font-sans leading-relaxed">
              {turn.text}
            </pre>
          </li>
        ))}
      </ol>

      <form
        onSubmit={handleSubmit}
        className="border-t border-orange-100 bg-orange-50/40 px-5 py-3"
      >
        <div className="flex gap-2">
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Ask the runtime (Stage 1: stub responses)..."
            disabled={busy}
            className="flex-1 rounded-lg border border-orange-200 bg-white px-3 py-2 text-sm text-orange-950 placeholder:text-orange-400 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-300 disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={busy || draft.trim().length === 0}
            className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-orange-600 disabled:bg-orange-300"
          >
            {busy ? "..." : "Send"}
          </button>
        </div>
      </form>
    </section>
  );
}
