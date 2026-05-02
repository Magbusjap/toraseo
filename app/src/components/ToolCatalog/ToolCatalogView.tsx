import { ArrowLeft, Circle, ListChecks } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  TOOL_CATALOG_VERSIONS,
  type CatalogToolChange,
  type CatalogToolGroup,
  type CatalogToolRow,
} from "../../config/toolCatalog";
import { ANALYSIS_TYPES, type AnalysisTypeId } from "../../config/analysisTypes";
import type { SupportedLocale } from "../../types/ipc";

interface ToolCatalogViewProps {
  currentLocale: SupportedLocale;
  onReturnHome: () => void;
}

export default function ToolCatalogView({
  currentLocale,
  onReturnHome,
}: ToolCatalogViewProps) {
  const { t } = useTranslation();
  const [analysisType, setAnalysisType] =
    useState<AnalysisTypeId>("article_text");
  const [version, setVersion] = useState(TOOL_CATALOG_VERSIONS[0].version);
  const activeVersion =
    TOOL_CATALOG_VERSIONS.find((item) => item.version === version) ??
    TOOL_CATALOG_VERSIONS[0];
  const activeSection = activeVersion.sections.find(
    (section) => section.analysisType === analysisType,
  );
  const groupedRows = useMemo(
    () => groupRows(activeSection?.rows ?? []),
    [activeSection],
  );

  return (
    <div className="flex h-full w-full min-w-0 flex-1 overflow-hidden bg-orange-50/30">
      <aside className="toraseo-sidebar-scrollbar w-[300px] shrink-0 overflow-y-auto bg-surface px-5 py-6 text-white">
        <button
          type="button"
          onClick={onReturnHome}
          className="inline-flex items-center gap-2 rounded-md border border-white/10 px-3 py-2 text-sm font-medium text-white/80 transition hover:border-primary/70 hover:text-white"
        >
          <ArrowLeft size={15} />
          {t("sidebar.backToHomeTitle")}
        </button>

        <div className="mt-7">
          <p className="text-xs font-semibold uppercase tracking-wider text-white/45">
            {t("toolCatalog.sidebarEyebrow", {
              defaultValue: "Реестр аналитики",
            })}
          </p>
          <h1 className="mt-2 font-display text-xl font-semibold leading-snug">
            {t("toolCatalog.title", {
              defaultValue: "Список инструментов для аналитики",
            })}
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-white/65">
            {t("toolCatalog.sidebarBody", {
              defaultValue:
                "Справочник показывает, какие проверки входят в каждый тип анализа. Сейчас это режим просмотра без редактирования.",
            })}
          </p>
        </div>

        <nav className="mt-7 space-y-1.5">
          {ANALYSIS_TYPES.map((item) => {
            const selected = item.id === analysisType;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setAnalysisType(item.id)}
                className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm transition ${
                  selected
                    ? "bg-primary text-white"
                    : "text-white/75 hover:bg-white/5 hover:text-white"
                }`}
              >
                <span>
                  {t(`modeSelection.analysisTypes.${item.i18nKeyBase}.title`)}
                </span>
                <Circle
                  size={8}
                  className={selected ? "fill-white" : "fill-white/20"}
                />
              </button>
            );
          })}
        </nav>
      </aside>

      <main className="toraseo-sidebar-scrollbar min-w-0 flex-1 overflow-y-auto px-8 py-8">
        <div className="mx-auto w-full max-w-6xl">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-primary">
                <ListChecks size={20} />
                <p className="text-xs font-semibold uppercase tracking-wider">
                  {t("toolCatalog.readOnly", {
                    defaultValue: "Только просмотр",
                  })}
                </p>
              </div>
              <h2 className="mt-2 font-display text-3xl font-semibold text-outline-900">
                {t(`modeSelection.analysisTypes.${analysisKey(analysisType)}.title`)}
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-outline-900/65">
                {t("toolCatalog.body", {
                  defaultValue:
                    "Здесь показаны пользовательские названия инструментов, их роль в анализе и изменения по версиям. Внутренние ключи скрыты от интерфейса.",
                })}
              </p>
            </div>
            <Legend />
          </div>

          <div className="mt-7 flex flex-wrap gap-2">
            {TOOL_CATALOG_VERSIONS.map((item) => (
              <button
                key={item.version}
                type="button"
                onClick={() => setVersion(item.version)}
                className={`rounded-md border px-4 py-2 text-sm font-semibold transition ${
                  item.version === activeVersion.version
                    ? "border-primary bg-primary text-white"
                    : "border-outline/15 bg-white text-outline-900/70 hover:border-primary/50 hover:text-outline-900"
                }`}
              >
                {item.label[currentLocale]}
              </button>
            ))}
          </div>

          <div className="mt-5 overflow-hidden rounded-lg border border-outline/10 bg-white">
            <div className="border-b border-outline/10 bg-white px-5 py-4">
              <h3 className="font-display text-lg font-semibold text-outline-900">
                {activeVersion.label[currentLocale]}
              </h3>
              <p className="mt-1 text-sm text-outline-900/55">
                {activeVersion.status === "current"
                  ? t("toolCatalog.currentHint", {
                      defaultValue:
                        "Актуальная таблица для текущей ветки разработки.",
                    })
                  : t("toolCatalog.archiveHint", {
                      defaultValue:
                        "Архивная таблица показывает состояние инструментов в выбранной версии.",
                    })}
              </p>
            </div>

            {(["primary", "secondary", "additional", "choice"] as const).map(
              (group) => (
                <CatalogGroup
                  key={group}
                  group={group}
                  rows={groupedRows[group]}
                  locale={currentLocale}
                />
              ),
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

function CatalogGroup({
  group,
  rows,
  locale,
}: {
  group: CatalogToolGroup;
  rows: CatalogToolRow[];
  locale: SupportedLocale;
}) {
  const { t } = useTranslation();
  if (rows.length === 0) return null;

  return (
    <section className="border-b border-outline/10 last:border-b-0">
      <div className="bg-orange-50/60 px-5 py-3">
        <h4 className="text-sm font-semibold uppercase tracking-wider text-outline-900/60">
          {t(`toolCatalog.groups.${group}`)}
        </h4>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse text-left text-sm">
          <thead className="bg-white text-xs uppercase tracking-wider text-outline-900/45">
            <tr>
              <th className="w-[230px] px-5 py-3 font-semibold">
                {t("toolCatalog.columns.tool", { defaultValue: "Инструмент" })}
              </th>
              <th className="w-[150px] px-5 py-3 font-semibold">
                {t("toolCatalog.columns.status", { defaultValue: "Статус" })}
              </th>
              <th className="px-5 py-3 font-semibold">
                {t("toolCatalog.columns.description", {
                  defaultValue: "Что делает",
                })}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={`${row.name.ru}-${row.group}`}
                className="border-t border-outline/10 align-top"
              >
                <td className="px-5 py-4 font-semibold text-outline-900">
                  {row.name[locale]}
                </td>
                <td className="px-5 py-4">
                  <StatusPill status={row.change ?? "stable"} />
                </td>
                <td className="px-5 py-4 leading-relaxed text-outline-900/65">
                  {row.description[locale]}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function StatusPill({ status }: { status: CatalogToolChange }) {
  const { t } = useTranslation();
  const className =
    status === "added"
      ? "border-green-200 bg-green-50 text-green-700"
      : status === "moved"
        ? "border-blue-200 bg-blue-50 text-blue-700"
        : status === "removed"
          ? "border-red-200 bg-red-50 text-red-700"
          : "border-outline/10 bg-outline-900/5 text-outline-900/55";

  return (
    <span
      className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${className}`}
    >
      {t(`toolCatalog.status.${status}`)}
    </span>
  );
}

function Legend() {
  const { t } = useTranslation();
  return (
    <div className="rounded-lg border border-outline/10 bg-white px-4 py-3 text-xs text-outline-900/60">
      <p className="font-semibold text-outline-900">
        {t("toolCatalog.legendTitle", { defaultValue: "Цвета версий" })}
      </p>
      <div className="mt-2 grid gap-1.5">
        <LegendItem className="bg-green-500" label={t("toolCatalog.status.added")} />
        <LegendItem className="bg-blue-500" label={t("toolCatalog.status.moved")} />
        <LegendItem className="bg-red-500" label={t("toolCatalog.status.removed")} />
      </div>
    </div>
  );
}

function LegendItem({
  className,
  label,
}: {
  className: string;
  label: string;
}) {
  return (
    <span className="flex items-center gap-2">
      <span className={`h-2.5 w-2.5 rounded-full ${className}`} />
      {label}
    </span>
  );
}

function groupRows(rows: CatalogToolRow[]): Record<CatalogToolGroup, CatalogToolRow[]> {
  return {
    primary: rows.filter((row) => row.group === "primary"),
    secondary: rows.filter((row) => row.group === "secondary"),
    additional: rows.filter((row) => row.group === "additional"),
    choice: rows.filter((row) => row.group === "choice"),
  };
}

function analysisKey(analysisType: AnalysisTypeId): string {
  const item = ANALYSIS_TYPES.find((entry) => entry.id === analysisType);
  return item?.i18nKeyBase ?? "siteByUrl";
}
