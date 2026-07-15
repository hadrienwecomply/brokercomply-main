"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Megaphone, PencilLine, FileDown, RotateCw, UploadCloud, Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/format";
import { retryPubAuditAction } from "@/lib/pub-audit-actions";
import { Card } from "./ui";
import type { PubAuditView } from "@/lib/pub-audit.server";

const STATUS: Record<string, { label: string; cls: string }> = {
  queued: { label: "En file", cls: "bg-[#eef0f2] text-[#4b5159] border-[#d3d7dc]" },
  running: { label: "Analyse en cours", cls: "bg-[#fdf1da] text-[#8a5300] border-[#f0ad4e]/55" },
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

const NIVEAU: Record<string, { label: string; cls: string }> = {
  rouge: { label: "Non conforme", cls: "bg-[#fde2e5] text-[#bb1626] border-[#ea384c]/55" },
  orange: { label: "À compléter", cls: "bg-[#fdf1da] text-[#8a5300] border-[#f0ad4e]/55" },
  jaune: { label: "Sous réserve", cls: "bg-[#eef0f2] text-[#4b5159] border-[#d3d7dc]" },
  vert: { label: "Conforme", cls: "bg-[#e7f4ec] text-[#1f7a44] border-[#2f855a]/45" },
};

const LIVE = new Set(["queued", "running", "pdf_requested"]);

function Badge({ label, cls }: { label: string; cls: string }) {
  return (
    <span className={cn("inline-flex items-center rounded-md border px-2 py-1 text-xs font-medium leading-none", cls)}>
      {label}
    </span>
  );
}

function AuditRow({ audit, slug }: { audit: PubAuditView; slug: string }) {
  const [isPending, startTransition] = useTransition();
  const status = STATUS[audit.status] ?? {
    label: audit.status,
    cls: "bg-[#eef0f2] text-[#4b5159] border-[#d3d7dc]",
  };
  // error / needs_manual are terminal → always retryable. queued / running can
  // be orphaned by a server restart, but a genuinely live job should not be
  // double-launched (4 vision calls each): only offer retry once it's stale.
  const STALE_MS = 3 * 60 * 1000;
  const isStale = Date.now() - new Date(audit.updatedAt).getTime() > STALE_MS;
  const canRetry =
    ["error", "needs_manual"].includes(audit.status) ||
    (["queued", "running"].includes(audit.status) && isStale);

  return (
    <div className="flex items-center gap-4 border-b border-line px-4 py-3 last:border-0">
      <span className="w-24 shrink-0 text-sm tabular-nums text-ink-soft">{formatDate(audit.createdAt)}</span>
      <span className="flex-1 truncate text-sm text-ink">
        {audit.fileName}
        {audit.decompte && (
          <span className="ml-2 text-xs text-ink-soft">
            · {audit.decompte.non_conforme} non conf. · {audit.decompte.a_verifier} à vérif.
          </span>
        )}
        {audit.errorMessage && (
          <span
            className={cn(
              "ml-2 block truncate text-xs",
              audit.status === "review_pending" ? "text-[#8a5300]" : "text-[#bb1626]",
            )}
          >
            {audit.errorMessage}
          </span>
        )}
      </span>
      {audit.niveau && NIVEAU[audit.niveau.code] && <Badge {...NIVEAU[audit.niveau.code]} />}
      {audit.reviewStatus && REVIEW_STATUS[audit.reviewStatus] && <Badge {...REVIEW_STATUS[audit.reviewStatus]} />}
      <Badge label={status.label} cls={status.cls} />
      {audit.hasReview && (
        <button
          type="button"
          onClick={() => window.open(`/courtiers/${slug}/pub/${audit.id}/review`, "_blank", "noopener,noreferrer")}
          className="inline-flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1 text-xs font-medium text-ink-soft transition-colors hover:bg-paper"
        >
          <PencilLine className="size-3.5" />
          Relecture
        </button>
      )}
      {audit.pdfRef && /^(?:https?:\/\/|\/)/i.test(audit.pdfRef) && (
        <button
          type="button"
          onClick={() => window.open(audit.pdfRef!, "_blank", "noopener,noreferrer")}
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
          onClick={() => startTransition(() => void retryPubAuditAction(slug, audit.id))}
          className="inline-flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1 text-xs font-medium text-ink-soft transition-colors hover:bg-paper disabled:opacity-50"
        >
          <RotateCw className={cn("size-3.5", isPending && "animate-spin")} />
          Relancer
        </button>
      )}
    </div>
  );
}

export function PubAuditPanel({
  slug,
  brokerDbId,
  audits,
}: {
  slug: string;
  brokerDbId: string | null;
  audits: PubAuditView[];
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [accompanyingText, setAccompanyingText] = useState("");
  const [landingUrl, setLandingUrl] = useState("");

  const hasLive = audits.some((a) => LIVE.has(a.status));
  useEffect(() => {
    if (!hasLive) return;
    const id = setInterval(() => router.refresh(), 4000);
    return () => clearInterval(id);
  }, [hasLive, router]);

  async function upload(files: FileList | null) {
    setError(null);
    setNotice(null);
    if (!brokerDbId) {
      setError("Courtier non enregistré en base.");
      return;
    }
    if (!files || files.length === 0) return;
    const form = new FormData();
    for (const f of Array.from(files)) form.append("files", f);
    if (accompanyingText.trim()) form.append("accompanyingText", accompanyingText.trim());
    if (landingUrl.trim()) form.append("landingUrl", landingUrl.trim());
    setUploading(true);
    try {
      const res = await fetch(`/api/brokers/${brokerDbId}/pub-audits`, { method: "POST", body: form });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        count?: number;
        rejected?: Array<{ fileName: string; reason: string }>;
      };
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Échec de l'envoi des images.");
      } else {
        const rejected = data.rejected?.length ?? 0;
        setNotice(
          `${data.count} pub${(data.count ?? 0) > 1 ? "s" : ""} en cours d'analyse` +
            (rejected > 0 ? ` — ${rejected} fichier(s) ignoré(s) (format non supporté ou trop volumineux).` : "."),
        );
        router.refresh();
      }
    } catch {
      setError("Impossible de joindre le serveur.");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="space-y-4">
      <Card className="px-6 py-5">
        <div className="flex items-center gap-4">
          <Megaphone className="size-8 shrink-0 text-brand-600" />
          <div className="flex-1">
            <p className="text-sm font-medium text-ink">Audit de conformité des publicités</p>
            <p className="text-sm text-ink-soft">
              Importez une ou plusieurs images (PNG, JPEG, WebP). Chaque visuel est analysé séparément au regard du
              guide Do &amp; Don&apos;t (FSMA / CDE). Les vidéos seront prises en charge dans une V2.
            </p>
            {error && <p className="mt-1 text-sm text-[#bb1626]">{error}</p>}
            {notice && <p className="mt-1 text-sm text-[#1f7a44]">{notice}</p>}
          </div>
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            multiple
            hidden
            onChange={(e) => void upload(e.target.files)}
          />
          <button
            type="button"
            disabled={!brokerDbId || uploading}
            onClick={() => inputRef.current?.click()}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:opacity-50"
          >
            {uploading ? <Loader2 className="size-4 animate-spin" /> : <UploadCloud className="size-4" />}
            Importer des pubs
          </button>
        </div>
        {/* Optional context — supplied with the batch, it lets the checker rule
            on mentions that may legally sit outside the visual instead of
            defaulting them to "à vérifier". */}
        <div className="mt-4 grid gap-3 border-t border-line pt-4 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-ink-soft">Texte d&apos;accompagnement (optionnel)</span>
            <textarea
              value={accompanyingText}
              onChange={(e) => setAccompanyingText(e.target.value)}
              rows={2}
              placeholder="Légende du post, corps de l'email…"
              className="w-full rounded-lg border border-line px-3 py-2 text-sm text-ink outline-none focus:border-brand-500"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-ink-soft">URL de la landing page (optionnel)</span>
            <input
              type="url"
              value={landingUrl}
              onChange={(e) => setLandingUrl(e.target.value)}
              placeholder="https://…"
              className="w-full rounded-lg border border-line px-3 py-2 text-sm text-ink outline-none focus:border-brand-500"
            />
            <span className="mt-1 block text-xs text-ink-soft">
              Le contenu de la page est récupéré et pris en compte lors de l&apos;analyse.
            </span>
          </label>
        </div>
      </Card>

      {audits.length === 0 ? (
        <Card className="px-6 py-10 text-center">
          <p className="text-sm text-ink-soft">Aucune pub analysée pour l&apos;instant. Importez-en ci-dessus.</p>
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
