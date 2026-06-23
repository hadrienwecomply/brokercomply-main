import { emailDomain, isGenericDomain, type MatchCandidate } from './matching.js';

/**
 * One answer in a Fillout submission. Fillout sends `questions[]` where `value`
 * is loosely typed (string | number | string[] | object) depending on `type`.
 * See https://www.fillout.com/help/webhook — the webhook body mirrors the
 * `/submissions` response shape.
 */
export interface FilloutQuestion {
  id: string;
  name?: string | null;
  type?: string | null;
  value?: unknown;
}

/** The relevant subset of a Fillout webhook body. Extra fields are ignored. */
export interface FilloutSubmission {
  submissionId: string;
  submissionTime?: string | null;
  formId?: string | null;
  questions?: FilloutQuestion[] | null;
}

/** A normalised answer row, ready to persist into `form_fields`. */
export interface NormalizedAnswer {
  questionId: string;
  name: string | null;
  type: string | null;
  value: unknown;
  position: number;
}

/**
 * Per-form field mapping (the "B" strategy). Lets us point at the exact Fillout
 * question ids that hold the broker's email / company / website, since question
 * ids are opaque and differ per form. Lives in the dashboard form template and
 * is passed in by the caller; absent or empty → the "A" heuristic fallback runs.
 */
export interface FormFieldMap {
  emailFieldId?: string | null;
  companyFieldId?: string | null;
  websiteFieldId?: string | null;
}

/** Fillout question `type`s that denote an email / url field (A fallback). */
const EMAIL_TYPES = new Set(['email', 'emailinput']);
const URL_TYPES = new Set(['url', 'urlinput', 'website']);

/** Heuristic name patterns for the A fallback when no field map is provided. */
const COMPANY_NAME_RE = /soci[ée]t[ée]|company|entreprise|cabinet|bureau|organis/i;
const WEBSITE_NAME_RE = /site|web|url/i;

/** Coerce a loosely-typed Fillout answer value into a trimmed string (or null). */
export function valueToString(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === 'string') {
    const t = value.trim();
    return t ? t : null;
  }
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    const parts = value.map(valueToString).filter((v): v is string => !!v);
    return parts.length ? parts.join(', ') : null;
  }
  return null;
}

/** Flatten a Fillout submission's `questions[]` into normalised answer rows. */
export function normalizeAnswers(submission: FilloutSubmission): NormalizedAnswer[] {
  const questions = submission.questions ?? [];
  return questions.map((q, i) => ({
    questionId: q.id,
    name: q.name?.trim() || null,
    type: q.type?.trim() || null,
    value: q.value ?? null,
    position: i,
  }));
}

function findById(answers: NormalizedAnswer[], id: string | null | undefined) {
  if (!id) return undefined;
  return answers.find((a) => a.questionId === id);
}

/**
 * Extract the broker-identifying signals from a submission. Uses the per-form
 * field map first (B); for any field the map doesn't resolve, falls back to a
 * heuristic over question type/name (A): the first `Email`-typed answer, a
 * company-name-looking field, and a url/website field.
 */
export function extractCandidate(
  answers: NormalizedAnswer[],
  fieldMap?: FormFieldMap,
): MatchCandidate {
  // Email — mapped field, else first Email-typed answer with a usable value.
  let email = valueToString(findById(answers, fieldMap?.emailFieldId)?.value);
  if (!email) {
    const typed = answers.find(
      (a) => a.type && EMAIL_TYPES.has(a.type.toLowerCase()) && valueToString(a.value),
    );
    email = valueToString(typed?.value);
  }

  // Company name — mapped field, else a field whose label looks like a company.
  let companyName = valueToString(findById(answers, fieldMap?.companyFieldId)?.value);
  if (!companyName) {
    const guessed = answers.find(
      (a) => a.name && COMPANY_NAME_RE.test(a.name) && valueToString(a.value),
    );
    companyName = valueToString(guessed?.value);
  }

  // Website — mapped field, else a url-typed or website-named field.
  let website = valueToString(findById(answers, fieldMap?.websiteFieldId)?.value);
  if (!website) {
    const guessed = answers.find(
      (a) =>
        ((a.type && URL_TYPES.has(a.type.toLowerCase())) ||
          (a.name && WEBSITE_NAME_RE.test(a.name))) &&
        valueToString(a.value),
    );
    website = valueToString(guessed?.value);
  }

  return { email, companyName, website };
}

/** Title-case a domain label, e.g. "cabinet-durand" → "Cabinet Durand". */
function titleizeDomainLabel(label: string): string {
  return label
    .split(/[-_.]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/**
 * Best-effort company name for an auto-created broker (never empty), in order:
 * the submitted company name → a name derived from the email domain (minus its
 * TLD) → the email local part. Mirrors the agreed fallback chain.
 */
export function deriveBrokerName(candidate: MatchCandidate): string | null {
  const company = candidate.companyName?.trim();
  if (company) return company;

  const domain = emailDomain(candidate.email);
  // A generic provider domain (gmail.com) is no one's company name — skip it and
  // fall through to the email local part below.
  if (domain && !isGenericDomain(domain)) {
    // Drop the public suffix (last label, or last two for ".co.uk"-style).
    const labels = domain.split('.');
    const core = labels.length > 2 ? labels.slice(0, -2).join('.') : labels[0];
    const name = titleizeDomainLabel(core ?? '');
    if (name) return name;
  }

  const email = candidate.email?.trim();
  if (email && email.includes('@')) {
    const local = email.slice(0, email.indexOf('@')).trim();
    if (local) return local;
  }

  return null;
}
