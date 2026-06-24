"use client";

import { useRef, useState, useTransition } from "react";
import { Mail, X, Send, AlertTriangle, Check } from "lucide-react";
import type { Broker, PlanStep, SubStep } from "@/lib/types";
import { buildEmailDraft } from "@/lib/email-draft";
import { sendStepEmail } from "@/lib/mail-actions";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/cn";

const splitAddrs = (s: string) =>
  s
    .split(/[,;]/)
    .map((a) => a.trim())
    .filter(Boolean);

/**
 * Prepare-and-send an action-plan template email. Prefills an EDITABLE preview
 * from the sub-step template + broker, warns on unresolved tokens and on
 * re-send, then sends from the shared mailbox (Reply-To = account-owner officer,
 * CC = officer). Sending is gated on `configured`.
 */
export function SendEmailModal({
  broker,
  step,
  substep,
  lastSentAt,
  configured,
  redirectTo,
}: {
  broker: Broker;
  step: PlanStep;
  substep: SubStep;
  lastSentAt: string | null;
  configured: boolean;
  /** Test-mode guard: when set, the send is redirected to this address. */
  redirectTo: string | null;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState(() => buildEmailDraft(broker, step, substep));
  const [to, setTo] = useState(draft.to.join(", "));
  const [cc, setCc] = useState(draft.cc.join(", "));
  const [subject, setSubject] = useState(draft.subject);
  const [body, setBody] = useState(draft.body);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const open = () => {
    // Re-seed from the template each time it opens.
    const fresh = buildEmailDraft(broker, step, substep);
    setDraft(fresh);
    setTo(fresh.to.join(", "));
    setCc(fresh.cc.join(", "));
    setSubject(fresh.subject);
    setBody(fresh.body);
    setError(null);
    setDone(false);
    ref.current?.showModal();
  };
  const close = () => ref.current?.close();

  const submit = () => {
    setError(null);
    startTransition(async () => {
      try {
        await sendStepEmail({
          slug: broker.id,
          stepCode: step.code,
          substepTemplateId: substep.id,
          to: splitAddrs(to),
          cc: splitAddrs(cc),
          subject,
          body,
        });
        setDone(true);
        setTimeout(close, 1200);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Échec de l'envoi");
      }
    });
  };

  return (
    <>
      <button
        type="button"
        onClick={open}
        className="inline-flex min-h-11 items-center gap-2 rounded-md bg-purple-50 px-3.5 py-2 text-sm font-medium text-purple-600 transition-colors hover:bg-purple-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500/40"
      >
        <Mail className="size-4" />
        Préparer l&apos;e-mail
        {lastSentAt && (
          <span className="ml-1 inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
            <Check className="size-3" /> {formatDate(lastSentAt)}
          </span>
        )}
      </button>

      <dialog
        ref={ref}
        className="w-[min(40rem,calc(100vw-2rem))] rounded-lg border border-line bg-white p-0 text-ink shadow-2xl"
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
                Envoyer un e-mail · {broker.societe}
              </p>
              <h3 className="font-display text-lg font-semibold leading-tight text-ink">
                {substep.title}
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

        <div className="max-h-[60vh] space-y-3 overflow-y-auto px-5 py-4">
          {redirectTo && (
            <Notice tone="warn">
              Mode test : cet e-mail sera envoyé à <strong>{redirectTo}</strong> (et non au
              courtier). Les destinataires réels figureront dans le corps du message.
            </Notice>
          )}
          {!configured && (
            <Notice tone="info">
              L&apos;envoi n&apos;est pas configuré dans cet environnement (AZURE_*). Vous pouvez
              préparer le brouillon mais pas l&apos;envoyer.
            </Notice>
          )}
          {lastSentAt && (
            <Notice tone="warn">
              Un e-mail a déjà été envoyé pour cette étape le {formatDate(lastSentAt)}. Confirmez le
              renvoi si nécessaire.
            </Notice>
          )}
          {draft.missing.length > 0 && (
            <Notice tone="warn">
              Champs non renseignés : {draft.missing.map((m) => `[${m}]`).join(", ")}. Complétez-les
              avant l&apos;envoi.
            </Notice>
          )}

          <Field label="À">
            <input
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="w-full rounded-md border border-line px-3 py-2 text-sm"
              placeholder="destinataire@exemple.be"
            />
          </Field>
          <Field label="Cc">
            <input
              value={cc}
              onChange={(e) => setCc(e.target.value)}
              className="w-full rounded-md border border-line px-3 py-2 text-sm"
            />
          </Field>
          <Field label="Objet">
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full rounded-md border border-line px-3 py-2 text-sm"
            />
          </Field>
          <Field label="Message">
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={12}
              className="w-full rounded-md border border-line px-3 py-2 text-sm leading-relaxed"
            />
          </Field>

          {error && <Notice tone="error">{error}</Notice>}
          {done && <Notice tone="success">E-mail envoyé.</Notice>}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-line px-5 py-3">
          <button
            type="button"
            onClick={close}
            className="min-h-11 rounded-md px-4 text-sm font-medium text-ink-soft transition-colors hover:bg-line/60"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={pending || done || !configured}
            className="inline-flex min-h-11 items-center gap-2 rounded-md bg-brand-500 px-4 text-sm font-semibold text-white transition-colors hover:bg-brand-600 disabled:opacity-50"
          >
            <Send className="size-4" />
            {pending ? "Envoi…" : lastSentAt ? "Renvoyer" : "Envoyer"}
          </button>
        </div>
      </dialog>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-st-na">
        {label}
      </span>
      {children}
    </label>
  );
}

function Notice({
  tone,
  children,
}: {
  tone: "info" | "warn" | "error" | "success";
  children: React.ReactNode;
}) {
  const cls = {
    info: "border-line bg-slate-50 text-ink-soft",
    warn: "border-amber-200 bg-amber-50 text-amber-800",
    error: "border-rose-200 bg-rose-50 text-rose-800",
    success: "border-emerald-200 bg-emerald-50 text-emerald-800",
  }[tone];
  return (
    <div className={cn("flex items-start gap-2 rounded-md border px-3 py-2 text-sm", cls)}>
      {(tone === "warn" || tone === "error") && (
        <AlertTriangle className="mt-0.5 size-4 shrink-0" />
      )}
      <div>{children}</div>
    </div>
  );
}
