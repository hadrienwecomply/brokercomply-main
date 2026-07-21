"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { Check, RotateCcw, Sparkles, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/format";
import {
  INTENT_LABEL,
  PIPELINE_COLUMNS,
  type AiActionDTO,
} from "@/lib/prospects-types";
import { decideAiAction, undoAiAction } from "@/lib/prospects-actions";

const STAGE_LABEL = new Map(PIPELINE_COLUMNS.map((c) => [c.key, c.label]));
const stageLabel = (s: string | null) => (s ? STAGE_LABEL.get(s as never) ?? s : "—");

/**
 * The "IA" view: what the intent classifier read from prospect e-mails and did
 * about it. Two sections — proposals awaiting an officer (below the confidence
 * bar or blocked because a human moved the card after the e-mail), and the feed
 * of everything applied, each reversible to its exact prior stage.
 */
export function AiActivity({ actions }: { actions: AiActionDTO[] }) {
  const [rows, setRows] = useState(actions);
  const [, startTransition] = useTransition();

  const pending = useMemo(() => rows.filter((a) => a.status === "pending_review"), [rows]);
  const applied = useMemo(
    () => rows.filter((a) => a.status === "applied" && a.stageAfter),
    [rows],
  );

  function patch(id: string, status: AiActionDTO["status"]) {
    setRows((prev) => prev.map((a) => (a.id === id ? { ...a, status } : a)));
  }

  function confirm(a: AiActionDTO) {
    patch(a.id, "applied");
    startTransition(() => decideAiAction(a.id, "confirm"));
  }
  function dismiss(a: AiActionDTO) {
    patch(a.id, "dismissed");
    startTransition(() => decideAiAction(a.id, "dismiss"));
  }
  function revert(a: AiActionDTO) {
    patch(a.id, "reverted");
    startTransition(() => undoAiAction(a.id));
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-line bg-white/60 px-6 py-12 text-center">
        <Sparkles className="mx-auto size-6 text-st-na" />
        <p className="mt-2 text-sm text-ink-soft">
          Aucune activité de l&apos;agent encore. À chaque nouvelle réponse d&apos;un prospect,
          l&apos;agent lit le fil, en déduit l&apos;intention et fait avancer le funnel — les
          mouvements automatiques et les propositions à valider s&apos;afficheront ici.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {pending.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-ink">
            À valider <span className="text-st-na">({pending.length})</span>
          </h2>
          <p className="text-xs text-ink-soft">
            L&apos;agent propose ces mouvements mais ne les a pas appliqués (confiance sous le
            seuil, ou un officer a déplacé la carte après l&apos;e-mail).
          </p>
          <ul className="divide-y divide-line rounded-xl border border-line bg-white">
            {pending.map((a) => (
              <ActionRow key={a.id} a={a}>
                <button
                  onClick={() => confirm(a)}
                  className="inline-flex items-center gap-1 rounded-lg bg-brand-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-brand-700"
                >
                  <Check className="size-3.5" /> Valider
                </button>
                <button
                  onClick={() => dismiss(a)}
                  className="inline-flex items-center gap-1 rounded-lg border border-line px-2.5 py-1.5 text-xs font-medium text-ink-soft hover:bg-line/40"
                >
                  <X className="size-3.5" /> Rejeter
                </button>
              </ActionRow>
            ))}
          </ul>
        </section>
      )}

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-ink">Mouvements automatiques</h2>
        {applied.length === 0 ? (
          <p className="text-xs text-ink-soft">Aucun mouvement appliqué automatiquement.</p>
        ) : (
          <ul className="divide-y divide-line rounded-xl border border-line bg-white">
            {applied.map((a) => (
              <ActionRow key={a.id} a={a}>
                <button
                  onClick={() => revert(a)}
                  title="Annuler ce mouvement et revenir à l'étape précédente"
                  className="inline-flex items-center gap-1 rounded-lg border border-line px-2.5 py-1.5 text-xs font-medium text-ink-soft hover:bg-line/40"
                >
                  <RotateCcw className="size-3.5" /> Annuler
                </button>
              </ActionRow>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function ActionRow({ a, children }: { a: AiActionDTO; children: React.ReactNode }) {
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/suivi-commercial/${a.prospectId}`}
            className="truncate text-sm font-medium text-ink hover:text-brand-700"
          >
            {a.societe}
          </Link>
          <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700">
            {INTENT_LABEL[a.intent] ?? a.intent}
          </span>
          <ConfidencePill value={a.confidence} />
          {a.stageAfter && (
            <span className="text-xs text-st-na">
              {stageLabel(a.stageBefore)} → <span className="text-ink">{stageLabel(a.stageAfter)}</span>
            </span>
          )}
        </div>
        {a.quote && (
          <p className="mt-1 truncate text-xs italic text-ink-soft" title={a.quote}>
            « {a.quote} »
          </p>
        )}
      </div>
      <time className="text-xs text-st-na">{formatDate(a.createdAt)}</time>
      <div className="flex items-center gap-1.5">{children}</div>
    </li>
  );
}

function ConfidencePill({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  return (
    <span
      className={cn(
        "rounded-full px-1.5 py-0.5 text-[11px] font-medium ring-1 ring-inset",
        value >= 0.92
          ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
          : value >= 0.75
            ? "bg-brand-50 text-brand-700 ring-brand-200"
            : "bg-amber-50 text-amber-700 ring-amber-200",
      )}
      title="Confiance du classifieur"
    >
      {pct}%
    </span>
  );
}
