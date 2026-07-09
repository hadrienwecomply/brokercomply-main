import "server-only";
import { revalidatePath } from "next/cache";
import {
  applyAuditEdits,
  AuditPayloadSchema,
  config,
  createLLMClient,
  createWebsiteAudit,
  getBrokerById,
  getBrokerBySlug,
  getWebsiteAuditById,
  JS_RENDER_SUSPECT_CHARS,
  listWebsiteAuditsForBroker,
  renderAuditHtml,
  runWebsiteAudit,
  updateWebsiteAudit,
  type AuditPayload,
  type WebsiteAuditRow,
} from "@brokercomply/shared";
import { getDb } from "./db.server";

/** An audit row flattened for the "Audit site web" tab. */
export interface WebsiteAuditView {
  id: string;
  websiteUrl: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  errorMessage: string | null;
  hasReview: boolean;
  reviewStatus: string | null;
  pdfRef: string | null;
  summary: { critiques: number; ameliorations: number; conformes: number; aVerifier: number } | null;
}

function toView(row: WebsiteAuditRow): WebsiteAuditView {
  const findings = row.findings as AuditPayload | null;
  return {
    id: row.id,
    websiteUrl: row.websiteUrl,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    errorMessage: row.errorMessage,
    hasReview: row.reviewHtml != null,
    reviewStatus: row.reviewStatus,
    pdfRef: row.pdfRef,
    summary: findings?.summary ?? null,
  };
}

/**
 * Run the audit pipeline for a queued row. Fire-and-forget from the server
 * action: statuses land in the row and the UI polls them (router.refresh).
 *
 * IMPORTANT: this runs detached, OUTSIDE any request/action context, so it must
 * never call revalidatePath (Next forbids it outside actions/route handlers and
 * an unhandled throw here would crash the server). The UI's polling reads fresh
 * status on each refresh, so no revalidation is needed. A stuck 'queued'/
 * 'running' row (server restart mid-run) is recovered via the "Relancer" button.
 */
async function runAuditJob(auditId: string): Promise<void> {
  const db = getDb();
  const row = await getWebsiteAuditById({ db }, auditId);
  if (!row) return;
  const broker = await getBrokerBySlugId(row.brokerId);

  try {
    await updateWebsiteAudit({ db }, auditId, { status: "running", errorMessage: null });

    const llm = createLLMClient();
    const result = await runWebsiteAudit(llm, {
      url: row.websiteUrl,
      entity: {
        name: broker?.societe ?? "Courtier",
        bce: broker?.bce ?? undefined,
        fsmaStatus: broker?.fsmaNumber ? `n° FSMA ${broker.fsmaNumber} (catégories à confirmer)` : undefined,
      },
      visual: true,
    });

    // Nothing usable was extracted anywhere → an officer must look manually.
    const allTiny = result.scraped.pages.every((p) => p.text.length < JS_RENDER_SUSPECT_CHARS);
    const pagesFetched = {
      analysed: result.scraped.pages.map((p) => ({ url: p.url, chars: p.text.length })),
      failed: result.scraped.failed,
      visualAvailable: result.visual?.available ?? false,
      checkerErrors: result.errors,
    };

    if (allTiny) {
      await updateWebsiteAudit({ db }, auditId, {
        status: "needs_manual",
        findings: result.payload,
        constats: result.constats,
        pagesFetched,
        errorMessage:
          "Contenu textuel quasi inexistant (site JavaScript/frameset non rendu) — audit manuel recommandé.",
      });
      return;
    }

    const html = renderAuditHtml(result.payload);
    await updateWebsiteAudit({ db }, auditId, {
      status: "review_pending",
      findings: result.payload,
      constats: result.constats,
      pagesFetched,
      reviewHtml: html,
      reviewStatus: "pending",
    });
  } catch (error) {
    await updateWebsiteAudit({ db }, auditId, {
      status: "error",
      errorMessage: error instanceof Error ? error.message : String(error),
    });
  }
  // No revalidatePath here: see the note above. The client polls for status.
}

