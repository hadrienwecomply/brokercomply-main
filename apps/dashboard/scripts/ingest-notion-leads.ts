/**
 * One-shot import of the legacy Notion "🔥 Lead broker" board into the
 * prospects mini-CRM (agencies + contacts).
 *
 * Source: local-data/notion-leads.json — a verbatim export of the 468 board
 * rows (produced via the Notion MCP; Notion itself is never written to and is
 * being retired). Each row becomes an AGENCY + contact(s); the messy
 * multi-select Status is translated onto the clean two-axis model by the pure
 * `mapNotionLead` / `mapSuiviToCadence` functions (unit-tested in shared).
 * Nothing is lost: raw tags land verbatim in `source_status`, the free-text
 * "Resultat" in `notes`.
 *
 * Idempotent — matches by contact email then agency name, so re-running (or
 * running after the CSV import) merges instead of duplicating. Rows sharing an
 * email (e.g. the same person under two agency spellings) merge into one
 * agency: the later row wins, `updated` counts them.
 *
 * Date proxies (best available, corrected later by live Graph detection):
 *   offer T0   ← "Meeting date" (the démo) when the lead reached "Offer send",
 *                else "Last tentative date"
 *   reminder/reply/call ← "Last tentative date" via the "Suivi commercial" tag
 *
 * Run (preview, no DB):  pnpm -F @brokercomply/dashboard exec tsx scripts/ingest-notion-leads.ts --dry-run
 * Run (write to DB):     pnpm -F @brokercomply/dashboard exec tsx scripts/ingest-notion-leads.ts
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  createDb,
  mapNotionLead,
  mapSuiviToCadence,
  tickProspects,
  upsertProspect,
  type ProspectImport,
} from '@brokercomply/shared';

const DEFAULT_JSON = '../../../local-data/notion-leads.json';

interface NotionLeadRow {
  url: string;
  contact: string | null;
  societe: string | null;
  email: string | null;
  phone: string | null;
  /** JSON-encoded array of Status multi-select tags, or null. */
  status: string | null;
  suivi: string | null;
  lead_from: string | null;
  conversion: string | null;
  verticale: string | null;
  mrr: number | null;
  meeting_date: string | null;
  last_tentative: string | null;
  resultat: string | null;
  site: string | null;
}

/** 'YYYY-MM-DD' or 'YYYY-MM-DD HH:MM:SSZ' → Date, or null. */
function parseDate(raw: string | null): Date | null {
  const s = raw?.trim();
  if (!s) return null;
  const iso = s.includes(' ') ? s.replace(' ', 'T') : `${s}T00:00:00.000Z`;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * The Email cell is free text: single address, several separated by spaces or
 * " / ", or "a@x <a@x>" duplications. Extract, normalize, dedupe.
 */
function extractEmails(raw: string | null): string[] {
  if (!raw) return [];
  const found = raw.match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)*/g) ?? [];
  return [...new Set(found.map((e) => e.toLowerCase()))];
}

function clean(raw: string | null): string | null {
  const s = raw?.trim();
  return s && s !== '?' ? s : null;
}

interface ParseStats {
  imported: ProspectImport[];
  skippedNoIdentity: { url: string }[];
  needsReview: number;
}

function toImports(rows: NotionLeadRow[]): ParseStats {
  const stats: ParseStats = { imported: [], skippedNoIdentity: [], needsReview: 0 };

  for (const row of rows) {
    const emails = extractEmails(row.email);
    const contactName = clean(row.contact);
    const societe = clean(row.societe) ?? contactName ?? emails[0];
    if (!societe) {
      stats.skippedNoIdentity.push({ url: row.url });
      continue;
    }

    const tags: string[] = row.status ? JSON.parse(row.status) : [];
    const mapping = mapNotionLead(tags, row.suivi);
    const lastTentative = parseDate(row.last_tentative);
    const cadence = mapSuiviToCadence(row.suivi, lastTentative);
    const meetingDate = parseDate(row.meeting_date);

    // Offer T0 proxy — only meaningful while the offer is being chased.
    const offerSentAt =
      mapping.pipelineStage === 'offer_sent' ? meetingDate ?? lastTentative : null;

    // The agency name fell back to the person/email — surface for review.
    const identityFallback = !clean(row.societe);
    if (mapping.needsReview || identityFallback) stats.needsReview++;

    stats.imported.push({
      societe,
      siteInternet: clean(row.site),
      verticale: clean(row.verticale),
      sourceStatus:
        [...tags, ...(row.suivi ? [row.suivi] : [])].join(' | ') || null,
      pipelineStage: mapping.pipelineStage,
      lostReason: mapping.lostReason,
      noShow: mapping.noShow,
      needsReview: mapping.needsReview || identityFallback,
      mrr: row.mrr != null ? String(row.mrr) : null,
      conversionProbability: clean(row.conversion),
      leadFrom: row.lead_from && row.lead_from !== 'Non' ? row.lead_from : null,
      meetingDate,
      offerSentAt,
      lastReplyAt: cadence.lastReplyAt,
      calledAt: cadence.calledAt,
      notes: clean(row.resultat),
      contact: {
        name: contactName,
        email: emails[0] ?? null,
        phone: clean(row.phone),
      },
      otherEmails: emails.slice(1),
    });
  }
  return stats;
}

async function main() {
  const argv = process.argv.slice(2);
  const dryRun = argv.includes('--dry-run');
  const pathArg = argv.find((a) => !a.startsWith('--'));

  const here = dirname(fileURLToPath(import.meta.url));
  const jsonPath = pathArg ? join(process.cwd(), pathArg) : join(here, DEFAULT_JSON);

  const rows: NotionLeadRow[] = JSON.parse(readFileSync(jsonPath, 'utf8'));
  const { imported, skippedNoIdentity, needsReview } = toImports(rows);

  const byStage = new Map<string, number>();
  let noShow = 0;
  let withOffer = 0;
  for (const p of imported) {
    byStage.set(p.pipelineStage!, (byStage.get(p.pipelineStage!) ?? 0) + 1);
    if (p.noShow) noShow++;
    if (p.offerSentAt) withOffer++;
  }

  console.log(`Parsed ${jsonPath}`);
  console.log(
    `  ${imported.length} leads to import — ${skippedNoIdentity.length} skipped (no identity)`,
  );
  console.log('  Pipeline:');
  for (const [stage, n] of [...byStage.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`    ${stage.padEnd(14)} ${n}`);
  }
  console.log(`  no_show flag: ${noShow} · needs_review: ${needsReview} · offer T0 set: ${withOffer}`);

  if (dryRun) {
    console.log('\n--dry-run: no database writes. Sample of the first 5:');
    for (const p of imported.slice(0, 5)) {
      console.log(
        `   • ${p.societe} [${p.pipelineStage}${p.lostReason ? `/${p.lostReason}` : ''}` +
          `${p.noShow ? ' no-show' : ''}] <${p.contact?.email ?? 'no-email'}> ` +
          `offer=${p.offerSentAt?.toISOString().slice(0, 10) ?? '—'}`,
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
      if (res.created) created++;
      else updated++;
    }
    const tick = await tickProspects({ db });
    console.log(
      `\nImported: ${created} created, ${updated} merged/updated. ` +
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
