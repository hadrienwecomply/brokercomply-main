import { z } from 'zod';
import { computeNiveau } from './assemble.js';
import { PUB_SECTIONS } from './catalog.js';
import {
  MAX_ADDED_CONSTATS,
  PubAddedConstatSchema,
  PubVerdictSchema,
  type PubAddedConstat,
  type PubAuditPayload,
  type PubConstat,
} from './types.js';

/**
 * Officer edits captured by the editable pub report (format
 * `brokercomply-pub/v1`) and re-injected into the payload before it is sent to
 * the PDF workflow. Keyed by constat id so edits survive re-renders. When a
 * verdict changes, the global level is recomputed deterministically.
 *
 * Two fields never reach the deliverable payload and exist only for the
 * feedback loop:
 *  - `correction_note`: the officer's internal "why I changed this verdict"
 *    (see {@link applyPubEdits}, which drops it) — it feeds the checker prompts
 *    of later audits, not the PDF.
 */
export const PubAuditConstatEditSchema = z.object({
  verdict: PubVerdictSchema.optional(),
  citation: z.string().optional(),
  explication: z.string().optional(),
  reformulation: z.string().optional(),
  a_verifier_ou: z.string().optional(),
  commentaire: z.string().optional(),
  /** Internal only — never rendered in the report/PDF. */
  correction_note: z.string().optional(),
});
export type PubAuditConstatEdit = z.infer<typeof PubAuditConstatEditSchema>;

export const PubAuditEditsSchema = z.object({
  header: z
    .object({
      description: z.string().optional(),
      disclaimer: z.string().optional(),
      note: z.string().optional(),
    })
    .optional(),
  constats: z.record(PubAuditConstatEditSchema).optional(),
  /**
   * Constats the officer added by hand in the report (not in the catalog). They
   * carry their whole content (there is no base to diff), are appended to the
   * payload by {@link applyPubEdits}, and are mined into the custom-check store.
   */
  added: z.array(PubAddedConstatSchema).max(MAX_ADDED_CONSTATS).optional(),
});
export type PubAuditEdits = z.infer<typeof PubAuditEditsSchema>;

/** Mirror the editor's `txt()` normalisation so diffs never fire on whitespace. */
export function normalizePubText(s: string | null | undefined): string {
  return (s ?? '').replace(/\u00a0/g, ' ').replace(/\r\n/g, '\n').trim();
}

/**
 * Turn a raw officer-added constat into a full {@link PubConstat} carrying
 * `origin: 'officer'`. Kept separate so both the payload assembler (apply) and
 * the learning store use identical normalisation.
 */
function toOfficerConstat(a: PubAddedConstat): PubConstat {
  return {
    id: a.id,
    intitule: a.intitule,
    verdict: a.verdict,
    type: a.type,
    section: a.section,
    base_legale: a.base_legale,
    citation: a.citation ?? null,
    explication: a.explication ?? '',
    reformulation: a.reformulation ?? null,
    a_verifier_ou: a.a_verifier_ou ?? null,
    commentaire: a.commentaire ?? null,
    origin: 'officer',
  };
}

/**
 * Keep only the officer-added constats that are safe to render/persist: their
 * section must be a real report section, they must have a non-empty intitul\u00e9,
 * their ids must be unique, and the count is capped. An empty-intitul\u00e9 block is
 * one the officer added but never filled \u2014 dropped silently.
 */
function sanitizeAdded(added: PubAddedConstat[] | undefined): PubAddedConstat[] {
  if (!added || added.length === 0) return [];
  const seen = new Set<string>();
  const out: PubAddedConstat[] = [];
  for (const a of added) {
    if (!PUB_SECTIONS.includes(a.section)) continue;
    if (normalizePubText(a.intitule) === '') continue;
    if (seen.has(a.id)) continue;
    seen.add(a.id);
    out.push(a);
    if (out.length >= MAX_ADDED_CONSTATS) break;
  }
  return out;
}

/**
 * Merge officer edits into a pub payload. Unknown constat ids are ignored; the
 * global level (niveauGlobal) is recomputed from the resulting verdicts.
 * `correction_note` is deliberately NOT applied — it is internal feedback, not
 * part of the deliverable. Throws (Zod) on malformed edits — callers surface
 * that as a 400.
 */
export function applyPubEdits(payload: PubAuditPayload, rawEdits: unknown): PubAuditPayload {
  const edits = PubAuditEditsSchema.parse(rawEdits ?? {});
  const constats = payload.constats.map((c) => {
    const e = edits.constats?.[c.id];
    if (!e) return c;
    return {
      ...c,
      ...(e.verdict !== undefined ? { verdict: e.verdict } : {}),
      ...(e.citation !== undefined ? { citation: e.citation } : {}),
      ...(e.explication !== undefined ? { explication: e.explication } : {}),
      ...(e.reformulation !== undefined ? { reformulation: e.reformulation } : {}),
      ...(e.a_verifier_ou !== undefined ? { a_verifier_ou: e.a_verifier_ou } : {}),
      ...(e.commentaire !== undefined ? { commentaire: e.commentaire } : {}),
    };
  });

  // Append the officer-added constats after the catalog ones. They live only in
  // the edits delta (the stored findings stay the raw LLM output), so this never
  // double-appends across save round-trips.
  const added = sanitizeAdded(edits.added).map(toOfficerConstat);
  const constatsAll = added.length > 0 ? [...constats, ...added] : constats;

  return {
    ...payload,
    ...(edits.header?.description !== undefined ? { description: edits.header.description } : {}),
    ...(edits.header?.disclaimer !== undefined ? { disclaimer: edits.header.disclaimer } : {}),
    ...(edits.header?.note !== undefined ? { note: edits.header.note } : {}),
    constats: constatsAll,
    niveauGlobal: computeNiveau(constatsAll),
  };
}

