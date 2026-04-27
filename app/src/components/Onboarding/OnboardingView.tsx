import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import DependencyCheck from "./DependencyCheck";
import type {
  DetectorStatus,
  DownloadSkillZipResult,
  PickMcpConfigResult,
} from "../../types/ipc";

interface OnboardingViewProps {
  status: DetectorStatus | null;
  onOpenClaude: () => Promise<{ ok: boolean; error?: string }>;
  onPickMcpConfig: () => Promise<PickMcpConfigResult>;
  onClearManualMcpConfig: () => Promise<{ ok: boolean }>;
  onDownloadSkillZip: () => Promise<DownloadSkillZipResult>;
  onOpenSkillReleasesPage: () => Promise<{ ok: boolean }>;
  onConfirmSkillInstalled: () => Promise<{ ok: boolean }>;
  onClearSkillConfirmation: () => Promise<{ ok: boolean }>;
}

/**
 * Onboarding screen shown when one or more of the three hard
 * dependencies are missing. Replaces the normal main area until
 * `status.allGreen === true`, at which point App.tsx routes back
 * to the regular ModeSelection.
 *
 * The screen is purposely calm: each row explains what's missing
 * and offers minimal actions. Three rows:
 *
 *   1. Claude Desktop running — primary action: open Claude (uses
 *      known install paths or claude:// fallback)
 *   2. MCP registered — escape hatch: pick config file manually
 *      (covers Microsoft Store sandbox redirects, portable installs,
 *      future hash changes)
 *   3. Skill installed — hybrid: filesystem auto-detect for Claude
 *      Code users, plus a download-ZIP-and-confirm flow for Claude
 *      Desktop users (skills there are server-side, not file-based)
 */
