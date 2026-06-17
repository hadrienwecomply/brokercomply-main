import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createDb, knowledgeUnits, type Db } from '../../src/db/index.js';
import type { LLMClient } from '../../src/llm/index.js';
import { hybridSearch } from '../../src/retrieval/hybrid-search.js';

const DIM = 1536;

/** A 1536-d one-hot vector: orthogonal directions give clean cosine ordering. */
function oneHot(index: number): number[] {
  const v = Array.from({ length: DIM }, () => 0);
  v[index] = 1;
  return v;
}

const EGR = oneHot(0);
const FITPROPER = oneHot(1);
const IDD = oneHot(2);

/**
 * Mock LLM: maps a query to one of the seeded directions so the semantic leg is
 * deterministic. `chat` is unused by retrieval.
 */
function mockLLM(): LLMClient {
  return {
    chat: vi.fn(async () => ''),
    embed: vi.fn(async (texts: string[]) =>
      texts.map((t) => {
        if (/egr|registre/i.test(t)) return EGR;
        if (/fit|proper|honorab/i.test(t)) return FITPROPER;
        return IDD;
      }),
    ),
  };
}

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

describe.skipIf(!dbAvailable)('hybridSearch (integration)', () => {
  let db: Db;
  let close: () => Promise<void>;
  const llm = mockLLM();

  beforeAll(async () => {
    const conn = createDb();
    db = conn.db;
    close = () => conn.client.end();
    await db.delete(knowledgeUnits);
    await db.insert(knowledgeUnits).values([
      {
        question: 'Quelles sont les obligations EGR pour un courtier ?',
        answer: "L'inscription au registre EGR impose une mise a jour annuelle.",
        topic: 'EGR',
        regulatoryRefs: [],
        language: 'fr',
        sourceDate: '2025-01-15',
        author: 'mvl@we-comply.be',
        confidence: 0.9,
        embedding: EGR,
      },
      {
        question: 'Comment evaluer le fit and proper des dirigeants ?',
        answer: "L'honorabilite professionnelle suit la Circulaire FSMA 2023_12.",
        topic: 'fit_and_proper',
        regulatoryRefs: ['Circ. FSMA 2023_12'],
        language: 'fr',
        sourceDate: '2023-02-01',
        author: 'sdv@we-comply.be',
        confidence: 0.85,
        embedding: FITPROPER,
      },
      {
        question: 'Welke IDD-opleiding is vereist?',
        answer: 'Jaarlijks twintig uur permanente vorming onder IDD.',
        topic: 'IDD',
        regulatoryRefs: [],
        language: 'nl',
        sourceDate: '2024-06-01',
        author: 'sdv@we-comply.be',
        confidence: 0.8,
        embedding: IDD,
      },
    ]);
  });

  afterAll(async () => {
    await db.delete(knowledgeUnits);
    await close();
  });

  it('finds an exact regulatory reference via the lexical leg', async () => {
    const results = await hybridSearch({ db, llm }, 'circulaire FSMA');
    const top = results[0];
    expect(top?.unit.topic).toBe('fit_and_proper');
    expect(top?.lexical).toBeDefined();
  });

  it('finds a semantic match even without shared keywords', async () => {
    const results = await hybridSearch({ db, llm }, 'obligations registre courtier');
    const egr = results.find((r) => r.unit.topic === 'EGR');
    expect(egr).toBeDefined();
    expect(egr?.semantic).toBeDefined();
  });

  it('ranks a unit hit by BOTH legs at the top', async () => {
    // "fit proper" hits FITPROPER semantically; "FSMA circulaire" hits it lexically.
    const results = await hybridSearch({ db, llm }, 'fit proper FSMA circulaire');
    expect(results[0]?.unit.topic).toBe('fit_and_proper');
    expect(results[0]?.semantic).toBeDefined();
    expect(results[0]?.lexical).toBeDefined();
  });

  it('applies the topic filter to both legs', async () => {
    const results = await hybridSearch({ db, llm }, 'fit proper FSMA circulaire', {
      topic: 'EGR',
    });
    expect(results.every((r) => r.unit.topic === 'EGR')).toBe(true);
    expect(results.some((r) => r.unit.topic === 'fit_and_proper')).toBe(false);
  });

  it('applies the language filter to both legs', async () => {
    const results = await hybridSearch({ db, llm }, 'IDD opleiding vorming', {
      language: 'nl',
    });
    expect(results.every((r) => r.unit.language === 'nl')).toBe(true);
  });

  it('applies the source_date range filter', async () => {
    const results = await hybridSearch({ db, llm }, 'fit proper FSMA circulaire', {
      sourceDateFrom: '2024-01-01',
    });
    // The fit_and_proper unit is dated 2023 → excluded by the lower bound.
    expect(results.some((r) => r.unit.topic === 'fit_and_proper')).toBe(false);
  });

  it('respects the limit', async () => {
    const results = await hybridSearch({ db, llm }, 'fit proper FSMA circulaire', { limit: 1 });
    expect(results.length).toBeLessThanOrEqual(1);
  });

  it('returns an empty array for a blank query', async () => {
    expect(await hybridSearch({ db, llm }, '   ')).toEqual([]);
  });
});
