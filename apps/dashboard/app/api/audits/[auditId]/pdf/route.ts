import { NextResponse } from "next/server";
import { requestWebsiteAuditPdf } from "@/lib/website-audit.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface PdfBody {
  edits?: unknown;
}

/**
 * Save the latest edits and trigger the n8n branded-report workflow
 * ("Générer le PDF"). Response shape matches the editor's expectations:
 * `{ ok: true }` on success or `{ ok: false, errors: [...] }`.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ auditId: string }> },
) {
  const { auditId } = await params;

  let body: PdfBody;
  try {
    body = (await req.json()) as PdfBody;
  } catch {
    return NextResponse.json({ ok: false, errors: ["Requête invalide."] }, { status: 400 });
  }
  if (!body.edits || typeof body.edits !== "object") {
    return NextResponse.json({ ok: false, errors: ["Aucune modification à envoyer."] }, { status: 400 });
  }
  if (JSON.stringify(body.edits).length > 1_000_000) {
    return NextResponse.json({ ok: false, errors: ["Modifications trop volumineuses."] }, { status: 413 });
  }

  const res = await requestWebsiteAuditPdf(auditId, body.edits);
  if (!res.found) {
    return NextResponse.json({ ok: false, errors: ["Audit introuvable."] }, { status: 404 });
  }
  if (!res.ok) {
    return NextResponse.json(
      { ok: false, errors: [res.error ?? "Échec de la génération du PDF."] },
      { status: 200 },
    );
  }
  return NextResponse.json({ ok: true }, { status: 200 });
}
