import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { config } from "@brokercomply/shared";
import { recordN8nCallback } from "@/lib/formulaires.server";

// Needs the Node runtime: postgres.js + node:crypto are not available on Edge.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Constant-time string compare. Pads both buffers to the same length so
 * `timingSafeEqual` always runs — an early length-mismatch return would leak
 * the secret's length through response timing.
 */
function safeEqual(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  const len = Math.max(ba.length, bb.length);
  const pa = Buffer.alloc(len);
  const pb = Buffer.alloc(len);
  ba.copy(pa);
  bb.copy(pb);
  return timingSafeEqual(pa, pb) && ba.length === bb.length;
}

interface N8nCallbackBody {
  submissionId?: unknown;
  kind?: unknown;
  status?: unknown;
  html?: unknown;
  pdfBase64?: unknown;
  result?: unknown;
  error?: unknown;
}

/**
 * Inbound n8n result callback — the mirror of the Fillout webhook. When a
 * workflow finishes, its final HTTP Request node POSTs the outcome back here so
 * the submission can move from 'triggered' to 'done' / 'error' and store the
 * result. Authenticated like the Fillout webhook: an unguessable token in the
 * URL path AND an `X-Callback-Secret` header. The submission is located by the
 * `submissionId` we sent in the trigger payload (the correlation key).
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  // 1. URL token — 404 (not 401) so the endpoint's existence isn't confirmed.
  if (!config.N8N_CALLBACK_TOKEN || !safeEqual(token, config.N8N_CALLBACK_TOKEN)) {
    return new NextResponse("Not found", { status: 404 });
  }

  // 2. Shared-secret header.
  const secret = req.headers.get("x-callback-secret");
  if (!config.N8N_CALLBACK_SECRET || !safeEqual(secret, config.N8N_CALLBACK_SECRET)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  // 3. Parse + minimal shape validation.
  let body: N8nCallbackBody;
  try {
    body = (await req.json()) as N8nCallbackBody;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });
  }
  if (!body || typeof body.submissionId !== "string") {
    return NextResponse.json({ ok: false, error: "missing submissionId" }, { status: 400 });
  }

  try {
    const res = await recordN8nCallback({
      submissionId: body.submissionId,
      kind: typeof body.kind === "string" ? body.kind : null,
      status: typeof body.status === "string" ? body.status : null,
      html: typeof body.html === "string" ? body.html : null,
      pdfBase64: typeof body.pdfBase64 === "string" ? body.pdfBase64 : null,
      result: body.result,
      error: typeof body.error === "string" ? body.error : null,
    });
    // Unknown submission → 404 so n8n surfaces the bad correlation id.
    if (!res.found) {
      return NextResponse.json({ ok: false, error: "unknown submissionId" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, status: res.status }, { status: 200 });
  } catch (e) {
    console.error("[n8n callback] failed", e);
    return NextResponse.json({ ok: false, error: "callback failed" }, { status: 500 });
  }
}
