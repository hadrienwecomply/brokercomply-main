import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import {
  createDb,
  decideBackfillAction,
  findBrokerBySharePointPath,
  joinPath,
  listBrokers,
  sanitizeFolderName,
  setSharePointFolder,
  sharePointFromConfig,
} from '@brokercomply/shared';

/**
 * Backfill SharePoint folders for existing brokers (Q9). For each broker without
 * a linked folder:
 *   - if mapped in the mapping file → LINK that exact path (never create); error
 *     if the mapped path doesn't exist,
 *   - else → LINK an existing same-named folder, or CREATE one if absent.
 *
 * Idempotent and non-destructive: never duplicates, never deletes, never links a
 * folder already owned by another broker. DRY-RUN by default — prints the plan
 * without writing anything; pass --apply to execute.
 *
 * Mapping file (JSON): { "<broker-slug>": "<drive-relative folder path>", … }
 *
 * Usage:
 *   tsx scripts/backfill-sharepoint-folders.ts --mapping mapping.json
 *   tsx scripts/backfill-sharepoint-folders.ts --mapping mapping.json --apply
 */
function loadMapping(path?: string): Record<string, string> {
  if (!path) return {};
  const parsed = JSON.parse(readFileSync(path, 'utf8'));
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('Mapping file must be a JSON object of { slug: path }');
  }
  return parsed as Record<string, string>;
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      mapping: { type: 'string' },
      apply: { type: 'boolean', default: false },
    },
  });
  const apply = values.apply === true;
  const mapping = loadMapping(values.mapping);

  const client = sharePointFromConfig();
  const { db, client: pg } = createDb();
  try {
    const brokers = await listBrokers({ db });
    const todo = brokers.filter((b) => !b.sharePointFolderId);
    console.log(
      `${todo.length} broker(s) without a linked folder. Mode: ${apply ? 'APPLY' : 'DRY-RUN'}\n`,
    );

    const assignedThisRun = new Set<string>();
    let linked = 0;
    let created = 0;
    let skipped = 0;
    let errors = 0;

    for (const b of todo) {
      const label = `${b.societe} [${b.slug}]`;
      const mappedPath = mapping[b.slug];
      const autoPath = joinPath(client.root, sanitizeFolderName(b.societe));

      // Gather existence facts via Graph (read-only).
      const mappedExists =
        mappedPath !== undefined
          ? Boolean(await client.resolveFolderByPath(mappedPath))
          : undefined;
      const autoExists =
        mappedPath !== undefined ? false : Boolean(await client.resolveFolderByPath(autoPath));

      const targetPath = mappedPath ?? autoPath;
      const dbClash = await findBrokerBySharePointPath({ db }, targetPath, b.id);
      const conflictBroker =
        dbClash?.slug ?? (assignedThisRun.has(targetPath) ? '(this run)' : undefined);

      const action = decideBackfillAction({
        alreadyLinked: false,
        mappedPath,
        mappedExists,
        autoPath,
        autoExists,
        conflictBroker,
      });

      if (action.kind === 'skip') {
        skipped += 1;
        continue;
      }
      if (action.kind === 'error') {
        errors += 1;
        console.log(`  ✗ ${label}: ${action.reason}${action.path ? ` (${action.path})` : ''}`);
        if (apply) {
          await setSharePointFolder({ db }, b.id, { path: action.path ?? null, status: 'error' });
        }
        continue;
      }

      console.log(
        `  ${action.kind === 'link' ? '↔ LINK  ' : '＋ CREATE'} ${label} → ${action.path}`,
      );
      assignedThisRun.add(action.path);
      if (apply) {
        const ref =
          action.kind === 'link'
            ? await client.resolveFolderByPath(action.path)
            : await client.ensureBrokerFolder(sanitizeFolderName(b.societe));
        if (!ref) {
          errors += 1;
          console.log(`    ! could not ${action.kind} ${action.path}`);
          continue;
        }
        await setSharePointFolder({ db }, b.id, {
          folderId: ref.id,
          webUrl: ref.webUrl,
          path: ref.path,
          status: 'linked',
        });
      }
      if (action.kind === 'link') linked += 1;
      else created += 1;
    }

    console.log(
      `\n${apply ? 'Applied' : 'Would apply'}: ${linked} linked, ${created} created, ` +
        `${skipped} skipped, ${errors} error(s).`,
    );
    if (!apply) console.log('Re-run with --apply to execute.');
    if (errors) process.exitCode = 1;
  } finally {
    await pg.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
