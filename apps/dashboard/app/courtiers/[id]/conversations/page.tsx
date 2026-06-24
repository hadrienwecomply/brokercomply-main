import { notFound } from 'next/navigation';
import { candidateMatchDomains } from '@brokercomply/shared';
import { getBroker } from '@/lib/brokers.server';
import { getConversations } from '@/lib/conversations.server';
import { ConversationsTab } from '@/components/conversations-tab';

export const dynamic = 'force-dynamic';

export default async function BrokerConversationsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const broker = await getBroker(id);
  if (!broker) notFound();

  const data = broker.dbId
    ? await getConversations(broker.dbId)
    : { conversations: [], lastSyncedAt: null };
  const candidateDomains = candidateMatchDomains({
    emails: broker.emails,
    website: broker.website,
  });

  return (
    <section className="space-y-4">
      <h2 className="font-display text-xl font-semibold text-ink">Conversations</h2>
      <ConversationsTab
        slug={broker.id}
        brokerEmails={broker.emails}
        matchDomains={broker.matchDomains ?? []}
        candidateDomains={candidateDomains}
        data={data}
      />
    </section>
  );
}
