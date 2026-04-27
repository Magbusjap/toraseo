import { useState } from "react";
import {
  Info,
  RefreshCw,
  Settings,
  Github,
  X,
  BookOpen,
  HelpCircle,
} from "lucide-react";
import { useUpdater } from "../../hooks/useUpdater";

/**
 * TopToolbar — thin top bar across the entire window (above sidebar
 * and main area), 36px tall, white background with subtle bottom
 * border. Holds the application menu items and a GitHub link.
 *
 * Behavior:
 * - "О ToraSEO" — opens a small modal with version, license, links
 * - "Проверить обновления" — calls window.toraseo.updater.check()
 *   and reports the result through a top-center toast. The four
 *   meaningful outcomes are:
 *     1. Update is already downloaded — say "ready to install"
 *        and remind that the install card is in the corner.
 *     2. Update is currently downloading — say "in progress".
 *     3. A newer version exists on the server — say "found, see
 *        the corner card". The card itself is rendered by the
 *        existing UpdateNotification component reacting to the
 *        update-available event.
 *     4. We're on the latest — say "no updates, you're current".
 * - "Настройки" — placeholder modal "Coming soon" until v0.0.6+
 *   when we wire i18n and persistence settings here.
 * - "Документация" — opens README on GitHub. There's no project
 *   website yet; everything lives in the repo.
 * - "FAQ" — opens docs/FAQ.md on GitHub. Same reason: no website,
 *   FAQ is a markdown file in the repo that GitHub renders.
 * - GitHub icon — opens the repo root in the system browser via
 *   the existing webContents.setWindowOpenHandler that delegates
 *   http(s) URLs to shell.openExternal.
 *
 * The toolbar is rendered in App.tsx outside the sidebar/main flex
 * row, on top of it. During onboarding it stays visible — the user
 * should still be able to read "О ToraSEO" or open settings even if
 * dependencies aren't satisfied yet.
 */
