import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq, like, sql } from 'drizzle-orm';
import {
  createDb,
  brokers,
  sourceDocuments,
  type Db,
  type NewBroker,
  type NewSourceDocument,
} from '../../src/db/index.js';
import { getBrokerConversations } from '../../src/conversations/index.js';

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

// All seeded rows use this prefix so cleanup is surgical (never wipes real data).
const MSG_PREFIX = '__conv_test__';
const SLUG = '__conv-test-broker';

function broker(overrides: Partial<NewBroker> = {}): NewBroker {
  return {
    slug: SLUG,
    societe: 'Conv Test Broker',
    emails: ['Contact@Elite.be'],
    matchDomains: [],
    countries: ['BE'],
    accountOwner: 'sdv@we-comply.be',
    ...overrides,
  };
}

function doc(overrides: Partial<NewSourceDocument>): NewSourceDocument {
  return {
    messageId: `${MSG_PREFIX}${Math.random().toString(36).slice(2)}`,
    conversationId: null,
    subject: 'Sujet',
    bodyClean: 'corps',
    sender: 'someone@elsewhere.be',
    recipients: ['sdv@we-comply.be'],
    mailbox: 'sdv@we-comply.be',
    direction: 'inbound',
    receivedAt: new Date('2026-01-01T10:00:00Z'),
    ...overrides,
  };
}

describe.skipIf(!dbAvailable)('conversations service (integration)', () => {
  let db: Db;
  let close: () => Promise<void>;

  beforeAll(() => {
    const conn = createDb();
    db = conn.db;
    close = () => conn.client.end();
  });

  async function cleanup() {
    await db.delete(sourceDocuments).where(like(sourceDocuments.messageId, `${MSG_PREFIX}%`));
    await db.delete(brokers).where(eq(brokers.slug, SLUG));
  }

  beforeEach(cleanup);
  afterAll(async () => {
    await cleanup();
    await close();
  });

  async function seedBroker(overrides: Partial<NewBroker> = {}): Promise<string> {
    const [row] = await db.insert(brokers).values(broker(overrides)).returning();
    return row!.id;
  }

  it('returns empty when the broker has no addresses to match', async () => {
    const id = await seedBroker({ emails: [], matchDomains: [] });
    await db.insert(sourceDocuments).values(doc({ sender: 'contact@elite.be' }));
    expect(await getBrokerConversations({ db }, id)).toEqual([]);
  });

  it('matches by exact email on sender and recipients, case-insensitively', async () => {
    const id = await seedBroker();
    await db.insert(sourceDocuments).values([
      doc({ conversationId: 'c1', sender: 'CONTACT@elite.be', direction: 'inbound' }),
      doc({
        conversationId: 'c2',
        sender: 'sdv@we-comply.be',
        recipients: ['Contact@ELITE.be'],
        direction: 'outbound',
      }),
      doc({ conversationId: 'c3', sender: 'stranger@other.be', recipients: ['x@y.be'] }),
    ]);
    const convs = await getBrokerConversations({ db }, id);
    const keys = convs.map((c) => c.conversationKey).sort();
    expect(keys).toEqual(['c1', 'c2']);
  });

  it('groups messages by conversationId and orders threads by recency', async () => {
    const id = await seedBroker();
    await db.insert(sourceDocuments).values([
      doc({
        conversationId: 'old',
        sender: 'contact@elite.be',
        receivedAt: new Date('2026-01-01T08:00:00Z'),
      }),
      doc({
        conversationId: 'recent',
        sender: 'contact@elite.be',
        receivedAt: new Date('2026-03-01T08:00:00Z'),
      }),
      doc({
        conversationId: 'recent',
        sender: 'sdv@we-comply.be',
        recipients: ['contact@elite.be'],
        direction: 'outbound',
        receivedAt: new Date('2026-03-02T08:00:00Z'),
      }),
    ]);
    const convs = await getBrokerConversations({ db }, id);
    expect(convs.map((c) => c.conversationKey)).toEqual(['recent', 'old']);
    const recent = convs[0]!;
    expect(recent.messageCount).toBe(2);
    expect(recent.lastDirection).toBe('outbound');
    // messages are oldest → newest within a thread
    expect(recent.messages[0]!.receivedAt!.getTime()).toBeLessThan(
      recent.messages[1]!.receivedAt!.getTime(),
    );
  });

  it('excludes internal officer ↔ officer messages', async () => {
    const id = await seedBroker();
    await db.insert(sourceDocuments).values([
      doc({ conversationId: 'c1', sender: 'contact@elite.be', direction: 'inbound' }),
      doc({
        conversationId: 'internal',
        sender: 'sdv@we-comply.be',
        recipients: ['contact@elite.be'],
        direction: 'internal',
      }),
    ]);
    const convs = await getBrokerConversations({ db }, id);
    expect(convs.map((c) => c.conversationKey)).toEqual(['c1']);
  });

  it('matches by opted-in domain but not public domains', async () => {
    const id = await seedBroker({
      emails: ['contact@elite.be'],
      matchDomains: ['elite.be', 'gmail.com'],
    });
    await db.insert(sourceDocuments).values([
      doc({ conversationId: 'domain', sender: 'someoneelse@elite.be' }),
      doc({ conversationId: 'public', sender: 'random@gmail.com', recipients: ['sdv@we-comply.be'] }),
    ]);
    const convs = await getBrokerConversations({ db }, id);
    expect(convs.map((c) => c.conversationKey)).toEqual(['domain']);
  });

  it('exposes webLink and attachment names from raw metadata', async () => {
    const id = await seedBroker();
    await db.insert(sourceDocuments).values(
      doc({
        conversationId: 'c1',
        sender: 'contact@elite.be',
        rawMetadata: { webLink: 'https://outlook.office.com/x', attachmentNames: ['a.pdf', 'b.docx'] },
      }),
    );
    const [conv] = await getBrokerConversations({ db }, id);
    expect(conv!.messages[0]!.webLink).toBe('https://outlook.office.com/x');
    expect(conv!.messages[0]!.attachmentNames).toEqual(['a.pdf', 'b.docx']);
  });
});
