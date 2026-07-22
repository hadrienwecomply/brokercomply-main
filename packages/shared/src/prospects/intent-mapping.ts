/**
 * Pure, deterministic translation of a classified email INTENT onto the funnel.
 *
 * The LLM classifier (see `intent-classifier.ts`) reads a prospect's e-mail
 * thread and emits one of seven intents. This module is the deterministic half:
 * it decides what that intent means for the two-axis model — which funnel move
 * it implies, whether that move CLOSES the deal (terminal, harder to reverse),
 * and therefore which confidence bar it must clear. No LLM, no DB, no I/O — so
 * the mapping is fully unit-testable and the risky "auto-move a deal" decision
 * is auditable line by line.
 *
 * Twin of `notion-mapping.ts` (same shape: a deterministic map + rank logic),
 * for the same reason: never guess silently, never downgrade.
 */

import type { LostReason, PipelineStage } from './service.js';

/** What the classifier can conclude from a thread. Mirrors `prospects.intent`. */
export type ProspectIntent =
  | 'no_reply'
  | 'interested'
  | 'not_interested'
  | 'later'
  | 'meeting_booked'
  | 'unreachable'
  | 'converted';

export const PROSPECT_INTENTS: readonly ProspectIntent[] = [
  'no_reply',
  'interested',
  'not_interested',
  'later',
  'meeting_booked',
  'unreachable',
  'converted',
] as const;

/**
 * Which confidence bar a move must clear before it applies automatically
 * (decision: per-type thresholds). `advance` = a non-destructive step forward;
 * `close` = ends the deal (won/lost), so it needs far more certainty; `none` =
 * the intent implies no funnel move at all.
 */
export type MoveTier = 'advance' | 'close' | 'none';

/**
 * Funnel order, low → high. Used to NEVER downgrade on an `advance` move: an
 * "interested" reply must not pull a prospect already at `demo_planned` back to
 * `contacted`. `won`/`lost` are terminal and handled off this ladder.
 */
const FUNNEL_RANK: Record<PipelineStage, number> = {
  to_contact: 0,
  contacted: 1,
  demo_planned: 2,
  demo_done: 3,
  offer_to_send: 4,
  offer_sent: 5,
  won: 6,
  lost: 6,
};

export interface IntentMapping {
  /**
   * Funnel stage this intent argues for, or null when the intent implies no
   * move (`no_reply`, and `later` — which schedules a callback instead).
   */
  targetStage: PipelineStage | null;
  /** Set only when `targetStage === 'lost'`. */
  lostReason: LostReason | null;
  /** True when the move ends the deal (won/lost) — the `close` tier. */
  terminal: boolean;
  /** Which confidence bar applies. */
  tier: MoveTier;
  /** `later` → schedule a dated reminder task instead of moving the funnel. */
  schedulesCallback: boolean;
}

const MAPPING: Record<ProspectIntent, IntentMapping> = {
  no_reply: {
    targetStage: null,
    lostReason: null,
    terminal: false,
    tier: 'none',
    schedulesCallback: false,
  },
  interested: {
    targetStage: 'contacted',
    lostReason: null,
    terminal: false,
    tier: 'advance',
    schedulesCallback: false,
  },
  meeting_booked: {
    targetStage: 'demo_planned',
    lostReason: null,
    terminal: false,
    tier: 'advance',
    schedulesCallback: false,
  },
  later: {
    // Not a funnel move — the prospect asked to be re-contacted later, so we
    // schedule a dated reminder (Phase 1 mechanism) and leave the stage alone.
    targetStage: null,
    lostReason: null,
    terminal: false,
    tier: 'none',
    schedulesCallback: true,
  },
  not_interested: {
    targetStage: 'lost',
    lostReason: 'not_interested',
    terminal: true,
    tier: 'close',
    schedulesCallback: false,
  },
  unreachable: {
    targetStage: 'lost',
    lostReason: 'unreachable',
    terminal: true,
    tier: 'close',
    schedulesCallback: false,
  },
  converted: {
    targetStage: 'won',
    lostReason: null,
    terminal: true,
    tier: 'close',
    schedulesCallback: false,
  },
};

/** Deterministic mapping of an intent to its funnel semantics. */
export function mapIntentToAxes(intent: ProspectIntent): IntentMapping {
  return MAPPING[intent];
}

/**
 * Would applying `mapping` to a prospect currently at `currentStage` actually
 * change the funnel? Encodes the "never downgrade" rule:
 *  - no target, or the deal is already terminal (won/lost) → no move;
 *  - a `close` move (won/lost) always applies from a non-terminal stage;
 *  - an `advance` move applies only when it is strictly further down the funnel.
 */
export function wouldMoveFunnel(
  mapping: IntentMapping,
  currentStage: PipelineStage,
): boolean {
  if (!mapping.targetStage) return false;
  // A settled deal is never reopened by the classifier.
  if (currentStage === 'won' || currentStage === 'lost') return false;
  if (mapping.terminal) return true;
  return FUNNEL_RANK[mapping.targetStage] > FUNNEL_RANK[currentStage];
}
