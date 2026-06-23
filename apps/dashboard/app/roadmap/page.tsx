import { currentOfficer } from "@/lib/officer.server";
import { listRoadmap } from "@/lib/roadmap.server";
import { RoadmapBoard } from "@/components/roadmap-board";

export const metadata = {
  title: "Roadmap — BrokerComply",
};

// Always read the live board (no static caching).
export const dynamic = "force-dynamic";

export default async function RoadmapPage() {
  const officer = await currentOfficer();
  const items = await listRoadmap(officer);

  return (
    <div className="space-y-7">
      <header className="space-y-2">
        <span className="inline-flex items-center rounded-full bg-brand-50 px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-brand-700 ring-1 ring-inset ring-brand-200">
          Roadmap produit
        </span>
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900">
          Roadmap collaborative
        </h1>
        <p className="max-w-2xl text-[15px] leading-relaxed text-slate-500">
          Le plan de développement, en Kanban. Déplacez les cartes entre colonnes, ajoutez vos
          idées et votez pour prioriser. Tout le monde dans l&apos;équipe peut contribuer.
        </p>
      </header>

      <RoadmapBoard initialItems={items} />
    </div>
  );
}
