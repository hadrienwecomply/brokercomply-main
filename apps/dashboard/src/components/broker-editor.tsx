"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";
import { BrokerFields } from "./broker-fields";
import type { BrokerEditorValues } from "@/lib/broker-form";

export type { BrokerEditorValues } from "@/lib/broker-form";
export { EMPTY_BROKER } from "@/lib/broker-form";

export function BrokerEditor({
  title,
  initial,
  busy,
  error,
  submitLabel = "Enregistrer",
  onSubmit,
  onClose,
}: {
  title: string;
  initial: BrokerEditorValues;
  busy?: boolean;
  error?: string | null;
  submitLabel?: string;
  onSubmit: (values: BrokerEditorValues) => void;
  onClose: () => void;
}) {
  const [values, setValues] = useState<BrokerEditorValues>(initial);
  const set = (patch: Partial<BrokerEditorValues>) => setValues((v) => ({ ...v, ...patch }));
  const canSave = values.societe.trim().length > 0 && !busy;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-line bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="sticky top-0 flex items-center justify-between border-b border-line bg-white px-5 py-3.5">
          <h2 className="text-sm font-semibold text-ink">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-ink-soft hover:bg-line/60 hover:text-ink"
            aria-label="Fermer"
          >
            <X className="size-4" />
          </button>
        </header>

        <div className="px-5 py-4">
          <BrokerFields values={values} set={set} autoFocus />
          {error && <p className="mt-4 text-sm font-medium text-rose-600">{error}</p>}
        </div>

        <footer className="sticky bottom-0 flex justify-end gap-2 border-t border-line bg-white px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-3 py-1.5 text-sm font-medium text-ink-soft hover:bg-line/60"
          >
            Annuler
          </button>
          <button
            type="button"
            disabled={!canSave}
            onClick={() => onSubmit(values)}
            className={cn(
              "rounded-md px-3.5 py-1.5 text-sm font-semibold text-white",
              canSave ? "bg-brand-600 hover:bg-brand-700" : "cursor-not-allowed bg-brand-300",
            )}
          >
            {busy ? "…" : submitLabel}
          </button>
        </footer>
      </div>
    </div>
  );
}
