"use client";

import { useEffect, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  BookOpen,
  Check,
  ExternalLink,
  Filter,
  Loader2,
  Pencil,
  Search,
  Sparkles,
  X,
} from "lucide-react";
import type { KnowledgeUpdate } from "@brokercomply/shared";
import { cn } from "@/lib/cn";
import { freshness } from "@/lib/freshness";
import {
  fetchUnitDetail,
  reviewUnit,
  runSemanticSearch,
  saveUnit,
} from "@/lib/knowledge-actions";
import type { KnowledgeRow, KnowledgeSource } from "@/lib/knowledge-types";
import { DEFAULT_OFFICER, OFFICER_COOKIE, OFFICER_OPTIONS, officerName } from "@/lib/officers";
import { LANGUAGE_OPTIONS, TOPIC_OPTIONS } from "@/lib/vocab";

interface Current {
  query: string;
  topic: string;
  author: string;
  language: string;
  freshness: string;
  status: string;
  published: string;
  sort: string;
  order: string;
}

interface Props {
  rows: KnowledgeRow[];
  total: number;
  page: number;
  pageSize: number;
  facets: { topics: string[]; authors: string[]; languages: string[] };
  current: Current;
}

const TOPIC_STYLE: Record<string, string> = {
  AMLR: "bg-rose-50 text-rose-700 ring-rose-200",
  fit_and_proper: "bg-violet-50 text-violet-700 ring-violet-200",
  IDD: "bg-sky-50 text-sky-700 ring-sky-200",
  EGR: "bg-amber-50 text-amber-700 ring-amber-200",
  mystery_shopping: "bg-teal-50 text-teal-700 ring-teal-200",
  general_compliance: "bg-slate-100 text-slate-700 ring-slate-200",
  other: "bg-slate-100 text-slate-600 ring-slate-200",
};

function Badge({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-pill px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
        className,
      )}
    >
      {children}
    </span>
  );
}

function TopicBadge({ topic }: { topic: string | null }) {
  if (!topic) return <span className="text-slate-300">—</span>;
  return <Badge className={TOPIC_STYLE[topic] ?? TOPIC_STYLE.other}>{topic}</Badge>;
}

function StatusBadge({ row }: { row: KnowledgeRow }) {
  if (!row.isPublished) {
    return <Badge className="bg-slate-100 text-slate-500 ring-slate-200">Masquée</Badge>;
  }
  if (row.reviewStatus === "edited" || row.reviewStatus === "reviewed") {
    return <Badge className="bg-emerald-50 text-emerald-700 ring-emerald-200">Revu</Badge>;
  }
  if (row.origin === "manual") {
    return <Badge className="bg-indigo-50 text-indigo-700 ring-indigo-200">Manuelle</Badge>;
  }
  return <Badge className="bg-slate-50 text-slate-500 ring-slate-200">Auto</Badge>;
}

function FreshnessChip({ sourceDate }: { sourceDate: string | null }) {
  const f = freshness(sourceDate);
  if (f.ageMonths === null) return <span className="text-slate-300">—</span>;
  return (
    <span className="inline-flex items-center gap-2">
      <span className="tabular-nums text-slate-600">{sourceDate}</span>
      {!f.isFresh && (
        <Badge className="bg-amber-50 text-amber-700 ring-amber-200">
          {f.ageMonths} mois
        </Badge>
      )}
    </span>
  );
}

