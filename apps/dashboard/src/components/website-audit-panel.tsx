"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Globe, PencilLine, FileDown, RotateCw, Play, Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/format";
import { retryWebsiteAuditAction, triggerWebsiteAudit } from "@/lib/website-audit-actions";
import { Card } from "./ui";
import type { WebsiteAuditView } from "@/lib/website-audit.server";

/** Audit lifecycle pill styles. */
const STATUS: Record<string, { label: string; cls: string }> = {
  queued: { label: "En file", cls: "bg-[#eef0f2] text-[#4b5159] border-[#d3d7dc]" },
  running: { label: "Analyse en cours", cls: "bg-[#fdf1da] text-[#8a5300] border-[#f0ad4e]/55" },
  analyzed: { label: "Analysé", cls: "bg-brand-100 text-brand-700 border-brand-500/45" },
  review_pending: { label: "Relecture à faire", cls: "bg-[#fdf1da] text-[#8a5300] border-[#f0ad4e]/55" },
  needs_manual: { label: "Audit manuel requis", cls: "bg-[#fde2e5] text-[#bb1626] border-[#ea384c]/55" },
  error: { label: "Échec", cls: "bg-[#fde2e5] text-[#bb1626] border-[#ea384c]/55 font-semibold" },
};

const REVIEW_STATUS: Record<string, { label: string; cls: string }> = {
  pending: { label: "À relire", cls: "bg-[#fdf1da] text-[#8a5300] border-[#f0ad4e]/55" },
  edited: { label: "Relu", cls: "bg-brand-100 text-brand-700 border-brand-500/45" },
  pdf_requested: { label: "PDF en cours", cls: "bg-[#eef0f2] text-[#4b5159] border-[#d3d7dc]" },
  pdf_ready: { label: "PDF prêt", cls: "bg-[#e7f4ec] text-[#1f7a44] border-[#2f855a]/45" },
};

/** Statuses that are still moving — the panel polls while any audit is in one. */
const LIVE = new Set(["queued", "running", "pdf_requested"]);

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

function AuditRow({ audit, slug }: { audit: WebsiteAuditView; slug: string }) {
  const [isPending, startTransition] = useTransition();
  const status = STATUS[audit.status] ?? {
    label: audit.status,
    cls: "bg-[#eef0f2] text-[#4b5159] border-[#d3d7dc]",
  };
  // error / needs_manual are terminal; queued / running can get orphaned by a
  // server restart mid-run, so allow re-launching those too.
  const canRetry = ["error", "needs_manual", "queued", "running"].includes(audit.status);

  return (
    <div className="flex items-center gap-4 border-b border-line px-4 py-3 last:border-0">
      <span className="w-28 shrink-0 text-sm tabular-nums text-ink-soft">{formatDate(audit.createdAt)}</span>
      <span className="flex-1 truncate text-sm text-ink">
        {audit.websiteUrl}
        {audit.summary && (
          <span className="ml-2 text-xs text-ink-soft">
            · {audit.summary.critiques} crit · {audit.summary.ameliorations} amél · {audit.summary.aVerifier} à vérif.
          </span>
        )}
        {audit.errorMessage && audit.status !== "review_pending" && (
          <span className="ml-2 block truncate text-xs text-[#bb1626]">{audit.errorMessage}</span>
        )}
      </span>
      {audit.reviewStatus && REVIEW_STATUS[audit.reviewStatus] && <Badge {...REVIEW_STATUS[audit.reviewStatus]} />}
      <Badge label={status.label} cls={status.cls} />
      {audit.hasReview && (
        <button
          type="button"
          onClick={() =>
            window.open(`/courtiers/${slug}/audit/${audit.id}/review`, "_blank", "noopener,noreferrer")
          }
          className="inline-flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1 text-xs font-medium text-ink-soft transition-colors hover:bg-paper"
        >
          <PencilLine className="size-3.5" />
          Relecture
        </button>
      )}
      {audit.pdfRef && /^(?:https?:\/\/|\/)/i.test(audit.pdfRef) && (
        <button
          type="button"
          onClick={() => {
            if (audit.pdfRef && /^(?:https?:\/\/|\/)/i.test(audit.pdfRef)) {
              window.open(audit.pdfRef, "_blank", "noopener,noreferrer");
            }
          }}
          className="inline-flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1 text-xs font-medium text-ink-soft transition-colors hover:bg-paper"
        >
          <FileDown className="size-3.5" />
          PDF
        </button>
      )}
      {canRetry && (
        <button
          type="button"
          disabled={isPending}
          onClick={() => startTransition(() => void retryWebsiteAuditAction(slug, audit.id))}
          className="inline-flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1 text-xs font-medium text-ink-soft transition-colors hover:bg-paper disabled:opacity-50"
        >
          <RotateCw className={cn("size-3.5", isPending && "animate-spin")} />
          Relancer
        </button>
      )}
    </div>
  );
}

export function WebsiteAuditPanel({
  slug,
  website,
  audits,
}: {
  slug: string;
  website: string | null;
  audits: WebsiteAuditView[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Poll the server while any audit is still moving, so statuses update live.
  const hasLive = audits.some((a) => LIVE.has(a.status));
  useEffect(() => {
    if (!hasLive) return;
    const id = setInterval(() => router.refresh(), 4000);
    return () => clearInterval(id);
  }, [hasLive, router]);

  const launch = () => {
    setError(null);
    startTransition(async () => {
      const res = await triggerWebsiteAudit(slug);
      if (!res.ok) setError(res.error ?? "Échec du lancement de l'audit.");
      else router.refresh();
    });
  };

  return (
    <div className="space-y-4">
      <Card className="flex items-center gap-4 px-6 py-5">
        <Globe className="size-8 shrink-0 text-brand-600" />
        <div className="flex-1">
          <p className="text-sm font-medium text-ink">Audit de conformité du site web</p>
          <p className="text-sm text-ink-soft">
            {website ? (
              <>Analyse automatique de <span className="font-mono">{website}</span> au regard du cadre FSMA / CDE / RGPD.</>
            ) : (
              "Aucun site web renseigné pour ce courtier. Ajoutez-le dans la fiche (champ Site web) pour lancer un audit."
            )}
          </p>
          {error && <p className="mt-1 text-sm text-[#bb1626]">{error}</p>}
        </div>
        <button
          type="button"
          disabled={!website || isPending}
          onClick={launch}
          className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:opacity-50"
        >
          {isPending ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
          Lancer l&apos;audit
        </button>
      </Card>

      {audits.length === 0 ? (
        <Card className="px-6 py-10 text-center">
          <p className="text-sm text-ink-soft">Aucun audit pour l&apos;instant. Lancez le premier ci-dessus.</p>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          {audits.map((a) => (
            <AuditRow key={a.id} audit={a} slug={slug} />
          ))}
        </Card>
      )}
    </div>
  );
}
