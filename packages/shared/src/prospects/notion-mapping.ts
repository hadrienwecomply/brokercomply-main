/**
 * Pure translation of the legacy Notion "Lead broker" board onto the clean
 * two-axis model, used by the one-shot Notion import.
 *
 * The Notion `Status` property is a MULTI-select mixing three things: funnel
 * position (the numbered tags), terminal outcomes (Lost variants) and free
 * markers (events, anecdotes). This module untangles a tag set into
 * `pipeline_stage` + `lost_reason` + `no_show`, flagging genuinely conflicting
 * combinations as `needs_review` instead of guessing silently. Raw tags are
 * preserved verbatim by the caller (`source_status`) — nothing is lost.
 *
 * DB-free and deterministic — fully unit-testable.
 */

import type { LostReason, PipelineStage } from './service.js';

export interface NotionLeadMapping {
  pipelineStage: PipelineStage;
  lostReason: LostReason | null;
  noShow: boolean;
  needsReview: boolean;
}

/** Funnel rank — higher = further down the funnel. */
const FUNNEL_BY_PREFIX: Array<{ prefix: string; stage: PipelineStage; rank: number }> = [
  { prefix: '7.', stage: 'to_contact', rank: 1 },
  { prefix: '6.', stage: 'contacted', rank: 2 },
  { prefix: '5.', stage: 'demo_planned', rank: 3 },
  { prefix: '4.', stage: 'demo_done', rank: 4 },
  { prefix: '3.', stage: 'offer_to_send', rank: 5 },
  { prefix: '2.', stage: 'offer_sent', rank: 6 },
  { prefix: '1.', stage: 'won', rank: 7 },
];

/** Lost markers found in the `Status` multi-select (matched case-insensitively). */
const LOST_MARKERS: Array<{ match: string; reason: LostReason }> = [
  { match: 'pas interessé', reason: 'not_interested' },
  { match: 'pas intéressé', reason: 'not_interested' },
  { match: 'mauvaise cible', reason: 'wrong_target' },
  { match: 'faux numéro', reason: 'unreachable' },
  { match: 'lost', reason: 'other' }, // both "Lost 😒" and plain "Lost"
];

/** Tags that imply the lead was at least reached, without a numbered tag. */
const IMPLIES_CONTACTED = [
  'no response - cold call',
  'répondu - suivi à faire',
  'occupe il me recall',
  'relancé post e-mail',
];

function normalize(tag: string): string {
  return tag.toLowerCase().trim();
}

/**
 * Map one lead's Notion tags to the clean model.
 *
 * Rules (in order):
 *  1. The most advanced numbered tag sets the funnel position.
 *  2. Any Lost marker forces `lost` (first matching reason wins; the suivi
 *     "LOST (budget)" refines to 'budget', "INJOIGNABLE" to 'unreachable').
 *  3. "No Show 💔" sets the flag and implies at least `demo_planned` — a
 *     no-show had booked something.
 *  4. Cold-call/reply markers imply at least `contacted`.
 *  5. Won + Lost together is contradictory → keep `won`, flag `needs_review`.
 *  6. No usable tag at all → `to_contact`.
 */
export function mapNotionLead(
  statusTags: string[],
  suiviCommercial: string | null,
): NotionLeadMapping {
  const tags = statusTags.map(normalize);
  const suivi = suiviCommercial ? normalize(suiviCommercial) : null;

  // 1. Most advanced numbered funnel tag.
  let funnel: { stage: PipelineStage; rank: number } | null = null;
  for (const tag of tags) {
    const hit = FUNNEL_BY_PREFIX.find((f) => tag.startsWith(f.prefix));
    if (hit && (!funnel || hit.rank > funnel.rank)) funnel = hit;
  }

  // 2. Lost markers (Status tags first, then the suivi refinements).
  let lostReason: LostReason | null = null;
  for (const tag of tags) {
    const hit = LOST_MARKERS.find((m) => tag.includes(m.match));
    if (hit) {
      lostReason = hit.reason;
      if (hit.reason !== 'other') break; // a specific reason beats plain "lost"
    }
  }
  if (suivi?.includes('lost')) lostReason = 'budget'; // "LOST (budget)"
  else if (suivi === 'injoignable' && lostReason === 'other') lostReason = 'unreachable';

  // 3. No-show flag; a no-show had at least booked a demo.
  const noShow = tags.some((t) => t.includes('no show'));

  // 4. Markers implying the lead was reached.
  const reached = tags.some((t) => IMPLIES_CONTACTED.some((m) => t.includes(m)));

  const won = funnel?.stage === 'won';
  const lost = lostReason !== null && !won;
  const needsReview = Boolean(funnel?.stage === 'won' && lostReason !== null);

  let pipelineStage: PipelineStage;
  if (won) pipelineStage = 'won';
  else if (lost) pipelineStage = 'lost';
  else if (funnel) pipelineStage = funnel.stage;
  else if (noShow) pipelineStage = 'demo_planned';
  else if (reached) pipelineStage = 'contacted';
  else pipelineStage = 'to_contact';

  return {
    pipelineStage,
    lostReason: lost ? lostReason : null,
    noShow,
    needsReview,
  };
}

/** Cadence facts derivable from the "Suivi commercial" select (best proxies). */
export interface SuiviCadenceFacts {
  /** RELANCE 1/2/3 → the reminder went out (dated by the last tentative). */
  reminderSentAt: Date | null;
  /** RESPONDED → the lead replied (dated by the last tentative). */
  lastReplyAt: Date | null;
  /** CALLED → the +15d call already happened (dated by the last tentative). */
  calledAt: Date | null;
}

/**
 * Translate the "Suivi commercial" select into cadence facts so already-chased
 * leads don't re-enter the chase from scratch. `lastTentative` (the board's
 * "Last tentative date") is the only date available — a best-effort proxy.
 * Unknown/empty suivi (or no date) yields no facts: the tick starts the
 * cadence from the offer date alone.
 */
export function mapSuiviToCadence(
  suiviCommercial: string | null,
  lastTentative: Date | null,
): SuiviCadenceFacts {
  const none: SuiviCadenceFacts = { reminderSentAt: null, lastReplyAt: null, calledAt: null };
  if (!suiviCommercial || !lastTentative) return none;
  const suivi = normalize(suiviCommercial);

  if (suivi.startsWith('relance')) return { ...none, reminderSentAt: lastTentative };
  if (suivi === 'responded') return { ...none, lastReplyAt: lastTentative };
  if (suivi === 'called') return { ...none, calledAt: lastTentative };
  return none;
}
