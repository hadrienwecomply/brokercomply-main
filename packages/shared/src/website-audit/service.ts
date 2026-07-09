import { desc, eq } from 'drizzle-orm';
import { websiteAudits, type Db, type WebsiteAuditRow } from '../db/index.js';

/** A live transaction handle, so service fns compose inside an outer transaction. */
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

export interface WebsiteAuditServiceDeps {
  db: Db | Tx;
}

export type WebsiteAuditStatus =
  | 'queued'
  | 'running'
  | 'analyzed'
  | 'review_pending'
  | 'needs_manual'
  | 'error';

export interface WebsiteAuditPatch {
  status?: WebsiteAuditStatus;
  findings?: unknown;
  constats?: unknown;
  pagesFetched?: unknown;
  errorMessage?: string | null;
  reviewHtml?: string;
  reviewEdits?: unknown;
  reviewStatus?: string | null;
  pdfRef?: string;
  pdfBase64?: string;
}

export async function createWebsiteAudit(
  { db }: WebsiteAuditServiceDeps,
  input: { brokerId: string; websiteUrl: string },
): Promise<WebsiteAuditRow> {
  const [row] = await db
    .insert(websiteAudits)
    .values({ brokerId: input.brokerId, websiteUrl: input.websiteUrl, status: 'queued' })
    .returning();
  if (!row) throw new Error('website_audits insert returned no row');
  return row;
}

export async function updateWebsiteAudit(
  { db }: WebsiteAuditServiceDeps,
  auditId: string,
  patch: WebsiteAuditPatch,
): Promise<WebsiteAuditRow | undefined> {
  const [row] = await db
    .update(websiteAudits)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(websiteAudits.id, auditId))
    .returning();
  return row;
}

export async function getWebsiteAuditById(
  { db }: WebsiteAuditServiceDeps,
  auditId: string,
): Promise<WebsiteAuditRow | undefined> {
  const [row] = await db.select().from(websiteAudits).where(eq(websiteAudits.id, auditId));
  return row;
}

/** Audits of a broker, newest first. */
export async function listWebsiteAuditsForBroker(
  { db }: WebsiteAuditServiceDeps,
  brokerId: string,
): Promise<WebsiteAuditRow[]> {
  return db
    .select()
    .from(websiteAudits)
    .where(eq(websiteAudits.brokerId, brokerId))
    .orderBy(desc(websiteAudits.createdAt));
}
