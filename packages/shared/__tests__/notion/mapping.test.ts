import { describe, expect, it } from 'vitest';
import { mapNotionStatus, parseStepCode } from '../../src/notion/index.js';

describe('parseStepCode', () => {
  it('extracts a two-digit section code', () => {
    expect(parseStepCode('01 - Validation plan d’action')).toBe('01');
    expect(parseStepCode('06 - Enregistrement goAML')).toBe('06');
  });
  it('extracts a dotted sub-section code', () => {
    expect(parseStepCode('03.01 - Remédiation AML')).toBe('03.01');
    expect(parseStepCode('05.02 - Recyclage RGPD')).toBe('05.02');
  });
  it('tolerates leading whitespace and varied separators', () => {
    expect(parseStepCode('  02 — Nomination dans Cabrio')).toBe('02');
    expect(parseStepCode('09\tCheck Cabrio')).toBe('09');
  });
  it('returns null when no code prefix is present', () => {
    expect(parseStepCode('Tâche libre sans code')).toBeNull();
    expect(parseStepCode('')).toBeNull();
    expect(parseStepCode(null)).toBeNull();
  });
});

describe('mapNotionStatus', () => {
  it('maps each Notion status to the DB substep status', () => {
    expect(mapNotionStatus('Done')).toBe('done');
    expect(mapNotionStatus('En cours')).toBe('in_progress');
    expect(mapNotionStatus('Bloqué')).toBe('blocked');
    expect(mapNotionStatus('No started')).toBe('not_started');
  });
  it('is whitespace/diacritic tolerant', () => {
    expect(mapNotionStatus(' done ')).toBe('done');
    expect(mapNotionStatus('Bloque')).toBe('blocked');
  });
  it('defaults to not_started for empty/unknown values', () => {
    expect(mapNotionStatus(null)).toBe('not_started');
    expect(mapNotionStatus('')).toBe('not_started');
    expect(mapNotionStatus('Whatever')).toBe('not_started');
  });
});
