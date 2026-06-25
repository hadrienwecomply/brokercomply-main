import { asc, eq, inArray } from 'drizzle-orm';
import {
  formFields,
  formSubmissions,
  type Db,
  type FormField,
  type FormSubmission,
} from '../db/index.js';
import type { MatchMethod } from './matching.js';

/** A live transaction handle, so service fns compose inside an outer transaction. */
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

export interface FormsServiceDeps {
  db: Db | Tx;
}

/** One normalised answer to persist into `form_fields`. */
export interface AnswerInput {
  questionId: string;
  name?: string | null;
  type?: string | null;
  value?: unknown;
  position: number;
}

export interface RecordSubmissionInput {
  brokerId: string;
  filloutFormId: string;
  filloutSubmissionId: string;
  formType?: string | null;
  submittedAt?: Date | null;
  matchMethod: MatchMethod;
  /** Untouched Fillout body, kept as a recovery/audit safety net. */
  rawPayload?: unknown;
  answers: AnswerInput[];
}

/** A submission row plus its answer rows. */
export interface FormSubmissionWithFields {
  submission: FormSubmission;
  fields: FormField[];
}

/** Postgres unique-violation SQLSTATE (used to make the insert idempotent). */
function isUniqueViolation(e: unknown): boolean {
  return (
    typeof e === 'object' &&
    e !== null &&
    'code' in e &&
    (e as { code?: string }).code === '23505'
  );
}

async function loadFields({ db }: FormsServiceDeps, submissionId: string): Promise<FormField[]> {
  return db
    .select()
    .from(formFields)
    .where(eq(formFields.submissionId, submissionId))
    .orderBy(asc(formFields.position));
}

export async function getSubmissionByFilloutId(
  { db }: FormsServiceDeps,
  filloutSubmissionId: string,
): Promise<FormSubmissionWithFields | undefined> {
  const [submission] = await db
    .select()
    .from(formSubmissions)
    .where(eq(formSubmissions.filloutSubmissionId, filloutSubmissionId));
  if (!submission) return undefined;
  return { submission, fields: await loadFields({ db }, submission.id) };
}

export async function getSubmissionById(
  { db }: FormsServiceDeps,
  id: string,
): Promise<FormSubmissionWithFields | undefined> {
  const [submission] = await db.select().from(formSubmissions).where(eq(formSubmissions.id, id));
  if (!submission) return undefined;
  return { submission, fields: await loadFields({ db }, submission.id) };
}

/**
 * Insert a submission and its answer rows atomically. Idempotent on
 * `fillout_submission_id`: if the submission already exists (a Fillout retry or
 * a duplicate POST), the existing row is returned with `created: false` and
 * nothing is re-inserted — so the caller can skip re-triggering n8n.
 */
export async function recordSubmission(
  deps: FormsServiceDeps,
  input: RecordSubmissionInput,
): Promise<{ submission: FormSubmissionWithFields; created: boolean }> {
  try {
    const submission = await deps.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(formSubmissions)
        .values({
          brokerId: input.brokerId,
          filloutFormId: input.filloutFormId,
          filloutSubmissionId: input.filloutSubmissionId,
          formType: input.formType ?? null,
          submittedAt: input.submittedAt ?? null,
          matchMethod: input.matchMethod,
          rawPayload: input.rawPayload ?? null,
        })
        .returning();
      if (!row) throw new Error('Failed to insert form submission');

      const fieldRows = input.answers.length
        ? await tx
            .insert(formFields)
            .values(
              input.answers.map((a) => ({
                submissionId: row.id,
                questionId: a.questionId,
                name: a.name ?? null,
                type: a.type ?? null,
                value: a.value ?? null,
                position: a.position,
              })),
            )
            .returning()
        : [];

      return { submission: row, fields: fieldRows };
    });
    return { submission, created: true };
  } catch (e) {
    if (isUniqueViolation(e)) {
      const existing = await getSubmissionByFilloutId(deps, input.filloutSubmissionId);
      if (existing) return { submission: existing, created: false };
    }
    throw e;
  }
}

export interface SubmissionStatusPatch {
  status?: string;
  n8nExecutionId?: string | null;
  /** Result payload posted back by n8n on workflow completion (callback). */
  n8nResult?: unknown;
  /** When n8n reported the workflow finished. */
  completedAt?: Date | null;
  /** Editable review HTML rendered by the n8n diagnostic workflow. */
  reviewHtml?: string | null;
  /** Officer's latest corrections (the editor `edits` object). */
  reviewEdits?: unknown;
  /** Review lifecycle: 'pending' | 'edited' | 'pdf_requested' | 'pdf_ready'. */
  reviewStatus?: string | null;
  /** URL the PDF button points to (BrokerComply route for now, SharePoint later). */
  pdfRef?: string | null;
  /** Base64 PDF stored temporarily until the SharePoint upload is wired. */
  pdfBase64?: string | null;
}

/**
 * Patch a submission's processing/review fields. Every field is optional so the
 * same updater serves the n8n trigger, the review callback, the save-edits
 * action and the PDF callback. Returns the updated row, or undefined if the id
 * is unknown.
 */
export async function updateSubmissionStatus(
  { db }: FormsServiceDeps,
  submissionId: string,
  patch: SubmissionStatusPatch,
): Promise<FormSubmission | undefined> {
  const fields: Partial<FormSubmission> = {};
  if (patch.status !== undefined) fields.status = patch.status;
  if (patch.n8nExecutionId !== undefined) fields.n8nExecutionId = patch.n8nExecutionId;
  if (patch.n8nResult !== undefined) fields.n8nResult = patch.n8nResult;
  if (patch.completedAt !== undefined) fields.completedAt = patch.completedAt;
  if (patch.reviewHtml !== undefined) fields.reviewHtml = patch.reviewHtml;
  if (patch.reviewEdits !== undefined) fields.reviewEdits = patch.reviewEdits;
  if (patch.reviewStatus !== undefined) fields.reviewStatus = patch.reviewStatus;
  if (patch.pdfRef !== undefined) fields.pdfRef = patch.pdfRef;
  if (patch.pdfBase64 !== undefined) fields.pdfBase64 = patch.pdfBase64;
  if (Object.keys(fields).length === 0) {
    const [row] = await db.select().from(formSubmissions).where(eq(formSubmissions.id, submissionId));
    return row;
  }
  const [row] = await db
    .update(formSubmissions)
    .set(fields)
    .where(eq(formSubmissions.id, submissionId))
    .returning();
  return row;
}

/** All submissions for a broker (newest first) with their answer rows. */
export async function listSubmissionsForBroker(
  { db }: FormsServiceDeps,
  brokerId: string,
): Promise<FormSubmissionWithFields[]> {
  const submissions = await db
    .select()
    .from(formSubmissions)
    .where(eq(formSubmissions.brokerId, brokerId));
  if (!submissions.length) return [];

  const ids = submissions.map((s) => s.id);
  const allFields = await db.select().from(formFields).where(inArray(formFields.submissionId, ids));
  const bySubmission = new Map<string, FormField[]>();
  for (const f of allFields) {
    const bucket = bySubmission.get(f.submissionId);
    if (bucket) bucket.push(f);
    else bySubmission.set(f.submissionId, [f]);
  }
  for (const bucket of bySubmission.values()) bucket.sort((a, b) => a.position - b.position);

  return submissions
    .map((submission) => ({ submission, fields: bySubmission.get(submission.id) ?? [] }))
    .sort((a, b) => b.submission.createdAt.getTime() - a.submission.createdAt.getTime());
}
