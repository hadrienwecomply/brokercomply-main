import { knowledgeUnits, sourceDocuments, type Db, type LLMClient, type SourceDocument } from '@brokercomply/shared';
import { and, eq, inArray, isNull, sql, type SQL } from 'drizzle-orm';
import { embedQuestions } from './embedder.js';
import { extractQaPairs } from './extractor.js';

export interface DistillOptions {
  /** Max number of conversations to process. */
  limit?: number;
  /** Only distil this conversation_id. */
  conversationId?: string;
  /** Re-distil already-distilled conversations (deletes their prior units). */
  force?: boolean;
}

export interface DistillDeps {
  db: Db;
  llm: LLMClient;
  log?: (message: string) => void;
}

export interface DistillStats {
  conversationsProcessed: number;
  conversationsEmpty: number;
  /** Conversations skipped after an unrecoverable error (e.g. LLM API failure). */
  conversationsFailed: number;
  qaPairsExtracted: number;
  knowledgeUnitsStored: number;
}

/** Group source documents into conversations (fallback key for null conv id). */
function groupByConversation(docs: SourceDocument[]): Map<string, SourceDocument[]> {
  const groups = new Map<string, SourceDocument[]>();
  for (const doc of docs) {
    const key = doc.conversationId ?? `doc:${doc.id}`;
    const bucket = groups.get(key);
    if (bucket) bucket.push(doc);
    else groups.set(key, [doc]);
  }
  return groups;
}

/** Render a conversation as the text context fed to the extractor. */
function formatConversation(docs: SourceDocument[]): string {
  return docs
    .map((d) => {
      const date = d.receivedAt ? new Date(d.receivedAt).toISOString().slice(0, 10) : '????-??-??';
      const header = `[${date} | ${d.direction ?? 'unknown'} | from ${d.sender ?? 'unknown'}] ${d.subject ?? ''}`;
      const body = d.bodyClean ?? '';
      const attachment = d.attachmentText ? `\n[attachment]\n${d.attachmentText}` : '';
      return `${header}\n${body}${attachment}`;
    })
    .join('\n\n');
}

/** Date of the officer's answer (latest outbound), else latest message date. */
function answerDate(docs: SourceDocument[]): string | null {
  const candidates = docs.filter((d) => d.direction === 'outbound');
  const pool = candidates.length ? candidates : docs;
  const latest = pool
    .map((d) => d.receivedAt)
    .filter((d): d is Date => d != null)
    .sort((a, b) => b.getTime() - a.getTime())[0];
  return latest ? new Date(latest).toISOString().slice(0, 10) : null;
}

/**
 * Distillation pipeline: group undistilled source documents by conversation,
 * extract Q/A pairs (whole thread → LLM), embed each question, and insert
 * knowledge_units linked back to their source documents. Idempotent via
 * `source_documents.distilled_at`.
 */
export async function runDistill(deps: DistillDeps, options: DistillOptions = {}): Promise<DistillStats> {
  const { db, llm } = deps;
  const log = deps.log ?? (() => {});

  const filters: SQL[] = [];
  if (!options.force) filters.push(isNull(sourceDocuments.distilledAt));
  if (options.conversationId) filters.push(eq(sourceDocuments.conversationId, options.conversationId));
  const where = filters.length ? and(...filters) : undefined;

  const docs = await db.select().from(sourceDocuments).where(where);
  const conversations = [...groupByConversation(docs).values()];
  const selected = options.limit ? conversations.slice(0, options.limit) : conversations;
  log(`Distilling ${selected.length} conversation(s) from ${docs.length} document(s)…`);

  const stats: DistillStats = {
    conversationsProcessed: 0,
    conversationsEmpty: 0,
    conversationsFailed: 0,
    qaPairsExtracted: 0,
    knowledgeUnitsStored: 0,
  };

  for (const convDocs of selected) {
    const ordered = [...convDocs].sort(
      (a, b) => (a.receivedAt?.getTime() ?? 0) - (b.receivedAt?.getTime() ?? 0),
    );
    const docIds = ordered.map((d) => d.id);

    try {
      const pairs = await extractQaPairs(llm, formatConversation(ordered));
      stats.qaPairsExtracted += pairs.length;

      if (options.force) {
        // Drop prior units for these sources so a re-distil doesn't duplicate —
        // but NEVER clobber officer-curated rows (manual or reviewed/edited).
        await db
          .delete(knowledgeUnits)
          .where(
            and(
              sql`${knowledgeUnits.sourceIds} && ${sql.raw(`ARRAY['${docIds.join("','")}']::uuid[]`)}`,
              eq(knowledgeUnits.origin, 'distilled'),
              eq(knowledgeUnits.reviewStatus, 'unreviewed'),
            ),
          );
      }

      if (pairs.length === 0) {
        stats.conversationsEmpty += 1;
      } else {
        const embeddings = await embedQuestions(llm, pairs.map((p) => p.question));
        const srcDate = answerDate(ordered);
        await db.insert(knowledgeUnits).values(
          pairs.map((p, i) => ({
            question: p.question,
            answer: p.answer,
            topic: p.topic,
            regulatoryRefs: p.regulatoryRefs,
            language: p.language,
            sourceIds: docIds,
            sourceDate: srcDate,
            author: p.author,
            confidence: p.confidence,
            embedding: embeddings[i]!,
          })),
        );
        stats.knowledgeUnitsStored += pairs.length;
      }

      await db
        .update(sourceDocuments)
        .set({ distilledAt: new Date() })
        .where(inArray(sourceDocuments.id, docIds));
      stats.conversationsProcessed += 1;
    } catch (error) {
      // One conversation's failure (e.g. a transient LLM API error) must not
      // abort the whole backfill. Leave distilled_at unset so it can be retried.
      stats.conversationsFailed += 1;
      log(`  ! conversation failed (${docIds.length} doc(s)): ${error instanceof Error ? error.message : error}`);
    }
  }

  log(
    `Distilled ${stats.conversationsProcessed} conversation(s): ${stats.knowledgeUnitsStored} knowledge unit(s), ${stats.conversationsEmpty} with no Q/A, ${stats.conversationsFailed} failed.`,
  );
  return stats;
}
