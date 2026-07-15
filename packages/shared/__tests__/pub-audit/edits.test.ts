import { describe, expect, it } from 'vitest';
import { assemblePubPayload } from '../../src/pub-audit/assemble.js';
import {
  applyPubEdits,
  diffPubEdits,
  extractPubFeedback,
  normalizePubText,
} from '../../src/pub-audit/edits.js';
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

  it('applies a_verifier_ou and commentaire but never correction_note', () => {
    const out = applyPubEdits(basePayload(), {
      constats: {
        G1: { a_verifier_ou: 'profil de la page', commentaire: 'ok', correction_note: 'secret' },
      },
    });
    const g1 = out.constats.find((c) => c.id === 'G1')!;
    expect(g1.a_verifier_ou).toBe('profil de la page');
    expect(g1.commentaire).toBe('ok');
    // correction_note is internal — it must not leak onto the deliverable constat.
    expect((g1 as Record<string, unknown>).correction_note).toBeUndefined();
  });
});

describe('diffPubEdits', () => {
  it('keeps only changed fields and drops whitespace-only changes', () => {
    const payload = basePayload();
    const delta = diffPubEdits(payload, {
      header: { description: 'Texte de la pub.  ', disclaimer: 'Nouveau' },
      constats: {
        C5b: { verdict: 'non_conforme', reformulation: 'r' }, // unchanged → dropped
        G1: { explication: 'ajout' }, // changed → kept
      },
    });
    expect(delta.header?.description).toBeUndefined(); // only trailing spaces differ
    expect(delta.header?.disclaimer).toBe('Nouveau');
    expect(delta.constats?.C5b).toBeUndefined();
    expect(delta.constats?.G1).toEqual({ explication: 'ajout' });
  });

  it('preserves correction_note even with no other change', () => {
    const payload = basePayload();
    const delta = diffPubEdits(payload, {
      constats: { C5b: { verdict: 'a_verifier', correction_note: 'label suffit' } },
    });
    expect(delta.constats?.C5b).toEqual({ verdict: 'a_verifier', correction_note: 'label suffit' });
  });

  it('a delta replays identically through applyPubEdits', () => {
    const payload = basePayload();
    const full = { constats: { C5b: { verdict: 'non_applicable' as const, reformulation: 'r' } } };
    const delta = diffPubEdits(payload, full);
    expect(applyPubEdits(payload, delta).niveauGlobal.code).toBe(
      applyPubEdits(payload, full).niveauGlobal.code,
    );
  });
});

describe('extractPubFeedback', () => {
  it('captures verdict flips (with note) and reformulation rewrites', () => {
    const payload = basePayload();
    const rows = extractPubFeedback(payload, {
      constats: {
        C5b: { verdict: 'a_verifier', correction_note: 'sponsorisé' },
        G1: { reformulation: 'meilleure formulation' },
      },
    });
    const verdict = rows.find((r) => r.field === 'verdict')!;
    expect(verdict).toMatchObject({
      checkId: 'C5b',
      valueLlm: 'non_conforme',
      valueOfficer: 'a_verifier',
      correctionNote: 'sponsorisé',
    });
    const reform = rows.find((r) => r.field === 'reformulation')!;
    expect(reform).toMatchObject({ checkId: 'G1', valueOfficer: 'meilleure formulation', correctionNote: null });
  });

  it('ignores unchanged verdicts and empty reformulations', () => {
    const payload = basePayload();
    const rows = extractPubFeedback(payload, {
      constats: { C5b: { verdict: 'non_conforme', reformulation: '   ' } },
    });
    expect(rows).toEqual([]);
  });
});

describe('normalizePubText', () => {
  it('collapses nbsp and trims', () => {
    expect(normalizePubText('a\u00a0b  ')).toBe('a b');
    expect(normalizePubText(null)).toBe('');
  });
});
