"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import {
  FileText,
  Link2,
  Video,
  CalendarClock,
  GripVertical,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import type { PlanStep, SubStep, SubStepStatus, Support } from "@/lib/types";
import { stepStatus, daysUntil, effectiveDeadline } from "@/lib/plan";
import { STATUS_LABEL } from "@/lib/format";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/cn";
import { StatusBadge } from "./ui";
import { EmailModal } from "./email-modal";
import {
  addSubstep,
  moveSubsteps,
  removeSubstep,
  setStepDeadline,
  setSubstepStatus,
  updateSubstep,
} from "@/lib/broker-actions";

const SUPPORT_ICON: Record<Support["type"], typeof FileText> = {
  pdf: FileText,
  link: Link2,
  video: Video,
};

const STATUS_OPTIONS: SubStepStatus[] = [
  "not_started",
  "in_progress",
  "waiting_client",
  "blocked",
  "done",
];

export function StepPanel({
  slug,
  step,
  today,
}: {
  slug: string;
  step: PlanStep;
  isCurrent?: boolean;
  today: string;
}) {
  const status = stepStatus(step);
  const days = daysUntil(step.deadline, new Date(today));
  const overdue = status !== "done" && status !== "empty" && days !== null && days < 0;
  const [isPending, startTransition] = useTransition();

  // Local drag order of sub-step ids, synced when the server data changes.
  const ids = step.subSteps.map((s) => s.dbId ?? s.id);
  const [order, setOrder] = useState<string[]>(ids);
  useEffect(() => {
    setOrder(step.subSteps.map((s) => s.dbId ?? s.id));
  }, [step.subSteps]);
  const dragId = useRef<string | null>(null);

  const byId = new Map(step.subSteps.map((s) => [s.dbId ?? s.id, s]));
  const orderedSubs = order.map((id) => byId.get(id)).filter(Boolean) as SubStep[];

  const run = (fn: () => Promise<unknown>) => startTransition(() => void fn());

  const onDrop = (targetId: string) => {
    const from = dragId.current;
    dragId.current = null;
    if (!from || from === targetId) return;
    const next = [...order];
    const fromIdx = next.indexOf(from);
    const toIdx = next.indexOf(targetId);
    if (fromIdx < 0 || toIdx < 0) return;
    next.splice(toIdx, 0, next.splice(fromIdx, 1)[0]!);
    setOrder(next);
    if (step.dbId) run(() => moveSubsteps(slug, step.dbId!, next));
  };

  return (
    <section className={cn("rounded-lg border border-line bg-white", isPending && "opacity-90")}>
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line px-6 py-5">
        <span className="font-mono text-base font-semibold text-brand-600">{step.code}</span>
        <h2 className="font-display text-2xl font-semibold text-ink">{step.title}</h2>
        <div className="ml-auto flex items-center gap-3">
          <SectionDeadline slug={slug} step={step} overdue={overdue} days={days} />
          <StatusBadge status={status} />
        </div>
      </header>

      <div className="divide-y divide-line">
        {orderedSubs.map((sub) => (
          <TaskRow
            key={sub.dbId ?? sub.id}
            slug={slug}
            sub={sub}
            today={today}
            sectionDeadline={step.deadline}
            run={run}
            onDragStart={() => (dragId.current = sub.dbId ?? sub.id)}
            onDrop={() => onDrop(sub.dbId ?? sub.id)}
          />
        ))}
        {orderedSubs.length === 0 && (
          <p className="px-6 py-6 text-sm text-st-na">
            Aucune tâche dans cette section. Ajoutez-en une ci-dessous.
          </p>
        )}
      </div>

      <div className="border-t border-line px-6 py-4">
        <button
          type="button"
          disabled={!step.dbId || isPending}
          onClick={() => step.dbId && run(() => addSubstep(slug, step.dbId!, { title: "Nouvelle tâche" }))}
          className="inline-flex min-h-11 items-center gap-2 rounded-md border border-dashed border-line px-3.5 py-2 text-sm font-medium text-ink-soft transition-colors hover:border-brand-400 hover:text-brand-700 disabled:opacity-50"
        >
          <Plus className="size-4" />
          Ajouter une tâche
        </button>
      </div>
    </section>
  );
}

