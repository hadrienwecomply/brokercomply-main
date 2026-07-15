import { sql, type SQL } from 'drizzle-orm';
import {
  bigint,
  boolean,
  customType,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
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
 * Resumable state for the incremental email delta sync — one row per
 * (mailbox, folder). `delta_link` is the opaque Graph `@odata.deltaLink` that
 * lets the next run fetch only what changed since the last sweep. This is what
 * makes a frequent cron cheap (vs re-fetching the whole mailbox each time).
 */
export const mailSyncState = pgTable(
  'mail_sync_state',
  {
    mailbox: text('mailbox').notNull(),
    /** Well-known folder the delta is scoped to (e.g. 'inbox', 'sentitems'). */
    folder: text('folder').notNull(),
    deltaLink: text('delta_link'),
    lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }),
  },
  (t) => [primaryKey({ columns: [t.mailbox, t.folder] })],
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
    /**
     * Opt-in domains for email matching, e.g. ["acme-broker.be"]. Empty by
     * default: conversation matching is exact-email only unless an officer
     * explicitly opts a (non-public) domain in. Public domains (gmail, outlook…)
     * are rejected at the app layer to avoid leaking across brokers.
     */
    matchDomains: jsonb('match_domains').$type<string[]>().default([]).notNull(),
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
    /**
     * Company logo, PNG only, stored inline as base64 (no `data:` prefix).
     * TEMPORARY home — like the report PDFs, this moves to a blob/SharePoint
     * store later. Small by construction (≤ ~2 MB, validated at the upload route).
     */
    logoBase64: text('logo_base64'),
    logoMimeType: text('logo_mime_type'),
    /**
     * Brand primary colour (hex `#rrggbb`), used to personalise forms/reports.
     * Pre-filled from the logo via Anthropic vision on upload, always editable.
     */
    primaryColor: text('primary_color'),
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
 * A broker's task (sub-step). Forked at creation from the global task template:
 * each broker carries its own editable copy (`title`, `email_*`) so editing the
 * global template never mutates an in-flight plan. Supports / action bullets stay
 * in the dashboard code, resolved by `content_key` (e.g. "01-0"); custom tasks
 * added by hand have a null `content_key`.
 */
export const brokerPlanSubsteps = pgTable(
  'broker_plan_substeps',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    stepId: uuid('step_id')
      .notNull()
      .references(() => brokerPlanSteps.id, { onDelete: 'cascade' }),
    /** Stable key to the code-side static content (supports/actions), e.g. "01-0". Null for custom tasks. */
    contentKey: text('template_substep_id'),
    /** Forked editable title (copied from the template at materialisation). */
    title: text('title'),
    /** Forked editable email template. */
    emailSubject: text('email_subject'),
    emailBody: text('email_body'),
    /** Task-level due date; overrides the section deadline for this task when set. */
    dueDate: date('due_date'),
    /** True when the task was added by hand (not seeded from the template). */
    isCustom: boolean('is_custom').default(false).notNull(),
    /** Soft-delete marker; archived tasks are hidden and excluded from progress. */
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    /** 'not_started' | 'in_progress' | 'waiting_client' | 'blocked' | 'done'. */
    status: text('status').default('not_started').notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    notes: text('notes'),
    position: real('position').default(0).notNull(),
  },
  (t) => [
    uniqueIndex('uq_broker_plan_substeps_step_tpl').on(t.stepId, t.contentKey),
    index('idx_broker_plan_substeps_step').on(t.stepId),
  ],
);

/**
 * Audit log of action-plan template emails sent from the dashboard. The source
 * of truth for "what we sent" (the sending officer's Sent items are ingested,
 * but this is the canonical record); also powers the "envoyé le X" badge + soft
 * re-send warning. We log AFTER a successful Graph send, storing the content.
 */
