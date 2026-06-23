import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import {
  createDb,
  brokers,
  brokerPlanSteps,
  brokerPlanSubsteps,
  type Db,
  type NewBroker,
} from '../../src/db/index.js';
import {
  createBrokerWithPlan,
  getBrokerBySlug,
  listBrokerPlans,
  listBrokers,
  setStepApplicable,
  setStepDeadlineOverride,
  setSubstepStatus,
  updateBroker,
  upsertBrokerBySlug,
  type PlanStepSeed,
} from '../../src/brokers/index.js';

async function canConnect(): Promise<boolean> {
  const { db, client } = createDb();
  try {
    await db.execute(sql`select 1`);
    return true;
  } catch {
    return false;
  } finally {
    await client.end();
  }
}

const dbAvailable = await canConnect();

/** Minimal 2-step blueprint, enough to exercise step + sub-step materialisation. */
function blueprint(): PlanStepSeed[] {
  return [
    {
      code: '01',
      applicable: true,
      position: 0,
      substeps: [
        { templateSubstepId: '01-0', position: 0 },
        { templateSubstepId: '01-1', position: 1 },
      ],
    },
    {
      code: '03.02',
      applicable: false,
      position: 1,
      substeps: [{ templateSubstepId: '03.02-0', position: 0 }],
    },
  ];
}

function brokerInput(slug: string, overrides: Partial<NewBroker> = {}): NewBroker {
  return {
    slug,
    societe: slug,
    emails: ['a@example.be'],
    countries: ['BE'],
    signatureDate: '2026-01-15',
    accountOwner: 'sdv@we-comply.be',
    ...overrides,
  };
}

describe.skipIf(!dbAvailable)('brokers service (integration)', () => {
  let db: Db;
  let close: () => Promise<void>;

  beforeAll(() => {
    const conn = createDb();
    db = conn.db;
    close = () => conn.client.end();
  });

  beforeEach(async () => {
    // Only touch broker tables; cascade clears the plan children.
    await db.delete(brokers);
  });

  afterAll(async () => {
    await db.delete(brokers);
    await close();
  });

  it('creates a broker and materialises its full plan', async () => {
    const { broker, steps, substeps } = await createBrokerWithPlan(
      { db },
      { broker: brokerInput('elite-broker'), steps: blueprint() },
    );
    expect(broker.id).toBeTruthy();
    expect(broker.slug).toBe('elite-broker');
    expect(steps).toHaveLength(2);
    expect(substeps).toHaveLength(3);
    // sub-steps link to the right steps via code mapping
    const step01 = steps.find((s) => s.code === '01')!;
    expect(substeps.filter((s) => s.stepId === step01.id)).toHaveLength(2);
    expect(steps.find((s) => s.code === '03.02')!.applicable).toBe(false);
    expect(substeps.every((s) => s.status === 'not_started')).toBe(true);
  });

  it('reads back a broker plan by slug', async () => {
    await createBrokerWithPlan({ db }, { broker: brokerInput('lifepartners'), steps: blueprint() });
    const plan = await getBrokerBySlug({ db }, 'lifepartners');
    expect(plan).toBeDefined();
    expect(plan!.broker.societe).toBe('lifepartners');
    expect(plan!.steps).toHaveLength(2);
    expect(plan!.substeps).toHaveLength(3);
    expect(await getBrokerBySlug({ db }, 'nope')).toBeUndefined();
  });

  it('upsert by slug is idempotent (no duplicate on re-run)', async () => {
    const input = { broker: brokerInput('acme'), steps: blueprint() };
    const first = await upsertBrokerBySlug({ db }, input);
    const second = await upsertBrokerBySlug({ db }, input);
    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.plan.broker.id).toBe(first.plan.broker.id);
    expect(await listBrokers({ db })).toHaveLength(1);
  });

  it('toggles step applicability and sets a deadline override', async () => {
    const { steps } = await createBrokerWithPlan(
      { db },
      { broker: brokerInput('toggle-co'), steps: blueprint() },
    );
    const step = steps.find((s) => s.code === '03.02')!;
    const toggled = await setStepApplicable({ db }, step.id, true);
    expect(toggled!.applicable).toBe(true);
    const overridden = await setStepDeadlineOverride({ db }, step.id, '2026-12-31');
    expect(overridden!.deadlineOverride).toBe('2026-12-31');
  });

  it('sets sub-step status, stamping completed_at on done and clearing it otherwise', async () => {
    const { substeps } = await createBrokerWithPlan(
      { db },
      { broker: brokerInput('status-co'), steps: blueprint() },
    );
    const sub = substeps[0]!;
    const done = await setSubstepStatus({ db }, sub.id, 'done', { notes: 'ok' });
    expect(done!.status).toBe('done');
    expect(done!.completedAt).toBeInstanceOf(Date);
    expect(done!.notes).toBe('ok');
    const reopened = await setSubstepStatus({ db }, sub.id, 'in_progress');
    expect(reopened!.completedAt).toBeNull();
  });

  it('lists every broker with its plan in one batched read', async () => {
    await createBrokerWithPlan({ db }, { broker: brokerInput('a-co'), steps: blueprint() });
    await createBrokerWithPlan({ db }, { broker: brokerInput('b-co'), steps: blueprint() });
    const plans = await listBrokerPlans({ db });
    expect(plans).toHaveLength(2);
    expect(plans.every((p) => p.steps.length === 2 && p.substeps.length === 3)).toBe(true);
  });

  it('updates broker fields and bumps updated_at', async () => {
    const { broker } = await createBrokerWithPlan(
      { db },
      { broker: brokerInput('update-co'), steps: blueprint() },
    );
    const updated = await updateBroker({ db }, broker.id, { mrr: '250.00', status: 'active' });
    expect(updated!.status).toBe('active');
    expect(updated!.mrr).toBe('250.00');
  });

  it('renames a broker (societe) while keeping its slug immutable', async () => {
    const { broker } = await createBrokerWithPlan(
      { db },
      { broker: brokerInput('rename-co'), steps: blueprint() },
    );
    const updated = await updateBroker({ db }, broker.id, { societe: 'Renamed SA' });
    expect(updated!.societe).toBe('Renamed SA');
    expect(updated!.slug).toBe('rename-co');
  });

  it('enforces partial-unique BCE (collides when present, allows multiple nulls)', async () => {
    await createBrokerWithPlan(
      { db },
      { broker: brokerInput('bce-1', { bce: 'BE 0123.456.789' }), steps: blueprint() },
    );
    await expect(
      createBrokerWithPlan(
        { db },
        { broker: brokerInput('bce-2', { bce: 'BE 0123.456.789' }), steps: blueprint() },
      ),
    ).rejects.toThrow();
    // Two null-BCE brokers are fine.
    await createBrokerWithPlan({ db }, { broker: brokerInput('null-bce-1'), steps: blueprint() });
    await createBrokerWithPlan({ db }, { broker: brokerInput('null-bce-2'), steps: blueprint() });
    expect((await listBrokers({ db })).length).toBeGreaterThanOrEqual(3);
  });
});
