import { NextResponse } from "next/server";
import { saveReviewEdits } from "@/lib/formulaires.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface SaveBody {
  edits?: unknown;
}

/**
 * Save the officer's review edits without generating a PDF ("Enregistrer").
 * Same-origin only — served alongside the review HTML on the private network.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ submissionId: string }> },
) {
  const { submissionId } = await params;

  let body: SaveBody;
  try {
    body = (await req.json()) as SaveBody;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });
  }
  if (!body.edits || typeof body.edits !== "object") {
    return NextResponse.json({ ok: false, error: "missing edits" }, { status: 400 });
  }
  if (JSON.stringify(body.edits).length > 1_000_000) {
    return NextResponse.json({ ok: false, error: "edits too large" }, { status: 413 });
  }

  const ok = await saveReviewEdits(submissionId, body.edits);
  if (!ok) {
    return NextResponse.json({ ok: false, error: "unknown submission" }, { status: 404 });
  }
  return NextResponse.json({ ok: true }, { status: 200 });
}
