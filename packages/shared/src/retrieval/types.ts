import type { Db, KnowledgeUnit } from '../db/index.js';
import type { Language, Topic } from '../types/index.js';
import type { LLMClient } from '../llm/index.js';

/** Options for {@link hybridSearch}. All filters are applied to BOTH legs. */
export interface HybridSearchOptions {
  /** How many candidates to pull from the semantic leg before fusion. Default 10. */
  semanticK?: number;
  /** How many candidates to pull from the lexical leg before fusion. Default 10. */
  lexicalK?: number;
  /** Final number of fused results returned. Default 5. */
  limit?: number;
  /** Restrict to a single topic. */
  topic?: Topic;
  /** Restrict to a single language. */
  language?: Language;
  /** Inclusive lower bound on `source_date` (format `YYYY-MM-DD`). */
  sourceDateFrom?: string;
  /** Inclusive upper bound on `source_date` (format `YYYY-MM-DD`). */
  sourceDateTo?: string;
  /**
   * Restrict to published units. Defaults to true so the RAG agent never serves
   * unpublished/draft entries; the dashboard passes false to browse everything.
   */
  onlyPublished?: boolean;
}

/** One ranked leg's contribution to a fused result, kept for transparency/debug. */
export interface LegRank {
  /** 1-based position in that leg's ranking. */
  rank: number;
  /**
   * Raw leg score: cosine similarity (0–1, higher = closer) for the semantic
   * leg, `ts_rank` for the lexical leg.
   */
  score: number;
}

/** A single hybrid-search hit: the knowledge unit plus its fused score. */
export interface SearchResult {
  unit: KnowledgeUnit;
  /** Reciprocal-rank-fusion score (higher = better). */
  score: number;
  /** Present when the unit was retrieved by the semantic leg. */
  semantic?: LegRank;
  /** Present when the unit was retrieved by the lexical leg. */
  lexical?: LegRank;
}

export interface HybridSearchDeps {
  db: Db;
  llm: LLMClient;
  log?: (message: string) => void;
}
