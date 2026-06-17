import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { amlExclusionLog, createDb, knowledgeUnits, sourceDocuments, type Db } from '@brokercomply/shared';
import { parseAllowlist } from '../../src/ingestion/client-filter.js';
import { FixtureEmailSource } from '../../src/ingestion/fixture-source.js';
import { runIngest } from '../../src/ingestion/ingest.js';

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

describe.skipIf(!dbAvailable)('runIngest client scope (integration)', () => {
  let db: Db;
  let close: () => Promise<void>;

  beforeAll(async () => {
    const conn = createDb();
    db = conn.db;
    close = () => conn.client.end();
  });

  beforeEach(async () => {
    await db.delete(knowledgeUnits);
    await db.delete(sourceDocuments);
    await db.delete(amlExclusionLog);
  });

  afterAll(async () => {
    await close();
  });

  it('ingests every thread when no allowlist is given (unscoped)', async () => {
    const stats = await runIngest({ source: new FixtureEmailSource(), db }, { mailbox: 'fixtures' });
    expect(stats.threadsOutOfScope).toBe(0);
    expect(stats.documentsStored).toBe(16);
  });

  it('keeps all client threads when their domain is in scope', async () => {
    // All fixture clients are @example.be; officers are @we-comply.be.
    const allowlist = parseAllowlist({ domains: ['example.be'] });
    const stats = await runIngest(
      { source: new FixtureEmailSource(), db, clientAllowlist: allowlist },
      { mailbox: 'fixtures' },
    );
    expect(stats.threadsOutOfScope).toBe(0);
    expect(stats.threadsExcluded).toBe(1); // CTIF thread still AML-excluded
    expect(stats.documentsStored).toBe(16);
  });

  it('skips every thread (and stores nothing) when no participant is in scope', async () => {
    const allowlist = parseAllowlist({ domains: ['nonexistent-client.xyz'] });
    const stats = await runIngest(
      { source: new FixtureEmailSource(), db, clientAllowlist: allowlist },
      { mailbox: 'fixtures' },
    );
    expect(stats.threadsOutOfScope).toBe(stats.threads);
    expect(stats.documentsStored).toBe(0);
    expect(stats.threadsExcluded).toBe(0); // out-of-scope skipped before AML scan
    const stored = await db.select().from(sourceDocuments);
    expect(stored).toHaveLength(0);
  });

  it('matches a single client by exact email even on a generic domain', async () => {
    // Narrow allowlist: only the exact officer-faced client address.
    const allowlist = parseAllowlist({ emails: ['client.courtier@example.be'] });
    const stats = await runIngest(
      { source: new FixtureEmailSource(), db, clientAllowlist: allowlist },
      { mailbox: 'fixtures' },
    );
    expect(stats.documentsStored).toBeGreaterThan(0);
    expect(stats.threadsOutOfScope).toBeGreaterThan(0);
  });
});
