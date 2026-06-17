/**
 * Officers for edit attribution. No auth in v1 (PRD: private network) — the
 * current officer is chosen via a picker and stored in a cookie. Identity is an
 * email, consistent with `knowledge_units.author` and the real mailboxes.
 */
export interface OfficerOption {
  email: string;
  name: string;
}

export const OFFICER_OPTIONS: OfficerOption[] = [
  { email: "sdv@we-comply.be", name: "Sacha" },
  { email: "gr@we-comply.be", name: "Gregory" },
  { email: "founder@we-comply.be", name: "Fondateur" },
];

export const OFFICER_COOKIE = "bc_officer";
export const DEFAULT_OFFICER = "sdv@we-comply.be";

export function officerName(email: string): string {
  return OFFICER_OPTIONS.find((o) => o.email === email)?.name ?? email;
}
