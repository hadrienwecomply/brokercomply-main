import { NextResponse } from "next/server";
import { saveWebsiteAuditEdits } from "@/lib/website-audit.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface SaveBody {
  edits?: unknown;
}

/**
 * Save the officer's audit-report edits without generating a PDF
 * ("Enregistrer"). Same-origin only — served on the private network.
 */
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

  const ok = await saveWebsiteAuditEdits(auditId, body.edits);
  if (!ok) {
    return NextResponse.json({ ok: false, error: "unknown audit" }, { status: 404 });
  }
  return NextResponse.json({ ok: true }, { status: 200 });
}
