import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { config, createDb } from '@brokercomply/shared';
import { loadClientAllowlist, type ClientAllowlist } from './client-filter.js';
import { FixtureEmailSource } from './fixture-source.js';
import { GraphEmailClient } from './graph-client.js';
import { runIngest } from './ingest.js';
import type { EmailSource } from './types.js';

/** Default location of the (gitignored) signed-client allowlist. */
const ALLOWLIST_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../config/client-allowlist.json',
);

/**
 * Minimal runnable entry for the ingestion pipeline (precursor to the full CLI
 * in task 0-F). Usage:
 *
 *   tsx src/ingestion/run.ts --fixture
 *   tsx src/ingestion/run.ts --mailbox sdv@we-comply.be --since 2026-01-01 --limit 50
 */
async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      mailbox: { type: 'string' },
      since: { type: 'string' },
      until: { type: 'string' },
      limit: { type: 'string' },
      fixture: { type: 'boolean', default: false },
      all: { type: 'boolean', default: false },
    },
  });

  const useFixture = values.fixture === true;
  const mailbox = values.mailbox ?? (useFixture ? 'fixtures' : undefined);
  if (!mailbox) {
    throw new Error('Provide --mailbox <address> (or --fixture for offline sample data).');
  }

  // Scope to signed clients unless --all is passed. Missing file = unscoped.
  let clientAllowlist: ClientAllowlist | undefined;
  if (!values.all) {
    const loaded = loadClientAllowlist(ALLOWLIST_PATH);
    if (loaded) {
      clientAllowlist = loaded;
      console.log(
        `[ingest] client scope: ${loaded.domains.size} domain(s) + ${loaded.emails.size} exact email(s) (use --all to bypass).`,
      );
    } else {
      console.log(`[ingest] no client allowlist at ${ALLOWLIST_PATH} — ingesting unscoped.`);
    }
  }

  let source: EmailSource;
  if (useFixture) {
    source = new FixtureEmailSource();
  } else {
    if (!config.AZURE_TENANT_ID || !config.AZURE_CLIENT_ID || !config.AZURE_CLIENT_SECRET) {
      throw new Error(
        'Microsoft Graph mode requires AZURE_TENANT_ID, AZURE_CLIENT_ID and AZURE_CLIENT_SECRET in .env.',
      );
    }
    source = new GraphEmailClient({
      tenantId: config.AZURE_TENANT_ID,
      clientId: config.AZURE_CLIENT_ID,
      clientSecret: config.AZURE_CLIENT_SECRET,
      folders: config.INGEST_FOLDERS,
      officers: config.OFFICER_MAILBOXES,
    });
  }

  const { db, client } = createDb();
  try {
    const stats = await runIngest(
      { source, db, clientAllowlist, log: (m) => console.log(`[ingest] ${m}`) },
      {
        mailbox,
        since: values.since ? new Date(values.since) : undefined,
        until: values.until ? new Date(values.until) : undefined,
        limit: values.limit ? Number(values.limit) : undefined,
      },
    );
    console.log('\nResult:', JSON.stringify(stats, null, 2));
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error('[ingest] failed:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
