/**
 * Ingest sales prospects (démarchage) from the follow-up CSV into `prospects`.
 *
 * Source: local-data/prospects_a_recontacter.csv (semicolon-delimited, BOM).
 * Each row becomes an AGENCY (`prospects`) plus its primary contact and any
 * secondary addresses (`prospect_contacts`). The importer is idempotent —
 * re-runnable, matching by contact email then agency name — and never
 * touches any other table. After importing it runs the cadence tick so each
 * prospect lands on its correct stage (awaiting_reply / reminded / to_call /
 * replied) straight away.
 *
 * Field mapping / assumptions:
 *   dernier_email_envoye → offer_sent_at (T0, best available proxy for "offer")
 *   dernier_email_recu   → last_reply_at  (reply signal; a reply dated at/after
 *                          the offer cancels the chase — corrected later by the
 *                          live Graph reply detection in P2)
 *   client_crm set       → skipped (already a signed client, not a prospect)
 *   no phone in source   → phone left null, added from the call-list UI
 *
 * Run (preview, no DB):  pnpm -F @brokercomply/dashboard exec tsx scripts/ingest-prospects.ts --dry-run
 * Run (write to DB):     pnpm -F @brokercomply/dashboard exec tsx scripts/ingest-prospects.ts
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  createDb,
  tickProspects,
  upsertProspect,
  type ProspectImport,
} from '@brokercomply/shared';

const DEFAULT_CSV = '../../../local-data/prospects_a_recontacter.csv';

/** Minimal RFC-4180-ish parser for a `;`-delimited file (handles quotes). */
function parseCsv(text: string, delimiter = ';'): string[][] {
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

/** 'YYYY-MM-DD' → UTC Date at midnight, or null for empty/invalid. */
function parseDate(raw: string): Date | null {
  const s = raw.trim();
  if (!/^\d{4}-\d{2}-\d{2}/.test(s)) return null;
  const d = new Date(`${s.slice(0, 10)}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function splitEmails(raw: string): string[] {
  return raw
    .split(/[,;\s]+/)
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.includes('@'));
}

interface ParseStats {
  imported: ProspectImport[];
  skippedClient: number;
  skippedNoIdentity: number;
}

function toImports(rows: string[][]): ParseStats {
  const [header, ...body] = rows;
  const col = (name: string) => header.indexOf(name);
  const iSociete = col('societe');
  const iContact = col('contact');
  const iEmail = col('email');
  const iEmailsAutres = col('emails_autres');
  const iStatut = col('statut');
  const iClientCrm = col('client_crm');
  const iRecu = col('dernier_email_recu');
  const iObjetRecu = col('objet_dernier_recu');
  const iEnvoye = col('dernier_email_envoye');

  const stats: ParseStats = { imported: [], skippedClient: 0, skippedNoIdentity: 0 };

  for (const r of body) {
    if (r.length === 1 && r[0].trim() === '') continue; // trailing blank line
    const societe = (r[iSociete] ?? '').trim();
    const email = (r[iEmail] ?? '').trim().toLowerCase() || null;

    if ((r[iClientCrm] ?? '').trim() !== '') { stats.skippedClient++; continue; }
    if (!societe && !email) { stats.skippedNoIdentity++; continue; }

    const offerSentAt = parseDate(r[iEnvoye] ?? '');
    stats.imported.push({
      societe: societe || email!, // societe is NOT NULL; fall back to the email
      sourceStatus: (r[iStatut] ?? '').trim() || null,
      // Everyone in this CSV received the offer e-mail — funnel position known.
      ...(offerSentAt ? { pipelineStage: 'offer_sent' as const } : {}),
      offerSentAt,
      lastReplyAt: parseDate(r[iRecu] ?? ''),
      lastReplySubject: (r[iObjetRecu] ?? '').trim() || null,
      contact: {
        name: (r[iContact] ?? '').trim() || null,
        email,
        phone: null, // no phone in source — added from the call-list UI
      },
      otherEmails: splitEmails(r[iEmailsAutres] ?? ''),
    });
  }
  return stats;
}

async function main() {
  const argv = process.argv.slice(2);
  const dryRun = argv.includes('--dry-run');
  const pathArg = argv.find((a) => !a.startsWith('--'));

  const here = dirname(fileURLToPath(import.meta.url));
  const csvPath = pathArg
    ? join(process.cwd(), pathArg)
    : join(here, DEFAULT_CSV);

  const rows = parseCsv(readFileSync(csvPath, 'utf8'));
  const { imported, skippedClient, skippedNoIdentity } = toImports(rows);

  console.log(`Parsed ${csvPath}`);
  console.log(
    `  ${imported.length} prospects to import — ` +
      `${skippedClient} skipped (already client), ${skippedNoIdentity} skipped (no identity)`,
  );
  const withOffer = imported.filter((p) => p.offerSentAt).length;
  console.log(`  ${withOffer} have an offer date (T0); ${imported.length - withOffer} do not`);

  if (dryRun) {
    console.log('\n--dry-run: no database writes. Sample of the first 3:');
    for (const p of imported.slice(0, 3)) {
      console.log(
        `   • ${p.societe} <${p.contact?.email ?? 'no-email'}> ` +
          `offer=${p.offerSentAt?.toISOString().slice(0, 10) ?? '—'} ` +
          `reply=${p.lastReplyAt?.toISOString().slice(0, 10) ?? '—'}`,
      );
    }
    return;
  }

  const { db, client } = createDb();
  try {
    let created = 0;
    let updated = 0;
    for (const p of imported) {
      const res = await upsertProspect({ db }, p);
      if (res.created) created++; else updated++;
    }
    const tick = await tickProspects({ db });
    console.log(
      `\nImported: ${created} created, ${updated} updated. ` +
        `Tick: ${tick.transitioned} staged, ${tick.remindersDue.length} reminders due, ` +
        `${tick.addedToCallList.length} on the call-list.`,
    );
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
