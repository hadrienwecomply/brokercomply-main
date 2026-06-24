import { notFound } from 'next/navigation';
import { getBroker } from '@/lib/brokers.server';
import { getMailRedirect, getSentEmails, isMailSendConfigured } from '@/lib/mail.server';
import { BrokerWorkspace } from '@/components/broker-workspace';

export const dynamic = 'force-dynamic';

export default async function BrokerPlanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const broker = await getBroker(id);
  if (!broker) notFound();

  const today = new Date().toISOString();
  const sentEmails = broker.dbId ? await getSentEmails(broker.dbId) : [];

  return (
    <section className="space-y-4">
      <h2 className="font-display text-xl font-semibold text-ink">Plan d&apos;action</h2>
      <BrokerWorkspace
        broker={broker}
        today={today}
        sentEmails={sentEmails}
        mailConfigured={isMailSendConfigured()}
        mailRedirect={getMailRedirect()}
      />
    </section>
  );
}
