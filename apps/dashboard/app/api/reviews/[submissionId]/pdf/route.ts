import { NextResponse } from "next/server";
import { requestPdf } from "@/lib/formulaires.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface PdfBody {
  edits?: unknown;
}

/**
 * Save the latest edits and trigger the n8n PDF workflow ("Générer le PDF").
 * Response shape matches what the editor expects: `{ ok: true }` on success, or
 * `{ ok: false, errors: [...] }` so it surfaces the message inline.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ submissionId: string }> },
) {
  const { submissionId } = await params;

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

  const res = await requestPdf(submissionId, body.edits);
  if (!res.found) {
    return NextResponse.json({ ok: false, errors: ["Soumission introuvable."] }, { status: 404 });
  }
  if (!res.ok) {
    return NextResponse.json(
      { ok: false, errors: [res.error ?? "Échec de la génération du PDF."] },
      { status: 200 },
    );
  }
  return NextResponse.json({ ok: true }, { status: 200 });
}
