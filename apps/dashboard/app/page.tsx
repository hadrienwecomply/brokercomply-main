import { listBrokers } from "@/lib/brokers.server";
import { OFFICERS } from "@/lib/officers";
import { PortfolioPro } from "@/components/portfolio-pro";
import { NewBrokerButton } from "@/components/new-broker-button";

export const dynamic = "force-dynamic";

export default async function PortfolioPage() {
  const brokers = await listBrokers();
  const today = new Date().toISOString();

  return (
    <div className="space-y-7">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-emerald-700 ring-1 ring-inset ring-emerald-200">
            Pilotage courtier
          </span>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">
            Portfolio
          </h1>
          <p className="max-w-2xl text-[15px] leading-relaxed text-slate-500">
            Vue d&apos;ensemble de l&apos;avancement de chaque courtier sur son plan
            d&apos;action de conformité — triable, filtrable, et priorisée par échéance.
          </p>
        </div>
        <NewBrokerButton />
      </header>

      <PortfolioPro brokers={brokers} officers={OFFICERS} today={today} />
    </div>
  );
}
