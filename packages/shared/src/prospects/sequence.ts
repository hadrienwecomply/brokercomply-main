/**
 * Commercial follow-up cadence — pure state machine.
 *
 * Cadence (per prospect, from the offer send date T0):
 *   T0            offer sent
 *   T0 + 7 days   no reply  → e-mail reminder
 *   T0 + 15 days  no reply  → CALL (surfaced on the call-list)
 *
 * Transversal rule: any inbound reply dated after the offer cancels every
 * remaining step. A logged call closes the sequence.
 *
 * This module is intentionally DB-free and time-injected (`now` is a parameter)
 * so the whole cadence is unit-testable without Postgres, Graph, or n8n. The
 * service layer reads/writes rows; here we only decide the stage + next action.
 */

/** Cadence stage. Stored on the prospect row, kept current by the daily tick. */
export type ProspectStage =
  | 'awaiting_reply'
  | 'reminded'
  | 'to_call'
  | 'replied'
  | 'closed';

/** What the tick should do now for a prospect, on top of updating its stage. */
export type SequenceAction =
  /** Nothing due. */
  | { type: 'none' }
  /**
   * The +7d reminder is due. In this phase we only FLAG it (the actual send is a
   * 1-click officer-validated draft, built later); leaving the stage at
   * 'awaiting_reply' until `reminderSentAt` is set makes re-flagging idempotent.
   */
  | { type: 'send_reminder' }
  /** The +15d mark passed with no reply — put the prospect on the call-list. */
  | { type: 'add_to_call_list' };

export interface SequenceConfig {
  /** Days after the offer before the reminder is due. */
  reminderAfterDays: number;
  /** Days after the offer before the prospect must be called. */
  callAfterDays: number;
}

/** Default cadence: reminder at +7d, call at +15d. */
export const DEFAULT_SEQUENCE_CONFIG: SequenceConfig = {
  reminderAfterDays: 7,
  callAfterDays: 15,
};

/** The persisted facts the cadence reads — a projection of the prospect row. */
export interface SequenceInput {
  /** T0. Null when no offer has gone out yet (nothing to chase). */
  offerSentAt: Date | null;
  /** Last inbound reply, whenever it happened. Only replies after T0 count. */
  lastReplyAt: Date | null;
  /** When the reminder was actually sent, or null if not (yet) sent. */
  reminderSentAt: Date | null;
  /** When the call was logged, or null. Presence closes the sequence. */
  calledAt: Date | null;
}

export interface SequenceResult {
  /** The stage the prospect should be in as of `now`. */
  stage: ProspectStage;
  /** The action due right now (idempotent to re-evaluate). */
  action: SequenceAction;
  /**
   * When the next transition is due, for scheduling / `next_action_at`. Null when
   * the sequence is terminal (replied/closed) or there is nothing to wait for.
   */
  dueAt: Date | null;
}

function addDays(from: Date, days: number): Date {
  return new Date(from.getTime() + days * 86_400_000);
}

/**
 * Decide a prospect's cadence stage, the action due now, and the next due time.
 *
 * Priority of rules (first match wins):
 *  1. Replied after the offer → terminal 'replied'.
 *  2. Call logged            → terminal 'closed'.
 *  3. No offer sent          → idle 'awaiting_reply', nothing due.
 *  4. Past the call mark      → 'to_call' (flag once).
 *  5. Reminder already sent   → 'reminded', waiting for the call mark.
 *  6. Past the reminder mark   → still 'awaiting_reply', reminder due.
 *  7. Otherwise               → 'awaiting_reply', waiting for the reminder mark.
 */
export function evaluateSequence(
  input: SequenceInput,
  now: Date,
  config: SequenceConfig = DEFAULT_SEQUENCE_CONFIG,
): SequenceResult {
  const { offerSentAt, lastReplyAt, reminderSentAt, calledAt } = input;

  // 1. A reply dated at/after the offer cancels the whole chase.
  if (offerSentAt && lastReplyAt && lastReplyAt.getTime() >= offerSentAt.getTime()) {
    return { stage: 'replied', action: { type: 'none' }, dueAt: null };
  }
  // A reply with no offer on record still means "in conversation" → replied.
  if (!offerSentAt && lastReplyAt) {
    return { stage: 'replied', action: { type: 'none' }, dueAt: null };
  }

  // 2. A logged call closes the sequence regardless of timing.
  if (calledAt) {
    return { stage: 'closed', action: { type: 'none' }, dueAt: null };
  }

  // 3. Without an offer there is nothing to chase yet.
  if (!offerSentAt) {
    return { stage: 'awaiting_reply', action: { type: 'none' }, dueAt: null };
  }

  const reminderDueAt = addDays(offerSentAt, config.reminderAfterDays);
  const callDueAt = addDays(offerSentAt, config.callAfterDays);

  // 4. Past the call mark: surface on the call-list (flag only on entry).
  if (now.getTime() >= callDueAt.getTime()) {
    return { stage: 'to_call', action: { type: 'add_to_call_list' }, dueAt: null };
  }

  // 5. Reminder already sent: waiting for the call mark.
  if (reminderSentAt) {
    return { stage: 'reminded', action: { type: 'none' }, dueAt: callDueAt };
  }

  // 6. Past the reminder mark but not yet sent: reminder is due now.
  if (now.getTime() >= reminderDueAt.getTime()) {
    return { stage: 'awaiting_reply', action: { type: 'send_reminder' }, dueAt: callDueAt };
  }

  // 7. Still within the reply window: wait for the reminder mark.
  return { stage: 'awaiting_reply', action: { type: 'none' }, dueAt: reminderDueAt };
}
