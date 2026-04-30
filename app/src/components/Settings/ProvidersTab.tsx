import { useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  AlertTriangle,
  Check,
  Eye,
  EyeOff,
  Key,
  Pencil,
  Plus,
  RefreshCw,
  Star,
  Trash2,
} from "lucide-react";

import type {
  ProviderId,
  ProviderInfo,
  ProviderModelProfile,
  ProviderUsage,
  SetProviderConfigResult,
  SetProviderModelProfilesResult,
} from "../../types/runtime";
import type { SupportedLocale } from "../../types/ipc";

interface ProvidersTabProps {
  onProviderSaved?: () => void | Promise<void>;
}

interface DraftModelProfile {
  displayName: string;
  modelId: string;
  usageHint: string;
}

type ModelTestStatus =
  | { kind: "ok"; message: string; usage?: ProviderUsage }
  | { kind: "warning"; message: string; usage?: ProviderUsage }
  | { kind: "error"; message: string };

const EMPTY_DRAFT: DraftModelProfile = {
  displayName: "",
  modelId: "",
  usageHint: "",
};

const DEFAULT_OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
const OPENROUTER_MODEL_ID_EXAMPLE =
  "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free";

function looksLikeUrl(value: string): boolean {
  return /^https?:\/\//i.test(value.trim());
}

function looksLikeOpenRouterKey(value: string): boolean {
  return /^sk-or-/i.test(value.trim());
}

function looksLikeOpenRouterModelId(value: string): boolean {
  const trimmed = value.trim();
  return /^[a-z0-9][\w.-]*\/[a-z0-9][\w.:-]*$/i.test(trimmed);
}

function maskSavedApiKey(lastFour: string | null): string {
  return lastFour ? `************${lastFour}` : "****************";
}

function extractOpenRouterModelId(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!looksLikeUrl(trimmed)) return trimmed;

  try {
    const parsed = new URL(trimmed);
    if (!parsed.hostname.endsWith("openrouter.ai")) return null;
    const parts = parsed.pathname
      .split("/")
      .map((part) => part.trim())
      .filter(Boolean);
    const modelStart = parts[0] === "models" ? 1 : 0;
    const provider = parts[modelStart];
    const model = parts[modelStart + 1];
    if (!provider || !model) return null;
    return `${decodeURIComponent(provider)}/${decodeURIComponent(model)}`;
  } catch {
    return null;
  }
}