/** Text fields of a constat edit that are compared against the payload. */
const CONSTAT_TEXT_FIELDS = [
  'citation',
  'explication',
  'reformulation',
  'a_verifier_ou',
  'commentaire',
] as const;

/**
 * Reduce a full editor payload to the fields that actually changed from the
 * base audit — the "true delta". This is what we persist as `review_edits`:
 *  - it makes re-runs safe (a stale full snapshot can no longer overwrite a
 *    fresh analysis), and
 *  - it is the raw signal the feedback loop mines (what the officer corrected).
 *
 * `correction_note` is preserved verbatim whenever present (it has no payload
 * counterpart to diff against). A constat with no real change and no note is
 * dropped entirely. Malformed edits throw (Zod).
 */
export function diffPubEdits(payload: PubAuditPayload, rawEdits: unknown): PubAuditEdits {
  const edits = PubAuditEditsSchema.parse(rawEdits ?? {});
  const out: PubAuditEdits = {};

  if (edits.header) {
    const header: NonNullable<PubAuditEdits['header']> = {};
    if (
      edits.header.description !== undefined &&
      normalizePubText(edits.header.description) !== normalizePubText(payload.description)
    ) {
      header.description = edits.header.description;
    }
    if (
      edits.header.disclaimer !== undefined &&
      normalizePubText(edits.header.disclaimer) !== normalizePubText(payload.disclaimer)
    ) {
      header.disclaimer = edits.header.disclaimer;
    }
    if (
      edits.header.note !== undefined &&
      normalizePubText(edits.header.note) !== normalizePubText(payload.note)
    ) {
      header.note = edits.header.note;
    }
    if (Object.keys(header).length > 0) out.header = header;
  }

  if (edits.constats) {
    const byId = new Map(payload.constats.map((c) => [c.id, c]));
    const constats: Record<string, PubAuditConstatEdit> = {};
    for (const [cid, e] of Object.entries(edits.constats)) {
      const base = byId.get(cid);
      if (!base) continue; // unknown id → ignored (same as applyPubEdits)
      const delta: PubAuditConstatEdit = {};
      if (e.verdict !== undefined && e.verdict !== base.verdict) delta.verdict = e.verdict;
      for (const f of CONSTAT_TEXT_FIELDS) {
        const next = e[f];
        if (next !== undefined && normalizePubText(next) !== normalizePubText(base[f])) {
          delta[f] = next;
        }
      }
      const note = normalizePubText(e.correction_note);
      if (note) delta.correction_note = note;
      if (Object.keys(delta).length > 0) constats[cid] = delta;
    }
    if (Object.keys(constats).length > 0) out.constats = constats;
  }

  // Officer-added constats have no base to diff against — carry the sanitized
  // set through verbatim so it replays identically through applyPubEdits.
  const added = sanitizeAdded(edits.added);
  if (added.length > 0) out.added = added;

  return out;
}

/**
 * Extract the officer-added constats worth persisting to the custom-check store
 * (the "learn for the future" signal). Accepts either a full editor payload or a
 * stored delta; both yield the same sanitized rows. Malformed edits throw (Zod).
 */
export function extractAddedConstats(rawEdits: unknown): PubAddedConstat[] {
  const edits = PubAuditEditsSchema.parse(rawEdits ?? {});
  return sanitizeAdded(edits.added);
}

/** A single officer correction mined for the feedback loop (Phase 4). */
export interface PubFeedbackDelta {
  checkId: string;
  field: 'verdict' | 'reformulation';
  valueLlm: string | null;
  valueOfficer: string | null;
  /** Officer's internal reason — only ever set for verdict flips. */
  correctionNote: string | null;
}

/**
 * Extract the corrections worth learning from — verdict flips (the few-shot
 * signal) and reformulation rewrites (the promotion signal) — from an edit set
 * against the base payload. Accepts either a full editor payload or a stored
 * delta; both yield the same rows. Non-flip verdicts and unchanged text are
 * skipped. Malformed edits throw (Zod).
 */
export function extractPubFeedback(payload: PubAuditPayload, rawEdits: unknown): PubFeedbackDelta[] {
  const edits = PubAuditEditsSchema.parse(rawEdits ?? {});
  if (!edits.constats) return [];
  const byId = new Map(payload.constats.map((c) => [c.id, c]));
  const out: PubFeedbackDelta[] = [];
  for (const [cid, e] of Object.entries(edits.constats)) {
    const base = byId.get(cid);
    if (!base) continue;
    if (e.verdict !== undefined && e.verdict !== base.verdict) {
      out.push({
        checkId: cid,
        field: 'verdict',
        valueLlm: base.verdict,
        valueOfficer: e.verdict,
        correctionNote: normalizePubText(e.correction_note) || null,
      });
    }
    if (
      e.reformulation !== undefined &&
      normalizePubText(e.reformulation) !== normalizePubText(base.reformulation) &&
      normalizePubText(e.reformulation) !== ''
    ) {
      out.push({
        checkId: cid,
        field: 'reformulation',
        valueLlm: base.reformulation ?? null,
        valueOfficer: e.reformulation,
        correctionNote: null,
      });
    }
  }
  return out;
}
