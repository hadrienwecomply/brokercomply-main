export type MessageDirection = 'inbound' | 'outbound' | 'internal';

/** Normalise an address set for case-insensitive membership tests. */
export function officerSet(officers: readonly string[]): Set<string> {
  return new Set(officers.map((o) => o.trim().toLowerCase()).filter(Boolean));
}

/**
 * Classify a message relative to the compliance-officer mailboxes:
 * - `inbound`   — sender is NOT an officer (client/external → officer)
 * - `outbound`  — sender IS an officer and at least one recipient is external
 * - `internal`  — sender and all recipients are officers
 *
 * `outbound` messages carry the compliance expertise (the answers).
 */
export function classifyDirection(
  from: string,
  recipients: readonly string[],
  officers: Set<string>,
): MessageDirection {
  if (!officers.has(from.trim().toLowerCase())) return 'inbound';
  const normalized = recipients.map((r) => r.trim().toLowerCase()).filter(Boolean);
  const allOfficers = normalized.length > 0 && normalized.every((r) => officers.has(r));
  return allOfficers ? 'internal' : 'outbound';
}
