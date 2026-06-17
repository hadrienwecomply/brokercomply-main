import { sql } from 'drizzle-orm';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  amlExclusionLog,
  createDb,
  knowledgeUnits,
  sourceDocuments,
  type Db,
  type LLMClient,
} from '@brokercomply/shared';
import { FixtureEmailSource } from '../../src/ingestion/fixture-source.js';
import { runIngest } from '../../src/ingestion/ingest.js';
import { runDistill } from '../../src/distillation/distill.js';

/**
 * Mock LLM: derives the answering officer from the conversation context (the
 * 'outbound | from X' line) and returns one Q/A pair. Embeddings are constant
 * 1536-dim vectors so they fit the vector(1536) column.
 */
function mockLLM(): LLMClient {
  return {
    chat: vi.fn(async (messages) => {
      const full = messages[messages.length - 1]?.content ?? '';
      // Ignore the few-shot example; only look at the actual thread to extract.
      const ctx = full.split('Now extract from this thread:').pop() ?? '';
      const outbound = /outbound \| from ([^\s\]]+)/.exec(ctx);
      const author = outbound?.[1] ?? null;
      // Only emit a pair if an officer actually answered (outbound present).
      if (!author) return '[]';
      return JSON.stringify([
        {
          question: 'Question canonique du fil',
          answer: `Réponse de ${author}`,
          topic: 'general_compliance',
          regulatoryRefs: [],
          language: 'fr',
          confidence: 0.8,
          author,
        },
      ]);
    }),
    embed: vi.fn(async (texts: string[]) => texts.map(() => Array.from({ length: 1536 }, () => 0.01))),
  };
}

/** Probe DB connectivity so the suite skips cleanly when Docker isn't up. */
async function canConnect(): Promise<boolean> {
  const { db, client } = createDb();
  try {
    await db.execute(sql`select 1`);
    return true;
  } catch {
    return false;
  } finally {
    await client.end();
  }
}

const dbAvailable = await canConnect();

