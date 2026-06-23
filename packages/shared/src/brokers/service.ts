import { eq, inArray } from 'drizzle-orm';
import {
  brokers,
  brokerPlanSteps,
  brokerPlanSubsteps,
  type Broker,
  type BrokerPlanStep,
  type BrokerPlanSubstep,
  type Db,
  type NewBroker,
} from '../db/index.js';

/** A live transaction handle, so service fns compose inside an outer transaction. */
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

export interface BrokersServiceDeps {
  db: Db | Tx;
}

/** Blueprint for materialising a broker's plan (built from the dashboard template). */
export interface SubstepSeed {
  templateSubstepId: string;
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

/** All brokers (flat rows, no plan). */
export async function listBrokers({ db }: BrokersServiceDeps): Promise<Broker[]> {
  return db.select().from(brokers);
}

/** Every broker with its plan, in one batched read (portfolio / actions cockpit). */
export async function listBrokerPlans({ db }: BrokersServiceDeps): Promise<BrokerPlan[]> {
  const all = await db.select().from(brokers);
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
        templateSubstepId: ss.templateSubstepId,
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
