import { NextResponse } from "next/server";
import { getPubAuditReview } from "@/lib/pub-audit.server";
import { injectCfg } from "@/lib/review-html";

// Serves the editable pub report: needs Node (postgres.js), never cached.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; auditId: string }> },
) {
  const { id: brokerSlug, auditId } = await params;
  const review = await getPubAuditReview(auditId);
  // 404 also when the slug in the URL doesn't own this audit (no cross-broker peeking).
  if (!review || review.brokerSlug !== brokerSlug) {
    return new NextResponse("Audit introuvable", { status: 404 });
  }

  const html = injectCfg(review.html, {
    token: auditId,
    saveUrl: `/api/pub-audits/${auditId}`,
    submitUrl: `/api/pub-audits/${auditId}/pdf`, // the "Générer le PDF" button posts here
    initialEdits: review.edits ?? null,
  });

  return new NextResponse(html, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}
