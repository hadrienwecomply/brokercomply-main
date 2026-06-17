import type { KnowledgeListParams } from "@brokercomply/shared";
import { facets, listUnits } from "@/lib/knowledge.server";
import { KnowledgeTable } from "@/components/knowledge-table";

export const metadata = {
  title: "Base de connaissances — BrokerComply",
};

// Always read the live knowledge base (no static caching).
export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

function one(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export default async function FaqPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const publishedRaw = one(sp.published);

  const params: KnowledgeListParams = {
    query: one(sp.query),
    topic: one(sp.topic),
    author: one(sp.author),
    language: one(sp.language),
    freshness: one(sp.freshness) === "fresh" || one(sp.freshness) === "stale"
      ? (one(sp.freshness) as "fresh" | "stale")
      : undefined,
    reviewStatus: one(sp.status),
    isPublished: publishedRaw === undefined ? undefined : publishedRaw === "1",
    sort:
      one(sp.sort) === "confidence" || one(sp.sort) === "updated_at"
        ? (one(sp.sort) as "confidence" | "updated_at")
        : "source_date",
    order: one(sp.order) === "asc" ? "asc" : "desc",
    page: Math.max(1, Number(one(sp.page) ?? "1") || 1),
    pageSize: 25,
  };

  const [data, f] = await Promise.all([listUnits(params), facets()]);

  return (
    <div className="space-y-7">
      <header className="space-y-2">
        <span className="inline-flex items-center rounded-full bg-brand-50 px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-brand-700 ring-1 ring-inset ring-brand-200">
          Base de connaissances
        </span>
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900">FAQ conformité</h1>
        <p className="max-w-2xl text-[15px] leading-relaxed text-slate-500">
          Les fiches Q/R capitalisées depuis les échanges des compliance officers. Filtrez,
          recherchez (texte ou sémantique), et consultez la provenance. C&apos;est la même base que
          l&apos;agent conversationnel interroge.
        </p>
      </header>

      <KnowledgeTable
        rows={data.rows}
        total={data.total}
        page={data.page}
        pageSize={data.pageSize}
        facets={f}
        current={{
          query: params.query ?? "",
          topic: params.topic ?? "",
          author: params.author ?? "",
          language: params.language ?? "",
          freshness: (params.freshness as string) ?? "",
          status: params.reviewStatus ?? "",
          published: publishedRaw ?? "",
          sort: params.sort ?? "source_date",
          order: params.order ?? "desc",
        }}
      />
    </div>
  );
}
