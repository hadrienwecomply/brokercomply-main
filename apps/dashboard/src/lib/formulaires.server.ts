import "server-only";
import { revalidatePath } from "next/cache";
import {
  buildN8nPayload,
  config,
  deriveBrokerName,
  extractCandidate,
  getSubmissionById,
  getSubmissionByFilloutId,
  getBrokerById,
  listBrokers,
  listSubmissionsForBroker,
  matchBroker,
  normalizeAnswers,
  recordSubmission,
  triggerN8nWorkflow,
  updateSubmissionStatus,
  type FilloutSubmission,
  type MatchMethod,
} from "@brokercomply/shared";
import { getDb } from "./db.server";
import { patchBroker, seedBroker } from "./brokers.server";
import { getFormTemplate, formTypeLabel } from "./form-template";
import { DEFAULT_OFFICER } from "./officers";

/** A submission flattened for the Formulaires UI tab. */
export interface FormSubmissionView {
  id: string;
  formType: string | null;
  status: string;
  matchMethod: string;
  submittedAt: string | null;
  createdAt: string;
  n8nExecutionId: string | null;
  /** Result posted back by n8n on completion, if any. */
  n8nResult: unknown;
  /** When n8n reported the workflow finished, if any. */
  completedAt: string | null;
  /** True once the diagnostic review HTML is available to edit. */
  hasReview: boolean;
  /** Review lifecycle: 'pending' | 'edited' | 'pdf_requested' | 'pdf_ready' | null. */
  reviewStatus: string | null;
  /** SharePoint reference of the generated PDF, if any. */
  pdfRef: string | null;
  fields: Array<{ questionId: string; name: string | null; type: string | null; value: unknown }>;
}

export interface IngestResult {
  submissionId: string;
  brokerSlug: string;
  brokerId: string;
  matchMethod: MatchMethod;
  /** Was this submission newly recorded (false = idempotent duplicate)? */
  recorded: boolean;
  /** Was a broker auto-created from this submission? */
  brokerCreated: boolean;
  status: string;
}

/** Resolve the n8n webhook URL for a form (per-form override → global default). */
function resolveN8nUrl(formId: string | null | undefined): string | undefined {
  return getFormTemplate(formId)?.n8nWebhookUrl ?? config.N8N_WEBHOOK_URL;
}

/**
 * Fire the workflow for an already-recorded submission and persist the outcome.
 * Returns the resulting status ('triggered' | 'failed' | 'received' when no URL
 * is configured). Never throws — n8n failures are recorded, not propagated.
 */
async function triggerAndRecord(args: {
  submissionDbId: string;
  filloutSubmissionId: string;
  formId: string | null | undefined;
  formType: string | null;
  matchMethod: MatchMethod;
  broker: { id: string; slug: string; societe: string; website: string | null };
  answers: ReturnType<typeof normalizeAnswers>;
}): Promise<string> {
  const url = resolveN8nUrl(args.formId);
  if (!url) {
    // No workflow wired up yet — keep the submission as 'received'.
    await updateSubmissionStatus({ db: getDb() }, args.submissionDbId, { status: "received" });
    return "received";
  }
  const payload = buildN8nPayload({
    submissionId: args.submissionDbId,
    filloutSubmissionId: args.filloutSubmissionId,
    formType: args.formType,
    matchMethod: args.matchMethod,
    broker: args.broker,
    answers: args.answers,
  });
  const res = await triggerN8nWorkflow({ url, secret: config.N8N_WEBHOOK_SECRET, payload });
  const status = res.ok ? "triggered" : "failed";
  await updateSubmissionStatus({ db: getDb() }, args.submissionDbId, {
    status,
    n8nExecutionId: res.executionId,
  });
  return status;
}

/**
 * Ingest one Fillout submission: match it to a broker (or auto-create one),
 * persist it idempotently, then trigger the n8n workflow. Safe to call twice
 * with the same submission — the second call is a no-op that doesn't re-trigger.
 */