export const outboundEmails = pgTable(
  'outbound_emails',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    brokerId: uuid('broker_id')
      .notNull()
      .references(() => brokers.id, { onDelete: 'cascade' }),
    /** Plan step code, e.g. "01" (provenance of the template). */
    stepCode: text('step_code'),
    /** Template sub-step id, e.g. "01-0" — links the send to a sub-step. */
    substepTemplateId: text('substep_template_id'),
    /** Sender mailbox the email was sent from (the assigned officer). */
    fromMailbox: text('from_mailbox').notNull(),
    toAddrs: jsonb('to_addrs').$type<string[]>().default([]).notNull(),
    ccAddrs: jsonb('cc_addrs').$type<string[]>().default([]).notNull(),
    replyTo: text('reply_to'),
    subject: text('subject'),
    body: text('body'),
    /** Officer (email) who triggered the send — attribution (cookie identity). */
    sentByOfficer: text('sent_by_officer'),
    sentAt: timestamp('sent_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('idx_outbound_emails_broker').on(t.brokerId),
    index('idx_outbound_emails_substep').on(t.brokerId, t.substepTemplateId),
  ],
);

/**
 * Global timeframe config — one row per plan section (the 13 step codes). The
 * effective section deadline is `broker.signature_date + offset_days` (parallel
 * offsets, not a cascade), overridable per broker via `broker_plan_steps.deadline_override`.
 * Editable from the dashboard Config tab; replaces the hard-coded `slaDays`.
 */
export const planStepOffsets = pgTable('plan_step_offsets', {
  /** Section / step code, e.g. "01", "03.01". */
  code: text('code').primaryKey(),
  title: text('title').notNull(),
  offsetDays: integer('offset_days').notNull(),
  position: real('position').default(0).notNull(),
});

/**
 * Global, editable default task list per section. Brokers are forked from this
 * at creation (edits here affect future brokers only). Supports / action bullets
 * stay in code, resolved by `content_key`; null for tasks added from the UI.
 */
export const planTaskTemplates = pgTable(
  'plan_task_templates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Section / step code this task belongs to. */
    stepCode: text('step_code').notNull(),
    title: text('title').notNull(),
    emailSubject: text('email_subject'),
    emailBody: text('email_body'),
    /** Stable key to code-side static content (supports/actions), e.g. "01-0". Null for UI-added tasks. */
    contentKey: text('content_key'),
    position: real('position').default(0).notNull(),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
  },
  (t) => [index('idx_plan_task_templates_step').on(t.stepCode)],
);

export type SourceDocument = typeof sourceDocuments.$inferSelect;
export type NewSourceDocument = typeof sourceDocuments.$inferInsert;
export type MailSyncState = typeof mailSyncState.$inferSelect;
export type NewMailSyncState = typeof mailSyncState.$inferInsert;
export type OutboundEmail = typeof outboundEmails.$inferSelect;
export type NewOutboundEmail = typeof outboundEmails.$inferInsert;
export type KnowledgeUnit = typeof knowledgeUnits.$inferSelect;
export type NewKnowledgeUnit = typeof knowledgeUnits.$inferInsert;
export type AmlExclusionLogEntry = typeof amlExclusionLog.$inferSelect;
export type NewAmlExclusionLogEntry = typeof amlExclusionLog.$inferInsert;
export type RoadmapItem = typeof roadmapItems.$inferSelect;
export type NewRoadmapItem = typeof roadmapItems.$inferInsert;
export type RoadmapVote = typeof roadmapVotes.$inferSelect;
export type NewRoadmapVote = typeof roadmapVotes.$inferInsert;
export type PlanStepOffset = typeof planStepOffsets.$inferSelect;
export type NewPlanStepOffset = typeof planStepOffsets.$inferInsert;
export type PlanTaskTemplate = typeof planTaskTemplates.$inferSelect;
export type NewPlanTaskTemplate = typeof planTaskTemplates.$inferInsert;
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

/**
 * A single Fillout form submission, linked to the broker it was matched to (or a
 * broker that was auto-created from it — see `match_method='created'`). One row
 * per Fillout submission; `fillout_submission_id` is unique so the inbound
 * webhook is idempotent on retries. `raw_payload` keeps the untouched Fillout
 * body as a safety net; the normalized answers live in `form_fields`.
 */
