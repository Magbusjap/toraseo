import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Info,
  RefreshCw,
  Settings,
  Github,
  X,
  BookOpen,
  History,
  HelpCircle,
  ListChecks,
} from "lucide-react";
import { useUpdater } from "../../hooks/useUpdater";

interface TopToolbarProps {
  /**
   * Switch the app into Settings mode. App.tsx handles the actual
   * routing — the toolbar just signals intent.
  */
  onOpenSettings: () => void;
  onOpenDocumentation: () => void;
  onOpenChangelog: () => void;
  onOpenToolCatalog: () => void;
  onOpenFaq: () => void;
}

/**
 * TopToolbar — thin top bar across the entire window (above sidebar
 * and main area), 36px tall, white background with a subtle bottom
 * border. Holds the application menu items and a GitHub link.
 *
 * Behavior:
 * - "About ToraSEO" — opens a small modal with version, license, links
 * - "Check for updates" — calls window.toraseo.updater.check() and
 *   reports the result via a top-center toast. Four meaningful
 *   outcomes:
 *     1. Update is already downloaded — say "ready to install" and
 *        remind that the install card is in the corner.
 *     2. Update is currently downloading — say "in progress".
 *     3. A newer version exists on the server — say "found, see the
 *        corner card". The card itself is rendered by the existing
 *        UpdateNotification component reacting to the
 *        update-available event.
 *     4. We're on the latest — say "no updates, you're current".
 * - "Documentation" — opens the in-app documentation page.
 * - "Changelog" — opens the in-app release history page.
 * - "FAQ" — opens the in-app FAQ page.
 * - "Settings" — switches the app into Settings mode (App.tsx
 *   handles routing). The current Settings UI exposes only the
 *   Language tab; the placeholder modal that used to live here for
 *   v0.0.5 is gone.
 * - GitHub icon — opens the repo root in the system browser via the
 *   existing webContents.setWindowOpenHandler that delegates http(s)
 *   URLs to shell.openExternal.
 *
 * The toolbar is rendered in App.tsx outside the sidebar/main flex
 * row, on top of it. During onboarding it stays visible — the user
 * should still be able to read About or open Settings even if
 * dependencies aren't satisfied yet (in fact, Settings → Language
 * is exactly where they go to switch UI language before
 * troubleshooting).
 */
