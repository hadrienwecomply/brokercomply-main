/**
 * The bridge — the one place the classifier is allowed to touch a prospect.
 *
 * For every prospect that has a NEW inbound reply in the mail archive
 * (`source_documents`, already AML-filtered), it rebuilds the thread, asks the
 * classifier for the current intent, and then applies the deterministic
 * consequences under the guard-rails agreed for Phase 2:
 *
 *  - per-move-type confidence bar (advance vs close) — below it, the move is
 *    logged as `pending_review` instead of applied;
 *  - "the human wins" — a manual stage change made AFTER the e-mail blocks the
 *    auto-move (→ review), and a human-set intent is never overwritten;
 *  - every decision (applied / pending / no-op) is journaled in
 *    `prospect_ai_actions`, keyed on the source message id, which is also what
 *    makes the pass idempotent — a thread is handled once per new reply.
 *
 * Reading the archive rather than Graph directly is deliberate: the ingestion
 * pipeline already fetches, threads, cleans and AML-filters the mail, and the
 * broker "conversations" feature already reads the same table.
 */

import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import type { LLMClient } from '../llm/types.js';
import {
  prospectAiActions,
  prospects,
  sourceDocuments,
  type Prospect,
} from '../db/schema.js';
import { classifyIntent, IntentParseError } from './intent-classifier.js';
import {
  mapIntentToAxes,
  wouldMoveFunnel,
  type ProspectIntent,
} from './intent-mapping.js';
import {
  setProspectPipelineStage,
  type PipelineStage,
  type ProspectsServiceDeps,
} from './service.js';
import { createTask } from './tasks.js';

/** Confidence a move must clear to auto-apply, by move type (decision). */
export interface IntentThresholds {
  advance: number;
  close: number;
}
export const DEFAULT_INTENT_THRESHOLDS: IntentThresholds = {
  advance: 0.75,
  close: 0.92,
};

/** Days ahead for a `later` reminder when the prospect named no date. */
const DEFAULT_CALLBACK_DAYS = 30;

export interface IntentBridgeDeps extends ProspectsServiceDeps {
  llm: LLMClient;
}

export interface IntentBridgeSummary {
  /** Threads classified this pass. */
  processed: number;
  /** Funnel moves auto-applied. */
  applied: number;
  /** Moves logged for officer review (below bar or blocked by a human). */
  pendingReview: number;
  /** Threads with no funnel consequence (no_reply, or already satisfied). */
  noop: number;
  /** Callback tasks created for `later`. */
  callbacksScheduled: number;
  /** Threads the classifier could not parse (left untouched). */
  failed: number;
}

interface Candidate {
  prospectId: string;
  messageId: string;
  conversationId: string | null;
  receivedAt: Date;
}

/**
 * The LATEST inbound reply per prospect whose message id has not been
 * classified yet.
 *
 * The "already processed" filter must be applied AFTER picking the latest
 * message, never inside it: filtering first would make each pass peel off the
 * next-older reply of a prospect whose latest was already handled, so the pass
 * would never converge. Here we take the latest inbound per prospect, then drop
 * the ones already journaled — a prospect only reappears when a genuinely NEWER
 * reply arrives (new message id).
 */
async function fetchUnprocessedCandidates(db: Db): Promise<Candidate[]> {
  const latest = await db.execute<{
    prospect_id: string;
    message_id: string;
    conversation_id: string | null;
    received_at: Date;
  }>(sql`
    select distinct on (pc.prospect_id)
      pc.prospect_id, sd.message_id, sd.conversation_id, sd.received_at
    from ${sourceDocuments} sd
    join prospect_contacts pc on lower(sd.sender) = pc.email
    where sd.direction = 'inbound' and sd.received_at is not null
    order by pc.prospect_id, sd.received_at desc
  `);
  if (latest.length === 0) return [];

  const processed = await db
    .select({ messageId: prospectAiActions.messageId })
    .from(prospectAiActions)
    .where(
      inArray(
        prospectAiActions.messageId,
        latest.map((r) => r.message_id),
      ),
    );
  const seen = new Set(processed.map((r) => r.messageId));

  return latest
    .filter((r) => !seen.has(r.message_id))
    .map((r) => ({
      prospectId: r.prospect_id,
      messageId: r.message_id,
      conversationId: r.conversation_id,
      receivedAt: new Date(r.received_at),
    }));
}

