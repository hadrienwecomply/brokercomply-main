import { NextResponse } from "next/server";
import { checkSession } from "@/lib/session.server";

/**
 * Internal endpoint the Edge middleware calls to enforce DB-side session
 * staleness (deactivated account, changed password) on EVERY request — API
 * routes and server actions included, not just page renders. The middleware
 * can't query Postgres itself (Edge runtime); this route runs on Node.
 *
 * 204 → session ok (or DB unreachable: fail-open, HMAC already checked).
 * 401 → definitively stale/anonymous: the caller must re-authenticate.
 *
 * Results are cached ~30 s in-process (see session.server.ts), so this adds
 * one cheap in-memory lookup per request, not one DB query per request.
 */
export async function GET() {
  const check = await checkSession();
  return check.status === "ok"
    ? new NextResponse(null, { status: 204 })
    : new NextResponse(null, { status: 401 });
}
