import Link from "next/link";
import { notFound } from "next/navigation";
import { CircleHelp } from "lucide-react";
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
      <div className="flex items-center justify-between gap-4">
        <h2 className="font-display text-xl font-semibold text-ink">Audit publicité</h2>
        <Link
          href="/guide/audit-pub"
          target="_blank"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-soft transition-colors hover:text-ink"
        >
          <CircleHelp className="size-4" />
          Comment ça marche ?
        </Link>
      </div>
      <PubAuditPanel slug={broker.id} brokerDbId={broker.dbId ?? null} audits={audits} />
    </section>
  );
}
