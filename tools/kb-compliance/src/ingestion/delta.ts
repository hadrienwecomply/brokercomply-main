import { and, eq } from 'drizzle-orm';
import { mailSyncState } from '@brokercomply/shared';
import { processMessages, type IngestDeps, type IngestStats } from './ingest.js';
import type { RawMessage } from './types.js';

/**
 * A message source that supports Graph delta queries. Implemented by the live
 * `GraphEmailClient`; the fixture source does not (delta is Graph-only).
 */
export interface MailDeltaSource {
  listMessagesDelta(
    mailbox: string,
    folder: string,
    deltaLink?: string,
  ): Promise<{ messages: RawMessage[]; removedIds: string[]; deltaLink: string | null }>;
}

export interface DeltaIngestOptions {
  mailbox: string;
  folders: readonly string[];
}

export interface DeltaIngestDeps extends IngestDeps {
  source: IngestDeps['source'] & MailDeltaSource;
}

/**
 * Incremental ingestion: for each folder, resume from the persisted delta link,
 * fetch only what changed, run it through the SAME AML-filtering/storage
 * pipeline as the backfill, then persist the new delta link. This is what keeps
 * a frequent cron cheap. Removed items are not deleted from the immutable source
 * archive (we only ever add/upsert).
 */
export async function runDeltaIngest(
  deps: DeltaIngestDeps,
  options: DeltaIngestOptions,
): Promise<IngestStats[]> {
  const { source, db } = deps;
  const log = deps.log ?? (() => {});
  const results: IngestStats[] = [];

  for (const folder of options.folders) {
    const [state] = await db
      .select()
      .from(mailSyncState)
      .where(and(eq(mailSyncState.mailbox, options.mailbox), eq(mailSyncState.folder, folder)));

    const previousLink = state?.deltaLink ?? undefined;
    log(
      `[delta] ${options.mailbox}/${folder}: ${previousLink ? 'resuming from delta link' : 'initial delta'}`,
    );

    const { messages, removedIds, deltaLink } = await source.listMessagesDelta(
      options.mailbox,
      folder,
      previousLink,
    );
    if (removedIds.length) {
      log(`[delta] ${options.mailbox}/${folder}: ${removedIds.length} removed item(s) ignored (archive is immutable)`);
    }

    const stats = await processMessages(deps, options.mailbox, messages);
    results.push(stats);

    // Persist the new delta link only after a successful process, so a failure
    // mid-run replays the same window next time rather than skipping messages.
    if (deltaLink) {
      await db
        .insert(mailSyncState)
        .values({ mailbox: options.mailbox, folder, deltaLink, lastSyncedAt: new Date() })
        .onConflictDoUpdate({
          target: [mailSyncState.mailbox, mailSyncState.folder],
          set: { deltaLink, lastSyncedAt: new Date() },
        });
    }
  }

  return results;
}
