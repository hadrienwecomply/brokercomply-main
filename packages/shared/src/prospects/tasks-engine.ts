/**
 * Cadence → tasks materialization — pure planner.
 *
 * Decides which cadence-generated tasks SHOULD be open for a prospect right
 * now, from the same persisted facts the sequence machine reads. The service
 * layer reconciles this desired set with the actually-open rows (insert the
 * missing, cancel the stale) — so tasks appear when a step becomes due and
 * vanish by CANCELLATION (kept as history) when a reply / call / terminal
 * deal state makes them moot.
 *
 * DB-free and time-injected — fully unit-testable.
 */

import {
  DEFAULT_SEQUENCE_CONFIG,
  evaluateSequence,
  type SequenceConfig,
  type SequenceInput,
} from './sequence.js';
import type { PipelineStage } from './service.js';

/** Dedup key of a cadence-generated task (one open row per prospect+key). */
export type CadenceKey = 'offer_reminder' | 'offer_call' | 'no_show_rebook';

export interface DesiredCadenceTask {
  key: CadenceKey;
  title: string;
  /** When the step became/becomes due (drives sorting in the task list). */
  dueAt: Date | null;
}

/** The facts the planner reads — a projection of the prospect row. */
export interface TaskPlanInput extends SequenceInput {
  pipelineStage: PipelineStage;
  noShow: boolean;
  /** The (missed) demo slot — used as the due date of the re-booking task. */
  meetingDate: Date | null;
}

function addDays(from: Date, days: number): Date {
  return new Date(from.getTime() + days * 86_400_000);
}

/**
 * The cadence tasks that should be open for this prospect as of `now`.
 *
 * Rules:
 *  - A decided deal (won/lost) or an engaged prospect (replied) or a logged
 *    call (closed) has NO auto tasks — the officer drives from there.
 *  - Reminder due and not yet sent  → 'offer_reminder' (due at T0+7d).
 *  - Past the call mark             → 'offer_call' (due at T0+15d).
 *  - No-show flag set               → 'no_show_rebook' (due at the missed
 *    slot, else `now`), possibly alongside the offer tasks.
 */
export function planCadenceTasks(
  input: TaskPlanInput,
  now: Date,
  config: SequenceConfig = DEFAULT_SEQUENCE_CONFIG,
): DesiredCadenceTask[] {
  if (input.pipelineStage === 'won' || input.pipelineStage === 'lost') return [];

  const seq = evaluateSequence(input, now, config);
  if (seq.stage === 'replied' || seq.stage === 'closed') return [];

  const tasks: DesiredCadenceTask[] = [];

  if (seq.action.type === 'send_reminder') {
    tasks.push({
      key: 'offer_reminder',
      title: 'Relancer par e-mail — offre sans réponse (J+7)',
      dueAt: input.offerSentAt ? addDays(input.offerSentAt, config.reminderAfterDays) : now,
    });
  }

  if (seq.stage === 'to_call') {
    tasks.push({
      key: 'offer_call',
      title: "Appeler — rappel d'offre (J+15 sans réponse)",
      dueAt: input.offerSentAt ? addDays(input.offerSentAt, config.callAfterDays) : now,
    });
  }

  if (input.noShow) {
    tasks.push({
      key: 'no_show_rebook',
      title: 'Recaler la démo (no-show)',
      dueAt: input.meetingDate ?? now,
    });
  }

  return tasks;
}
