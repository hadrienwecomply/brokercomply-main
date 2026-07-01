import { amlExclusionLog, sourceDocuments, type Db } from '@brokercomply/shared';
import { filterThread } from '../aml-filter/filter.js';
import { threadMatchesClient, type ClientAllowlist } from './client-filter.js';
import { cleanEmailBody } from './email-cleaner.js';
import { parseAttachment } from './attachment-parser.js';
import { detectLanguage } from './language.js';
import { buildThreads, type Thread } from './thread-builder.js';
import type { EmailSource, ListMessagesOptions, RawMessage } from './types.js';

export interface IngestOptions extends ListMessagesOptions {
  mailbox: string;
}

export interface IngestDeps {
  source: EmailSource;
  db: Db;
  /**
   * When provided, only threads with at least one participant in scope (a
   * signed client) are ingested; others are skipped as out-of-scope. When
   * omitted, all threads are ingested (unscoped).
   */
  clientAllowlist?: ClientAllowlist;
  /** Optional progress logger (defaults to no-op). */
  log?: (message: string) => void;
}

export interface IngestStats {
  mailbox: string;
  messagesFetched: number;
  threads: number;
  /** Threads skipped because no participant is a signed client (allowlist set). */
  threadsOutOfScope: number;
  threadsExcluded: number;
  messagesExcluded: number;
  documentsStored: number;
  attachmentsParsed: number;
}

/** Parse every attachment of a message; returns combined text (or null). */
async function parseMessageAttachments(
  source: EmailSource,
  mailbox: string,
  message: RawMessage,
): Promise<{ text: string | null; parsedCount: number }> {
  if (!message.hasAttachments || message.attachments.length === 0) {
    return { text: null, parsedCount: 0 };
  }
  const texts: string[] = [];
  for (const meta of message.attachments) {
    const content = await source.getAttachmentContent(mailbox, message.id, meta.id);
    if (!content) continue;
    const parsed = await parseAttachment(content);
    if (parsed) texts.push(parsed);
  }
  return { text: texts.length ? texts.join('\n\n') : null, parsedCount: texts.length };
}

/**
 * Postgres text/jsonb columns cannot store NUL (0x00) bytes, which real email
 * and PDF-extracted content occasionally contains. Strip them from any value.
 */
function stripNul<T extends string | null | undefined>(value: T): T {
  return (typeof value === 'string' ? value.replace(/\0/g, '') : value) as T;
}

async function storeThread(
  db: Db,
  mailbox: string,
  thread: Thread,
  attachmentTextByMessageId: Map<string, string | null>,
): Promise<number> {
  let stored = 0;
  for (const message of thread.messages) {
    const bodyClean = stripNul(cleanEmailBody(message.bodyContent, message.bodyContentType));
    const attachmentText = stripNul(attachmentTextByMessageId.get(message.id) ?? null);
    const language = detectLanguage(`${message.subject}\n${bodyClean}`);

    const record = {
      conversationId: message.conversationId,
      subject: stripNul(message.subject),
      bodyClean,
      attachmentText,
      sender: stripNul(message.from),
      recipients: [...message.to, ...message.cc].map((r) => stripNul(r)),
      mailbox,
      language,
      direction: message.direction ?? null,
      receivedAt: new Date(message.receivedDateTime),
      rawMetadata: {
        graphId: message.id,
        to: message.to,
        cc: message.cc,
        folder: message.folder ?? null,
        parentFolderId: message.parentFolderId ?? null,
        webLink: message.webLink ?? null,
        hasAttachments: message.hasAttachments,
        attachmentNames: message.attachments.map((a) => stripNul(a.name)),
      },
    };

    await db
      .insert(sourceDocuments)
      .values({ messageId: stripNul(message.internetMessageId), ...record })
      .onConflictDoUpdate({ target: sourceDocuments.messageId, set: record });
    stored += 1;
  }
  return stored;
}

/**
 * Process an already-fetched batch of messages: group into threads → (optional
 * client scope) → parse attachments → AML filter → store. Shared by both the
 * backfill (`runIngest`) and the incremental delta sync (`runDeltaIngest`), so
 * the AML guard-rail and storage rules are identical on every path.
 *
 * The AML filter runs BEFORE any storage; excluded threads are recorded in the
 * exclusion ledger (message id + category only, never content). Storage is
 * idempotent (upsert on message_id).
 */
export async function processMessages(
  deps: IngestDeps,
  mailbox: string,
  messages: RawMessage[],
): Promise<IngestStats> {
  const { source, db, clientAllowlist } = deps;
  const log = deps.log ?? (() => {});

  const threads = buildThreads(messages);
  log(`Fetched ${messages.length} message(s) across ${threads.length} thread(s) from ${mailbox}`);

  const stats: IngestStats = {
    mailbox,
    messagesFetched: messages.length,
    threads: threads.length,
    threadsOutOfScope: 0,
    threadsExcluded: 0,
    messagesExcluded: 0,
    documentsStored: 0,
    attachmentsParsed: 0,
  };

  for (const thread of threads) {
    // Client scope filter first: skip non-client threads before any costly
    // attachment parsing / AML scan / LLM work downstream.
    if (clientAllowlist && !threadMatchesClient(thread, clientAllowlist)) {
      stats.threadsOutOfScope += 1;
      continue;
    }

    // Parse attachments first (needed by the AML scan and for storage).
    const attachmentTextByMessageId = new Map<string, string | null>();
    const threadAttachmentTexts: string[] = [];
    for (const message of thread.messages) {
      const { text, parsedCount } = await parseMessageAttachments(source, mailbox, message);
      attachmentTextByMessageId.set(message.id, text);
      stats.attachmentsParsed += parsedCount;
      if (text) threadAttachmentTexts.push(text);
    }

    const filterResult = filterThread(thread, threadAttachmentTexts);
    if (filterResult.excluded) {
      const reason = filterResult.categories.join(',');
      for (const message of thread.messages) {
        await db.insert(amlExclusionLog).values({ messageId: message.internetMessageId, reason });
        stats.messagesExcluded += 1;
      }
      stats.threadsExcluded += 1;
      log(`AML-excluded thread "${thread.subject}" (categories: ${reason})`);
      continue;
    }

    stats.documentsStored += await storeThread(db, mailbox, thread, attachmentTextByMessageId);
  }

  log(
    `Stored ${stats.documentsStored} document(s); ${stats.threadsOutOfScope} thread(s) out of client scope; AML-excluded ${stats.threadsExcluded} thread(s) / ${stats.messagesExcluded} message(s); parsed ${stats.attachmentsParsed} attachment(s).`,
  );
  return stats;
}

/**
 * Backfill ingestion: fetch a (bounded) batch via `listMessages`, then run the
 * shared processing pipeline.
 */
export async function runIngest(deps: IngestDeps, options: IngestOptions): Promise<IngestStats> {
  const { mailbox, ...listOptions } = options;
  const messages = await deps.source.listMessages(mailbox, listOptions);
  return processMessages(deps, mailbox, messages);
}