/** Cleaned thread text for a candidate, oldest → newest, direction-labelled. */
async function buildThreadText(db: Db, c: Candidate): Promise<string> {
  const msgs = c.conversationId
    ? await db
        .select({
          direction: sourceDocuments.direction,
          body: sourceDocuments.bodyClean,
          subject: sourceDocuments.subject,
          receivedAt: sourceDocuments.receivedAt,
        })
        .from(sourceDocuments)
        .where(eq(sourceDocuments.conversationId, c.conversationId))
        .orderBy(sourceDocuments.receivedAt)
    : await db
        .select({
          direction: sourceDocuments.direction,
          body: sourceDocuments.bodyClean,
          subject: sourceDocuments.subject,
          receivedAt: sourceDocuments.receivedAt,
        })
        .from(sourceDocuments)
        .where(eq(sourceDocuments.messageId, c.messageId));

  return msgs
    .map((m) => {
      const who = m.direction === 'inbound' ? 'PROSPECT' : 'NOUS';
      return `[${who}] ${(m.body ?? '').trim()}`;
    })
    .filter((s) => s.length > 12)
    .join('\n\n---\n\n');
}

/** Which confidence bar applies to a mapping's move type. */
function barFor(tier: 'advance' | 'close' | 'none', t: IntentThresholds): number {
  return tier === 'close' ? t.close : t.advance;
}

export type AiActionStatus = 'applied' | 'pending_review' | 'noop';

export interface IntentOutcome {
  status: AiActionStatus;
  /** Funnel stage the action set or proposes; null when no funnel move. */
  stageAfter: PipelineStage | null;
  /** Whether a `later` reminder task should be created (only when applied). */
  scheduleCallback: boolean;
}

/**
 * The pure decision at the heart of the bridge: given the mapped intent, the
 * confidence, the current funnel stage and whether a human owns the prospect
 * more recently than the signal, decide what happens. No DB, no LLM — this is
 * where "auto above the bar, else review, human always wins" is enforced and
 * unit-tested.
 */
export function decideIntentOutcome(
  mapping: ReturnType<typeof mapIntentToAxes>,
  confidence: number,
  currentStage: PipelineStage,
  humanWins: boolean,
  thresholds: IntentThresholds = DEFAULT_INTENT_THRESHOLDS,
): IntentOutcome {
  const clears = confidence >= barFor(mapping.tier, thresholds);

  if (mapping.schedulesCallback) {
    return clears && !humanWins
      ? { status: 'applied', stageAfter: null, scheduleCallback: true }
      : { status: 'pending_review', stageAfter: null, scheduleCallback: false };
  }
  if (!wouldMoveFunnel(mapping, currentStage)) {
    return { status: 'noop', stageAfter: null, scheduleCallback: false };
  }
  return clears && !humanWins
    ? { status: 'applied', stageAfter: mapping.targetStage, scheduleCallback: false }
    : { status: 'pending_review', stageAfter: mapping.targetStage, scheduleCallback: false };
}

/**
 * A human owns this prospect's funnel/intent MORE RECENTLY than the signal —
 * so the classifier must not auto-apply (it proposes for review instead).
 */
function humanWinsOver(p: Prospect, signalAt: Date): boolean {
  if (p.stageChangedAt && p.stageChangedAt.getTime() > signalAt.getTime()) return true;
  if (
    p.intentSource === 'human' &&
    p.intentUpdatedAt &&
    p.intentUpdatedAt.getTime() > signalAt.getTime()
  ) {
    return true;
  }
  return false;
}

