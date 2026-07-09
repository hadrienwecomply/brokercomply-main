import "server-only";
import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import {
  applyPubEdits,
  config,
  createLLMClient,
  createPubAudit,
  getBrokerById,
  getBrokerBySlug,
  getPubAuditById,
  listPubAuditsForBroker,
  PubAuditPayloadSchema,
  renderPubHtml,
  runPubAudit,
  updatePubAudit,
  type PubAuditPayload,
  type PubAuditRow,
} from "@brokercomply/shared";
import { getDb } from "./db.server";

/** A pub-audit row flattened for the "Audit pub" tab. */
export interface PubAuditView {
  id: string;
  batchId: string;
  fileName: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  errorMessage: string | null;
  hasReview: boolean;
  reviewStatus: string | null;
  pdfRef: string | null;
  niveau: { code: string; libelle: string } | null;
  decompte: { non_conforme: number; a_verifier: number; conforme: number; non_applicable: number } | null;
}

function toView(row: PubAuditRow): PubAuditView {
  const findings = row.findings as PubAuditPayload | null;
  return {
    id: row.id,
    batchId: row.batchId,
    fileName: row.fileName,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    errorMessage: row.errorMessage,
    hasReview: row.reviewHtml != null,
    reviewStatus: row.reviewStatus,
    pdfRef: row.pdfRef,
    niveau: findings ? { code: findings.niveauGlobal.code, libelle: findings.niveauGlobal.libelle } : null,
    decompte: findings ? findings.niveauGlobal.decompte : null,
  };
}

/** Max images analysed at once in a batch (each does up to 4 vision calls). */
const PUB_AUDIT_JOB_CONCURRENCY = 3;

/** Run audit jobs with bounded concurrency; failures are isolated per job. */
async function runJobPool(auditIds: string[], size: number): Promise<void> {
  const queue = [...auditIds];
  await Promise.all(
    Array.from({ length: Math.min(size, queue.length) }, async () => {
      for (;;) {
        const id = queue.shift();
        if (id === undefined) return;
        try {
          await runPubAuditJob(id);
        } catch (e) {
          console.error("[pub-audit] runPubAuditJob failed", e);
        }
      }
    }),
  );
}

interface AuditBroker {
  slug: string;
  societe: string;
  /** Logo as a `data:...;base64,...` URI, or null. */
  logo: string | null;
  primaryColor: string | null;
}

async function getBrokerBySlugId(brokerDbId: string): Promise<AuditBroker | null> {
  const found = await getBrokerById({ db: getDb() }, brokerDbId);
  if (!found) return null;
  const b = found.broker;
  const logo = b.logoBase64
    ? `data:${b.logoMimeType ?? "image/png"};base64,${b.logoBase64}`
    : null;
  return { slug: b.slug, societe: b.societe, logo, primaryColor: b.primaryColor ?? null };
}

/** Build the report `branding` slot (logo + brand colour) from a broker, or undefined. */
function brandingFor(broker: AuditBroker | null): PubAuditPayload["branding"] | undefined {
  if (!broker) return undefined;
  const branding: NonNullable<PubAuditPayload["branding"]> = { firmName: broker.societe };
  if (broker.logo) branding.logoUrl = broker.logo;
  if (broker.primaryColor) branding.primaryColor = broker.primaryColor;
  return branding;
}

/**
 * Analyse one uploaded ad. Fire-and-forget from the upload route: statuses land
 * in the row and the UI polls them (router.refresh). Runs detached, OUTSIDE any
 * request context — must never call revalidatePath (see website-audit.server).
 */