export default function TopToolbar() {
  const [aboutOpen, setAboutOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
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

    // Short-circuit: if the user already has an update downloaded
    // and waiting, OR is in the middle of downloading one, don't
    // bother re-querying the server. Tell them what's already
    // happening on their machine.
    if (updaterState === "downloaded" && updaterInfo) {
      setUpdateCheckMsg(
        `Обновление ${updaterInfo.version} уже скачано и готово к установке. См. уведомление в углу.`,
      );
      setChecking(false);
      setTimeout(() => setUpdateCheckMsg(null), 4000);
      return;
    }
    if (updaterState === "downloading") {
      setUpdateCheckMsg(
        "Обновление уже скачивается. См. уведомление в углу.",
      );
      setChecking(false);
      setTimeout(() => setUpdateCheckMsg(null), 4000);
      return;
    }

    try {
      const result = await window.toraseo.updater.check();
      if (!result.ok) {
        setUpdateCheckMsg(
          `Ошибка проверки: ${result.error ?? "неизвестно"}`,
        );
      } else if (result.version && result.currentVersion && result.version !== result.currentVersion) {
        // electron-updater returns the *server* latest in `result.version`
        // and our installed version in `result.currentVersion`. They
        // differ ⇒ a newer one exists. The update-available event has
        // already fired by now, so the corner card is already visible.
        setUpdateCheckMsg(
          `Найдено обновление: ${result.version}. См. уведомление в углу.`,
        );
      } else {
        // No version field, OR server == installed ⇒ we're current.
        // Use whichever version we have access to (currentVersion
        // from the API call, or fall back to the preload constant).
        const v =
          result.currentVersion ?? window.toraseo.version;
        setUpdateCheckMsg(
          `Новых обновлений не найдено. Вы на версии ${v}.`,
        );
      }
    } catch (err) {
      setUpdateCheckMsg(
        `Ошибка: ${(err as Error).message ?? "не удалось проверить обновления"}`,
      );
    } finally {
      setChecking(false);
      // Auto-dismiss the toast after 4 seconds
      setTimeout(() => setUpdateCheckMsg(null), 4000);
    }
  };

  const handleOpenGithub = () => {
    // setWindowOpenHandler in main.ts catches http(s) and delegates to
    // shell.openExternal, so a plain anchor with target="_blank" works.
    // We use window.open to keep the click handler explicit and not
    // rely on default anchor behavior inside Electron.
    window.open("https://github.com/Magbusjap/toraseo", "_blank");
  };

  const handleOpenDocs = () => {
    // Documentation lives in the repo README until a project website
    // exists. Anchor #readme makes GitHub scroll past the file tree.
    window.open("https://github.com/Magbusjap/toraseo#readme", "_blank");
  };

  const handleOpenFaq = () => {
    // FAQ is a markdown file rendered by GitHub. If the file moves,
    // update this URL alongside docs/FAQ.md itself.
    window.open(
      "https://github.com/Magbusjap/toraseo/blob/main/docs/FAQ.md",
      "_blank",
    );
  };

  return (
    <>
      <header
        className="flex h-9 shrink-0 items-center justify-between border-b border-outline/10 bg-white px-3"
        role="banner"
      >
        {/* Left: brand */}
        <div className="flex items-center gap-2">
          <span className="font-display text-sm font-semibold text-outline-900">
            ToraSEO
          </span>
          <span className="font-mono text-[10px] uppercase tracking-wider text-outline-900/40">
            v{window.toraseo.version}
          </span>
        </div>

        {/* Right: menu items */}
        <nav className="flex items-center gap-1">
          <ToolbarButton
            icon={<Info size={14} />}
            label="О ToraSEO"
            onClick={() => setAboutOpen(true)}
          />
          <ToolbarButton
            icon={
              <RefreshCw
                size={14}
                className={checking ? "animate-spin" : ""}
              />
            }
            label="Проверить обновления"
            onClick={handleCheckUpdates}
            disabled={checking}
          />
          <ToolbarButton
            icon={<BookOpen size={14} />}
            label="Документация"
            onClick={handleOpenDocs}
          />
          <ToolbarButton
            icon={<HelpCircle size={14} />}
            label="FAQ"
            onClick={handleOpenFaq}
          />
          <ToolbarButton
            icon={<Settings size={14} />}
            label="Настройки"
            onClick={() => setSettingsOpen(true)}
          />
          <span
            className="mx-1 h-4 w-px bg-outline/15"
            aria-hidden="true"
          />
          <ToolbarButton
            icon={<Github size={14} />}
            label="GitHub"
            onClick={handleOpenGithub}
          />
        </nav>
      </header>

      {/* Update-check toast (separate from UpdateNotification because
          it shows for "no update" / "error" cases too, where the
          notification card stays hidden). */}
      {updateCheckMsg && (
        <div
          className="fixed left-1/2 top-12 z-40 -translate-x-1/2 rounded-md border border-outline/15 bg-white px-3 py-2 text-xs text-outline-900 shadow-md"
          role="status"
        >
          {updateCheckMsg}
        </div>
      )}

      {/* About modal */}
      {aboutOpen && (
        <Modal title="О ToraSEO" onClose={() => setAboutOpen(false)}>
          <div className="space-y-3 text-sm text-outline-900/80">
            <p>
              <strong className="text-outline-900">ToraSEO</strong> — настольное
              приложение для SEO-аудита, работающее в паре с Claude Desktop.
            </p>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
              <dt className="text-outline-900/50">Версия:</dt>
              <dd className="font-mono">{window.toraseo.version}</dd>
              <dt className="text-outline-900/50">Лицензия:</dt>
              <dd>MIT</dd>
              <dt className="text-outline-900/50">Автор:</dt>
              <dd>Mikhail Ankudinov</dd>
              <dt className="text-outline-900/50">GitHub:</dt>
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
              SEE THE TOP
            </p>
          </div>
        </Modal>
      )}

      {/* Settings modal — placeholder */}
      {settingsOpen && (
        <Modal title="Настройки" onClose={() => setSettingsOpen(false)}>
          <div className="space-y-3 text-sm text-outline-900/70">
            <p>
              Раздел настроек пока пуст. В следующих версиях здесь появятся:
            </p>
            <ul className="list-inside list-disc space-y-1 text-xs">
              <li>Переключение языка интерфейса (EN / RU)</li>
              <li>Сохранение выбранных tools между запусками</li>
              <li>Тёмная тема</li>
              <li>Путь к Claude Desktop config.json</li>
            </ul>
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
 * not required for v0.0.5.
 */
function Modal({ title, onClose, children }: ModalProps) {
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
          aria-label="Закрыть"
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
