/**
 * Ingest enriched FSMA broker leads (cold-calling list) into `prospects`.
 *
 * Source: the enrichment CSV (one row per agency) with columns:
 *   numero_bce, nom, gerant_principal, gerants_tous, rue, code_postal, ville,
 *   pays, forme_juridique, types_produits, fsma_statut, debut_statut, langue,
 *   province, tel_gerant, tel_societe, tel_source, email, site_web,
 *   site_status, site_summary, site_quality, linkedin_societe, linkedin_gerant,
 *   instagram, x_twitter, activite, taille_equipe, statut, date_enrichissement,
 *   notes
 *
 * Only rows that were WORKED (statut ≠ pending/blank) are imported; the ~4 700
 * pending rows stay in the CSV backlog. The importer is idempotent — matching by
 * BCE, then contact email, then agency name — appends the given list tag, and
 * never touches the commercial axes (funnel / MRR / tasks). It runs the cadence
 * tick afterwards. Enrichment fields overwrite on re-import; blanks never clear.
 *
 * Run (preview):  pnpm -F @brokercomply/dashboard exec tsx scripts/ingest-fsma-leads.ts <csv> --liste "FSMA NL 2026-07" --dry-run
 * Run (write):    pnpm -F @brokercomply/dashboard exec tsx scripts/ingest-fsma-leads.ts <csv> --liste "FSMA NL 2026-07"
 */
import { readFileSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import {
  createDb,
  mapFsmaLead,
  tickProspects,
  upsertProspect,
  type FsmaRow,
} from '@brokercomply/shared';

/** Minimal RFC-4180-ish parser (handles quotes) for a delimited file. */
function parseCsv(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let field = '';
  let row: string[] = [];
  let inQuotes = false;
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text; // strip BOM

  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
      } else field += c;
      continue;
    }
    if (c === '"') inQuotes = true;
    else if (c === delimiter) { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c === '\r') { /* ignore */ }
    else field += c;
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
}

/** Pick the delimiter that splits the header line into the most columns. */
function detectDelimiter(firstLine: string): string {
  const candidates = ['\t', ';', ','];
  let best = ',';
  let bestCount = 0;
  for (const d of candidates) {
    const count = firstLine.split(d).length;
    if (count > bestCount) { bestCount = count; best = d; }
  }
  return best;
}

/** Read a `--liste "name"` / `--liste=name` value from argv. */
function readListFlag(argv: string[]): string | null {
  const eq = argv.find((a) => a.startsWith('--liste='));
  if (eq) return eq.slice('--liste='.length).trim() || null;
  const i = argv.indexOf('--liste');
  if (i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--')) return argv[i + 1].trim() || null;
  return null;
}

async function main() {
  const argv = process.argv.slice(2);
  const dryRun = argv.includes('--dry-run');
  const liste = readListFlag(argv);
  const pathArg = argv.find((a, i) => !a.startsWith('--') && argv[i - 1] !== '--liste');

  if (!pathArg) {
    console.error('usage: ingest-fsma-leads.ts <csv> --liste "<name>" [--dry-run]');
    process.exit(1);
  }
  if (!liste && !dryRun) {
    console.error('Refusing to import without a list: pass --liste "<name>".');
    process.exit(1);
  }
  const lists = liste ? [liste] : [];

  const csvPath = isAbsolute(pathArg) ? pathArg : join(process.cwd(), pathArg);
  const text = readFileSync(csvPath, 'utf8');
  const firstLine = text.replace(/^﻿/, '').split('\n')[0] ?? '';
  const delimiter = detectDelimiter(firstLine);
  const rows = parseCsv(text, delimiter);
  const [header, ...body] = rows;
  if (!header) { console.error('Empty CSV.'); process.exit(1); }

  const imported: FsmaRow[] = [];
  const skips = { noName: 0, notEnriched: 0 };
  const byStatus = new Map<string, number>();

  for (const r of body) {
    if (r.length === 1 && r[0].trim() === '') continue; // trailing blank line
    const rec: FsmaRow = {};
    header.forEach((h, i) => (rec[h.trim()] = r[i] ?? ''));

    const res = mapFsmaLead(rec, lists);
    if ('skipped' in res) {
      if (res.skipped === 'no-name') skips.noName++;
      else skips.notEnriched++;
      continue;
    }
    imported.push(rec);
    const s = (rec.statut ?? '').trim() || '(vide)';
    byStatus.set(s, (byStatus.get(s) ?? 0) + 1);
  }

  console.log(`Parsed ${csvPath} (delimiter=${JSON.stringify(delimiter)})`);
  console.log(
    `  ${imported.length} to import — ` +
      `${skips.notEnriched} skipped (not enriched), ${skips.noName} skipped (no name)`,
  );
  console.log(`  list tag: ${liste ?? '(none — dry-run)'}`);
  for (const [s, n] of [...byStatus.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`    · ${s}: ${n}`);
  }

  if (dryRun) {
    console.log('\n--dry-run: no database writes. Sample of the first 3:');
    for (const rec of imported.slice(0, 3)) {
      const res = mapFsmaLead(rec, lists);
      if ('prospect' in res) {
        const p = res.prospect;
        console.log(
          `   • ${p.societe} [BCE ${p.bce ?? '—'}] ` +
            `gérant=${p.contact?.name ?? '—'} tél=${p.contact?.phone ?? '—'} ` +
            `${p.ville ?? '—'} / ${p.language ?? '—'}`,
        );
      }
    }
    return;
  }

  const { db, client } = createDb();
  try {
    let created = 0;
    let updated = 0;
    const nearDuplicates: string[] = [];
    for (const rec of imported) {
      const res = mapFsmaLead(rec, lists);
      if (!('prospect' in res)) continue;
      const out = await upsertProspect({ db }, res.prospect);
      if (out.created) created++; else updated++;
      if (out.nearDuplicate) nearDuplicates.push(res.prospect.societe);
    }
    const tick = await tickProspects({ db });
    console.log(
      `\nImported: ${created} created, ${updated} updated. ` +
        `Tick: ${tick.transitioned} staged, ${tick.addedToCallList.length} on the call-list.`,
    );
    if (nearDuplicates.length > 0) {
      console.log(
        `\n⚠ ${nearDuplicates.length} possible duplicate(s) flagged « à vérifier » ` +
          `(similar name to an existing agency):`,
      );
      for (const n of nearDuplicates) console.log(`    · ${n}`);
    }
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
