import type { Broker, PlanStep, SubStep } from './types';
import { formatDate } from './format';

/**
 * Client-safe prefill for the send modal. Mirrors the bracket-token convention
 * of `@brokercomply/shared` `renderTemplate` (kept local so the client bundle
 * doesn't pull the shared server barrel). The officer edits this preview before
 * sending, and the action sends the edited text verbatim — so this is a
 * convenience prefill, not the authoritative render.
 */
const TOKEN_RE = /\[([^\]\n]+)\]/g;

function render(text: string, vars: Record<string, string>): { text: string; missing: string[] } {
  const lookup = new Map<string, string>();
  for (const [k, v] of Object.entries(vars)) lookup.set(k.trim().toLowerCase(), v);
  const missing = new Set<string>();
  const out = text.replace(TOKEN_RE, (whole, rawKey: string) => {
    const value = lookup.get(rawKey.trim().toLowerCase());
    if (value === undefined || value === '') {
      missing.add(rawKey.trim());
      return whole;
    }
    return value;
  });
  return { text: out, missing: [...missing] };
}

function firstName(contact: string): string {
  return contact.trim().split(/\s+/)[0] ?? '';
}

export interface EmailDraft {
  to: string[];
  cc: string[];
  subject: string;
  body: string;
  /** Unresolved tokens (e.g. missing contact name) — surfaced as a warning. */
  missing: string[];
}

/** Build the initial editable draft for a sub-step's template + this broker. */
export function buildEmailDraft(broker: Broker, step: PlanStep, substep: SubStep): EmailDraft {
  const vars: Record<string, string> = {
    Prénom: firstName(broker.contact),
    Société: broker.societe,
    Échéance: step.deadline ? formatDate(step.deadline) : '',
  };
  const subject = render(substep.emailTemplate?.subject ?? '', vars);
  const body = render(substep.emailTemplate?.body ?? '', vars);
  return {
    to: broker.emails[0] ? [broker.emails[0]] : [],
    // No default CC: the email is sent FROM the assigned officer, so CC-ing them
    // would be redundant. The officer can add recipients manually if needed.
    cc: [],
    subject: subject.text,
    body: body.text,
    missing: [...new Set([...subject.missing, ...body.missing])],
  };
}
