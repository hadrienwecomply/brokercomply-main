import { describe, expect, it } from 'vitest';
import {
  emailDomain,
  isGenericDomain,
  matchBroker,
  websiteDomain,
  type BrokerMatchInput,
  type MatchCandidate,
} from '../../src/forms/index.js';

const brokers: BrokerMatchInput[] = [
  {
    id: 'b1',
    slug: 'cabinet-durand',
    societe: 'Cabinet Durand',
    emails: ['contact@cabinet-durand.be', 'jean@cabinet-durand.be'],
    website: 'https://www.cabinet-durand.be',
  },
  {
    id: 'b2',
    slug: 'assurances-martin',
    societe: 'Assurances Martin',
    emails: ['info@assurances-martin.fr'],
    website: null,
  },
  {
    id: 'b3',
    slug: 'courtier-gmail',
    societe: 'Courtier Gmail',
    emails: ['lebroker@gmail.com'],
    website: null,
  },
];

function candidate(over: Partial<MatchCandidate> = {}): MatchCandidate {
  return { email: null, companyName: null, website: null, ...over };
}

describe('emailDomain', () => {
  it('extracts a lower-cased domain', () => {
    expect(emailDomain('Jean@Cabinet-Durand.BE')).toBe('cabinet-durand.be');
  });
  it('returns null for non-emails', () => {
    expect(emailDomain('not-an-email')).toBeNull();
    expect(emailDomain('user@localhost')).toBeNull();
    expect(emailDomain(null)).toBeNull();
  });
});

describe('websiteDomain', () => {
  it('strips scheme, www, path, query and port', () => {
    expect(websiteDomain('https://www.Cabinet-Durand.be/contact?x=1')).toBe('cabinet-durand.be');
    expect(websiteDomain('cabinet-durand.be:443')).toBe('cabinet-durand.be');
  });
  it('returns null when there is no dotted host', () => {
    expect(websiteDomain('localhost')).toBeNull();
    expect(websiteDomain(null)).toBeNull();
  });
});

describe('isGenericDomain', () => {
  it('flags consumer providers and not business domains', () => {
    expect(isGenericDomain('gmail.com')).toBe(true);
    expect(isGenericDomain('HOTMAIL.be')).toBe(true);
    expect(isGenericDomain('cabinet-durand.be')).toBe(false);
  });
});

describe('matchBroker', () => {
  it('matches by exact email (highest precedence)', () => {
    const r = matchBroker(brokers, candidate({ email: 'JEAN@cabinet-durand.be' }));
    expect(r.method).toBe('email');
    expect(r.broker?.id).toBe('b1');
  });

  it('matches by email domain against email or website', () => {
    const r = matchBroker(brokers, candidate({ email: 'newperson@cabinet-durand.be' }));
    expect(r.method).toBe('domain');
    expect(r.broker?.id).toBe('b1');
  });

  it('does NOT match by domain for generic providers', () => {
    // A different gmail address must not attach to the broker that has a gmail contact.
    const r = matchBroker(brokers, candidate({ email: 'someone-else@gmail.com' }));
    expect(r.method).toBe('created');
    expect(r.broker).toBeNull();
  });

  it('still matches a generic address by EXACT email', () => {
    const r = matchBroker(brokers, candidate({ email: 'lebroker@gmail.com' }));
    expect(r.method).toBe('email');
    expect(r.broker?.id).toBe('b3');
  });

  it('matches by normalised company name (exact slug)', () => {
    const r = matchBroker(brokers, candidate({ companyName: 'Assurances  Martin' }));
    expect(r.method).toBe('name');
    expect(r.broker?.id).toBe('b2');
  });

  it('does not fuzzy-match a near-miss name → creates instead', () => {
    const r = matchBroker(brokers, candidate({ companyName: 'Assurance Martins' }));
    expect(r.method).toBe('created');
    expect(r.broker).toBeNull();
  });

  it('precedence: email beats name', () => {
    const r = matchBroker(
      brokers,
      candidate({ email: 'jean@cabinet-durand.be', companyName: 'Assurances Martin' }),
    );
    expect(r.method).toBe('email');
    expect(r.broker?.id).toBe('b1');
  });

  it('returns created when nothing matches', () => {
    const r = matchBroker(brokers, candidate({ email: 'x@unknown-broker.be', companyName: 'X' }));
    expect(r.method).toBe('created');
    expect(r.broker).toBeNull();
  });
});