export async function ingestFilloutSubmission(
  submission: FilloutSubmission,
): Promise<IngestResult> {
  const db = getDb();
  const template = getFormTemplate(submission.formId);
  const answers = normalizeAnswers(submission);
  const candidate = extractCandidate(answers, template);
  const formType = formTypeLabel(submission.formId);

  // Idempotency: if we've already seen this submission, do nothing further.
  const already = await getSubmissionByFilloutId({ db }, submission.submissionId);
  if (already) {
    const broker = await getBrokerById({ db }, already.submission.brokerId);
    return {
      submissionId: already.submission.id,
      brokerSlug: broker?.broker.slug ?? "",
      brokerId: already.submission.brokerId,
      matchMethod: already.submission.matchMethod as MatchMethod,
      recorded: false,
      brokerCreated: false,
      status: already.submission.status,
    };
  }

  // Match against existing brokers, or auto-create a flagged one.
  const brokerRows = await listBrokers({ db });
  const match = matchBroker(brokerRows, candidate);
  let brokerId: string;
  let brokerSlug: string;
  let brokerSociete: string;
  let brokerWebsite: string | null;
  let matchMethod: MatchMethod = match.method;
  let brokerCreated = false;

  if (match.broker) {
    brokerId = match.broker.id;
    brokerSlug = match.broker.slug;
    brokerSociete = match.broker.societe;
    // Prefer the stored website; fall back to the one submitted in the form so a
    // known broker with an empty website still triggers n8n Client Enrichment.
    brokerWebsite = match.broker.website ?? candidate.website ?? null;
    // Backfill the CRM record when the form supplied a website we didn't have.
    if (!match.broker.website && candidate.website) {
      await patchBroker(brokerId, { website: candidate.website });
    }
  } else {
    const name = deriveBrokerName(candidate) ?? `Formulaire ${submission.submissionId}`;
    const { broker, created } = await seedBroker(
      {
        societe: name,
        emails: candidate.email ? [candidate.email] : [],
        website: candidate.website ?? null,
        status: "onboarding",
      },
      DEFAULT_OFFICER,
    );
    if (!broker.dbId) throw new Error("Broker auto-creation failed: missing id");
    brokerId = broker.dbId;
    brokerSlug = broker.id; // DTO id === slug
    brokerSociete = broker.societe;
    brokerWebsite = candidate.website ?? null;
    brokerCreated = created;
    // A slug collision means the broker already existed → it's really a name match.
    matchMethod = created ? "created" : "name";
  }

  const { submission: recorded, created } = await recordSubmission(
    { db },
    {
      brokerId,
      filloutFormId: submission.formId ?? "",
      filloutSubmissionId: submission.submissionId,
      formType,
      submittedAt: submission.submissionTime ? new Date(submission.submissionTime) : null,
      matchMethod,
      rawPayload: submission,
      answers,
    },
  );

  // Lost the insert race against a concurrent identical webhook → no re-trigger.
  if (!created) {
    revalidatePath(`/courtiers/${brokerSlug}`);
    return {
      submissionId: recorded.submission.id,
      brokerSlug,
      brokerId,
      matchMethod,
      recorded: false,
      brokerCreated,
      status: recorded.submission.status,
    };
  }

  const status = await triggerAndRecord({
    submissionDbId: recorded.submission.id,
    filloutSubmissionId: submission.submissionId,
    formId: submission.formId,
    formType,
    matchMethod,
    broker: { id: brokerId, slug: brokerSlug, societe: brokerSociete, website: brokerWebsite },
    answers,
  });

  revalidatePath("/");
  revalidatePath(`/courtiers/${brokerSlug}`);

  return {
    submissionId: recorded.submission.id,
    brokerSlug,
    brokerId,
    matchMethod,
    recorded: true,
    brokerCreated,
    status,
  };
}

export interface N8nCallbackInput {
  /** Our DB submission id, echoed back by n8n from the trigger payload. */
  submissionId: string;
  /**
   * Discriminates the callback so one route serves every n8n workflow:
   *  - 'review' → the diagnostic workflow returns the editable review HTML
   *  - 'pdf'    → the PDF workflow returns the generated document (P5)
   *  - omitted  → a generic 'done' result stored in n8n_result
   */
  kind?: string | null;
  /** Workflow outcome reported by n8n: 'done' (default) | 'error'. */
  status?: string | null;
  /** Rendered review HTML (kind='review'). */
  html?: string | null;
  /** Base64-encoded PDF returned by the PDF workflow (kind='pdf'). */
  pdfBase64?: string | null;
  /** Arbitrary result payload to persist (jsonb). */
  result?: unknown;
  /** Error message when the workflow failed. */
  error?: string | null;
}

