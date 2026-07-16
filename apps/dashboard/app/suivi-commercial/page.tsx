import { listSuiviCommercial } from "@/lib/prospects.server";
import { SuiviCommercialBoard } from "@/components/suivi-commercial-board";

export const metadata = {
  title: "Suivi commercial — BrokerComply",
};

// Always read the live pipeline (no static caching).
export const dynamic = "force-dynamic";

export default async function SuiviCommercialPage() {
  const prospects = await listSuiviCommercial();

  return (
    <div className="space-y-7">
      <header className="space-y-2">
        <span className="inline-flex items-center rounded-full bg-brand-50 px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-brand-700 ring-1 ring-inset ring-brand-200">
          Prospection
        </span>
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900">
          Suivi commercial
        </h1>
        <p className="max-w-2xl text-[15px] leading-relaxed text-slate-500">
          Le pipeline de prospection : la liste d&apos;appels du jour (offre sans réponse à
          J+15) et le funnel complet des agences démarchées. Relance e-mail à J+7, appel à
          J+15 — toute réponse coupe la cadence.
        </p>
      </header>

      <SuiviCommercialBoard initial={prospects} />
    </div>
  );
}
