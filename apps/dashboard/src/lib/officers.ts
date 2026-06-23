/**
 * Officers for edit attribution. No auth in v1 (PRD: private network) — the
 * current officer is chosen via a picker and stored in a cookie. Identity is an
 * email, consistent with `knowledge_units.author`, `brokers.account_owner`, and
 * the real mailboxes.
 */
import type { Officer, OfficerRole } from "./types";

export interface OfficerOption {
  email: string;
  name: string;
  role: OfficerRole;
}

export const OFFICER_OPTIONS: OfficerOption[] = [
  { email: "sdv@we-comply.be", name: "Sacha", role: "officer" },
  { email: "gr@we-comply.be", name: "Gregory", role: "officer" },
  { email: "founder@we-comply.be", name: "Fondateur", role: "founder" },
];

export const OFFICER_COOKIE = "bc_officer";
export const DEFAULT_OFFICER = "sdv@we-comply.be";

/** Officer list in the `Officer` shape the dashboard components expect (id = email). */
export const OFFICERS: Officer[] = OFFICER_OPTIONS.map((o) => ({
  id: o.email,
  name: o.name,
  role: o.role,
}));

export function getOfficer(email: string): Officer | undefined {
  return OFFICERS.find((o) => o.id === email);
}

export function officerName(email: string): string {
  return OFFICER_OPTIONS.find((o) => o.email === email)?.name ?? email;
}