export interface N8nCallbackResult {
  found: boolean;
  status?: string;
}

/**
 * Record an async result posted back by n8n once a workflow finished. Looks the
 * submission up by our `submissionId` (the correlation key we sent in the
 * trigger payload) and applies the right patch depending on `kind`. Returns
 * `found: false` for an unknown submission so the caller can answer 404.
 */
export async function recordN8nCallback(input: N8nCallbackInput): Promise<N8nCallbackResult> {
  const db = getDb();
  const isError = input.status === "error";

  let patch: Parameters<typeof updateSubmissionStatus>[2];
  if (input.kind === "review") {
    // Diagnostic workflow finished → store the editable HTML, awaiting officer review.
    patch = {
      status: isError ? "error" : "done",
      reviewStatus: isError ? null : "pending",
      reviewHtml: input.html ?? undefined,
      n8nResult: input.result ?? null,
      completedAt: new Date(),
    };
  } else if (input.kind === "pdf") {
    // PDF workflow finished. n8n returns the PDF as base64 and never touches
    // SharePoint. We store it temporarily and point the "PDF" button at a
    // BrokerComply route. TODO(doc-sync): once the SharePoint subsystem is
    // merged here, upload the PDF to the broker's folder and set pdfRef to the
    // SharePoint URL instead (then drop the pdf_base64 column).
    patch = isError
      ? { reviewStatus: "edited", n8nResult: input.result ?? null, completedAt: new Date() }
      : {
          reviewStatus: "pdf_ready",
          pdfBase64: input.pdfBase64 ?? undefined,
          pdfRef: input.pdfBase64 ? `/api/reviews/${input.submissionId}/pdf/file` : undefined,
          n8nResult: input.result ?? null,
          completedAt: new Date(),
        };
  } else {
    patch = {
      status: isError ? "error" : "done",
      n8nResult: input.result ?? (input.error ? { error: input.error } : null),
      completedAt: new Date(),
    };
  }

  const row = await updateSubmissionStatus({ db }, input.submissionId, patch);
  if (!row) return { found: false };

  const broker = await getBrokerById({ db }, row.brokerId);
  if (broker) revalidatePath(`/courtiers/${broker.broker.slug}`);
  return { found: true, status: patch.status ?? row.status };
}

export interface SubmissionReview {
  html: string;
  /** Officer's saved corrections, replayed by the editor via cfg.initialEdits. */
  edits: unknown;
  brokerSlug: string;
}

/** Load a submission's editable review HTML + saved edits (null if none yet). */
export async function getSubmissionReview(submissionId: string): Promise<SubmissionReview | null> {
  const db = getDb();
  const existing = await getSubmissionById({ db }, submissionId);
  if (!existing || existing.submission.reviewHtml == null) return null;
  const broker = await getBrokerById({ db }, existing.submission.brokerId);
  return {
    html: existing.submission.reviewHtml,
    edits: existing.submission.reviewEdits ?? null,
    brokerSlug: broker?.broker.slug ?? "",
  };
}

export interface SubmissionPdf {
  base64: string;
  filename: string;
}

/** Load the temporarily-stored PDF for a submission (null if none yet). */
export async function getSubmissionPdf(submissionId: string): Promise<SubmissionPdf | null> {
  const db = getDb();
  const existing = await getSubmissionById({ db }, submissionId);
  if (!existing || existing.submission.pdfBase64 == null) return null;
  const broker = await getBrokerById({ db }, existing.submission.brokerId);
  const slug = broker?.broker.slug ?? "rapport";
  return { base64: existing.submission.pdfBase64, filename: `rapport-${slug}.pdf` };
}

/** Persist the officer's edits without generating a PDF ("Enregistrer"). */
export async function saveReviewEdits(submissionId: string, edits: unknown): Promise<boolean> {
  const db = getDb();
  const row = await updateSubmissionStatus({ db }, submissionId, {
    reviewEdits: edits,
    reviewStatus: "edited",
  });
  if (!row) return false;
  const broker = await getBrokerById({ db }, row.brokerId);
  if (broker) revalidatePath(`/courtiers/${broker.broker.slug}`);
  return true;
}

export interface RequestPdfResult {
  ok: boolean;
  found: boolean;
  error?: string;
}

