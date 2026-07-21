import { currentOfficer } from "@/lib/officer.server";
import {
  listAiActivity,
  listSuiviCommercial,
  listTaskBoard,
} from "@/lib/prospects.server";
import { SuiviCommercialBoard } from "@/components/suivi-commercial-board";

export const metadata = {
  title: "Suivi commercial — BrokerComply",
};

// Always read the live pipeline (no static caching).
export const dynamic = "force-dynamic";

export default async function SuiviCommercialPage() {
  const [prospects, tasks, aiActions, me] = await Promise.all([
    listSuiviCommercial(),
    listTaskBoard(),
    listAiActivity(),
    currentOfficer(),
  ]);

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
          Les tâches de prospection (relances J+7, appels J+15, RDV à recaler, rappels
          programmés — avec échéances et assignation) et le funnel complet des agences.
          Chaque tâche terminée reste dans l&apos;historique de sa fiche.
        </p>
      </header>

      <SuiviCommercialBoard
        prospects={prospects}
        tasksOpen={tasks.open}
        tasksRecent={tasks.recent}
        aiActions={aiActions}
        me={me}
      />
    </div>
  );
}
