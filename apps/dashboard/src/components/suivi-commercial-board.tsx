"use client";

import { useMemo, useState, useTransition } from "react";
import {
  AlertTriangle,
  CalendarX2,
  Phone,
  PhoneMissed,
  RefreshCw,
  Search,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { formatDate, formatEur } from "@/lib/format";
import {
  anyPhone,
  CALL_OUTCOMES,
  LOST_REASON_LABEL,
  PIPELINE_COLUMNS,
  primaryContact,
  type CallOutcome,
  type PipelineStage,
  type ProspectDTO,
} from "@/lib/prospects-types";
import { markCalled, movePipeline, runTick, savePhone } from "@/lib/prospects-actions";

type View = "call-list" | "pipeline";

export function SuiviCommercialBoard({ initial }: { initial: ProspectDTO[] }) {
  const [prospects, setProspects] = useState<ProspectDTO[]>(initial);
  const [view, setView] = useState<View>("call-list");
  const [query, setQuery] = useState("");
  const [ticking, setTicking] = useState(false);
  const [, startTransition] = useTransition();

  const q = query.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      q
        ? prospects.filter(
            (p) =>
              p.societe.toLowerCase().includes(q) ||
              p.contacts.some(
                (c) =>
                  c.name?.toLowerCase().includes(q) ||
                  c.email?.toLowerCase().includes(q),
              ),
          )
        : prospects,
    [prospects, q],
  );

  const callList = useMemo(
    () =>
      filtered
        .filter((p) => p.stage === "to_call")
        .sort((a, b) => (a.offerSentAt ?? "").localeCompare(b.offerSentAt ?? "")),
    [filtered],
  );
  const missingPhone = callList.filter((p) => !anyPhone(p)).length;

  function patch(id: string, changes: Partial<ProspectDTO>) {
    setProspects((prev) => prev.map((p) => (p.id === id ? { ...p, ...changes } : p)));
  }

  function onCalled(p: ProspectDTO, outcome: CallOutcome) {
    patch(p.id, {
      stage: "closed",
      outcome,
      calledAt: new Date().toISOString(),
      ...(outcome === "signed" ? { pipelineStage: "won" as const } : {}),
      ...(outcome === "not_interested"
        ? { pipelineStage: "lost" as const, lostReason: "not_interested" as const }
        : {}),
    });
    startTransition(() => markCalled(p.id, outcome));
  }

  function onPhoneSaved(p: ProspectDTO, phone: string) {
    const contacts =
      p.contacts.length > 0
        ? p.contacts.map((c, i) => (c.isPrimary || i === 0 ? { ...c, phone } : c))
        : [{ id: "new", name: null, email: null, phone, isPrimary: true }];
    patch(p.id, { contacts });
    startTransition(() => savePhone(p.id, phone));
  }

  function onMove(p: ProspectDTO, stage: PipelineStage) {
    const terminal = stage === "won" || stage === "lost";
    patch(p.id, {
      pipelineStage: stage,
      lostReason: stage === "lost" ? "other" : null,
      ...(terminal ? { stage: "closed", nextActionAt: null } : {}),
    });
    startTransition(() => movePipeline(p.id, stage));
  }

  function onTick() {
    setTicking(true);
    startTransition(async () => {
      await runTick();
      // Server revalidation refreshes the page data; local state follows on nav.
      window.location.reload();
    });
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex rounded-lg border border-line bg-white p-0.5">
          <ViewTab active={view === "call-list"} onClick={() => setView("call-list")}>
            <Phone className="size-3.5" />À appeler
            <span className="ml-1 rounded-full bg-[#fde2e5] px-1.5 text-[11px] font-semibold text-[#bb1626]">
              {callList.length}
            </span>
          </ViewTab>
          <ViewTab active={view === "pipeline"} onClick={() => setView("pipeline")}>
            Pipeline
            <span className="ml-1 rounded-full bg-line/70 px-1.5 text-[11px] font-semibold text-ink-soft">
              {filtered.length}
            </span>
          </ViewTab>
        </div>

        <label className="relative flex-1 min-w-52 max-w-sm">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-st-na" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher une agence, un contact…"
            className="w-full rounded-lg border border-line bg-white py-1.5 pl-8 pr-3 text-sm text-ink placeholder:text-st-na focus:border-brand-500 focus:outline-none"
          />
        </label>

        {missingPhone > 0 && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#fdf1da] px-2.5 py-1 text-xs font-medium text-[#8a5300] ring-1 ring-inset ring-[#f0ad4e]/55">
            <PhoneMissed className="size-3.5" />
            {missingPhone} numéro{missingPhone > 1 ? "s" : ""} à ajouter
          </span>
        )}

        <button
          onClick={onTick}
          disabled={ticking}
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-line bg-white px-2.5 py-1.5 text-xs font-medium text-ink-soft hover:bg-line/40 disabled:opacity-50"
          title="Recalculer les cadences (relances +7j / appels +15j)"
        >
          <RefreshCw className={cn("size-3.5", ticking && "animate-spin")} />
          Recalculer
        </button>
      </div>

      {view === "call-list" ? (
        <CallList prospects={callList} onCalled={onCalled} onPhoneSaved={onPhoneSaved} />
      ) : (
        <Pipeline prospects={filtered} onMove={onMove} />
      )}
    </div>
  );
}

function ViewTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
        active ? "bg-brand-50 text-brand-700" : "text-ink-soft hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}

/* ------------------------------- Call-list -------------------------------- */

function CallList({
  prospects,
  onCalled,
  onPhoneSaved,
}: {
  prospects: ProspectDTO[];
  onCalled: (p: ProspectDTO, outcome: CallOutcome) => void;
  onPhoneSaved: (p: ProspectDTO, phone: string) => void;
}) {
  if (prospects.length === 0) {
    return (
      <div className="rounded-xl border border-line bg-white p-10 text-center text-sm text-ink-soft">
        Personne à appeler 🎉 — la liste se remplit quand un prospect atteint J+15 sans réponse.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-line bg-white">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-soft">
            <th className="px-4 py-2.5 font-medium">Agence</th>
            <th className="px-4 py-2.5 font-medium">Contact</th>
            <th className="px-4 py-2.5 font-medium">Téléphone</th>
            <th className="px-4 py-2.5 font-medium">Offre envoyée</th>
            <th className="px-4 py-2.5 font-medium">MRR</th>
            <th className="px-4 py-2.5 font-medium">Résultat de l&apos;appel</th>
          </tr>
        </thead>
        <tbody>
          {prospects.map((p) => (
            <CallRow key={p.id} p={p} onCalled={onCalled} onPhoneSaved={onPhoneSaved} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

function CallRow({
  p,
  onCalled,
  onPhoneSaved,
}: {
  p: ProspectDTO;
  onCalled: (p: ProspectDTO, outcome: CallOutcome) => void;
  onPhoneSaved: (p: ProspectDTO, phone: string) => void;
}) {
  const contact = primaryContact(p);
  const phone = anyPhone(p);
  const days = daysSince(p.offerSentAt);

  return (
    <tr className="border-b border-line/60 last:border-0 hover:bg-line/20">
      <td className="px-4 py-3">
        <div className="font-medium text-ink">{p.societe}</div>
        <div className="mt-0.5 flex items-center gap-1.5">
          {p.noShow && <Badge tone="warn" icon={CalendarX2}>no-show</Badge>}
          {p.needsReview && <Badge tone="alert" icon={AlertTriangle}>à vérifier</Badge>}
        </div>
      </td>
      <td className="px-4 py-3 text-ink-soft">
        <div>{contact?.name ?? "—"}</div>
        {contact?.email && <div className="text-xs text-st-na">{contact.email}</div>}
      </td>
      <td className="px-4 py-3">
        {phone ? (
          <a
            href={`tel:${phone.replace(/[^+\d]/g, "")}`}
            className="inline-flex items-center gap-1.5 font-medium text-brand-700 hover:underline"
          >
            <Phone className="size-3.5" />
            {phone}
          </a>
        ) : (
          <PhoneInput onSave={(v) => onPhoneSaved(p, v)} />
        )}
      </td>
      <td className="px-4 py-3 text-ink-soft">
        {formatDate(p.offerSentAt ?? undefined)}
        {days !== null && days >= 15 && (
          <span className="ml-1.5 text-xs font-medium text-[#bb1626]">J+{days}</span>
        )}
      </td>
      <td className="px-4 py-3 text-ink-soft">{p.mrr != null ? formatEur(p.mrr) : "—"}</td>
      <td className="px-4 py-3">
        <div className="flex flex-wrap gap-1">
          {CALL_OUTCOMES.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => onCalled(p, key)}
              className={cn(
                "rounded-md border px-2 py-1 text-xs font-medium transition-colors",
                key === "signed"
                  ? "border-brand-500/45 bg-brand-50 text-brand-700 hover:bg-brand-100"
                  : key === "not_interested"
                    ? "border-line text-ink-soft hover:border-[#ea384c]/55 hover:bg-[#fde2e5] hover:text-[#bb1626]"
                    : "border-line text-ink-soft hover:bg-line/40 hover:text-ink",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </td>
    </tr>
  );
}

function PhoneInput({ onSave }: { onSave: (value: string) => void }) {
  const [value, setValue] = useState("");
  const commit = () => {
    if (value.trim()) onSave(value.trim());
  };
  return (
    <input
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === "Enter" && commit()}
      placeholder="Ajouter un n°…"
      className="w-36 rounded-md border border-dashed border-line bg-transparent px-2 py-1 text-xs text-ink placeholder:text-st-na focus:border-brand-500 focus:outline-none"
    />
  );
}

/* -------------------------------- Pipeline -------------------------------- */

function Pipeline({
  prospects,
  onMove,
}: {
  prospects: ProspectDTO[];
  onMove: (p: ProspectDTO, stage: PipelineStage) => void;
}) {
  const byStage = useMemo(() => {
    const map = new Map<PipelineStage, ProspectDTO[]>();
    for (const { key } of PIPELINE_COLUMNS) map.set(key, []);
    for (const p of prospects) map.get(p.pipelineStage)?.push(p);
    return map;
  }, [prospects]);

  return (
    <div className="flex gap-3 overflow-x-auto pb-2">
      {PIPELINE_COLUMNS.map(({ key, label }) => {
        const cards = byStage.get(key) ?? [];
        const mrr = cards.reduce((s, p) => s + (p.mrr ?? 0), 0);
        return (
          <div
            key={key}
            className="flex w-64 shrink-0 flex-col rounded-xl border border-line bg-[#f7f8f9]"
          >
            <div className="flex items-baseline justify-between px-3 py-2.5">
              <span className="text-sm font-semibold text-ink">{label}</span>
              <span className="text-xs text-ink-soft">
                {cards.length}
                {mrr > 0 && <span className="ml-1.5 text-st-na">· {formatEur(mrr)}</span>}
              </span>
            </div>
            <div className="flex max-h-[65vh] flex-col gap-2 overflow-y-auto px-2 pb-2">
              {cards.map((p) => (
                <PipelineCard key={p.id} p={p} onMove={onMove} />
              ))}
              {cards.length === 0 && (
                <div className="rounded-lg border border-dashed border-line px-3 py-6 text-center text-xs text-st-na">
                  Vide
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function PipelineCard({
  p,
  onMove,
}: {
  p: ProspectDTO;
  onMove: (p: ProspectDTO, stage: PipelineStage) => void;
}) {
  const contact = primaryContact(p);
  return (
    <div className="group rounded-lg border border-line bg-white p-2.5 shadow-sm">
      <div className="text-sm font-medium leading-snug text-ink">{p.societe}</div>
      {contact?.name && <div className="mt-0.5 text-xs text-ink-soft">{contact.name}</div>}

      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        {p.mrr != null && (
          <span className="text-xs font-medium text-brand-700">{formatEur(p.mrr)}/m</span>
        )}
        {p.stage === "to_call" && <Badge tone="alert" icon={Phone}>à appeler</Badge>}
        {p.noShow && <Badge tone="warn" icon={CalendarX2}>no-show</Badge>}
        {p.needsReview && <Badge tone="alert" icon={AlertTriangle}>à vérifier</Badge>}
        {p.pipelineStage === "lost" && p.lostReason && (
          <span className="text-xs text-st-na">{LOST_REASON_LABEL[p.lostReason]}</span>
        )}
      </div>

      <select
        value={p.pipelineStage}
        onChange={(e) => onMove(p, e.target.value as PipelineStage)}
        className="mt-2 w-full rounded-md border border-line bg-white px-1.5 py-1 text-xs text-ink-soft opacity-0 transition-opacity focus:opacity-100 group-hover:opacity-100"
      >
        {PIPELINE_COLUMNS.map(({ key, label }) => (
          <option key={key} value={key}>
            {label}
          </option>
        ))}
      </select>
    </div>
  );
}

/* --------------------------------- Badges --------------------------------- */

function Badge({
  tone,
  icon: Icon,
  children,
}: {
  tone: "warn" | "alert";
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[11px] font-medium ring-1 ring-inset",
        tone === "warn"
          ? "bg-[#fdf1da] text-[#8a5300] ring-[#f0ad4e]/55"
          : "bg-[#fde2e5] text-[#bb1626] ring-[#ea384c]/55",
      )}
    >
      <Icon className="size-3" />
      {children}
    </span>
  );
}
