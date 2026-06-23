"use client";

import { useState, useTransition } from "react";
import { ChevronDown, RotateCw } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/format";
import { retryTrigger } from "@/lib/formulaire-actions";
import { Card } from "./ui";
import type { FormSubmissionView } from "@/lib/formulaires.server";

/** Submission processing-status pill styles. */
const STATUS: Record<string, { label: string; cls: string }> = {
  received: { label: "Reçu", cls: "bg-[#eef0f2] text-[#4b5159] border-[#d3d7dc]" },
  triggered: { label: "Déclenché", cls: "bg-brand-100 text-brand-700 border-brand-500/45" },
  failed: { label: "Échec", cls: "bg-[#fde2e5] text-[#bb1626] border-[#ea384c]/55 font-semibold" },
  done: { label: "Terminé", cls: "bg-brand-100 text-brand-700 border-brand-500/45" },
};

/** How the broker was resolved, shown as a secondary badge. */
const MATCH: Record<string, { label: string; cls: string }> = {
  email: { label: "Email", cls: "bg-[#eef0f2] text-[#4b5159] border-[#d3d7dc]" },
  domain: { label: "Domaine", cls: "bg-[#eef0f2] text-[#4b5159] border-[#d3d7dc]" },
  name: { label: "Nom", cls: "bg-[#eef0f2] text-[#4b5159] border-[#d3d7dc]" },
  created: {
    label: "Auto-créé · à revoir",
    cls: "bg-[#fdf1da] text-[#8a5300] border-[#f0ad4e]/55",
  },
  manual: { label: "Manuel", cls: "bg-[#eef0f2] text-[#4b5159] border-[#d3d7dc]" },
};

function Badge({ label, cls }: { label: string; cls: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-2 py-1 text-xs font-medium leading-none",
        cls,
      )}
    >
      {label}
    </span>
  );
}

/** Render a loosely-typed Fillout answer value as a readable string. */
function renderValue(value: unknown): string {
  if (value == null || value === "") return "—";
  if (Array.isArray(value)) return value.map((v) => String(v)).join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function SubmissionRow({
  submission,
  slug,
}: {
  submission: FormSubmissionView;
  slug: string;
}) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const status = STATUS[submission.status] ?? {
    label: submission.status,
    cls: "bg-[#eef0f2] text-[#4b5159] border-[#d3d7dc]",
  };
  const match = MATCH[submission.matchMethod] ?? {
    label: submission.matchMethod,
    cls: "bg-[#eef0f2] text-[#4b5159] border-[#d3d7dc]",
  };

  return (
    <div className="border-b border-line last:border-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-4 px-4 py-3 text-left transition-colors hover:bg-paper"
      >
        <ChevronDown
          className={cn("size-4 shrink-0 text-ink-soft transition-transform", open && "rotate-180")}
        />
        <span className="w-28 shrink-0 text-sm tabular-nums text-ink-soft">
          {formatDate(submission.submittedAt ?? submission.createdAt)}
        </span>
        <span className="flex-1 truncate text-sm font-medium text-ink">
          {submission.formType ?? "Formulaire"}
        </span>
        <Badge label={match.label} cls={match.cls} />
        <Badge label={status.label} cls={status.cls} />
        {submission.status === "failed" && (
          <button
            type="button"
            disabled={isPending}
            onClick={(e) => {
              e.stopPropagation();
              startTransition(() => {
                void retryTrigger(slug, submission.id);
              });
            }}
            className="inline-flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1 text-xs font-medium text-ink-soft transition-colors hover:bg-paper disabled:opacity-50"
          >
            <RotateCw className={cn("size-3.5", isPending && "animate-spin")} />
            Rejouer
          </button>
        )}
      </button>

      {open && (
        <div className="space-y-2 bg-paper/60 px-4 py-3 pl-12">
          {submission.fields.length === 0 ? (
            <p className="text-sm text-ink-soft">Aucune réponse enregistrée.</p>
          ) : (
            <dl className="grid grid-cols-[minmax(0,14rem)_1fr] gap-x-4 gap-y-1.5 text-sm">
              {submission.fields.map((f) => (
                <div key={f.questionId} className="contents">
                  <dt className="truncate text-ink-soft">{f.name ?? f.questionId}</dt>
                  <dd className="text-ink">{renderValue(f.value)}</dd>
                </div>
              ))}
            </dl>
          )}
          {submission.n8nExecutionId && (
            <p className="pt-1 text-xs text-ink-soft">
              Exécution n8n&nbsp;: <span className="font-mono">{submission.n8nExecutionId}</span>
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export function FormulairePanel({
  slug,
  submissions,
}: {
  slug: string;
  submissions: FormSubmissionView[];
}) {
  if (submissions.length === 0) {
    return (
      <Card className="px-6 py-10 text-center">
        <p className="text-sm text-ink-soft">
          Aucun formulaire reçu pour ce courtier. Les soumissions Fillout associées apparaîtront ici.
        </p>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      {submissions.map((s) => (
        <SubmissionRow key={s.id} submission={s} slug={slug} />
      ))}
    </Card>
  );
}
