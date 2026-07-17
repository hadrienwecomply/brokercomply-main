"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CalendarX2,
  Check,
  ChevronDown,
  History,
  Phone,
  PhoneMissed,
  RefreshCw,
  RotateCcw,
  Search,
  X,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { formatDate, formatEur } from "@/lib/format";
import { officerName } from "@/lib/officers";
import {
  anyPhone,
  LOST_REASON_LABEL,
  NO_LIST_LABEL,
  PIPELINE_COLUMNS,
  primaryContact,
  taskGroup,
  TASK_GROUPS,
  TASK_OUTCOME_LABEL,
  type PipelineStage,
  type ProspectDTO,
  type TaskDTO,
} from "@/lib/prospects-types";
import {
  finishTask,
  movePipeline,
  runTick,
  savePhone,
  undoTask,
} from "@/lib/prospects-actions";

type View = "taches" | "pipeline";

export function SuiviCommercialBoard({
  prospects: initialProspects,
  tasksOpen,
  tasksRecent,
  me,
}: {
  prospects: ProspectDTO[];
  tasksOpen: TaskDTO[];
  tasksRecent: TaskDTO[];
  me: string;
}) {
  const [prospects, setProspects] = useState(initialProspects);
  const [open, setOpen] = useState(tasksOpen);
  const [recent, setRecent] = useState(tasksRecent);
  const [view, setView] = useState<View>("taches");
  const [group, setGroup] = useState("all");
  const [mineOnly, setMineOnly] = useState(false);
  const [query, setQuery] = useState("");
  const [listFilter, setListFilter] = useState(""); // "" = all, NO_LIST_LABEL = untagged
  const [ticking, setTicking] = useState(false);
  const [, startTransition] = useTransition();

  const byId = useMemo(() => new Map(prospects.map((p) => [p.id, p])), [prospects]);

  // Distinct import lists across all prospects, for the toolbar filter.
  const allLists = useMemo(() => {
    const set = new Set<string>();
    let hasUntagged = false;
    for (const p of prospects) {
      if (p.lists.length === 0) hasUntagged = true;
      else for (const l of p.lists) set.add(l);
    }
    const sorted = [...set].sort((a, b) => a.localeCompare(b));
    return hasUntagged ? [...sorted, NO_LIST_LABEL] : sorted;
  }, [prospects]);

  const matchesList = (p: ProspectDTO | undefined) =>
    !listFilter ||
    (p != null &&
      (listFilter === NO_LIST_LABEL ? p.lists.length === 0 : p.lists.includes(listFilter)));

  const q = query.trim().toLowerCase();
  const matchesQuery = (p: ProspectDTO | undefined) =>
    !q ||
    (p &&
      (p.societe.toLowerCase().includes(q) ||
        p.contacts.some(
          (c) => c.name?.toLowerCase().includes(q) || c.email?.toLowerCase().includes(q),
        )));

  const visibleTasks = useMemo(
    () =>
      open.filter(
        (t) =>
          (group === "all" || taskGroup(t) === group) &&
          (!mineOnly || t.assignee === me) &&
          matchesList(byId.get(t.prospectId)) &&
          matchesQuery(byId.get(t.prospectId)),
      ),
    [open, group, mineOnly, me, q, listFilter, byId],
  );

  const groupCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const t of open) {
      counts.set("all", (counts.get("all") ?? 0) + 1);
      counts.set(taskGroup(t), (counts.get(taskGroup(t)) ?? 0) + 1);
    }
    return counts;
  }, [open]);

  const missingPhone = useMemo(
    () =>
      open.filter((t) => t.type === "call" && !anyPhone(byId.get(t.prospectId) ?? emptyP))
        .length,
    [open, byId],
  );

  function patchProspect(id: string, changes: Partial<ProspectDTO>) {
    setProspects((prev) => prev.map((p) => (p.id === id ? { ...p, ...changes } : p)));
  }

  /** Optimistic completion: move the task to the "done" strip immediately. */
  function complete(
    task: TaskDTO,
    outcome: string,
    extra?: { followUpDueAt?: Date; rebookedMeetingAt?: Date },
  ) {
    const p = byId.get(task.prospectId);
    const doneTask: TaskDTO = {
      ...task,
      status: "done",
      outcome,
      completedBy: me,
      completedAt: new Date().toISOString(),
    };
    setOpen((prev) =>
      prev.filter(
        (t) =>
          t.id !== task.id &&
          // terminal call outcomes also cancel the sibling cadence tasks
          !(
            ["signed", "not_interested", "reachable", "callback"].includes(outcome) &&
            task.type === "call" &&
            t.prospectId === task.prospectId &&
            t.cadenceKey !== null
          ),
      ),
    );
    setRecent((prev) => [doneTask, ...prev]);
    if (outcome === "signed") patchProspect(task.prospectId, { pipelineStage: "won" });
    if (outcome === "not_interested")
      patchProspect(task.prospectId, {
        pipelineStage: "lost",
        lostReason: "not_interested",
      });
    if (outcome === "rebooked")
      patchProspect(task.prospectId, { pipelineStage: "demo_planned", noShow: false });

    startTransition(() =>
      finishTask(task.id, {
        prospectId: task.prospectId,
        outcome,
        ...(extra?.followUpDueAt
          ? {
              followUp: {
                title: `Rappeler ${p?.societe ?? ""}`.trim(),
                dueAt: extra.followUpDueAt.toISOString(),
              },
            }
          : {}),
        ...(extra?.rebookedMeetingAt
          ? { rebookedMeetingAt: extra.rebookedMeetingAt.toISOString() }
          : {}),
      }),
    );
  }

  function undo(task: TaskDTO) {
    setRecent((prev) => prev.filter((t) => t.id !== task.id));
    setOpen((prev) => [{ ...task, status: "open", outcome: null }, ...prev]);
    startTransition(() => undoTask(task.id, task.prospectId));
  }

  function onPhoneSaved(prospectId: string, phone: string) {
    const p = byId.get(prospectId);
    if (p) {
      const contacts =
        p.contacts.length > 0
          ? p.contacts.map((c, i) => (c.isPrimary || i === 0 ? { ...c, phone } : c))
          : [{ id: "new", name: null, email: null, phone, role: null, linkedin: null, isPrimary: true }];
      patchProspect(prospectId, { contacts });
    }
    startTransition(() => savePhone(prospectId, phone));
  }

  function onMove(p: ProspectDTO, stage: PipelineStage) {
    patchProspect(p.id, {
      pipelineStage: stage,
      lostReason: stage === "lost" ? "other" : null,
    });
    startTransition(() => movePipeline(p.id, stage));
  }

  function onTick() {
    setTicking(true);
    startTransition(async () => {
      await runTick();
      window.location.reload();
    });
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex rounded-lg border border-line bg-white p-0.5">
          <ViewTab active={view === "taches"} onClick={() => setView("taches")}>
            Tâches
            <Count tone={open.length > 0 ? "alert" : "muted"}>{open.length}</Count>
          </ViewTab>
          <ViewTab active={view === "pipeline"} onClick={() => setView("pipeline")}>
            Pipeline
            <Count tone="muted">{prospects.length}</Count>
          </ViewTab>
        </div>

        <label className="relative min-w-52 max-w-sm flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-st-na" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher une agence, un contact…"
            className="w-full rounded-lg border border-line bg-white py-1.5 pl-8 pr-3 text-sm text-ink placeholder:text-st-na focus:border-brand-500 focus:outline-none"
          />
        </label>

        {allLists.length > 0 && (
          <select
            value={listFilter}
            onChange={(e) => setListFilter(e.target.value)}
            className="rounded-lg border border-line bg-white px-2.5 py-1.5 text-sm text-ink focus:border-brand-500 focus:outline-none"
            aria-label="Filtrer par liste"
          >
            <option value="">Toutes les listes</option>
            {allLists.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        )}

        {missingPhone > 0 && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#fdf1da] px-2.5 py-1 text-xs font-medium text-[#8a5300] ring-1 ring-inset ring-[#f0ad4e]/55">
            <PhoneMissed className="size-3.5" />
            {missingPhone} numéro{missingPhone > 1 ? "s" : ""} à ajouter
          </span>
        )}

        <button
          onClick={onTick}
          disabled={ticking}
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-line bg-white px-2.5 py-1.5 text-xs font-medium text-ink-soft hover:bg-line/40 disabled:opacity-50"
          title="Recalculer les cadences et générer les tâches dues"
        >
          <RefreshCw className={cn("size-3.5", ticking && "animate-spin")} />
          Recalculer
        </button>
      </div>

      {view === "taches" ? (
        <>
          {/* Group chips + mine filter */}
          <div className="flex flex-wrap items-center gap-1.5">
            {TASK_GROUPS.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setGroup(key)}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                  group === key
                    ? "border-brand-500/45 bg-brand-50 text-brand-700"
                    : "border-line bg-white text-ink-soft hover:text-ink",
                )}
              >
                {label}
                <span className="ml-1 text-st-na">{groupCounts.get(key) ?? 0}</span>
              </button>
            ))}
            <button
              onClick={() => setMineOnly((v) => !v)}
              className={cn(
                "ml-auto rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                mineOnly
                  ? "border-brand-500/45 bg-brand-50 text-brand-700"
                  : "border-line bg-white text-ink-soft hover:text-ink",
              )}
            >
              Mes tâches
            </button>
          </div>

          <TaskList
            tasks={visibleTasks}
            byId={byId}
            onComplete={complete}
            onPhoneSaved={onPhoneSaved}
          />
          <RecentStrip tasks={recent} byId={byId} onUndo={undo} />
        </>
      ) : (
        <Pipeline
          prospects={prospects.filter((p) => matchesList(p) && matchesQuery(p))}
          onMove={onMove}
        />
      )}
    </div>
  );
}

