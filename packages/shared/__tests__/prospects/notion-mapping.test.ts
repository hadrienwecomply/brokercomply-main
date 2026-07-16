import { describe, expect, it } from 'vitest';
import {
  mapNotionLead,
  mapSuiviToCadence,
} from '../../src/prospects/notion-mapping.js';

describe('mapNotionLead — funnel tags', () => {
  it('maps each numbered tag to its stage', () => {
    expect(mapNotionLead(['7. To contact ⏱️'], null).pipelineStage).toBe('to_contact');
    expect(mapNotionLead(['6. Contacted 📩'], null).pipelineStage).toBe('contacted');
    expect(mapNotionLead(['5. Démo planifiée ✍️'], null).pipelineStage).toBe('demo_planned');
    expect(mapNotionLead(['4. Démo done 👊'], null).pipelineStage).toBe('demo_done');
    expect(mapNotionLead(['3. Offre à envoyer 👀'], null).pipelineStage).toBe('offer_to_send');
    expect(mapNotionLead(['2. Offer send ✅'], null).pipelineStage).toBe('offer_sent');
    expect(mapNotionLead(['1. Closed 🎉'], null).pipelineStage).toBe('won');
  });

  it('takes the most advanced tag when several are present', () => {
    const m = mapNotionLead(['6. Contacted 📩', '2. Offer send ✅'], null);
    expect(m.pipelineStage).toBe('offer_sent');
    expect(m.needsReview).toBe(false);
  });

  it('ignores free markers (events, synergies) for the stage', () => {
    const m = mapNotionLead(['Event GACI', 'Synergie', '2. Offer send ✅'], null);
    expect(m.pipelineStage).toBe('offer_sent');
  });

  it('defaults to to_contact when no usable tag exists', () => {
    expect(mapNotionLead([], null).pipelineStage).toBe('to_contact');
    expect(mapNotionLead(['Event GACI'], null).pipelineStage).toBe('to_contact');
  });
});

describe('mapNotionLead — lost outcomes', () => {
  it('routes each lost variant to its reason', () => {
    expect(mapNotionLead(['PAS INTERESSÉ - COLD CALL'], null)).toMatchObject({
      pipelineStage: 'lost',
      lostReason: 'not_interested',
    });
    expect(mapNotionLead(['Mauvaise cible'], null).lostReason).toBe('wrong_target');
    expect(mapNotionLead(['Faux numéro du père'], null).lostReason).toBe('unreachable');
    expect(mapNotionLead(['Lost 😒'], null).lostReason).toBe('other');
    expect(mapNotionLead(['Lost'], null).lostReason).toBe('other');
  });

  it('lets a specific reason beat a plain Lost tag', () => {
    const m = mapNotionLead(['Lost', 'Mauvaise cible'], null);
    expect(m.lostReason).toBe('wrong_target');
  });

  it('refines plain lost with the suivi LOST (budget)', () => {
    const m = mapNotionLead(['Lost 😒'], 'LOST (budget)');
    expect(m).toMatchObject({ pipelineStage: 'lost', lostReason: 'budget' });
  });

  it('marks lost even when a funnel tag is present (where it died)', () => {
    const m = mapNotionLead(['2. Offer send ✅', 'PAS INTERESSÉ - COLD CALL'], null);
    expect(m.pipelineStage).toBe('lost');
    expect(m.lostReason).toBe('not_interested');
    expect(m.needsReview).toBe(false);
  });

  it('flags won+lost as contradictory: keeps won, needs review', () => {
    const m = mapNotionLead(['1. Closed 🎉', 'Lost 😒'], null);
    expect(m.pipelineStage).toBe('won');
    expect(m.lostReason).toBeNull();
    expect(m.needsReview).toBe(true);
  });

  it('INJOIGNABLE suivi refines a plain lost to unreachable', () => {
    const m = mapNotionLead(['Lost'], 'INJOIGNABLE');
    expect(m.lostReason).toBe('unreachable');
  });

  it('INJOIGNABLE alone is NOT lost (still chased)', () => {
    const m = mapNotionLead(['2. Offer send ✅'], 'INJOIGNABLE');
    expect(m.pipelineStage).toBe('offer_sent');
    expect(m.lostReason).toBeNull();
  });
});

describe('mapNotionLead — no-show & reach markers', () => {
  it('no-show sets the flag and implies demo_planned', () => {
    const m = mapNotionLead(['No Show 💔'], null);
    expect(m.noShow).toBe(true);
    expect(m.pipelineStage).toBe('demo_planned');
  });

  it('no-show keeps a more advanced funnel tag', () => {
    const m = mapNotionLead(['No Show 💔', '4. Démo done 👊'], null);
    expect(m.noShow).toBe(true);
    expect(m.pipelineStage).toBe('demo_done');
  });

  it('cold-call / reply markers imply at least contacted', () => {
    expect(mapNotionLead(['NO RESPONSE - COLD CALL'], null).pipelineStage).toBe('contacted');
    expect(mapNotionLead(['Répondu - Suivi à faire'], null).pipelineStage).toBe('contacted');
    expect(mapNotionLead(['Occupe il me recall'], null).pipelineStage).toBe('contacted');
    expect(mapNotionLead(['Relancé post e-mail'], null).pipelineStage).toBe('contacted');
  });
});

describe('mapSuiviToCadence', () => {
  const T = new Date('2026-05-10T00:00:00.000Z');

  it('RELANCE n → reminder already sent', () => {
    expect(mapSuiviToCadence('RELANCE 1', T).reminderSentAt).toEqual(T);
    expect(mapSuiviToCadence('RELANCE 3', T).reminderSentAt).toEqual(T);
  });

  it('RESPONDED → reply on record', () => {
    expect(mapSuiviToCadence('RESPONDED', T).lastReplyAt).toEqual(T);
  });

  it('CALLED → call already logged', () => {
    expect(mapSuiviToCadence('CALLED', T).calledAt).toEqual(T);
  });

  it('yields nothing without a date or for unknown values', () => {
    expect(mapSuiviToCadence('RELANCE 1', null)).toEqual({
      reminderSentAt: null,
      lastReplyAt: null,
      calledAt: null,
    });
    expect(mapSuiviToCadence('A RAPPELER !', T)).toEqual({
      reminderSentAt: null,
      lastReplyAt: null,
      calledAt: null,
    });
    expect(mapSuiviToCadence(null, T).calledAt).toBeNull();
  });
});
