"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { addBroker } from "@/lib/broker-actions";
import { EMPTY_BROKER, valuesToCreateInput, type BrokerEditorValues } from "@/lib/broker-form";
import { BrokerEditor } from "./broker-editor";

export function NewBrokerButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(values: BrokerEditorValues) {
    setError(null);
    startTransition(async () => {
      try {
        const broker = await addBroker(valuesToCreateInput(values));
        setOpen(false);
        router.push(`/courtiers/${broker.id}`);
      } catch (e) {
        setError(
          e instanceof Error && /unique|duplicate/i.test(e.message)
            ? "Un courtier avec ce nom ou ce BCE existe déjà."
            : "La création a échoué. Réessaie.",
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
        className="inline-flex items-center gap-1.5 rounded-md bg-brand-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-brand-700"
      >
        <Plus className="size-4" />
        Nouveau courtier
      </button>

      {open && (
        <BrokerEditor
          title="Nouveau courtier"
          initial={EMPTY_BROKER}
          busy={pending}
          error={error}
          submitLabel="Créer le courtier"
          onSubmit={handleSubmit}
          onClose={() => !pending && setOpen(false)}
        />
      )}
    </>
  );
}
