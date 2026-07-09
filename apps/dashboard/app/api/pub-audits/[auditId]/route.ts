import { NextResponse } from "next/server";
import { savePubAuditEdits } from "@/lib/pub-audit.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface SaveBody {
  edits?: unknown;
}

/** Save the officer's pub-report edits without generating a PDF ("Enregistrer"). */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ auditId: string }> },
) {
  const { auditId } = await params;

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

  const ok = await savePubAuditEdits(auditId, body.edits);
  if (!ok) {
    return NextResponse.json({ ok: false, error: "unknown audit" }, { status: 404 });
  }
  return NextResponse.json({ ok: true }, { status: 200 });
}
