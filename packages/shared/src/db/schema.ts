import { sql, type SQL } from 'drizzle-orm';
import {
  boolean,
  customType,
  date,
  index,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
  uuid,
  vector,
} from 'drizzle-orm/pg-core';

/**
 * `tsvector` is not a first-class Drizzle column type, so we declare a custom
 * type. The column itself is a STORED generated column (see `knowledge_units`).
 */
const tsvector = customType<{ data: string }>({
  dataType() {
    return 'tsvector';
  },
});

/**
 * Layer 1 — Source repository.
 *
 * Immutable cleaned email threads + attachment text + metadata. Used only for
 * traceability and citation. AML/CTIF content never enters this table.
 */
export const sourceDocuments = pgTable(
  'source_documents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    messageId: text('message_id').notNull().unique(),
    conversationId: text('conversation_id'),
    subject: text('subject'),
    bodyClean: text('body_clean'),
    attachmentText: text('attachment_text'),
    sender: text('sender'),
    recipients: jsonb('recipients').$type<string[]>(),
    mailbox: text('mailbox'),
    language: text('language'),
    /** 'inbound' | 'outbound' | 'internal' relative to the officer mailboxes. */
    direction: text('direction'),
    receivedAt: timestamp('received_at', { withTimezone: true }),
    rawMetadata: jsonb('raw_metadata'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    /** Set once the thread has been distilled into knowledge_units (0-D). */
    distilledAt: timestamp('distilled_at', { withTimezone: true }),
  },
  (t) => [
    index('idx_source_documents_conversation').on(t.conversationId),
    index('idx_source_documents_received_at').on(t.receivedAt),
    index('idx_source_documents_distilled_at').on(t.distilledAt),
  ],
);

/**
 * Layer 2 — Knowledge repository.
 *
 * Distilled Q/A cards with multilingual embeddings, embedded and queried.
 * Points back to layer 1 via `source_ids`.
 */
export const knowledgeUnits = pgTable(
  'knowledge_units',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    question: text('question').notNull(),
    answer: text('answer').notNull(),
    topic: text('topic'),
    regulatoryRefs: jsonb('regulatory_refs').$type<string[]>(),
    language: text('language'),
    sourceIds: uuid('source_ids').array(),
    sourceDate: date('source_date'),
    author: text('author'),
    confidence: real('confidence'),
    // Provenance & curation (dashboard editing): 'distilled' = auto-extracted,
    // 'manual' = officer-authored. `reviewStatus` and `isPublished` let officers
    // curate; curated rows are protected from re-distillation (see distill.ts).
    origin: text('origin').default('distilled').notNull(),
    reviewStatus: text('review_status').default('unreviewed').notNull(),
    updatedBy: text('updated_by'),
    isPublished: boolean('is_published').default(true).notNull(),
    embedding: vector('embedding', { dimensions: 1536 }),
    // Full-text search column. `simple` config = no stemming, which keeps
    // multilingual FR/NL/EN content and exact regulatory references intact.
    searchVector: tsvector('search_vector').generatedAlwaysAs(
      (): SQL =>
        sql`to_tsvector('simple', coalesce(${knowledgeUnits.question}, '') || ' ' || coalesce(${knowledgeUnits.answer}, ''))`,
    ),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('idx_knowledge_units_embedding').using('hnsw', t.embedding.op('vector_cosine_ops')),
    index('idx_knowledge_units_search').using('gin', t.searchVector),
    index('idx_knowledge_units_topic').on(t.topic),
    index('idx_knowledge_units_language').on(t.language),
    index('idx_knowledge_units_source_date').on(t.sourceDate),
    index('idx_knowledge_units_origin').on(t.origin),
    index('idx_knowledge_units_published').on(t.isPublished),
  ],
);

/**
 * AML exclusion ledger.
 *
 * Records only that a message/thread was excluded by the conservative AML
 * filter — never any excluded content (PRD: "seul un compteur d'exclusions").
 */
export const amlExclusionLog = pgTable('aml_exclusion_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  messageId: text('message_id'),
  reason: text('reason'),
  excludedAt: timestamp('excluded_at', { withTimezone: true }).defaultNow().notNull(),
});

export type SourceDocument = typeof sourceDocuments.$inferSelect;
export type NewSourceDocument = typeof sourceDocuments.$inferInsert;
export type KnowledgeUnit = typeof knowledgeUnits.$inferSelect;
export type NewKnowledgeUnit = typeof knowledgeUnits.$inferInsert;
export type AmlExclusionLogEntry = typeof amlExclusionLog.$inferSelect;
export type NewAmlExclusionLogEntry = typeof amlExclusionLog.$inferInsert;
