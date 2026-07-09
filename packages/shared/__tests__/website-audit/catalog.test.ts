import { describe, expect, it } from 'vitest';
import { AUDIT_CATALOG } from '../../src/website-audit/catalog.js';
import { getRecoMatrix } from '../../src/website-audit/agent.js';

/**
 * The catalog (what the checkers verify) and the matrix (how findings are
 * levelled and worded) must stay in lockstep: a check that exists on one side
 * only would silently produce findings with no recommendation, or dead matrix
 * entries.
 */
describe('catalog ↔ recommandations matrix consistency', () => {
  const matrix = getRecoMatrix();
  const matrixPointIds = new Set(matrix.sections.flatMap((s) => s.sousSections));
  const catalogPointIds = new Set(AUDIT_CATALOG.map((p) => p.id));

  it('covers exactly the same analysis points', () => {
    expect([...catalogPointIds].sort()).toEqual([...matrixPointIds].sort());
    expect([...catalogPointIds].sort()).toEqual(Object.keys(matrix.sousSections).sort());
  });

  it('covers exactly the same atomic checks per point', () => {
    for (const point of AUDIT_CATALOG) {
      const matrixChecks = Object.keys(matrix.sousSections[point.id]?.checks ?? {}).sort();
      const catalogChecks = point.sousPoints.map((sp) => sp.id).sort();
      expect(catalogChecks, `checks of ${point.id}`).toEqual(matrixChecks);
    }
  });

  it('every matrix combination references known checks', () => {
    for (const [pid, meta] of Object.entries(matrix.sousSections)) {
      const known = new Set(Object.keys(meta.checks ?? {}));
      for (const comb of meta.combinaisons ?? []) {
        for (const id of comb.manquants) {
          expect(known.has(id), `${pid} combination references ${id}`).toBe(true);
        }
      }
    }
  });

  it('sub-point ids are prefixed by their point id', () => {
    for (const point of AUDIT_CATALOG) {
      for (const sp of point.sousPoints) {
        expect(sp.id.startsWith(`${point.id}.`), sp.id).toBe(true);
      }
    }
  });
});
