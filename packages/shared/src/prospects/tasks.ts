/**
 * Prospect tasks — the follow-up work items + activity history.
 *
 * Open tasks are the to-do list; done/cancelled tasks are the prospect's
 * history (never deleted). Facts live on `prospects`: completing a task
 * WRITES facts (called_at, outcome, funnel moves) — never the reverse.
 * Cadence-generated tasks are reconciled by `reconcileCadenceTasks` (called
 * from the tick) against the pure planner in `tasks-engine.ts`.
 */

import { and, asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import {
  prospects,
  prospectTasks,
  type NewProspectTask,
  type Prospect,
  type ProspectTask,
} from '../db/schema.js';
import type { ProspectsServiceDeps, TickSummary } from './service.js';
import {
  markProspectCalled,
  setProspectPipelineStage,
  tickProspects,
} from './service.js';
import { DEFAULT_SEQUENCE_CONFIG, type SequenceConfig } from './sequence.js';
import { planCadenceTasks, type TaskPlanInput } from './tasks-engine.js';

export type TaskType = 'call' | 'email' | 'meeting' | 'other';
export type TaskStatus = 'open' | 'done' | 'cancelled';

/** A board row: the task plus the agency it belongs to. */
export interface TaskWithProspect {
  task: ProspectTask;
  prospect: Prospect;
}

export interface CreateTaskInput {
  prospectId: string;
  title: string;
  type?: TaskType;
  dueAt?: Date | null;
  assignee?: string | null;
  notes?: string | null;
  source?: 'cadence' | 'manual' | 'ai';
  cadenceKey?: string | null;
  createdBy?: string | null;
}

export async function createTask(
  { db }: ProspectsServiceDeps,
  input: CreateTaskInput,
): Promise<ProspectTask> {
  const [row] = await db
    .insert(prospectTasks)
    .values({
      prospectId: input.prospectId,
      title: input.title.trim(),
      type: input.type ?? 'call',
      dueAt: input.dueAt ?? null,
      assignee: input.assignee ?? null,
      notes: input.notes ?? null,
      source: input.source ?? 'manual',
      cadenceKey: input.cadenceKey ?? null,
      createdBy: input.createdBy ?? null,
    })
    .returning();
  return row!;
}

export interface CompleteTaskInput {
  /** Per-type outcome slug (e.g. 'reachable' | 'callback' | 'not_interested'
   *  | 'signed' | 'rebooked' | 'no_answer' | 'done'). */
  outcome?: string;
  notes?: string;
  completedBy?: string | null;
  /** "À rappeler"-style follow-up created atomically with the completion. */
  followUp?: { title: string; dueAt: Date; assignee?: string | null; type?: TaskType };
  /** For 'rebooked': the new demo slot (also written to the prospect). */
  rebookedMeetingAt?: Date;
}

/** Call outcomes that write the cadence facts onto the prospect. */
const CALL_FACT_OUTCOMES = new Set(['reachable', 'callback', 'not_interested', 'signed']);

/**
 * Complete a task and apply its side effects on the prospect facts:
 *  - call outcomes log the call (closes the chase) and, for terminal ones,
 *    move the funnel (signed → won, not_interested → lost);
 *  - 'rebooked' clears the no-show flag and puts the deal back on
 *    demo_planned (+ new meeting date when given);
 *  - other open cadence tasks made moot by the new facts are cancelled
 *    eagerly (the tick would do it anyway).
 */
export async function completeTask(
  { db }: ProspectsServiceDeps,
  id: string,
  input: CompleteTaskInput = {},
): Promise<ProspectTask | null> {
  const [task] = await db
    .select()
    .from(prospectTasks)
    .where(eq(prospectTasks.id, id))
    .limit(1);
  if (!task || task.status !== 'open') return null;

  const now = new Date();
  const [updated] = await db
    .update(prospectTasks)
    .set({
      status: 'done',
      outcome: input.outcome ?? null,
      ...(input.notes?.trim() ? { notes: input.notes.trim() } : {}),
      completedBy: input.completedBy ?? null,
      completedAt: now,
      updatedAt: now,
    })
    .where(eq(prospectTasks.id, id))
    .returning();

  // --- side effects on the prospect facts --------------------------------
  if (task.type === 'call' && input.outcome && CALL_FACT_OUTCOMES.has(input.outcome)) {
    await markProspectCalled({ db }, task.prospectId, {
      outcome: input.outcome as 'reachable' | 'callback' | 'not_interested' | 'signed',
      calledAt: now,
    });
    if (input.outcome === 'signed') {
      await setProspectPipelineStage({ db }, task.prospectId, 'won');
    } else if (input.outcome === 'not_interested') {
      await setProspectPipelineStage({ db }, task.prospectId, 'lost', 'not_interested');
    }
    await cancelOpenCadenceTasks(db, task.prospectId, id);
  }

  // Completing the J+7 reminder task records the fact — without this the
  // planner would immediately re-create the task on the next tick.
  if (task.cadenceKey === 'offer_reminder' && input.outcome === 'sent') {
    await db
      .update(prospects)
      .set({ reminderSentAt: now, updatedAt: now })
      .where(eq(prospects.id, task.prospectId));
  }

  if (input.outcome === 'rebooked') {
    await db
      .update(prospects)
      .set({
        noShow: false,
        pipelineStage: 'demo_planned',
        ...(input.rebookedMeetingAt ? { meetingDate: input.rebookedMeetingAt } : {}),
        updatedAt: now,
      })
      .where(eq(prospects.id, task.prospectId));
  }

  if (input.followUp) {
    await createTask(
      { db },
      {
        prospectId: task.prospectId,
        title: input.followUp.title,
        type: input.followUp.type ?? 'call',
        dueAt: input.followUp.dueAt,
        assignee: input.followUp.assignee ?? task.assignee,
        createdBy: input.completedBy ?? null,
      },
    );
  }

  return updated ?? null;
}

/** Cancel the other open cadence tasks of a prospect (facts made them moot). */
async function cancelOpenCadenceTasks(
  db: Db,
  prospectId: string,
  exceptId: string,
): Promise<void> {
  await db
    .update(prospectTasks)
    .set({ status: 'cancelled', completedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(prospectTasks.prospectId, prospectId),
        eq(prospectTasks.status, 'open'),
        sql`${prospectTasks.cadenceKey} is not null`,
        sql`${prospectTasks.id} <> ${exceptId}`,
      ),
    );
}

/**
 * Undo a completion (the "↩ Annuler" of the task list): the task reopens and
 * the facts it wrote are reverted. Reverting is exact for the call facts
 * (called_at/outcome are cleared; the tick recomputes the stage) and
 * best-effort for the funnel: a terminal move made by THIS completion goes
 * back to 'offer_sent' — the stage an offer_call task implies by construction.
 */
export async function reopenTask(
  { db }: ProspectsServiceDeps,
  id: string,
): Promise<ProspectTask | null> {
  const [task] = await db
    .select()
    .from(prospectTasks)
    .where(eq(prospectTasks.id, id))
    .limit(1);
  if (!task || task.status !== 'done') return null;

  const now = new Date();
  const wasCallFacts = task.type === 'call' && task.outcome && CALL_FACT_OUTCOMES.has(task.outcome);

  if (wasCallFacts) {
    await db
      .update(prospects)
      .set({
        calledAt: null,
        outcome: null,
        ...(task.outcome === 'signed' || task.outcome === 'not_interested'
          ? { pipelineStage: 'offer_sent', lostReason: null }
          : {}),
        updatedAt: now,
      })
      .where(eq(prospects.id, task.prospectId));
  }
  if (task.outcome === 'rebooked') {
    await db
      .update(prospects)
      .set({ noShow: true, updatedAt: now })
      .where(eq(prospects.id, task.prospectId));
  }
  if (task.cadenceKey === 'offer_reminder' && task.outcome === 'sent') {
    await db
      .update(prospects)
      .set({ reminderSentAt: null, updatedAt: now })
      .where(eq(prospects.id, task.prospectId));
  }

  const [updated] = await db
    .update(prospectTasks)
    .set({
      status: 'open',
      outcome: null,
      completedAt: null,
      completedBy: null,
      updatedAt: now,
    })
    .where(eq(prospectTasks.id, id))
    .returning();
  return updated ?? null;
}

export async function cancelTask({ db }: ProspectsServiceDeps, id: string): Promise<void> {
  await db
    .update(prospectTasks)
    .set({ status: 'cancelled', completedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(prospectTasks.id, id), eq(prospectTasks.status, 'open')));
}

export async function reassignTask(
  { db }: ProspectsServiceDeps,
  id: string,
  assignee: string | null,
): Promise<void> {
  await db
    .update(prospectTasks)
    .set({ assignee, updatedAt: new Date() })
    .where(eq(prospectTasks.id, id));
}

export async function setTaskDue(
  { db }: ProspectsServiceDeps,
  id: string,
  dueAt: Date | null,
): Promise<void> {
  await db
    .update(prospectTasks)
    .set({ dueAt, updatedAt: new Date() })
    .where(eq(prospectTasks.id, id));
}

/** Every OPEN task with its agency, soonest due first (null due last). */
export async function listOpenTasks({
  db,
}: ProspectsServiceDeps): Promise<TaskWithProspect[]> {
  const rows = await db
    .select({ task: prospectTasks, prospect: prospects })
    .from(prospectTasks)
    .innerJoin(prospects, eq(prospectTasks.prospectId, prospects.id))
    .where(eq(prospectTasks.status, 'open'))
    .orderBy(sql`${prospectTasks.dueAt} asc nulls last`, asc(prospectTasks.createdAt));
  return rows;
}

/** Tasks completed/cancelled in the last `days` days (the "done" strip). */
export async function listRecentlyClosedTasks(
  { db }: ProspectsServiceDeps,
  days = 7,
): Promise<TaskWithProspect[]> {
  return db
    .select({ task: prospectTasks, prospect: prospects })
    .from(prospectTasks)
    .innerJoin(prospects, eq(prospectTasks.prospectId, prospects.id))
    .where(
      and(
        inArray(prospectTasks.status, ['done', 'cancelled']),
        sql`${prospectTasks.completedAt} >= now() - make_interval(days => ${days})`,
      ),
    )
    .orderBy(desc(prospectTasks.completedAt));
}

/** Full task list of one prospect: open first (by due), then history (recent first). */
export async function listProspectTasks(
  { db }: ProspectsServiceDeps,
  prospectId: string,
): Promise<ProspectTask[]> {
  return db
    .select()
    .from(prospectTasks)
    .where(eq(prospectTasks.prospectId, prospectId))
    .orderBy(
      sql`case when ${prospectTasks.status} = 'open' then 0 else 1 end`,
      sql`${prospectTasks.dueAt} asc nulls last`,
      desc(prospectTasks.completedAt),
    );
}

export interface ReconcileSummary {
  created: number;
  cancelled: number;
}

/**
 * Make the open cadence tasks match the pure planner for every prospect:
 * insert the missing steps, cancel the stale ones (reply/call/terminal deal
 * made them moot). Idempotent — safe to run on every tick.
 */
export async function reconcileCadenceTasks(
  { db }: ProspectsServiceDeps,
  now: Date = new Date(),
  config: SequenceConfig = DEFAULT_SEQUENCE_CONFIG,
): Promise<ReconcileSummary> {
  const allProspects = await db.select().from(prospects);
  const openCadence = await db
    .select()
    .from(prospectTasks)
    .where(
      and(eq(prospectTasks.status, 'open'), sql`${prospectTasks.cadenceKey} is not null`),
    );

  const openByProspect = new Map<string, ProspectTask[]>();
  for (const t of openCadence) {
    const list = openByProspect.get(t.prospectId) ?? [];
    list.push(t);
    openByProspect.set(t.prospectId, list);
  }

  const summary: ReconcileSummary = { created: 0, cancelled: 0 };

  for (const p of allProspects) {
    const desired = planCadenceTasks(toPlanInput(p), now, config);
    const desiredKeys = new Set(desired.map((d) => d.key));
    const open = openByProspect.get(p.id) ?? [];
    const openKeys = new Set(open.map((t) => t.cadenceKey));

    for (const t of open) {
      if (!desiredKeys.has(t.cadenceKey as never)) {
        await cancelTask({ db }, t.id);
        summary.cancelled++;
      }
    }
    for (const d of desired) {
      if (!openKeys.has(d.key)) {
        await db
          .insert(prospectTasks)
          .values({
            prospectId: p.id,
            title: d.title,
            type: d.key === 'offer_reminder' ? 'email' : 'call',
            dueAt: d.dueAt,
            source: 'cadence',
            cadenceKey: d.key,
          } satisfies NewProspectTask)
          .onConflictDoNothing();
        summary.created++;
      }
    }
  }

  return summary;
}

/**
 * The daily follow-up pass: recompute every cadence stage, then materialize /
 * cancel the cadence tasks accordingly. This is what the manual "Recalculer"
 * button and the n8n cron (P5) call.
 */
export async function runFollowupTick(
  deps: ProspectsServiceDeps,
  now: Date = new Date(),
  config: SequenceConfig = DEFAULT_SEQUENCE_CONFIG,
): Promise<TickSummary & { tasks: ReconcileSummary }> {
  const tick = await tickProspects(deps, now, config);
  const tasks = await reconcileCadenceTasks(deps, now, config);
  return { ...tick, tasks };
}

function toPlanInput(p: Prospect): TaskPlanInput {
  return {
    offerSentAt: p.offerSentAt,
    lastReplyAt: p.lastReplyAt,
    reminderSentAt: p.reminderSentAt,
    calledAt: p.calledAt,
    pipelineStage: p.pipelineStage as TaskPlanInput['pipelineStage'],
    noShow: p.noShow,
    meetingDate: p.meetingDate,
  };
}
