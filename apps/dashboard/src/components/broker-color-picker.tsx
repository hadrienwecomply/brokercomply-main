"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Palette } from "lucide-react";
import { setPrimaryColor } from "@/lib/broker-actions";
import { cn } from "@/lib/cn";

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

/** Brand primary-colour picker: presets + native picker + hex, saved via server action. */
export function BrokerColorPicker({
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
        className="inline-flex items-center gap-2 rounded-md border border-line bg-white px-2.5 py-2 text-sm font-medium text-ink-soft hover:border-brand-300 hover:text-brand-700"
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
        {value ?? "Définir une couleur"}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-50 mt-2 w-64 rounded-lg border border-line bg-white p-3 shadow-xl">
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
