import { NextResponse } from "next/server";
import { getSubmissionReview } from "@/lib/formulaires.server";

// Serves the editor HTML stored by n8n: needs Node (postgres.js) and must not be cached.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Rewrite the editor's `<script id="__cfg">` so the page talks to BrokerComply
 * instead of posting straight to n8n: our save/PDF endpoints, the submission id
 * as correlation token, and the officer's previously-saved edits to replay. The
 * original metaFile/format/client fields are preserved by merging over them.
 */
function injectCfg(html: string, overrides: Record<string, unknown>): string {
  const re = /(<script[^>]*id="__cfg"[^>]*>)([\s\S]*?)(<\/script>)/;
  const m = html.match(re);
  let base: Record<string, unknown> = {};
  if (m) {
    try {
      base = JSON.parse(m[2]);
    } catch {
      base = {};
    }
  }
  // Escape `<` so officer-entered text can never break out of the script tag.
  const json = JSON.stringify({ ...base, ...overrides }).replace(/</g, "\\u003c");
  if (m) return html.replace(re, (_all, p1: string, _p2: string, p3: string) => p1 + json + p3);
  // Fallback: no __cfg in the template — inject one as the first thing in <body>.
  return html.replace(
    /<body([^>]*)>/i,
    (_all, attrs: string) =>
      `<body${attrs}><script type="application/json" id="__cfg">${json}</script>`,
  );
}

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
