import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SEQUENCE_CONFIG,
  evaluateSequence,
  type SequenceInput,
} from '../../src/prospects/sequence.js';

const T0 = new Date('2026-06-01T09:00:00.000Z');
const DAY = 86_400_000;
const at = (days: number) => new Date(T0.getTime() + days * DAY);

/** A fresh prospect: offer sent at T0, nothing else happened. */
function base(over: Partial<SequenceInput> = {}): SequenceInput {
  return {
    offerSentAt: T0,
    lastReplyAt: null,
    reminderSentAt: null,
    calledAt: null,
    ...over,
  };
}

describe('evaluateSequence — reply cancels the chase', () => {
  it('marks replied when a reply lands after the offer', () => {
    const res = evaluateSequence(base({ lastReplyAt: at(3) }), at(10));
    expect(res.stage).toBe('replied');
    expect(res.action).toEqual({ type: 'none' });
    expect(res.dueAt).toBeNull();
  });

  it('ignores a reply dated before the offer (stale thread)', () => {
    const res = evaluateSequence(base({ lastReplyAt: at(-2) }), at(2));
    expect(res.stage).toBe('awaiting_reply');
    expect(res.action).toEqual({ type: 'none' });
  });

  it('treats a reply with no offer on record as in-conversation', () => {
    const res = evaluateSequence(
      base({ offerSentAt: null, lastReplyAt: at(1) }),
      at(5),
    );
    expect(res.stage).toBe('replied');
  });

  it('replied wins even past the call mark', () => {
    const res = evaluateSequence(base({ lastReplyAt: at(8) }), at(20));
    expect(res.stage).toBe('replied');
  });
});

describe('evaluateSequence — reminder at +7d', () => {
  it('waits for the reminder mark inside the reply window', () => {
    const res = evaluateSequence(base(), at(3));
    expect(res.stage).toBe('awaiting_reply');
    expect(res.action).toEqual({ type: 'none' });
    expect(res.dueAt).toEqual(at(7));
  });

  it('flags the reminder due exactly at +7d, without sending', () => {
    const res = evaluateSequence(base(), at(7));
    expect(res.stage).toBe('awaiting_reply');
    expect(res.action).toEqual({ type: 'send_reminder' });
    expect(res.dueAt).toEqual(at(15));
  });

  it('keeps flagging the reminder while unsent (idempotent)', () => {
    const res = evaluateSequence(base(), at(9));
    expect(res.action).toEqual({ type: 'send_reminder' });
  });

  it('moves to reminded once the reminder is sent', () => {
    const res = evaluateSequence(base({ reminderSentAt: at(7) }), at(9));
    expect(res.stage).toBe('reminded');
    expect(res.action).toEqual({ type: 'none' });
    expect(res.dueAt).toEqual(at(15));
  });
});

describe('evaluateSequence — call at +15d', () => {
  it('adds to the call-list at +15d after a sent reminder', () => {
    const res = evaluateSequence(base({ reminderSentAt: at(7) }), at(15));
    expect(res.stage).toBe('to_call');
    expect(res.action).toEqual({ type: 'add_to_call_list' });
    expect(res.dueAt).toBeNull();
  });

  it('still surfaces the call at +15d even if the reminder was never sent', () => {
    const res = evaluateSequence(base(), at(16));
    expect(res.stage).toBe('to_call');
    expect(res.action).toEqual({ type: 'add_to_call_list' });
  });

  it('closes the sequence once the call is logged', () => {
    const res = evaluateSequence(
      base({ reminderSentAt: at(7), calledAt: at(16) }),
      at(16),
    );
    expect(res.stage).toBe('closed');
    expect(res.action).toEqual({ type: 'none' });
    expect(res.dueAt).toBeNull();
  });
});

describe('evaluateSequence — edge cases', () => {
  it('does nothing when no offer has been sent', () => {
    const res = evaluateSequence(base({ offerSentAt: null }), at(30));
    expect(res.stage).toBe('awaiting_reply');
    expect(res.action).toEqual({ type: 'none' });
    expect(res.dueAt).toBeNull();
  });

  it('honours a custom cadence config', () => {
    const res = evaluateSequence(base(), at(4), {
      reminderAfterDays: 3,
      callAfterDays: 10,
    });
    expect(res.action).toEqual({ type: 'send_reminder' });
  });

  it('exposes sane defaults', () => {
    expect(DEFAULT_SEQUENCE_CONFIG).toEqual({ reminderAfterDays: 7, callAfterDays: 15 });
  });
});
