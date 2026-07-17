"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ImageUp, Trash2, X } from "lucide-react";

/** External PNG converter shown when the user picks a non-PNG file. */
const PNG_CONVERTER_URL = "https://cloudconvert.com/png-converter";

/**
 * Company-logo uploader for a prospect agency. Twin of `BrokerLogo` but pointed
 * at the prospect endpoint and sized for the detail-page header; no brand-colour
 * extraction (that is a broker-only, white-label concern).
 */
export function ProspectLogo({
  prospectId,
  societe,
  hasLogo,
}: {
  prospectId: string;
  societe: string;
  hasLogo: boolean;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [version, setVersion] = useState(0); // cache-bust the <img> after replace
  const [showFormatHelp, setShowFormatHelp] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File) {
    setError(null);
    if (file.type !== "image/png") {
      setShowFormatHelp(true);
      return;
    }
    setBusy(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch(`/api/prospects/${prospectId}/logo`, { method: "POST", body });
      if (res.status === 415) {
        setShowFormatHelp(true);
        return;
      }
      if (res.status === 413) {
        setError("Fichier trop volumineux (max 2 Mo).");
        return;
      }
      if (!res.ok) {
        setError("L'envoi a échoué. Réessaie.");
        return;
      }
      setVersion((v) => v + 1);
      router.refresh();
    } catch {
      setError("L'envoi a échoué. Réessaie.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      await fetch(`/api/prospects/${prospectId}/logo`, { method: "DELETE" });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file after an error
    if (file) void upload(file);
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <input
        ref={fileRef}
        type="file"
        accept="image/png,.png"
        className="hidden"
        onChange={onPick}
      />

      {hasLogo ? (
        <div className="group relative size-16 shrink-0 overflow-hidden rounded-xl border border-line bg-white">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/api/prospects/${prospectId}/logo?v=${version}`}
            alt={`Logo ${societe}`}
            className="size-full object-contain p-1.5"
          />
          <div className="absolute inset-0 hidden items-center justify-center gap-1.5 bg-black/45 group-hover:flex">
            <button
              type="button"
              disabled={busy}
              onClick={() => fileRef.current?.click()}
              className="rounded p-1 text-white hover:bg-white/20"
              title="Remplacer le logo"
            >
              <ImageUp className="size-4" />
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={remove}
              className="rounded p-1 text-white hover:bg-white/20"
              title="Retirer le logo"
            >
              <Trash2 className="size-4" />
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={() => fileRef.current?.click()}
          className="flex size-16 shrink-0 flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-line bg-white text-[10px] font-medium text-ink-soft hover:border-brand-300 hover:text-brand-700"
          title="Ajouter un logo (PNG)"
        >
          <ImageUp className="size-5" />
          Logo
        </button>
      )}

      {error && <span className="text-xs font-medium text-rose-600">{error}</span>}

      {showFormatHelp && <FormatHelpModal onClose={() => setShowFormatHelp(false)} />}
    </div>
  );
}

function FormatHelpModal({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-lg border border-line bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-ink">Format non pris en charge</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-ink-soft hover:bg-line/60 hover:text-ink"
            aria-label="Fermer"
          >
            <X className="size-4" />
          </button>
        </div>
        <p className="text-sm text-ink-soft">
          Le logo doit être un fichier <strong>PNG</strong>. Convertis ton image
          gratuitement, puis réessaie l&apos;envoi.
        </p>
        <a
          href={PNG_CONVERTER_URL}
          target="_blank"
          rel="noreferrer"
          className="mt-4 inline-flex w-full items-center justify-center rounded-md bg-brand-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-brand-700"
        >
          Convertir en PNG →
        </a>
      </div>
    </div>
  );
}
