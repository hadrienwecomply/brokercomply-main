import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { createDb, brokers, type Db, type NewBroker } from '../../src/db/index.js';
import { listOutboundForBroker, logOutboundEmail } from '../../src/mail/index.js';

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

const SLUG = '__mail-test-broker';

function broker(): NewBroker {
  return {
    slug: SLUG,
    societe: 'Mail Test Broker',
    emails: ['contact@acme.be'],
    countries: ['BE'],
    accountOwner: 'sdv@we-comply.be',
  };
}

describe.skipIf(!dbAvailable)('mail service (integration)', () => {
  let db: Db;
  let close: () => Promise<void>;

  beforeAll(() => {
    const conn = createDb();
    db = conn.db;
    close = () => conn.client.end();
  });

  // outbound_emails cascade-deletes with the broker, so clearing the broker is enough.
  const cleanup = () => db.delete(brokers).where(eq(brokers.slug, SLUG));
  beforeEach(cleanup);
  afterAll(async () => {
    await cleanup();
    await close();
  });

  async function seedBroker(): Promise<string> {
    const [row] = await db.insert(brokers).values(broker()).returning();
    return row!.id;
  }

  it('logs an outbound email and lists it back', async () => {
    const brokerId = await seedBroker();
    const row = await logOutboundEmail(
      { db },
      {
        brokerId,
        stepCode: '01',
        substepTemplateId: '01-0',
        fromMailbox: 'conformite@we-comply.be',
        toAddrs: ['contact@acme.be'],
        ccAddrs: ['sdv@we-comply.be'],
        replyTo: 'sdv@we-comply.be',
        subject: 'Bienvenue',
        body: 'Bonjour',
        sentByOfficer: 'sdv@we-comply.be',
      },
    );
    expect(row.id).toBeTruthy();
    expect(row.sentAt).toBeTruthy();

    const list = await listOutboundForBroker({ db }, brokerId);
    expect(list).toHaveLength(1);
    expect(list[0]!.subject).toBe('Bienvenue');
    expect(list[0]!.toAddrs).toEqual(['contact@acme.be']);
    expect(list[0]!.substepTemplateId).toBe('01-0');
  });

  it('orders multiple sends newest first', async () => {
    const brokerId = await seedBroker();
    const base = {
      brokerId,
      fromMailbox: 'conformite@we-comply.be',
      toAddrs: ['contact@acme.be'],
      ccAddrs: [],
      sentByOfficer: 'sdv@we-comply.be',
    };
    await logOutboundEmail({ db }, { ...base, subject: 'Premier', sentAt: new Date('2026-01-01') });
    await logOutboundEmail({ db }, { ...base, subject: 'Second', sentAt: new Date('2026-03-01') });
    const list = await listOutboundForBroker({ db }, brokerId);
    expect(list.map((r) => r.subject)).toEqual(['Second', 'Premier']);
  });
});
