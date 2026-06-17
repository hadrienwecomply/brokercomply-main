"use client";

import { useRef, useState } from "react";
import { Mail, X, Copy, Check } from "lucide-react";
import type { EmailTemplate } from "@/lib/types";
import { cn } from "@/lib/cn";

export function EmailModal({
  template,
  label = "Voir le modèle",
}: {
  template: EmailTemplate;
  label?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [copied, setCopied] = useState(false);

  const open = () => ref.current?.showModal();
  const close = () => ref.current?.close();

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(
        `Objet : ${template.subject}\n\n${template.body}`,
      );
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={open}
        className="inline-flex min-h-11 items-center gap-2 rounded-md bg-purple-50 px-3.5 py-2 text-sm font-medium text-purple-600 transition-colors hover:bg-purple-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500/40"
      >
        <Mail className="size-4" />
        {label}
      </button>

      <dialog
        ref={ref}
        className="w-[min(36rem,calc(100vw-2rem))] rounded-lg border border-line bg-white p-0 text-ink shadow-2xl"
        onClick={(e) => {
          if (e.target === ref.current) close();
        }}
      >
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div className="flex items-center gap-2.5">
            <span className="flex size-9 items-center justify-center rounded-md bg-purple-50 text-purple-600">
              <Mail className="size-5" />
            </span>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-st-na">
                Modèle d&apos;e-mail
              </p>
              <h3 className="font-display text-lg font-semibold leading-tight text-ink">
                {template.subject}
              </h3>
            </div>
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="Fermer"
            className="flex size-9 shrink-0 items-center justify-center rounded-md text-st-na transition-colors hover:bg-line/60 hover:text-ink"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="max-h-[55vh] overflow-y-auto px-5 py-4">
          <p className="whitespace-pre-line text-[15px] leading-relaxed text-ink-soft">
            {template.body}
          </p>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-line px-5 py-3">
          <button
            type="button"
            onClick={close}
            className="min-h-11 rounded-md px-4 text-sm font-medium text-ink-soft transition-colors hover:bg-line/60"
          >
            Fermer
          </button>
          <button
            type="button"
            onClick={copy}
            className={cn(
              "inline-flex min-h-11 items-center gap-2 rounded-md px-4 text-sm font-semibold text-white transition-colors",
              copied ? "bg-brand-600" : "bg-brand-500 hover:bg-brand-600",
            )}
          >
            {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
            {copied ? "Copié" : "Copier l'e-mail"}
          </button>
        </div>
      </dialog>
    </>
  );
}
