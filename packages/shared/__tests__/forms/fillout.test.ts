import { describe, expect, it } from 'vitest';
import {
  deriveBrokerName,
  extractCandidate,
  normalizeAnswers,
  valueToString,
  type FilloutSubmission,
} from '../../src/forms/index.js';

const submission: FilloutSubmission = {
  submissionId: 'sub_1',
  submissionTime: '2026-06-23T10:00:00Z',
  formId: 'form_abc',
  questions: [
    { id: 'q_email', name: 'Votre email', type: 'Email', value: 'jean@cabinet-durand.be' },
    { id: 'q_company', name: 'Nom de la société', type: 'ShortAnswer', value: 'Cabinet Durand' },
    { id: 'q_site', name: 'Site web', type: 'URL', value: 'https://cabinet-durand.be' },
    { id: 'q_multi', name: 'Produits', type: 'MultipleChoice', value: ['Auto', 'Habitation'] },
  ],
};

describe('valueToString', () => {
  it('handles strings, numbers, arrays and nullish', () => {
    expect(valueToString('  hi ')).toBe('hi');
    expect(valueToString(42)).toBe('42');
    expect(valueToString(['Auto', 'Habitation'])).toBe('Auto, Habitation');
    expect(valueToString('')).toBeNull();
    expect(valueToString(null)).toBeNull();
    expect(valueToString({})).toBeNull();
  });
});

describe('normalizeAnswers', () => {
  it('flattens questions with positional order', () => {
    const rows = normalizeAnswers(submission);
    expect(rows).toHaveLength(4);
    expect(rows[0]).toMatchObject({ questionId: 'q_email', name: 'Votre email', type: 'Email', position: 0 });
    expect(rows[3]).toMatchObject({ questionId: 'q_multi', position: 3 });
  });
  it('tolerates a missing questions array', () => {
    expect(normalizeAnswers({ submissionId: 's' })).toEqual([]);
  });
});

describe('extractCandidate', () => {
  it('uses the per-form field map (B) when provided', () => {
    const c = extractCandidate(normalizeAnswers(submission), {
      emailFieldId: 'q_email',
      companyFieldId: 'q_company',
      websiteFieldId: 'q_site',
    });
    expect(c).toEqual({
      email: 'jean@cabinet-durand.be',
      companyName: 'Cabinet Durand',
      website: 'https://cabinet-durand.be',
    });
  });

  it('falls back to type/name heuristics (A) without a map', () => {
    const c = extractCandidate(normalizeAnswers(submission));
    expect(c.email).toBe('jean@cabinet-durand.be'); // first Email-typed
    expect(c.companyName).toBe('Cabinet Durand'); // "société"-named
    expect(c.website).toBe('https://cabinet-durand.be'); // URL-typed
  });

  it('falls back per-field when the mapped id is empty', () => {
    const c = extractCandidate(normalizeAnswers(submission), { emailFieldId: 'does_not_exist' });
    expect(c.email).toBe('jean@cabinet-durand.be'); // map miss → A fallback
  });
});

describe('deriveBrokerName', () => {
  it('prefers the explicit company name', () => {
    expect(deriveBrokerName({ email: 'x@y.be', companyName: 'Cabinet Durand', website: null })).toBe(
      'Cabinet Durand',
    );
  });
  it('derives a name from the email domain when no company', () => {
    expect(deriveBrokerName({ email: 'jean@cabinet-durand.be', companyName: null, website: null })).toBe(
      'Cabinet Durand',
    );
  });
  it('drops a two-label public suffix', () => {
    expect(deriveBrokerName({ email: 'a@durand.co.uk', companyName: null, website: null })).toBe('Durand');
  });
  it('falls back to the email local part for generic domains', () => {
    expect(deriveBrokerName({ email: 'jeandurand@gmail.com', companyName: null, website: null })).toBe(
      'jeandurand',
    );
  });
  it('returns null when there is nothing to derive from', () => {
    expect(deriveBrokerName({ email: null, companyName: null, website: null })).toBeNull();
  });
});
