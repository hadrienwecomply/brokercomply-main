import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { createDb, brokers, brokerDocuments, type Db, type NewBroker } from '../../src/db/index.js';
import { createBrokerWithPlan } from '../../src/brokers/index.js';
import {
  findBrokerBySharePointPath,
  getSyncState,
  listBrokerDocuments,
  markDocumentDeleted,
  setSharePointFolder,
  setSyncState,
  upsertBrokerDocument,
} from '../../src/documents/index.js';

async function canConnect(): Promise<boolean> {
  const { db, client } = createDb();
  try {
    await db.execute(sql`select 1`);
    return true;
  } catch {
    return false;
  } finally {
    await client.end();
  }
}

const dbAvailable = await canConnect();

// Namespaced so cleanup only removes this test's rows (never the whole table).
const SLUG = 'sp-docs-test-broker';

function brokerInput(): NewBroker {
  return { slug: SLUG, societe: 'SP Docs Test', emails: [], countries: [] };
}

describe.skipIf(!dbAvailable)('documents service (integration)', () => {
  let db: Db;
  let close: () => Promise<void>;
  let brokerId: string;

  async function cleanup() {
    // Cascades broker_documents AND sharepoint_sync_state (both FK broker_id).
    await db.delete(brokers).where(eq(brokers.slug, SLUG));
  }

  beforeAll(async () => {
    const conn = createDb();
    db = conn.db;
    close = () => conn.client.end();
    await cleanup();
    const { broker } = await createBrokerWithPlan({ db }, { broker: brokerInput(), steps: [] });
    brokerId = broker.id;
  });

  afterAll(async () => {
    await cleanup();
    await close();
  });

  it('records a broker SharePoint folder + status', async () => {
    const row = await setSharePointFolder({ db }, brokerId, {
      folderId: 'folder-1',
      webUrl: 'https://sp/folder-1',
      path: '01 - Clients/SP Docs Test',
      status: 'linked',
    });
    expect(row?.sharePointFolderId).toBe('folder-1');
    expect(row?.sharePointStatus).toBe('linked');
    expect(row?.sharePointFolderPath).toBe('01 - Clients/SP Docs Test');
  });

  it('upserts a document idempotently by drive_item_id', async () => {
    await upsertBrokerDocument(
      { db },
      {
        brokerId,
        driveItemId: 'item-1',
        name: 'v1.pdf',
        size: 10,
        isFolder: false,
      },
    );
    await upsertBrokerDocument(
      { db },
      {
        brokerId,
        driveItemId: 'item-1',
        name: 'v2.pdf',
        size: 20,
        isFolder: false,
      },
    );
    const rows = await db
      .select()
      .from(brokerDocuments)
      .where(eq(brokerDocuments.driveItemId, 'item-1'));
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('v2.pdf');
    expect(rows[0].size).toBe(20);
  });

  it('soft-deletes and re-activates documents; listing hides soft-deleted by default', async () => {
    await markDocumentDeleted({ db }, 'item-1');
    const live = await listBrokerDocuments({ db }, brokerId);
    expect(live.find((d) => d.driveItemId === 'item-1')).toBeUndefined();
    const all = await listBrokerDocuments({ db }, brokerId, { includeDeleted: true });
    expect(all.find((d) => d.driveItemId === 'item-1')?.deletedAt).toBeTruthy();

    // Re-appearing in SharePoint clears the soft delete.
    await upsertBrokerDocument({ db }, { brokerId, driveItemId: 'item-1', name: 'v3.pdf' });
    const liveAgain = await listBrokerDocuments({ db }, brokerId);
    expect(liveAgain.find((d) => d.driveItemId === 'item-1')?.name).toBe('v3.pdf');
  });

  it('persists and upserts the broker folder delta token', async () => {
    await setSyncState({ db }, brokerId, { folderItemId: 'folder-1', deltaLink: 'token-1' });
    const first = await getSyncState({ db }, brokerId);
    expect(first?.deltaLink).toBe('token-1');
    expect(first?.folderItemId).toBe('folder-1');
    await setSyncState({ db }, brokerId, { folderItemId: 'folder-1', deltaLink: 'token-2' });
    expect((await getSyncState({ db }, brokerId))?.deltaLink).toBe('token-2');
  });

  it('blocks linking two brokers to the same SharePoint folder path', async () => {
    await setSharePointFolder({ db }, brokerId, {
      folderId: 'folder-1',
      path: '01 - Clients/SP Docs Test',
      status: 'linked',
    });
    const clash = await findBrokerBySharePointPath(
      { db },
      '01 - Clients/SP Docs Test',
      'some-other-id',
    );
    expect(clash?.id).toBe(brokerId);
    // Excluding the owner itself finds no clash.
    const none = await findBrokerBySharePointPath({ db }, '01 - Clients/SP Docs Test', brokerId);
    expect(none).toBeUndefined();
  });
});
