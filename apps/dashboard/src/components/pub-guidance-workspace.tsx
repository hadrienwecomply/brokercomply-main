"use client";

import { useState, useTransition } from "react";
import { ChevronDown, Plus, Sparkles, Trash2, TrendingUp } from "lucide-react";
import { cn } from "@/lib/cn";
import { promotePubReformulationAction, savePubGuidanceAction } from "@/lib/pub-audit-actions";
import type { PubGuidanceConfig } from "@/lib/pub-guidance.server";

type GuidanceRow = PubGuidanceConfig["sections"][number]["rows"][number];

function CheckEditor({ row }: { row: GuidanceRow }) {
  const [open, setOpen] = useState(false);
  const [reformulations, setReformulations] = useState<string[]>(row.reformulations);
  const [consigne, setConsigne] = useState(row.consigne ?? "");
  const [active, setActive] = useState(row.active);
  const [status, setStatus] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const configured = row.reformulations.length > 0 || Boolean(row.consigne);

  function save() {
    setStatus(null);
    startTransition(async () => {
      const res = await savePubGuidanceAction({
        checkId: row.checkId,
        reformulations: reformulations.map((r) => r.trim()).filter(Boolean),
        consigne: consigne.trim() ? consigne.trim() : null,
        active,
      });
      setStatus(res.ok ? "Enregistré." : res.error ?? "Échec.");
    });
  }

  return (
    <div className="border-b border-line last:border-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-paper"
      >
        <ChevronDown className={cn("size-4 shrink-0 text-ink-soft transition-transform", open && "rotate-180")} />
        <span className="w-12 shrink-0 text-xs font-semibold tabular-nums text-ink-soft">{row.checkId}</span>
        <span className="flex-1 text-sm text-ink">{row.intitule}</span>
        {configured && (
          <span className="rounded-md border border-brand-500/45 bg-brand-100 px-2 py-0.5 text-xs font-medium text-brand-700">
            {row.reformulations.length > 0 ? `${row.reformulations.length} reformulation(s)` : "consigne"}
          </span>
        )}
        {!active && <span className="text-xs text-ink-soft">désactivé</span>}
      </button>

      {open && (
        <div className="space-y-4 bg-paper/60 px-4 pb-4 pl-[4.75rem]">
          <div>
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-ink-soft">
              Reformulations approuvées
            </p>
            <div className="space-y-2">
              {reformulations.map((r, i) => (
                <div key={i} className="flex gap-2">
                  <input
                    value={r}
                    onChange={(e) =>
                      setReformulations((prev) => prev.map((v, j) => (j === i ? e.target.value : v)))
                    }
                    placeholder="Formulation prête à l'emploi…"
                    className="flex-1 rounded-lg border border-line px-3 py-1.5 text-sm text-ink outline-none focus:border-brand-500"
                  />
                  <button
                    type="button"
                    onClick={() => setReformulations((prev) => prev.filter((_, j) => j !== i))}
                    className="rounded-lg border border-line px-2 text-ink-soft hover:bg-white"
                    aria-label="Retirer"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => setReformulations((prev) => [...prev, ""])}
                className="inline-flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1 text-xs font-medium text-ink-soft hover:bg-white"
              >
                <Plus className="size-3.5" /> Ajouter une reformulation
              </button>
            </div>
          </div>

          <label className="block">
            <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-ink-soft">
              Consigne d&apos;interprétation
            </span>
            <textarea
              value={consigne}
              onChange={(e) => setConsigne(e.target.value)}
              rows={2}
              placeholder="Ex. tolérer « simulation en ligne » — outil, pas promesse de rapidité d'octroi."
              className="w-full rounded-lg border border-line px-3 py-2 text-sm text-ink outline-none focus:border-brand-500"
            />
          </label>

          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-ink-soft">
              <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
              Actif
            </label>
            <button
              type="button"
              disabled={isPending}
              onClick={save}
              className="rounded-lg bg-brand-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
            >
              Enregistrer
            </button>
            {status && <span className="text-sm text-ink-soft">{status}</span>}
          </div>
        </div>
      )}
    </div>
  );
}

function PromotionCandidates({ candidates }: { candidates: PubGuidanceConfig["candidates"] }) {
  const [isPending, startTransition] = useTransition();
  const [done, setDone] = useState<Set<string>>(new Set());
  if (candidates.length === 0) return null;

  return (
    <div className="rounded-xl border border-brand-500/40 bg-brand-100/50 p-4">
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-brand-700">
        <Sparkles className="size-4" /> Reformulations à promouvoir
      </div>
      <p className="mb-3 text-sm text-ink-soft">
        Ces reformulations reviennent souvent dans les corrections des officers. Ajoutez-les à la bibliothèque
        pour que l&apos;analyse les propose automatiquement.
      </p>
      <div className="space-y-2">
        {candidates.map((c) => {
          const key = `${c.checkId}·${c.reformulation}`;
          const isDone = done.has(key);
          return (
            <div key={key} className="flex items-center gap-3 rounded-lg border border-line bg-white px-3 py-2">
              <span className="w-12 shrink-0 text-xs font-semibold text-ink-soft">{c.checkId}</span>
              <span className="flex-1 text-sm text-ink">
                « {c.reformulation} »
                <span className="ml-2 text-xs text-ink-soft">· {c.count}× corrigé</span>
              </span>
              <button
                type="button"
                disabled={isPending || isDone}
                onClick={() =>
                  startTransition(async () => {
                    const res = await promotePubReformulationAction(c.checkId, c.reformulation);
                    if (res.ok) setDone((prev) => new Set(prev).add(key));
                  })
                }
                className="rounded-lg border border-brand-500 bg-brand-600 px-3 py-1 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
              >
                {isDone ? "Promu ✓" : "Promouvoir"}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Calibration({ calibration }: { calibration: PubGuidanceConfig["calibration"] }) {
  const top = calibration.filter((c) => c.verdictFlips > 0).slice(0, 8);
  if (top.length === 0) return null;
  return (
    <div className="rounded-xl border border-line bg-white p-4">
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-ink">
        <TrendingUp className="size-4 text-ink-soft" /> Checks les plus corrigés
      </div>
      <p className="mb-3 text-sm text-ink-soft">
        Un verdict souvent retourné signale un check à cadrer (consigne cabinet) plutôt qu&apos;à re-corriger à
        chaque audit.
      </p>
      <div className="flex flex-wrap gap-2">
        {top.map((c) => (
          <span key={c.checkId} className="rounded-md border border-line bg-paper px-2.5 py-1 text-xs text-ink-soft">
            <span className="font-semibold text-ink">{c.checkId}</span> {c.intitule} · {c.verdictFlips}×
          </span>
        ))}
      </div>
    </div>
  );
}

export function PubGuidanceWorkspace({ config }: { config: PubGuidanceConfig }) {
  return (
    <div className="space-y-5">
      <PromotionCandidates candidates={config.candidates} />
      <Calibration calibration={config.calibration} />
      {config.sections.map((sec) => (
        <div key={sec.titre} className="overflow-hidden rounded-xl border border-line bg-white">
          <h2 className="border-b border-line bg-paper px-4 py-2.5 text-sm font-semibold text-ink">{sec.titre}</h2>
          {sec.rows.map((row) => (
            <CheckEditor key={row.checkId} row={row} />
          ))}
        </div>
      ))}
    </div>
  );
}
