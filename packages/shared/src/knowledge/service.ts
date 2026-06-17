import { and, asc, count, desc, eq, ilike, inArray, or, sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import { config } from '../config/index.js';
import {
  knowledgeUnits,
  sourceDocuments,
  type Db,
  type KnowledgeUnit,
  type SourceDocument,
} from '../db/index.js';
import { LANGUAGES, TOPICS } from '../types/index.js';
import type { LLMClient } from '../llm/index.js';
import { hybridSearch, type HybridSearchOptions, type SearchResult } from '../retrieval/index.js';

export interface KnowledgeServiceDeps {
  db: Db;
  /** Required only for {@link searchSemantic} (query embedding). */
  llm?: LLMClient;
  /** Freshness threshold in months (defaults to config FRESHNESS_THRESHOLD_MONTHS). */
  freshnessMonths?: number;
}

export type KnowledgeSort = 'source_date' | 'confidence' | 'updated_at';

/** Filters/paging for the browsable knowledge table. */
export interface KnowledgeListParams {
  /** Case-insensitive substring over question + answer. */
  query?: string;
  topic?: string;
  author?: string;
  language?: string;
  origin?: string;
  reviewStatus?: string;
  isPublished?: boolean;
  /** `stale` = older than the freshness threshold; `fresh` = within it. */
  freshness?: 'fresh' | 'stale';
  sort?: KnowledgeSort;
  order?: 'asc' | 'desc';
  /** 1-based page number. */
  page?: number;
  pageSize?: number;
}

export interface KnowledgeListResult {
  rows: KnowledgeUnit[];
  total: number;
  page: number;
  pageSize: number;
}

/** A knowledge unit with the source emails it was distilled from (for citation). */
export interface KnowledgeUnitDetail {
  unit: KnowledgeUnit;
  sources: Array<
    Pick<SourceDocument, 'id' | 'messageId' | 'subject' | 'sender' | 'receivedAt' | 'direction'>
  >;
}

const SORT_COLUMNS = {
  source_date: knowledgeUnits.sourceDate,
  confidence: knowledgeUnits.confidence,
  updated_at: knowledgeUnits.updatedAt,
} as const;

function buildListFilters(params: KnowledgeListParams, freshnessMonths: number): SQL[] {
  const conditions: SQL[] = [];
  if (params.query) {
    const like = `%${params.query}%`;
    conditions.push(or(ilike(knowledgeUnits.question, like), ilike(knowledgeUnits.answer, like))!);
  }
  if (params.topic) conditions.push(eq(knowledgeUnits.topic, params.topic));
  if (params.author) conditions.push(eq(knowledgeUnits.author, params.author));
  if (params.language) conditions.push(eq(knowledgeUnits.language, params.language));
  if (params.origin) conditions.push(eq(knowledgeUnits.origin, params.origin));
  if (params.reviewStatus) conditions.push(eq(knowledgeUnits.reviewStatus, params.reviewStatus));
  if (params.isPublished !== undefined) {
    conditions.push(eq(knowledgeUnits.isPublished, params.isPublished));
  }
  if (params.freshness === 'stale') {
    conditions.push(
      sql`${knowledgeUnits.sourceDate} < (CURRENT_DATE - make_interval(months => ${freshnessMonths}))`,
    );
  } else if (params.freshness === 'fresh') {
    conditions.push(
      sql`${knowledgeUnits.sourceDate} >= (CURRENT_DATE - make_interval(months => ${freshnessMonths}))`,
    );
  }
  return conditions;
}

/**
 * List knowledge units with filters, sorting and pagination — the data behind
 * the dashboard's browsable, DB-like FAQ table.
 */
export async function listKnowledgeUnits(
  deps: KnowledgeServiceDeps,
  params: KnowledgeListParams = {},
): Promise<KnowledgeListResult> {
  const months = deps.freshnessMonths ?? config.FRESHNESS_THRESHOLD_MONTHS;
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(200, Math.max(1, params.pageSize ?? 25));

  const conditions = buildListFilters(params, months);
  const where = conditions.length ? and(...conditions) : undefined;

  const sortColumn = SORT_COLUMNS[params.sort ?? 'source_date'];
  const orderBy = params.order === 'asc' ? asc(sortColumn) : desc(sortColumn);

  const rows = await deps.db
    .select()
    .from(knowledgeUnits)
    .where(where)
    .orderBy(orderBy)
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  const totalRows = await deps.db.select({ value: count() }).from(knowledgeUnits).where(where);

  return { rows, total: totalRows[0]?.value ?? 0, page, pageSize };
}

/** Fetch one knowledge unit with its source emails (or null if not found). */
export async function getKnowledgeUnit(
  deps: KnowledgeServiceDeps,
  id: string,
): Promise<KnowledgeUnitDetail | null> {
  const [unit] = await deps.db.select().from(knowledgeUnits).where(eq(knowledgeUnits.id, id));
  if (!unit) return null;

  const ids = unit.sourceIds ?? [];
  const sources = ids.length
    ? await deps.db
        .select({
          id: sourceDocuments.id,
          messageId: sourceDocuments.messageId,
          subject: sourceDocuments.subject,
          sender: sourceDocuments.sender,
          receivedAt: sourceDocuments.receivedAt,
          direction: sourceDocuments.direction,
        })
        .from(sourceDocuments)
        .where(inArray(sourceDocuments.id, ids))
    : [];

  return { unit, sources };
}

/**
 * Semantic + lexical search over the knowledge base — the same retrieval the RAG
 * agent uses. Defaults to including unpublished units so officers can curate
 * drafts; pass `onlyPublished: true` for an agent-faithful preview.
 */
export async function searchSemantic(
  deps: KnowledgeServiceDeps,
  query: string,
  options: HybridSearchOptions = {},
): Promise<SearchResult[]> {
  if (!deps.llm) throw new Error('searchSemantic requires an LLM client in deps.');
  return hybridSearch({ db: deps.db, llm: deps.llm }, query, { onlyPublished: false, ...options });
}

/** Validated, officer-editable fields of a knowledge unit. */
const updateSchema = z.object({
  question: z.string().trim().min(1).optional(),
  answer: z.string().trim().min(1).optional(),
  topic: z.enum(TOPICS).nullable().optional(),
  regulatoryRefs: z.array(z.string()).nullable().optional(),
  language: z.enum(LANGUAGES).nullable().optional(),
  author: z.string().nullable().optional(),
  sourceDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'sourceDate must be YYYY-MM-DD')
    .nullable()
    .optional(),
  isPublished: z.boolean().optional(),
});

