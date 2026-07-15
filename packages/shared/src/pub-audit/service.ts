import { and, desc, eq, inArray } from 'drizzle-orm';
import {
  pubAuditFeedback,
  pubAudits,
  pubCheckGuidance,
  type Db,
  type NewPubAuditFeedbackRow,
  type PubAuditFeedbackRow,
  type PubAuditRow,
  type PubCheckGuidanceRow,
} from '../db/index.js';
import { normalizePubText } from './edits.js';
import type { PubFeedbackMap, PubGuidanceMap } from './prompts.js';

/** A live transaction handle, so service fns compose inside an outer transaction. */
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

export interface PubAuditServiceDeps {
  db: Db | Tx;
}

export type PubAuditStatus =
  | 'queued'
  | 'running'
  | 'analyzed'
  | 'review_pending'
  | 'needs_manual'
  | 'error';

export interface PubAuditPatch {
  status?: PubAuditStatus;
  findings?: unknown;
  qualification?: unknown;
  errorMessage?: string | null;
  reviewHtml?: string;
  reviewEdits?: unknown;
  reviewStatus?: string | null;
  pdfRef?: string;
  pdfBase64?: string;
}

export async function createPubAudit(
  { db }: PubAuditServiceDeps,
  input: {
    brokerId: string;
    fileName: string;
    imageBase64: string;
    imageMimeType: string;
    batchId?: string;
    accompanyingText?: string;
    landingUrl?: string;
  },
): Promise<PubAuditRow> {
  const [row] = await db
    .insert(pubAudits)
    .values({
      brokerId: input.brokerId,
      fileName: input.fileName,
      imageBase64: input.imageBase64,
      imageMimeType: input.imageMimeType,
      ...(input.batchId ? { batchId: input.batchId } : {}),
      ...(input.accompanyingText ? { accompanyingText: input.accompanyingText } : {}),
      ...(input.landingUrl ? { landingUrl: input.landingUrl } : {}),
      status: 'queued',
    })
    .returning();
  if (!row) throw new Error('pub_audits insert returned no row');
  return row;
}

export async function updatePubAudit(
  { db }: PubAuditServiceDeps,
  auditId: string,
  patch: PubAuditPatch,
): Promise<PubAuditRow | undefined> {
  const [row] = await db
    .update(pubAudits)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(pubAudits.id, auditId))
    .returning();
  return row;
}

export async function getPubAuditById(
  { db }: PubAuditServiceDeps,
  auditId: string,
): Promise<PubAuditRow | undefined> {
  const [row] = await db.select().from(pubAudits).where(eq(pubAudits.id, auditId));
  return row;
}

/** Audits of a broker, newest first. */
export async function listPubAuditsForBroker(
  { db }: PubAuditServiceDeps,
  brokerId: string,
): Promise<PubAuditRow[]> {
  return db
    .select()
    .from(pubAudits)
    .where(eq(pubAudits.brokerId, brokerId))
    .orderBy(desc(pubAudits.createdAt));
}

// ── Phase 3 — cabinet guidance per check ──────────────────────────────────

export interface PubGuidancePatch {
  reformulations?: string[];
  consigne?: string | null;
  active?: boolean;
}

/** All guidance rows (active and inactive), for the Config UI. */
export async function listPubCheckGuidance({ db }: PubAuditServiceDeps): Promise<PubCheckGuidanceRow[]> {
  return db.select().from(pubCheckGuidance);
}

/** Active guidance keyed by check id, for the checker prompts. */
export async function getPubGuidanceMap({ db }: PubAuditServiceDeps): Promise<PubGuidanceMap> {
  const rows = await db.select().from(pubCheckGuidance).where(eq(pubCheckGuidance.active, true));
  const map: PubGuidanceMap = {};
  for (const r of rows) {
    map[r.checkId] = { reformulations: r.reformulations ?? [], consigne: r.consigne };
  }
  return map;
}

/** Full-replace upsert of a check's guidance (Config UI saves the whole row). */
export async function upsertPubCheckGuidance(
  { db }: PubAuditServiceDeps,
  checkId: string,
  patch: PubGuidancePatch,
): Promise<PubCheckGuidanceRow | undefined> {
  const reformulations = (patch.reformulations ?? [])
    .map((r) => r.trim())
    .filter((r, i, a) => r.length > 0 && a.indexOf(r) === i);
  const consigne = patch.consigne?.trim() ? patch.consigne.trim() : null;
  const active = patch.active ?? true;
  const [row] = await db
    .insert(pubCheckGuidance)
    .values({ checkId, reformulations, consigne, active, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: pubCheckGuidance.checkId,
      set: { reformulations, consigne, active, updatedAt: new Date() },
    })
    .returning();
  return row;
}

/** Append one approved reformulation to a check's guidance (promote flow). */
export async function addPubGuidanceReformulation(
  { db }: PubAuditServiceDeps,
  checkId: string,
  reformulation: string,
): Promise<void> {
  const value = reformulation.trim();
  if (!value) return;
  const [existing] = await db
    .select()
    .from(pubCheckGuidance)
    .where(eq(pubCheckGuidance.checkId, checkId));
  const current = existing?.reformulations ?? [];
  if (current.some((r) => normalizePubText(r) === normalizePubText(value))) return;
  await upsertPubCheckGuidance({ db }, checkId, {
    reformulations: [...current, value],
    consigne: existing?.consigne ?? null,
    active: existing?.active ?? true,
  });
}

