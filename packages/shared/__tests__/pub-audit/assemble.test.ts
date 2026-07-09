import { describe, expect, it } from 'vitest';
import { assemblePubPayload, computeNiveau } from '../../src/pub-audit/assemble.js';
import { PubAuditPayloadSchema, type PubConstat, type PubQualification } from '../../src/pub-audit/types.js';

const qualif = (produits: PubQualification['produits']): PubQualification => ({
  format: 'flyer',
  produits,
  elements_fournis: ['visuel'],
  transcription: 'Empruntez malin, taux imbattable !',
});

const constat = (over: Partial<PubConstat> & { id: string; verdict: PubConstat['verdict']; type: PubConstat['type'] }): PubConstat => ({
  intitule: 'x',
  citation: null,
  ...over,
});

describe('computeNiveau (skill étape 3)', () => {
  it('rouge when a prohibition is non_conforme', () => {
    const n = computeNiveau([
      constat({ id: 'C5b', verdict: 'non_conforme', type: 'interdiction' }),
      constat({ id: 'G1', verdict: 'non_conforme', type: 'mention_obligatoire' }),
    ]);
    expect(n.code).toBe('rouge');
  });

  it('orange when only a mandatory mention is missing', () => {
    const n = computeNiveau([
      constat({ id: 'C1', verdict: 'non_conforme', type: 'mention_obligatoire' }),
      constat({ id: 'G2', verdict: 'a_verifier', type: 'mention_obligatoire' }),
    ]);
    expect(n.code).toBe('orange');
  });

  it('jaune when only a_verifier remain', () => {
    const n = computeNiveau([constat({ id: 'G3', verdict: 'a_verifier', type: 'mention_obligatoire' })]);
    expect(n.code).toBe('jaune');
  });

  it('vert when everything is conforme / non_applicable', () => {
    const n = computeNiveau([
      constat({ id: 'G1', verdict: 'conforme', type: 'mention_obligatoire' }),
      constat({ id: 'C1', verdict: 'non_applicable', type: 'mention_obligatoire' }),
    ]);
    expect(n.code).toBe('vert');
    expect(n.decompte).toEqual({ non_conforme: 0, a_verifier: 0, conforme: 1, non_applicable: 1 });
  });
});

describe('assemblePubPayload', () => {
  it('enriches raw constats with catalog metadata and validates against schema', () => {
    const payload = assemblePubPayload({
      qualification: qualif(['credit_conso']),
      rawConstats: [
        { id: 'G1', verdict: 'conforme', citation: '« Courtier SA »' },
        { id: 'C1', verdict: 'non_conforme', citation: 'Aucun slogan', reformulation: 'Ajouter le slogan.' },
      ],
      fileName: 'pub.png',
      dateAnalyse: '2026-07-09',
    });
    const g1 = payload.constats.find((c) => c.id === 'G1')!;
    expect(g1.intitule).toBe("Nom de l'intermédiaire"); // from catalog, not LLM
    expect(g1.base_legale).toContain('CDE');
    expect(() => PubAuditPayloadSchema.parse(payload)).not.toThrow();
  });

  it('fills applicable-but-unanalysed checks with a_verifier', () => {
    const payload = assemblePubPayload({
      qualification: qualif(['credit_conso']),
      rawConstats: [{ id: 'C1', verdict: 'conforme' }],
      fileName: 'pub.png',
      dateAnalyse: '2026-07-09',
    });
    const c3 = payload.constats.find((c) => c.id === 'C3')!;
    expect(c3.verdict).toBe('a_verifier');
  });

  it('ignores out-of-scope constats (hypo check on a conso-only ad)', () => {
    const payload = assemblePubPayload({
      qualification: qualif(['credit_conso']),
      rawConstats: [{ id: 'H5', verdict: 'non_conforme' }],
      fileName: 'pub.png',
      dateAnalyse: '2026-07-09',
    });
    expect(payload.constats.find((c) => c.id === 'H5')).toBeUndefined();
  });

  it('dedups a repeated id keeping the most severe verdict', () => {
    const payload = assemblePubPayload({
      qualification: qualif(['credit_conso']),
      rawConstats: [
        { id: 'G8', verdict: 'conforme' },
        { id: 'G8', verdict: 'non_conforme', citation: '« taux imbattable »' },
      ],
      fileName: 'pub.png',
      dateAnalyse: '2026-07-09',
    });
    const g8 = payload.constats.find((c) => c.id === 'G8')!;
    expect(g8.verdict).toBe('non_conforme');
    expect(payload.niveauGlobal.code).toBe('rouge'); // G8 is a prohibition
  });
});
