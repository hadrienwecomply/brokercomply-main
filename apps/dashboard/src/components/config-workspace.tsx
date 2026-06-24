"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { CalendarClock, GripVertical, ListChecks, Plus, Trash2, X } from "lucide-react";
import { cn } from "@/lib/cn";
import {
  addTemplateTask,
  moveTemplateTasks,
  removeTemplateTask,
  saveStepOffset,
  updateTemplateTask,
} from "@/lib/broker-actions";

export interface OffsetRow {
  code: string;
  title: string;
  offsetDays: number;
  position: number;
}
export interface TaskRow {
  id: string;
  stepCode: string;
  title: string;
  emailSubject: string | null;
  emailBody: string | null;
  position: number;
}

type Tab = "deadlines" | "tasks";

export function ConfigWorkspace({
  offsets,
  tasks,
}: {
  offsets: OffsetRow[];
  tasks: TaskRow[];
}) {
  const [tab, setTab] = useState<Tab>("deadlines");
  return (
    <div className="space-y-5">
      <div className="flex gap-1 border-b border-line">
        <TabButton active={tab === "deadlines"} onClick={() => setTab("deadlines")} icon={CalendarClock}>
          Échéances
        </TabButton>
        <TabButton active={tab === "tasks"} onClick={() => setTab("tasks")} icon={ListChecks}>
          Template de tâches
        </TabButton>
      </div>
      {tab === "deadlines" ? (
        <DeadlinesTab offsets={offsets} />
      ) : (
        <TasksTab offsets={offsets} tasks={tasks} />
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon: Icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof CalendarClock;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "-mb-px inline-flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors",
        active
          ? "border-brand-500 text-brand-700"
          : "border-transparent text-ink-soft hover:text-ink",
      )}
    >
      <Icon className="size-4" />
      {children}
    </button>
  );
}

// --------------------------------------------------------------------- Échéances

function DeadlinesTab({ offsets }: { offsets: OffsetRow[] }) {
  const ordered = [...offsets].sort((a, b) => a.position - b.position);
  return (
    <div className="rounded-lg border border-line bg-white">
      <div className="border-b border-line px-5 py-4">
        <p className="text-sm text-ink-soft">
          Échéance d&apos;une section = <span className="font-medium text-ink">date de signature + N jours</span>.
          Réglez N par section ; vous pouvez surcharger une date à la main sur chaque courtier.
        </p>
      </div>
      <ul className="divide-y divide-line">
        {ordered.map((o) => (
          <OffsetItem key={o.code} row={o} />
        ))}
      </ul>
    </div>
  );
}

function OffsetItem({ row }: { row: OffsetRow }) {
  const [value, setValue] = useState(String(row.offsetDays));
  const [isPending, startTransition] = useTransition();
  useEffect(() => setValue(String(row.offsetDays)), [row.offsetDays]);

  const save = () => {
    const n = Math.max(0, Math.round(Number(value)));
    if (!Number.isFinite(n) || n === row.offsetDays) return;
    startTransition(() => void saveStepOffset(row.code, n));
  };

  return (
    <li className={cn("flex items-center gap-4 px-5 py-3.5", isPending && "opacity-70")}>
      <span className="font-mono text-sm font-semibold text-brand-600">{row.code}</span>
      <span className="flex-1 text-sm text-ink">{row.title}</span>
      <span className="text-xs text-st-na">signature +</span>
      <input
        type="number"
        min={0}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        className="w-20 rounded-md border border-line px-2 py-1 text-right text-sm text-ink focus:border-brand-400 focus:outline-none"
      />
      <span className="w-10 text-xs text-st-na">jours</span>
    </li>
  );
}

// ---------------------------------------------------------------- Template tâches

function TasksTab({ offsets, tasks }: { offsets: OffsetRow[]; tasks: TaskRow[] }) {
  const ordered = [...offsets].sort((a, b) => a.position - b.position);
  return (
    <div className="space-y-4">
      {ordered.map((o) => (
        <SectionTasks
          key={o.code}
          section={o}
          tasks={tasks.filter((t) => t.stepCode === o.code).sort((a, b) => a.position - b.position)}
        />
      ))}
    </div>
  );
}

