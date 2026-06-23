'use server';

import { revalidatePath } from 'next/cache';
import { syncBrokerFolderDelta } from '@brokercomply/shared';
import { getDb } from './db.server';
import { getBroker } from './brokers.server';
import { getSharePointClient, provisionBrokerFolder } from './sharepoint.server';

/** Manual "Synchroniser" button: pull the broker's SharePoint folder now. */
export async function syncBrokerDocuments(slug: string): Promise<void> {
  const client = getSharePointClient();
  if (!client) return;
  const broker = await getBroker(slug);
  if (!broker?.dbId || !broker.sharePointFolderId) return;
  await syncBrokerFolderDelta({ db: getDb() }, client, {
    brokerId: broker.dbId,
    folderItemId: broker.sharePointFolderId,
  });
  revalidatePath(`/courtiers/${slug}/documents`);
}

/** Retry provisioning the folder when a broker is in 'pending'/'error' state. */
export async function retryBrokerFolder(slug: string): Promise<void> {
  const broker = await getBroker(slug);
  if (!broker?.dbId) return;
  await provisionBrokerFolder(broker.dbId, broker.societe);
  revalidatePath(`/courtiers/${slug}/documents`);
}
