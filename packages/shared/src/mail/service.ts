import { desc, eq } from 'drizzle-orm';
import { outboundEmails, type Db, type NewOutboundEmail, type OutboundEmail } from '../db/index.js';

/** A live transaction handle, so service fns compose inside an outer transaction. */
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

export interface MailServiceDeps {
  db: Db | Tx;
}

/** Record a successfully-sent template email (audit + "envoyé le X" badge). */
export async function logOutboundEmail(
  { db }: MailServiceDeps,
  record: NewOutboundEmail,
): Promise<OutboundEmail> {
  const [row] = await db.insert(outboundEmails).values(record).returning();
  if (!row) throw new Error('Failed to log outbound email');
  return row;
}

/** All emails sent to a broker, newest first (for history + re-send warnings). */
export async function listOutboundForBroker(
  { db }: MailServiceDeps,
  brokerId: string,
): Promise<OutboundEmail[]> {
  return db
    .select()
    .from(outboundEmails)
    .where(eq(outboundEmails.brokerId, brokerId))
    .orderBy(desc(outboundEmails.sentAt));
}
