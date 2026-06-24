import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { config, createDb } from '@brokercomply/shared';
import { loadClientAllowlist, type ClientAllowlist } from './client-filter.js';
import { GraphEmailClient, DEFAULT_FOLDERS } from './graph-client.js';
import { runDeltaIngest } from './delta.js';

/** Default location of the (gitignored) signed-client allowlist. */
const ALLOWLIST_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../config/client-allowlist.json',
);

/**
 * Incremental delta sync for the officer mailboxes — the target of the Heroku
 * Scheduler cron (e.g. every 15-30 min). Cheap to run frequently: each folder
 * resumes from its persisted delta link and only fetches what changed.
 *
 *   tsx src/ingestion/run-delta.ts
 */
async function main(): Promise<void> {
  if (!config.AZURE_TENANT_ID || !config.AZURE_CLIENT_ID || !config.AZURE_CLIENT_SECRET) {
    throw new Error(
      'Delta sync requires AZURE_TENANT_ID, AZURE_CLIENT_ID and AZURE_CLIENT_SECRET in .env.',
    );
  }

  const mailboxes = config.OFFICER_MAILBOXES;
  const folders = config.INGEST_FOLDERS ?? DEFAULT_FOLDERS;

  let clientAllowlist: ClientAllowlist | undefined;
  const loaded = loadClientAllowlist(ALLOWLIST_PATH);
  if (loaded) {
    clientAllowlist = loaded;
    console.log(
      `[delta] client scope: ${loaded.domains.size} domain(s) + ${loaded.emails.size} exact email(s).`,
    );
  }

  const source = new GraphEmailClient({
    tenantId: config.AZURE_TENANT_ID,
    clientId: config.AZURE_CLIENT_ID,
    clientSecret: config.AZURE_CLIENT_SECRET,
    folders,
    officers: config.OFFICER_MAILBOXES,
  });

  const { db, client } = createDb();
  try {
    for (const mailbox of mailboxes) {
      const stats = await runDeltaIngest(
        { source, db, clientAllowlist, log: (m) => console.log(`[delta] ${m}`) },
        { mailbox, folders },
      );
      const stored = stats.reduce((n, s) => n + s.documentsStored, 0);
      console.log(`[delta] ${mailbox}: stored/updated ${stored} document(s).`);
    }
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error('[delta] failed:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