async function runPubAuditJob(auditId: string): Promise<void> {
  const db = getDb();
  const row = await getPubAuditById({ db }, auditId);
  if (!row) return;
  const broker = await getBrokerBySlugId(row.brokerId);

  try {
    await updatePubAudit({ db }, auditId, { status: "running", errorMessage: null });

    const llm = createLLMClient();
    const result = await runPubAudit(llm, {
      fileName: row.fileName,
      imageBase64: row.imageBase64,
      imageMediaType: row.imageMimeType,
      entiteName: broker?.societe,
      branding: brandingFor(broker),
    });

    const html = renderPubHtml(result.payload);
    // Surface partial failures (a vision pass errored → its checks fell back to
    // "à vérifier") without failing the whole audit, so the officer sees it.
    const passWarning =
      result.errors.length > 0
        ? `Analyse partielle : ${result.errors.length} passe(s) en échec (${result.errors
            .map((e) => e.pass)
            .join(", ")}) — contrôle manuel recommandé pour les points « à vérifier ».`
        : null;
    await updatePubAudit({ db }, auditId, {
      status: "review_pending",
      findings: result.payload,
      qualification: result.qualification,
      reviewHtml: html,
      reviewStatus: "pending",
      errorMessage: passWarning,
    });
  } catch (error) {
    await updatePubAudit({ db }, auditId, {
      status: "error",
      errorMessage: error instanceof Error ? error.message : String(error),
    });
  }
}

export interface UploadedImage {
  fileName: string;
  base64: string;
  mimeType: string;
}

export interface StartPubAuditResult {
  ok: boolean;
  batchId?: string;
  auditIds?: string[];
  error?: string;
}

/**
 * Create one queued pub audit per uploaded image (sharing a batch id) and kick
 * each analysis job off. Each image is analysed independently (one report per
 * ad, per the skill).
 */
export async function startPubAuditsFromUpload(
  slug: string,
  images: UploadedImage[],
): Promise<StartPubAuditResult> {
  const db = getDb();
  const plan = await getBrokerBySlug({ db }, slug);
  if (!plan) return { ok: false, error: "Courtier introuvable" };
  if (images.length === 0) return { ok: false, error: "Aucune image fournie." };

  const batchId = randomUUID();
  const auditIds: string[] = [];
  for (const img of images) {
    const row = await createPubAudit(
      { db },
      {
        brokerId: plan.broker.id,
        fileName: img.fileName,
        imageBase64: img.base64,
        imageMimeType: img.mimeType,
        batchId,
      },
    );
    auditIds.push(row.id);
  }

  // Run the batch through a small concurrency pool instead of firing every job
  // at once: each audit does up to 4 vision calls, so 20 images launched
  // simultaneously would burst ~80 concurrent Anthropic requests. Detached from
  // the request (UI polls); the .catch() is a hard safety net.
  void runJobPool(auditIds, PUB_AUDIT_JOB_CONCURRENCY).catch((e) =>
    console.error("[pub-audit] batch pool failed", e),
  );

  revalidatePath(`/courtiers/${slug}`);
  return { ok: true, batchId, auditIds };
}

/** Re-run a finished/stuck pub audit in place ("Relancer"). */
export async function retryPubAudit(auditId: string): Promise<{ ok: boolean; error?: string }> {
  const db = getDb();
  const row = await getPubAuditById({ db }, auditId);
  if (!row) return { ok: false, error: "Audit introuvable" };
  await updatePubAudit({ db }, auditId, { status: "queued", errorMessage: null });
  void runPubAuditJob(auditId).catch((e) => console.error("[pub-audit] runPubAuditJob failed", e));
  return { ok: true };
}

/** Audits of a broker (newest first), flattened for the UI. */
export async function listPubAudits(brokerDbId: string): Promise<PubAuditView[]> {
  const rows = await listPubAuditsForBroker({ db: getDb() }, brokerDbId);
  return rows.map(toView);
}

export interface PubAuditReview {
  html: string;
  edits: unknown;
  brokerSlug: string;
}

/** Load a pub audit's editable report HTML + saved edits (null if none yet). */
export async function getPubAuditReview(auditId: string): Promise<PubAuditReview | null> {
  const db = getDb();
  const row = await getPubAuditById({ db }, auditId);
  if (!row || row.reviewHtml == null) return null;
  const broker = await getBrokerBySlugId(row.brokerId);
  return { html: row.reviewHtml, edits: row.reviewEdits ?? null, brokerSlug: broker?.slug ?? "" };
}

