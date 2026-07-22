import { describe, expect, it } from 'vitest';
import {
  decideIntentOutcome,
  DEFAULT_INTENT_THRESHOLDS,
} from '../../src/prospects/intent-bridge.js';
import { mapIntentToAxes } from '../../src/prospects/intent-mapping.js';

const interested = mapIntentToAxes('interested'); // advance, bar 0.75
const notInterested = mapIntentToAxes('not_interested'); // close, bar 0.92
const later = mapIntentToAxes('later'); // schedules callback
const noReply = mapIntentToAxes('no_reply'); // no move

describe('decideIntentOutcome — thresholds by move type', () => {
  it('advance applies at or above the advance bar', () => {
    expect(decideIntentOutcome(interested, 0.75, 'to_contact', false).status).toBe('applied');
    expect(decideIntentOutcome(interested, 0.74, 'to_contact', false).status).toBe(
      'pending_review',
    );
  });

  it('a close needs the high bar even when very confident-looking', () => {
    // 0.8 clears advance but NOT close — a terminal move waits for review.
    expect(decideIntentOutcome(notInterested, 0.8, 'offer_sent', false).status).toBe(
      'pending_review',
    );
    expect(decideIntentOutcome(notInterested, 0.92, 'offer_sent', false).status).toBe('applied');
  });
});

describe('decideIntentOutcome — the human always wins', () => {
  it('blocks an otherwise-confident auto-move into review', () => {
    const auto = decideIntentOutcome(notInterested, 0.99, 'offer_sent', false);
    const blocked = decideIntentOutcome(notInterested, 0.99, 'offer_sent', true);
    expect(auto.status).toBe('applied');
    expect(blocked.status).toBe('pending_review');
    // The proposed target is still recorded so the officer can confirm it.
    expect(blocked.stageAfter).toBe('lost');
  });

  it('blocks a later callback too', () => {
    expect(decideIntentOutcome(later, 0.95, 'contacted', true).status).toBe('pending_review');
    expect(decideIntentOutcome(later, 0.95, 'contacted', false)).toMatchObject({
      status: 'applied',
      scheduleCallback: true,
    });
  });
});

describe('decideIntentOutcome — no-op cases', () => {
  it('no_reply never acts', () => {
    expect(decideIntentOutcome(noReply, 1, 'to_contact', false).status).toBe('noop');
  });

  it('an advance already satisfied is a no-op, not a downgrade', () => {
    // interested → contacted, but the prospect is already at offer_sent.
    const o = decideIntentOutcome(interested, 0.99, 'offer_sent', false);
    expect(o.status).toBe('noop');
    expect(o.stageAfter).toBeNull();
  });

  it('a settled deal is never reopened', () => {
    expect(decideIntentOutcome(interested, 1, 'won', false).status).toBe('noop');
    expect(decideIntentOutcome(notInterested, 1, 'lost', false).status).toBe('noop');
  });
});

describe('decideIntentOutcome — carries the target for the audit log', () => {
  it('applied advance records the stage it moved to', () => {
    expect(decideIntentOutcome(interested, 0.8, 'to_contact', false)).toMatchObject({
      status: 'applied',
      stageAfter: 'contacted',
      scheduleCallback: false,
    });
  });

  it('respects a custom threshold set', () => {
    const strict = { ...DEFAULT_INTENT_THRESHOLDS, advance: 0.99 };
    expect(decideIntentOutcome(interested, 0.9, 'to_contact', false, strict).status).toBe(
      'pending_review',
    );
  });
});