// ── Phase 4 — officer feedback ────────────────────────────────────────────

/**
 * Replace an audit's mined corrections with a fresh set. Deleting first makes
 * re-submits idempotent: clicking "Générer le PDF" twice must not double-count
 * a correction in the few-shot / calibration views.
 *
 * Opens its own transaction (delete+insert must be atomic). `db` may already be
 * a `Tx`; this relies on the postgres-js driver nesting via SAVEPOINT — revisit
 * if the driver ever changes.
 */
export async function recordPubFeedback(
  { db }: PubAuditServiceDeps,
  auditId: string,
  rows: NewPubAuditFeedbackRow[],
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(pubAuditFeedback).where(eq(pubAuditFeedback.auditId, auditId));
    if (rows.length > 0) await tx.insert(pubAuditFeedback).values(rows);
  });
}

/**
 * Recent verdict-flip corrections keyed by check id, for the few-shot block.
 * Fetches the most recent `lookback` rows and caps each check at `perCheck`.
 */
export async function getPubFeedbackMap(
  { db }: PubAuditServiceDeps,
  opts: { perCheck?: number; lookback?: number } = {},
): Promise<PubFeedbackMap> {
  const perCheck = opts.perCheck ?? 3;
  const lookback = opts.lookback ?? 300;
  const rows = await db
    .select()
    .from(pubAuditFeedback)
    .where(eq(pubAuditFeedback.field, 'verdict'))
    .orderBy(desc(pubAuditFeedback.createdAt))
    .limit(lookback);
  const map: PubFeedbackMap = {};
  for (const r of rows) {
    const list = (map[r.checkId] ??= []);
    if (list.length >= perCheck) continue;
    list.push({
      verdictBefore: r.valueLlm ?? '',
      verdictAfter: r.valueOfficer ?? '',
      note: r.correctionNote,
    });
  }
  return map;
}

export interface PubPromotionCandidate {
  checkId: string;
  reformulation: string;
  count: number;
}

/**
 * Reformulation corrections the officer has written ≥ `minCount` times (same
 * check, same normalised text) and that aren't promoted yet — surfaced in the
 * Config UI as one-click additions to the guidance library.
 */
export async function getPubPromotionCandidates(
  { db }: PubAuditServiceDeps,
  minCount = 2,
): Promise<PubPromotionCandidate[]> {
  const rows = await db
    .select()
    .from(pubAuditFeedback)
    .where(and(eq(pubAuditFeedback.field, 'reformulation'), eq(pubAuditFeedback.promoted, false)));
  const groups = new Map<string, { checkId: string; reformulation: string; count: number }>();
  for (const r of rows) {
    const text = (r.valueOfficer ?? '').trim();
    if (!text) continue;
    const key = `${r.checkId}::${normalizePubText(text)}`;
    const g = groups.get(key);
    if (g) g.count += 1;
    else groups.set(key, { checkId: r.checkId, reformulation: text, count: 1 });
  }
  return [...groups.values()].filter((g) => g.count >= minCount).sort((a, b) => b.count - a.count);
}

/**
 * Mark the feedback rows for ONE specific promoted reformulation (same check,
 * same normalised text) so it stops resurfacing — without burying the check's
 * other, still-un-promoted reformulation candidates.
 */
export async function markPubReformulationPromoted(
  { db }: PubAuditServiceDeps,
  checkId: string,
  reformulation: string,
): Promise<void> {
  const target = normalizePubText(reformulation);
  const rows = await db
    .select({ id: pubAuditFeedback.id, valueOfficer: pubAuditFeedback.valueOfficer })
    .from(pubAuditFeedback)
    .where(and(eq(pubAuditFeedback.checkId, checkId), eq(pubAuditFeedback.field, 'reformulation')));
  const ids = rows
    .filter((r) => normalizePubText(r.valueOfficer) === target)
    .map((r) => r.id);
  if (ids.length === 0) return;
  await db.update(pubAuditFeedback).set({ promoted: true }).where(inArray(pubAuditFeedback.id, ids));
}

export interface PubCalibrationRow {
  checkId: string;
  verdictFlips: number;
}

/** Verdict-flip counts per check (most-corrected first) for the calibration view. */
export async function getPubCalibration(
  { db }: PubAuditServiceDeps,
): Promise<PubCalibrationRow[]> {
  const rows = await db
    .select()
    .from(pubAuditFeedback)
    .where(eq(pubAuditFeedback.field, 'verdict'));
  const counts = new Map<string, number>();
  for (const r of rows) counts.set(r.checkId, (counts.get(r.checkId) ?? 0) + 1);
  return [...counts.entries()]
    .map(([checkId, verdictFlips]) => ({ checkId, verdictFlips }))
    .sort((a, b) => b.verdictFlips - a.verdictFlips);
}

export type { PubAuditFeedbackRow };