export default function ProvidersTab({ onProviderSaved }: ProvidersTabProps) {
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
    <div className="mx-auto max-w-3xl">
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
          ...
        </div>
      ) : (
        <div className="space-y-4">
          {providers.map((info) => (
            <ProviderCard
              key={info.id}
              info={info}
              encryptionAvailable={encryptionAvailable}
              onChanged={refresh}
              onProviderSaved={onProviderSaved}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ProviderCard({
  info,
  encryptionAvailable,
  onChanged,
  onProviderSaved,
}: {
  info: ProviderInfo;
  encryptionAvailable: boolean;
  onChanged: () => Promise<void>;
  onProviderSaved?: () => void | Promise<void>;
}) {
  const { t, i18n } = useTranslation();
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState(info.baseUrl ?? "");
  const [reveal, setReveal] = useState(false);
  const [replacingKey, setReplacingKey] = useState(false);
  const [savingKey, setSavingKey] = useState(false);
  const [savingModels, setSavingModels] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [testingModelProfileId, setTestingModelProfileId] = useState<string | null>(
    null,
  );
  const [modelTestStatus, setModelTestStatus] = useState<
    Record<string, ModelTestStatus>
  >({});
  const [flash, setFlash] = useState<null | "saved" | "deleted">(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [modelDraftError, setModelDraftError] = useState<string | null>(null);
  const [modelProfiles, setModelProfiles] = useState<ProviderModelProfile[]>(
    info.modelProfiles,
  );
  const [defaultModelProfileId, setDefaultModelProfileId] = useState<
    string | null
  >(info.defaultModelProfileId);
  const [draft, setDraft] = useState<DraftModelProfile>(EMPTY_DRAFT);
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    setBaseUrl(info.baseUrl ?? "");
    setModelProfiles(info.modelProfiles);
    setDefaultModelProfileId(info.defaultModelProfileId);
    setReplacingKey(false);
    setApiKey("");
    setReveal(false);
  }, [info]);

  const labelKey = blurbKeyFor(info.id);
  const locale: SupportedLocale = i18n.resolvedLanguage === "ru" ? "ru" : "en";

  const flashFor = (kind: "saved" | "deleted") => {
    setFlash(kind);
    setTimeout(() => setFlash(null), 2000);
  };

  const resetKeyForm = () => {
    setApiKey("");
    setReveal(false);
    setReplacingKey(false);
  };

  const resetDraft = () => {
    setDraft(EMPTY_DRAFT);
    setEditingId(null);
  };

  const handleSaveKey = async () => {
    if (savingKey || (!apiKey.trim() && !info.configured)) return;
    const trimmedApiKey = apiKey.trim();
    if (trimmedApiKey && looksLikeUrl(trimmedApiKey)) {
      setErrorCode("api_key_url");
      setErrorMessage(
        t("settings.providers.errors.api_key_url", {
          defaultValue:
            "Paste the OpenRouter API key here, not a model page URL.",
        }),
      );
      return;
    }
    if (
      trimmedApiKey &&
      info.id === "openrouter" &&
      !looksLikeOpenRouterKey(trimmedApiKey)
    ) {
      setErrorCode("api_key_format");
      setErrorMessage(
        t("settings.providers.errors.api_key_format", {
          defaultValue:
            "OpenRouter API keys usually start with sk-or-. Paste the key from OpenRouter -> Keys, not a model ID.",
        }),
      );
      return;
    }
    setSavingKey(true);
    setErrorCode(null);
    setErrorMessage(null);
    try {
      const result: SetProviderConfigResult =
        await window.toraseo.runtime.setProviderConfig({
          id: info.id,
          apiKey: trimmedApiKey,
          baseUrl: baseUrl.trim() || undefined,
          modelProfiles,
          defaultModelProfileId,
      });
      if (!result.ok) {
        setErrorCode(result.errorCode);
        setErrorMessage(result.errorMessage);
        return;
      }
      resetKeyForm();
      flashFor("saved");
      await onChanged();
      await onProviderSaved?.();
    } finally {
      setSavingKey(false);
    }
  };

  const handleSaveModels = async () => {
    if (savingModels || !info.configured) return;
    setSavingModels(true);
    setErrorCode(null);
    setErrorMessage(null);
    try {
      const result: SetProviderModelProfilesResult =
        await window.toraseo.runtime.setProviderModelProfiles({
          id: info.id,
          modelProfiles,
          defaultModelProfileId,
      });
      if (!result.ok) {
        setErrorCode(result.errorCode);
        setErrorMessage(result.errorMessage);
        return;
      }
      flashFor("saved");
      await onChanged();
      await onProviderSaved?.();
    } finally {
      setSavingModels(false);
    }
  };

  const handleDelete = async () => {
    if (deleting) return;
    setDeleting(true);
    try {
      await window.toraseo.runtime.deleteProviderConfig(info.id);
      resetKeyForm();
      resetDraft();
      setModelProfiles([]);
      setDefaultModelProfileId(null);
      flashFor("deleted");
      await onChanged();
    } finally {
      setDeleting(false);
    }
  };

  const handleAddOrUpdateModel = () => {
    const modelId = extractOpenRouterModelId(draft.modelId);
    if (!modelId) {
      if (looksLikeUrl(draft.modelId)) {
        setModelDraftError(
          t("settings.providers.models.modelIdUrlError", {
            defaultValue:
              "Paste the model ID, not the OpenRouter page URL. Example: {{example}}",
            example: OPENROUTER_MODEL_ID_EXAMPLE,
          }),
        );
      }
      return;
    }
    if (!modelId.includes("/")) {
      setModelDraftError(
        t("settings.providers.models.modelIdUrlError", {
          defaultValue:
            "Paste the model ID, not the OpenRouter page URL. Example: {{example}}",
          example: OPENROUTER_MODEL_ID_EXAMPLE,
        }),
      );
      return;
    }
    if (looksLikeOpenRouterKey(modelId)) {
      setModelDraftError(
        t("settings.providers.models.modelIdKeyError", {
          defaultValue:
            "Paste the OpenRouter model ID here, not your API key. Example: {{example}}",
          example: OPENROUTER_MODEL_ID_EXAMPLE,
        }),
      );
      return;
    }
    const displayName = draft.displayName.trim() || modelId;
    const usageHint = draft.usageHint.trim();
    const nextProfile: ProviderModelProfile = {
      id: editingId ?? makeProfileId(modelId, modelProfiles),
      displayName,
      modelId,
      usageHint: usageHint || undefined,
    };
    setModelProfiles((prev) => {
      if (editingId) {
        return prev.map((profile) =>
          profile.id === editingId ? nextProfile : profile,
        );
      }
      return [...prev, nextProfile];
    });
    if (!defaultModelProfileId) {
      setDefaultModelProfileId(nextProfile.id);
    }
    setModelDraftError(null);
    setModelTestStatus((prev) => {
      const next = { ...prev };
      delete next[nextProfile.id];
      return next;
    });
    resetDraft();
  };

  const handleEditModel = (profile: ProviderModelProfile) => {
    setEditingId(profile.id);
    setDraft({
      displayName: profile.displayName,
      modelId: profile.modelId,
      usageHint: profile.usageHint ?? "",
    });
  };

  const handleRemoveModel = (profileId: string) => {
    setModelProfiles((prev) => {
      const next = prev.filter((profile) => profile.id !== profileId);
      if (defaultModelProfileId === profileId) {
        setDefaultModelProfileId(next[0]?.id ?? null);
      }
      return next;
    });
    setModelTestStatus((prev) => {
      const next = { ...prev };
      delete next[profileId];
      return next;
    });
  };

  const handleTestModel = async (profile: ProviderModelProfile) => {
    if (!info.configured || testingModelProfileId) return;
    setTestingModelProfileId(profile.id);
    setModelTestStatus((prev) => {
      const next = { ...prev };
      delete next[profile.id];
      return next;
    });
    try {
      const result = await window.toraseo.runtime.testProviderConnection(
        info.id,
        locale,
        profile.modelId,
      );
      if (result.ok) {
        setModelTestStatus((prev) => ({
          ...prev,
          [profile.id]: result.structuredReport
            ? {
                kind: "ok",
                message: t("settings.providers.models.testOkStructured", {
                  defaultValue: "Model responds with structured audit output.",
                }),
                usage: result.usage,
              }
            : {
                kind: "warning",
                message:
                  result.warningMessage ??
                  t("settings.providers.models.testOkPlain", {
                    defaultValue:
                      "Model responds, but structured audit output was not confirmed.",
                  }),
                usage: result.usage,
              },
        }));
      } else {
        setModelTestStatus((prev) => ({
          ...prev,
          [profile.id]: {
            kind: "error",
            message: result.errorMessage,
          },
        }));
      }
    } finally {
      setTestingModelProfileId(null);
    }
  };

  const saveKeyDisabled =
    !encryptionAvailable ||
    savingKey ||
    (!info.configured && apiKey.trim().length === 0) ||
    (info.configured &&
      apiKey.trim().length === 0 &&
      baseUrl.trim() === (info.baseUrl ?? ""));
  const saveModelsDisabled =
    savingModels || !info.configured || modelProfiles.length === 0;
  const deleteDisabled = deleting || !info.configured;
  const editingApiKey = !info.configured || replacingKey;
  const displayedApiKey = editingApiKey
    ? apiKey
    : maskSavedApiKey(info.lastFour);

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

      <div className="grid gap-3 md:grid-cols-[1fr_220px]">
        <Field
          label={t("settings.providers.labels.apiKey")}
          hint={
            info.configured && !replacingKey
              ? t("settings.providers.hints.apiKeySaved", {
                  defaultValue:
                    "Saved keys are shown as a mask. ToraSEO cannot reveal the stored secret back into this field.",
                })
              : t("settings.providers.hints.apiKey", {
                  defaultValue:
                    "Use an OpenRouter key from your OpenRouter account. It usually starts with sk-or-.",
                })
          }
          trailing={
            info.configured && !replacingKey ? (
              <button
                type="button"
                onClick={() => {
                  setReplacingKey(true);
                  setApiKey("");
                  setReveal(false);
                }}
                className="flex h-6 items-center gap-1 rounded px-2 text-xs text-outline-900/60 transition hover:text-outline-900"
              >
                {t("settings.providers.actions.replaceStoredKey", {
                  defaultValue: "Replace key",
                })}
              </button>
            ) : (
              <span className="flex items-center gap-1">
                {info.configured && replacingKey && (
                  <button
                    type="button"
                    onClick={resetKeyForm}
                    className="flex h-6 items-center gap-1 rounded px-2 text-xs text-outline-900/60 transition hover:text-outline-900"
                  >
                    {t("settings.providers.actions.cancelKeyEdit", {
                      defaultValue: "Cancel",
                    })}
                  </button>
                )}
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
              </span>
            )
          }
        >
          <input
            type={editingApiKey ? (reveal ? "text" : "password") : "text"}
            value={displayedApiKey}
            onChange={(event) => {
              if (!editingApiKey) return;
              const nextValue = event.target.value;
              setApiKey(nextValue);
              setErrorCode(null);
              setErrorMessage(null);
              if (looksLikeOpenRouterModelId(nextValue)) {
                setErrorCode("api_key_format");
                setErrorMessage(
                  t("settings.providers.errors.api_key_format", {
                    defaultValue:
                      "OpenRouter API keys usually start with sk-or-. Paste the key from OpenRouter -> Keys, not a model ID.",
                  }),
                );
              }
            }}
            placeholder={
              info.configured
                ? maskSavedApiKey(info.lastFour)
                : t("settings.providers.placeholders.apiKey")
            }
            readOnly={!editingApiKey}
            spellCheck={false}
            autoComplete="off"
            disabled={!encryptionAvailable || savingKey}
            className={`w-full rounded-md border border-outline/15 px-3 py-2 font-mono text-sm text-outline-900 transition focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-60 ${
              editingApiKey ? "bg-white" : "bg-orange-50/40"
            }`}
          />
        </Field>

        <Field
          label={t("settings.providers.labels.baseUrl")}
          hint={t("settings.providers.hints.baseUrl", {
            defaultValue:
              "Leave empty to use the default OpenRouter endpoint: {{url}}",
            url: DEFAULT_OPENROUTER_BASE_URL,
          })}
        >
          <input
            type="text"
            value={baseUrl}
            onChange={(event) => {
              setBaseUrl(event.target.value);
              setErrorCode(null);
              setErrorMessage(null);
            }}
            placeholder={t("settings.providers.placeholders.baseUrl")}
            spellCheck={false}
            autoComplete="off"
            disabled={!encryptionAvailable || savingKey}
            className="w-full rounded-md border border-outline/15 bg-white px-3 py-2 font-mono text-sm text-outline-900 transition focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-60"
          />
        </Field>
      </div>

      <div className="mt-5 border-t border-outline/10 pt-4">
        <div className="mb-3">
          <div>
            <h3 className="text-sm font-semibold text-outline-900">
              {t("settings.providers.models.title", {
                defaultValue: "OpenRouter models",
              })}
            </h3>
            <p className="mt-1 text-xs text-outline-900/60">
              {t("settings.providers.models.body", {
                defaultValue:
                  "Use one OpenRouter key, then save the models you want to use inside ToraSEO.",
              })}
            </p>
          </div>
        </div>
        <p className="mb-3 text-xs leading-relaxed text-outline-900/50">
          {t("settings.providers.models.testHelp", {
            defaultValue:
              "Testing is optional and runs a small request against the exact model you choose. It can spend provider tokens on paid models.",
          })}
        </p>

        {modelProfiles.length > 0 ? (
          <div className="space-y-2">
            {modelProfiles.map((profile) => (
              <div
                key={profile.id}
                className="rounded-md border border-outline/10 px-3 py-2"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-medium text-outline-900">
                        {profile.displayName}
                      </p>
                      {profile.id === defaultModelProfileId && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-orange-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-orange-700">
                          <Star size={10} />
                          {t("settings.providers.models.default", {
                            defaultValue: "Default",
                          })}
                        </span>
                      )}
                    </div>
                    <p className="truncate font-mono text-xs text-outline-900/55">
                      {profile.modelId}
                    </p>
                    {profile.usageHint && (
                      <p className="mt-0.5 text-xs text-outline-900/50">
                        {profile.usageHint}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleTestModel(profile)}
                      disabled={!info.configured || Boolean(testingModelProfileId)}
                      className="inline-flex items-center gap-1.5 rounded-md border border-outline/15 bg-white px-2 py-1 text-xs text-outline-900 transition hover:bg-orange-50 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <RefreshCw
                        size={13}
                        className={
                          testingModelProfileId === profile.id
                            ? "animate-spin"
                            : undefined
                        }
                      />
                      {t("settings.providers.actions.testThisModel", {
                        defaultValue: "Test",
                      })}
                    </button>
                    <button
                      type="button"
                      onClick={() => setDefaultModelProfileId(profile.id)}
                      className="rounded-md border border-outline/15 bg-white px-2 py-1 text-xs text-outline-900 transition hover:bg-orange-50"
                    >
                      {t("settings.providers.actions.makeDefault", {
                        defaultValue: "Set default",
                      })}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleEditModel(profile)}
                      className="rounded-md border border-outline/15 bg-white p-1.5 text-outline-900 transition hover:bg-orange-50"
                      aria-label={t("settings.providers.actions.editModel", {
                        defaultValue: "Edit model",
                      })}
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRemoveModel(profile.id)}
                      className="rounded-md border border-outline/15 bg-white p-1.5 text-outline-900 transition hover:bg-orange-50"
                      aria-label={t("settings.providers.actions.removeModel", {
                        defaultValue: "Remove model",
                      })}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
                {modelTestStatus[profile.id] && (
                  <ModelTestStatusLine status={modelTestStatus[profile.id]} />
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-md border border-dashed border-outline/20 bg-orange-50/40 px-3 py-3 text-sm text-outline-900/60">
            <p>
              {t("settings.providers.models.empty", {
                defaultValue:
                  "Add at least one OpenRouter model before API + AI Chat can start.",
              })}
            </p>
            <p className="mt-1 text-xs">
              {t("settings.providers.models.modelIdHelp", {
                defaultValue:
                  "Use the model ID from the OpenRouter model page, not the page link. Example: {{example}}",
                example: OPENROUTER_MODEL_ID_EXAMPLE,
              })}
            </p>
          </div>
        )}

        <div className="mt-3 grid gap-3 md:grid-cols-[1fr_1fr_1fr_auto]">
          <Field
            label={t("settings.providers.labels.modelName", {
              defaultValue: "Display name",
            })}
          >
            <input
              type="text"
              value={draft.displayName}
              onChange={(event) =>
                setDraft((prev) => ({
                  ...prev,
                  displayName: event.target.value,
                }))
              }
              placeholder={t("settings.providers.placeholders.modelName", {
                defaultValue: "GPT-5.5",
              })}
              className="w-full rounded-md border border-outline/15 bg-white px-3 py-2 text-sm text-outline-900 transition focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </Field>
          <Field
            label={t("settings.providers.labels.modelId", {
              defaultValue: "Model ID",
            })}
            hint={t("settings.providers.hints.modelId", {
              defaultValue:
                "Paste the exact OpenRouter model ID shown under the model name.",
            })}
          >
            <input
            type="text"
            value={draft.modelId}
            onChange={(event) => {
                const nextValue = event.target.value;
                setDraft((prev) => ({ ...prev, modelId: nextValue }));
                setModelDraftError(null);
                if (looksLikeOpenRouterKey(nextValue)) {
                  setModelDraftError(
                    t("settings.providers.models.modelIdKeyError", {
                      defaultValue:
                        "Paste the OpenRouter model ID here, not your API key. Example: {{example}}",
                      example: OPENROUTER_MODEL_ID_EXAMPLE,
                    }),
                  );
                }
              }}
              placeholder={t("settings.providers.placeholders.modelId", {
                defaultValue: OPENROUTER_MODEL_ID_EXAMPLE,
              })}
              spellCheck={false}
              className="w-full rounded-md border border-outline/15 bg-white px-3 py-2 font-mono text-sm text-outline-900 transition focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </Field>
          <Field
            label={t("settings.providers.labels.usageHint", {
              defaultValue: "Usage hint",
            })}
          >
            <input
              type="text"
              value={draft.usageHint}
              onChange={(event) =>
                setDraft((prev) => ({
                  ...prev,
                  usageHint: event.target.value,
                }))
              }
              placeholder={t("settings.providers.placeholders.usageHint", {
                defaultValue: "Deep audit",
              })}
              className="w-full rounded-md border border-outline/15 bg-white px-3 py-2 text-sm text-outline-900 transition focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </Field>
          <div className="flex items-end gap-2">
            <button
              type="button"
              onClick={handleAddOrUpdateModel}
              disabled={draft.modelId.trim().length === 0}
              className="inline-flex h-10 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-white transition hover:bg-primary-600 disabled:cursor-not-allowed disabled:bg-outline-900/20"
            >
              <Plus size={14} />
              {editingId
                ? t("settings.providers.actions.updateModel", {
                    defaultValue: "Update",
                  })
                : t("settings.providers.actions.addModel", {
                    defaultValue: "Add",
                  })}
            </button>
          </div>
        </div>
      </div>

      {errorCode && (
        <p role="alert" className="mt-3 text-xs text-red-600">
          {errorMessage ??
            t(`settings.providers.errors.${errorCode}`, {
              defaultValue: errorCode,
            })}
        </p>
      )}
      {modelDraftError && (
        <p role="alert" className="mt-3 text-xs text-red-600">
          {modelDraftError}
        </p>
      )}
      <div className="mt-4 flex flex-wrap items-center justify-end gap-3">
        {flash === "saved" && (
          <StatusFlash icon={<Check size={14} />}>
            {t("settings.providers.status.savedJustNow")}
          </StatusFlash>
        )}
        {flash === "deleted" && (
          <StatusFlash icon={<Trash2 size={14} />} muted>
            {t("settings.providers.status.deleted")}
          </StatusFlash>
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
          onClick={handleSaveModels}
          disabled={saveModelsDisabled}
          className="rounded-md border border-primary px-4 py-2 text-sm font-medium text-primary transition hover:bg-orange-50 disabled:cursor-not-allowed disabled:border-outline/20 disabled:text-outline-900/30"
        >
          {savingModels
            ? "..."
            : t("settings.providers.actions.saveModels", {
                defaultValue: "Save models",
              })}
        </button>
        <button
          type="button"
          onClick={handleSaveKey}
          disabled={saveKeyDisabled}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-600 disabled:cursor-not-allowed disabled:bg-outline-900/20"
        >
          {savingKey
            ? "..."
            : info.configured
              ? apiKey.trim()
                ? t("settings.providers.actions.replaceKey", {
                    defaultValue: "Replace key",
                  })
                : t("settings.providers.actions.saveProvider", {
                    defaultValue: "Save settings",
                  })
              : t("settings.providers.actions.saveKey", {
                  defaultValue: "Save key",
                })}
        </button>
      </div>
    </div>
  );
}

function ModelTestStatusLine({ status }: { status: ModelTestStatus }) {
  const icon =
    status.kind === "ok" ? (
      <Check size={13} />
    ) : (
      <AlertTriangle size={13} />
    );
  const color =
    status.kind === "ok"
      ? "text-green-600"
      : status.kind === "warning"
        ? "text-amber-700"
        : "text-red-600";

  return (
    <p
      className={`mt-2 flex items-start gap-1.5 text-xs ${color}`}
      role={status.kind === "error" ? "alert" : "status"}
      aria-live="polite"
    >
      <span className="mt-0.5 shrink-0">{icon}</span>
      <span>{status.message}</span>
      {"usage" in status && status.usage && (
        <span className="font-mono text-outline-900/55">
          {formatUsage(status.usage)}
        </span>
      )}
    </p>
  );
}

function formatUsage(usage: ProviderUsage): string {
  const parts: string[] = [];
  if (typeof usage.totalTokens === "number") {
    parts.push(`${usage.totalTokens} tokens`);
  }
  if (typeof usage.cost === "number") {
    parts.push(`cost ${usage.cost.toFixed(6)}`);
  }
  return parts.length > 0 ? `(${parts.join(", ")})` : "";
}

function Field({
  label,
  hint,
  trailing,
  children,
}: {
  label: string;
  hint?: string;
  trailing?: ReactNode;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 flex items-center justify-between text-xs font-medium uppercase tracking-wider text-outline-900/60">
        <span>{label}</span>
        {trailing}
      </span>
      {children}
      {hint && (
        <span className="mt-1 block text-xs leading-relaxed text-outline-900/45">
          {hint}
        </span>
      )}
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

function StatusFlash({
  icon,
  muted = false,
  children,
}: {
  icon: ReactNode;
  muted?: boolean;
  children: ReactNode;
}) {
  return (
    <span
      className={`flex items-center gap-1 text-xs ${
        muted ? "text-outline-900/60" : "text-green-600"
      }`}
      role="status"
      aria-live="polite"
    >
      {icon}
      {children}
    </span>
  );
}

function makeProfileId(
  modelId: string,
  existingProfiles: ProviderModelProfile[],
): string {
  const existing = new Set(existingProfiles.map((profile) => profile.id));
  const base =
    modelId
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "model";
  let candidate = base;
  let suffix = 2;
  while (existing.has(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}

function blurbKeyFor(id: ProviderId): string {
  switch (id) {
    case "openrouter":
      return "settings.providers.openrouter";
    case "openai":
      return "settings.providers.openrouter";
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
