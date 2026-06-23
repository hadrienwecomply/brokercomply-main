import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { config, type FilloutSubmission } from "@brokercomply/shared";
import { ingestFilloutSubmission } from "@/lib/formulaires.server";

// Needs the Node runtime: postgres.js + node:crypto are not available on Edge.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Constant-time string compare that won't throw on length mismatch. */
function safeEqual(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

/**
 * Inbound Fillout webhook. Fillout has no HMAC signing, so we authenticate with
 * two independent shared secrets: an unguessable token in the URL path AND an
 * `X-Webhook-Secret` header (both configured in Fillout → Integrate → Webhook).
 * Always responds 200 on success — including idempotent duplicates — so Fillout
 * stops retrying. See `ingestFilloutSubmission` for the matching/trigger logic.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  // 1. URL token — 404 (not 401) so the endpoint's existence isn't confirmed.
  if (!config.FILLOUT_URL_TOKEN || !safeEqual(token, config.FILLOUT_URL_TOKEN)) {
    return new NextResponse("Not found", { status: 404 });
  }

  // 2. Shared-secret header.
  const secret = req.headers.get("x-webhook-secret");
  if (!config.FILLOUT_WEBHOOK_SECRET || !safeEqual(secret, config.FILLOUT_WEBHOOK_SECRET)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  // 3. Parse + minimal shape validation.
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });
  }
  const submission = body as FilloutSubmission;
  if (!submission || typeof submission.submissionId !== "string") {
    return NextResponse.json({ ok: false, error: "missing submissionId" }, { status: 400 });
  }

  try {
    const result = await ingestFilloutSubmission(submission);
    return NextResponse.json({ ok: true, ...result }, { status: 200 });
  } catch (e) {
    console.error("[fillout webhook] ingest failed", e);
    return NextResponse.json({ ok: false, error: "ingest failed" }, { status: 500 });
  }
}
