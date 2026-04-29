import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Bot, Sparkles, ShieldCheck } from "lucide-react";

import type { CurrentScanState } from "../../types/ipc";
import type {
  AuditExecutionMode,
  OrchestratorMessageInput,
  OrchestratorMessageResult,
  RuntimeAuditReport,
  RuntimePolicyMode,
  RuntimeScanContext,
} from "../../types/runtime";
import type { SupportedLocale } from "../../types/ipc";

interface ChatTurn {
  role: "user" | "assistant" | "system";
  text: string;
}

interface ChatPanelProps {
  locale: SupportedLocale;
  executionMode: AuditExecutionMode;
  scanContext: RuntimeScanContext | null;
  bridgeState: CurrentScanState | null;
  bridgePrompt: string | null;
  onReport: (report: RuntimeAuditReport | null) => void;
}

const RUNTIME_PROVIDER_ID = "openrouter" as const;

export default function ChatPanel({
  locale,
  executionMode,
  scanContext,
  bridgeState,
  bridgePrompt,
  onReport,
}: ChatPanelProps) {
  const [history, setHistory] = useState<ChatTurn[]>([
    {
      role: "system",
      text:
        executionMode === "native"
          ? "Native mode is ready. Run a local scan, then ask for interpretation."
          : "Bridge mode is ready. Paste the copied prompt into Claude Desktop to let MCP tools fill the app.",
    },
  ]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [policyMode, setPolicyMode] =
    useState<RuntimePolicyMode>("audit_plus_ideas");

  useEffect(() => {
    setHistory([
      {
        role: "system",
        text:
          executionMode === "native"
            ? "Native mode is ready. Run a local scan, then ask for interpretation."
            : "Bridge mode is ready. Paste the copied prompt into Claude Desktop to let MCP tools fill the app.",
      },
    ]);
    onReport(null);
  }, [executionMode, onReport]);

  const helperText = useMemo(() => {
    if (executionMode === "bridge") {
      if (!bridgeState) {
        return "Click Scan to copy the Bridge prompt, then send it in Claude Desktop.";
      }
      if (bridgeState.status === "awaiting_handshake") {
        return "Prompt copied. Claude is expected to call the handshake next.";
      }
      if (bridgeState.status === "in_progress") {
        return "Claude is running MCP tools. Results flow into the right panel automatically.";
      }
      if (bridgeState.status === "error") {
        return bridgeState.error?.message ?? "Bridge mode hit an error.";
      }
      return "Bridge scan finished. Claude recommendations can continue in the external chat.";
    }
    if (!scanContext || scanContext.completedTools.length === 0) {
      return "Run a local scan first, then ask the in-app AI to interpret the findings.";
    }
    return `Scan context ready: ${scanContext.completedTools.length}/${scanContext.selectedTools.length} tools completed.`;
  }, [bridgeState, executionMode, scanContext]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const text = draft.trim();
    if (!text || busy || executionMode !== "native") return;

    setHistory((prev) => [...prev, { role: "user", text }]);
    setDraft("");
    setBusy(true);

    const input: OrchestratorMessageInput = {
      text,
      mode: policyMode,
      executionMode,
      providerId: RUNTIME_PROVIDER_ID,
      locale,
      scanContext,
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

    if (result.ok && result.report) {
      onReport(result.report);
      setHistory((prev) => [
        ...prev,
        {
          role: "assistant",
          text: `${result.report.summary}\n\nNext step: ${result.report.nextStep}`,
        },
      ]);
    } else {
      onReport(null);
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
            {executionMode === "native" ? "API + AI Chat" : "MCP + Skill Companion"}
          </h2>
          <p className="text-xs text-orange-700/70">{helperText}</p>
        </div>
        <div className="flex items-center gap-2">
          {executionMode === "native" && (
            <div className="flex rounded-full border border-orange-200 bg-orange-50 p-1">
              <PolicyButton
                active={policyMode === "strict_audit"}
                icon={<ShieldCheck size={12} />}
                label="Strict"
                onClick={() => setPolicyMode("strict_audit")}
              />
              <PolicyButton
                active={policyMode === "audit_plus_ideas"}
                icon={<Sparkles size={12} />}
                label="Ideas"
                onClick={() => setPolicyMode("audit_plus_ideas")}
              />
            </div>
          )}
          <span className="rounded-full bg-orange-50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-orange-700">
            {executionMode === "native" ? "In-app runtime" : "Claude desktop"}
          </span>
        </div>
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

        {executionMode === "bridge" && bridgePrompt && (
          <li className="rounded-2xl border border-orange-200 bg-orange-50/60 p-4 text-sm text-orange-950">
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-orange-700">
              <Bot size={14} />
              Copied prompt
            </div>
            <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-orange-900/80">
              {bridgePrompt}
            </pre>
          </li>
        )}
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
            placeholder={
              executionMode === "native"
                ? "Ask the in-app AI to interpret the current scan..."
                : "Bridge mode uses Claude Desktop for the live conversation."
            }
            disabled={busy || executionMode !== "native"}
            className="flex-1 rounded-lg border border-orange-200 bg-white px-3 py-2 text-sm text-orange-950 placeholder:text-orange-400 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-300 disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={
              busy || draft.trim().length === 0 || executionMode !== "native"
            }
            className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-orange-600 disabled:bg-orange-300"
          >
            {busy ? "..." : "Send"}
          </button>
        </div>
      </form>
    </section>
  );
}

function PolicyButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-medium transition ${
        active
          ? "bg-white text-orange-900 shadow-sm"
          : "text-orange-700/70 hover:text-orange-900"
      }`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}
