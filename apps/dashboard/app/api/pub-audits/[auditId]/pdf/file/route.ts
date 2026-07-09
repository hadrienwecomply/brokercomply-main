import { NextResponse } from "next/server";
import { getPubAuditPdf } from "@/lib/pub-audit.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Serve the stored pub-audit PDF (interim home until doc-sync uploads to SharePoint). */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ auditId: string }> },
) {
  const { auditId } = await params;
  const pdf = await getPubAuditPdf(auditId);
  if (!pdf) {
    return new NextResponse("PDF introuvable", { status: 404 });
  }

  const bytes = Buffer.from(pdf.base64, "base64");
  return new NextResponse(bytes, {
    status: 200,
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="${pdf.filename}"`,
    },
  });
}
