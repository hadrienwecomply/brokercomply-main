import { notFound } from "next/navigation";
import { getBroker } from "@/lib/brokers.server";
import { listWebsiteAudits } from "@/lib/website-audit.server";
import { WebsiteAuditPanel } from "@/components/website-audit-panel";

export const dynamic = "force-dynamic";

/** Audit site web tab — AI compliance audits of the broker's public website. */
export default async function BrokerAuditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const broker = await getBroker(id);
  if (!broker) notFound();

  const audits = broker.dbId ? await listWebsiteAudits(broker.dbId) : [];

  return (
    <section className="space-y-4">
      <h2 className="font-display text-xl font-semibold text-ink">Audit site web</h2>
      <WebsiteAuditPanel slug={broker.id} website={broker.website ?? null} audits={audits} />
    </section>
  );
}
