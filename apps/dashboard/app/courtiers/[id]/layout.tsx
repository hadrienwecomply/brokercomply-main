import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { getBroker } from '@/lib/brokers.server';
import { getOfficer } from '@/lib/officers';
import { BrokerHeader } from '@/components/broker-header';
import { BrokerTabs } from '@/components/broker-tabs';

export const dynamic = 'force-dynamic';

export default async function BrokerLayout({
  params,
  children,
}: {
  params: Promise<{ id: string }>;
  children: React.ReactNode;
}) {
  const { id } = await params;
  const broker = await getBroker(id);
  if (!broker) notFound();

  const officer = getOfficer(broker.officerId);
  const today = new Date().toISOString();

  return (
    <div className="space-y-6">
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 text-sm text-ink-soft transition-colors hover:text-brand-700"
      >
        <ArrowLeft className="size-4" />
        Portfolio
      </Link>

      <BrokerHeader broker={broker} officer={officer} today={today} />
      <BrokerTabs slug={broker.id} />
      {children}
    </div>
  );
}
