import { describe, expect, it } from 'vitest';
import {
  PUB_CATALOG,
  PUB_CHECK_BY_ID,
  PUB_SECTIONS,
  checksForPass,
} from '../../src/pub-audit/catalog.js';

describe('pub catalog', () => {
  it('has unique check ids', () => {
    const ids = PUB_CATALOG.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('assigns every check to exactly one pass (disjoint coverage)', () => {
    const a = new Set(PUB_CATALOG.filter((c) => c.pass === 'A').map((c) => c.id));
    const b = new Set(PUB_CATALOG.filter((c) => c.pass === 'B').map((c) => c.id));
    const c = new Set(PUB_CATALOG.filter((c) => c.pass === 'C').map((c) => c.id));
    for (const id of a) expect(b.has(id) || c.has(id)).toBe(false);
    for (const id of b) expect(c.has(id)).toBe(false);
    expect(a.size + b.size + c.size).toBe(PUB_CATALOG.length);
  });

  it('every check section is a known section label', () => {
    for (const c of PUB_CATALOG) expect(PUB_SECTIONS).toContain(c.section);
  });

  it('by-id lookup is complete', () => {
    for (const c of PUB_CATALOG) expect(PUB_CHECK_BY_ID[c.id]).toBe(c);
  });

  it('checksForPass filters by qualified products', () => {
    // Pure notoriety → no product checks in pass B.
    expect(checksForPass('B', ['notoriete'])).toHaveLength(0);
    // Conso ad → pass B has C-series checks, no H/A.
    const consoB = checksForPass('B', ['credit_conso']);
    expect(consoB.length).toBeGreaterThan(0);
    expect(consoB.every((c) => c.id.startsWith('C'))).toBe(true);
    // Pass A always applies (general checks) regardless of product.
    expect(checksForPass('A', ['notoriete']).length).toBeGreaterThan(0);
  });
});