/** Run one classification pass over all prospects with a fresh reply. */
export async function runIntentClassification(
  { db, llm }: IntentBridgeDeps,
  now: Date = new Date(),
  thresholds: IntentThresholds = DEFAULT_INTENT_THRESHOLDS,
): Promise<IntentBridgeSummary> {
  const summary: IntentBridgeSummary = {
    processed: 0,
    applied: 0,
    pendingReview: 0,
    noop: 0,
    callbacksScheduled: 0,
    failed: 0,
  };

  const candidates = await fetchUnprocessedCandidates(db);
  if (candidates.length === 0) return summary;

  const prospectRows = await db
    .select()
    .from(prospects)
    .where(
      inArray(
        prospects.id,
        candidates.map((c) => c.prospectId),
      ),
    );
  const byId = new Map(prospectRows.map((p) => [p.id, p]));

  for (const c of candidates) {
    const p = byId.get(c.prospectId);
    if (!p) continue;

    const threadText = await buildThreadText(db, c);
    if (!threadText) continue;

    let classification;
    try {
      classification = await classifyIntent(llm, {
        threadText,
        societe: p.societe,
        offerAlreadySent: p.offerSentAt != null,
        today: now,
      });
    } catch (err) {
      if (err instanceof IntentParseError) {
        summary.failed++;
        continue; // leave the prospect untouched; retried next pass
      }
      throw err;
    }

    summary.processed++;
    const { intent, confidence, quote, suggestedDate } = classification;
    const mapping = mapIntentToAxes(intent as ProspectIntent);
    const currentStage = p.pipelineStage as PipelineStage;
    const humanWins = humanWinsOver(p, c.receivedAt);
    const outcome = decideIntentOutcome(
      mapping,
      confidence,
      currentStage,
      humanWins,
      thresholds,
    );

    if (outcome.scheduleCallback) {
      const dueAt = suggestedDate
        ? new Date(`${suggestedDate}T09:00:00.000Z`)
        : new Date(now.getTime() + DEFAULT_CALLBACK_DAYS * 86_400_000);
      await createTask(
        { db },
        {
          prospectId: p.id,
          title: `Recontacter ${p.societe} (demande de rappel)`,
          type: 'call',
          dueAt,
          assignee: p.owner,
          source: 'ai',
          notes: quote ? `« ${quote} »` : null,
        },
      );
      summary.callbacksScheduled++;
    } else if (outcome.status === 'applied' && outcome.stageAfter) {
      await setProspectPipelineStage(
        { db },
        p.id,
        outcome.stageAfter,
        mapping.lostReason,
        { byAi: true },
      );
    }

    if (outcome.status === 'applied') summary.applied++;
    else if (outcome.status === 'pending_review') summary.pendingReview++;
    else summary.noop++;
    const stageAfter = outcome.stageAfter;

    // Record the reply fact + the intent on the prospect. The reply date only
    // ever advances, and a human-owned intent is never overwritten by the AI.
    const keepHumanIntent =
      p.intentSource === 'human' &&
      p.intentUpdatedAt != null &&
      p.intentUpdatedAt.getTime() > c.receivedAt.getTime();
    // Advance the reply date only (never move it backward). Computed in JS —
    // a raw `greatest()` sql template mis-binds a JS Date under postgres.js.
    const lastReplyAt =
      !p.lastReplyAt || c.receivedAt.getTime() > p.lastReplyAt.getTime()
        ? c.receivedAt
        : p.lastReplyAt;
    await db
      .update(prospects)
      .set({
        lastReplyAt,
        ...(keepHumanIntent
          ? {}
          : {
              intent,
              intentConfidence: confidence,
              intentQuote: quote,
              intentSource: 'ai',
              intentUpdatedAt: now,
            }),
        updatedAt: now,
      })
      .where(eq(prospects.id, p.id));

    // Journal last — idempotence guard (unique message_id). The up-front filter
    // already excludes processed messages; this is the belt-and-suspenders.
    await db
      .insert(prospectAiActions)
      .values({
        prospectId: p.id,
        messageId: c.messageId,
        intent,
        confidence,
        quote,
        stageBefore: currentStage,
        stageAfter,
        status: outcome.status,
      })
      .onConflictDoNothing();
  }

  return summary;
}

/** Officer resolves a `pending_review` action: apply the proposed move, or dismiss. */
export async function resolveAiAction(
  { db }: ProspectsServiceDeps,
  actionId: string,
  decision: 'confirm' | 'dismiss',
  officer: string,
): Promise<void> {
  const [action] = await db
    .select()
    .from(prospectAiActions)
    .where(eq(prospectAiActions.id, actionId))
    .limit(1);
  if (!action || action.status !== 'pending_review') return;

  if (decision === 'confirm' && action.stageAfter) {
    const mapping = mapIntentToAxes(action.intent as ProspectIntent);
    await setProspectPipelineStage(
      { db },
      action.prospectId,
      action.stageAfter as PipelineStage,
      mapping.lostReason,
    );
  }
  await db
    .update(prospectAiActions)
    .set({
      status: decision === 'confirm' ? 'applied' : 'dismissed',
      resolvedBy: officer,
      resolvedAt: new Date(),
    })
    .where(eq(prospectAiActions.id, actionId));
}

/** Officer reverts an auto-applied move back to its exact prior stage. */
export async function revertAiAction(
  { db }: ProspectsServiceDeps,
  actionId: string,
  officer: string,
): Promise<void> {
  const [action] = await db
    .select()
    .from(prospectAiActions)
    .where(and(eq(prospectAiActions.id, actionId), eq(prospectAiActions.status, 'applied')))
    .limit(1);
  if (!action || !action.stageAfter) return;

  await setProspectPipelineStage(
    { db },
    action.prospectId,
    action.stageBefore as PipelineStage,
  );
  await db
    .update(prospectAiActions)
    .set({ status: 'reverted', resolvedBy: officer, resolvedAt: new Date() })
    .where(eq(prospectAiActions.id, actionId));
}

/** Recent AI actions for the audit view, newest first. */
export async function listAiActions(
  { db }: ProspectsServiceDeps,
  limit = 100,
) {
  return db
    .select()
    .from(prospectAiActions)
    .orderBy(desc(prospectAiActions.createdAt))
    .limit(limit);
}
