import { NextResponse } from "next/server";
import { config, runFollowupTick } from "@brokercomply/shared";
import { getDb } from "@/lib/db.server";
import { safeEqual } from "@/lib/safe-equal";

// Needs the Node runtime: postgres.js + node:crypto are not available on Edge.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Daily follow-up pass, callable by the n8n cron.
 *
 * Same job as the board's « Recalculer » button: recompute every cadence stage,
 * then materialize the due tasks and cancel the moot ones. Until this existed,
 * the whole cadence only advanced when a human happened to click — a prospect
 * could sit a week past its J+15 call with no task to show for it.
 *
 * Authenticated like the n8n callback: an unguessable token in the URL path,
 * compared in constant time, 404 on mismatch so the endpoint's existence is
 * never confirmed. It reuses `N8N_CALLBACK_TOKEN` because the caller and the
 * trust boundary are the same — n8n talking to the app over the network.
 *
 * Idempotent: running it twice in a row is a no-op the second time (the unique
 * partial index on open cadence tasks makes re-insertion a conflict).
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  if (!config.N8N_CALLBACK_TOKEN || !safeEqual(token, config.N8N_CALLBACK_TOKEN)) {
    return new NextResponse("Not found", { status: 404 });
  }

  try {
    const summary = await runFollowupTick({ db: getDb() });
    return NextResponse.json({
      ok: true,
      scanned: summary.scanned,
      transitioned: summary.transitioned,
      remindersDue: summary.remindersDue.length,
      addedToCallList: summary.addedToCallList.length,
      tasksCreated: summary.tasks.created,
      tasksCancelled: summary.tasks.cancelled,
    });
  } catch (err) {
    console.error("[prospects/tick] follow-up pass failed", err);
    return NextResponse.json({ ok: false, error: "tick failed" }, { status: 500 });
  }
}
