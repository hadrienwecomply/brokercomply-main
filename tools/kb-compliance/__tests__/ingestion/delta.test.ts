import { and, eq, like, sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createDb, mailSyncState, sourceDocuments, type Db } from '@brokercomply/shared';
import { runDeltaIngest, type MailDeltaSource } from '../../src/ingestion/delta.js';
import type { AttachmentContent, EmailSource, RawMessage } from '../../src/ingestion/types.js';

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

const PREFIX = '__delta_test__';
const MAILBOX = '__delta_test_box@we-comply.be';

function msg(id: string, over: Partial<RawMessage> = {}): RawMessage {
  return {
    id,
    internetMessageId: `${PREFIX}${id}`,
    conversationId: `${PREFIX}conv-${id}`,
    subject: 'Sujet',
    bodyContent: 'Bonjour, question de conformité ?',
    bodyContentType: 'text',
    from: 'broker@acme.be',
    to: [MAILBOX],
    cc: [],
    receivedDateTime: '2026-03-01T10:00:00Z',
    hasAttachments: false,
    attachments: [],
    folder: 'inbox',
    direction: 'inbound',
    webLink: 'https://outlook.office.com/x',
    ...over,
  };
}

/** Fake source: scripted delta pages keyed by the deltaLink passed in. */
class FakeDeltaSource implements EmailSource, MailDeltaSource {
  constructor(
    private readonly pages: Record<
      string,
      { messages: RawMessage[]; removedIds: string[]; deltaLink: string | null }
    >,
  ) {}
  listMessages(): Promise<RawMessage[]> {
    return Promise.resolve([]);
  }
  getAttachmentContent(): Promise<AttachmentContent | null> {
    return Promise.resolve(null);
  }
  listMessagesDelta(_mailbox: string, _folder: string, deltaLink?: string) {
    return Promise.resolve(this.pages[deltaLink ?? '__initial__']);
  }
}

describe.skipIf(!dbAvailable)('runDeltaIngest (integration)', () => {
  let db: Db;
  let close: () => Promise<void>;

  beforeAll(() => {
    const conn = createDb();
    db = conn.db;
    close = () => conn.client.end();
  });

  async function cleanup() {
    await db.delete(sourceDocuments).where(like(sourceDocuments.messageId, `${PREFIX}%`));
    await db.delete(mailSyncState).where(eq(mailSyncState.mailbox, MAILBOX));
  }
  beforeEach(cleanup);
  afterAll(async () => {
    await cleanup();
    await close();
  });

  it('stores new messages and persists the delta link', async () => {
    const source = new FakeDeltaSource({
      __initial__: { messages: [msg('a'), msg('b')], removedIds: [], deltaLink: 'LINK-1' },
    });
    const stats = await runDeltaIngest({ source, db }, { mailbox: MAILBOX, folders: ['inbox'] });
    expect(stats[0]!.documentsStored).toBe(2);

    const [state] = await db
      .select()
      .from(mailSyncState)
      .where(and(eq(mailSyncState.mailbox, MAILBOX), eq(mailSyncState.folder, 'inbox')));
    expect(state!.deltaLink).toBe('LINK-1');
    expect(state!.lastSyncedAt).toBeTruthy();
  });

  it('resumes from the persisted delta link on the next run', async () => {
    const source = new FakeDeltaSource({
      __initial__: { messages: [msg('a')], removedIds: [], deltaLink: 'LINK-1' },
      'LINK-1': { messages: [msg('c')], removedIds: ['old'], deltaLink: 'LINK-2' },
    });
    await runDeltaIngest({ source, db }, { mailbox: MAILBOX, folders: ['inbox'] });
    const second = await runDeltaIngest({ source, db }, { mailbox: MAILBOX, folders: ['inbox'] });
    expect(second[0]!.documentsStored).toBe(1);

    const [state] = await db
      .select()
      .from(mailSyncState)
      .where(and(eq(mailSyncState.mailbox, MAILBOX), eq(mailSyncState.folder, 'inbox')));
    expect(state!.deltaLink).toBe('LINK-2');
  });
});
