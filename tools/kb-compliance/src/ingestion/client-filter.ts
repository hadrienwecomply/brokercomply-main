import { existsSync, readFileSync } from 'node:fs';
import type { Thread } from './thread-builder.js';

/**
 * Allowlist scoping ingestion to signed-client correspondence. An address is in
 * scope if its exact email is listed, or its domain is listed. Exact emails are
 * required for generic providers (Gmail etc.) where the domain is meaningless.
 */
export interface ClientAllowlist {
  domains: Set<string>;
  emails: Set<string>;
}

/** Raw on-disk shape of the allowlist (see config/client-allowlist.json). */
export interface RawClientAllowlist {
  domains?: string[];
  emails?: string[];
}

/** Extract a normalised (trimmed, lowercased) email from a header address. */
export function extractEmail(address: string | null | undefined): string | null {
  if (!address) return null;
  // Handle "Display Name <email@host>" as well as a bare address.
  const angle = /<([^>]+)>/.exec(address);
  const candidate = (angle?.[1] ?? address).trim().toLowerCase();
  return candidate.includes('@') ? candidate : null;
}

/** Domain part of a normalised email (already lowercased). */
function domainOf(email: string): string {
  return email.slice(email.lastIndexOf('@') + 1);
}

/** True when an address is in scope (exact email match or domain match). */
export function matchesAllowlist(
  address: string | null | undefined,
  allowlist: ClientAllowlist,
): boolean {
  const email = extractEmail(address);
  if (!email) return false;
  if (allowlist.emails.has(email)) return true;
  return allowlist.domains.has(domainOf(email));
}

/** True when any participant (from/to/cc) of any message is in scope. */
export function threadMatchesClient(thread: Thread, allowlist: ClientAllowlist): boolean {
  for (const message of thread.messages) {
    if (matchesAllowlist(message.from, allowlist)) return true;
    for (const to of message.to) if (matchesAllowlist(to, allowlist)) return true;
    for (const cc of message.cc) if (matchesAllowlist(cc, allowlist)) return true;
  }
  return false;
}

/** Normalise a raw allowlist into lowercased sets, dropping blanks. */
export function parseAllowlist(raw: RawClientAllowlist): ClientAllowlist {
  const norm = (xs: string[] | undefined): Set<string> =>
    new Set((xs ?? []).map((x) => x.trim().toLowerCase()).filter(Boolean));
  return { domains: norm(raw.domains), emails: norm(raw.emails) };
}

/**
 * Load the allowlist JSON from `path`. Returns null when the file is absent so
 * callers can fall back to unscoped ingestion.
 */
export function loadClientAllowlist(path: string): ClientAllowlist | null {
  if (!existsSync(path)) return null;
  const raw = JSON.parse(readFileSync(path, 'utf8')) as RawClientAllowlist;
  return parseAllowlist(raw);
}
