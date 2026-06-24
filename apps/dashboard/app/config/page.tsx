import { Eyebrow } from "@/components/ui";
import { getGlobals } from "@/lib/brokers.server";
import { ConfigWorkspace } from "@/components/config-workspace";

export const dynamic = "force-dynamic";

export default async function ConfigPage() {
  const { offsets, tasks } = await getGlobals();
  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <Eyebrow>Administration</Eyebrow>
        <h1 className="text-3xl font-semibold text-ink">Configuration du plan d&apos;action</h1>
        <p className="text-ink-soft">
          Réglez les échéances par section et le modèle de tâches appliqué aux nouveaux courtiers.
          Les courtiers existants ne sont pas modifiés.
        </p>
      </header>
      <ConfigWorkspace
        offsets={offsets.map((o) => ({
          code: o.code,
          title: o.title,
          offsetDays: o.offsetDays,
          position: o.position,
        }))}
        tasks={tasks.map((t) => ({
          id: t.id,
          stepCode: t.stepCode,
          title: t.title,
          emailSubject: t.emailSubject,
          emailBody: t.emailBody,
          position: t.position,
        }))}
      />
    </div>
  );
}
