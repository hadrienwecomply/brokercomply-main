/**
 * Pure mapping helpers between the Notion "Plan d'action" database and our
 * `broker_plan_substeps.status` model. No I/O — unit-tested in isolation.
 */

/** The DB sub-step statuses (mirror of `broker_plan_substeps.status`). */
export type SubstepStatus =
  | 'not_started'
  | 'in_progress'
  | 'waiting_client'
  | 'blocked'
  | 'done';

/**
 * Extract the leading section code from a Notion "Actions" title.
 * e.g. "03.01 - Remédiation AML" → "03.01", "01 - Validation…" → "01".
 * Returns null when the title has no `NN` / `NN.NN` prefix.
 */
export function parseStepCode(actionTitle: string | null | undefined): string | null {
  if (!actionTitle) return null;
  const match = actionTitle.match(/^\s*(\d{2}(?:\.\d{2})?)\b/);
  return match?.[1] ?? null;
}

/**
 * Map a Notion "Statut" select value to a DB sub-step status. Notion only has
 * four states (No started / En cours / Bloqué / Done); `waiting_client` has no
 * Notion source, so it is never produced here. Diacritic/whitespace tolerant;
 * anything unrecognised falls back to `not_started`.
 */
export function mapNotionStatus(statut: string | null | undefined): SubstepStatus {
  if (!statut) return 'not_started';
  const norm = statut
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
  switch (norm) {
    case 'done':
      return 'done';
    case 'en cours':
      return 'in_progress';
    case 'bloque':
      return 'blocked';
    case 'no started':
    case 'not started':
      return 'not_started';
    default:
      return 'not_started';
  }
}
