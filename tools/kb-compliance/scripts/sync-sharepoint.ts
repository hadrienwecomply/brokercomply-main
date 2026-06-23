import { parseArgs } from 'node:util';
import {
  createDb,
  listSyncableBrokers,
  sharePointFromConfig,
  syncBrokerFolderDelta,
} from '@brokercomply/shared';

/**
 * SharePoint → DB pull sync. For every broker with a linked folder, runs a
 * folder-scoped delta and reconciles the `broker_documents` mirror (upsert +
 * soft-delete), persisting each broker's delta token for incremental resumes.
 *
 * Read-only on the SharePoint side — never creates, renames, or deletes remote
 * items. Intended to run on a schedule (hourly) and on demand.
 *
 * Usage:
 *   tsx scripts/sync-sharepoint.ts            # sync all linked brokers
 *   tsx scripts/sync-sharepoint.ts --broker <brokerId>   # one broker only
 */
async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      broker: { type: 'string' },
    },
  });

  const client = sharePointFromConfig(); // throws with a readable error if unconfigured
  const { db, client: pg } = createDb();
  try {
    let targets = await listSyncableBrokers({ db });
    if (values.broker) targets = targets.filter((t) => t.brokerId === values.broker);

    if (!targets.length) {
      console.log('No linked broker folders to sync.');
      return;
    }
    console.log(`Syncing ${targets.length} broker folder(s)…\n`);

    let totalUp = 0;
    let totalDel = 0;
    let failures = 0;
    for (const target of targets) {
      try {
        const res = await syncBrokerFolderDelta({ db }, client, target);
        totalUp += res.upserted;
        totalDel += res.deleted;
        console.log(`  ✓ ${target.brokerId}: +${res.upserted} upserted, -${res.deleted} removed`);
      } catch (err) {
        failures += 1;
        console.error(`  ✗ ${target.brokerId}: ${(err as Error).message}`);
      }
    }
    console.log(
      `\nDone. ${totalUp} upserted, ${totalDel} soft-deleted across ${targets.length} broker(s)` +
        (failures ? `, ${failures} failed.` : '.'),
    );
    if (failures) process.exitCode = 1;
  } finally {
    await pg.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