export type KnowledgeUpdate = z.input<typeof updateSchema>;

/**
 * Apply an officer edit to a knowledge unit. Atomic: the question is re-embedded
 * ONLY when its text changed (Q3), and text + embedding + status land in a single
 * UPDATE. Any content change marks the row `edited`; a publish-only toggle marks
 * it `reviewed` — either way it leaves `unreviewed`, protecting it from
 * re-distillation (Q4). Returns the updated row, or null if the id is unknown.
 */
export async function updateKnowledgeUnit(
  deps: KnowledgeServiceDeps,
  id: string,
  patch: KnowledgeUpdate,
  opts: { updatedBy: string },
): Promise<KnowledgeUnit | null> {
  const data = updateSchema.parse(patch);
  const [existing] = await deps.db.select().from(knowledgeUnits).where(eq(knowledgeUnits.id, id));
  if (!existing) return null;

  const set: Partial<typeof knowledgeUnits.$inferInsert> = {
    updatedBy: opts.updatedBy,
    updatedAt: new Date(),
  };
  let contentChanged = false;

  if (data.question !== undefined && data.question !== existing.question) {
    set.question = data.question;
    contentChanged = true;
  }
  if (data.answer !== undefined && data.answer !== existing.answer) {
    set.answer = data.answer;
    contentChanged = true;
  }
  if (data.topic !== undefined && data.topic !== existing.topic) {
    set.topic = data.topic;
    contentChanged = true;
  }
  if (
    data.regulatoryRefs !== undefined &&
    JSON.stringify(data.regulatoryRefs) !== JSON.stringify(existing.regulatoryRefs)
  ) {
    set.regulatoryRefs = data.regulatoryRefs;
    contentChanged = true;
  }
  if (data.language !== undefined && data.language !== existing.language) {
    set.language = data.language;
    contentChanged = true;
  }
  if (data.author !== undefined && data.author !== existing.author) {
    set.author = data.author;
    contentChanged = true;
  }
  if (data.sourceDate !== undefined && data.sourceDate !== existing.sourceDate) {
    set.sourceDate = data.sourceDate;
    contentChanged = true;
  }
  if (data.isPublished !== undefined && data.isPublished !== existing.isPublished) {
    set.isPublished = data.isPublished;
  }

  // Re-embed only when the question text actually changed (semantic vector tracks
  // the question; the lexical search_vector regenerates itself in Postgres).
  if (set.question !== undefined) {
    if (!deps.llm) throw new Error('Re-embedding the question requires an LLM client in deps.');
    const [embedding] = await deps.llm.embed([set.question]);
    if (!embedding) throw new Error('Embedding failed for the updated question.');
    set.embedding = embedding;
  }

  set.reviewStatus = contentChanged ? 'edited' : 'reviewed';

  const [updated] = await deps.db
    .update(knowledgeUnits)
    .set(set)
    .where(eq(knowledgeUnits.id, id))
    .returning();
  return updated ?? null;
}

/** Mark a unit reviewed without changing its content (officer approval). */
export async function markKnowledgeUnitReviewed(
  deps: KnowledgeServiceDeps,
  id: string,
  updatedBy: string,
): Promise<KnowledgeUnit | null> {
  const [updated] = await deps.db
    .update(knowledgeUnits)
    .set({ reviewStatus: 'reviewed', updatedBy, updatedAt: new Date() })
    .where(eq(knowledgeUnits.id, id))
    .returning();
  return updated ?? null;
}

/** Distinct values for the table's filter dropdowns (topics, authors, languages). */
export async function getKnowledgeFacets(deps: KnowledgeServiceDeps): Promise<{
  topics: string[];
  authors: string[];
  languages: string[];
}> {
  const [topics, authors, languages] = await Promise.all([
    deps.db.selectDistinct({ v: knowledgeUnits.topic }).from(knowledgeUnits),
    deps.db.selectDistinct({ v: knowledgeUnits.author }).from(knowledgeUnits),
    deps.db.selectDistinct({ v: knowledgeUnits.language }).from(knowledgeUnits),
  ]);
  const clean = (rows: Array<{ v: string | null }>) =>
    rows.map((r) => r.v).filter((v): v is string => !!v).sort();
  return { topics: clean(topics), authors: clean(authors), languages: clean(languages) };
}