const emptyP: ProspectDTO = {
  id: "",
  societe: "",
  siteInternet: null,
  verticale: null,
  language: null,
  sourceStatus: null,
  lists: [],
  pipelineStage: "to_contact",
  lostReason: null,
  noShow: false,
  needsReview: false,
  mrr: null,
  conversionProbability: null,
  leadFrom: null,
  meetingDate: null,
  offerSentAt: null,
  lastReplyAt: null,
  reminderSentAt: null,
  calledAt: null,
  outcome: null,
  stage: "awaiting_reply",
  nextActionAt: null,
  notes: null,
  bce: null,
  formeJuridique: null,
  gerantsTous: null,
  rue: null,
  codePostal: null,
  ville: null,
  province: null,
  pays: null,
  fsmaStatut: null,
  debutStatut: null,
  typesProduits: null,
  activite: null,
  tailleEquipe: null,
  telSociete: null,
  telSource: null,
  siteStatus: null,
  siteQuality: null,
  siteSummary: null,
  linkedinSociete: null,
  instagram: null,
  xTwitter: null,
  dateEnrichissement: null,
  hasLogo: false,
  contacts: [],
};

function ViewTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
        active ? "bg-brand-50 text-brand-700" : "text-ink-soft hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}

function Count({ tone, children }: { tone: "alert" | "muted"; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "rounded-full px-1.5 text-[11px] font-semibold",
        tone === "alert" ? "bg-[#fde2e5] text-[#bb1626]" : "bg-line/70 text-ink-soft",
      )}
    >
      {children}
    </span>
  );
}

