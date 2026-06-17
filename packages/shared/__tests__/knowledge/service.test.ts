import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq, sql } from "drizzle-orm";
import { createDb, knowledgeUnits, sourceDocuments, type Db } from "../../src/db/index.js";
import type { LLMClient } from "../../src/llm/index.js";
import {
  getKnowledgeFacets,
  getKnowledgeUnit,
  listKnowledgeUnits,
  markKnowledgeUnitReviewed,
  searchSemantic,
  updateKnowledgeUnit,
} from "../../src/knowledge/index.js";

const DIM = 1536;
function oneHot(i: number): number[] {
  const v = Array.from({ length: DIM }, () => 0);
  v[i] = 1;
  return v;
}

function mockLLM(): LLMClient {
  return {
    chat: vi.fn(async () => ""),
    embed: vi.fn(async (texts: string[]) => texts.map(() => oneHot(0))),
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

describe.skipIf(!dbAvailable)("knowledge service (integration)", () => {
  let db: Db;
  let close: () => Promise<void>;
  let sourceId: string;

  beforeAll(async () => {
    const conn = createDb();
    db = conn.db;
    close = () => conn.client.end();
    await db.delete(knowledgeUnits);
    await db.delete(sourceDocuments);

    const [src] = await db
      .insert(sourceDocuments)
      .values({
        messageId: "<svc-test-1@x>",
        conversationId: "svc-conv",
        subject: "Question EGR du courtier",
        bodyClean: "corps",
        sender: "courtier@example.be",
        recipients: ["sdv@we-comply.be"],
        mailbox: "sdv@we-comply.be",
        language: "fr",
        direction: "inbound",
        receivedAt: new Date("2026-01-10T00:00:00Z"),
        rawMetadata: {},
      })
      .returning({ id: sourceDocuments.id });
    sourceId = src!.id;

    await db.insert(knowledgeUnits).values([
      {
        question: "Quelles obligations EGR ?",
        answer: "Inscription annuelle au registre EGR.",
        topic: "EGR",
        regulatoryRefs: ["Loi EGR art. 1"],
        language: "fr",
        sourceIds: [sourceId],
        sourceDate: "2026-01-10",
        author: "sdv@we-comply.be",
        confidence: 0.9,
        embedding: oneHot(0),
      },
      {
        question: "Comment évaluer le fit and proper ?",
        answer: "Honorabilité des dirigeants.",
        topic: "fit_and_proper",
        language: "fr",
        sourceDate: "2024-01-01", // > 12 months → stale
        author: "mvl@we-comply.be",
        confidence: 0.8,
        embedding: oneHot(1),
      },
      {
        question: "Brouillon non publié",
        answer: "Ne doit pas apparaître pour l'agent.",
        topic: "IDD",
        language: "fr",
        sourceDate: "2026-02-01",
        author: "sdv@we-comply.be",
        confidence: 0.5,
        isPublished: false,
        embedding: oneHot(2),
      },
    ]);
  });

  afterAll(async () => {
    await db.delete(knowledgeUnits);
    await db.delete(sourceDocuments);
    await close();
  });

  it("lists all units by default (including unpublished)", async () => {
    const res = await listKnowledgeUnits({ db });
    expect(res.total).toBe(3);
    expect(res.rows).toHaveLength(3);
  });

  it("filters by topic", async () => {
    const res = await listKnowledgeUnits({ db }, { topic: "EGR" });
    expect(res.total).toBe(1);
    expect(res.rows[0]!.topic).toBe("EGR");
  });

  it("filters by published flag", async () => {
    const published = await listKnowledgeUnits({ db }, { isPublished: true });
    expect(published.total).toBe(2);
    const drafts = await listKnowledgeUnits({ db }, { isPublished: false });
    expect(drafts.total).toBe(1);
    expect(drafts.rows[0]!.question).toContain("Brouillon");
  });

  it("filters by freshness (stale = older than threshold)", async () => {
    const stale = await listKnowledgeUnits({ db }, { freshness: "stale" });
    expect(stale.rows.every((r) => r.topic === "fit_and_proper")).toBe(true);
    expect(stale.total).toBe(1);
  });

  it("filters by free-text query over question/answer", async () => {
    const res = await listKnowledgeUnits({ db }, { query: "honorabilité" });
    expect(res.total).toBe(1);
    expect(res.rows[0]!.topic).toBe("fit_and_proper");
  });

  it("paginates", async () => {
    const p1 = await listKnowledgeUnits({ db }, { pageSize: 2, page: 1 });
    expect(p1.rows).toHaveLength(2);
    expect(p1.total).toBe(3);
    const p2 = await listKnowledgeUnits({ db }, { pageSize: 2, page: 2 });
    expect(p2.rows).toHaveLength(1);
  });

  it("returns a unit with its source emails", async () => {
    const list = await listKnowledgeUnits({ db }, { topic: "EGR" });
    const detail = await getKnowledgeUnit({ db }, list.rows[0]!.id);
    expect(detail).not.toBeNull();
    expect(detail!.sources).toHaveLength(1);
    expect(detail!.sources[0]!.subject).toContain("EGR");
  });

  it("exposes distinct facets", async () => {
    const f = await getKnowledgeFacets({ db });
    expect(f.topics).toContain("EGR");
    expect(f.authors).toContain("sdv@we-comply.be");
    expect(f.languages).toContain("fr");
  });

  it("semantic search includes unpublished by default", async () => {
    const results = await searchSemantic({ db, llm: mockLLM() }, "obligations EGR");
    expect(results.length).toBeGreaterThan(0);
  });

  it("semantic search can restrict to published (agent-faithful)", async () => {
    const results = await searchSemantic({ db, llm: mockLLM() }, "brouillon", {
      onlyPublished: true,
    });
    expect(results.every((r) => r.unit.isPublished)).toBe(true);
  });

  describe("mutations (officer edits)", () => {
    async function unitByTopic(topic: string) {
      const [u] = await db.select().from(knowledgeUnits).where(eq(knowledgeUnits.topic, topic));
      return u!;
    }

    it("edits the answer WITHOUT re-embedding (question unchanged) → edited", async () => {
      const llm = mockLLM();
      const egr = await unitByTopic("EGR");
      const updated = await updateKnowledgeUnit(
        { db, llm },
        egr.id,
        { answer: "Réponse EGR mise à jour." },
        { updatedBy: "gr@we-comply.be" },
      );
      expect(updated?.answer).toBe("Réponse EGR mise à jour.");
      expect(updated?.reviewStatus).toBe("edited");
      expect(updated?.updatedBy).toBe("gr@we-comply.be");
      expect(llm.embed).not.toHaveBeenCalled();
    });

    it("re-embeds when the question changes", async () => {
      const llm = mockLLM();
      const egr = await unitByTopic("EGR");
      await updateKnowledgeUnit(
        { db, llm },
        egr.id,
        { question: "Nouvelle formulation de la question EGR ?" },
        { updatedBy: "sdv@we-comply.be" },
      );
      expect(llm.embed).toHaveBeenCalledTimes(1);
    });

    it("a publish-only toggle marks reviewed (not edited)", async () => {
      const idd = await unitByTopic("IDD");
      const updated = await updateKnowledgeUnit(
        { db },
        idd.id,
        { isPublished: true },
        { updatedBy: "sdv@we-comply.be" },
      );
      expect(updated?.reviewStatus).toBe("reviewed");
      expect(updated?.isPublished).toBe(true);
    });

    it("markKnowledgeUnitReviewed sets reviewed + updated_by without content change", async () => {
      const fp = await unitByTopic("fit_and_proper");
      const updated = await markKnowledgeUnitReviewed({ db }, fp.id, "gr@we-comply.be");
      expect(updated?.reviewStatus).toBe("reviewed");
      expect(updated?.updatedBy).toBe("gr@we-comply.be");
      expect(updated?.answer).toBe(fp.answer);
    });

    it("rejects an invalid topic (controlled vocabulary)", async () => {
      const egr = await unitByTopic("EGR");
      await expect(
        updateKnowledgeUnit(
          { db },
          egr.id,
          { topic: "not_a_topic" as never },
          { updatedBy: "x@we-comply.be" },
        ),
      ).rejects.toThrow();
    });

    it("returns null for an unknown id", async () => {
      const res = await updateKnowledgeUnit(
        { db },
        "00000000-0000-0000-0000-000000000000",
        { answer: "x" },
        { updatedBy: "x@we-comply.be" },
      );
      expect(res).toBeNull();
    });
  });
});
