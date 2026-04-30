import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { useTranslation } from "react-i18next";
import { Bot, Sparkles, ShieldCheck } from "lucide-react";

import type { CurrentScanState } from "../../types/ipc";
import type {
  AuditExecutionMode,
  OrchestratorMessageInput,
  OrchestratorMessageResult,
  ProviderModelProfile,
  RuntimeAuditReport,
  RuntimePolicyMode,
  RuntimeScanContext,
  RuntimeConfirmedFact,
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
  selectedModelProfile: ProviderModelProfile | null;
  bridgeState: CurrentScanState | null;
  bridgePrompt: string | null;
  onReport: (report: RuntimeAuditReport | null) => void;
}

const RUNTIME_PROVIDER_ID = "openrouter" as const;

function isScanContextReady(scanContext: RuntimeScanContext | null): boolean {
  return Boolean(scanContext && scanContext.completedTools.length > 0);
}

function isScanContextComplete(scanContext: RuntimeScanContext | null): boolean {
  return Boolean(
    scanContext &&
      scanContext.selectedTools.length > 0 &&
      scanContext.completedTools.length >= scanContext.selectedTools.length,
  );
}

function scanContextKey(scanContext: RuntimeScanContext | null): string | null {
  if (!scanContext) return null;
  return [
    scanContext.url,
    scanContext.selectedTools.join(","),
    scanContext.completedTools.join(","),
    scanContext.totals.critical,
    scanContext.totals.warning,
    scanContext.totals.info,
    scanContext.totals.errors,
    scanContext.facts.length,
  ].join("|");
}

function priorityLabel(
  priority: RuntimeConfirmedFact["priority"],
  locale: SupportedLocale,
): string {
  if (locale === "ru") {
    if (priority === "high") return "высокий";
    if (priority === "medium") return "средний";
    return "низкий";
  }
  return priority;
}

function numberedLines<T>(
  items: T[],
  formatter: (item: T) => string,
): string {
  return items.map((item, index) => `${index + 1}. ${formatter(item)}`).join("\n");
}

function renderReportText(
  report: RuntimeAuditReport,
  locale: SupportedLocale,
): string {
  if (locale === "ru") {
    const facts = numberedLines(report.confirmedFacts, (fact) => {
      return `[${priorityLabel(fact.priority, locale)}] ${fact.title}: ${fact.detail}`;
    });
    const hypotheses =
      report.expertHypotheses.length > 0
        ? numberedLines(report.expertHypotheses, (item) => {
            return `[${priorityLabel(item.priority, locale)}] ${item.title}: ${
              item.detail
            }\n   Ожидаемый эффект: ${
              item.expectedImpact
            }\n   Как проверить: ${item.validationMethod}`;
          })
        : "Нет гипотез сверх подтверждённых фактов.";

    return [
      `Коротко: ${report.summary}`,
      "",
      "Подтверждённые факты:",
      facts,
      "",
      "Экспертные гипотезы:",
      hypotheses,
      "",
      `Следующий шаг: ${report.nextStep}`,
    ].join("\n");
  }

  const facts = numberedLines(report.confirmedFacts, (fact) => {
    return `[${priorityLabel(fact.priority, locale)}] ${fact.title}: ${fact.detail}`;
  });
  const hypotheses =
    report.expertHypotheses.length > 0
      ? numberedLines(report.expertHypotheses, (item) => {
          return `[${priorityLabel(item.priority, locale)}] ${item.title}: ${
            item.detail
          }\n   Expected impact: ${
            item.expectedImpact
          }\n   Validation: ${item.validationMethod}`;
        })
      : "No hypotheses beyond confirmed facts.";

  return [
    `Summary: ${report.summary}`,
    "",
    "Confirmed facts:",
    facts,
    "",
    "Expert hypotheses:",
    hypotheses,
    "",
    `Next step: ${report.nextStep}`,
  ].join("\n");
}