export default function OnboardingView({
  status,
  onOpenClaude,
  onPickMcpConfig,
  onClearManualMcpConfig,
  onDownloadSkillZip,
  onOpenSkillReleasesPage,
  onConfirmSkillInstalled,
  onClearSkillConfirmation,
}: OnboardingViewProps) {
  const { t } = useTranslation();

  const [openingClaude, setOpeningClaude] = useState(false);
  const [openError, setOpenError] = useState<string | null>(null);

  const [pickingConfig, setPickingConfig] = useState(false);
  const [pickError, setPickError] = useState<string | null>(null);
  const [pickInfo, setPickInfo] = useState<string | null>(null);

  const [downloadingSkill, setDownloadingSkill] = useState(false);
  const [skillDownloadError, setSkillDownloadError] = useState<string | null>(
    null,
  );
  const [skillDownloadInfo, setSkillDownloadInfo] = useState<string | null>(
    null,
  );
  const [confirmingSkill, setConfirmingSkill] = useState(false);

  const handleOpenClaude = async () => {
    setOpenError(null);
    setOpeningClaude(true);
    try {
      const result = await onOpenClaude();
      if (!result.ok) {
        setOpenError(
          result.error ?? t("onboarding.claude.openFailedFallback"),
        );
      }
    } finally {
      setOpeningClaude(false);
    }
  };

  const handlePickConfig = async () => {
    setPickError(null);
    setPickInfo(null);
    setPickingConfig(true);
    try {
      const result = await onPickMcpConfig();
      if (!result.ok) {
        if (result.reason === "cancelled") return;
        if (result.reason === "parse-error") {
          setPickError(t("onboarding.mcp.errorParse"));
          return;
        }
        setPickError(
          result.errorMessage ?? t("onboarding.mcp.errorRead"),
        );
        return;
      }
      if (!result.hasToraseo) {
        setPickInfo(t("onboarding.mcp.infoNoToraseoYet"));
      }
    } finally {
      setPickingConfig(false);
    }
  };

  const handleDownloadSkill = async () => {
    setSkillDownloadError(null);
    setSkillDownloadInfo(null);
    setDownloadingSkill(true);
    try {
      const result = await onDownloadSkillZip();
      if (!result.ok) {
        setSkillDownloadError(
          result.error ?? t("onboarding.skill.errorDownloadFailed"),
        );
        return;
      }
      setSkillDownloadInfo(
        t("onboarding.skill.infoDownloaded", { tag: result.releaseTag }),
      );
    } finally {
      setDownloadingSkill(false);
    }
  };

  const handleConfirmSkill = async () => {
    // Light confirmation step — we're trusting the user, but it's
    // their product gate, so a deliberate click is appropriate.
    const confirmed = window.confirm(t("onboarding.skill.confirmDialog"));
    if (!confirmed) return;
    setConfirmingSkill(true);
    try {
      await onConfirmSkillInstalled();
    } finally {
      setConfirmingSkill(false);
    }
  };

  const handleClearSkill = async () => {
    setSkillDownloadError(null);
    setSkillDownloadInfo(null);
    await onClearSkillConfirmation();
  };

  // Until the first detector tick lands, show a calm loading state
  // rather than flashing all-failed checkmarks.
  if (!status) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-outline/50">{t("onboarding.loading")}</div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 p-8">
      <header className="text-center">
        <h1 className="text-2xl font-semibold text-outline">
          {t("onboarding.title")}
        </h1>
        <p className="mt-2 text-outline/70">{t("onboarding.subtitle")}</p>
      </header>

      <div className="flex flex-col gap-3">
        {/* Row 1 — Claude Desktop process */}
        <DependencyCheck
          label={t("onboarding.claude.label")}
          hint={
            status.claudeRunning
              ? t("onboarding.claude.hintRunning")
              : t("onboarding.claude.hintMissing")
          }
          satisfied={status.claudeRunning}
          action={{
            label: t("onboarding.claude.openButton"),
            onClick: handleOpenClaude,
            busy: openingClaude,
          }}
        />

        {/* Row 2 — MCP registration with manual picker fallback */}
        <div className="flex flex-col gap-2">
          <DependencyCheck
            label={t("onboarding.mcp.label")}
            hint={
              status.mcpRegistered
                ? t("onboarding.mcp.hintRegistered")
                : t("onboarding.mcp.hintMissing")
            }
            satisfied={status.mcpRegistered}
          />

          <div className="flex flex-wrap items-center gap-2 pl-11 text-xs text-outline/60">
            <button
              type="button"
              onClick={handlePickConfig}
              disabled={pickingConfig}
              className="rounded-md border border-outline/20 bg-white px-2 py-1 hover:bg-orange-50 disabled:opacity-50"
            >
              {pickingConfig
                ? t("onboarding.mcp.picking")
                : t("onboarding.mcp.pickButton")}
            </button>

            {status.manualMcpPath && (
              <>
                <span className="truncate" title={status.manualMcpPath}>
                  {t("onboarding.mcp.usingPath")}{" "}
                  <code>{status.manualMcpPath}</code>
                </span>
                <button
                  type="button"
                  onClick={onClearManualMcpConfig}
                  className="text-orange-600 hover:underline"
                >
                  {t("onboarding.mcp.reset")}
                </button>
              </>
            )}
          </div>

          {pickError && (
            <div className="ml-11 rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-800">
              {pickError}
            </div>
          )}
          {pickInfo && (
            <div className="ml-11 rounded-md border border-orange-200 bg-orange-50 p-2 text-xs text-orange-800">
              {pickInfo}
            </div>
          )}
        </div>

        {/* Row 3 — Skill (hybrid: filesystem OR manual confirmation) */}
        <div className="flex flex-col gap-2">
          <DependencyCheck
            label={t("onboarding.skill.label")}
            hint={skillRowHint(status, t)}
            satisfied={status.skillInstalled}
          />

          <div className="flex flex-wrap items-center gap-2 pl-11 text-xs text-outline/60">
            <button
              type="button"
              onClick={handleDownloadSkill}
              disabled={downloadingSkill}
              className="rounded-md border border-outline/20 bg-white px-2 py-1 hover:bg-orange-50 disabled:opacity-50"
            >
              {downloadingSkill
                ? t("onboarding.skill.downloading")
                : t("onboarding.skill.downloadButton")}
            </button>

            <button
              type="button"
              onClick={onOpenSkillReleasesPage}
              className="rounded-md border border-outline/20 bg-white px-2 py-1 hover:bg-orange-50"
            >
              {t("onboarding.skill.openReleasesButton")}
            </button>

            <button
              type="button"
              onClick={handleConfirmSkill}
              disabled={
                confirmingSkill ||
                // Already satisfied via either source — manual
                // confirmation would be a no-op (or worse, confusing
                // if it overrode an active filesystem detect with an
                // identical-looking manual flag).
                status.skillInstalled
              }
              title={
                status.skillInstalled
                  ? status.skillSource === "filesystem"
                    ? t("onboarding.skill.tooltipFilesystem")
                    : t("onboarding.skill.tooltipManual")
                  : undefined
              }
              className="rounded-md border border-outline/20 bg-white px-2 py-1 hover:bg-orange-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {confirmingSkill
                ? t("onboarding.skill.confirming")
                : t("onboarding.skill.confirmButton")}
            </button>
          </div>

          {/* Active source indicator + reset for manual flag.
              Filesystem source has no reset (user owns those files
              outside of our app), only manual flags are user-undoable
              from inside ToraSEO. */}
          {status.skillInstalled && status.skillSource && (
            <div className="flex flex-wrap items-center gap-2 pl-11 text-xs text-outline/60">
              {status.skillSource === "filesystem" && (
                <span>
                  {t("onboarding.mcp.usingPath")}{" "}
                  <code>~/.claude/skills/toraseo/SKILL.md</code>
                </span>
              )}
              {status.skillSource === "manual" && (
                <>
                  <span>{t("onboarding.skill.hintManual")}</span>
                  <button
                    type="button"
                    onClick={handleClearSkill}
                    className="text-orange-600 hover:underline"
                  >
                    {t("onboarding.mcp.reset")}
                  </button>
                </>
              )}
            </div>
          )}

          {skillDownloadError && (
            <div className="ml-11 rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-800">
              {skillDownloadError}
            </div>
          )}
          {skillDownloadInfo && (
            <div className="ml-11 rounded-md border border-orange-200 bg-orange-50 p-2 text-xs text-orange-800">
              {skillDownloadInfo}
            </div>
          )}
        </div>
      </div>

      {openError && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {openError}
        </div>
      )}

      <footer className="text-center text-xs text-outline/40">
        {t("onboarding.footer")}
      </footer>
    </div>
  );
}

/**
 * Human-readable hint for the Skill row, picking copy based on the
 * current source of truth. Filesystem path mentions `~/.claude/skills`
 * directly so power users know where it's reading from; manual path
 * acknowledges the trust mode; empty state explains the two options.
 */
function skillRowHint(status: DetectorStatus, t: TFunction): string {
  if (!status.skillInstalled) {
    return t("onboarding.skill.hintMissing");
  }
  if (status.skillSource === "filesystem") {
    return t("onboarding.skill.hintFilesystem");
  }
  return t("onboarding.skill.hintManual");
}
