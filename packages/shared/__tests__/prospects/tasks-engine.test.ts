import { describe, expect, it } from 'vitest';
import { planCadenceTasks, type TaskPlanInput } from '../../src/prospects/tasks-engine.js';

const T0 = new Date('2026-06-01T09:00:00.000Z');
const DAY = 86_400_000;
const at = (days: number) => new Date(T0.getTime() + days * DAY);

function base(over: Partial<TaskPlanInput> = {}): TaskPlanInput {
  return {
    offerSentAt: T0,
    lastReplyAt: null,
    reminderSentAt: null,
    calledAt: null,
    pipelineStage: 'offer_sent',
    noShow: false,
    meetingDate: null,
    ...over,
  };
}

const keys = (input: TaskPlanInput, now: Date) =>
  planCadenceTasks(input, now).map((t) => t.key);

describe('planCadenceTasks — offer chase', () => {
  it('no task while waiting inside the reply window', () => {
    expect(keys(base(), at(3))).toEqual([]);
  });

  it('reminder task once J+7 passed and not sent', () => {
    const tasks = planCadenceTasks(base(), at(8));
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({ key: 'offer_reminder' });
    expect(tasks[0].dueAt).toEqual(at(7));
  });

  it('no reminder task once the reminder went out', () => {
    expect(keys(base({ reminderSentAt: at(7) }), at(10))).toEqual([]);
  });

  it('call task once J+15 passed (reminder task gone)', () => {
    const tasks = planCadenceTasks(base({ reminderSentAt: at(7) }), at(16));
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({ key: 'offer_call' });
    expect(tasks[0].dueAt).toEqual(at(15));
  });

  it('past J+15 with reminder never sent → only the call task', () => {
    expect(keys(base(), at(20))).toEqual(['offer_call']);
  });
});

describe('planCadenceTasks — facts that clear the auto tasks', () => {
  it('a reply cancels everything', () => {
    expect(keys(base({ lastReplyAt: at(9) }), at(16))).toEqual([]);
  });

  it('a logged call cancels everything', () => {
    expect(keys(base({ calledAt: at(16) }), at(20))).toEqual([]);
  });

  it('a decided deal (won/lost) has no auto tasks, even a no-show', () => {
    expect(keys(base({ pipelineStage: 'won', noShow: true }), at(16))).toEqual([]);
    expect(keys(base({ pipelineStage: 'lost', noShow: true }), at(16))).toEqual([]);
  });
});

describe('planCadenceTasks — no-show re-booking', () => {
  it('a no-show gets a rebook task due at the missed slot', () => {
    const missed = at(-2);
    const tasks = planCadenceTasks(
      base({ offerSentAt: null, pipelineStage: 'demo_planned', noShow: true, meetingDate: missed }),
      at(0),
    );
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({ key: 'no_show_rebook', dueAt: missed });
  });

  it('rebook falls back to now when no meeting date is known', () => {
    const now = at(1);
    const tasks = planCadenceTasks(
      base({ offerSentAt: null, pipelineStage: 'demo_planned', noShow: true }),
      now,
    );
    expect(tasks[0].dueAt).toEqual(now);
  });

  it('a no-show who also hit the offer call mark gets BOTH tasks', () => {
    const k = keys(base({ noShow: true, meetingDate: at(-1) }), at(16));
    expect(k).toEqual(['offer_call', 'no_show_rebook']);
  });

  it('a no-show who replied gets nothing (conversation engaged)', () => {
    expect(keys(base({ noShow: true, lastReplyAt: at(1) }), at(16))).toEqual([]);
  });
});