function SectionDeadline({
  slug,
  step,
  overdue,
  days,
}: {
  slug: string;
  step: PlanStep;
  overdue: boolean;
  days: number | null;
}) {
  const [editing, setEditing] = useState(false);
  const [, startTransition] = useTransition();
  const save = (value: string | null) =>
    startTransition(() => {
      if (step.dbId) void setStepDeadline(slug, step.dbId, value);
      setEditing(false);
    });

  if (editing) {
    return (
      <span className="inline-flex items-center gap-1.5">
        <input
          type="date"
          autoFocus
          defaultValue={step.deadlineOverride ?? step.deadline ?? ""}
          onBlur={(e) => save(e.target.value || null)}
          onKeyDown={(e) => {
            if (e.key === "Enter") save((e.target as HTMLInputElement).value || null);
            if (e.key === "Escape") setEditing(false);
          }}
          className="rounded-md border border-line px-2 py-1 text-sm text-ink"
        />
        {step.deadlineOverride && (
          <button
            type="button"
            onClick={() => save(null)}
            className="text-xs text-st-na underline hover:text-ink"
          >
            réinitialiser
          </button>
        )}
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      title="Modifier l'échéance de la section"
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-sm transition-colors hover:bg-line/50",
        overdue ? "font-semibold text-st-blocked" : "text-ink-soft",
      )}
    >
      <CalendarClock className="size-4" />
      {step.deadline
        ? overdue
          ? `En retard de ${Math.abs(days!)} j`
          : `Échéance ${formatDate(step.deadline)}`
        : "Définir une échéance"}
      {step.deadlineOverride && <span className="text-xs text-brand-600">(manuel)</span>}
    </button>
  );
}

