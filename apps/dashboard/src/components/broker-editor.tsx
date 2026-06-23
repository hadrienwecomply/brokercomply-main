"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";
import { OFFICER_OPTIONS } from "@/lib/officers";
import type { BrokerEditorValues } from "@/lib/broker-form";

export type { BrokerEditorValues } from "@/lib/broker-form";
export { EMPTY_BROKER } from "@/lib/broker-form";

const LANGUAGES = ["FR", "NL", "EN"];
const SIZES = ["1", "2-5", "6-10", "11-20", "21-50", "51+"];
const PRODUCTS = ["BrokerComply", "EstateComply"];
const STATUSES: { key: string; label: string }[] = [
  { key: "onboarding", label: "Onboarding" },
  { key: "active", label: "Actif" },
  { key: "at_risk", label: "À risque" },
  { key: "inactive", label: "Inactif" },
];

const inputCls =
  "w-full rounded-md border border-line px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500";

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-ink-soft">{label}</span>
      {children}
    </label>
  );
}

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

        <div className="space-y-4 px-5 py-4">
          <Field label="Société *">
            <input
              autoFocus
              value={values.societe}
              onChange={(e) => set({ societe: e.target.value })}
              className={inputCls}
              placeholder="Ex. Elite Broker"
            />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Personne de contact">
              <input
                value={values.contact}
                onChange={(e) => set({ contact: e.target.value })}
                className={inputCls}
                placeholder="Ex. Damien Hermand"
              />
            </Field>
            <Field label="Téléphone">
              <input
                value={values.phone}
                onChange={(e) => set({ phone: e.target.value })}
                className={inputCls}
                placeholder="+32 …"
              />
            </Field>
          </div>

          <Field label="E-mail(s) — séparés par une virgule">
            <textarea
              value={values.emails}
              onChange={(e) => set({ emails: e.target.value })}
              rows={2}
              className={cn(inputCls, "resize-none")}
              placeholder="damien@elitefund.info, contact@…"
            />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Site web">
              <input
                value={values.website}
                onChange={(e) => set({ website: e.target.value })}
                className={inputCls}
                placeholder="https://…"
              />
            </Field>
            <Field label="Ville">
              <input
                value={values.city}
                onChange={(e) => set({ city: e.target.value })}
                className={inputCls}
              />
            </Field>
          </div>

          <Field label="Adresse">
            <input
              value={values.address}
              onChange={(e) => set({ address: e.target.value })}
              className={inputCls}
              placeholder="Rue, n°, code postal"
            />
          </Field>

          <Field label="LinkedIn">
            <input
              value={values.linkedinUrl}
              onChange={(e) => set({ linkedinUrl: e.target.value })}
              className={inputCls}
              placeholder="https://www.linkedin.com/company/…"
            />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="N° BCE">
              <input
                value={values.bce}
                onChange={(e) => set({ bce: e.target.value })}
                className={inputCls}
                placeholder="BE 0123.456.789"
              />
            </Field>
            <Field label="N° d'agrément FSMA/IPI">
              <input
                value={values.fsmaNumber}
                onChange={(e) => set({ fsmaNumber: e.target.value })}
                className={inputCls}
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Pays — séparés par une virgule">
              <input
                value={values.countries}
                onChange={(e) => set({ countries: e.target.value })}
                className={inputCls}
                placeholder="BE, LU"
              />
            </Field>
            <Field label="Langue">
              <select
                value={values.language}
                onChange={(e) => set({ language: e.target.value })}
                className={inputCls}
              >
                {LANGUAGES.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <Field label="Taille">
              <select
                value={values.sizeBucket}
                onChange={(e) => set({ sizeBucket: e.target.value })}
                className={inputCls}
              >
                <option value="">—</option>
                {SIZES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Produit">
              <select
                value={values.product}
                onChange={(e) => set({ product: e.target.value })}
                className={inputCls}
              >
                {PRODUCTS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Statut">
              <select
                value={values.status}
                onChange={(e) => set({ status: e.target.value })}
                className={inputCls}
              >
                {STATUSES.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="MRR (€/mois)">
              <input
                inputMode="decimal"
                value={values.mrr}
                onChange={(e) => set({ mrr: e.target.value })}
                className={inputCls}
                placeholder="250"
              />
            </Field>
            <Field label="Date de signature">
              <input
                type="date"
                value={values.signatureDate}
                onChange={(e) => set({ signatureDate: e.target.value })}
                className={inputCls}
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Responsable du compte">
              <select
                value={values.accountOwner}
                onChange={(e) => set({ accountOwner: e.target.value })}
                className={inputCls}
              >
                <option value="">—</option>
                {OFFICER_OPTIONS.map((o) => (
                  <option key={o.email} value={o.email}>
                    {o.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Dernier contact">
              <input
                type="date"
                value={values.lastContactDate}
                onChange={(e) => set({ lastContactDate: e.target.value })}
                className={inputCls}
              />
            </Field>
          </div>

          {error && <p className="text-sm font-medium text-rose-600">{error}</p>}
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
