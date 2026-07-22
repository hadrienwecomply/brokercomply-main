import { NextResponse } from "next/server";
import {
  config,
  createLLMClient,
  GraphCalendarClient,
  runCalendarSync,
  runFollowupTick,
  runIntentClassification,
} from "@brokercomply/shared";
import { getDb } from "@/lib/db.server";
import { safeEqual } from "@/lib/safe-equal";

// Needs the Node runtime: postgres.js + Graph SDK are not available on Edge.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Graph + LLM calls over hundreds of prospects/events can take a while.
export const maxDuration = 300;

/** How far back / forward to scan calendars for booked demos. */
const CAL_PAST_DAYS = 14;
const CAL_FUTURE_DAYS = 90;

/**
 * The daily prospect sync, triggered by the n8n cron.
 *
 * Runs, in order:
 *  1. Calendar sync — booked demos → `demo_planned` (a live, reliable signal,
 *     always safe to auto-apply);
 *  2. Mail intent classification — ONLY when `PROSPECT_MAIL_AUTOMOVE` is on,
 *     so the funnel is never moved from a stale backfilled archive (the
 *     "delta first, then auto-move" decision). The flag is flipped once the
 *     mail delta ingest is confirmed feeding fresh mail;
 *  3. Follow-up tick — recompute cadences and materialise/cancel tasks.
 *
 * Authenticated like the other n8n endpoints: an unguessable token in the URL
 * path, constant-time compared, 404 on mismatch.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  if (!config.N8N_CALLBACK_TOKEN || !safeEqual(token, config.N8N_CALLBACK_TOKEN)) {
    return new NextResponse("Not found", { status: 404 });
  }

  const db = getDb();
  const now = new Date();
  const result: Record<string, unknown> = { ok: true, at: now.toISOString() };

  try {
    // 1. Calendar — always. Reads the live calendar, not the archive.
    if (config.AZURE_TENANT_ID && config.AZURE_CLIENT_ID && config.AZURE_CLIENT_SECRET) {
      const calendar = new GraphCalendarClient({
        tenantId: config.AZURE_TENANT_ID,
        clientId: config.AZURE_CLIENT_ID,
        clientSecret: config.AZURE_CLIENT_SECRET,
      });
      const since = new Date(now.getTime() - CAL_PAST_DAYS * 86_400_000);
      const until = new Date(now.getTime() + CAL_FUTURE_DAYS * 86_400_000);
      result.calendar = await runCalendarSync(
        { db, calendar },
        config.OFFICER_MAILBOXES,
        since,
        until,
      );
    } else {
      result.calendar = "skipped (no Azure credentials)";
    }

    // 2. Mail — gated until the delta archive is fresh.
    if (config.PROSPECT_MAIL_AUTOMOVE) {
      result.mail = await runIntentClassification({ db, llm: createLLMClient() }, now);
    } else {
      result.mail = "skipped (PROSPECT_MAIL_AUTOMOVE off)";
    }

    // 3. Cadence tick.
    const tick = await runFollowupTick({ db }, now);
    result.tick = {
      transitioned: tick.transitioned,
      tasksCreated: tick.tasks.created,
      tasksCancelled: tick.tasks.cancelled,
    };

    return NextResponse.json(result);
  } catch (err) {
    console.error("[prospects/daily-sync] failed", err);
    return NextResponse.json({ ok: false, error: "daily sync failed" }, { status: 500 });
  }
}
