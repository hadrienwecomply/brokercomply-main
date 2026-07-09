import { asc, eq, getTableColumns, inArray, isNull, sql } from 'drizzle-orm';
import {
  brokers,
  brokerPlanSteps,
  brokerPlanSubsteps,
  planStepOffsets,
  planTaskTemplates,
  type Broker,
  type BrokerPlanStep,
  type BrokerPlanSubstep,
  type Db,
  type NewBroker,
  type NewPlanStepOffset,
  type NewPlanTaskTemplate,
  type PlanStepOffset,
  type PlanTaskTemplate,
} from '../db/index.js';

/** A live transaction handle, so service fns compose inside an outer transaction. */
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

export interface BrokersServiceDeps {
  db: Db | Tx;
}

/** Blueprint for materialising a broker's plan (built from the global template). */
export interface SubstepSeed {
  /** Stable key to code-side static content (supports/actions); null for custom. */
  contentKey: string | null;
  title?: string | null;
  emailSubject?: string | null;
  emailBody?: string | null;
  isCustom?: boolean;
  dueDate?: string | null;
  position: number;
  status?: string;
}
export interface PlanStepSeed {
  code: string;
  applicable: boolean;
  position: number;
  deadlineOverride?: string | null;
  substeps: SubstepSeed[];
}

/** A broker plus its persisted plan rows. Static content is merged in the app layer. */
export interface BrokerPlan {
  broker: Broker;
  steps: BrokerPlanStep[];
  substeps: BrokerPlanSubstep[];
}