export const formSubmissions = pgTable(
  'form_submissions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    brokerId: uuid('broker_id')
      .notNull()
      .references(() => brokers.id, { onDelete: 'cascade' }),
    /** Fillout public form id (which form was submitted). */
    filloutFormId: text('fillout_form_id').notNull(),
    /** Fillout submission id — unique, drives webhook idempotency. */
    filloutSubmissionId: text('fillout_submission_id').notNull(),
    /** Human label derived from the form id via the dashboard form template. */
    formType: text('form_type'),
    /** When the form was submitted (Fillout `submissionTime`). */
    submittedAt: timestamp('submitted_at', { withTimezone: true }),
    /** How the broker was resolved: 'email' | 'domain' | 'name' | 'created' | 'manual'. */
    matchMethod: text('match_method').notNull(),
    /** Processing lifecycle: 'received' | 'triggered' | 'failed' | 'done' | 'error'. */
    status: text('status').default('received').notNull(),
    /** n8n execution id returned when the workflow was triggered, if any. */
    n8nExecutionId: text('n8n_execution_id'),
    /** Untouched Fillout webhook body, kept as a recovery/audit safety net. */
    rawPayload: jsonb('raw_payload').$type<unknown>(),
    /** Result payload posted back by n8n when the workflow finished (callback). */
    n8nResult: jsonb('n8n_result').$type<unknown>(),
    /** When n8n reported the workflow finished (callback timestamp). */
    completedAt: timestamp('completed_at', { withTimezone: true }),
    /** Editable review HTML rendered by the n8n diagnostic workflow. */
    reviewHtml: text('review_html'),
    /** Officer's latest corrections (the `edits` object from the editor). */
    reviewEdits: jsonb('review_edits').$type<unknown>(),
    /** Review lifecycle: 'pending' | 'edited' | 'pdf_requested' | 'pdf_ready'. */
    reviewStatus: text('review_status'),
    /**
     * URL the "PDF" button points to. Temporarily a BrokerComply route serving
     * the stored PDF; will become the broker's SharePoint URL once the doc-sync
     * subsystem is merged into this branch and BrokerComply uploads it there.
     */
    pdfRef: text('pdf_ref'),
    /**
     * Base64-encoded PDF returned by the n8n PDF workflow, stored temporarily
     * here. TEMPORARY: replaced by a SharePoint upload after the doc-sync merge,
     * at which point this column is dropped. n8n never touches SharePoint.
     */
    pdfBase64: text('pdf_base64'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('uq_form_submissions_fillout_submission').on(t.filloutSubmissionId),
    index('idx_form_submissions_broker').on(t.brokerId),
    index('idx_form_submissions_status').on(t.status),
  ],
);

/**
 * One answer of a form submission, normalized from Fillout's `questions[]`.
 * `value` is jsonb because a Fillout answer can be a string, number, array
 * (multi-select / file uploads) or object depending on the question `type`.
 */
export const formFields = pgTable(
  'form_fields',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    submissionId: uuid('submission_id')
      .notNull()
      .references(() => formSubmissions.id, { onDelete: 'cascade' }),
    /** Fillout question id (stable join key to the form definition). */
    questionId: text('question_id').notNull(),
    /** Question label as shown to the respondent (Fillout `name`). */
    name: text('name'),
    /** Fillout question type, e.g. 'ShortAnswer' | 'Email' | 'MultipleChoice'. */
    type: text('type'),
    /** Answer value — shape depends on `type` (string | number | array | object). */
    value: jsonb('value').$type<unknown>(),
    position: real('position').default(0).notNull(),
  },
  (t) => [
    uniqueIndex('uq_form_fields_submission_question').on(t.submissionId, t.questionId),
    index('idx_form_fields_submission').on(t.submissionId),
  ],
);


