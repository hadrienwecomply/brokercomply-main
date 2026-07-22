/**
 * Calendar half of Phase 2: a booked demo in an officer's calendar is a
 * RELIABLE fact (unlike a no-show, which the calendar cannot know — out of
 * scope for v1). For every event whose attendees include a prospect, we move
 * that prospect to `demo_planned` and stamp the meeting date.
 *
 * Same guard-rails and audit trail as the mail bridge: never downgrade a
 * further-along deal, never reopen a settled one, let a human's later manual
 * move win, and journal every action in `prospect_ai_actions` (keyed on the
 * event id, prefixed `cal:`, so re-runs are idempotent). Because it is a fact,
 * not an inference, it applies at full confidence with no LLM in the loop.
 */

import { eq } from 'drizzle-orm';
import { prospectAiActions, prospects } from '../db/schema.js';
import type { GraphCalendarClient } from '../mail/calendar-client.js';
import { mapIntentToAxes, wouldMoveFunnel } from './intent-mapping.js';
import {
  findProspectByEmail,
  setProspectPipelineStage,
  type PipelineStage,
  type ProspectsServiceDeps,
} from './service.js';

export interface CalendarSyncDeps extends ProspectsServiceDeps {
  calendar: GraphCalendarClient;
}

export interface CalendarSyncSummary {
  /** Events scanned across all mailboxes. */
  events: number;
  /** Events matched to a prospect by an attendee address. */
  matched: number;
  /** Prospects moved to demo_planned. */
  applied: number;
  /** Matches that changed nothing (already demo_planned+ or settled). */
  noop: number;
}

const MEETING_BOOKED = mapIntentToAxes('meeting_booked'); // → demo_planned

/**
 * Scan each mailbox's calendar over [since, until] and reflect booked demos
 * onto the prospects. Idempotent — re-running only logs/moves what is new.
 */
export async function runCalendarSync(
  { db, calendar }: CalendarSyncDeps,
  mailboxes: readonly string[],
  since: Date,
  until: Date,
): Promise<CalendarSyncSummary> {
  const summary: CalendarSyncSummary = { events: 0, matched: 0, applied: 0, noop: 0 };
  const seenEventIds = new Set<string>();

  for (const mailbox of mailboxes) {
    const events = await calendar.listEvents(mailbox, since, until);
    for (const event of events) {
      // The same event can surface in two officers' calendars — count once.
      if (seenEventIds.has(event.id)) continue;
      seenEventIds.add(event.id);
      summary.events++;

      // First attendee that maps to a prospect wins (a demo has one prospect).
      let prospectId: string | null = null;
      for (const address of event.attendees) {
        prospectId = await findProspectByEmail({ db }, address);
        if (prospectId) break;
      }
      if (!prospectId) continue;
      summary.matched++;

      const messageId = `cal:${event.id}`;
      const [already] = await db
        .select({ id: prospectAiActions.id })
        .from(prospectAiActions)
        .where(eq(prospectAiActions.messageId, messageId))
        .limit(1);
      if (already) continue; // idempotent — this event was handled

      const [p] = await db.select().from(prospects).where(eq(prospects.id, prospectId)).limit(1);
      if (!p) continue;

      const currentStage = p.pipelineStage as PipelineStage;
      const moves = wouldMoveFunnel(MEETING_BOOKED, currentStage);
      const humanWins =
        (p.stageChangedAt && p.stageChangedAt.getTime() > event.start.getTime()) ?? false;

      let status: 'applied' | 'pending_review' | 'noop';
      if (!moves) {
        status = 'noop';
        summary.noop++;
      } else if (humanWins) {
        status = 'pending_review';
      } else {
        await setProspectPipelineStage({ db }, prospectId, 'demo_planned', null, { byAi: true });
        // Stamp the meeting date (advance only — keep the soonest future demo).
        await db
          .update(prospects)
          .set({ meetingDate: event.start, updatedAt: new Date() })
          .where(eq(prospects.id, prospectId));
        status = 'applied';
        summary.applied++;
      }

      await db
        .insert(prospectAiActions)
        .values({
          prospectId,
          messageId,
          intent: 'meeting_booked',
          confidence: 1,
          quote: event.subject || null,
          stageBefore: currentStage,
          stageAfter: status === 'noop' ? null : 'demo_planned',
          status,
        })
        .onConflictDoNothing();
    }
  }

  return summary;
}
