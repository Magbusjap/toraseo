import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, Eye, EyeOff, Key, Trash2 } from "lucide-react";

import type {
  ProviderId,
  ProviderInfo,
  SetProviderConfigResult,
} from "../../types/runtime";

/**
 * AI providers settings tab.
 *
 * Lets the user attach an LLM provider (currently OpenRouter only)
 * to the Native Runtime by entering an API key. The key is sent
 * directly to the main process over IPC, encrypted at rest via
 * Electron's safeStorage, and never round-trips back to the
 * renderer in plaintext.
 *
 * UX rules:
 * - Per-provider card with status (configured / not), masked
 *   "ends in …xxxx" hint, and a save form for editing.
 * - Password input by default; an "eye" toggle reveals the typed
 *   value while the user is composing it.
 * - Save and Delete are immediate (no global dirty-state guard) —
 *   secrets-style settings are typically applied on click rather
 *   than batched.
 * - When safeStorage is unavailable on the host, the form is
 *   disabled and a banner explains the situation rather than
 *   silently failing on Save.
 */
export default function ProvidersTab() {
  const { t } = useTranslation();
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [encryptionAvailable, setEncryptionAvailable] = useState(true);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    const [list, hasEncryption] = await Promise.all([
      window.toraseo.runtime.listProviders(),
      window.toraseo.runtime.isEncryptionAvailable(),
    ]);
    setProviders(list);
    setEncryptionAvailable(hasEncryption);
    setLoading(false);
  };

  useEffect(() => {
    void refresh();
  }, []);

  return (
    <div className="mx-auto max-w-2xl">
      <header className="mb-6 flex items-center gap-2">
        <Key className="text-primary" size={20} />
        <h1 className="font-display text-xl font-semibold text-outline-900">
          {t("settings.providers.title")}
        </h1>
      </header>

      <p className="mb-4 text-sm text-outline-900/70">
        {t("settings.providers.intro")}
      </p>

      {!encryptionAvailable && (
        <div
          role="alert"
          className="mb-4 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900"
        >
          {t("settings.providers.encryptionUnavailable")}
        </div>
      )}

      {loading ? (
        <div className="rounded-md border border-outline/10 bg-white p-5 text-sm text-outline-900/60">
          …
        </div>
      ) : (
        <div className="space-y-4">
          {providers.map((info) => (
            <ProviderCard
              key={info.id}
              info={info}
              encryptionAvailable={encryptionAvailable}
              onChanged={refresh}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface ProviderCardProps {
  info: ProviderInfo;
  encryptionAvailable: boolean;
  /** Re-fetch the provider list after a save/delete. */
  onChanged: () => Promise<void>;
}

/**
 * Per-provider editable card. Stage 2.2 ships only OpenRouter
 * copy; future providers reuse the same card by switching the
 * blurb via the i18n key.
 */
function ProviderCard({
  info,
  encryptionAvailable,
  onChanged,
}: ProviderCardProps) {
  const { t } = useTranslation();
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [defaultModel, setDefaultModel] = useState("");
  const [reveal, setReveal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [flash, setFlash] = useState<null | "saved" | "deleted">(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);

  const labelKey = blurbKeyFor(info.id);

  const reset = () => {
    setApiKey("");
    setBaseUrl("");
    setDefaultModel("");
    setReveal(false);
  };

  const flashFor = (kind: "saved" | "deleted") => {
    setFlash(kind);
    setTimeout(() => setFlash(null), 2000);
  };

  const handleSave = async () => {
    if (saving || !apiKey.trim()) return;
    setSaving(true);
    setErrorCode(null);
    try {
      const result: SetProviderConfigResult =
        await window.toraseo.runtime.setProviderConfig({
          id: info.id,
          apiKey: apiKey.trim(),
          baseUrl: baseUrl.trim() || undefined,
          defaultModel: defaultModel.trim() || undefined,
        });
      if (!result.ok) {
        setErrorCode(result.errorCode);
        return;
      }
      reset();
      flashFor("saved");
      await onChanged();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (deleting) return;
    setDeleting(true);
    try {
      await window.toraseo.runtime.deleteProviderConfig(info.id);
      reset();
      flashFor("deleted");
      await onChanged();
    } finally {
      setDeleting(false);
    }
  };

  const saveDisabled =
    !encryptionAvailable || saving || apiKey.trim().length === 0;
  const deleteDisabled = deleting || !info.configured;

  return (
    <div className="rounded-lg border border-outline/10 bg-white p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-base font-semibold text-outline-900">
            {t(labelKey + ".name")}
          </h2>
          <p className="mt-1 text-xs text-outline-900/60">
            {t(labelKey + ".blurb")}
          </p>
        </div>
        <StatusBadge info={info} />
      </div>

      <div className="space-y-3">
        <Field
          label={t("settings.providers.labels.apiKey")}
          trailing={
            <button
              type="button"
              onClick={() => setReveal((v) => !v)}
              className="flex h-6 items-center gap-1 rounded px-2 text-xs text-outline-900/60 transition hover:text-outline-900"
              aria-pressed={reveal}
            >
              {reveal ? <EyeOff size={12} /> : <Eye size={12} />}
              {reveal
                ? t("settings.providers.actions.hide")
                : t("settings.providers.actions.show")}
            </button>
          }
        >
          <input
            type={reveal ? "text" : "password"}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={t("settings.providers.placeholders.apiKey")}
            spellCheck={false}
            autoComplete="off"
            disabled={!encryptionAvailable || saving}
            className="w-full rounded-md border border-outline/15 bg-white px-3 py-2 font-mono text-sm text-outline-900 transition focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-60"
          />
        </Field>

        <Field label={t("settings.providers.labels.baseUrl")}>
          <input
            type="text"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder={t("settings.providers.placeholders.baseUrl")}
            spellCheck={false}
            autoComplete="off"
            disabled={!encryptionAvailable || saving}
            className="w-full rounded-md border border-outline/15 bg-white px-3 py-2 font-mono text-sm text-outline-900 transition focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-60"
          />
        </Field>

        <Field label={t("settings.providers.labels.defaultModel")}>
          <input
            type="text"
            value={defaultModel}
            onChange={(e) => setDefaultModel(e.target.value)}
            placeholder={t("settings.providers.placeholders.defaultModel")}
            spellCheck={false}
            autoComplete="off"
            disabled={!encryptionAvailable || saving}
            className="w-full rounded-md border border-outline/15 bg-white px-3 py-2 font-mono text-sm text-outline-900 transition focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-60"
          />
        </Field>
      </div>

      {errorCode && (
        <p
          role="alert"
          className="mt-3 text-xs text-red-600"
        >
          {t(`settings.providers.errors.${errorCode}`, {
            defaultValue: errorCode,
          })}
        </p>
      )}

      <div className="mt-4 flex items-center justify-end gap-3">
        {flash === "saved" && (
          <span
            className="flex items-center gap-1 text-xs text-green-600"
            role="status"
            aria-live="polite"
          >
            <Check size={14} />
            {t("settings.providers.status.savedJustNow")}
          </span>
        )}
        {flash === "deleted" && (
          <span
            className="flex items-center gap-1 text-xs text-outline-900/60"
            role="status"
            aria-live="polite"
          >
            <Trash2 size={14} />
            {t("settings.providers.status.deleted")}
          </span>
        )}
        <button
          type="button"
          onClick={handleDelete}
          disabled={deleteDisabled}
          className="flex items-center gap-1.5 rounded-md border border-outline/15 px-3 py-2 text-sm font-medium text-outline-900 transition hover:bg-outline-900/5 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Trash2 size={14} />
          {t("settings.providers.actions.delete")}
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saveDisabled}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-600 disabled:cursor-not-allowed disabled:bg-outline-900/20"
        >
          {t("settings.providers.actions.save")}
        </button>
      </div>
    </div>
  );
}

interface FieldProps {
  label: string;
  trailing?: React.ReactNode;
  children: React.ReactNode;
}

function Field({ label, trailing, children }: FieldProps) {
  return (
    <label className="block">
      <span className="mb-1 flex items-center justify-between text-xs font-medium uppercase tracking-wider text-outline-900/60">
        <span>{label}</span>
        {trailing}
      </span>
      {children}
    </label>
  );
}

function StatusBadge({ info }: { info: ProviderInfo }) {
  const { t } = useTranslation();
  if (!info.configured) {
    return (
      <span className="rounded-full border border-outline/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-outline-900/60">
        {t("settings.providers.status.notConfigured")}
      </span>
    );
  }
  return (
    <div className="flex flex-col items-end gap-1">
      <span className="rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-700">
        {t("settings.providers.status.configured")}
      </span>
      {info.lastFour && (
        <span className="font-mono text-[10px] text-outline-900/50">
          {t("settings.providers.status.lastFour", { value: info.lastFour })}
        </span>
      )}
    </div>
  );
}

/**
 * Map a provider id to its i18n blurb key. Centralised so the
 * card body code does not branch on provider ids.
 */
function blurbKeyFor(id: ProviderId): string {
  switch (id) {
    case "openrouter":
      return "settings.providers.openrouter";
    case "openai":
      return "settings.providers.openrouter"; // placeholder until adapter ships
    case "anthropic":
      return "settings.providers.openrouter";
    case "google":
      return "settings.providers.openrouter";
    case "local":
      return "settings.providers.openrouter";
    default:
      return "settings.providers.openrouter";
  }
}