export type FormSubmission = typeof formSubmissions.$inferSelect;
export type NewFormSubmission = typeof formSubmissions.$inferInsert;
export type FormField = typeof formFields.$inferSelect;
export type NewFormField = typeof formFields.$inferInsert;

/**
 * Website compliance audits — one row per audit run of a broker's public
 * site. `findings` holds the assembled payload (contract of the skill's
 * payload.schema.json); the review/PDF lifecycle columns mirror
 * `form_submissions` so the editable-report + PDF machinery is shared.
 */
export const websiteAudits = pgTable(
  'website_audits',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    brokerId: uuid('broker_id')
      .notNull()
      .references(() => brokers.id, { onDelete: 'cascade' }),
    /** URL audited (snapshot of brokers.website at launch time). */
    websiteUrl: text('website_url').notNull(),
    /**
     * Audit lifecycle: 'queued' | 'running' | 'analyzed' | 'review_pending'
     * | 'needs_manual' | 'error'. Designed so a worker dyno can later drain
     * 'queued' rows without a schema change.
     */
    status: text('status').default('queued').notNull(),
    /** Assembled audit payload (AuditPayload JSON — findings + summary). */
    findings: jsonb('findings').$type<unknown>(),
    /** Raw checker constats (verdicts + evidence), kept for replay/debug. */
    constats: jsonb('constats').$type<unknown>(),
    /** Pages scraped / failed / to-verify, incl. visual-measurement info. */
    pagesFetched: jsonb('pages_fetched').$type<unknown>(),
    errorMessage: text('error_message'),
    /** Editable review HTML rendered from `findings` (brokercomply-review/v1). */
    reviewHtml: text('review_html'),
    /** Officer's latest corrections (the `edits` object from the editor). */
    reviewEdits: jsonb('review_edits').$type<unknown>(),
    /** Review lifecycle: 'pending' | 'edited' | 'pdf_requested' | 'pdf_ready'. */
    reviewStatus: text('review_status'),
    /** URL the "PDF" button points to (app route serving the stored PDF). */
    pdfRef: text('pdf_ref'),
    /** Base64 PDF returned by the n8n rapport-reco workflow (same temporary
     * storage approach as form_submissions.pdf_base64). */
    pdfBase64: text('pdf_base64'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('idx_website_audits_broker').on(t.brokerId),
    index('idx_website_audits_status').on(t.status),
  ],
);

export type WebsiteAuditRow = typeof websiteAudits.$inferSelect;
export type NewWebsiteAuditRow = typeof websiteAudits.$inferInsert;

/**
 * Print-advertising compliance audits — one row per uploaded creative (image).
 * A multi-image upload shares a `batch_id` so the UI can group them, but each
 * image is analysed independently (one payload = one ad). Mirrors the
 * `website_audits` review/PDF lifecycle so the editable-report + PDF machinery
 * is shared.
 */
export const pubAudits = pgTable(
  'pub_audits',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    brokerId: uuid('broker_id')
      .notNull()
      .references(() => brokers.id, { onDelete: 'cascade' }),
    /** Groups the images uploaded together in one batch. */
    batchId: uuid('batch_id').notNull().defaultRandom(),
    /** Original file name of the uploaded creative. */
    fileName: text('file_name').notNull(),
    /** Uploaded image, base64 (same storage approach as brokers.logo_base64). */
    imageBase64: text('image_base64').notNull(),
    imageMimeType: text('image_mime_type').notNull(),
    /** Phase 2 — caption / body text supplied alongside the visual (optional). */
    accompanyingText: text('accompanying_text'),
    /** Phase 2 — landing page the ad links to; its text is fetched at analysis time. */
    landingUrl: text('landing_url'),
    /**
     * Audit lifecycle: 'queued' | 'running' | 'analyzed' | 'review_pending'
     * | 'needs_manual' | 'error'.
     */
    status: text('status').default('queued').notNull(),
    /** Assembled pub audit payload (PubAuditPayload JSON). */
    findings: jsonb('findings').$type<unknown>(),
    /** Shared transcription + qualification (pass 0), kept for replay/debug. */
    qualification: jsonb('qualification').$type<unknown>(),
    errorMessage: text('error_message'),
    /** Editable review HTML rendered from `findings` (brokercomply-pub/v1). */
    reviewHtml: text('review_html'),
    /** Officer's latest corrections (the `edits` object from the editor). */
    reviewEdits: jsonb('review_edits').$type<unknown>(),
    /** Review lifecycle: 'pending' | 'edited' | 'pdf_requested' | 'pdf_ready'. */
    reviewStatus: text('review_status'),
    /** URL the "PDF" button points to (app route serving the stored PDF). */
    pdfRef: text('pdf_ref'),
    /** Base64 PDF returned by the n8n pub-rapport workflow. */
    pdfBase64: text('pdf_base64'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('idx_pub_audits_broker').on(t.brokerId),
    index('idx_pub_audits_batch').on(t.batchId),
    index('idx_pub_audits_status').on(t.status),
  ],
);

