import { NextResponse } from "next/server";
import { getSubmissionPdf } from "@/lib/formulaires.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Serve the temporarily-stored PDF for a submission. This is the interim home
 * for the generated report until the doc-sync subsystem lands and PDFs move to
 * the broker's SharePoint folder; `pdfRef` then becomes the SharePoint URL and
 * this route is retired.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ submissionId: string }> },
) {
  const { submissionId } = await params;
  const pdf = await getSubmissionPdf(submissionId);
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
