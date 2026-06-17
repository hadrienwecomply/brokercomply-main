import { knowledgeUnits, type KnowledgeUnit } from '../db/index.js';
import { inArray, sql, type SQL } from 'drizzle-orm';
import { reciprocalRankFusion, type RankedItem } from './rrf.js';
import type { HybridSearchDeps, HybridSearchOptions, SearchResult } from './types.js';

const DEFAULT_SEMANTIC_K = 10;
const DEFAULT_LEXICAL_K = 10;
const DEFAULT_LIMIT = 5;

/** Build the optional SQL filters shared by both legs (topic/language/date). */
function buildFilters(options: HybridSearchOptions): SQL[] {
  const filters: SQL[] = [];
  if (options.onlyPublished !== false) filters.push(sql`is_published = true`);
  if (options.topic) filters.push(sql`topic = ${options.topic}`);
  if (options.language) filters.push(sql`language = ${options.language}`);
  if (options.sourceDateFrom) filters.push(sql`source_date >= ${options.sourceDateFrom}`);
  if (options.sourceDateTo) filters.push(sql`source_date <= ${options.sourceDateTo}`);
  return filters;
}

/** Append ` AND (...)` for each filter, or nothing when there are none. */
function andFilters(filters: SQL[]): SQL {
  return filters.length ? sql` AND ${sql.join(filters, sql` AND `)}` : sql``;
}

/** Format a 1536-d embedding as a pgvector literal, e.g. `[0.1,0.2,...]`. */
function toVectorLiteral(embedding: number[]): string {
  return `[${embedding.join(',')}]`;
}

/**
 * Hybrid retrieval over `knowledge_units`: a semantic leg (pgvector cosine) and
 * a lexical leg (Postgres full-text `ts_rank` on the `simple` `search_vector`)
 * are each pulled top-K, then merged with Reciprocal Rank Fusion. Optional
 * topic/language/source_date filters apply to both legs. Returns the top-N
 * fused results with full knowledge-unit metadata and per-leg ranks.
 */
export async function hybridSearch(
  deps: HybridSearchDeps,
  query: string,
  options: HybridSearchOptions = {},
): Promise<SearchResult[]> {
  const { db, llm } = deps;
  const log = deps.log ?? (() => {});
  const semanticK = options.semanticK ?? DEFAULT_SEMANTIC_K;
  const lexicalK = options.lexicalK ?? DEFAULT_LEXICAL_K;
  const limit = options.limit ?? DEFAULT_LIMIT;

  const trimmed = query.trim();
  if (!trimmed) return [];

  const filters = buildFilters(options);
  const filterSql = andFilters(filters);

  // Semantic leg: cosine distance (`<=>`); similarity = 1 - distance.
  const [embedding] = await llm.embed([trimmed]);
  const vectorLiteral = embedding ? toVectorLiteral(embedding) : null;
  const semanticPromise: Promise<{ id: string; similarity: number }[]> = vectorLiteral
    ? (db.execute(
        sql`SELECT id, 1 - (embedding <=> ${vectorLiteral}::vector) AS similarity
            FROM knowledge_units
            WHERE embedding IS NOT NULL${filterSql}
            ORDER BY embedding <=> ${vectorLiteral}::vector
            LIMIT ${semanticK}`,
      ) as Promise<{ id: string; similarity: number }[]>)
    : Promise.resolve([]);

  // Lexical leg: `plainto_tsquery('simple', ...)` is punctuation-safe and keeps
  // exact regulatory references (e.g. "FSMA 2023_12") intact, no stemming.
  const lexicalPromise = db.execute(
    sql`SELECT id, ts_rank(search_vector, plainto_tsquery('simple', ${trimmed})) AS rank
        FROM knowledge_units
        WHERE search_vector @@ plainto_tsquery('simple', ${trimmed})${filterSql}
        ORDER BY rank DESC
        LIMIT ${lexicalK}`,
  ) as Promise<{ id: string; rank: number }[]>;

  const [semanticRows, lexicalRows] = await Promise.all([semanticPromise, lexicalPromise]);

  const semantic: RankedItem[] = semanticRows.map((r) => ({ id: r.id, score: Number(r.similarity) }));
  const lexical: RankedItem[] = lexicalRows.map((r) => ({ id: r.id, score: Number(r.rank) }));
  log(`hybridSearch "${trimmed}": ${semantic.length} semantic, ${lexical.length} lexical hit(s).`);

  const fused = reciprocalRankFusion(semantic, lexical).slice(0, limit);
  if (fused.length === 0) return [];

  // Hydrate full rows for the surviving ids, then reorder by fused score.
  const ids = fused.map((f) => f.id);
  const rows = await db.select().from(knowledgeUnits).where(inArray(knowledgeUnits.id, ids));
  const byId = new Map<string, KnowledgeUnit>(rows.map((r) => [r.id, r]));

  return fused
    .map((f): SearchResult | null => {
      const unit = byId.get(f.id);
      if (!unit) return null;
      return { unit, score: f.score, semantic: f.semantic, lexical: f.lexical };
    })
    .filter((r): r is SearchResult => r !== null);
}