export type PubAuditRow = typeof pubAudits.$inferSelect;
export type NewPubAuditRow = typeof pubAudits.$inferInsert;

/**
 * Cabinet-owned guidance for a pub-audit check (Phase 3). One row per catalog
 * check id the firm wants to steer: a library of approved reformulations the
 * checker should prefer, plus an optional interpretation note. Editable from
 * the Config UI — no redeploy needed. The legal grid itself stays code-owned
 * (see pub-audit/catalog.ts); only the recommendations live here.
 */
export const pubCheckGuidance = pgTable('pub_check_guidance', {
  /** Catalog check id, e.g. "C5b" (primary key — one guidance row per check). */
  checkId: text('check_id').primaryKey(),
  /** Approved reformulations the checker should reuse (string[]). */
  reformulations: jsonb('reformulations').$type<string[]>().default([]).notNull(),
  /** Free-form interpretation note injected into the checker prompt. */
  consigne: text('consigne'),
  /** When false, the guidance is ignored (kept for history). */
  active: boolean('active').default(true).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export type PubCheckGuidanceRow = typeof pubCheckGuidance.$inferSelect;
export type NewPubCheckGuidanceRow = typeof pubCheckGuidance.$inferInsert;

/**
 * Officer corrections mined from the editable pub report (Phase 4). One row per
 * changed field at "Générer le PDF" time: the LLM's value, the officer's value,
 * and — for verdict flips — the optional internal reason. These rows feed the
 * checker prompts of later audits (few-shot) and the calibration view; they are
 * never shown to brokers.
 */
export const pubAuditFeedback = pgTable(
  'pub_audit_feedback',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    auditId: uuid('audit_id')
      .notNull()
      .references(() => pubAudits.id, { onDelete: 'cascade' }),
    brokerId: uuid('broker_id')
      .notNull()
      .references(() => brokers.id, { onDelete: 'cascade' }),
    /** Catalog check id this correction is about, e.g. "G12". */
    checkId: text('check_id').notNull(),
    /** Which field changed: 'verdict' | 'reformulation' | 'citation' | 'explication' | 'commentaire' | 'a_verifier_ou'. */
    field: text('field').notNull(),
    /** The value the LLM produced (verdict code or text), null if it was empty. */
    valueLlm: text('value_llm'),
    /** The value the officer set. */
    valueOfficer: text('value_officer'),
    /** Officer's internal "why I corrected this" — only for verdict flips. */
    correctionNote: text('correction_note'),
    /** Grid version the audit ran on, for cohorting corrections over time. */
    catalogVersion: text('catalog_version'),
    /** True once promoted into pub_check_guidance (dedup for the promote flow). */
    promoted: boolean('promoted').default(false).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('idx_pub_audit_feedback_check').on(t.checkId),
    index('idx_pub_audit_feedback_audit').on(t.auditId),
  ],
);

export type PubAuditFeedbackRow = typeof pubAuditFeedback.$inferSelect;
export type NewPubAuditFeedbackRow = typeof pubAuditFeedback.$inferInsert;

/**
 * Assistant agent — shared conversations.
 *
 * The embedded Claude Agent SDK chat, visible to all officers (no per-user
 * privacy in v1 — private network, cookie identity). One row per conversation.
 * `sdkSessionId` is the Agent SDK session id captured from the first completed
 * turn; resuming a conversation replays it via `query({ options: { resume } })`.
 * The messages themselves are mirrored to `agent_chat_messages` so the shared
 * list and transcript render from Postgres regardless of the SDK's own
 * (filesystem-backed, ephemeral on Heroku) session store.
 */
export const agentChats = pgTable(
  'agent_chats',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Display title — derived from the first user prompt, officer-renamable. */
    title: text('title'),
    /** Agent SDK session id for resumption; null until the first turn completes. */
    sdkSessionId: text('sdk_session_id'),
    /** Officer (email) who created the conversation — cookie identity. */
    createdBy: text('created_by').notNull(),
    /** Running total API cost across all turns (USD), for a lightweight budget view. */
    totalCostUsd: numeric('total_cost_usd').default('0').notNull(),
    /** Soft-delete marker; archived chats are hidden from the shared list. */
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('idx_agent_chats_updated_at').on(t.updatedAt),
    index('idx_agent_chats_archived_at').on(t.archivedAt),
  ],
);