function groupBy<T, K>(rows: T[], key: (r: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>();
  for (const row of rows) {
    const k = key(row);
    const bucket = map.get(k);
    if (bucket) bucket.push(row);
    else map.set(k, [row]);
  }
  return map;
}

async function loadPlan({ db }: BrokersServiceDeps, broker: Broker): Promise<BrokerPlan> {
  const steps = await db
    .select()
    .from(brokerPlanSteps)
    .where(eq(brokerPlanSteps.brokerId, broker.id));
  const stepIds = steps.map((s) => s.id);
  const substeps = stepIds.length
    ? await db.select().from(brokerPlanSubsteps).where(inArray(brokerPlanSubsteps.stepId, stepIds))
    : [];
  return { broker, steps, substeps };
}

/**
 * Broker columns for portfolio/list reads, with the heavy `logo_base64` blob
 * replaced by a presence marker ('1' | null). List views only ever need to know
 * whether a logo exists; the full bytes are loaded on the detail read
 * (`getBrokerBySlug` / `getBrokerById`) and served by the logo route.
 */
function brokerListColumns() {
  const { logoBase64: _omit, ...rest } = getTableColumns(brokers);
  return {
    ...rest,
    logoBase64: sql<string | null>`case when ${brokers.logoBase64} is not null then '1' else null end`,
  };
}

/** All brokers (flat rows, no plan). Logo bytes elided — see brokerListColumns. */
export async function listBrokers({ db }: BrokersServiceDeps): Promise<Broker[]> {
  return db.select(brokerListColumns()).from(brokers);
}

/** Every broker with its plan, in one batched read (portfolio / actions cockpit). */
export async function listBrokerPlans({ db }: BrokersServiceDeps): Promise<BrokerPlan[]> {
  const all = await db.select(brokerListColumns()).from(brokers);
  if (!all.length) return [];
  const [allSteps, allSubsteps] = await Promise.all([
    db.select().from(brokerPlanSteps),
    db.select().from(brokerPlanSubsteps),
  ]);
  const stepsByBroker = groupBy(allSteps, (s) => s.brokerId);
  const subsByStep = groupBy(allSubsteps, (s) => s.stepId);
  return all.map((broker) => {
    const steps = stepsByBroker.get(broker.id) ?? [];
    const substeps = steps.flatMap((s) => subsByStep.get(s.id) ?? []);
    return { broker, steps, substeps };
  });
}

export async function getBrokerBySlug(
  { db }: BrokersServiceDeps,
  slug: string,
): Promise<BrokerPlan | undefined> {
  const [broker] = await db.select().from(brokers).where(eq(brokers.slug, slug));
  return broker ? loadPlan({ db }, broker) : undefined;
}

export async function getBrokerById(
  { db }: BrokersServiceDeps,
  id: string,
): Promise<BrokerPlan | undefined> {
  const [broker] = await db.select().from(brokers).where(eq(brokers.id, id));
  return broker ? loadPlan({ db }, broker) : undefined;
}

/**
 * Insert a broker and materialise its full plan (all steps + sub-steps) atomically.
 * Caller supplies the blueprint derived from the plan template.
 */
export async function createBrokerWithPlan(
  { db }: BrokersServiceDeps,
  input: { broker: NewBroker; steps: PlanStepSeed[] },
): Promise<BrokerPlan> {
  return db.transaction(async (tx) => {
    const [broker] = await tx.insert(brokers).values(input.broker).returning();
    if (!broker) throw new Error('Failed to insert broker');

    const stepRows = input.steps.length
      ? await tx
          .insert(brokerPlanSteps)
          .values(
            input.steps.map((s) => ({
              brokerId: broker.id,
              code: s.code,
              applicable: s.applicable,
              deadlineOverride: s.deadlineOverride ?? null,
              position: s.position,
            })),
          )
          .returning()
      : [];

    const idByCode = new Map(stepRows.map((r) => [r.code, r.id]));
    const subValues = input.steps.flatMap((s) => {
      const stepId = idByCode.get(s.code);
      if (!stepId) return [];
      return s.substeps.map((ss) => ({
        stepId,
        contentKey: ss.contentKey,
        title: ss.title ?? null,
        emailSubject: ss.emailSubject ?? null,
        emailBody: ss.emailBody ?? null,
        isCustom: ss.isCustom ?? false,
        dueDate: ss.dueDate ?? null,
        status: ss.status ?? 'not_started',
        position: ss.position,
      }));
    });
    const subRows = subValues.length
      ? await tx.insert(brokerPlanSubsteps).values(subValues).returning()
      : [];

    return { broker, steps: stepRows, substeps: subRows };
  });
}

/** Postgres unique-violation SQLSTATE (used to make the upsert race-safe). */
function isUniqueViolation(e: unknown): boolean {
  return typeof e === 'object' && e !== null && 'code' in e && (e as { code?: string }).code === '23505';
}

/**
 * Idempotent seed/create by slug. Attempts the insert and, on a unique-violation
 * (a concurrent create won the race, or the slug already exists), falls back to
 * returning the existing broker. Race-safe, unlike a check-then-insert.
 */
export async function upsertBrokerBySlug(
  deps: BrokersServiceDeps,
  input: { broker: NewBroker; steps: PlanStepSeed[] },
): Promise<{ plan: BrokerPlan; created: boolean }> {
  if (!input.broker.slug) throw new Error('slug is required to upsert a broker');
  try {
    const plan = await createBrokerWithPlan(deps, input);
    return { plan, created: true };
  } catch (e) {
    if (isUniqueViolation(e)) {
      const existing = await getBrokerBySlug(deps, input.broker.slug);
      if (existing) return { plan: existing, created: false };
    }
    throw e;
  }
}

/** Mutable broker columns (excludes generated id/timestamps). */
export type BrokerPatch = Partial<Omit<NewBroker, 'id' | 'slug' | 'createdAt' | 'updatedAt'>>;

export async function updateBroker(
  { db }: BrokersServiceDeps,
  id: string,
  fields: BrokerPatch,
): Promise<Broker | undefined> {
  const [row] = await db
    .update(brokers)
    .set({ ...fields, updatedAt: new Date() })
    .where(eq(brokers.id, id))
    .returning();
  return row;
}

export async function setStepApplicable(
  { db }: BrokersServiceDeps,
  stepId: string,
  applicable: boolean,
): Promise<BrokerPlanStep | undefined> {
  const [row] = await db
    .update(brokerPlanSteps)
    .set({ applicable })
    .where(eq(brokerPlanSteps.id, stepId))
    .returning();
  return row;
}

export async function setStepDeadlineOverride(
  { db }: BrokersServiceDeps,
  stepId: string,
  deadlineOverride: string | null,
): Promise<BrokerPlanStep | undefined> {
  const [row] = await db
    .update(brokerPlanSteps)
    .set({ deadlineOverride })
    .where(eq(brokerPlanSteps.id, stepId))
    .returning();
  return row;
}

export interface SubstepStatusPatch {
  notes?: string | null;
  /** Explicit completion timestamp; defaults to now() when status becomes 'done'. */
  completedAt?: Date | null;
}

/**
 * Update a sub-step's status. `completed_at` is set to now() on transition to
 * 'done' (unless explicitly provided) and cleared otherwise.
 */
export async function setSubstepStatus(
  { db }: BrokersServiceDeps,
  substepId: string,
  status: string,
  patch: SubstepStatusPatch = {},
): Promise<BrokerPlanSubstep | undefined> {
  const completedAt =
    patch.completedAt !== undefined ? patch.completedAt : status === 'done' ? new Date() : null;
  const fields: Partial<BrokerPlanSubstep> = { status, completedAt };
  if (patch.notes !== undefined) fields.notes = patch.notes;
  const [row] = await db
    .update(brokerPlanSubsteps)
    .set(fields)
    .where(eq(brokerPlanSubsteps.id, substepId))
    .returning();
  return row;
}

/**
 * Bulk-reset the plan status of the given brokers to a clean baseline: every
 * sub-step back to `not_started` (clearing completion + notes) and every section
 * deadline override cleared. Used by the Notion import so that sections Notion
 * does not cover end up as `not_started` rather than keeping stale values.
 */
export async function resetBrokerPlanStatuses(
  { db }: BrokersServiceDeps,
  brokerIds: string[],
): Promise<void> {
  if (!brokerIds.length) return;
  const steps = await db
    .select({ id: brokerPlanSteps.id })
    .from(brokerPlanSteps)
    .where(inArray(brokerPlanSteps.brokerId, brokerIds));
  const stepIds = steps.map((s) => s.id);
  if (stepIds.length) {
    await db
      .update(brokerPlanSubsteps)
      .set({ status: 'not_started', completedAt: null, notes: null })
      .where(inArray(brokerPlanSubsteps.stepId, stepIds));
  }
  await db
    .update(brokerPlanSteps)
    .set({ deadlineOverride: null })
    .where(inArray(brokerPlanSteps.brokerId, brokerIds));
}

// ---------------------------------------------------------------------------
// Global plan template (editable) — section offsets + default task list.
// ---------------------------------------------------------------------------

export interface PlanGlobals {
  offsets: PlanStepOffset[];
  tasks: PlanTaskTemplate[];
}

/** Load the global template: section offsets + non-archived default tasks, ordered. */
export async function getPlanGlobals({ db }: BrokersServiceDeps): Promise<PlanGlobals> {
  const [offsets, tasks] = await Promise.all([
    db.select().from(planStepOffsets).orderBy(asc(planStepOffsets.position)),
    db
      .select()
      .from(planTaskTemplates)
      .where(isNull(planTaskTemplates.archivedAt))
      .orderBy(asc(planTaskTemplates.position)),
  ]);
  return { offsets, tasks };
}

/**
 * Idempotently seed the global template. Section offsets are upserted by code
 * (existing edits kept); default tasks are inserted only when the table is empty
 * (UUID PKs make re-seeding non-idempotent otherwise).
 */
export async function seedPlanGlobals(
  { db }: BrokersServiceDeps,
  input: { offsets: NewPlanStepOffset[]; tasks: NewPlanTaskTemplate[] },
): Promise<void> {
  if (input.offsets.length) {
    await db.insert(planStepOffsets).values(input.offsets).onConflictDoNothing();
  }
  const existing = await db.select({ id: planTaskTemplates.id }).from(planTaskTemplates).limit(1);
  if (existing.length === 0 && input.tasks.length) {
    await db.insert(planTaskTemplates).values(input.tasks);
  }
}

export async function updateStepOffset(
  { db }: BrokersServiceDeps,
  code: string,
  offsetDays: number,
): Promise<PlanStepOffset | undefined> {
  const [row] = await db
    .update(planStepOffsets)
    .set({ offsetDays })
    .where(eq(planStepOffsets.code, code))
    .returning();
  return row;
}

export interface TaskTemplatePatch {
  title?: string;
  emailSubject?: string | null;
  emailBody?: string | null;
}

export async function addTaskTemplate(
  { db }: BrokersServiceDeps,
  stepCode: string,
  fields: TaskTemplatePatch & { position?: number },
): Promise<PlanTaskTemplate | undefined> {
  const [row] = await db
    .insert(planTaskTemplates)
    .values({
      stepCode,
      title: fields.title ?? 'Nouvelle tâche',
      emailSubject: fields.emailSubject ?? null,
      emailBody: fields.emailBody ?? null,
      contentKey: null,
      position: fields.position ?? 9999,
    })
    .returning();
  return row;
}

export async function updateTaskTemplate(
  { db }: BrokersServiceDeps,
  id: string,
  patch: TaskTemplatePatch,
): Promise<PlanTaskTemplate | undefined> {
  const fields: Partial<NewPlanTaskTemplate> = {};
  if (patch.title !== undefined) fields.title = patch.title;
  if (patch.emailSubject !== undefined) fields.emailSubject = patch.emailSubject;
  if (patch.emailBody !== undefined) fields.emailBody = patch.emailBody;
  const [row] = await db
    .update(planTaskTemplates)
    .set(fields)
    .where(eq(planTaskTemplates.id, id))
    .returning();
  return row;
}

export async function archiveTaskTemplate(
  { db }: BrokersServiceDeps,
  id: string,
  at: Date = new Date(),
): Promise<void> {
  await db.update(planTaskTemplates).set({ archivedAt: at }).where(eq(planTaskTemplates.id, id));
}

/** Re-set `position` to the given order (templates of a single section). */
export async function reorderTaskTemplates(
  { db }: BrokersServiceDeps,
  orderedIds: string[],
): Promise<void> {
  await db.transaction(async (tx) => {
    for (let i = 0; i < orderedIds.length; i++) {
      await tx
        .update(planTaskTemplates)
        .set({ position: i })
        .where(eq(planTaskTemplates.id, orderedIds[i]!));
    }
  });
}

// ---------------------------------------------------------------------------
// Per-broker tasks (forked) — add / edit / archive / reorder.
// ---------------------------------------------------------------------------

export interface SubstepContentPatch {
  title?: string | null;
  emailSubject?: string | null;
  emailBody?: string | null;
  dueDate?: string | null;
}

export async function addBrokerSubstep(
  { db }: BrokersServiceDeps,
  stepId: string,
  fields: SubstepContentPatch & { position?: number },
): Promise<BrokerPlanSubstep | undefined> {
  const [row] = await db
    .insert(brokerPlanSubsteps)
    .values({
      stepId,
      contentKey: null,
      title: fields.title ?? 'Nouvelle tâche',
      emailSubject: fields.emailSubject ?? null,
      emailBody: fields.emailBody ?? null,
      dueDate: fields.dueDate ?? null,
      isCustom: true,
      status: 'not_started',
      position: fields.position ?? 9999,
    })
    .returning();
  return row;
}

export async function updateBrokerSubstep(
  { db }: BrokersServiceDeps,
  substepId: string,
  patch: SubstepContentPatch,
): Promise<BrokerPlanSubstep | undefined> {
  const fields: Partial<BrokerPlanSubstep> = {};
  if (patch.title !== undefined) fields.title = patch.title;
  if (patch.emailSubject !== undefined) fields.emailSubject = patch.emailSubject;
  if (patch.emailBody !== undefined) fields.emailBody = patch.emailBody;
  if (patch.dueDate !== undefined) fields.dueDate = patch.dueDate;
  const [row] = await db
    .update(brokerPlanSubsteps)
    .set(fields)
    .where(eq(brokerPlanSubsteps.id, substepId))
    .returning();
  return row;
}

export async function archiveBrokerSubstep(
  { db }: BrokersServiceDeps,
  substepId: string,
  at: Date = new Date(),
): Promise<void> {
  await db.update(brokerPlanSubsteps).set({ archivedAt: at }).where(eq(brokerPlanSubsteps.id, substepId));
}

/** Re-set `position` to the given order (sub-steps of a single step). */
export async function reorderBrokerSubsteps(
  { db }: BrokersServiceDeps,
  orderedIds: string[],
): Promise<void> {
  await db.transaction(async (tx) => {
    for (let i = 0; i < orderedIds.length; i++) {
      await tx
        .update(brokerPlanSubsteps)
        .set({ position: i })
        .where(eq(brokerPlanSubsteps.id, orderedIds[i]!));
    }
  });
}
