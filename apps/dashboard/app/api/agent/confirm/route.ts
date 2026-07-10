import { NextResponse, type NextRequest } from "next/server";
import { resolveConfirmation } from "@/lib/agent/confirmations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Resolve a pending irreversible-action confirmation. Body: `{ id, approved }`.
 * The parked PreToolUse hook in the agent turn continues with allow/deny.
 */
export async function POST(req: NextRequest): Promise<Response> {
  const body = (await req.json().catch(() => ({}))) as { id?: unknown; approved?: unknown };
  const id = typeof body.id === "string" ? body.id : "";
  const approved = body.approved === true;
  if (!id) return new Response("Missing confirmation id", { status: 400 });
  const found = resolveConfirmation(id, approved);
  if (!found) return NextResponse.json({ ok: false, reason: "expired_or_unknown" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