/* -------------------------------- Task list ------------------------------- */

export function dueInfo(iso: string | null): { label: string } {
  if (!iso) return { label: "Sans échéance" };
  const due = new Date(iso);
  const days = Math.floor((Date.now() - due.getTime()) / 86_400_000);
  if (days === 0) return { label: "Aujourd'hui" };
  return { label: formatDate(iso) };
}

function TaskList({
  tasks,
  byId,
  onComplete,
  onPhoneSaved,
}: {
  tasks: TaskDTO[];
  byId: Map<string, ProspectDTO>;
  onComplete: (
    t: TaskDTO,
    outcome: string,
    extra?: { followUpDueAt?: Date; rebookedMeetingAt?: Date },
  ) => void;
  onPhoneSaved: (prospectId: string, phone: string) => void;
}) {
  if (tasks.length === 0) {
    return (
      <div className="rounded-xl border border-line bg-white p-10 text-center text-sm text-ink-soft">
        Aucune tâche ouverte ici 🎉 — le bouton « Recalculer » (ou le cron quotidien)
        génère les relances J+7, appels J+15 et RDV à recaler.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-line bg-white">
      {tasks.map((t) => (
        <TaskRow
          key={t.id}
          task={t}
          prospect={byId.get(t.prospectId)}
          onComplete={onComplete}
          onPhoneSaved={onPhoneSaved}
        />
      ))}
    </div>
  );
}

function TaskRow({
  task,
  prospect,
  onComplete,
  onPhoneSaved,
}: {
  task: TaskDTO;
  prospect: ProspectDTO | undefined;
  onComplete: (
    t: TaskDTO,
    outcome: string,
    extra?: { followUpDueAt?: Date; rebookedMeetingAt?: Date },
  ) => void;
  onPhoneSaved: (prospectId: string, phone: string) => void;
}) {
  const due = dueInfo(task.dueAt);
  const contact = prospect ? primaryContact(prospect) : null;
  const phone = prospect ? anyPhone(prospect) : null;

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line/60 px-4 py-3 last:border-0 hover:bg-line/20">
      {/* Due */}
      <div className="w-28 shrink-0 text-xs font-medium text-ink-soft">
        {due.label}
      </div>

      {/* What + who */}
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm text-ink">{task.title}</div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
          {prospect ? (
            <Link
              href={`/suivi-commercial/${prospect.id}`}
              className="text-sm font-medium text-brand-700 hover:underline"
            >
              {prospect.societe}
            </Link>
          ) : (
            <span className="text-sm text-st-na">—</span>
          )}
          {contact?.name && <span className="text-xs text-ink-soft">{contact.name}</span>}
          {prospect?.noShow && <Badge tone="warn" icon={CalendarX2}>no-show</Badge>}
          {prospect?.needsReview && (
            <Badge tone="alert" icon={AlertTriangle}>à vérifier</Badge>
          )}
          {task.assignee && (
            <span className="rounded-full bg-line/60 px-1.5 py-0.5 text-[11px] text-ink-soft">
              {officerName(task.assignee)}
            </span>
          )}
        </div>
      </div>

      {/* Phone */}
      {task.type === "call" && prospect && (
        <div className="w-40 shrink-0">
          {phone ? (
            <a
              href={`tel:${phone.replace(/[^+\d]/g, "")}`}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-700 hover:underline"
            >
              <Phone className="size-3.5" />
              {phone}
            </a>
          ) : (
            <PhoneInput onSave={(v) => onPhoneSaved(prospect.id, v)} />
          )}
        </div>
      )}

      {/* Actions per task kind */}
      <TaskActions task={task} onComplete={onComplete} />
    </div>
  );
}