export default function ChatPanel({
  locale,
  executionMode,
  scanContext,
  selectedModelProfile,
  bridgeState,
  bridgePrompt,
  onReport,
}: ChatPanelProps) {
  const { t } = useTranslation();
  const [history, setHistory] = useState<ChatTurn[]>([
    {
      role: "system",
      text: t("chat.nativeReady", {
        defaultValue:
          "Native mode is ready. Run a local scan, then ask for interpretation.",
      }),
    },
  ]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [policyMode, setPolicyMode] =
    useState<RuntimePolicyMode>("audit_plus_ideas");
  const autoInterpretationKey = useRef<string | null>(null);

  useEffect(() => {
    setHistory([
      {
        role: "system",
        text:
          executionMode === "native"
            ? t("chat.nativeReady", {
                defaultValue:
                  "Native mode is ready. Run a local scan, then ask for interpretation.",
              })
            : t("chat.bridgeReady", {
                defaultValue:
                  "Bridge mode is ready. Paste the copied prompt into Claude Desktop to let MCP tools fill the app.",
              }),
      },
    ]);
  }, [executionMode, t]);

  const helperText = useMemo(() => {
    if (executionMode === "bridge") {
      if (!bridgeState) {
        return t("chat.helper.bridgeNoScan", {
          defaultValue:
            "Click Scan to copy the Bridge prompt, then send it in Claude Desktop.",
        });
      }
      if (bridgeState.status === "awaiting_handshake") {
        return t("chat.helper.bridgeAwaiting", {
          defaultValue:
            "Prompt copied. Claude is expected to call the handshake next.",
        });
      }
      if (bridgeState.status === "in_progress") {
        return t("chat.helper.bridgeRunning", {
          defaultValue:
            "Claude is running MCP tools. Results flow into the right panel automatically.",
        });
      }
      if (bridgeState.status === "error") {
        return (
          bridgeState.error?.message ??
          t("chat.helper.bridgeError", {
            defaultValue: "Bridge mode hit an error.",
          })
        );
      }
      return t("chat.helper.bridgeComplete", {
        defaultValue:
          "Bridge scan finished. Claude recommendations can continue in the external chat.",
      });
    }
    if (!isScanContextReady(scanContext)) {
      return t("chat.helper.nativeNoScan", {
        defaultValue:
          "Run a site scan first, then ask the in-app AI to interpret those findings.",
      });
    }
    return t("chat.helper.nativeReady", {
      completed: scanContext!.completedTools.length,
      total: scanContext!.selectedTools.length,
      defaultValue:
        "Scan context ready: {{completed}}/{{total}} tools completed.",
    });
  }, [bridgeState, executionMode, scanContext, t]);

  const sendToRuntime = useCallback(
    async (text: string, visibleUserTurn: boolean) => {
      if (busy || executionMode !== "native") return;
      if (visibleUserTurn) {
        setHistory((prev) => [...prev, { role: "user", text }]);
      }
      if (!isScanContextReady(scanContext)) {
        setHistory((prev) => [
          ...prev,
          {
            role: "assistant",
            text: t("chat.noScanContext", {
              defaultValue:
                "Start a site audit in the main ToraSEO window first. I can only answer inside the active analysis context.",
            }),
          },
        ]);
        return;
      }

      setBusy(true);
      const input: OrchestratorMessageInput = {
        text,
        mode: policyMode,
        executionMode,
        analysisType: "site",
        providerId: RUNTIME_PROVIDER_ID,
        modelOverride: selectedModelProfile?.modelId,
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
            text: renderReportText(result.report!, locale),
          },
        ]);
      } else {
        onReport(null);
        setHistory((prev) => [
          ...prev,
          {
            role: "assistant",
            text: t("chat.providerError", {
              code: result.errorCode ?? "unknown",
              message: result.errorMessage ?? "",
              defaultValue: "[error: {{code}}] {{message}}",
            }),
          },
        ]);
      }
      setBusy(false);
    },
    [
      busy,
      executionMode,
      locale,
      onReport,
      policyMode,
      scanContext,
      selectedModelProfile?.modelId,
      t,
    ],
  );

  useEffect(() => {
    if (executionMode !== "native" || busy || !isScanContextComplete(scanContext)) {
      return;
    }
    const key = scanContextKey(scanContext);
    if (!key || autoInterpretationKey.current === key) return;
    autoInterpretationKey.current = key;
    setHistory((prev) => [
      ...prev,
      {
        role: "system",
        text: t("chat.autoInterpretationStarted", {
          defaultValue: "Scan finished. Preparing recommendations...",
        }),
      },
    ]);
    void sendToRuntime(
      t("chat.autoInterpretationPrompt", {
        defaultValue:
          "Interpret the completed site audit and give prioritized recommendations.",
      }),
      false,
    );
  }, [busy, executionMode, scanContext, sendToRuntime, t]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const text = draft.trim();
    if (!text || busy || executionMode !== "native") return;

    setDraft("");
    if (!isScanContextReady(scanContext)) {
      setHistory((prev) => [
        ...prev,
        { role: "user", text },
        {
          role: "assistant",
          text: t("chat.noScanContext", {
            defaultValue:
              "Start a site audit in the main ToraSEO window first. I can only answer inside the active analysis context.",
          }),
        },
      ]);
      return;
    }

    await sendToRuntime(text, true);
  };

  return (
    <section className="flex h-full min-w-0 flex-col bg-white">
      <header className="flex items-center justify-between border-b border-orange-100 px-5 py-3">
        <div>
          <h2 className="text-sm font-semibold text-orange-900">
            {executionMode === "native"
              ? "API + AI Chat"
              : t("chat.bridgeTitle", {
                  defaultValue: "MCP + Instructions Companion",
                })}
          </h2>
          <p className="text-xs text-orange-700/70">{helperText}</p>
        </div>
        <div className="flex items-center gap-2">
          {executionMode === "native" && (
            <div className="flex rounded-full border border-orange-200 bg-orange-50 p-1">
              <PolicyButton
                active={policyMode === "strict_audit"}
                icon={<ShieldCheck size={12} />}
                label={t("chat.policy.strict", { defaultValue: "Strict" })}
                onClick={() => setPolicyMode("strict_audit")}
              />
              <PolicyButton
                active={policyMode === "audit_plus_ideas"}
                icon={<Sparkles size={12} />}
                label={t("chat.policy.ideas", { defaultValue: "Ideas" })}
                onClick={() => setPolicyMode("audit_plus_ideas")}
              />
            </div>
          )}
          <span className="rounded-full bg-orange-50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-orange-700">
            {executionMode === "native"
              ? selectedModelProfile?.displayName ??
                t("chat.inAppRuntime", { defaultValue: "In-app runtime" })
              : "Claude Desktop"}
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
              {t("chat.copiedPrompt", { defaultValue: "Copied prompt" })}
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
                ? t("chat.inputPlaceholder.native", {
                    defaultValue: "Ask about the current site audit...",
                  })
                : t("chat.inputPlaceholder.bridge", {
                    defaultValue:
                      "Bridge mode uses Claude Desktop for the live conversation.",
                  })
            }
            disabled={
              busy || executionMode !== "native" || !isScanContextReady(scanContext)
            }
            className="flex-1 rounded-lg border border-orange-200 bg-white px-3 py-2 text-sm text-orange-950 placeholder:text-orange-400 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-300 disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={
              busy || draft.trim().length === 0 || executionMode !== "native"
            }
            className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-orange-600 disabled:bg-orange-300"
          >
            {busy ? "..." : t("chat.send", { defaultValue: "Send" })}
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
