import { brokerSlug } from '../brokers/slug.js';

/**
 * How a form submission was resolved to a broker.
 * - `email`   exact submitted email found in a broker's `emails[]`
 * - `domain`  submitted email's domain matched a broker's email/website domain
 * - `name`    normalised company name matched a broker's slug
 * - `created` no match — a broker was auto-created from the submission
 * - `manual`  reserved: a human re-assigned the submission (future re-matching)
 */
export type MatchMethod = 'email' | 'domain' | 'name' | 'created' | 'manual';

/** The identifying signals extracted from a submission, used to find a broker. */
export interface MatchCandidate {
  email: string | null;
  companyName: string | null;
  website: string | null;
}

/** Minimal broker shape the matcher needs (a pure projection of the row). */
export interface BrokerMatchInput {
  id: string;
  slug: string;
  societe: string;
  emails: string[];
  website: string | null;
}

export interface MatchResult<B extends BrokerMatchInput = BrokerMatchInput> {
  /** The matched broker, or null when nothing matched (caller should create). */
  broker: B | null;
  method: MatchMethod;
}

/**
 * Free/consumer email providers. A broker may legitimately have a gmail contact,
 * so we never match by *domain* on these (it would attach every gmail submitter
 * to that broker). Exact-email matching still applies — that's a real hit.
 */
export const GENERIC_EMAIL_DOMAINS = new Set<string>([
  'gmail.com',
  'googlemail.com',
  'hotmail.com',
  'hotmail.be',
  'hotmail.fr',
  'outlook.com',
  'outlook.be',
  'outlook.fr',
  'live.com',
  'live.be',
  'msn.com',
  'yahoo.com',
  'yahoo.fr',
  'yahoo.be',
  'ymail.com',
  'icloud.com',
  'me.com',
  'proton.me',
  'protonmail.com',
  'gmx.com',
  'gmx.be',
  'aol.com',
  'telenet.be',
  'skynet.be',
  'voo.be',
]);

export function isGenericDomain(domain: string): boolean {
  return GENERIC_EMAIL_DOMAINS.has(domain.toLowerCase());
}

/** Lower-cased domain of an email address, or null if it isn't a usable email. */
export function emailDomain(email: string | null | undefined): string | null {
  if (!email) return null;
  const at = email.lastIndexOf('@');
  if (at < 0) return null;
  const domain = email.slice(at + 1).trim().toLowerCase();
  return domain.includes('.') ? domain : null;
}

/**
 * Bare registrable host of a website, stripped of scheme/`www.`/path/port, e.g.
 * "https://www.Cabinet-Durand.be/contact" → "cabinet-durand.be".
 */
export function websiteDomain(website: string | null | undefined): string | null {
  if (!website) return null;
  let host = website.trim().toLowerCase();
  host = host.replace(/^[a-z][a-z0-9+.-]*:\/\//, ''); // scheme://
  host = host.replace(/^www\./, '');
  host = host.split('/')[0] ?? host; // drop path
  host = host.split('?')[0] ?? host; // drop query
  host = host.split(':')[0] ?? host; // drop port
  host = host.trim();
  return host.includes('.') ? host : null;
}

/** All domains a broker is known by (its emails + its website). */
function brokerDomains(broker: BrokerMatchInput): Set<string> {
  const domains = new Set<string>();
  for (const e of broker.emails ?? []) {
    const d = emailDomain(e);
    if (d) domains.add(d);
  }
  const w = websiteDomain(broker.website);
  if (w) domains.add(w);
  return domains;
}

/**
 * Resolve a candidate to a broker by precedence: exact email → domain (generic
 * providers excluded) → normalised company name. Returns `{ broker: null,
 * method: 'created' }` when nothing matches. Pure and side-effect free so it's
 * unit-testable without a database — the caller loads brokers and passes them in.
 */
export function matchBroker<B extends BrokerMatchInput>(
  brokers: B[],
  candidate: MatchCandidate,
): MatchResult<B> {
  const email = candidate.email?.trim().toLowerCase() || null;

  // 1. Exact email — highest confidence.
  if (email) {
    for (const broker of brokers) {
      if ((broker.emails ?? []).some((e) => e.trim().toLowerCase() === email)) {
        return { broker, method: 'email' };
      }
    }
  }

  // 2. Domain — skip generic/consumer providers (would over-match).
  const domain = emailDomain(email);
  if (domain && !isGenericDomain(domain)) {
    for (const broker of brokers) {
      if (brokerDomains(broker).has(domain)) {
        return { broker, method: 'domain' };
      }
    }
  }

  // 3. Company name — exact match on the normalised slug (no fuzzy matching, so
  //    a near-miss creates a flagged broker rather than risking a wrong merge).
  if (candidate.companyName) {
    const slug = brokerSlug(candidate.companyName);
    if (slug) {
      for (const broker of brokers) {
        if (broker.slug === slug) return { broker, method: 'name' };
      }
    }
  }

  return { broker: null, method: 'created' };
}
