"use server";

import { revalidatePath } from "next/cache";
import type { KnowledgeUpdate } from "@brokercomply/shared";
import {
  getUnitDetail,
  markReviewed,
  semanticSearch,
  updateUnit,
} from "./knowledge.server";
import { currentOfficer } from "./officer.server";

/** Fetch the full unit + its source emails for the detail drawer. */
export async function fetchUnitDetail(id: string) {
  return getUnitDetail(id);
}

/** Run the same hybrid (semantic + lexical) search the RAG agent uses. */
export async function runSemanticSearch(query: string) {
  const q = query.trim();
  if (!q) return [];
  return semanticSearch(q);
}

/** Apply an officer edit (re-embeds the question only if it changed). */
export async function saveUnit(id: string, patch: KnowledgeUpdate) {
  const officer = await currentOfficer();
  const row = await updateUnit(id, patch, officer);
  revalidatePath("/faq");
  return row;
}

/** Approve a unit without changing its content. */
export async function reviewUnit(id: string) {
  const officer = await currentOfficer();
  const row = await markReviewed(id, officer);
  revalidatePath("/faq");
  return row;
}
