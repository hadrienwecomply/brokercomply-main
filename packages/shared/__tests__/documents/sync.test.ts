import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { createDb, brokers, type Db, type NewBroker } from '../../src/db/index.js';
import { createBrokerWithPlan } from '../../src/brokers/index.js';
import {
  driveItemToDocumentUpsert,
  listBrokerDocuments,
  getSyncState,
  setSharePointFolder,
  syncBrokerFolderDelta,
  type FolderDeltaSource,
} from '../../src/documents/index.js';
import type { DeltaResult, DriveItem } from '../../src/sharepoint/types.js';

describe('driveItemToDocumentUpsert (pure)', () => {
  it('maps a file driveItem to the mirror shape with a drive-relative path', () => {
    const item: DriveItem = {
      id: 'f1',
      name: 'rapport.pdf',
      webUrl: 'https://sp/rapport.pdf',
      size: 1234,
      eTag: 'etag-1',
      file: { mimeType: 'application/pdf' },
      lastModifiedDateTime: '2026-06-01T10:00:00Z',
      parentReference: { path: '/drives/x/root:/01 - Clients/Acme' },
    };
    const up = driveItemToDocumentUpsert('b1', item);
    expect(up).toMatchObject({
      brokerId: 'b1',
      driveItemId: 'f1',
      name: 'rapport.pdf',
      path: '01 - Clients/Acme/rapport.pdf',
      mimeType: 'application/pdf',
      isFolder: false,
      size: 1234,
      etag: 'etag-1',
    });
    expect(up.lastModifiedAt).toBeInstanceOf(Date);
  });

  it('flags folders and leaves mimeType null', () => {
    const up = driveItemToDocumentUpsert('b1', {
      id: 'sub',
      name: '2026',
      folder: { childCount: 3 },
      parentReference: { path: '/drives/x/root:/01 - Clients/Acme' },
    });
    expect(up.isFolder).toBe(true);
    expect(up.mimeType).toBeNull();
    expect(up.path).toBe('01 - Clients/Acme/2026');
  });
});

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
const SLUG = 'sp-sync-test-broker';
const FOLDER = 'sync-folder-1';

/** Fake folder-delta source: scripted pages, records the resume token it received. */
class FakeSource implements FolderDeltaSource {
  receivedTokens: Array<string | undefined> = [];
  private pages: DeltaResult[];
  constructor(pages: DeltaResult[]) {
    this.pages = pages;
  }
  async syncFolderDelta(_folderId: string, deltaLink?: string): Promise<DeltaResult> {
    this.receivedTokens.push(deltaLink);
    return this.pages.shift() ?? { items: [], deltaLink: 'empty' };
  }
}

function fileItem(id: string, name: string): DriveItem {
  return {
    id,
    name,
    file: { mimeType: 'application/pdf' },
    parentReference: { path: '/drives/x/root:/01 - Clients/Acme' },
  };
}

describe.skipIf(!dbAvailable)('syncBrokerFolderDelta (integration)', () => {
  let db: Db;
  let close: () => Promise<void>;
  let brokerId: string;

  beforeAll(async () => {
    const conn = createDb();
    db = conn.db;
    close = () => conn.client.end();
    await db.delete(brokers).where(eq(brokers.slug, SLUG));
    const input: NewBroker = { slug: SLUG, societe: 'SP Sync Test', emails: [], countries: [] };
    const { broker } = await createBrokerWithPlan({ db }, { broker: input, steps: [] });
    brokerId = broker.id;
    await setSharePointFolder({ db }, brokerId, { folderId: FOLDER, status: 'linked' });
  });

  afterAll(async () => {
    await db.delete(brokers).where(eq(brokers.slug, SLUG));
    await close();
  });

  it('upserts files, skips the folder root, soft-deletes tombstones, and resumes by token', async () => {
    const source = new FakeSource([
      // First sweep: the scope folder itself (skipped) + two files.
      {
        items: [
          { id: FOLDER, name: 'Acme', folder: {} }, // the scope folder → skipped
          fileItem('doc-a', 'a.pdf'),
          fileItem('doc-b', 'b.pdf'),
        ],
        deltaLink: 'tok-1',
      },
      // Second sweep: a.pdf removed (tombstone) + a new file c.pdf.
      {
        items: [{ id: 'doc-a', deleted: { state: 'deleted' } }, fileItem('doc-c', 'c.pdf')],
        deltaLink: 'tok-2',
      },
    ]);

    const first = await syncBrokerFolderDelta({ db }, source, { brokerId, folderItemId: FOLDER });
    expect(first).toMatchObject({ upserted: 2, deleted: 0, deltaLink: 'tok-1' });
    expect(source.receivedTokens[0]).toBeUndefined(); // no token on first run
    let live = await listBrokerDocuments({ db }, brokerId);
    expect(live.map((d) => d.driveItemId).sort()).toEqual(['doc-a', 'doc-b']);
    // The scope folder was not stored as a document.
    expect(live.find((d) => d.driveItemId === FOLDER)).toBeUndefined();

    const second = await syncBrokerFolderDelta({ db }, source, { brokerId, folderItemId: FOLDER });
    expect(second).toMatchObject({ upserted: 1, deleted: 1, deltaLink: 'tok-2' });
    expect(source.receivedTokens[1]).toBe('tok-1'); // resumed from the persisted token
    live = await listBrokerDocuments({ db }, brokerId);
    expect(live.map((d) => d.driveItemId).sort()).toEqual(['doc-b', 'doc-c']);

    expect((await getSyncState({ db }, brokerId))?.deltaLink).toBe('tok-2');
  });
});