/**
 * Save the latest edits and trigger the n8n PDF workflow ("Générer le PDF").
 * The workflow renders the PDF, uploads it to the broker's SharePoint folder,
 * then posts the reference back via the n8n callback (kind='pdf'). On any
 * trigger failure the status rolls back to 'edited' so the officer can retry.
 */
export async function requestPdf(submissionId: string, edits: unknown): Promise<RequestPdfResult> {
  const db = getDb();
  const row = await updateSubmissionStatus({ db }, submissionId, {
    reviewEdits: edits,
    reviewStatus: "pdf_requested",
  });
  if (!row) return { ok: false, found: false };

  const broker = await getBrokerById({ db }, row.brokerId);
  const brokerPath = broker ? `/courtiers/${broker.broker.slug}` : null;
  if (brokerPath) revalidatePath(brokerPath);

  // Revert the optimistic 'pdf_requested' and refresh the UI so the badge clears.
  const rollback = async (error: string): Promise<RequestPdfResult> => {
    await updateSubmissionStatus({ db }, submissionId, { reviewStatus: "edited" });
    if (brokerPath) revalidatePath(brokerPath);
    return { ok: false, found: true, error };
  };

  const url = config.N8N_PDF_WEBHOOK_URL;
  if (!url) return rollback("N8N_PDF_WEBHOOK_URL non configuré");

  // The PDF workflow runs serializeReview(payload, edits) → buildHtml, so it needs
  // the base viewModel captured at review time (stored by the diagnostic callback
  // in n8n_result.payload — "Fix B", no on-disk sidecar).
  const existing = await getSubmissionById({ db }, submissionId);
  const payload = (existing?.submission.n8nResult as { payload?: unknown } | null)?.payload ?? null;
  if (!payload) {
    return rollback(
      "Payload de génération introuvable (n8n_result.payload) — régénérez d'abord la relecture.",
    );
  }

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
        submissionId,
        broker: broker
          ? { id: broker.broker.id, slug: broker.broker.slug, societe: broker.broker.societe }
          : null,
        payload,
        edits,
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

/** Re-fire the n8n workflow for a failed submission (UI "Rejouer" action). */
export async function retrySubmissionTrigger(submissionId: string): Promise<string> {
  const db = getDb();
  const existing = await getSubmissionById({ db }, submissionId);
  if (!existing) throw new Error("Soumission introuvable");
  const broker = await getBrokerById({ db }, existing.submission.brokerId);
  if (!broker) throw new Error("Courtier introuvable");

  const status = await triggerAndRecord({
    submissionDbId: existing.submission.id,
    filloutSubmissionId: existing.submission.filloutSubmissionId,
    formId: existing.submission.filloutFormId,
    formType: existing.submission.formType,
    matchMethod: existing.submission.matchMethod as MatchMethod,
    broker: {
      id: broker.broker.id,
      slug: broker.broker.slug,
      societe: broker.broker.societe,
      website: broker.broker.website ?? null,
    },
    answers: existing.fields.map((f) => ({
      questionId: f.questionId,
      name: f.name,
      type: f.type,
      value: f.value,
      position: f.position,
    })),
  });

  revalidatePath(`/courtiers/${broker.broker.slug}`);
  return status;
}

/** Submissions for a broker (newest first), flattened for the UI. */
export async function listFormSubmissions(brokerDbId: string): Promise<FormSubmissionView[]> {
  const rows = await listSubmissionsForBroker({ db: getDb() }, brokerDbId);
  return rows.map(({ submission, fields }) => ({
    id: submission.id,
    formType: submission.formType,
    status: submission.status,
    matchMethod: submission.matchMethod,
    submittedAt: submission.submittedAt ? submission.submittedAt.toISOString() : null,
    createdAt: submission.createdAt.toISOString(),
    n8nExecutionId: submission.n8nExecutionId,
    n8nResult: submission.n8nResult,
    completedAt: submission.completedAt ? submission.completedAt.toISOString() : null,
    hasReview: submission.reviewHtml != null,
    reviewStatus: submission.reviewStatus,
    pdfRef: submission.pdfRef,
    fields: fields.map((f) => ({
      questionId: f.questionId,
      name: f.name,
      type: f.type,
      value: f.value,
    })),
  }));
}
