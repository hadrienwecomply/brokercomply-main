import { describe, expect, it } from 'vitest';
import { pubPdfPayload } from '../../src/pub-audit/assemble.js';
import type { PubAuditPayload, PubConstat } from '../../src/pub-audit/types.js';

const constat = (
  over: Partial<PubConstat> & { id: string; verdict: PubConstat['verdict'] },
): PubConstat => ({
  intitule: 'x',
  type: 'mention_obligatoire',
  citation: null,
  ...over,
});

const payloadWith = (constats: PubConstat[]): PubAuditPayload => ({
  support: { fichier: 'ad.png', format: 'flyer', produits: ['assurance'], elements_fournis: ['visuel'] },
  dateAnalyse: '2026-07-15',
  description: 'desc',
  niveauGlobal: {
    code: 'rouge',
    libelle: 'x',
    decompte: { non_conforme: 2, a_verifier: 1, conforme: 3, non_applicable: 1 },
  },
  constats,
});

describe('pubPdfPayload (PDF shows only non-conformities)', () => {
  it('keeps only non_conforme constats', () => {
    const payload = payloadWith([
      constat({ id: 'G1', verdict: 'non_conforme' }),
      constat({ id: 'G2', verdict: 'a_verifier' }),
      constat({ id: 'G3', verdict: 'conforme' }),
      constat({ id: 'G4', verdict: 'non_applicable' }),
      constat({ id: 'G5', verdict: 'non_conforme' }),
    ]);
    const out = pubPdfPayload(payload);
    expect(out.constats.map((c) => c.id)).toEqual(['G1', 'G5']);
  });

  it('leaves niveauGlobal (banner + decompte) untouched as an honest summary', () => {
    const payload = payloadWith([constat({ id: 'G1', verdict: 'non_conforme' })]);
    const out = pubPdfPayload(payload);
    expect(out.niveauGlobal).toEqual(payload.niveauGlobal);
  });

  it('yields an empty constat list for a jaune report (only a_verifier)', () => {
    const payload = payloadWith([
      constat({ id: 'G2', verdict: 'a_verifier' }),
      constat({ id: 'G3', verdict: 'conforme' }),
    ]);
    expect(pubPdfPayload(payload).constats).toEqual([]);
  });

  it('does not mutate the input payload', () => {
    const payload = payloadWith([
      constat({ id: 'G1', verdict: 'non_conforme' }),
      constat({ id: 'G2', verdict: 'conforme' }),
    ]);
    pubPdfPayload(payload);
    expect(payload.constats).toHaveLength(2);
  });
});
