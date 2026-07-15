import Link from "next/link";
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
        <nav className="flex gap-1 border-b border-line pt-2">
          <span className="border-b-2 border-brand-600 px-3 py-2 text-sm font-semibold text-ink">
            Plan d&apos;action
          </span>
          <Link href="/config/pub" className="px-3 py-2 text-sm font-medium text-ink-soft hover:text-ink">
            Audit pub
          </Link>
        </nav>
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