export function TaskActions({
  task,
  onComplete,
}: {
  task: TaskDTO;
  onComplete: (
    t: TaskDTO,
    outcome: string,
    extra?: { followUpDueAt?: Date; rebookedMeetingAt?: Date },
  ) => void;
}) {
  if (task.cadenceKey === "offer_reminder") {
    return (
      <div className="flex gap-1.5">
        <ActionBtn onClick={() => onComplete(task, "sent")} icon={Check}>
          Relance envoyée
        </ActionBtn>
      </div>
    );
  }

  if (task.cadenceKey === "no_show_rebook") {
    return (
      <div className="flex flex-wrap gap-1.5">
        <RebookBtn onPick={(d) => onComplete(task, "rebooked", { rebookedMeetingAt: d })} />
        <CallbackBtn onPick={(d) => onComplete(task, "callback", { followUpDueAt: d })} />
        <ActionBtn danger onClick={() => onComplete(task, "not_interested")}>
          Pas intéressé
        </ActionBtn>
      </div>
    );
  }

  if (task.type === "call") {
    return (
      <div className="flex flex-wrap gap-1.5">
        <ActionBtn onClick={() => onComplete(task, "reachable")} icon={Check}>
          Joignable
        </ActionBtn>
        <CallbackBtn onPick={(d) => onComplete(task, "callback", { followUpDueAt: d })} />
        <ActionBtn danger onClick={() => onComplete(task, "not_interested")}>
          Pas intéressé
        </ActionBtn>
        <ActionBtn success onClick={() => onComplete(task, "signed")}>
          Signé 🎉
        </ActionBtn>
      </div>
    );
  }

  return (
    <div className="flex gap-1.5">
      <ActionBtn onClick={() => onComplete(task, "done")} icon={Check}>
        Fait
      </ActionBtn>
    </div>
  );
}

