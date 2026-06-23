import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getBroker } from "@/lib/brokers.server";
import { listFormSubmissions } from "@/lib/formulaires.server";
import { getOfficer } from "@/lib/officers";
import { BrokerHeader } from "@/components/broker-header";
import { BrokerWorkspace } from "@/components/broker-workspace";
import { BrokerDetailTabs } from "@/components/broker-detail-tabs";
import { FormulairePanel } from "@/components/formulaire-panel";

export const dynamic = "force-dynamic";

export default async function BrokerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const broker = await getBroker(id);
  if (!broker) notFound();

  const officer = getOfficer(broker.officerId);
  const today = new Date().toISOString();
  const submissions = broker.dbId ? await listFormSubmissions(broker.dbId) : [];

  return (
    <div className="space-y-8">
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 text-sm text-ink-soft transition-colors hover:text-brand-700"
      >
        <ArrowLeft className="size-4" />
        Portfolio
      </Link>

      <BrokerHeader broker={broker} officer={officer} today={today} />

      <BrokerDetailTabs
        formsCount={submissions.length}
        plan={<BrokerWorkspace broker={broker} today={today} />}
        forms={<FormulairePanel slug={broker.id} submissions={submissions} />}
      />
    </div>
  );
}
