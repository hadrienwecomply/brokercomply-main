import { notFound } from "next/navigation";
import { getBroker } from "@/lib/brokers.server";
import { listPubAudits } from "@/lib/pub-audit.server";
import { PubAuditPanel } from "@/components/pub-audit-panel";

export const dynamic = "force-dynamic";

/** Audit pub tab — AI compliance audits of the broker's advertising creatives. */
export default async function BrokerPubAuditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const broker = await getBroker(id);
  if (!broker) notFound();

  const audits = broker.dbId ? await listPubAudits(broker.dbId) : [];

  return (
    <section className="space-y-4">
      <h2 className="font-display text-xl font-semibold text-ink">Audit publicité</h2>
      <PubAuditPanel slug={broker.id} brokerDbId={broker.dbId ?? null} audits={audits} />
    </section>
  );
}