/** Neutral at rest — colour only on hover; success = green OUTLINE (not filled). */
function ActionBtn({
  onClick,
  icon: Icon,
  danger,
  success,
  children,
}: {
  onClick: () => void;
  icon?: React.ComponentType<{ className?: string }>;
  danger?: boolean;
  success?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1 rounded-md border bg-white px-2 py-1 text-xs font-medium transition-colors",
        success
          ? "border-brand-500/60 text-brand-700 hover:bg-brand-50"
          : danger
            ? "border-line text-ink-soft hover:border-[#ea384c]/55 hover:bg-[#fde2e5] hover:text-[#bb1626]"
            : "border-line text-ink-soft hover:border-brand-500/45 hover:bg-brand-50/60 hover:text-brand-700",
      )}
    >
      {Icon && <Icon className="size-3.5" />}
      {children}
    </button>
  );
}

/** "À rappeler" with a date choice — completes the task AND creates the recall. */
function CallbackBtn({ onPick }: { onPick: (due: Date) => void }) {
  const [openMenu, setOpenMenu] = useState(false);
  const pick = (days: number) => {
    setOpenMenu(false);
    const d = new Date();
    d.setDate(d.getDate() + days);
    d.setHours(9, 0, 0, 0);
    onPick(d);
  };
  return (
    <div className="relative">
      <button
        onClick={() => setOpenMenu((v) => !v)}
        className="inline-flex items-center gap-1 rounded-md border border-line bg-white px-2 py-1 text-xs font-medium text-ink-soft transition-colors hover:border-brand-500/45 hover:bg-brand-50/60 hover:text-brand-700"
      >
        À rappeler
        <ChevronDown className="size-3" />
      </button>
      {openMenu && (
        <div className="absolute right-0 z-10 mt-1 w-32 rounded-lg border border-line bg-white py-1 shadow-lg">
          {[
            { label: "Demain", days: 1 },
            { label: "Dans 3 jours", days: 3 },
            { label: "Dans 1 semaine", days: 7 },
            { label: "Dans 1 mois", days: 30 },
          ].map(({ label, days }) => (
            <button
              key={days}
              onClick={() => pick(days)}
              className="block w-full px-3 py-1.5 text-left text-xs text-ink hover:bg-brand-50/60"
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** "RDV recalé" with an optional new slot. */
function RebookBtn({ onPick }: { onPick: (meetingAt?: Date) => void }) {
  const [openMenu, setOpenMenu] = useState(false);
  const [value, setValue] = useState("");
  return (
    <div className="relative">
      <button
        onClick={() => setOpenMenu((v) => !v)}
        className="inline-flex items-center gap-1 rounded-md border border-brand-500/60 bg-white px-2 py-1 text-xs font-medium text-brand-700 transition-colors hover:bg-brand-50"
      >
        <Check className="size-3.5" />
        RDV recalé
      </button>
      {openMenu && (
        <div className="absolute right-0 z-10 mt-1 w-56 rounded-lg border border-line bg-white p-2 shadow-lg">
          <input
            type="datetime-local"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="w-full rounded-md border border-line px-2 py-1 text-xs text-ink focus:border-brand-500 focus:outline-none"
          />
          <div className="mt-1.5 flex justify-end gap-1.5">
            <button
              onClick={() => {
                setOpenMenu(false);
                onPick(undefined);
              }}
              className="rounded-md px-2 py-1 text-xs text-ink-soft hover:bg-line/40"
            >
              Sans date
            </button>
            <button
              onClick={() => {
                setOpenMenu(false);
                onPick(value ? new Date(value) : undefined);
              }}
              className="rounded-md bg-brand-600 px-2 py-1 text-xs font-medium text-white hover:bg-brand-700"
            >
              Valider
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function PhoneInput({ onSave }: { onSave: (value: string) => void }) {
  const [value, setValue] = useState("");
  const commit = () => {
    if (value.trim()) onSave(value.trim());
  };
  return (
    <input
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === "Enter" && commit()}
      placeholder="Ajouter un n°…"
      className="w-36 rounded-md border border-dashed border-line bg-transparent px-2 py-1 text-xs text-ink placeholder:text-st-na focus:border-brand-500 focus:outline-none"
    />
  );
}

/* ------------------------------ Recent strip ------------------------------ */

function RecentStrip({
  tasks,
  byId,
  onUndo,
}: {
  tasks: TaskDTO[];
  byId: Map<string, ProspectDTO>;
  onUndo: (t: TaskDTO) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  if (tasks.length === 0) return null;

  return (
    <div className="rounded-xl border border-line bg-[#f7f8f9]">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-2 px-4 py-2.5 text-sm font-medium text-ink-soft hover:text-ink"
      >
        <History className="size-4" />
        Fait récemment
        <span className="rounded-full bg-line/70 px-1.5 text-[11px] font-semibold">
          {tasks.length}
        </span>
        <ChevronDown className={cn("ml-auto size-4 transition-transform", expanded && "rotate-180")} />
      </button>
      {expanded && (
        <div className="border-t border-line/60">
          {tasks.slice(0, 30).map((t) => {
            const p = byId.get(t.prospectId);
            return (
              <div
                key={t.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line/40 px-4 py-2 text-sm last:border-0"
              >
                <span className="w-24 shrink-0 text-xs text-st-na">
                  {formatDate(t.completedAt ?? undefined)}
                </span>
                {t.status === "cancelled" ? (
                  <X className="size-3.5 shrink-0 text-st-na" />
                ) : (
                  <Check className="size-3.5 shrink-0 text-brand-600" />
                )}
                <span className="text-ink-soft line-through decoration-line">{t.title}</span>
                {p && (
                  <Link
                    href={`/suivi-commercial/${p.id}`}
                    className="font-medium text-brand-700 hover:underline"
                  >
                    {p.societe}
                  </Link>
                )}
                {t.outcome && (
                  <span className="rounded-full bg-line/60 px-1.5 py-0.5 text-[11px] text-ink-soft">
                    {TASK_OUTCOME_LABEL[t.outcome] ?? t.outcome}
                  </span>
                )}
                {t.completedBy && (
                  <span className="text-xs text-st-na">par {officerName(t.completedBy)}</span>
                )}
                {t.status === "done" && (
                  <button
                    onClick={() => onUndo(t)}
                    className="ml-auto inline-flex items-center gap-1 rounded-md border border-line bg-white px-2 py-0.5 text-xs text-ink-soft hover:bg-line/40 hover:text-ink"
                  >
                    <RotateCcw className="size-3" />
                    Annuler
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* -------------------------------- Pipeline -------------------------------- */

function Pipeline({
  prospects,
  onMove,
}: {
  prospects: ProspectDTO[];
  onMove: (p: ProspectDTO, stage: PipelineStage) => void;
}) {
  const byStage = useMemo(() => {
    const map = new Map<PipelineStage, ProspectDTO[]>();
    for (const { key } of PIPELINE_COLUMNS) map.set(key, []);
    for (const p of prospects) map.get(p.pipelineStage)?.push(p);
    return map;
  }, [prospects]);

  return (
    <div className="flex gap-3 overflow-x-auto pb-2">
      {PIPELINE_COLUMNS.map(({ key, label }) => {
        const cards = byStage.get(key) ?? [];
        const mrr = cards.reduce((s, p) => s + (p.mrr ?? 0), 0);
        return (
          <div
            key={key}
            className="flex w-64 shrink-0 flex-col rounded-xl border border-line bg-[#f7f8f9]"
          >
            <div className="flex items-baseline justify-between px-3 py-2.5">
              <span className="text-sm font-semibold text-ink">{label}</span>
              <span className="text-xs text-ink-soft">
                {cards.length}
                {mrr > 0 && <span className="ml-1.5 text-st-na">· {formatEur(mrr)}</span>}
              </span>
            </div>
            <div className="flex max-h-[65vh] flex-col gap-2 overflow-y-auto px-2 pb-2">
              {cards.map((p) => (
                <PipelineCard key={p.id} p={p} onMove={onMove} />
              ))}
              {cards.length === 0 && (
                <div className="rounded-lg border border-dashed border-line px-3 py-6 text-center text-xs text-st-na">
                  Vide
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function PipelineCard({
  p,
  onMove,
}: {
  p: ProspectDTO;
  onMove: (p: ProspectDTO, stage: PipelineStage) => void;
}) {
  const contact = primaryContact(p);
  return (
    <div className="group rounded-lg border border-line bg-white p-2.5 shadow-sm">
      <Link
        href={`/suivi-commercial/${p.id}`}
        className="text-sm font-medium leading-snug text-ink hover:text-brand-700 hover:underline"
      >
        {p.societe}
      </Link>
      {contact?.name && <div className="mt-0.5 text-xs text-ink-soft">{contact.name}</div>}

      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        {p.mrr != null && (
          <span className="text-xs font-medium text-brand-700">{formatEur(p.mrr)}/m</span>
        )}
        {p.stage === "to_call" && <Badge tone="alert" icon={Phone}>à appeler</Badge>}
        {p.noShow && <Badge tone="warn" icon={CalendarX2}>no-show</Badge>}
        {p.needsReview && <Badge tone="alert" icon={AlertTriangle}>à vérifier</Badge>}
        {p.pipelineStage === "lost" && p.lostReason && (
          <span className="text-xs text-st-na">{LOST_REASON_LABEL[p.lostReason]}</span>
        )}
      </div>

      <select
        value={p.pipelineStage}
        onChange={(e) => onMove(p, e.target.value as PipelineStage)}
        className="mt-2 w-full rounded-md border border-line bg-white px-1.5 py-1 text-xs text-ink-soft opacity-0 transition-opacity focus:opacity-100 group-hover:opacity-100"
      >
        {PIPELINE_COLUMNS.map(({ key, label }) => (
          <option key={key} value={key}>
            {label}
          </option>
        ))}
      </select>
    </div>
  );
}

/* --------------------------------- Badges --------------------------------- */

export function Badge({
  tone,
  icon: Icon,
  children,
}: {
  tone: "warn" | "alert" | "muted";
  icon?: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[11px] font-medium ring-1 ring-inset",
        tone === "warn"
          ? "bg-[#fdf1da] text-[#8a5300] ring-[#f0ad4e]/55"
          : tone === "muted"
            ? "bg-line/50 text-ink-soft ring-line"
            : "bg-[#fde2e5] text-[#bb1626] ring-[#ea384c]/55",
      )}
    >
      {Icon && <Icon className="size-3" />}
      {children}
    </span>
  );
}
