/**
 * Pure translation of the FSMA lead-enrichment CSV onto the prospect model,
 * used by the `ingest-fsma-leads` import. DB-free and deterministic — fully
 * unit-testable.
 *
 * Each row is one AGENCY (`nom`) with a primary contact built from the manager
 * columns (`gerant_principal` / `tel_gerant` / `email` / `linkedin_gerant`).
 * Empty cells map to `undefined` so a re-import never clears a stored value
 * (`upsertProspect` writes only defined enrichment fields). Only ROWS THAT WERE
 * ENRICHED are imported — `pending`/blank statuses are left in the CSV backlog.
 */

import type { ProspectImport } from './service.js';

/** Verbatim CSV row: header → cell value. */
export type FsmaRow = Record<string, string>;

export type FsmaMapResult =
  | { prospect: ProspectImport }
  | { skipped: 'no-name' | 'not-enriched' };

/** Statuses that mean the row has NOT been worked yet — kept out of the CRM. */
const PENDING_STATUSES = new Set(['', 'pending', 'todo', 'a_faire', 'à faire']);

/** Trim → undefined for empty, so enrichment fields never clear on re-import. */
function opt(raw: string | undefined): string | undefined {
  const v = raw?.trim();
  return v ? v : undefined;
}

/** Trim → null (for the primary-contact fields, where null is a real value). */
function orNull(raw: string | undefined): string | null {
  return opt(raw) ?? null;
}

/** Normalize a language cell to 'FR' | 'NL' | 'EN' (tolerant), else undefined. */
export function normalizeLanguage(raw: string | undefined): string | undefined {
  const v = raw?.trim().toLowerCase();
  if (!v) return undefined;
  if (v.startsWith('fr')) return 'FR';
  if (v.startsWith('nl') || v.startsWith('ne') || v.startsWith('du') || v.startsWith('vl'))
    return 'NL';
  if (v.startsWith('en') || v.startsWith('ang')) return 'EN';
  return undefined;
}

/** Parse a CSV date cell (ISO or dd/mm/yyyy) to a Date, else undefined. */
export function parseDate(raw: string | undefined): Date | undefined {
  const v = raw?.trim();
  if (!v) return undefined;
  const dmy = v.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  const d = dmy
    ? new Date(Number(dmy[3]), Number(dmy[2]) - 1, Number(dmy[1]))
    : new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

/**
 * Map one CSV row to a `ProspectImport`, or a skip reason. `lists` (the import
 * list tag) is supplied by the caller, not the row.
 */
export function mapFsmaLead(row: FsmaRow, lists: string[] = []): FsmaMapResult {
  const societe = row.nom?.trim();
  if (!societe) return { skipped: 'no-name' };

  const statut = row.statut?.trim().toLowerCase() ?? '';
  if (PENDING_STATUSES.has(statut)) return { skipped: 'not-enriched' };

  // Primary contact = the manager. The mobile (`tel_gerant`) is the cold-call
  // target and lands on the contact's phone.
  const contact = {
    name: orNull(row.gerant_principal),
    email: orNull(row.email),
    phone: orNull(row.tel_gerant),
    role: row.gerant_principal?.trim() ? 'Gérant' : null,
    linkedin: orNull(row.linkedin_gerant),
  };

  // Enrichment/agency fields stay `undefined` when blank so `definedOnly` in
  // upsertProspect skips them (a re-import never clears a stored value).
  const prospect: ProspectImport = {
    societe,
    bce: opt(row.numero_bce),
    verticale: 'Courtiers',
    language: normalizeLanguage(row.langue),
    sourceStatus: opt(row.statut),
    lists,
    pipelineStageOnCreate: 'to_contact',
    siteInternet: opt(row.site_web),
    formeJuridique: opt(row.forme_juridique),
    gerantsTous: opt(row.gerants_tous),
    rue: opt(row.rue),
    codePostal: opt(row.code_postal),
    ville: opt(row.ville),
    province: opt(row.province),
    pays: opt(row.pays),
    fsmaStatut: opt(row.fsma_statut),
    debutStatut: parseDate(row.debut_statut),
    typesProduits: opt(row.types_produits),
    activite: opt(row.activite),
    tailleEquipe: opt(row.taille_equipe),
    telSociete: opt(row.tel_societe),
    telSource: opt(row.tel_source),
    siteStatus: opt(row.site_status),
    siteQuality: opt(row.site_quality),
    siteSummary: opt(row.site_summary),
    linkedinSociete: opt(row.linkedin_societe),
    instagram: opt(row.instagram),
    xTwitter: opt(row.x_twitter),
    dateEnrichissement: parseDate(row.date_enrichissement),
    // Enrichment notes seed the note on CREATE only — never clobber officer edits.
    notesOnCreate: opt(row.notes),
    contact,
    otherEmails: [],
  };

  return { prospect };
}