/** Persist the officer's edits without generating a PDF ("Enregistrer"). */
export async function savePubAuditEdits(auditId: string, edits: unknown): Promise<boolean> {
  const db = getDb();
  const row = await updatePubAudit({ db }, auditId, { reviewEdits: edits, reviewStatus: "edited" });
  if (!row) return false;
  const broker = await getBrokerBySlugId(row.brokerId);
  if (broker) revalidatePath(`/courtiers/${broker.slug}`);
  return true;
}

export interface RequestPubPdfResult {
  ok: boolean;
  found: boolean;
  error?: string;
}

/**
 * Save the latest edits, re-inject them into the payload and trigger the n8n
 * pub-report workflow ("Générer le PDF"). The workflow renders the branded PDF
 * and posts it back via the n8n callback with a pubAuditId correlation key.
 * Optimistic status with rollback.
 */
export async function requestPubAuditPdf(auditId: string, edits: unknown): Promise<RequestPubPdfResult> {
  const db = getDb();
  const row = await updatePubAudit({ db }, auditId, {
    reviewEdits: edits,
    reviewStatus: "pdf_requested",
  });
  if (!row) return { ok: false, found: false };

  const broker = await getBrokerBySlugId(row.brokerId);
  const brokerPath = broker ? `/courtiers/${broker.slug}` : null;
  if (brokerPath) revalidatePath(brokerPath);

  const rollback = async (error: string): Promise<RequestPubPdfResult> => {
    await updatePubAudit({ db }, auditId, { reviewStatus: "edited" });
    if (brokerPath) revalidatePath(brokerPath);
    return { ok: false, found: true, error };
  };

  const url = config.N8N_PUB_RAPPORT_WEBHOOK_URL ?? config.N8N_RAPPORT_WEBHOOK_URL;
  if (!url) return rollback("N8N_PUB_RAPPORT_WEBHOOK_URL non configuré");

  const base = row.findings as PubAuditPayload | null;
  if (!base) return rollback("Payload d'audit introuvable — relancez l'audit.");

  let payload: PubAuditPayload;
  try {
    payload = applyPubEdits(PubAuditPayloadSchema.parse(base), edits);
    const branding = brandingFor(broker);
    if (branding) payload = { ...payload, branding: { ...payload.branding, ...branding } };
  } catch (e) {
    return rollback(
      `Modifications invalides : ${e instanceof Error ? e.message.slice(0, 200) : "format inattendu"}`,
    );
  }

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
        source: "pub-audit",
        pubAuditId: auditId,
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
 * Record the PDF posted back by the n8n pub-report workflow (callback with a
 * pubAuditId correlation key).
 */
export async function recordPubPdfCallback(input: {
  pubAuditId: string;
  status?: string | null;
  pdfBase64?: string | null;
  error?: string | null;
}): Promise<{ found: boolean }> {
  const db = getDb();
  const isError = input.status === "error" || !input.pdfBase64;
  const row = await updatePubAudit(
    { db },
    input.pubAuditId,
    isError
      ? { reviewStatus: "edited", errorMessage: input.error ?? "Génération PDF échouée" }
      : {
          reviewStatus: "pdf_ready",
          pdfBase64: input.pdfBase64!,
          pdfRef: `/api/pub-audits/${input.pubAuditId}/pdf/file`,
        },
  );
  if (!row) return { found: false };
  const broker = await getBrokerBySlugId(row.brokerId);
  if (broker) revalidatePath(`/courtiers/${broker.slug}`);
  return { found: true };
}

export interface PubAuditPdf {
  base64: string;
  filename: string;
}

/** Load the stored PDF for a pub audit (null if none yet). */
export async function getPubAuditPdf(auditId: string): Promise<PubAuditPdf | null> {
  const db = getDb();
  const row = await getPubAuditById({ db }, auditId);
  if (!row || row.pdfBase64 == null) return null;
  const broker = await getBrokerBySlugId(row.brokerId);
  return { base64: row.pdfBase64, filename: `audit-pub-${broker?.slug ?? "courtier"}-${auditId.slice(0, 8)}.pdf` };
}
