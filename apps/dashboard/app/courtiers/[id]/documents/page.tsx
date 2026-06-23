import { notFound } from 'next/navigation';
import { getBroker } from '@/lib/brokers.server';
import { getBrokerDocuments } from '@/lib/documents.server';
import { isSharePointConfigured } from '@/lib/sharepoint.server';
import { DocumentsTab } from '@/components/documents-tab';

export const dynamic = 'force-dynamic';

export default async function BrokerDocumentsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const broker = await getBroker(id);
  if (!broker) notFound();

  const documents = broker.dbId ? await getBrokerDocuments(broker.dbId) : [];

  return (
    <section className="space-y-4">
      <h2 className="font-display text-xl font-semibold text-ink">Documents</h2>
      <DocumentsTab broker={broker} documents={documents} configured={isSharePointConfigured()} />
    </section>
  );
}
