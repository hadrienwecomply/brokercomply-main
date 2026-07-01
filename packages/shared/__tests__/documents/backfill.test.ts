import { describe, expect, it } from 'vitest';
import { decideBackfillAction, type BackfillFacts } from '../../src/documents/backfill.js';

const base: BackfillFacts = {
  alreadyLinked: false,
  autoPath: '01 - Clients/Acme',
  autoExists: false,
};

describe('decideBackfillAction', () => {
  it('skips brokers that are already linked', () => {
    expect(decideBackfillAction({ ...base, alreadyLinked: true })).toEqual({
      kind: 'skip',
      reason: 'already linked',
    });
  });

  it('links a mapped path that exists', () => {
    const a = decideBackfillAction({ ...base, mappedPath: 'X/Acme', mappedExists: true });
    expect(a).toEqual({ kind: 'link', path: 'X/Acme' });
  });

  it('errors (never creates) when the mapped path is missing', () => {
    const a = decideBackfillAction({ ...base, mappedPath: 'X/Acme', mappedExists: false });
    expect(a).toMatchObject({ kind: 'error', path: 'X/Acme' });
  });

  it('errors on a mapped path already used by another broker', () => {
    const a = decideBackfillAction({
      ...base,
      mappedPath: 'X/Acme',
      mappedExists: true,
      conflictBroker: 'other-broker',
    });
    expect(a).toMatchObject({ kind: 'error' });
    expect((a as { reason: string }).reason).toContain('other-broker');
  });

  it('links an auto-named folder that already exists (no duplicate)', () => {
    const a = decideBackfillAction({ ...base, autoExists: true });
    expect(a).toEqual({ kind: 'link', path: '01 - Clients/Acme' });
  });

  it('creates the auto-named folder when absent and no near-match', () => {
    const a = decideBackfillAction({ ...base, autoExists: false });
    expect(a).toEqual({ kind: 'create', path: '01 - Clients/Acme' });
  });

  it('refuses to create (errors) when a fuzzy near-match folder exists', () => {
    const a = decideBackfillAction({
      ...base,
      autoExists: false,
      nearMatchName: 'CAMBIER & EVRARD',
    });
    expect(a).toMatchObject({ kind: 'error', path: '01 - Clients/Acme' });
    expect((a as { reason: string }).reason).toContain('CAMBIER & EVRARD');
  });

  it('errors on an auto path already used by another broker', () => {
    const a = decideBackfillAction({ ...base, autoExists: true, conflictBroker: 'other' });
    expect(a).toMatchObject({ kind: 'error', path: '01 - Clients/Acme' });
  });
});