export function KnowledgeTable({ rows, total, page, pageSize, facets, current }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();

  const [text, setText] = useState(current.query);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Semantic search overlay (null = browsing the filtered table).
  const [semantic, setSemantic] = useState<{ row: KnowledgeRow; score: number }[] | null>(null);
  const [semanticPending, startSemantic] = useTransition();

  function pushParams(patch: Record<string, string>) {
    const params = new URLSearchParams();
    const base: Record<string, string> = {
      query: current.query,
      topic: current.topic,
      author: current.author,
      language: current.language,
      freshness: current.freshness,
      status: current.status,
      published: current.published,
      sort: current.sort,
      order: current.order,
    };
    const merged = { ...base, ...patch };
    for (const [k, v] of Object.entries(merged)) if (v) params.set(k, v);
    // any filter change resets to page 1
    startTransition(() => router.push(`${pathname}?${params.toString()}`));
  }

  function applyTextFilter() {
    setSemantic(null);
    pushParams({ query: text });
  }

  function applySemantic() {
    if (!text.trim()) {
      setSemantic(null);
      return;
    }
    startSemantic(async () => {
      setSemantic(await runSemanticSearch(text));
    });
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const displayRows = semantic ? semantic.map((s) => s.row) : rows;
  const scoreById = semantic
    ? new Map(semantic.map((s) => [s.row.id, s.score]))
    : null;

  return (
    <div className="space-y-4">
      {/* Search + filter bar */}
      <div className="rounded-lg border border-line bg-white p-3 shadow-sm shadow-black/[0.02]">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex min-w-[260px] flex-1 items-center gap-2 rounded-md border border-line px-3 py-2">
            <Search className="size-4 text-slate-400" />
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && applyTextFilter()}
              placeholder="Rechercher dans les questions et réponses…"
              className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-slate-400"
            />
            {(text || semantic) && (
              <button
                onClick={() => {
                  setText("");
                  setSemantic(null);
                  pushParams({ query: "" });
                }}
                className="text-slate-400 hover:text-slate-600"
                aria-label="Effacer"
              >
                <X className="size-4" />
              </button>
            )}
          </div>
          <button
            onClick={applyTextFilter}
            className="inline-flex items-center gap-1.5 rounded-md border border-line px-3 py-2 text-sm font-medium text-ink-soft hover:bg-line/50"
          >
            <Filter className="size-4" /> Filtrer
          </button>
          <button
            onClick={applySemantic}
            disabled={semanticPending}
            className="inline-flex items-center gap-1.5 rounded-md bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
          >
            <Sparkles className="size-4" />
            {semanticPending ? "Recherche…" : "Sémantique"}
          </button>
          <OfficerPicker />
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Select
            label="Topic"
            value={current.topic}
            options={facets.topics}
            onChange={(v) => pushParams({ topic: v })}
          />
          <Select
            label="Auteur"
            value={current.author}
            options={facets.authors}
            onChange={(v) => pushParams({ author: v })}
          />
          <Select
            label="Langue"
            value={current.language}
            options={facets.languages}
            onChange={(v) => pushParams({ language: v })}
          />
          <Select
            label="Fraîcheur"
            value={current.freshness}
            options={["fresh", "stale"]}
            labels={{ fresh: "À jour", stale: "Périmée" }}
            onChange={(v) => pushParams({ freshness: v })}
          />
          <Select
            label="Statut"
            value={current.published}
            options={["1", "0"]}
            labels={{ "1": "Publiée", "0": "Masquée" }}
            onChange={(v) => pushParams({ published: v })}
          />
          <Select
            label="Tri"
            value={current.sort}
            options={["source_date", "confidence", "updated_at"]}
            labels={{ source_date: "Date source", confidence: "Confiance", updated_at: "Modifiée" }}
            onChange={(v) => pushParams({ sort: v })}
            allowEmpty={false}
          />
        </div>
      </div>

      {/* Result summary */}
      <div className="flex items-center justify-between px-1 text-sm text-slate-500">
        <span>
          {semantic
            ? `${semantic.length} résultat(s) sémantique(s)`
            : `${total} fiche(s)`}
          {isPending && " · …"}
        </span>
        {!semantic && (
          <span className="tabular-nums">
            Page {page} / {totalPages}
          </span>
        )}
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-lg border border-line bg-white shadow-sm shadow-black/[0.02]">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-line bg-slate-50/60 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">Question</th>
              <th className="px-3 py-3 font-medium">Topic</th>
              <th className="px-3 py-3 font-medium">Auteur</th>
              <th className="px-3 py-3 font-medium">Date · fraîcheur</th>
              <th className="px-3 py-3 font-medium">Statut</th>
              <th className="px-3 py-3 text-right font-medium">Conf.</th>
              {scoreById && <th className="px-3 py-3 text-right font-medium">Score</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {displayRows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-slate-400">
                  Aucune fiche ne correspond.
                </td>
              </tr>
            )}
            {displayRows.map((row) => (
              <tr
                key={row.id}
                onClick={() => setSelectedId(row.id)}
                className="cursor-pointer transition-colors hover:bg-brand-50/40"
              >
                <td className="max-w-[420px] px-4 py-3">
                  <p className="line-clamp-2 font-medium text-ink">{row.question}</p>
                </td>
                <td className="px-3 py-3">
                  <TopicBadge topic={row.topic} />
                </td>
                <td className="whitespace-nowrap px-3 py-3 text-slate-600">{row.author ?? "—"}</td>
                <td className="whitespace-nowrap px-3 py-3 text-xs">
                  <FreshnessChip sourceDate={row.sourceDate} />
                </td>
                <td className="px-3 py-3">
                  <StatusBadge row={row} />
                </td>
                <td className="px-3 py-3 text-right tabular-nums text-slate-500">
                  {row.confidence != null ? row.confidence.toFixed(2) : "—"}
                </td>
                {scoreById && (
                  <td className="px-3 py-3 text-right tabular-nums text-brand-600">
                    {(scoreById.get(row.id) ?? 0).toFixed(3)}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination (browse mode only) */}
      {!semantic && totalPages > 1 && (
        <div className="flex items-center justify-end gap-2">
          <button
            disabled={page <= 1}
            onClick={() => pushParams({ page: String(page - 1) })}
            className="rounded-md border border-line px-3 py-1.5 text-sm disabled:opacity-40"
          >
            Précédent
          </button>
          <button
            disabled={page >= totalPages}
            onClick={() => pushParams({ page: String(page + 1) })}
            className="rounded-md border border-line px-3 py-1.5 text-sm disabled:opacity-40"
          >
            Suivant
          </button>
        </div>
      )}

      {selectedId && (
        <DetailDrawer
          id={selectedId}
          onClose={() => setSelectedId(null)}
          onSaved={() => router.refresh()}
        />
      )}
    </div>
  );
}

function Select({
  label,
  value,
  options,
  labels,
  onChange,
  allowEmpty = true,
}: {
  label: string;
  value: string;
  options: string[];
  labels?: Record<string, string>;
  onChange: (v: string) => void;
  allowEmpty?: boolean;
}) {
  return (
    <label className="inline-flex items-center gap-1.5 rounded-md border border-line px-2 py-1.5 text-xs text-slate-500">
      <span className="font-medium">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-transparent text-xs font-medium text-ink outline-none"
      >
        {allowEmpty && <option value="">Tous</option>}
        {options.map((o) => (
          <option key={o} value={o}>
            {labels?.[o] ?? o}
          </option>
        ))}
      </select>
    </label>
  );
}

function OfficerPicker() {
  const router = useRouter();
  const [officer, setOfficer] = useState(DEFAULT_OFFICER);

  useEffect(() => {
    const m = document.cookie.match(new RegExp(`(?:^|; )${OFFICER_COOKIE}=([^;]+)`));
    if (m?.[1]) setOfficer(decodeURIComponent(m[1]));
  }, []);

  function change(email: string) {
    setOfficer(email);
    document.cookie = `${OFFICER_COOKIE}=${encodeURIComponent(email)}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
    router.refresh();
  }

  return (
    <label className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-line px-2 py-1.5 text-xs text-slate-500">
      <span className="font-medium">Officer</span>
      <select
        value={officer}
        onChange={(e) => change(e.target.value)}
        title="Identité utilisée pour attribuer vos modifications"
        className="bg-transparent text-xs font-medium text-ink outline-none"
      >
        {OFFICER_OPTIONS.map((o) => (
          <option key={o.email} value={o.email}>
            {o.name}
          </option>
        ))}
      </select>
    </label>
  );
}

interface EditForm {
  question: string;
  answer: string;
  topic: (typeof TOPIC_OPTIONS)[number] | "";
  language: (typeof LANGUAGE_OPTIONS)[number] | "";
  author: string;
  regulatoryRefs: string;
  sourceDate: string;
  isPublished: boolean;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400">
        {label}
      </span>
      {children}
    </label>
  );
}

function DetailDrawer({
  id,
  onClose,
  onSaved,
}: {
  id: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [detail, setDetail] = useState<{ unit: KnowledgeRow; sources: KnowledgeSource[] } | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<EditForm | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetchUnitDetail(id).then((d) => {
      if (alive) {
        setDetail(d);
        setLoading(false);
      }
    });
    return () => {
      alive = false;
    };
  }, [id]);

  function startEdit() {
    if (!detail) return;
    const u = detail.unit;
    setForm({
      question: u.question,
      answer: u.answer,
      topic: (u.topic ?? "") as EditForm["topic"],
      language: (u.language ?? "") as EditForm["language"],
      author: u.author ?? "",
      regulatoryRefs: (u.regulatoryRefs ?? []).join("\n"),
      sourceDate: u.sourceDate ?? "",
      isPublished: u.isPublished,
    });
    setError(null);
    setEditing(true);
  }

  function save() {
    if (!form) return;
    setError(null);
    const patch: KnowledgeUpdate = {
      question: form.question.trim(),
      answer: form.answer.trim(),
      topic: form.topic || null,
      language: form.language || null,
      author: form.author.trim() || null,
      regulatoryRefs: form.regulatoryRefs
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean),
      sourceDate: form.sourceDate || null,
      isPublished: form.isPublished,
    };
    startSaving(async () => {
      try {
        await saveUnit(id, patch);
        setDetail(await fetchUnitDetail(id));
        setEditing(false);
        onSaved();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Échec de l'enregistrement.");
      }
    });
  }

  function approve() {
    setError(null);
    startSaving(async () => {
      try {
        await reviewUnit(id);
        setDetail(await fetchUnitDetail(id));
        onSaved();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Échec.");
      }
    });
  }

  const authorOptions = detail
    ? Array.from(
        new Set(
          [...OFFICER_OPTIONS.map((o) => o.email), detail.unit.author].filter(Boolean) as string[],
        ),
      )
    : [];

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-ink/20" onClick={onClose} />
      <aside className="relative flex h-full w-full max-w-xl flex-col overflow-y-auto border-l border-line bg-white shadow-xl">
        <header className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-line bg-white/95 px-5 py-3 backdrop-blur">
          <span className="inline-flex items-center gap-2 text-sm font-semibold text-ink">
            <BookOpen className="size-4 text-brand-600" /> Fiche de connaissance
          </span>
          <div className="flex items-center gap-1.5">
            {detail && !editing && (
              <>
                <button
                  onClick={approve}
                  disabled={saving}
                  className="inline-flex items-center gap-1 rounded-md border border-line px-2.5 py-1.5 text-xs font-medium text-ink-soft hover:bg-line/50 disabled:opacity-50"
                >
                  <Check className="size-3.5" /> Marquer revu
                </button>
                <button
                  onClick={startEdit}
                  className="inline-flex items-center gap-1 rounded-md bg-brand-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-brand-700"
                >
                  <Pencil className="size-3.5" /> Éditer
                </button>
              </>
            )}
            {editing && (
              <>
                <button
                  onClick={() => setEditing(false)}
                  disabled={saving}
                  className="rounded-md border border-line px-2.5 py-1.5 text-xs font-medium text-ink-soft hover:bg-line/50 disabled:opacity-50"
                >
                  Annuler
                </button>
                <button
                  onClick={save}
                  disabled={saving}
                  className="inline-flex items-center gap-1 rounded-md bg-brand-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-60"
                >
                  {saving ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Check className="size-3.5" />
                  )}
                  Enregistrer
                </button>
              </>
            )}
            <button
              onClick={onClose}
              className="ml-1 text-slate-400 hover:text-slate-700"
              aria-label="Fermer"
            >
              <X className="size-5" />
            </button>
          </div>
        </header>

        {loading && <p className="px-5 py-8 text-sm text-slate-400">Chargement…</p>}
        {!loading && !detail && (
          <p className="px-5 py-8 text-sm text-slate-400">Fiche introuvable.</p>
        )}

        {detail && (
          <div className="space-y-6 px-5 py-5">
            {error && (
              <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700 ring-1 ring-inset ring-rose-200">
                {error}
              </p>
            )}

            {!editing && (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <TopicBadge topic={detail.unit.topic} />
                  <StatusBadge row={detail.unit} />
                  <span className="text-xs text-slate-500">
                    {detail.unit.author ?? "—"} · {detail.unit.sourceDate ?? "—"}
                    {detail.unit.confidence != null &&
                      ` · conf ${detail.unit.confidence.toFixed(2)}`}
                    {detail.unit.updatedBy && ` · modifié par ${officerName(detail.unit.updatedBy)}`}
                  </span>
                </div>

                <section>
                  <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
                    Question
                  </h3>
                  <p className="text-[15px] font-medium text-ink">{detail.unit.question}</p>
                </section>

                <section>
                  <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
                    Réponse
                  </h3>
                  <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-slate-700">
                    {detail.unit.answer}
                  </p>
                </section>

                {detail.unit.regulatoryRefs && detail.unit.regulatoryRefs.length > 0 && (
                  <section>
                    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                      Références réglementaires
                    </h3>
                    <div className="flex flex-wrap gap-1.5">
                      {detail.unit.regulatoryRefs.map((ref) => (
                        <Badge key={ref} className="bg-brand-50 text-brand-700 ring-brand-200">
                          {ref}
                        </Badge>
                      ))}
                    </div>
                  </section>
                )}
              </>
            )}

            {editing && form && (
              <div className="space-y-4">
                <Field label="Question">
                  <textarea
                    value={form.question}
                    onChange={(e) => setForm({ ...form, question: e.target.value })}
                    rows={2}
                    className="w-full rounded-md border border-line px-3 py-2 text-sm text-ink outline-none focus:border-brand-400"
                  />
                  <p className="mt-1 text-xs text-slate-400">
                    Modifier la question recalcule l&apos;embedding sémantique.
                  </p>
                </Field>
                <Field label="Réponse">
                  <textarea
                    value={form.answer}
                    onChange={(e) => setForm({ ...form, answer: e.target.value })}
                    rows={10}
                    className="w-full rounded-md border border-line px-3 py-2 text-sm leading-relaxed text-ink outline-none focus:border-brand-400"
                  />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Topic">
                    <select
                      value={form.topic}
                      onChange={(e) =>
                        setForm({ ...form, topic: e.target.value as EditForm["topic"] })
                      }
                      className="w-full rounded-md border border-line px-2 py-2 text-sm text-ink outline-none"
                    >
                      <option value="">—</option>
                      {TOPIC_OPTIONS.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Langue">
                    <select
                      value={form.language}
                      onChange={(e) =>
                        setForm({ ...form, language: e.target.value as EditForm["language"] })
                      }
                      className="w-full rounded-md border border-line px-2 py-2 text-sm text-ink outline-none"
                    >
                      <option value="">—</option>
                      {LANGUAGE_OPTIONS.map((l) => (
                        <option key={l} value={l}>
                          {l}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Auteur">
                    <select
                      value={form.author}
                      onChange={(e) => setForm({ ...form, author: e.target.value })}
                      className="w-full rounded-md border border-line px-2 py-2 text-sm text-ink outline-none"
                    >
                      <option value="">—</option>
                      {authorOptions.map((a) => (
                        <option key={a} value={a}>
                          {officerName(a)}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Date source">
                    <input
                      type="date"
                      value={form.sourceDate}
                      onChange={(e) => setForm({ ...form, sourceDate: e.target.value })}
                      className="w-full rounded-md border border-line px-2 py-2 text-sm text-ink outline-none"
                    />
                  </Field>
                </div>
                <Field label="Références réglementaires (une par ligne)">
                  <textarea
                    value={form.regulatoryRefs}
                    onChange={(e) => setForm({ ...form, regulatoryRefs: e.target.value })}
                    rows={3}
                    placeholder="art. VII.65 §1, 3° CDE"
                    className="w-full rounded-md border border-line px-3 py-2 text-sm text-ink outline-none focus:border-brand-400"
                  />
                </Field>
                <label className="flex items-center gap-2 text-sm text-ink">
                  <input
                    type="checkbox"
                    checked={form.isPublished}
                    onChange={(e) => setForm({ ...form, isPublished: e.target.checked })}
                  />
                  Publiée (servie par l&apos;agent)
                </label>
              </div>
            )}

            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                Provenance ({detail.sources.length} email{detail.sources.length > 1 ? "s" : ""})
              </h3>
              {detail.sources.length === 0 ? (
                <p className="text-sm text-slate-400">Fiche manuelle — aucune source email liée.</p>
              ) : (
                <ul className="space-y-2">
                  {detail.sources.map((s) => (
                    <li key={s.id} className="rounded-md border border-line px-3 py-2 text-sm">
                      <p className="flex items-center gap-1.5 font-medium text-ink">
                        <ExternalLink className="size-3.5 text-slate-400" />
                        {s.subject ?? "(sans objet)"}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {s.sender ?? "—"} · {s.direction ?? "—"} ·{" "}
                        {s.receivedAt ? s.receivedAt.slice(0, 10) : "—"}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}
      </aside>
    </div>
  );
}
