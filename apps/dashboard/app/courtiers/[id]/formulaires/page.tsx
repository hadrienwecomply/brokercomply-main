import { notFound } from "next/navigation";
import { getBroker } from "@/lib/brokers.server";
import { listFormSubmissions } from "@/lib/formulaires.server";
import { FormulairePanel } from "@/components/formulaire-panel";

export const dynamic = "force-dynamic";

/** Formulaires tab — Fillout submissions matched to this broker + their review/PDF state. */
export default async function BrokerFormulairesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const broker = await getBroker(id);
  if (!broker) notFound();

  const submissions = broker.dbId ? await listFormSubmissions(broker.dbId) : [];

  return (
    <section className="space-y-4">
      <h2 className="font-display text-xl font-semibold text-ink">Formulaires</h2>
      <FormulairePanel slug={broker.id} submissions={submissions} />
    </section>
  );
}
