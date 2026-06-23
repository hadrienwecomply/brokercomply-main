import { sql, type SQL } from 'drizzle-orm';
import {
  bigint,
  boolean,
  customType,
  date,
  index,
  jsonb,
  numeric,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
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

/**
 * Collaborative product roadmap (dashboard Kanban board).
 *
 * Internal-only feature (no auth, PRD: private network). Each card lives in one
 * of four columns via `status`; `position` orders cards within a column.
 * Seeded from ROADMAP_Phase1.md, then editable by the team.
 */
export const roadmapItems = pgTable(
  'roadmap_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    title: text('title').notNull(),
    description: text('description'),
    /** 'idea' | 'planned' | 'in_progress' | 'done' (the four Kanban columns). */
    status: text('status').default('idea').notNull(),
    /** Free tag used for colour + filtering (KB, Docs, Pilotage, Infra, …). */
    theme: text('theme'),
    /** Sort order within a column (lower = higher). Fractional to ease reorder. */
    position: real('position').default(0).notNull(),
    /** Optional officer email the card is owned by. */
    owner: text('owner'),
    /** Reference to the source roadmap item, e.g. "1.1" (provenance of seeds). */
    sourceRef: text('source_ref'),
    /** Officer email that created the card (attribution; no auth). */
    createdBy: text('created_by'),
    archived: boolean('archived').default(false).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('idx_roadmap_items_status').on(t.status),
    index('idx_roadmap_items_archived').on(t.archived),
  ],
);

/**
 * One vote per officer per roadmap card (used to prioritise ideas).
 */
export const roadmapVotes = pgTable(
  'roadmap_votes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    itemId: uuid('item_id').notNull(),
    /** Officer email (cookie identity) that voted. */
    voter: text('voter').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('uq_roadmap_votes_item_voter').on(t.itemId, t.voter),
    index('idx_roadmap_votes_item').on(t.itemId),
  ],
);

/**
 * Brokers — the CRM entity (clients).
 *
 * Mirrors the Notion "Espace clients (signés)" + "Clients" databases. No auth in
 * v1 (PRD: private network); `account_owner` is an officer email validated in the
 * app layer against `officers.ts`. Several values are intentionally derived, not
 * stored: `onboarding_stage` (from plan step-01 progress), `arr` (= mrr × 12), and
 * each step's effective deadline (= signature_date + sla_days, see plan steps).
 */
export const brokers = pgTable(
  'brokers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** URL key, e.g. "elite-broker". Stable identity for /courtiers/[slug]. */
    slug: text('slug').notNull().unique(),
    /** Company name (Notion: Société / Nom). */
    societe: text('societe').notNull(),
    /** Primary contact person (Notion: Personne de contact). */
    contactName: text('contact_name'),
    /** Contact emails (Notion: Email(s) contact). */
    emails: jsonb('emails').$type<string[]>().default([]).notNull(),
    phone: text('phone'),
    website: text('website'),
    /** Belgian enterprise number (Notion: BCE). Unique only when present. */
    bce: text('bce'),
    /** FSMA/IPI registration number (Notion: N° d'agrément FSMA/IPI). */
    fsmaNumber: text('fsma_number'),
    address: text('address'),
    city: text('city'),
    /** ISO country codes the broker operates in, e.g. ["BE","LU"]. */
    countries: jsonb('countries').$type<string[]>().default([]).notNull(),
    /** 'FR' | 'NL' | 'EN'. */
    language: text('language'),
    /** Headcount bucket: '1' | '2-5' | '6-10' | '11-20' | '21-50' | '51+'. */
    sizeBucket: text('size_bucket'),
    /** 'BrokerComply' | 'EstateComply'. */
    product: text('product').default('BrokerComply').notNull(),
    linkedinUrl: text('linkedin_url'),
    /** Lifecycle: 'onboarding' | 'active' | 'at_risk' | 'inactive'. */
    status: text('status').default('onboarding').notNull(),
    /** Monthly recurring revenue in EUR (Notion: MRR). ARR is derived = mrr × 12. */
    mrr: numeric('mrr', { precision: 10, scale: 2 }),
    signatureDate: date('signature_date'),
    lastContactDate: date('last_contact_date'),
    /** Owning officer email (Notion: Responsable du compte). */
    accountOwner: text('account_owner'),
    /** Source Notion page id, for future backfill/sync. */
    notionPageId: text('notion_page_id'),
    /** Graph driveItem id of the broker's SharePoint folder (null until linked). */
    sharePointFolderId: text('sharepoint_folder_id'),
    /** Browser URL of that folder (for "open in SharePoint"). */
    sharePointWebUrl: text('sharepoint_web_url'),
    /** Drive-relative path of the folder (traceability + backfill linking). */
    sharePointFolderPath: text('sharepoint_folder_path'),
    /** 'linked' | 'pending' | 'error' | null — best-effort provisioning state. */
    sharePointStatus: text('sharepoint_status'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    // Legal dedup once a BCE is entered, without blocking null-BCE seeds.
    uniqueIndex('uq_brokers_bce').on(t.bce).where(sql`${t.bce} is not null`),
    index('idx_brokers_status').on(t.status),
    index('idx_brokers_account_owner').on(t.accountOwner),
  ],
);

/**
 * Per-broker SharePoint document mirror.
 *
 * SharePoint is the source of truth for content; this table is a read-mirror of
 * file/folder METADATA only (no bytes), kept current by the delta sync. Items
 * removed in SharePoint are soft-deleted here (`deleted_at`) — we never lose the
 * record, and nothing is ever deleted remotely. Keyed by the stable Graph
 * `drive_item_id` so the sync is idempotent (upsert on conflict).
 */
