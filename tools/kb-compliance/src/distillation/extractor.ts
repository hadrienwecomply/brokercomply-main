import { LANGUAGES, TOPICS, type LLMClient } from '@brokercomply/shared';
import { z } from 'zod';
import type { QaPair } from './types.js';

const QaPairSchema = z.object({
  question: z.string().min(1),
  answer: z.string().min(1),
  topic: z.enum(TOPICS).catch('other'),
  regulatoryRefs: z.array(z.string()).default([]),
  language: z.enum(LANGUAGES).nullable().catch(null),
  confidence: z.number().min(0).max(1).catch(0.5),
  author: z.string().nullable().default(null),
});

const QaArraySchema = z.array(QaPairSchema);

export const EXTRACTION_SYSTEM_PROMPT = `You extract canonical question/answer pairs from email threads between Belgian insurance-broker compliance officers (FSMA-regulated) and their clients.

Rules:
- Extract EVERY distinct Q/A pair actually answered in the thread. A thread may yield zero, one, or several pairs.
- Only extract pairs where a compliance officer gave an answer. Ignore pure logistics (scheduling, file-share notices, greetings).
- Write a clean canonical "question" even if the original was messy. Keep the "answer" in its ORIGINAL language.
- NEVER merge diverging answers. If two officers answered differently, emit one pair per officer.
- "author" is the officer who ANSWERED (from their email address), never the person who asked. Use null if unknown.
- "topic" must be one of: ${TOPICS.join(', ')}.
- "regulatoryRefs" is an array of regulatory references cited (circulars, laws, articles); [] if none.
- "language" is one of: ${LANGUAGES.join(', ')}, or null.
- "confidence" is your 0–1 confidence that this is a correct, self-contained compliance Q/A.

Return ONLY a JSON array (no prose, no code fences). Return [] if there is no answered compliance question.`;

const FEW_SHOT = `Example input:
---
[2025-09-10 | inbound | from client@x.be] Quelles exigences fit & proper pour un nouvel administrateur ? Faut-il notifier la FSMA ?
[2025-09-10 | outbound | from sdv@we-comply.be] Tout administrateur doit satisfaire aux exigences d'honorabilité et d'expertise (Loi 04/04/2014 art. 40). Notifiez la nomination à la FSMA avant l'entrée en fonction.
---
Example output:
[{"question":"Quelles sont les exigences fit & proper pour nommer un nouvel administrateur et faut-il notifier la FSMA ?","answer":"Tout administrateur doit satisfaire aux exigences d'honorabilité professionnelle et d'expertise (Loi 04/04/2014 art. 40). La nomination doit être notifiée à la FSMA avant l'entrée en fonction.","topic":"fit_and_proper","regulatoryRefs":["Loi 04/04/2014 art. 40"],"language":"fr","confidence":0.9,"author":"sdv@we-comply.be"}]`;

/** Strip code fences and isolate the outermost JSON array. */
function extractJsonArray(text: string): string {
  const cleaned = text.replace(/```(?:json)?/gi, '').trim();
  const start = cleaned.indexOf('[');
  const end = cleaned.lastIndexOf(']');
  if (start === -1 || end === -1 || end < start) throw new Error('No JSON array found in LLM output');
  return cleaned.slice(start, end + 1);
}

function parseQaResponse(text: string): QaPair[] {
  const json: unknown = JSON.parse(extractJsonArray(text));
  return QaArraySchema.parse(json);
}

/**
 * Ask the LLM to extract Q/A pairs from a formatted thread context. Retries up
 * to `maxRetries` times when the output is not valid JSON / fails validation.
 */
export async function extractQaPairs(
  llm: LLMClient,
  threadContext: string,
  maxRetries = 2,
): Promise<QaPair[]> {
  const userPrompt = `${FEW_SHOT}\n\nNow extract from this thread:\n---\n${threadContext}\n---`;
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    const reminder =
      attempt === 0 ? '' : '\n\nYour previous reply was not valid JSON. Reply with ONLY a JSON array.';
    const raw = await llm.chat([{ role: 'user', content: userPrompt + reminder }], {
      system: EXTRACTION_SYSTEM_PROMPT,
      maxTokens: 4096,
      temperature: 0,
    });
    try {
      return parseQaResponse(raw);
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(
    `Q/A extraction failed after ${maxRetries + 1} attempts: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`,
  );
}