/** Broker row by db id (audits store brokerId; views need slug + identity). */
async function getBrokerBySlugId(
  brokerDbId: string,
): Promise<{ slug: string; societe: string; bce: string | null; fsmaNumber: string | null } | null> {
  const found = await getBrokerById({ db: getDb() }, brokerDbId);
  if (!found) return null;
  const b = found.broker;
  return { slug: b.slug, societe: b.societe, bce: b.bce, fsmaNumber: b.fsmaNumber };
}

export interface StartAuditResult {
  ok: boolean;
  auditId?: string;
  error?: string;
}

/** Insert a queued audit for the broker's website and kick the job off. */
export async function startWebsiteAudit(slug: string): Promise<StartAuditResult> {
  const db = getDb();
  const plan = await getBrokerBySlug({ db }, slug);
  if (!plan) return { ok: false, error: "Courtier introuvable" };
  const broker = plan.broker;
  const website = broker.website?.trim();
  if (!website) {
    return { ok: false, error: "Aucun site web renseigné pour ce courtier (fiche → champ Site web)." };
  }
  const url = /^https?:\/\//i.test(website) ? website : `https://${website}`;

  const row = await createWebsiteAudit({ db }, { brokerId: broker.id, websiteUrl: url });
  // Detached: the action returns immediately, statuses are polled by the UI.
  // The .catch() is a hard safety net — a throw in the background job must never
  // become an unhandledRejection that crashes the server.
  void runAuditJob(row.id).catch((e) => console.error("[website-audit] runAuditJob failed", e));

  revalidatePath(`/courtiers/${slug}`);
  return { ok: true, auditId: row.id };
}

/** Re-run a finished/stuck audit in place (UI "Relancer" action). */
export async function retryWebsiteAudit(auditId: string): Promise<StartAuditResult> {
  const db = getDb();
  const row = await getWebsiteAuditById({ db }, auditId);
  if (!row) return { ok: false, error: "Audit introuvable" };
  await updateWebsiteAudit({ db }, auditId, { status: "queued", errorMessage: null });
  void runAuditJob(auditId).catch((e) => console.error("[website-audit] runAuditJob failed", e));
  return { ok: true, auditId };
}

/** Audits of a broker (newest first), flattened for the UI. */
export async function listWebsiteAudits(brokerDbId: string): Promise<WebsiteAuditView[]> {
  const rows = await listWebsiteAuditsForBroker({ db: getDb() }, brokerDbId);
  return rows.map(toView);
}

export interface AuditReview {
  html: string;
  edits: unknown;
  brokerSlug: string;
}

/** Load an audit's editable report HTML + saved edits (null if none yet). */
export async function getWebsiteAuditReview(auditId: string): Promise<AuditReview | null> {
  const db = getDb();
  const row = await getWebsiteAuditById({ db }, auditId);
  if (!row || row.reviewHtml == null) return null;
  const broker = await getBrokerBySlugId(row.brokerId);
  return { html: row.reviewHtml, edits: row.reviewEdits ?? null, brokerSlug: broker?.slug ?? "" };
}

/** Persist the officer's edits without generating a PDF ("Enregistrer"). */
export async function saveWebsiteAuditEdits(auditId: string, edits: unknown): Promise<boolean> {
  const db = getDb();
  const row = await updateWebsiteAudit({ db }, auditId, {
    reviewEdits: edits,
    reviewStatus: "edited",
  });
  if (!row) return false;
  const broker = await getBrokerBySlugId(row.brokerId);
  if (broker) revalidatePath(`/courtiers/${broker.slug}`);
  return true;
}

export interface RequestAuditPdfResult {
  ok: boolean;
  found: boolean;
  error?: string;
}

/**
 * Save the latest edits, re-inject them into the payload and trigger the n8n
 * branded-report workflow ("Générer le PDF"). The workflow renders the PDF
 * from the payload (payload.schema.json contract) and posts it back via the
 * n8n callback with kind='pdf' + auditId. Optimistic status with rollback.
 */
