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
import { seedBroker } from "./brokers.server";
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
  broker: { id: string; slug: string; societe: string };
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
  let matchMethod: MatchMethod = match.method;
  let brokerCreated = false;

  if (match.broker) {
    brokerId = match.broker.id;
    brokerSlug = match.broker.slug;
    brokerSociete = match.broker.societe;
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
    broker: { id: brokerId, slug: brokerSlug, societe: brokerSociete },
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
    fields: fields.map((f) => ({
      questionId: f.questionId,
      name: f.name,
      type: f.type,
      value: f.value,
    })),
  }));
}
