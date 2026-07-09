import { desc, eq } from 'drizzle-orm';
import { pubAudits, type Db, type PubAuditRow } from '../db/index.js';

/** A live transaction handle, so service fns compose inside an outer transaction. */
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

export interface PubAuditServiceDeps {
  db: Db | Tx;
}

export type PubAuditStatus =
  | 'queued'
  | 'running'
  | 'analyzed'
  | 'review_pending'
  | 'needs_manual'
  | 'error';

export interface PubAuditPatch {
  status?: PubAuditStatus;
  findings?: unknown;
  qualification?: unknown;
  errorMessage?: string | null;
  reviewHtml?: string;
  reviewEdits?: unknown;
  reviewStatus?: string | null;
  pdfRef?: string;
  pdfBase64?: string;
}

export async function createPubAudit(
  { db }: PubAuditServiceDeps,
  input: {
    brokerId: string;
    fileName: string;
    imageBase64: string;
    imageMimeType: string;
    batchId?: string;
  },
): Promise<PubAuditRow> {
  const [row] = await db
    .insert(pubAudits)
    .values({
      brokerId: input.brokerId,
      fileName: input.fileName,
      imageBase64: input.imageBase64,
      imageMimeType: input.imageMimeType,
      ...(input.batchId ? { batchId: input.batchId } : {}),
      status: 'queued',
    })
    .returning();
  if (!row) throw new Error('pub_audits insert returned no row');
  return row;
}

export async function updatePubAudit(
  { db }: PubAuditServiceDeps,
  auditId: string,
  patch: PubAuditPatch,
): Promise<PubAuditRow | undefined> {
  const [row] = await db
    .update(pubAudits)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(pubAudits.id, auditId))
    .returning();
  return row;
}

export async function getPubAuditById(
  { db }: PubAuditServiceDeps,
  auditId: string,
): Promise<PubAuditRow | undefined> {
  const [row] = await db.select().from(pubAudits).where(eq(pubAudits.id, auditId));
  return row;
}

/** Audits of a broker, newest first. */
export async function listPubAuditsForBroker(
  { db }: PubAuditServiceDeps,
  brokerId: string,
): Promise<PubAuditRow[]> {
  return db
    .select()
    .from(pubAudits)
    .where(eq(pubAudits.brokerId, brokerId))
    .orderBy(desc(pubAudits.createdAt));
}