export async function requestWebsiteAuditPdf(
  auditId: string,
  edits: unknown,
): Promise<RequestAuditPdfResult> {
  const db = getDb();
  const row = await updateWebsiteAudit({ db }, auditId, {
    reviewEdits: edits,
    reviewStatus: "pdf_requested",
  });
  if (!row) return { ok: false, found: false };

  const broker = await getBrokerBySlugId(row.brokerId);
  const brokerPath = broker ? `/courtiers/${broker.slug}` : null;
  if (brokerPath) revalidatePath(brokerPath);

  const rollback = async (error: string): Promise<RequestAuditPdfResult> => {
    await updateWebsiteAudit({ db }, auditId, { reviewStatus: "edited" });
    if (brokerPath) revalidatePath(brokerPath);
    return { ok: false, found: true, error };
  };

  const url = config.N8N_RAPPORT_WEBHOOK_URL;
  if (!url) return rollback("N8N_RAPPORT_WEBHOOK_URL non configuré");

  const base = row.findings as AuditPayload | null;
  if (!base) return rollback("Payload d'audit introuvable — relancez l'audit.");

  let payload: AuditPayload;
  try {
    payload = applyAuditEdits(AuditPayloadSchema.parse(base), edits);
  } catch (e) {
    return rollback(
      `Modifications invalides : ${e instanceof Error ? e.message.slice(0, 200) : "format inattendu"}`,
    );
  }

  // Tell n8n where to post the PDF back (base + shared token), so the workflow
  // doesn't depend on n8n-side callback env. Secret stays in the n8n credential.
  const callbackUrl = config.N8N_CALLBACK_TOKEN
    ? `${config.N8N_CALLBACK_BASE_URL.replace(/\/+$/, "")}/${config.N8N_CALLBACK_TOKEN}`
    : null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(config.N8N_WEBHOOK_SECRET ? { "x-n8n-secret": config.N8N_WEBHOOK_SECRET } : {}),
      },
      body: JSON.stringify({
        source: "website-audit",
        auditId,
        ...(callbackUrl ? { callbackUrl } : {}),
        broker: broker ? { slug: broker.slug, societe: broker.societe } : null,
        payload,
      }),
      signal: controller.signal,
    });
    if (!res.ok) return rollback(`n8n a répondu ${res.status}`);
    return { ok: true, found: true };
  } catch (e) {
    return rollback(e instanceof Error ? e.message : "Échec de l'appel n8n");
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Record the PDF posted back by the n8n rapport workflow (callback
 * kind='pdf' with an auditId correlation key).
 */
export async function recordAuditPdfCallback(input: {
  auditId: string;
  status?: string | null;
  pdfBase64?: string | null;
  error?: string | null;
}): Promise<{ found: boolean }> {
  const db = getDb();
  const isError = input.status === "error" || !input.pdfBase64;
  const row = await updateWebsiteAudit(
    { db },
    input.auditId,
    isError
      ? { reviewStatus: "edited", errorMessage: input.error ?? "Génération PDF échouée" }
      : {
          reviewStatus: "pdf_ready",
          pdfBase64: input.pdfBase64!,
          pdfRef: `/api/audits/${input.auditId}/pdf/file`,
        },
  );
  if (!row) return { found: false };
  const broker = await getBrokerBySlugId(row.brokerId);
  if (broker) revalidatePath(`/courtiers/${broker.slug}`);
  return { found: true };
}

export interface AuditPdf {
  base64: string;
  filename: string;
}

/** Load the stored PDF for an audit (null if none yet). */
export async function getWebsiteAuditPdf(auditId: string): Promise<AuditPdf | null> {
  const db = getDb();
  const row = await getWebsiteAuditById({ db }, auditId);
  if (!row || row.pdfBase64 == null) return null;
  const broker = await getBrokerBySlugId(row.brokerId);
  return {
    base64: row.pdfBase64,
    filename: `audit-site-${broker?.slug ?? "courtier"}.pdf`,
  };
}
