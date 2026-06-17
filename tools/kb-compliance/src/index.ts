/**
 * kb-compliance — BrokerComply knowledge-base compliance engine.
 *
 * Phase 0. Ingestion (0-B) and AML filter (0-C) are implemented; distillation,
 * retrieval, agent and full CLI follow in 0-D through 0-F.
 */
export const KB_COMPLIANCE_VERSION = '0.0.0-phase0';

// Ingestion (0-B)
export * from './ingestion/types.js';
export * from './ingestion/direction.js';
export * from './ingestion/thread-builder.js';
export * from './ingestion/email-cleaner.js';
export * from './ingestion/attachment-parser.js';
export * from './ingestion/language.js';
export * from './ingestion/client-filter.js';
export * from './ingestion/fixture-source.js';
export * from './ingestion/graph-client.js';
export * from './ingestion/ingest.js';

// AML filter (0-C)
export * from './aml-filter/keywords.js';
export * from './aml-filter/types.js';
export * from './aml-filter/filter.js';

// Distillation (0-D)
export * from './distillation/types.js';
export * from './distillation/extractor.js';
export * from './distillation/embedder.js';
export * from './distillation/distill.js';

// Retrieval (0-E) lives in @brokercomply/shared (shared by the agent and the dashboard).
export { hybridSearch, reciprocalRankFusion, RRF_K } from '@brokercomply/shared';
export type {
  HybridSearchOptions,
  HybridSearchDeps,
  SearchResult,
  LegRank,
} from '@brokercomply/shared';