/**
 * One message in an assistant conversation. `content` is the array of display
 * blocks for the turn: `{type:'text'}` plus condensed `{type:'tool_use'}` /
 * `{type:'tool_result'}` markers so the transcript can show what the agent did
 * without re-running it. Assistant turns also record their API cost.
 */
export const agentChatMessages = pgTable(
  'agent_chat_messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    chatId: uuid('chat_id')
      .notNull()
      .references(() => agentChats.id, { onDelete: 'cascade' }),
    /** 'user' | 'assistant'. */
    role: text('role').notNull(),
    /** Ordered display blocks for the turn (text + condensed tool markers). */
    content: jsonb('content').$type<unknown[]>().default([]).notNull(),
    /** Officer (email) who sent a user turn; null for assistant turns. */
    officer: text('officer'),
    /** API cost of this assistant turn (USD); null for user turns. */
    costUsd: numeric('cost_usd'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('idx_agent_chat_messages_chat').on(t.chatId, t.createdAt)],
);

export type AgentChatRow = typeof agentChats.$inferSelect;
export type NewAgentChatRow = typeof agentChats.$inferInsert;
export type AgentChatMessageRow = typeof agentChatMessages.$inferSelect;
export type NewAgentChatMessageRow = typeof agentChatMessages.$inferInsert;

/**
 * Audit trail of every tool the assistant tried to run. Written by the
 * PreToolUse hook BEFORE the tool executes, so it captures attempts (including
 * denied ones) — the compliance-grade record of who did what through the agent.
 * `decision` is 'allow' | 'deny' | 'confirm_required' | 'confirmed' | 'rejected'.
 */
export const agentToolAudit = pgTable(
  'agent_tool_audit',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    chatId: uuid('chat_id').references(() => agentChats.id, { onDelete: 'set null' }),
    /** Officer (email) on whose behalf the turn runs — cookie identity. */
    officer: text('officer'),
    /** Fully-qualified tool name, e.g. mcp__brokercomply__plan_set_substep_status. */
    toolName: text('tool_name').notNull(),
    /** Tool input arguments as the agent supplied them. */
    input: jsonb('input').$type<unknown>(),
    /** Lifecycle decision for the call (see table comment). */
    decision: text('decision').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('idx_agent_tool_audit_chat').on(t.chatId, t.createdAt),
    index('idx_agent_tool_audit_tool').on(t.toolName),
  ],
);

export type AgentToolAuditRow = typeof agentToolAudit.$inferSelect;
export type NewAgentToolAuditRow = typeof agentToolAudit.$inferInsert;
