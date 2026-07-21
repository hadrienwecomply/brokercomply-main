import { describe, expect, it } from 'vitest';
import {
  mapIntentToAxes,
  wouldMoveFunnel,
  PROSPECT_INTENTS,
  type ProspectIntent,
} from '../../src/prospects/intent-mapping.js';
import type { PipelineStage } from '../../src/prospects/service.js';

describe('mapIntentToAxes — funnel semantics', () => {
  it('covers all seven intents', () => {
    for (const i of PROSPECT_INTENTS) {
      expect(() => mapIntentToAxes(i)).not.toThrow();
    }
    expect(PROSPECT_INTENTS).toHaveLength(7);
  });

  it('advancing intents are non-terminal and use the low bar', () => {
    for (const i of ['interested', 'meeting_booked'] as ProspectIntent[]) {
      const m = mapIntentToAxes(i);
      expect(m.terminal).toBe(false);
      expect(m.tier).toBe('advance');
      expect(m.targetStage).toBeTruthy();
    }
  });

  it('closing intents are terminal and use the high bar', () => {
    for (const i of ['not_interested', 'unreachable', 'converted'] as ProspectIntent[]) {
      const m = mapIntentToAxes(i);
      expect(m.terminal).toBe(true);
      expect(m.tier).toBe('close');
    }
  });

  it('lost intents carry a reason; won does not', () => {
    expect(mapIntentToAxes('not_interested')).toMatchObject({
      targetStage: 'lost',
      lostReason: 'not_interested',
    });
    expect(mapIntentToAxes('unreachable')).toMatchObject({
      targetStage: 'lost',
      lostReason: 'unreachable',
    });
    expect(mapIntentToAxes('converted')).toMatchObject({
      targetStage: 'won',
      lostReason: null,
    });
  });

  it('no_reply moves nothing and schedules nothing', () => {
    expect(mapIntentToAxes('no_reply')).toMatchObject({
      targetStage: null,
      tier: 'none',
      schedulesCallback: false,
    });
  });

  it('later schedules a callback and does not move the funnel', () => {
    expect(mapIntentToAxes('later')).toMatchObject({
      targetStage: null,
      schedulesCallback: true,
      tier: 'none',
    });
  });
});

describe('wouldMoveFunnel — never downgrade, never reopen', () => {
  const advance = mapIntentToAxes('interested'); // → contacted
  const demo = mapIntentToAxes('meeting_booked'); // → demo_planned
  const lost = mapIntentToAxes('not_interested'); // terminal
  const won = mapIntentToAxes('converted'); // terminal

  it('an advance applies only when strictly further down the funnel', () => {
    expect(wouldMoveFunnel(advance, 'to_contact')).toBe(true); // 0 → 1
    expect(wouldMoveFunnel(advance, 'contacted')).toBe(false); // 1 → 1, no-op
    expect(wouldMoveFunnel(advance, 'offer_sent')).toBe(false); // 5 → 1, downgrade blocked
    expect(wouldMoveFunnel(demo, 'contacted')).toBe(true); // 1 → 2
  });

  it('a terminal close applies from any non-terminal stage', () => {
    expect(wouldMoveFunnel(lost, 'to_contact')).toBe(true);
    expect(wouldMoveFunnel(lost, 'offer_sent')).toBe(true);
    expect(wouldMoveFunnel(won, 'demo_done')).toBe(true);
  });

  it('a settled deal is never reopened by the classifier', () => {
    for (const settled of ['won', 'lost'] as PipelineStage[]) {
      expect(wouldMoveFunnel(advance, settled)).toBe(false);
      expect(wouldMoveFunnel(lost, settled)).toBe(false);
      expect(wouldMoveFunnel(won, settled)).toBe(false);
    }
  });

  it('no-move intents never move', () => {
    expect(wouldMoveFunnel(mapIntentToAxes('no_reply'), 'to_contact')).toBe(false);
    expect(wouldMoveFunnel(mapIntentToAxes('later'), 'contacted')).toBe(false);
  });
});
