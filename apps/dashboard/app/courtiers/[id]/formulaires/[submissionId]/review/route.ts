import { NextResponse } from "next/server";
import { getSubmissionReview } from "@/lib/formulaires.server";
import { injectCfg } from "@/lib/review-html";

// Serves the editor HTML stored by n8n: needs Node (postgres.js) and must not be cached.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; submissionId: string }> },
) {
  const { id: brokerSlug, submissionId } = await params;
  const review = await getSubmissionReview(submissionId);
  // 404 also when the slug in the URL doesn't own this submission (no cross-broker peeking).
  if (!review || review.brokerSlug !== brokerSlug) {
    return new NextResponse("Relecture introuvable", { status: 404 });
  }

  const html = injectCfg(review.html, {
    token: submissionId,
    // Same-origin endpoints (this page is served by BrokerComply).
    saveUrl: `/api/reviews/${submissionId}`,
    submitUrl: `/api/reviews/${submissionId}/pdf`, // the "Générer le PDF" button posts here
    pdfUrl: `/api/reviews/${submissionId}/pdf`,
    initialEdits: review.edits ?? null,
  });

  return new NextResponse(html, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}
