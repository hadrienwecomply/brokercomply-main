import { desc, sql } from 'drizzle-orm';
import { brokers, mailSyncState, sourceDocuments, type Db } from '../db/index.js';
import { resolveBrokerAddresses, type BrokerAddressMatcher } from './addresses.js';

/** A live transaction handle, so service fns compose inside an outer transaction. */
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

export interface ConversationsServiceDeps {
  db: Db | Tx;
}

/** One cleaned message as shown in the broker Conversations tab. */
export interface ConversationMessage {
  id: string;
  messageId: string;
  subject: string | null;
  /** Cleaned plain text (signatures + quoted replies stripped at ingestion). */
  bodyClean: string | null;
  sender: string | null;
  recipients: string[];
  /** 'inbound' | 'outbound' | 'internal' relative to the officer mailboxes. */
  direction: string | null;
  receivedAt: Date | null;
  /** Graph webLink to open the original in Outlook (null until ingested with it). */
  webLink: string | null;
  /** Attachment file names (metadata only — bytes are not stored). */
  attachmentNames: string[];
}

/** A reconstructed thread between the officers and a broker, newest activity first. */
export interface BrokerConversation {
  /** conversationId when present, else the single message's messageId. */
  conversationKey: string;
  subject: string | null;
  /** Distinct participant addresses across the thread (lowercased). */
  participants: string[];
  messageCount: number;
  lastMessageAt: Date | null;
  lastDirection: string | null;
  /** Messages oldest → newest. */
  messages: ConversationMessage[];
}

type RawMeta = { webLink?: unknown; attachmentNames?: unknown } | null;

function webLinkFrom(meta: RawMeta): string | null {
  const v = meta?.webLink;
  return typeof v === 'string' && v ? v : null;
}

function attachmentNamesFrom(meta: RawMeta): string[] {
  const v = meta?.attachmentNames;
  return Array.isArray(v) ? v.filter((n): n is string => typeof n === 'string') : [];
}

/**
 * Build a SQL predicate selecting `source_documents` whose sender OR any
 * recipient matches the broker (exact email, or an opted-in domain). All
 * comparisons are lowercased so mixed-case stored addresses still match.
 */
function buildMatchPredicate(matcher: BrokerAddressMatcher) {
  const emails = [...matcher.emails];
  const domainPatterns = [...matcher.domains].map((d) => `%@${d}`);

  // OR of equality/LIKE per value — drizzle expands a JS array into a param list
  // (not a Postgres array), so `= any(${arr})` is unsafe; expanding is robust and
  // the lists are tiny (a few emails + opted-in domains per broker).
  const senderConds = [
    ...emails.map((e) => sql`lower(${sourceDocuments.sender}) = ${e}`),
    ...domainPatterns.map((p) => sql`lower(${sourceDocuments.sender}) like ${p}`),
  ];
  const recipientConds = [
    ...emails.map((e) => sql`lower(r.value) = ${e}`),
    ...domainPatterns.map((p) => sql`lower(r.value) like ${p}`),
  ];

  const recipientExists = sql`exists (
    select 1 from jsonb_array_elements_text(coalesce(${sourceDocuments.recipients}, '[]'::jsonb)) as r(value)
    where ${sql.join(recipientConds, sql` or `)}
  )`;

  return sql`(${sql.join([...senderConds, recipientExists], sql` or `)})`;
}

/**
 * Latest email conversations between the officers' mailboxes and a broker,
 * sourced from the immutable (AML-filtered) `source_documents` archive.
 *
 * Internal (officer ↔ officer) messages are excluded; they never match a
 * broker's addresses anyway, and we only ever query by a known broker's
 * addresses, so the result is inherently scoped to that broker.
 */
export async function getBrokerConversations(
  { db }: ConversationsServiceDeps,
  brokerId: string,
): Promise<BrokerConversation[]> {
  const [broker] = await db.select().from(brokers).where(sql`${brokers.id} = ${brokerId}`);
  if (!broker) return [];

  const matcher = resolveBrokerAddresses(broker);
  // No addresses to match on → don't fall through to an unscoped scan.
  if (matcher.isEmpty) return [];

  const predicate = buildMatchPredicate(matcher);
  const rows = await db
    .select()
    .from(sourceDocuments)
    .where(sql`${predicate} and coalesce(${sourceDocuments.direction}, '') <> 'internal'`)
    .orderBy(sql`${sourceDocuments.receivedAt} asc nulls first`);

  // Group into threads: conversationId when present, else the message itself.
  const byKey = new Map<string, ConversationMessage[]>();
  for (const row of rows) {
    const key = row.conversationId ?? row.messageId;
    const meta = row.rawMetadata as RawMeta;
    const message: ConversationMessage = {
      id: row.id,
      messageId: row.messageId,
      subject: row.subject,
      bodyClean: row.bodyClean,
      sender: row.sender,
      recipients: row.recipients ?? [],
      direction: row.direction,
      receivedAt: row.receivedAt,
      webLink: webLinkFrom(meta),
      attachmentNames: attachmentNamesFrom(meta),
    };
    const bucket = byKey.get(key);
    if (bucket) bucket.push(message);
    else byKey.set(key, [message]);
  }

  const conversations: BrokerConversation[] = [];
  for (const [conversationKey, messages] of byKey) {
    const participants = new Set<string>();
    for (const m of messages) {
      if (m.sender) participants.add(m.sender.toLowerCase());
      for (const r of m.recipients) participants.add(r.toLowerCase());
    }
    const last = messages[messages.length - 1];
    conversations.push({
      conversationKey,
      subject: messages.find((m) => m.subject)?.subject ?? null,
      participants: [...participants],
      messageCount: messages.length,
      lastMessageAt: last?.receivedAt ?? null,
      lastDirection: last?.direction ?? null,
      messages,
    });
  }

  // Most recently active thread first.
  conversations.sort((a, b) => {
    const ta = a.lastMessageAt?.getTime() ?? 0;
    const tb = b.lastMessageAt?.getTime() ?? 0;
    return tb - ta;
  });
  return conversations;
}

/** Most recent delta-sync timestamp across all mailboxes/folders (freshness badge). */
export async function getLastMailSyncAt({ db }: ConversationsServiceDeps): Promise<Date | null> {
  const [row] = await db
    .select()
    .from(mailSyncState)
    .orderBy(desc(mailSyncState.lastSyncedAt))
    .limit(1);
  return row?.lastSyncedAt ?? null;
}