function SectionTasks({ section, tasks }: { section: OffsetRow; tasks: TaskRow[] }) {
  const [isPending, startTransition] = useTransition();
  const run = (fn: () => Promise<unknown>) => startTransition(() => void fn());

  const [order, setOrder] = useState<string[]>(tasks.map((t) => t.id));
  useEffect(() => setOrder(tasks.map((t) => t.id)), [tasks]);
  const dragId = useRef<string | null>(null);
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const ordered = order.map((id) => byId.get(id)).filter(Boolean) as TaskRow[];

  const onDrop = (targetId: string) => {
    const from = dragId.current;
    dragId.current = null;
    if (!from || from === targetId) return;
    const next = [...order];
    const f = next.indexOf(from);
    const t = next.indexOf(targetId);
    if (f < 0 || t < 0) return;
    next.splice(t, 0, next.splice(f, 1)[0]!);
    setOrder(next);
    run(() => moveTemplateTasks(next));
  };

  return (
    <section className={cn("rounded-lg border border-line bg-white", isPending && "opacity-90")}>
      <header className="flex items-center gap-3 border-b border-line px-5 py-3.5">
        <span className="font-mono text-sm font-semibold text-brand-600">{section.code}</span>
        <h2 className="font-display text-lg font-semibold text-ink">{section.title}</h2>
        <span className="ml-auto text-xs text-st-na">{ordered.length} tâche(s)</span>
      </header>
      <ul className="divide-y divide-line">
        {ordered.map((t) => (
          <TemplateTaskItem
            key={t.id}
            task={t}
            run={run}
            onDragStart={() => (dragId.current = t.id)}
            onDrop={() => onDrop(t.id)}
          />
        ))}
      </ul>
      <div className="border-t border-line px-5 py-3">
        <button
          type="button"
          onClick={() => run(() => addTemplateTask(section.code, { title: "Nouvelle tâche" }))}
          className="inline-flex min-h-11 items-center gap-2 rounded-md border border-dashed border-line px-3.5 py-2 text-sm font-medium text-ink-soft transition-colors hover:border-brand-400 hover:text-brand-700"
        >
          <Plus className="size-4" />
          Ajouter une tâche
        </button>
      </div>
    </section>
  );
}

function TemplateTaskItem({
  task,
  run,
  onDragStart,
  onDrop,
}: {
  task: TaskRow;
  run: (fn: () => Promise<unknown>) => void;
  onDragStart: () => void;
  onDrop: () => void;
}) {
  const [title, setTitle] = useState(task.title);
  useEffect(() => setTitle(task.title), [task.title]);

  return (
    <li
      className="flex items-center gap-3 px-5 py-3"
      draggable
      onDragStart={onDragStart}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
    >
      <span className="cursor-grab text-st-na/70 active:cursor-grabbing" title="Glisser pour réordonner">
        <GripVertical className="size-5" />
      </span>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={() => title.trim() && title !== task.title && run(() => updateTemplateTask(task.id, { title: title.trim() }))}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        className="flex-1 rounded-md border border-transparent px-1.5 py-1 text-sm text-ink hover:border-line focus:border-brand-400 focus:outline-none"
      />
      <TemplateEmailEditor task={task} run={run} />
      <button
        type="button"
        onClick={() => run(() => removeTemplateTask(task.id))}
        aria-label="Supprimer la tâche"
        title="Supprimer (archiver)"
        className="flex size-9 items-center justify-center rounded-md text-st-na transition-colors hover:bg-rose-50 hover:text-rose-600"
      >
        <Trash2 className="size-4" />
      </button>
    </li>
  );
}

function TemplateEmailEditor({
  task,
  run,
}: {
  task: TaskRow;
  run: (fn: () => Promise<unknown>) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [subject, setSubject] = useState(task.emailSubject ?? "");
  const [body, setBody] = useState(task.emailBody ?? "");
  const hasEmail = Boolean(task.emailSubject || task.emailBody);

  const open = () => {
    setSubject(task.emailSubject ?? "");
    setBody(task.emailBody ?? "");
    ref.current?.showModal();
  };
  const save = () => {
    run(() => updateTemplateTask(task.id, { emailSubject: subject || null, emailBody: body || null }));
    ref.current?.close();
  };

  return (
    <>
      <button
        type="button"
        onClick={open}
        className="text-xs font-medium text-purple-600 underline-offset-2 hover:underline"
      >
        {hasEmail ? "E-mail ✓" : "E-mail"}
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
