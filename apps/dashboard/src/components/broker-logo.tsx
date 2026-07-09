"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, ImageUp, Palette, Trash2, X } from "lucide-react";
import { setPrimaryColor } from "@/lib/broker-actions";
import { cn } from "@/lib/cn";

/** External PNG converter shown when the user picks a non-PNG file. */
const PNG_CONVERTER_URL = "https://cloudconvert.com/png-converter";

/** A few brand-neutral starting swatches; the native picker covers the rest. */
const PRESET_COLORS = [
  "#242fd0", "#0e7490", "#047857", "#b91c1c",
  "#c2410c", "#7c3aed", "#be185d", "#1f2937",
];

const HEX_RE = /^#?([0-9a-fA-F]{6})$/;
const normHex = (raw: string): string | null => {
  const m = raw.trim().match(HEX_RE);
  return m ? `#${m[1].toLowerCase()}` : null;
};

export function BrokerLogo({
  brokerId,
  slug,
  societe,
  hasLogo,
  primaryColor,
}: {
  brokerId: string;
  slug: string;
  societe: string;
  hasLogo: boolean;
  primaryColor?: string;
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
      const res = await fetch(`/api/brokers/${brokerId}/logo`, { method: "POST", body });
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
      await fetch(`/api/brokers/${brokerId}/logo`, { method: "DELETE" });
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
    <div className="flex items-center gap-3">
      <input
        ref={fileRef}
        type="file"
        accept="image/png,.png"
        className="hidden"
        onChange={onPick}
      />

      {hasLogo ? (
        <div className="group relative size-16 shrink-0 overflow-hidden rounded-lg border border-line bg-white">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/api/brokers/${brokerId}/logo?v=${version}`}
            alt={`Logo ${societe}`}
            className="size-full object-contain p-1.5"
          />
          <div className="absolute inset-0 hidden items-center justify-center gap-1 bg-black/45 group-hover:flex">
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
          className="flex size-16 shrink-0 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-line bg-white text-[10px] font-medium text-ink-soft hover:border-brand-300 hover:text-brand-700"
          title="Ajouter un logo (PNG)"
        >
          <ImageUp className="size-4" />
          Logo
        </button>
      )}

      <ColorPicker brokerId={brokerId} slug={slug} value={primaryColor} />

      {error && <span className="text-xs font-medium text-rose-600">{error}</span>}

      {showFormatHelp && (
        <FormatHelpModal onClose={() => setShowFormatHelp(false)} />
      )}
    </div>
  );
}

function ColorPicker({
  brokerId,
  slug,
  value,
}: {
  brokerId: string;
  slug: string;
  value?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value ?? "#242fd0");
  const [pending, startTransition] = useTransition();

  function apply(hex: string) {
    const norm = normHex(hex);
    if (!norm) return;
    setDraft(norm);
    startTransition(async () => {
      await setPrimaryColor(brokerId, slug, norm);
      setOpen(false);
      router.refresh();
    });
  }

  function clear() {
    startTransition(async () => {
      await setPrimaryColor(brokerId, slug, null);
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-2 rounded-md border border-line bg-white px-2.5 py-1.5 text-xs font-medium text-ink-soft hover:border-brand-300 hover:text-brand-700"
        title="Couleur primaire (personnalise les formulaires)"
      >
        {value ? (
          <span
            className="size-4 rounded-full border border-black/10"
            style={{ backgroundColor: value }}
          />
        ) : (
          <Palette className="size-4" />
        )}
        {value ?? "Couleur"}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-50 mt-2 w-60 rounded-lg border border-line bg-white p-3 shadow-xl">
            <p className="mb-2 text-xs font-semibold text-ink">Couleur primaire</p>
            <div className="mb-3 grid grid-cols-8 gap-1.5">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => apply(c)}
                  className={cn(
                    "size-6 rounded-full border transition-transform hover:scale-110",
                    normHex(draft) === c ? "border-ink ring-2 ring-brand-300" : "border-black/10",
                  )}
                  style={{ backgroundColor: c }}
                  title={c}
                />
              ))}
            </div>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={normHex(draft) ?? "#242fd0"}
                onChange={(e) => setDraft(e.target.value)}
                className="size-8 shrink-0 cursor-pointer rounded border border-line bg-white"
              />
              <input
                type="text"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="#rrggbb"
                className="w-full rounded-md border border-line px-2 py-1 text-xs outline-none focus:border-brand-500"
              />
              <button
                type="button"
                disabled={pending || !normHex(draft)}
                onClick={() => apply(draft)}
                className="rounded-md bg-brand-600 p-1.5 text-white hover:bg-brand-700 disabled:opacity-40"
                title="Appliquer"
              >
                <Check className="size-4" />
              </button>
            </div>
            <p className="mt-2 text-[11px] leading-snug text-ink-soft">
              Utilisée comme couleur d&apos;accent des formulaires et rapports
              (assombrie automatiquement si trop claire, pour rester lisible).
            </p>
            {value && (
              <button
                type="button"
                onClick={clear}
                className="mt-2 text-[11px] font-medium text-rose-600 hover:underline"
              >
                Réinitialiser
              </button>
            )}
          </div>
        </>
      )}
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