export default function TopToolbar({
  onOpenSettings,
  onOpenDocumentation,
  onOpenChangelog,
  onOpenToolCatalog,
  onOpenFaq,
}: TopToolbarProps) {
  const { t } = useTranslation();
  const [aboutOpen, setAboutOpen] = useState(false);
  const [updateCheckMsg, setUpdateCheckMsg] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  // Read the updater's lifecycle state so we can produce honest copy
  // when the user clicks "Check for updates" while a previous update
  // is already mid-flight (downloading) or sitting fully downloaded
  // and waiting for an install click. Without this, we'd report
  // "no new version" because the server's latest matches the version
  // we've already pulled — which is true but misleading: there IS
  // an update, it's just no longer remote.
  const { state: updaterState, info: updaterInfo } = useUpdater();

  const handleCheckUpdates = async () => {
    if (checking) return;
    setChecking(true);
    setUpdateCheckMsg(null);

    if (updaterState === "downloaded" && updaterInfo) {
      setUpdateCheckMsg(
        t("updater.check.alreadyDownloaded", {
          version: updaterInfo.version,
        }),
      );
      setChecking(false);
      setTimeout(() => setUpdateCheckMsg(null), 4000);
      return;
    }
    if (updaterState === "downloading") {
      setUpdateCheckMsg(t("updater.check.alreadyDownloading"));
      setChecking(false);
      setTimeout(() => setUpdateCheckMsg(null), 4000);
      return;
    }

    try {
      const result = await window.toraseo.updater.check();
      if (!result.ok) {
        setUpdateCheckMsg(
          `${t("updater.check.errorPrefix")} ${result.error ?? t("updater.check.errorUnknown")}`,
        );
      } else if (
        result.version &&
        result.currentVersion &&
        result.version !== result.currentVersion
      ) {
        setUpdateCheckMsg(
          t("updater.check.found", { version: result.version }),
        );
      } else {
        const v = result.currentVersion ?? window.toraseo.version;
        setUpdateCheckMsg(t("updater.check.noneFound", { version: v }));
      }
    } catch (err) {
      setUpdateCheckMsg(
        `${t("updater.check.errorPrefix")} ${(err as Error).message ?? t("updater.check.errorUnknown")}`,
      );
    } finally {
      setChecking(false);
      setTimeout(() => setUpdateCheckMsg(null), 4000);
    }
  };

  const handleOpenGithub = () => {
    window.open("https://github.com/Magbusjap/toraseo", "_blank");
  };

  return (
    <>
      <header
        className="flex h-9 shrink-0 items-center justify-between border-b border-outline/10 bg-white px-3"
        role="banner"
      >
        <div className="flex items-center gap-2">
          <span className="font-display text-sm font-semibold text-outline-900">
            {t("app.name")}
          </span>
          <span className="font-mono text-[10px] uppercase tracking-wider text-outline-900/40">
            v{window.toraseo.version}
          </span>
        </div>

        <nav className="flex items-center gap-1">
          <ToolbarButton
            icon={<Settings size={14} />}
            label={t("toolbar.settings")}
            onClick={onOpenSettings}
          />
          <ToolbarButton
            icon={<BookOpen size={14} />}
            label={t("toolbar.documentation")}
            onClick={onOpenDocumentation}
          />
          <ToolbarButton
            icon={<ListChecks size={14} />}
            label={t("toolbar.toolCatalog")}
            onClick={onOpenToolCatalog}
          />
          <ToolbarButton
            icon={<HelpCircle size={14} />}
            label={t("toolbar.faq")}
            onClick={onOpenFaq}
          />
          <ToolbarButton
            icon={<History size={14} />}
            label={t("toolbar.changelog")}
            onClick={onOpenChangelog}
          />
          <ToolbarButton
            icon={
              <RefreshCw
                size={14}
                className={checking ? "animate-spin" : ""}
              />
            }
            label={t("toolbar.checkUpdates")}
            onClick={handleCheckUpdates}
            disabled={checking}
          />
          <ToolbarButton
            icon={<Info size={14} />}
            label={t("toolbar.about")}
            onClick={() => setAboutOpen(true)}
          />
          <span
            className="mx-1 h-4 w-px bg-outline/15"
            aria-hidden="true"
          />
          <ToolbarButton
            icon={<Github size={14} />}
            label={t("toolbar.github")}
            onClick={handleOpenGithub}
          />
        </nav>
      </header>

      {updateCheckMsg && (
        <div
          className="fixed left-1/2 top-12 z-40 -translate-x-1/2 rounded-md border border-outline/15 bg-white px-3 py-2 text-xs text-outline-900 shadow-md"
          role="status"
        >
          {updateCheckMsg}
        </div>
      )}

      {aboutOpen && (
        <Modal title={t("about.title")} onClose={() => setAboutOpen(false)}>
          <div className="space-y-3 text-sm text-outline-900/80">
            <p>
              <strong className="text-outline-900">{t("app.name")}</strong>{" "}
              — {t("about.description")}
            </p>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
              <dt className="text-outline-900/50">{t("about.version")}</dt>
              <dd className="font-mono">{window.toraseo.version}</dd>
              <dt className="text-outline-900/50">{t("about.license")}</dt>
              <dd>Apache-2.0</dd>
              <dt className="text-outline-900/50">{t("about.author")}</dt>
              <dd>Mikhail Ankudinov</dd>
              <dt className="text-outline-900/50">{t("about.github")}</dt>
              <dd>
                <button
                  onClick={handleOpenGithub}
                  className="text-primary hover:underline"
                >
                  Magbusjap/toraseo
                </button>
              </dd>
            </dl>
            <p className="pt-2 text-xs text-outline-900/50">
              {t("about.tagline")}
            </p>
          </div>
        </Modal>
      )}
    </>
  );
}

interface ToolbarButtonProps {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}

function ToolbarButton({ icon, label, onClick, disabled }: ToolbarButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex items-center gap-1.5 rounded px-2 py-1 text-xs text-outline-900/70 transition hover:bg-orange-50 hover:text-outline-900 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

interface ModalProps {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}

/**
 * Lightweight modal with a backdrop. Centered, max-width 420px.
 * No animations for now — simple appears/disappears. Click-outside
 * and X-button both close it; Escape key would be nice-to-have but
 * not required for v0.0.6.
 */
function Modal({ title, onClose, children }: ModalProps) {
  const { t } = useTranslation();
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      <div
        className="relative w-[420px] max-w-[90vw] rounded-lg border border-outline/15 bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          aria-label={t("common.close")}
          className="absolute right-3 top-3 rounded p-1 text-outline-900/40 hover:bg-orange-50 hover:text-outline-900"
        >
          <X size={16} />
        </button>
        <h2
          id="modal-title"
          className="mb-3 font-display text-base font-semibold text-outline-900"
        >
          {title}
        </h2>
        {children}
      </div>
    </div>
  );
}
