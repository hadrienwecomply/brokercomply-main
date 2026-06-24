/**
 * Pure broker ↔ email address matching. Kept free of DB/Graph imports so it is
 * trivially unit tested and reusable by both the read service and the on-demand
 * refresh path.
 *
 * Matching policy (decided with the team):
 *   - exact email is the primary signal;
 *   - a broker may opt a *domain* in (`broker.matchDomains`), but public domains
 *     (gmail, outlook, proximus…) are rejected so we never leak correspondence
 *     between brokers that happen to share a consumer mailbox provider.
 */

/**
 * Consumer / shared email providers that must never be used for domain matching
 * — many small brokers use a personal address, so a domain match here would pull
 * in unrelated people. Lowercased; membership is exact.
 */
export const PUBLIC_EMAIL_DOMAINS: ReadonlySet<string> = new Set([
  'gmail.com',
  'googlemail.com',
  'outlook.com',
  'outlook.be',
  'hotmail.com',
  'hotmail.be',
  'hotmail.fr',
  'live.com',
  'live.be',
  'msn.com',
  'yahoo.com',
  'yahoo.fr',
  'yahoo.be',
  'icloud.com',
  'me.com',
  'gmx.com',
  'gmx.be',
  'proximus.be',
  'skynet.be',
  'telenet.be',
  'scarlet.be',
  'voo.be',
  'belgacom.net',
]);

/** Extract the lowercased domain from an email address, or null if malformed. */
export function domainOf(email: string | null | undefined): string | null {
  if (!email) return null;
  const at = email.lastIndexOf('@');
  if (at === -1) return null;
  const domain = email.slice(at + 1).trim().toLowerCase();
  return domain || null;
}

/** True when the domain is a consumer/shared provider unsafe for domain matching. */
export function isPublicEmailDomain(domain: string): boolean {
  return PUBLIC_EMAIL_DOMAINS.has(domain.trim().toLowerCase());
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Derive the bare host from a website URL (strips scheme, `www.`, path, port). */
function domainFromWebsite(website: string | null | undefined): string | null {
  if (!website) return null;
  let host = website.trim().toLowerCase();
  host = host.replace(/^[a-z]+:\/\//, ''); // scheme
  host = host.split('/')[0] ?? host; // path
  host = host.split('?')[0] ?? host;
  host = host.split(':')[0] ?? host; // port
  host = host.replace(/^www\./, '');
  return host || null;
}

/** The subset of a broker this module needs — structural, not the DB row type. */
export interface BrokerAddressInput {
  emails?: string[] | null;
  matchDomains?: string[] | null;
  website?: string | null;
}

export interface BrokerAddressMatcher {
  /** Exact contact emails, lowercased. */
  emails: Set<string>;
  /** Opt-in, non-public domains, lowercased. */
  domains: Set<string>;
  /** True when there is nothing to match on (caller should not query at all). */
  isEmpty: boolean;
  /** Does this address belong to the broker (exact email or opted-in domain)? */
  matches(address: string | null | undefined): boolean;
}

/**
 * Build a matcher from a broker's stored emails + opted-in domains. Public
 * domains are dropped from `domains` even if present in `matchDomains`.
 */
export function resolveBrokerAddresses(broker: BrokerAddressInput): BrokerAddressMatcher {
  const emails = new Set<string>();
  for (const e of broker.emails ?? []) {
    const norm = normalizeEmail(e);
    if (norm.includes('@')) emails.add(norm);
  }

  const domains = new Set<string>();
  for (const d of broker.matchDomains ?? []) {
    const norm = d.trim().toLowerCase();
    if (norm && !isPublicEmailDomain(norm)) domains.add(norm);
  }

  const isEmpty = emails.size === 0 && domains.size === 0;

  return {
    emails,
    domains,
    isEmpty,
    matches(address) {
      if (!address) return false;
      const norm = normalizeEmail(address);
      if (emails.has(norm)) return true;
      if (domains.size === 0) return false;
      const domain = domainOf(norm);
      return domain != null && domains.has(domain);
    },
  };
}

/**
 * Suggest domains an officer could safely opt in for a broker, derived from its
 * website and contact emails, excluding public providers. Used to power the
 * "include the whole @domain" toggle in the UI.
 */
export function candidateMatchDomains(broker: BrokerAddressInput): string[] {
  const found = new Set<string>();
  const websiteDomain = domainFromWebsite(broker.website);
  if (websiteDomain && !isPublicEmailDomain(websiteDomain)) found.add(websiteDomain);
  for (const e of broker.emails ?? []) {
    const domain = domainOf(e);
    if (domain && !isPublicEmailDomain(domain)) found.add(domain);
  }
  return [...found].sort();
}
