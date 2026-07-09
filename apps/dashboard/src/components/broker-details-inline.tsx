"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown } from "lucide-react";
import { saveBroker } from "@/lib/broker-actions";
import { brokerToValues, valuesToPatch, type BrokerEditorValues } from "@/lib/broker-form";
import type { Broker } from "@/lib/types";
import { cn } from "@/lib/cn";
import { BrokerFields } from "./broker-fields";
import { BrokerColorPicker } from "./broker-color-picker";

/**
 * Inline, always-available editable "Détails" section for a broker — replaces the
 * modal that was previously gated behind a "Modifier" button. Collapsed by
 * default; expands in place. Saves every field via the shared `saveBroker` action
 * (same validation, including the unique-BCE guard).
 */
export function BrokerDetailsInline({ broker }: { broker: Broker }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<BrokerEditorValues>(() => brokerToValues(broker));
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  const set = (patch: Partial<BrokerEditorValues>) => {
    setValues((v) => ({ ...v, ...patch }));
    setSaved(false);
  };
  const canSave = values.societe.trim().length > 0 && !pending;

  function handleSave() {
    setError(null);
    startTransition(async () => {
      try {
        await saveBroker(broker.dbId!, broker.id, valuesToPatch(values));
        setSaved(true);
        router.refresh();
      } catch (e) {
        setError(
          e instanceof Error && /unique|duplicate/i.test(e.message)
            ? "Un courtier avec ce BCE existe déjà."
            : "L'enregistrement a échoué. Réessaie.",
        );
      }
    });
  }

  return (
    <div className="rounded-lg border border-line bg-white">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-6 py-4 text-left"
      >
        <span className="text-sm font-semibold text-ink">Détails du courtier</span>
        <ChevronDown
          className={cn("size-4 text-ink-soft transition-transform", open && "rotate-180")}
        />
      </button>

      {open && (
        <div className="border-t border-line px-6 py-5">
          <div className="mb-5">
            <span className="mb-1 block text-xs font-medium text-ink-soft">
              Couleur primaire
            </span>
            <BrokerColorPicker
              brokerId={broker.dbId!}
              slug={broker.id}
              value={broker.primaryColor}
            />
          </div>
          <BrokerFields values={values} set={set} />
          <div className="mt-5 flex items-center gap-3">
            <button
              type="button"
              disabled={!canSave}
              onClick={handleSave}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-sm font-semibold text-white",
                canSave ? "bg-brand-600 hover:bg-brand-700" : "cursor-not-allowed bg-brand-300",
              )}
            >
              {pending ? "…" : "Enregistrer"}
            </button>
            {saved && !pending && (
              <span className="inline-flex items-center gap-1 text-sm font-medium text-emerald-600">
                <Check className="size-4" /> Enregistré
              </span>
            )}
            {error && <span className="text-sm font-medium text-rose-600">{error}</span>}
          </div>
        </div>
      )}
    </div>
  );
}