function TaskRow({
  slug,
  sub,
  today,
  sectionDeadline,
  run,
  onDragStart,
  onDrop,
}: {
  slug: string;
  sub: SubStep;
  today: string;
  sectionDeadline?: string;
  run: (fn: () => Promise<unknown>) => void;
  onDragStart: () => void;
  onDrop: () => void;
}) {
  const id = sub.dbId ?? sub.id;
  const due = effectiveDeadline({ deadline: sectionDeadline } as PlanStep, sub);
  const dueDays = daysUntil(due, new Date(today));
  const dueOverdue = sub.status !== "done" && dueDays !== null && dueDays < 0;
  const [title, setTitle] = useState(sub.title);
  useEffect(() => setTitle(sub.title), [sub.title]);

  return (
    <div
      className="flex items-start gap-3 px-6 py-5"
      draggable
      onDragStart={onDragStart}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
    >
      <span className="mt-1 cursor-grab text-st-na/70 active:cursor-grabbing" title="Glisser pour réordonner">
        <GripVertical className="size-5" />
      </span>

      <div className="flex-1">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => title.trim() && title !== sub.title && run(() => updateSubstep(slug, id, { title: title.trim() }))}
            onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
            className="min-w-[12rem] flex-1 rounded-md border border-transparent px-1.5 py-1 text-lg font-medium text-ink hover:border-line focus:border-brand-400 focus:outline-none"
          />
          {sub.isCustom && (
            <span className="rounded-pill bg-brand-50 px-2 py-0.5 text-[11px] font-medium text-brand-700">
              custom
            </span>
          )}

          <select
            value={sub.status}
            onChange={(e) => run(() => setSubstepStatus(slug, id, e.target.value))}
            className="rounded-md border border-line bg-white px-2 py-1 text-sm text-ink focus:border-brand-400 focus:outline-none"
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>

          <label className="inline-flex items-center gap-1.5 text-sm text-ink-soft">
            <CalendarClock className={cn("size-4", dueOverdue && "text-st-blocked")} />
            <input
              type="date"
              defaultValue={sub.dueDate ?? ""}
              onChange={(e) => run(() => updateSubstep(slug, id, { dueDate: e.target.value || null }))}
              className="rounded-md border border-line px-2 py-1 text-sm text-ink"
              title="Échéance de la tâche (sinon hérite de la section)"
            />
          </label>

          <EmailEditor slug={slug} sub={sub} run={run} />

          <button
            type="button"
            onClick={() => run(() => removeSubstep(slug, id))}
            aria-label="Supprimer la tâche"
            title="Supprimer (archiver)"
            className="ml-auto flex size-9 items-center justify-center rounded-md text-st-na transition-colors hover:bg-rose-50 hover:text-rose-600"
          >
            <Trash2 className="size-4" />
          </button>
        </div>

        {sub.actions && sub.actions.length > 0 && (
          <ul className="mt-3 space-y-1.5 pl-1">
            {sub.actions.map((action, i) => (
              <li key={i} className="flex items-start gap-2 text-base leading-snug text-ink-soft">
                <span className="mt-2 size-1.5 shrink-0 rounded-full bg-st-na" aria-hidden />
                {action}
              </li>
            ))}
          </ul>
        )}

        {(sub.emailTemplate || sub.supports?.length) && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {sub.emailTemplate && <EmailModal template={sub.emailTemplate} />}
            {sub.supports?.map((s, i) => {
              const Icon = SUPPORT_ICON[s.type];
              return (
                <span
                  key={i}
                  className="inline-flex min-h-11 items-center gap-2 rounded-md border border-line px-3 py-2 text-sm text-ink-soft"
                >
                  <Icon className="size-4 text-st-na" />
                  {s.label}
                </span>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function EmailEditor({
  slug,
  sub,
  run,
}: {
  slug: string;
  sub: SubStep;
  run: (fn: () => Promise<unknown>) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = sub.dbId ?? sub.id;
  const [subject, setSubject] = useState(sub.emailTemplate?.subject ?? "");
  const [body, setBody] = useState(sub.emailTemplate?.body ?? "");

  const open = () => {
    setSubject(sub.emailTemplate?.subject ?? "");
    setBody(sub.emailTemplate?.body ?? "");
    ref.current?.showModal();
  };
  const save = () => {
    run(() => updateSubstep(slug, id, { emailSubject: subject || null, emailBody: body || null }));
    ref.current?.close();
  };

  return (
    <>
      <button
        type="button"
        onClick={open}
        className="text-sm font-medium text-purple-600 underline-offset-2 hover:underline"
      >
        {sub.emailTemplate ? "Modifier l'e-mail" : "Ajouter un e-mail"}
      </button>
      <dialog
        ref={ref}
        className="w-[min(38rem,calc(100vw-2rem))] rounded-lg border border-line bg-white p-0 text-ink shadow-2xl"
        onClick={(e) => e.target === ref.current && ref.current?.close()}
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h3 className="font-display text-lg font-semibold text-ink">Modèle d&apos;e-mail</h3>
          <button
            type="button"
            onClick={() => ref.current?.close()}
            aria-label="Fermer"
            className="flex size-9 items-center justify-center rounded-md text-st-na hover:bg-line/60 hover:text-ink"
          >
            <X className="size-5" />
          </button>
        </div>
        <div className="space-y-3 px-5 py-4">
          <label className="block">
            <span className="text-xs font-medium uppercase tracking-wide text-st-na">Objet</span>
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="mt-1 w-full rounded-md border border-line px-3 py-2 text-sm text-ink focus:border-brand-400 focus:outline-none"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium uppercase tracking-wide text-st-na">Corps</span>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={10}
              className="mt-1 w-full rounded-md border border-line px-3 py-2 text-sm leading-relaxed text-ink focus:border-brand-400 focus:outline-none"
            />
          </label>
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-line px-5 py-3">
          <button
            type="button"
            onClick={() => ref.current?.close()}
            className="min-h-11 rounded-md px-4 text-sm font-medium text-ink-soft hover:bg-line/60"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={save}
            className="min-h-11 rounded-md bg-brand-500 px-4 text-sm font-semibold text-white hover:bg-brand-600"
          >
            Enregistrer
          </button>
        </div>
      </dialog>
    </>
  );
}