export const brokerDocuments = pgTable(
  'broker_documents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    brokerId: uuid('broker_id')
      .notNull()
      .references(() => brokers.id, { onDelete: 'cascade' }),
    /** Graph driveItem id — stable identity across renames/moves. */
    driveItemId: text('drive_item_id').notNull().unique(),
    name: text('name').notNull(),
    /** Drive-relative path of the item. */
    path: text('path'),
    webUrl: text('web_url'),
    /** Byte size (files only); folders are null. bigint to survive >2 GB files. */
    size: bigint('size', { mode: 'number' }),
    mimeType: text('mime_type'),
    isFolder: boolean('is_folder').default(false).notNull(),
    /** Graph eTag — change detection / optimistic concurrency. */
    etag: text('etag'),
    lastModifiedAt: timestamp('last_modified_at', { withTimezone: true }),
    /** Set when the item disappears from SharePoint (soft delete; never hard). */
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('idx_broker_documents_broker').on(t.brokerId),
    index('idx_broker_documents_deleted_at').on(t.deletedAt),
  ],
);

/**
 * Resumable state for the SharePoint delta sync — one row PER BROKER, because
 * the sync is folder-scoped (`/items/{folderItemId}/delta`) rather than
 * drive-wide. Persisting `delta_link` lets each run pick up only what changed in
 * that broker's folder since the last sweep.
 */
export const sharepointSyncState = pgTable('sharepoint_sync_state', {
  brokerId: uuid('broker_id')
    .primaryKey()
    .references(() => brokers.id, { onDelete: 'cascade' }),
  /** The broker folder's driveItem id the delta is scoped to. */
  folderItemId: text('folder_item_id'),
  deltaLink: text('delta_link'),
  lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }),
});

/**
 * Per-broker instance of a plan step (one row per template step, always all of
 * them — `applicable` is a flag, never an insert/delete). Static title / sla_days
 * / copy live in the dashboard template, keyed by `code`. The effective deadline
 * is `deadline_override ?? (broker.signature_date + template.sla_days)`.
 */
export const brokerPlanSteps = pgTable(
  'broker_plan_steps',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    brokerId: uuid('broker_id')
      .notNull()
      .references(() => brokers.id, { onDelete: 'cascade' }),
    /** Template step code, e.g. "01", "03.01". */
    code: text('code').notNull(),
    applicable: boolean('applicable').default(true).notNull(),
    /** Manual deadline extension; overrides the computed deadline when set. */
    deadlineOverride: date('deadline_override'),
    position: real('position').default(0).notNull(),
  },
  (t) => [
    uniqueIndex('uq_broker_plan_steps_broker_code').on(t.brokerId, t.code),
    index('idx_broker_plan_steps_broker').on(t.brokerId),
  ],
);

/**
 * Mutable state of a plan sub-step. Static content (title, actions, email
 * template, supports) comes from the dashboard template by `template_substep_id`.
 */
export const brokerPlanSubsteps = pgTable(
  'broker_plan_substeps',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    stepId: uuid('step_id')
      .notNull()
      .references(() => brokerPlanSteps.id, { onDelete: 'cascade' }),
    /** Template sub-step id, e.g. "01-0" (stable join key to the template). */
    templateSubstepId: text('template_substep_id').notNull(),
    /** 'not_started' | 'in_progress' | 'waiting_client' | 'blocked' | 'done'. */
    status: text('status').default('not_started').notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    notes: text('notes'),
    position: real('position').default(0).notNull(),
  },
  (t) => [
    uniqueIndex('uq_broker_plan_substeps_step_tpl').on(t.stepId, t.templateSubstepId),
    index('idx_broker_plan_substeps_step').on(t.stepId),
  ],
);

export type SourceDocument = typeof sourceDocuments.$inferSelect;
export type NewSourceDocument = typeof sourceDocuments.$inferInsert;
export type KnowledgeUnit = typeof knowledgeUnits.$inferSelect;
export type NewKnowledgeUnit = typeof knowledgeUnits.$inferInsert;
export type AmlExclusionLogEntry = typeof amlExclusionLog.$inferSelect;
export type NewAmlExclusionLogEntry = typeof amlExclusionLog.$inferInsert;
export type RoadmapItem = typeof roadmapItems.$inferSelect;
export type NewRoadmapItem = typeof roadmapItems.$inferInsert;
export type RoadmapVote = typeof roadmapVotes.$inferSelect;
export type NewRoadmapVote = typeof roadmapVotes.$inferInsert;
export type Broker = typeof brokers.$inferSelect;
export type NewBroker = typeof brokers.$inferInsert;
export type BrokerPlanStep = typeof brokerPlanSteps.$inferSelect;
export type NewBrokerPlanStep = typeof brokerPlanSteps.$inferInsert;
export type BrokerPlanSubstep = typeof brokerPlanSubsteps.$inferSelect;
export type NewBrokerPlanSubstep = typeof brokerPlanSubsteps.$inferInsert;
export type BrokerDocument = typeof brokerDocuments.$inferSelect;
export type NewBrokerDocument = typeof brokerDocuments.$inferInsert;
export type SharepointSyncState = typeof sharepointSyncState.$inferSelect;
export type NewSharepointSyncState = typeof sharepointSyncState.$inferInsert;
