import { ArrowLeft, FlaskConical, Gauge, Sigma } from "lucide-react";
import { useTranslation } from "react-i18next";

type LaboratoryPageKind = "qualityLab" | "formulas";

interface LaboratoryPlaceholderViewProps {
  kind: LaboratoryPageKind;
  onReturnHome: () => void;
}

export default function LaboratoryPlaceholderView({
  kind,
  onReturnHome,
}: LaboratoryPlaceholderViewProps) {
  const { t } = useTranslation();
  const isFormulas = kind === "formulas";
  const Icon = isFormulas ? Sigma : Gauge;
  const titleKey = isFormulas ? "laboratory.formulas.title" : "laboratory.qualityLab.title";
  const bodyKey = isFormulas ? "laboratory.formulas.body" : "laboratory.qualityLab.body";

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
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-white/45">
            <FlaskConical size={14} />
            {t("laboratory.sidebarEyebrow")}
          </p>
          <h1 className="mt-2 font-display text-xl font-semibold leading-snug">
            {t("toolbar.laboratory")}
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-white/65">
            {t("laboratory.sidebarBody")}
          </p>
        </div>
      </aside>

      <main className="toraseo-sidebar-scrollbar min-w-0 flex-1 overflow-y-auto px-8 py-8">
        <div className="mx-auto flex min-h-full w-full max-w-5xl items-center justify-center">
          <section className="w-full rounded-lg border border-outline/10 bg-white p-8 text-center shadow-sm">
            <span className="mx-auto grid h-14 w-14 place-items-center rounded-lg bg-primary/10 text-primary">
              <Icon size={26} strokeWidth={1.8} />
            </span>
            <p className="mt-6 text-xs font-semibold uppercase tracking-wider text-primary">
              {t("laboratory.inDevelopment")}
            </p>
            <h2 className="mt-2 font-display text-3xl font-semibold text-outline-900">
              {t(titleKey)}
            </h2>
            <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-outline-900/65">
              {t(bodyKey)}
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}
