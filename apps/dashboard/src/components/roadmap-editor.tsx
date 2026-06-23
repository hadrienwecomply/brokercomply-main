"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";
import {
  ROADMAP_COLUMNS,
  ROADMAP_THEMES,
  type RoadmapStatus,
} from "@/lib/roadmap-types";

export interface EditorValues {
  title: string;
  description: string;
  theme: string;
  status: RoadmapStatus;
}

export function RoadmapEditor({
  title,
  initial,
  busy,
  onSubmit,
  onClose,
}: {
  title: string;
  initial: EditorValues;
  busy?: boolean;
  onSubmit: (values: EditorValues) => void;
  onClose: () => void;
}) {
  const [values, setValues] = useState<EditorValues>(initial);
  const canSave = values.title.trim().length > 0 && !busy;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-lg border border-line bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-line px-5 py-3.5">
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
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-ink-soft">Titre</span>
            <input
              autoFocus
              value={values.title}
              onChange={(e) => setValues((v) => ({ ...v, title: e.target.value }))}
              onKeyDown={(e) => {
                if (e.key === "Enter" && canSave) onSubmit(values);
              }}
              className="w-full rounded-md border border-line px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
              placeholder="Ex. Intégration BCE/UBO"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-ink-soft">Description</span>
            <textarea
              value={values.description}
              onChange={(e) => setValues((v) => ({ ...v, description: e.target.value }))}
              rows={3}
              className="w-full resize-none rounded-md border border-line px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
              placeholder="Détaille l'idée…"
            />
          </label>

          <div className="grid grid-cols-2 gap-4">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-ink-soft">Thème</span>
              <select
                value={values.theme}
                onChange={(e) => setValues((v) => ({ ...v, theme: e.target.value }))}
                className="w-full rounded-md border border-line px-3 py-2 text-sm outline-none focus:border-brand-500"
              >
                {ROADMAP_THEMES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-1 block text-xs font-medium text-ink-soft">Colonne</span>
              <select
                value={values.status}
                onChange={(e) =>
                  setValues((v) => ({ ...v, status: e.target.value as RoadmapStatus }))
                }
                className="w-full rounded-md border border-line px-3 py-2 text-sm outline-none focus:border-brand-500"
              >
                {ROADMAP_COLUMNS.map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        <footer className="flex justify-end gap-2 border-t border-line px-5 py-3">
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
            {busy ? "…" : "Enregistrer"}
          </button>
        </footer>
      </div>
    </div>
  );
}
