import { describe, expect, it } from 'vitest';
import { assemblePubPayload } from '../../src/pub-audit/assemble.js';
import { applyPubEdits } from '../../src/pub-audit/edits.js';
import type { PubQualification } from '../../src/pub-audit/types.js';

const qualification: PubQualification = {
  format: 'flyer',
  produits: ['credit_conso'],
  elements_fournis: ['visuel'],
  transcription: 'Texte de la pub.',
};

function basePayload() {
  return assemblePubPayload({
    qualification,
    rawConstats: [
      { id: 'C5b', verdict: 'non_conforme', citation: '« argent en 24h »', reformulation: 'r' },
      { id: 'G1', verdict: 'conforme' },
    ],
    fileName: 'pub.png',
    dateAnalyse: '2026-07-09',
  });
}

describe('applyPubEdits', () => {
  it('applies header and constat edits', () => {
    const out = applyPubEdits(basePayload(), {
      header: { description: 'Nouvelle description', disclaimer: 'D' },
      constats: { G1: { explication: 'edited' } },
    });
    expect(out.description).toBe('Nouvelle description');
    expect(out.disclaimer).toBe('D');
    expect(out.constats.find((c) => c.id === 'G1')!.explication).toBe('edited');
  });

  it('recomputes the global level when a verdict changes', () => {
    const payload = basePayload();
    expect(payload.niveauGlobal.code).toBe('rouge'); // C5b prohibition
    const out = applyPubEdits(payload, {
      constats: { C5b: { verdict: 'non_applicable' } },
    });
    // Only conforme/na/a_verifier remain → no longer rouge.
    expect(out.niveauGlobal.code).not.toBe('rouge');
  });

  it('ignores unknown constat ids', () => {
    const out = applyPubEdits(basePayload(), { constats: { ZZZ: { explication: 'x' } } });
    expect(out.constats.find((c) => c.id === 'ZZZ')).toBeUndefined();
  });

  it('throws on malformed edits', () => {
    expect(() => applyPubEdits(basePayload(), { constats: { G1: { verdict: 'bogus' } } })).toThrow();
  });
});
