import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import {
  createDb,
  decideBackfillAction,
  findBrokerBySharePointPath,
  joinPath,
  listBrokers,
  normalizeNameForMatch,
  sanitizeFolderName,
  setSharePointFolder,
  sharePointFromConfig,
  type DriveItem,
} from '@brokercomply/shared';

/**
 * Backfill SharePoint folders for existing brokers (Q9). For each broker without
 * a linked folder:
 *   - if mapped in the mapping file → LINK that exact path (never create); error
 *     if the mapped path doesn't exist,
 *   - else → LINK an existing folder matching the company name (case- and
 *     accent-insensitive), or CREATE one if truly absent. If only a FUZZY
 *     near-match exists (e.g. "Cambier & Evrard" vs "CAMBIER & EVERARD"), it does
 *     NOT create — it flags the folder so you can map it, avoiding a duplicate.
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

/** Levenshtein edit distance (small strings; advisory similarity only). */
function editDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) => i);
  for (let j = 1; j <= n; j++) {
    let prev = dp[0];
    dp[0] = j;
    for (let i = 1; i <= m; i++) {
      const tmp = dp[i];
      dp[i] = Math.min(dp[i] + 1, dp[i - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[m];
}

/**
 * Closest existing folder to `sanitized` among `normIndex`, advisory only.
 * Returns the real name when reasonably close (so the user can map it to avoid a
 * spelling-variant duplicate), else undefined. Never auto-links — a wrong link
 * would be worse than a duplicate for compliance data.
 */
function closestExistingFolder(
  sanitized: string,
  normIndex: Map<string, DriveItem>,
): string | undefined {
  const target = normalizeNameForMatch(sanitized);
  let best: { name: string; dist: number } | undefined;
  for (const [norm, item] of normIndex) {
    const dist = editDistance(target, norm);
    if (best === undefined || dist < best.dist) best = { name: item.name ?? norm, dist };
  }
  if (!best) return undefined;
  const threshold = Math.max(2, Math.floor(target.length * 0.34));
  return best.dist > 0 && best.dist <= threshold ? best.name : undefined;
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
    // Index the existing folders under the root once: exact (case-insensitive)
    // and normalized (case/accents/spacing) → real folder, for fuzzy matching.
    const rootRef = await client.resolveFolderByPath(client.root);
    const exactIndex = new Map<string, DriveItem>();
    const normIndex = new Map<string, DriveItem>();
    if (!rootRef) {
      console.warn(`⚠ root path "${client.root}" not found — existing folders can't be matched.`);
    } else {
      const children = await client.listFolderChildren(rootRef.id);
      for (const c of children) {
        if (!c.folder || !c.name) continue;
        exactIndex.set(c.name.toLowerCase(), c);
        normIndex.set(normalizeNameForMatch(c.name), c);
      }
      console.log(`Indexed ${exactIndex.size} existing folder(s) under "${client.root}".`);
    }

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
      const sanitized = sanitizeFolderName(b.societe);
      const autoPath = joinPath(client.root, sanitized);
      const mappedPath = mapping[b.slug];

      // Resolve the facts. For unmapped brokers we match against the indexed
      // existing folders (case/accents-insensitive) rather than per-broker GETs.
      let mappedExists: boolean | undefined;
      let exactChild: DriveItem | undefined;
      let nearChild: DriveItem | undefined;
      if (mappedPath !== undefined) {
        mappedExists = Boolean(await client.resolveFolderByPath(mappedPath));
      } else {
        exactChild = exactIndex.get(sanitized.toLowerCase());
        nearChild = exactChild ? undefined : normIndex.get(normalizeNameForMatch(sanitized));
      }

      const targetPath = mappedPath ?? autoPath;
      const dbClash = await findBrokerBySharePointPath({ db }, targetPath, b.id);
      const conflictBroker =
        dbClash?.slug ?? (assignedThisRun.has(targetPath) ? '(this run)' : undefined);

      const action = decideBackfillAction({
        alreadyLinked: false,
        mappedPath,
        mappedExists,
        autoPath,
        autoExists: Boolean(exactChild),
        nearMatchName: nearChild?.name,
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

      const linkTo = exactChild ? `${action.path} → "${exactChild.name}"` : action.path;
      console.log(`  ${action.kind === 'link' ? '↔ LINK  ' : '＋ CREATE'} ${label} → ${linkTo}`);
      if (action.kind === 'create' && mappedPath === undefined) {
        const hint = closestExistingFolder(sanitized, normIndex);
        if (hint) {
          console.log(
            `      ⚠ closest existing folder: "${hint}" — map this slug if it's the same`,
          );
        }
      }
      assignedThisRun.add(action.path);
      if (apply) {
        let folderId: string;
        let webUrl: string;
        let path: string;
        if (action.kind === 'create') {
          const ref = await client.ensureBrokerFolder(sanitized);
          ({ id: folderId, webUrl, path } = ref);
        } else if (mappedPath !== undefined) {
          const ref = await client.resolveFolderByPath(mappedPath);
          if (!ref) {
            errors += 1;
            console.log(`    ! mapped path vanished: ${mappedPath}`);
            continue;
          }
          ({ id: folderId, webUrl, path } = ref);
        } else {
          // auto link to the matched existing folder (real casing).
          folderId = exactChild!.id;
          webUrl = exactChild!.webUrl ?? '';
          path = joinPath(client.root, exactChild!.name ?? sanitized);
        }
        await setSharePointFolder({ db }, b.id, { folderId, webUrl, path, status: 'linked' });
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
