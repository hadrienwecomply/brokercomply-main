import type { LLMClient } from '@brokercomply/shared';

/**
 * Embed the canonical question of each Q/A pair. Batching (up to 100 texts per
 * request) is handled inside the LLM client's `embed`. Returns vectors aligned
 * with the input order; empty input yields an empty array.
 */
export async function embedQuestions(llm: LLMClient, questions: string[]): Promise<number[][]> {
  if (questions.length === 0) return [];
  return llm.embed(questions);
}
