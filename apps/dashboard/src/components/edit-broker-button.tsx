"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { saveBroker } from "@/lib/broker-actions";
import { brokerToValues, valuesToPatch, type BrokerEditorValues } from "@/lib/broker-form";
import type { Broker } from "@/lib/types";
import { BrokerEditor } from "./broker-editor";

/** Opens the shared editor pre-filled with the broker, then persists every field. */
export function EditBrokerButton({ broker }: { broker: Broker }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(values: BrokerEditorValues) {
    setError(null);
    startTransition(async () => {
      try {
        await saveBroker(broker.dbId!, broker.id, valuesToPatch(values));
        setOpen(false);
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
    <>
      <button
        type="button"
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
        className="inline-flex items-center gap-1.5 rounded-md border border-line bg-white px-3 py-1.5 text-sm font-medium text-ink-soft hover:border-brand-300 hover:text-brand-700"
      >
        <Pencil className="size-3.5" />
        Modifier
      </button>

      {open && (
        <BrokerEditor
          title="Modifier le courtier"
          initial={brokerToValues(broker)}
          busy={pending}
          error={error}
          submitLabel="Enregistrer"
          onSubmit={handleSubmit}
          onClose={() => !pending && setOpen(false)}
        />
      )}
    </>
  );
}
