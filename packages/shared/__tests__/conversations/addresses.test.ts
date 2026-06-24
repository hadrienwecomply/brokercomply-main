import { describe, expect, it } from 'vitest';
import {
  candidateMatchDomains,
  domainOf,
  isPublicEmailDomain,
  resolveBrokerAddresses,
} from '../../src/conversations/index.js';

describe('domainOf', () => {
  it('extracts the lowercased domain', () => {
    expect(domainOf('Jean.Dupont@Acme-Broker.BE')).toBe('acme-broker.be');
  });
  it('trims surrounding whitespace and display name noise', () => {
    expect(domainOf('  contact@elite.be  ')).toBe('elite.be');
  });
  it('returns null for a value without @', () => {
    expect(domainOf('not-an-email')).toBeNull();
    expect(domainOf('')).toBeNull();
  });
});

describe('isPublicEmailDomain', () => {
  it('flags common public providers (case-insensitive)', () => {
    expect(isPublicEmailDomain('gmail.com')).toBe(true);
    expect(isPublicEmailDomain('GMAIL.COM')).toBe(true);
    expect(isPublicEmailDomain('outlook.com')).toBe(true);
    expect(isPublicEmailDomain('hotmail.be')).toBe(true);
    expect(isPublicEmailDomain('proximus.be')).toBe(true);
    expect(isPublicEmailDomain('telenet.be')).toBe(true);
    expect(isPublicEmailDomain('skynet.be')).toBe(true);
  });
  it('does not flag a corporate domain', () => {
    expect(isPublicEmailDomain('acme-broker.be')).toBe(false);
  });
});

describe('resolveBrokerAddresses', () => {
  it('collects exact emails, lowercased and de-duplicated', () => {
    const m = resolveBrokerAddresses({
      emails: ['Contact@Elite.be', 'contact@elite.be', ' info@elite.be '],
      matchDomains: [],
    });
    expect([...m.emails].sort()).toEqual(['contact@elite.be', 'info@elite.be']);
  });

  it('matches a recipient regardless of case', () => {
    const m = resolveBrokerAddresses({ emails: ['contact@elite.be'], matchDomains: [] });
    expect(m.matches('CONTACT@elite.BE')).toBe(true);
    expect(m.matches('other@elite.be')).toBe(false);
  });

  it('keeps opt-in non-public domains and matches by domain', () => {
    const m = resolveBrokerAddresses({ emails: [], matchDomains: ['Acme-Broker.BE'] });
    expect([...m.domains]).toEqual(['acme-broker.be']);
    expect(m.matches('anyone@acme-broker.be')).toBe(true);
    expect(m.matches('anyone@other.be')).toBe(false);
  });

  it('rejects public domains even if opted in (anti-leak guard)', () => {
    const m = resolveBrokerAddresses({
      emails: [],
      matchDomains: ['gmail.com', 'acme-broker.be'],
    });
    expect([...m.domains]).toEqual(['acme-broker.be']);
    expect(m.matches('someone@gmail.com')).toBe(false);
  });

  it('handles null/undefined fields gracefully', () => {
    const m = resolveBrokerAddresses({ emails: null, matchDomains: undefined });
    expect(m.isEmpty).toBe(true);
    expect(m.matches('x@y.be')).toBe(false);
    expect(m.matches(null)).toBe(false);
  });

  it('is non-empty when at least one email or domain is present', () => {
    expect(resolveBrokerAddresses({ emails: ['a@b.be'], matchDomains: [] }).isEmpty).toBe(false);
    expect(resolveBrokerAddresses({ emails: [], matchDomains: ['b.be'] }).isEmpty).toBe(false);
  });
});

describe('candidateMatchDomains', () => {
  it('suggests non-public domains derived from website and emails', () => {
    expect(
      candidateMatchDomains({
        website: 'https://www.acme-broker.be/contact',
        emails: ['jean@acme-broker.be', 'jean@gmail.com'],
      }),
    ).toEqual(['acme-broker.be']);
  });
  it('returns an empty list when only public domains are available', () => {
    expect(candidateMatchDomains({ website: null, emails: ['x@gmail.com'] })).toEqual([]);
  });
});
