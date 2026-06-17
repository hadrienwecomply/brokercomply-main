import "server-only";
import {
  createLLMClient,
  getKnowledgeFacets,
  getKnowledgeUnit,
  listKnowledgeUnits,
  markKnowledgeUnitReviewed,
  searchSemantic,
  updateKnowledgeUnit,
  type KnowledgeListParams,
  type KnowledgeUnit,
  type KnowledgeUpdate,
} from "@brokercomply/shared";
import { getDb } from "./db.server";
import type { KnowledgeRow, KnowledgeSource } from "./knowledge-types";

export type { KnowledgeRow, KnowledgeSource } from "./knowledge-types";

function toRow(u: KnowledgeUnit): KnowledgeRow {
  return {
    id: u.id,
    question: u.question,
    answer: u.answer,
    topic: u.topic,
    regulatoryRefs: u.regulatoryRefs ?? null,
    language: u.language,
    author: u.author,
    confidence: u.confidence,
    sourceDate: u.sourceDate,
    origin: u.origin,
    reviewStatus: u.reviewStatus,
    isPublished: u.isPublished,
    updatedBy: u.updatedBy,
    updatedAt: u.updatedAt ? new Date(u.updatedAt).toISOString() : null,
  };
}

export async function listUnits(params: KnowledgeListParams): Promise<{
  rows: KnowledgeRow[];
  total: number;
  page: number;
  pageSize: number;
}> {
  const res = await listKnowledgeUnits({ db: getDb() }, params);
  return { rows: res.rows.map(toRow), total: res.total, page: res.page, pageSize: res.pageSize };
}

export async function getUnitDetail(
  id: string,
): Promise<{ unit: KnowledgeRow; sources: KnowledgeSource[] } | null> {
  const detail = await getKnowledgeUnit({ db: getDb() }, id);
  if (!detail) return null;
  return {
    unit: toRow(detail.unit),
    sources: detail.sources.map((s) => ({
      id: s.id,
      messageId: s.messageId,
      subject: s.subject,
      sender: s.sender,
      receivedAt: s.receivedAt ? new Date(s.receivedAt).toISOString() : null,
      direction: s.direction,
    })),
  };
}

export async function semanticSearch(
  query: string,
): Promise<Array<{ row: KnowledgeRow; score: number }>> {
  const llm = createLLMClient();
  const results = await searchSemantic({ db: getDb(), llm }, query, { limit: 25 });
  return results.map((r) => ({ row: toRow(r.unit), score: r.score }));
}

export function facets(): Promise<{ topics: string[]; authors: string[]; languages: string[] }> {
  return getKnowledgeFacets({ db: getDb() });
}

export async function updateUnit(
  id: string,
  patch: KnowledgeUpdate,
  updatedBy: string,
): Promise<KnowledgeRow | null> {
  // LLM needed only if the question changes; cheap to construct regardless.
  const llm = createLLMClient();
  const updated = await updateKnowledgeUnit({ db: getDb(), llm }, id, patch, { updatedBy });
  return updated ? toRow(updated) : null;
}

export async function markReviewed(id: string, updatedBy: string): Promise<KnowledgeRow | null> {
  const updated = await markKnowledgeUnitReviewed({ db: getDb() }, id, updatedBy);
  return updated ? toRow(updated) : null;
}