describe.skipIf(!dbAvailable)('ingestion pipeline (integration)', () => {
  let db: Db;
  let close: () => Promise<void>;

  beforeAll(async () => {
    const conn = createDb();
    db = conn.db;
    close = () => conn.client.end();
    await db.delete(knowledgeUnits);
    await db.delete(sourceDocuments);
    await db.delete(amlExclusionLog);
  });

  afterAll(async () => {
    await close();
  });

  it('runs the full fixture pipeline with AML exclusion and attachment parsing', async () => {
    const stats = await runIngest({ source: new FixtureEmailSource(), db }, { mailbox: 'fixtures' });

    expect(stats.threads).toBe(9);
    expect(stats.threadsExcluded).toBe(1); // the CTIF thread
    expect(stats.messagesExcluded).toBe(2);
    expect(stats.documentsStored).toBe(16);
    expect(stats.attachmentsParsed).toBe(2); // one PDF + one DOCX
  });

  it('records the excluded CTIF thread in the ledger without any content', async () => {
    const excluded = await db.select().from(amlExclusionLog);
    const ids = excluded.map((e) => e.messageId);
    expect(ids).toContain('<ctif-1@we-comply.be>');
    expect(ids).toContain('<ctif-2@we-comply.be>');
    for (const entry of excluded) {
      expect(entry.reason).toMatch(/ctif|suspicion_report/);
      // ledger stores categories only — never the email body text
      expect(entry.reason).not.toMatch(/operation suspecte|client/i);
    }
  });

  it('never stores the CTIF thread in source_documents', async () => {
    const ctif = await db
      .select()
      .from(sourceDocuments)
      .where(eq(sourceDocuments.messageId, '<ctif-1@we-comply.be>'));
    expect(ctif).toHaveLength(0);
  });

  it('extracts and stores attachment text (PDF and DOCX)', async () => {
    const pdfDoc = await db
      .select()
      .from(sourceDocuments)
      .where(eq(sourceDocuments.messageId, '<fitproper-2@we-comply.be>'));
    expect(pdfDoc[0]?.attachmentText).toContain('Circulaire FSMA 2023_12');

    const docxDoc = await db
      .select()
      .from(sourceDocuments)
      .where(eq(sourceDocuments.messageId, '<egr-1@we-comply.be>'));
    expect(docxDoc[0]?.attachmentText).toContain('Circulaire FSMA 2023_12');
  });

  it('cleans bodies (HTML→text, signatures and quotes removed)', async () => {
    const doc = await db
      .select()
      .from(sourceDocuments)
      .where(eq(sourceDocuments.messageId, '<fitproper-2@we-comply.be>'));
    const body = doc[0]?.bodyClean ?? '';
    expect(body).toContain('honorabilite professionnelle');
    expect(body).not.toMatch(/Cordialement/i);
    expect(body).not.toMatch(/a ecrit/i);
  });

  it('detects language including a Dutch message in the multilingual thread', async () => {
    const nl = await db
      .select()
      .from(sourceDocuments)
      .where(eq(sourceDocuments.messageId, '<multi-2@we-comply.be>'));
    expect(nl[0]?.language).toBe('nl');
  });

  it('classifies and stores message direction', async () => {
    const answer = await db
      .select()
      .from(sourceDocuments)
      .where(eq(sourceDocuments.messageId, '<idd-2@we-comply.be>'));
    const question = await db
      .select()
      .from(sourceDocuments)
      .where(eq(sourceDocuments.messageId, '<idd-1@we-comply.be>'));
    expect(answer[0]?.direction).toBe('outbound'); // officer → client
    expect(question[0]?.direction).toBe('inbound'); // client → officer
  });

  it('keeps both divergent answers (no deduplication)', async () => {
    const a = await db
      .select()
      .from(sourceDocuments)
      .where(eq(sourceDocuments.messageId, '<div-a-2@we-comply.be>'));
    const b = await db
      .select()
      .from(sourceDocuments)
      .where(eq(sourceDocuments.messageId, '<div-b-2@we-comply.be>'));
    expect(a[0]?.sender).toBe('sdv@we-comply.be');
    expect(b[0]?.sender).toBe('mvl@we-comply.be');
  });

  it('is idempotent — re-running does not duplicate documents', async () => {
    await runIngest({ source: new FixtureEmailSource(), db }, { mailbox: 'fixtures' });
    const all = await db.select().from(sourceDocuments);
    expect(all).toHaveLength(16);
  });

  describe('distillation (0-D) on the ingested fixtures', () => {
    it('distils threads into knowledge_units with 1536-dim embeddings', async () => {
      const stats = await runDistill({ db, llm: mockLLM() });
      // 8 stored conversations (CTIF excluded); each yields one Q/A in the mock.
      expect(stats.conversationsProcessed).toBe(8);
      expect(stats.knowledgeUnitsStored).toBe(8);

      const units = await db.select().from(knowledgeUnits);
      expect(units).toHaveLength(8);
      // embedding round-trips as a 1536-length vector
      const withEmbedding = await db.execute(
        sql`select id from knowledge_units where embedding is not null`,
      );
      expect(withEmbedding.length).toBe(8);
    });

    it('links knowledge_units back to their source documents', async () => {
      const units = await db.select().from(knowledgeUnits);
      for (const u of units) {
        expect(u.sourceIds && u.sourceIds.length).toBeGreaterThan(0);
        expect(u.sourceDate).toBeTruthy();
      }
    });

    it('preserves divergent answers with distinct authors', async () => {
      const units = await db.select().from(knowledgeUnits);
      const authors = new Set(units.map((u) => u.author));
      expect(authors.has('sdv@we-comply.be')).toBe(true);
      expect(authors.has('mvl@we-comply.be')).toBe(true);
    });

    it('is idempotent — re-running distils nothing new', async () => {
      const stats = await runDistill({ db, llm: mockLLM() });
      expect(stats.conversationsProcessed).toBe(0);
      const units = await db.select().from(knowledgeUnits);
      expect(units).toHaveLength(8);
    });

    it('--force re-distils without duplicating units', async () => {
      const stats = await runDistill({ db, llm: mockLLM() }, { force: true });
      expect(stats.conversationsProcessed).toBe(8);
      const units = await db.select().from(knowledgeUnits);
      expect(units).toHaveLength(8);
    });
  });
});
