import {
  Bot,
  CheckCircle2,
  Copy,
  FileCheck2,
  FileText,
  Globe,
  Info,
  PanelTop,
  PlugZap,
  Settings,
  ScanEye,
  Wrench,
  XCircle,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import OnboardingView from "../Onboarding/OnboardingView";
import SleepingMascot from "../Mascot/SleepingMascot";
import toraLogoWordmark from "@branding/logos/tora-logo-wordmark.svg";
import {
  ANALYSIS_TYPES,
  type AnalysisTypeId,
} from "../../config/analysisTypes";

import type {
  CurrentScanState,
  DetectorStatus,
  DownloadSkillZipResult,
  OpenClaudeResult,
  OpenCodexResult,
  PickAppPathResult,
  PickMcpConfigResult,
} from "../../types/ipc";
import type {
  AuditExecutionMode,
  ProviderModelProfile,
} from "../../types/runtime";

export type BridgeProgram = "claude" | "codex";

interface ModeSelectionProps {
  selectedExecutionMode: AuditExecutionMode;
  confirmedExecutionMode: AuditExecutionMode | null;
  nativeRuntimeEnabled: boolean;
  providerConfigured: boolean;
  providersLoading: boolean;
  providerModelProfiles: ProviderModelProfile[];
  selectedModelProfileId: string | null;
  bridgeProgram: BridgeProgram;
  codexSetupVerified: boolean;
  codexHandshakeVerified: boolean;
  codexBridgeState: CurrentScanState | null;
  detectorStatus: DetectorStatus | null;
  onExecutionModeDraftChange: (mode: AuditExecutionMode) => void;
  onConfirmExecutionMode: () => void;
  onChangeConfirmedExecutionMode: () => void;
  onBridgeProgramChange: (program: BridgeProgram) => void;
  onOpenCodex: () => Promise<OpenCodexResult>;
  onPickCodexPath: () => Promise<PickAppPathResult>;
  onCopyCodexSetupPrompt: () => Promise<string>;
  onCopyBridgeSetupPrompt: (program: BridgeProgram) => Promise<string>;
  onModelProfileChange: (profileId: string) => void;
  onOpenProviderSettings: () => void;
  onOpenClaude: () => Promise<OpenClaudeResult>;
  onPickClaudePath: () => Promise<PickAppPathResult>;
  onPickMcpConfig: () => Promise<PickMcpConfigResult>;
  onClearManualMcpConfig: () => Promise<{ ok: boolean }>;
  onDownloadSkillZip: () => Promise<DownloadSkillZipResult>;
  onOpenSkillReleasesPage: () => Promise<{ ok: boolean }>;
  onConfirmSkillInstalled: () => Promise<{ ok: boolean }>;
  onClearSkillConfirmation: () => Promise<{ ok: boolean }>;
  onSelect: (analysisType: AnalysisTypeId) => void;
}

export default function ModeSelection({
  selectedExecutionMode,
  confirmedExecutionMode,
  nativeRuntimeEnabled,
  providerConfigured,
  providersLoading,
  providerModelProfiles,
  selectedModelProfileId,
  bridgeProgram,
  codexSetupVerified,
  codexHandshakeVerified,
  codexBridgeState,
  detectorStatus,
  onExecutionModeDraftChange,
  onConfirmExecutionMode,
  onChangeConfirmedExecutionMode,
  onBridgeProgramChange,
  onOpenCodex,
  onPickCodexPath,
  onCopyCodexSetupPrompt,
  onCopyBridgeSetupPrompt,
  onModelProfileChange,
  onOpenProviderSettings,
  onOpenClaude,
  onPickClaudePath,
  onPickMcpConfig,
  onClearManualMcpConfig,
  onDownloadSkillZip,
  onOpenSkillReleasesPage,
  onConfirmSkillInstalled,
  onClearSkillConfirmation,
  onSelect,
}: ModeSelectionProps) {
  const { t } = useTranslation();
  const bridgeReady =
    bridgeProgram === "claude"
      ? Boolean(detectorStatus?.allGreen)
      : Boolean(detectorStatus?.codexRunning) && codexSetupVerified;
  const nativeReady =
    nativeRuntimeEnabled &&
    providerConfigured &&
    providerModelProfiles.some((profile) => profile.id === selectedModelProfileId);
  const canSelectSite =
    confirmedExecutionMode === "native"
      ? nativeReady
      : confirmedExecutionMode === "bridge"
        ? bridgeReady
        : false;
  const canSelectDraftAnalysis = canSelectSite;

  return (
    <div className="flex h-full flex-col items-center justify-start overflow-auto px-8 pb-10 pt-4">
      <header className="flex flex-col items-center gap-3 text-center">
        <img
          src={toraLogoWordmark}
          alt={`${t("app.name")} - ${t("app.tagline")}`}
          className="h-14 w-auto"
          draggable={false}
        />
        <div className="flex items-center gap-2 text-sm text-outline-900/70">
          <span
            className="h-2.5 w-2.5 rounded-full bg-status-idle"
            aria-hidden="true"
          />
          <span>{t("modeSelection.idle")}</span>
        </div>
        <SleepingMascot className="h-28 w-28" />
      </header>

      <section className="mt-4 w-full max-w-4xl">
        <SectionTitle
          title={t("modeSelection.execution.title", {
            defaultValue: "Execution mode",
          })}
          action={
            confirmedExecutionMode ? (
              <button
                type="button"
                onClick={onChangeConfirmedExecutionMode}
                className="inline-flex items-center gap-1.5 rounded-md border border-outline/15 bg-white px-3 py-1.5 text-xs font-medium text-outline-900 transition hover:bg-orange-50"
              >
                <Wrench size={13} />
                {t("modeSelection.execution.change", {
                  defaultValue: "Change",
                })}
              </button>
            ) : null
          }
        />

        <div className="grid gap-3 md:grid-cols-2">
          <ExecutionModeCard
            active={selectedExecutionMode === "bridge"}
            confirmed={confirmedExecutionMode === "bridge"}
            icon={<PlugZap className="h-5 w-5" />}
            title={t("sidebar.mode.bridge", {
              defaultValue: "MCP + Instructions",
            })}
            body={t("sidebar.mode.bridgeHint", {
              defaultValue:
                "Run through Claude Desktop and stream MCP facts back into the app.",
            })}
            disabled={Boolean(confirmedExecutionMode)}
            onClick={() => onExecutionModeDraftChange("bridge")}
          />
          <ExecutionModeCard
            active={selectedExecutionMode === "native"}
            confirmed={confirmedExecutionMode === "native"}
            icon={<Bot className="h-5 w-5" />}
            title={t("sidebar.mode.native", {
              defaultValue: "API + AI Chat",
            })}
            body={t("sidebar.mode.nativeHint", {
              defaultValue:
                "Run the scan locally, then interpret it with the in-app AI runtime.",
            })}
            disabled={Boolean(confirmedExecutionMode)}
            onClick={() => onExecutionModeDraftChange("native")}
          />
        </div>

        {!confirmedExecutionMode && (
          <div className="mt-3 flex justify-end">
            <button
              type="button"
              onClick={onConfirmExecutionMode}
              disabled={
                selectedExecutionMode === "native" && !nativeRuntimeEnabled
              }
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-600 disabled:cursor-not-allowed disabled:bg-outline-900/20"
            >
              <CheckCircle2 size={15} />
              {t("modeSelection.execution.confirm", {
                defaultValue: "Confirm mode",
              })}
            </button>
          </div>
        )}

        {selectedExecutionMode === "bridge" && (
          <BridgeSetup
            program={bridgeProgram}
            codexSetupVerified={codexSetupVerified}
            codexHandshakeVerified={codexHandshakeVerified}
            codexBridgeState={codexBridgeState}
            status={detectorStatus}
            confirmed={confirmedExecutionMode === "bridge"}
            onProgramChange={onBridgeProgramChange}
            onOpenCodex={onOpenCodex}
            onPickCodexPath={onPickCodexPath}
            onCopyCodexSetupPrompt={onCopyCodexSetupPrompt}
            onCopyBridgeSetupPrompt={onCopyBridgeSetupPrompt}
            onOpenClaude={onOpenClaude}
            onPickClaudePath={onPickClaudePath}
            onPickMcpConfig={onPickMcpConfig}
            onClearManualMcpConfig={onClearManualMcpConfig}
            onDownloadSkillZip={onDownloadSkillZip}
            onOpenSkillReleasesPage={onOpenSkillReleasesPage}
            onConfirmSkillInstalled={onConfirmSkillInstalled}
            onClearSkillConfirmation={onClearSkillConfirmation}
          />
        )}

        {selectedExecutionMode === "native" && (
          <NativeSetup
            enabled={nativeRuntimeEnabled}
            providerConfigured={providerConfigured}
            providersLoading={providersLoading}
            modelProfiles={providerModelProfiles}
            selectedModelProfileId={selectedModelProfileId}
            onModelProfileChange={onModelProfileChange}
            onOpenProviderSettings={onOpenProviderSettings}
          />
        )}
      </section>

      <section className="mt-5 w-full max-w-4xl">
        <SectionTitle
          title={t("modeSelection.question")}
        />
        {!confirmedExecutionMode && (
          <StatusCallout
            tone="neutral"
            title={t("modeSelection.execution.confirmFirstTitle", {
              defaultValue: "Confirm the execution mode first",
            })}
            body={t("modeSelection.execution.confirmFirstBody", {
              defaultValue:
                "Analysis types will appear here after you choose the runtime path and confirm it.",
            })}
          />
        )}
        <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {ANALYSIS_TYPES.map((analysis) => {
            const ready = analysis.availability === "ready";
            const disabled =
              analysis.id === "site_by_url"
                ? !canSelectSite
                : !canSelectDraftAnalysis;
            const key = analysis.i18nKeyBase;
            return (
              <AnalysisCard
                key={analysis.id}
                icon={iconForAnalysis(analysis.id)}
                title={t(`modeSelection.analysisTypes.${key}.title`)}
                subtitle={t(`modeSelection.analysisTypes.${key}.subtitle`)}
                statusLabel={
                  ready
                    ? t("modeSelection.analysisStatus.ready")
                    : t("modeSelection.analysisStatus.planned")
                }
                disabled={disabled}
                onClick={() => onSelect(analysis.id)}
              />
            );
          })}
        </div>
      </section>
    </div>
  );
}

function iconForAnalysis(id: AnalysisTypeId): React.ReactNode {
  switch (id) {
    case "site_by_url":
      return <Globe className="h-7 w-7" strokeWidth={1.5} />;
    case "page_by_url":
      return <PanelTop className="h-7 w-7" strokeWidth={1.5} />;
    case "article_text":
      return <FileText className="h-7 w-7" strokeWidth={1.5} />;
    case "article_compare":
      return <CompareTextIcon className="h-7 w-7" />;
    case "site_compare":
      return (
        <span className="relative inline-flex h-7 w-9 items-center justify-center">
          <Globe className="absolute left-0 h-5 w-5" strokeWidth={1.5} />
          <Globe className="absolute right-0 h-5 w-5" strokeWidth={1.5} />
        </span>
      );
    case "site_design_by_url":
      return <ScanEye className="h-7 w-7" strokeWidth={1.5} />;
  }
}

function CompareTextIcon({ className }: { className: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      className={className}
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M13.8 3H22L27 8V23.2Q27 25 25.2 25H13.8Q12 25 12 23.2V4.8Q12 3 13.8 3Z"
        fill="#fff"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
        opacity="0.65"
      />
      <path
        d="M22 3V8H27"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.65"
      />
      <path
        d="M7.8 8H18L24 14V27.2Q24 29 22.2 29H7.8Q6 29 6 27.2V9.8Q6 8 7.8 8Z"
        fill="#fff"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinejoin="round"
      />
      <path
        d="M18 8V14H24"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M10 16H18" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
      <path d="M10 20H20" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
      <path d="M10 24H18" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    </svg>
  );
}

function SectionTitle({
  title,
  action,
}: {
  title: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="font-display text-base font-semibold text-outline-900">
        {title}
      </h2>
      {action}
    </div>
  );
}

function ExecutionModeCard({
  active,
  confirmed,
  icon,
  title,
  body,
  disabled,
  onClick,
}: {
  active: boolean;
  confirmed: boolean;
  icon: React.ReactNode;
  title: string;
  body: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`min-h-[118px] rounded-lg border bg-white p-4 text-left transition ${
        active
          ? "border-primary shadow-sm ring-2 ring-primary/20"
          : "border-outline/10 hover:border-primary/50"
      } ${disabled && !active ? "cursor-not-allowed opacity-60" : ""}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 text-outline-900">
          <span className={active ? "text-primary" : "text-outline-900/60"}>
            {icon}
          </span>
          <span className="font-display text-base font-semibold">{title}</span>
        </div>
        {confirmed && <CheckCircle2 className="h-4 w-4 text-primary" />}
      </div>
      <p className="mt-3 text-sm leading-relaxed text-outline-900/65">{body}</p>
    </button>
  );
}

function BridgeSetup({
  program,
  codexSetupVerified,
  codexHandshakeVerified,
  codexBridgeState,
  status,
  confirmed,
  onProgramChange,
  onOpenCodex,
  onPickCodexPath,
  onCopyCodexSetupPrompt,
  onCopyBridgeSetupPrompt,
  onOpenClaude,
  onPickClaudePath,
  onPickMcpConfig,
  onClearManualMcpConfig,
  onDownloadSkillZip,
  onOpenSkillReleasesPage,
  onConfirmSkillInstalled,
  onClearSkillConfirmation,
}: {
  program: BridgeProgram;
  codexSetupVerified: boolean;
  codexHandshakeVerified: boolean;
  codexBridgeState: CurrentScanState | null;
  status: DetectorStatus | null;
  confirmed: boolean;
  onProgramChange: (program: BridgeProgram) => void;
  onOpenCodex: () => Promise<OpenCodexResult>;
  onPickCodexPath: () => Promise<PickAppPathResult>;
  onCopyCodexSetupPrompt: () => Promise<string>;
  onCopyBridgeSetupPrompt: (program: BridgeProgram) => Promise<string>;
  onOpenClaude: () => Promise<OpenClaudeResult>;
  onPickClaudePath: () => Promise<PickAppPathResult>;
  onPickMcpConfig: () => Promise<PickMcpConfigResult>;
  onClearManualMcpConfig: () => Promise<{ ok: boolean }>;
  onDownloadSkillZip: () => Promise<DownloadSkillZipResult>;
  onOpenSkillReleasesPage: () => Promise<{ ok: boolean }>;
  onConfirmSkillInstalled: () => Promise<{ ok: boolean }>;
  onClearSkillConfirmation: () => Promise<{ ok: boolean }>;
}) {
  const { t } = useTranslation();
  const codexVerificationState: "pending" | "waiting" | "verified" | "failed" =
    codexHandshakeVerified
      ? "verified"
      : codexBridgeState?.status === "awaiting_handshake" ||
          codexBridgeState?.status === "in_progress"
        ? "waiting"
        : codexBridgeState?.status === "error"
          ? "failed"
          : "pending";
  const codexMcpState =
    codexVerificationState === "pending" && codexSetupVerified
      ? "verified"
      : codexVerificationState;
  const codexPathReady = Boolean(status?.codexRunning) && codexSetupVerified;
  const openCodexOrPickPath = async () => {
    const result = await onOpenCodex();
    if (!result.ok && result.needsManualPath) {
      await onPickCodexPath();
      await onOpenCodex();
    }
  };

  return (
    <div className="mt-4 rounded-lg border border-outline/10 bg-white p-4">
      <div className="mb-4 flex flex-wrap gap-2">
        <SegmentButton
          active={program === "claude"}
          label="Claude Desktop"
          disabled={confirmed}
          onClick={() => onProgramChange("claude")}
        />
        <SegmentButton
          active={program === "codex"}
          label="Codex"
          disabled={confirmed}
          onClick={() => onProgramChange("codex")}
        />
      </div>

      {program === "claude" ? (
        status?.allGreen ? (
          <>
            <StatusCallout
              tone="ok"
              title={t("modeSelection.bridge.readyTitle", {
                defaultValue: "Your Claude Desktop is ready for analysis",
              })}
              body={t("modeSelection.bridge.readyBody", {
                defaultValue:
                  "ToraSEO can hand Claude Desktop a check or analysis prompt and receive MCP results back into the app.",
              })}
            />
            <BridgePromptCheckButton
              label={t("modeSelection.bridge.verifyClaudePromptButton", {
                defaultValue: "Check Claude Desktop through prompt",
              })}
              onClick={() => void onCopyBridgeSetupPrompt("claude")}
            />
          </>
        ) : (
          <div className="rounded-lg bg-orange-50/40">
            <OnboardingView
              status={status}
              onOpenClaude={onOpenClaude}
              onPickClaudePath={onPickClaudePath}
              onPickMcpConfig={onPickMcpConfig}
              onClearManualMcpConfig={onClearManualMcpConfig}
              onDownloadSkillZip={onDownloadSkillZip}
              onOpenSkillReleasesPage={onOpenSkillReleasesPage}
              onConfirmSkillInstalled={onConfirmSkillInstalled}
              onClearSkillConfirmation={onClearSkillConfirmation}
            />
          </div>
        )
      ) : codexPathReady ? (
        <>
          <StatusCallout
            tone="ok"
            title={t("modeSelection.bridge.codexTitle", {
              defaultValue: "Your Codex is ready for analysis",
            })}
            body={t("modeSelection.bridge.codexBody", {
              defaultValue:
                "ToraSEO can hand Codex a check or analysis prompt and receive MCP results back into the app.",
            })}
          />
          <BridgePromptCheckButton
            label={t("modeSelection.bridge.verifyCodexPromptButton", {
              defaultValue: "Check Codex through prompt",
            })}
            onClick={() => void onCopyBridgeSetupPrompt("codex")}
          />
        </>
      ) : (
        <div className="rounded-lg bg-orange-50/40 p-8">
          <header className="mx-auto mb-6 max-w-2xl text-center">
            <h3 className="text-2xl font-semibold text-outline">
              {t("modeSelection.bridge.codexOnboardingTitle", {
                defaultValue: "ToraSEO works in tandem with Codex",
              })}
            </h3>
            <p className="mt-2 text-outline/70">
              {t("modeSelection.bridge.codexOnboardingSubtitle", {
                defaultValue:
                  "Three components are required to run. When all three are green, scanning unlocks automatically.",
              })}
            </p>
          </header>

          <div className="mx-auto max-w-2xl space-y-3">
            <div className="rounded-lg border border-outline/10 bg-white px-4 py-4">
              <div className="flex items-start gap-3">
                <Info className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                <div className="min-w-0">
                  <h4 className="text-sm font-semibold text-outline-900">
                    {t("modeSelection.bridge.codexSetupTitle", {
                      defaultValue: "How to connect Codex",
                    })}
                  </h4>
                  <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm leading-relaxed text-outline-900/70">
                    <li>
                      {t("modeSelection.bridge.codexSetupStepOne", {
                        defaultValue:
                          "Keep ToraSEO open on this screen and make sure Codex is open.",
                      })}
                    </li>
                    <li>
                      {t("modeSelection.bridge.codexSetupStepTwo", {
                        defaultValue:
                          "Install the `toraseo-codex-workflow` package into your Codex local skills folder (`~/.codex/skills` by default) so Codex can load it by name.",
                      })}
                    </li>
                    <li>
                      {t("modeSelection.bridge.codexSetupStepThree", {
                        defaultValue:
                          "Use the button below, paste the prepared text into Codex, and wait for Codex to confirm that MCP and Codex Workflow Instructions are active.",
                      })}
                    </li>
                  </ol>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void onCopyCodexSetupPrompt()}
                      className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-white transition hover:bg-primary-600"
                    >
                      <Copy size={14} />
                      {t("modeSelection.bridge.copyCodexSetupPrompt", {
                        defaultValue: "Copy setup prompt",
                      })}
                    </button>
                  </div>
                  <p className="mt-2 text-xs leading-relaxed text-outline-900/55">
                    {t("modeSelection.bridge.codexSetupHint", {
                      defaultValue:
                        "This setup check does not start a site scan. It only proves that ToraSEO MCP and Codex Workflow Instructions are really active in the current Codex session.",
                    })}
                  </p>
                </div>
              </div>
            </div>
            <div className="space-y-2 rounded-lg border border-outline/10 bg-orange-50/30 px-4 py-3">
              <CodexReadinessRow
                satisfied={Boolean(status?.codexRunning)}
                label={
                  status?.codexRunning
                    ? t("modeSelection.bridge.codexRunningLabel", {
                        defaultValue: "Codex is running",
                      })
                    : t("modeSelection.bridge.codexRunningMissingLabel", {
                        defaultValue: "Codex is not running",
                      })
                }
                hint={
                  status?.codexRunning
                    ? t("modeSelection.bridge.codexRunningOk", {
                        defaultValue: "Process found",
                      })
                    : t("modeSelection.bridge.codexRunningMissing", {
                        defaultValue: "Open Codex to continue",
                      })
                }
                action={
                  !status?.codexRunning
                    ? {
                        label: status?.codexAppPath
                          ? t("modeSelection.bridge.openCodex", {
                              defaultValue: "Open Codex",
                            })
                          : t("modeSelection.bridge.addCodexPath", {
                              defaultValue: "Add path manually",
                            }),
                        onClick: openCodexOrPickPath,
                      }
                    : undefined
                }
                pathWarning={
                  !status?.codexRunning && !status?.codexAppPath
                    ? t("modeSelection.bridge.appPathMissing", {
                        appName: "Codex",
                        defaultValue:
                          "ToraSEO could not find the path to {{appName}}. Use the button above to add it manually.",
                      })
                    : undefined
                }
              />
              <CodexReadinessRow
                state={codexMcpState}
                label={t("modeSelection.bridge.codexMcpLabel", {
                  defaultValue: "ToraSEO MCP is available to Codex",
                })}
                hint={
                  codexVerificationState === "pending" && codexSetupVerified
                    ? t("modeSelection.bridge.codexMcpSetupVerified", {
                        defaultValue:
                          "Verified in a live Codex setup check. The scan handshake will verify it again for the active analysis session.",
                      })
                    : codexVerificationState === "verified"
                      ? t("modeSelection.bridge.codexMcpHint", {
                          defaultValue:
                            "Verified when Codex calls verify_codex_workflow_loaded from the ToraSEO MCP server.",
                        })
                      : codexVerificationState === "waiting"
                        ? t("modeSelection.bridge.codexMcpWaiting", {
                            defaultValue:
                              "Handshake is in progress. ToraSEO is waiting for Codex to call verify_codex_workflow_loaded.",
                          })
                        : codexVerificationState === "failed"
                          ? t("modeSelection.bridge.codexMcpFailed", {
                              defaultValue:
                                "The last Codex handshake did not verify MCP access for this session.",
                            })
                          : t("modeSelection.bridge.codexMcpPending", {
                              defaultValue:
                                "Not checked yet. This is verified only after a Codex bridge scan starts.",
                            })
                }
              />
              <CodexReadinessRow
                state={codexMcpState}
                label={t("modeSelection.bridge.codexInstructionsLabel", {
                  defaultValue: "Codex Workflow Instructions are available",
                })}
                hint={
                  codexVerificationState === "pending" && codexSetupVerified
                    ? t("modeSelection.bridge.codexInstructionsSetupVerified", {
                        defaultValue:
                          "Verified in a live Codex setup check. ToraSEO saw the workflow token from the active Codex session.",
                      })
                    : codexVerificationState === "verified"
                      ? t("modeSelection.bridge.codexInstructionsHint", {
                          defaultValue:
                            "The handshake token lives only in the Codex Workflow Instructions package and the MCP server.",
                        })
                      : codexVerificationState === "waiting"
                        ? t("modeSelection.bridge.codexInstructionsWaiting", {
                            defaultValue:
                              "Handshake is in progress. ToraSEO is waiting for proof that the Codex Workflow Instructions are active.",
                          })
                        : codexVerificationState === "failed"
                          ? t("modeSelection.bridge.codexInstructionsFailed", {
                              defaultValue:
                                "The last Codex handshake did not verify the Codex Workflow Instructions for this session.",
                            })
                          : t("modeSelection.bridge.codexInstructionsPending", {
                              defaultValue:
                                "Not checked yet. This is verified only after a Codex bridge scan starts.",
                            })
                }
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function NativeSetup({
  enabled,
  providerConfigured,
  providersLoading,
  modelProfiles,
  selectedModelProfileId,
  onModelProfileChange,
  onOpenProviderSettings,
}: {
  enabled: boolean;
  providerConfigured: boolean;
  providersLoading: boolean;
  modelProfiles: ProviderModelProfile[];
  selectedModelProfileId: string | null;
  onModelProfileChange: (profileId: string) => void;
  onOpenProviderSettings: () => void;
}) {
  const { t } = useTranslation();
  const hasModels = modelProfiles.length > 0;
  const selectedModel =
    modelProfiles.find((profile) => profile.id === selectedModelProfileId) ??
    null;
  const statusText =
    providerConfigured && selectedModel
      ? t("modeSelection.native.modelReady", {
          defaultValue: "Ready with {{model}}.",
          model: selectedModel.displayName,
        })
      : providerConfigured && !hasModels
        ? t("modeSelection.native.modelMissing", {
            defaultValue: "Add at least one AI provider model in Settings.",
          })
        : t("modeSelection.native.providerMissing", {
            defaultValue: "Add an AI provider before starting this mode.",
          });

  return (
    <div className="mt-4 rounded-lg border border-outline/10 bg-white p-4">
      <StatusCallout
        tone={
          !enabled
            ? "error"
            : providerConfigured && selectedModel
              ? "ok"
              : "warning"
        }
        title={
          !enabled
            ? t("modeSelection.native.disabledTitle", {
                defaultValue: "Native runtime is unavailable",
              })
            : t("modeSelection.native.title", {
                defaultValue: "AI provider and model",
              })
        }
        body={providersLoading ? "..." : statusText}
      />
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onOpenProviderSettings}
          className="inline-flex items-center gap-2 rounded-md border border-outline/15 bg-white px-3 py-2 text-sm font-medium text-outline-900 transition hover:bg-orange-50"
        >
          <Settings size={14} />
          {t("modeSelection.native.openProviders", {
            defaultValue: "AI providers",
          })}
        </button>
        {hasModels && (
          <label className="flex min-w-[260px] items-center gap-2 rounded-md border border-outline/15 bg-white px-3 py-2 text-sm text-outline-900">
            <span className="shrink-0 text-xs font-medium uppercase tracking-wider text-outline-900/50">
              {t("modeSelection.native.modelLabel", {
                defaultValue: "Model",
              })}
            </span>
            <select
              value={selectedModelProfileId ?? ""}
              onChange={(event) => onModelProfileChange(event.target.value)}
              disabled={!enabled || !providerConfigured}
              className="min-w-0 flex-1 bg-transparent text-sm focus:outline-none disabled:opacity-60"
            >
              {modelProfiles.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.displayName}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
    </div>
  );
}

function CodexReadinessRow({
  satisfied,
  state,
  label,
  hint,
  action,
  pathWarning,
}: {
  satisfied?: boolean;
  state?: "pending" | "waiting" | "verified" | "failed";
  label: string;
  hint: string;
  action?: {
    label: string;
    onClick: () => Promise<void> | void;
  };
  pathWarning?: string;
}) {
  const effectiveState =
    state ?? (satisfied ? "verified" : "failed");

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-outline/10 bg-white px-3 py-3">
        <div className="flex min-w-0 items-center gap-3">
          {effectiveState === "verified" ? (
            <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-500" />
          ) : effectiveState === "waiting" ? (
            <span className="h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-orange-300 border-t-primary" />
          ) : effectiveState === "pending" ? (
            <span className="h-5 w-5 shrink-0 rounded-full border-2 border-outline/20 bg-outline-900/5" />
          ) : (
            <XCircle className="h-5 w-5 shrink-0 text-orange-500" />
          )}
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold text-outline-900">{label}</p>
            </div>
            <p className="text-xs leading-relaxed text-outline-900/60">
              {hint}
            </p>
          </div>
        </div>
        {action && (
          <button
            type="button"
            onClick={() => void action.onClick()}
            className="shrink-0 rounded-md bg-orange-500 px-3 py-2 text-sm font-medium text-white transition hover:bg-orange-600"
          >
            {action.label}
          </button>
        )}
      </div>
      {pathWarning && (
        <p className="pl-11 text-xs leading-relaxed text-red-700">
          {pathWarning}
        </p>
      )}
    </div>
  );
}

function SegmentButton({
  active,
  label,
  disabled,
  onClick,
}: {
  active: boolean;
  label: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
        active
          ? "bg-primary text-white"
          : "border border-outline/15 bg-white text-outline-900 hover:bg-orange-50"
      } ${disabled ? "cursor-not-allowed opacity-70" : ""}`}
    >
      {label}
    </button>
  );
}

function BridgePromptCheckButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <div className="mt-3 flex justify-end">
      <button
        type="button"
        onClick={onClick}
        className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-white transition hover:bg-primary-600"
      >
        {label}
      </button>
    </div>
  );
}

function StatusCallout({
  tone,
  title,
  body,
}: {
  tone: "ok" | "warning" | "error" | "neutral";
  title: string;
  body: string;
}) {
  const toneClass =
    tone === "ok"
      ? "border-emerald-200 bg-emerald-50 text-emerald-900"
      : tone === "warning"
        ? "border-orange-200 bg-orange-50 text-orange-900"
        : tone === "error"
          ? "border-red-200 bg-red-50 text-red-900"
          : "border-outline/10 bg-orange-50/40 text-outline-900";

  return (
    <div className={`rounded-lg border px-4 py-3 ${toneClass}`}>
      <h3 className="text-sm font-semibold">{title}</h3>
      <p className="mt-1 text-sm leading-relaxed opacity-80">{body}</p>
    </div>
  );
}

function AnalysisCard({
  icon,
  title,
  subtitle,
  statusLabel,
  disabled,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  statusLabel: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex min-h-[152px] flex-col items-center justify-center gap-3 rounded-lg border bg-white p-5 text-center transition ${
        disabled
          ? "cursor-not-allowed border-outline/10 opacity-50"
          : "cursor-pointer border-outline/15 hover:-translate-y-0.5 hover:border-primary hover:shadow-md"
      }`}
      aria-disabled={disabled}
    >
      <span className={disabled ? "text-outline-900/40" : "text-primary"}>
        {icon}
      </span>
      <span className="font-display text-base font-medium leading-snug text-outline-900">
        {title}
      </span>
      <span className="font-mono text-[10px] uppercase tracking-wider text-outline-900/50">
        {subtitle}
      </span>
      <span className="inline-flex items-center gap-1.5 rounded-full border border-outline/10 bg-orange-50 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-outline-900/55">
        <FileCheck2 className="h-3 w-3" strokeWidth={2} />
        {statusLabel}
      </span>
    </button>
  );
}
