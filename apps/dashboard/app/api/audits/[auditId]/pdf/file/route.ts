import { NextResponse } from "next/server";
import { getWebsiteAuditPdf } from "@/lib/website-audit.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Serve the stored audit PDF. Interim home until doc-sync uploads report PDFs
 * to the broker's SharePoint folder (then pdfRef becomes the SharePoint URL).
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ auditId: string }> },
) {
  const { auditId } = await params;
  const pdf = await getWebsiteAuditPdf(auditId);
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
