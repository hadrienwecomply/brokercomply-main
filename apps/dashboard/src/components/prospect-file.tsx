"use client";

import { useMemo, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  Building2,
  CalendarX2,
  Check,
  Globe,
  Instagram,
  Linkedin,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Plus,
  RotateCcw,
  Star,
  Tag,
  X,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { formatDate, formatEur } from "@/lib/format";
import { OFFICER_OPTIONS, officerName } from "@/lib/officers";
import {
  LANGUAGE_OPTIONS,
  LOST_REASON_LABEL,
  PIPELINE_COLUMNS,
  PROBABILITY_OPTIONS,
  TASK_OUTCOME_LABEL,
  TASK_TYPE_LABEL,
  VERTICALE_OPTIONS,
  anyPhone,
  primaryContact,
  type PipelineStage,
  type ProspectContactDTO,
  type ProspectDTO,
  type TaskDTO,
  type TaskType,
} from "@/lib/prospects-types";
import {
  addContact,
  addTask,
  assignTask,
  dropTask,
  finishTask,
  movePipeline,
  saveContact,
  saveNotes,
  savePhone,
  saveProspectFields,
  undoTask,
  type ContactInput,
  type ProspectFieldsInput,
} from "@/lib/prospects-actions";
import { ProspectLogo } from "./prospect-logo";
import { Badge, TaskActions, dueInfo } from "./suivi-commercial-board";

type TabKey = "suivi" | "donnees" | "contacts" | "notes";

export function ProspectFile({
  prospect: initial,
  tasks: initialTasks,
}: {
  prospect: ProspectDTO;
  tasks: TaskDTO[];
}) {
  const router = useRouter();
  const [p, setP] = useState(initial);
  const [tasks, setTasks] = useState(initialTasks);
  const [notesDraft, setNotesDraft] = useState(initial.notes ?? "");
  const [showNewTask, setShowNewTask] = useState(false);
  const [editData, setEditData] = useState(false);
  const [editContactId, setEditContactId] = useState<string | null>(null);
  const [showNewContact, setShowNewContact] = useState(false);
  const [tab, setTab] = useState<TabKey>("suivi");
  const [, startTransition] = useTransition();

  const openTasks = tasks.filter((t) => t.status === "open");
  const historyTasks = tasks.filter((t) => t.status !== "open");

  function patch(changes: Partial<ProspectDTO>) {
    setP((prev) => ({ ...prev, ...changes }));
  }

  function complete(
    task: TaskDTO,
    outcome: string,
    extra?: { followUpDueAt?: Date; rebookedMeetingAt?: Date },
  ) {
    setTasks((prev) =>
      prev.map((t) =>
        t.id === task.id
          ? { ...t, status: "done" as const, outcome, completedAt: new Date().toISOString() }
          : t,
      ),
    );
    if (outcome === "signed") patch({ pipelineStage: "won" });
    if (outcome === "not_interested")
      patch({ pipelineStage: "lost", lostReason: "not_interested" });
    if (outcome === "rebooked") patch({ pipelineStage: "demo_planned", noShow: false });
    startTransition(async () => {
      await finishTask(task.id, {
        prospectId: task.prospectId,
        outcome,
        ...(extra?.followUpDueAt
          ? {
              followUp: {
                title: `Rappeler ${p.societe}`,
                dueAt: extra.followUpDueAt.toISOString(),
              },
            }
          : {}),
        ...(extra?.rebookedMeetingAt
          ? { rebookedMeetingAt: extra.rebookedMeetingAt.toISOString() }
          : {}),
      });
      router.refresh();
    });
  }

  function undo(task: TaskDTO) {
    setTasks((prev) =>
      prev.map((t) =>
        t.id === task.id ? { ...t, status: "open" as const, outcome: null } : t,
      ),
    );
    startTransition(async () => {
      await undoTask(task.id, task.prospectId);
      router.refresh();
    });
  }

  const milestones = useMemo(() => buildTimeline(p, historyTasks), [p, historyTasks]);
  const primary = primaryContact(p);

  const tabs: { key: TabKey; label: string; count?: number }[] = [
    { key: "suivi", label: "Suivi", count: openTasks.length },
    { key: "donnees", label: "Données" },
    { key: "contacts", label: "Contacts", count: p.contacts.length },
    { key: "notes", label: "Notes" },
  ];

  return (
    <div className="space-y-6">
      <Link
        href="/suivi-commercial"
        className="inline-flex items-center gap-1.5 text-sm text-ink-soft hover:text-ink"
      >
        <ArrowLeft className="size-4" />
        Suivi commercial
      </Link>

      <ProspectHeader
        p={p}
        onStage={(stage) => {
          patch({ pipelineStage: stage, lostReason: stage === "lost" ? "other" : null });
          startTransition(() => movePipeline(p.id, stage));
        }}
      />

      {/* Tab bar */}
      <div className="flex items-center gap-1 border-b border-line">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={cn(
              "-mb-px inline-flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors",
              tab === t.key
                ? "border-brand-500 text-brand-700"
                : "border-transparent text-ink-soft hover:text-ink",
            )}
          >
            {t.label}
            {t.count != null && t.count > 0 && (
              <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-brand-50 px-1.5 text-xs font-semibold text-brand-700">
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* --- Suivi --- */}
      <div className={cn("space-y-5", tab !== "suivi" && "hidden")}>
        <Card
          title={`Tâches ouvertes (${openTasks.length})`}
          action={
            <button
              onClick={() => setShowNewTask((v) => !v)}
              className="inline-flex items-center gap-1 rounded-md border border-line bg-white px-2 py-1 text-xs font-medium text-ink-soft hover:border-brand-500/45 hover:bg-brand-50/60 hover:text-brand-700"
            >
              <Plus className="size-3.5" />
              Nouvelle tâche
            </button>
          }
        >
          {showNewTask && (
            <NewTaskForm
              onSubmit={(v) => {
                setShowNewTask(false);
                startTransition(async () => {
                  await addTask({ prospectId: p.id, ...v });
                  router.refresh();
                });
              }}
              onCancel={() => setShowNewTask(false)}
            />
          )}
          {openTasks.length === 0 && !showNewTask && (
            <p className="text-sm text-st-na">Aucune tâche ouverte.</p>
          )}
          <div className="divide-y divide-line/60">
            {openTasks.map((t) => {
              const due = dueInfo(t.dueAt);
              return (
                <div key={t.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2.5">
                  <span className="w-28 shrink-0 text-xs font-medium text-ink-soft">
                    {due.label}
                  </span>
                  <span className="min-w-0 flex-1 text-sm text-ink">{t.title}</span>
                  <select
                    value={t.assignee ?? ""}
                    onChange={(e) => {
                      const assignee = e.target.value || null;
                      setTasks((prev) =>
                        prev.map((x) => (x.id === t.id ? { ...x, assignee } : x)),
                      );
                      startTransition(() => assignTask(t.id, p.id, assignee));
                    }}
                    className="rounded-md border border-line bg-white px-1.5 py-1 text-xs text-ink-soft focus:border-brand-500 focus:outline-none"
                  >
                    <option value="">Non assigné</option>
                    {OFFICER_OPTIONS.map((o) => (
                      <option key={o.email} value={o.email}>
                        {o.name}
                      </option>
                    ))}
                  </select>
                  <TaskActions task={t} onComplete={complete} />
                  {t.source === "manual" && (
                    <button
                      onClick={() => {
                        setTasks((prev) =>
                          prev.map((x) =>
                            x.id === t.id ? { ...x, status: "cancelled" as const } : x,
                          ),
                        );
                        startTransition(() => dropTask(t.id, p.id));
                      }}
                      title="Annuler la tâche"
                      className="rounded p-1 text-st-na hover:bg-[#fde2e5] hover:text-[#bb1626]"
                    >
                      <X className="size-3.5" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </Card>

        <Card title="Historique">
          {milestones.length === 0 && (
            <p className="text-sm text-st-na">Rien encore — l&apos;historique se remplit au fil des tâches.</p>
          )}
          <ol className="relative space-y-4 border-l border-line pl-4">
            {milestones.map((m) => (
              <li key={m.id} className="relative">
                <span
                  className={cn(
                    "absolute -left-[21.5px] top-1 size-2.5 rounded-full ring-2 ring-white",
                    m.kind === "task-done"
                      ? "bg-brand-500"
                      : m.kind === "task-cancelled"
                        ? "bg-st-na"
                        : "bg-purple-400",
                  )}
                />
                <div className="text-xs text-st-na">{formatDate(m.at)}</div>
                <div className="flex flex-wrap items-center gap-x-2 text-sm text-ink">
                  {m.kind === "task-cancelled" && <X className="size-3.5 text-st-na" />}
                  {m.kind === "task-done" && <Check className="size-3.5 text-brand-600" />}
                  <span className={cn(m.kind === "task-cancelled" && "text-ink-soft line-through")}>
                    {m.label}
                  </span>
                  {m.outcome && (
                    <span className="rounded-full bg-line/60 px-1.5 py-0.5 text-[11px] text-ink-soft">
                      {TASK_OUTCOME_LABEL[m.outcome] ?? m.outcome}
                    </span>
                  )}
                  {m.by && <span className="text-xs text-st-na">par {officerName(m.by)}</span>}
                  {m.task && m.kind === "task-done" && (
                    <button
                      onClick={() => undo(m.task!)}
                      className="inline-flex items-center gap-1 rounded-md border border-line bg-white px-1.5 py-0.5 text-[11px] text-ink-soft hover:bg-line/40 hover:text-ink"
                    >
                      <RotateCcw className="size-3" />
                      Annuler
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </Card>
      </div>

      {/* --- Données --- */}
      <div className={cn(tab !== "donnees" && "hidden")}>
        <Card
          title="Données"
          action={
            !editData && (
              <button
                onClick={() => setEditData(true)}
                className="inline-flex items-center gap-1 rounded-md border border-line bg-white px-2 py-1 text-xs font-medium text-ink-soft hover:border-brand-500/45 hover:bg-brand-50/60 hover:text-brand-700"
              >
                <Pencil className="size-3" />
                Modifier
              </button>
            )
          }
        >
          {editData ? (
            <DataEditForm
              prospect={p}
              onCancel={() => setEditData(false)}
              onSave={(v) => {
                setEditData(false);
                patch(fieldsToPatch(p, v));
                startTransition(async () => {
                  await saveProspectFields(p.id, v);
                  router.refresh();
                });
              }}
            />
          ) : (
            <DataView p={p} />
          )}
        </Card>
      </div>

      {/* --- Contacts --- */}
      <div className={cn(tab !== "contacts" && "hidden")}>
        <Card
          title="Contacts"
          action={
            !showNewContact && (
              <button
                onClick={() => setShowNewContact(true)}
                className="inline-flex items-center gap-1 rounded-md border border-line bg-white px-2 py-1 text-xs font-medium text-ink-soft hover:border-brand-500/45 hover:bg-brand-50/60 hover:text-brand-700"
              >
                <Plus className="size-3.5" />
                Ajouter
              </button>
            )
          }
        >
          {showNewContact && (
            <ContactForm
              onCancel={() => setShowNewContact(false)}
              onSave={(v) => {
                setShowNewContact(false);
                startTransition(async () => {
                  await addContact(p.id, v);
                  router.refresh();
                });
              }}
            />
          )}
          {p.contacts.length === 0 && !showNewContact && (
            <p className="text-sm text-st-na">Aucun contact connu.</p>
          )}
          <div className="space-y-4">
            {p.contacts.map((c) =>
              editContactId === c.id ? (
                <ContactForm
                  key={c.id}
                  initial={c}
                  onCancel={() => setEditContactId(null)}
                  onSave={(v) => {
                    setEditContactId(null);
                    patch({
                      contacts: p.contacts.map((x) => (x.id === c.id ? { ...x, ...v } : x)),
                    });
                    startTransition(() => saveContact(p.id, c.id, v));
                  }}
                />
              ) : (
                <div key={c.id} className="group text-sm">
                  <div className="flex items-center gap-1.5 font-medium text-ink">
                    {c.isPrimary && <Star className="size-3.5 fill-brand-500 text-brand-500" />}
                    {c.name ?? "—"}
                    {c.role && <span className="text-xs font-normal text-st-na">· {c.role}</span>}
                    <button
                      onClick={() => setEditContactId(c.id)}
                      title="Modifier le contact"
                      className="rounded p-0.5 text-st-na opacity-0 transition-opacity hover:bg-line/40 hover:text-ink group-hover:opacity-100"
                    >
                      <Pencil className="size-3" />
                    </button>
                  </div>
                  {c.email && (
                    <a
                      href={`mailto:${c.email}`}
                      className="mt-0.5 flex items-center gap-1.5 text-xs text-ink-soft hover:text-brand-700"
                    >
                      <Mail className="size-3" />
                      {c.email}
                    </a>
                  )}
                  {c.phone ? (
                    <a
                      href={`tel:${c.phone.replace(/[^+\d]/g, "")}`}
                      className="mt-0.5 flex items-center gap-1.5 text-xs font-medium text-brand-700 hover:underline"
                    >
                      <Phone className="size-3" />
                      {c.phone}
                    </a>
                  ) : (
                    (c.isPrimary || c === primary) && (
                      <PhoneEdit
                        onSave={(v) => {
                          patch({
                            contacts: p.contacts.map((x) =>
                              x.id === c.id ? { ...x, phone: v } : x,
                            ),
                          });
                          startTransition(() => savePhone(p.id, v));
                        }}
                      />
                    )
                  )}
                  {c.linkedin && (
                    <a
                      href={c.linkedin}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-0.5 flex items-center gap-1.5 text-xs text-ink-soft hover:text-brand-700"
                    >
                      <Linkedin className="size-3" />
                      LinkedIn
                    </a>
                  )}
                </div>
              ),
            )}
          </div>
        </Card>
      </div>

      {/* --- Notes --- */}
      <div className={cn(tab !== "notes" && "hidden")}>
        <Card title="Notes">
          <textarea
            value={notesDraft}
            onChange={(e) => setNotesDraft(e.target.value)}
            rows={8}
            placeholder="Notes libres sur l'agence…"
            className="w-full rounded-lg border border-line px-2.5 py-2 text-sm text-ink placeholder:text-st-na focus:border-brand-500 focus:outline-none"
          />
          {notesDraft !== (p.notes ?? "") && (
            <button
              onClick={() => {
                patch({ notes: notesDraft });
                startTransition(() => saveNotes(p.id, notesDraft));
              }}
              className="mt-1.5 rounded-md bg-brand-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-brand-700"
            >
              Enregistrer
            </button>
          )}
        </Card>
      </div>
    </div>
  );
}

/* --------------------------------- header --------------------------------- */

function ProspectHeader({
  p,
  onStage,
}: {
  p: ProspectDTO;
  onStage: (stage: PipelineStage) => void;
}) {
  const primary = primaryContact(p);
  // The gérant's mobile is the cold-call target; fall back to the switchboard.
  const callNumber = primary?.phone ?? p.telSociete ?? anyPhone(p);
  const cityLine = [p.codePostal, p.ville].filter(Boolean).join(" ");

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-4">
        <ProspectLogo prospectId={p.id} societe={p.societe} hasLogo={p.hasLogo} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{p.societe}</h1>
            <select
              value={p.pipelineStage}
              onChange={(e) => onStage(e.target.value as PipelineStage)}
              className="rounded-lg border border-line bg-white px-2.5 py-1.5 text-sm font-medium text-ink focus:border-brand-500 focus:outline-none"
            >
              {PIPELINE_COLUMNS.map(({ key, label }) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
            {p.pipelineStage === "lost" && p.lostReason && (
              <span className="text-sm text-st-na">{LOST_REASON_LABEL[p.lostReason]}</span>
            )}
            {p.noShow && <Badge tone="warn" icon={CalendarX2}>no-show</Badge>}
            {p.needsReview && <Badge tone="alert" icon={AlertTriangle}>à vérifier</Badge>}
            {p.fsmaStatut && <Badge tone="muted">FSMA · {p.fsmaStatut}</Badge>}
            {p.mrr != null && (
              <span className="ml-auto rounded-full bg-brand-50 px-2.5 py-1 text-sm font-semibold text-brand-700">
                {formatEur(p.mrr)}/mois
              </span>
            )}
          </div>

          {/* Cold-call CTA + quick metadata */}
          <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
            {callNumber ? (
              <a
                href={`tel:${callNumber.replace(/[^+\d]/g, "")}`}
                title={p.telSource ? `Source : ${p.telSource}` : undefined}
                className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-3 py-1.5 font-semibold text-white hover:bg-brand-700"
              >
                <Phone className="size-4" />
                {callNumber}
              </a>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-st-na">
                <Phone className="size-4" /> Pas de numéro
              </span>
            )}
            {cityLine && (
              <Meta icon={MapPin}>
                {cityLine}
                {p.province ? ` · ${p.province}` : ""}
              </Meta>
            )}
            {p.bce && <Meta icon={Building2}>BCE {p.bce}</Meta>}
            {p.language && <Meta icon={Globe}>{p.language}</Meta>}
            {p.siteInternet && (
              <a
                href={p.siteInternet.startsWith("http") ? p.siteInternet : `https://${p.siteInternet}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-brand-700 hover:underline"
              >
                <Globe className="size-4" />
                {p.siteInternet.replace(/^https?:\/\//, "").replace(/\/$/, "")}
              </a>
            )}
          </div>

          {/* Import lists */}
          {p.lists.length > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <Tag className="size-3.5 text-st-na" />
              {p.lists.map((l) => (
                <span
                  key={l}
                  className="rounded-full bg-line/60 px-2 py-0.5 text-xs font-medium text-ink-soft"
                >
                  {l}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Meta({ icon: Icon, children }: { icon: typeof MapPin; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-ink-soft">
      <Icon className="size-4 text-st-na" />
      {children}
    </span>
  );
}

/* ------------------------------- Données view ----------------------------- */

function DataView({ p }: { p: ProspectDTO }) {
  return (
    <div className="grid gap-6 sm:grid-cols-2">
      <Section title="Identité & adresse">
        <Row label="Forme juridique">{p.formeJuridique ?? "—"}</Row>
        <Row label="Gérant(s)">{p.gerantsTous ?? "—"}</Row>
        <Row label="Adresse">{p.rue ?? "—"}</Row>
        <Row label="Ville">{[p.codePostal, p.ville].filter(Boolean).join(" ") || "—"}</Row>
        <Row label="Province">{p.province ?? "—"}</Row>
        <Row label="Pays">{p.pays ?? "—"}</Row>
        <Row label="Tél. société">{p.telSociete ?? "—"}</Row>
      </Section>

      <Section title="Profil FSMA">
        <Row label="Statut FSMA">{p.fsmaStatut ?? "—"}</Row>
        <Row label="Début statut">{formatDate(p.debutStatut ?? undefined)}</Row>
        <Row label="Produits">{p.typesProduits ?? "—"}</Row>
        <Row label="Activité">{p.activite ?? "—"}</Row>
        <Row label="Taille équipe">{p.tailleEquipe ?? "—"}</Row>
        <Row label="Langue">{p.language ?? "—"}</Row>
      </Section>

      <Section title="Web & réseaux">
        <Row label="Site">
          {p.siteInternet ? (
            <a
              href={p.siteInternet.startsWith("http") ? p.siteInternet : `https://${p.siteInternet}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-brand-700 hover:underline"
            >
              <Globe className="size-3.5" />
              {p.siteInternet.replace(/^https?:\/\//, "").replace(/\/$/, "")}
            </a>
          ) : (
            "—"
          )}
        </Row>
        {p.siteStatus && <Row label="État du site">{p.siteStatus}</Row>}
        {p.siteQuality && <Row label="Qualité site">{p.siteQuality}</Row>}
        {p.siteSummary && <Row label="Résumé site">{p.siteSummary}</Row>}
        <Row label="LinkedIn">{socialLink(p.linkedinSociete, Linkedin)}</Row>
        <Row label="Instagram">{socialLink(p.instagram, Instagram)}</Row>
        <Row label="X / Twitter">{socialLink(p.xTwitter)}</Row>
      </Section>

      <Section title="Qualification commerciale">
        <Row label="Source">{p.leadFrom ?? "—"}</Row>
        <Row label="Probabilité">{p.conversionProbability ?? "—"}</Row>
        <Row label="Verticale">{p.verticale ?? "—"}</Row>
        <Row label="RDV / démo">{formatDate(p.meetingDate ?? undefined)}</Row>
        <Row label="Offre envoyée">{formatDate(p.offerSentAt ?? undefined)}</Row>
        <Row label="Dernière réponse">{formatDate(p.lastReplyAt ?? undefined)}</Row>
        <Row label="Relance J+7">{formatDate(p.reminderSentAt ?? undefined)}</Row>
        <Row label="Dernier appel">
          {p.calledAt ? (
            <>
              {formatDate(p.calledAt)}
              {p.outcome && (
                <span className="ml-1.5 text-xs text-st-na">
                  ({TASK_OUTCOME_LABEL[p.outcome] ?? p.outcome})
                </span>
              )}
            </>
          ) : (
            "—"
          )}
        </Row>
        {p.telSource && <Row label="Source du n°">{p.telSource}</Row>}
        {p.dateEnrichissement && (
          <Row label="Enrichi le">{formatDate(p.dateEnrichissement)}</Row>
        )}
        {p.sourceStatus && (
          <Row label="Tags import">
            <span className="text-xs text-st-na">{p.sourceStatus}</span>
          </Row>
        )}
      </Section>
    </div>
  );
}

function socialLink(url: string | null, Icon?: typeof Linkedin): ReactNode {
  if (!url) return "—";
  return (
    <a
      href={url.startsWith("http") ? url : `https://${url}`}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 text-brand-700 hover:underline"
    >
      {Icon && <Icon className="size-3.5" />}
      {url.replace(/^https?:\/\//, "").replace(/\/$/, "")}
    </a>
  );
}

/* -------------------------------- timeline -------------------------------- */

interface TimelineEntry {
  id: string;
  at: string;
  kind: "task-done" | "task-cancelled" | "milestone";
  label: string;
  outcome?: string | null;
  by?: string | null;
  task?: TaskDTO;
}

function buildTimeline(p: ProspectDTO, history: TaskDTO[]): TimelineEntry[] {
  const entries: TimelineEntry[] = [];

  for (const t of history) {
    if (!t.completedAt) continue;
    entries.push({
      id: t.id,
      at: t.completedAt,
      kind: t.status === "done" ? "task-done" : "task-cancelled",
      label: `${TASK_TYPE_LABEL[t.type]} — ${t.title}`,
      outcome: t.outcome,
      by: t.completedBy,
      task: t,
    });
  }

  const milestone = (at: string | null, label: string) => {
    if (at) entries.push({ id: `${label}-${at}`, at, kind: "milestone", label });
  };
  milestone(p.offerSentAt, "Offre envoyée");
  milestone(p.lastReplyAt, "Réponse reçue");
  milestone(p.meetingDate, "RDV / démo planifiée");

  return entries.sort((a, b) => b.at.localeCompare(a.at));
}

/* --------------------------------- pieces --------------------------------- */

function Card({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-line bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-soft">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-st-na">{title}</h3>
      <dl className="space-y-2 text-sm">{children}</dl>
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="shrink-0 text-ink-soft">{label}</dt>
      <dd className="break-words text-right text-ink">{children}</dd>
    </div>
  );
}

/** ISO → value for <input type="datetime-local"> (local time, minute precision). */
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const FIELD_CLS =
  "w-full rounded-md border border-line bg-white px-2.5 py-1.5 text-sm text-ink placeholder:text-st-na focus:border-brand-500 focus:outline-none";

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-0.5 block text-xs text-ink-soft">{label}</span>
      {children}
    </label>
  );
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <Field label={label}>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={FIELD_CLS}
      />
    </Field>
  );
}

function FormButtons({ onCancel, disabled }: { onCancel: () => void; disabled?: boolean }) {
  return (
    <div className="flex justify-end gap-1.5 pt-1">
      <button
        type="button"
        onClick={onCancel}
        className="rounded-md px-2.5 py-1.5 text-xs text-ink-soft hover:bg-line/40"
      >
        Annuler
      </button>
      <button
        type="submit"
        disabled={disabled}
        className="rounded-md bg-brand-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50"
      >
        Enregistrer
      </button>
    </div>
  );
}

/** Optimistic patch of the client state from a saved fields payload. */
function fieldsToPatch(p: ProspectDTO, v: ProspectFieldsInput): Partial<ProspectDTO> {
  const out: Partial<ProspectDTO> = {};
  for (const [k, val] of Object.entries(v)) {
    if (k === "mrr") out.mrr = (val as number | null) ?? null;
    else if (k === "meetingDate") out.meetingDate = (val as string | null) ?? null;
    else if (k === "societe") out.societe = (val as string) ?? p.societe;
    else (out as Record<string, unknown>)[k] = val ?? null;
  }
  return out;
}

/** Editable agency attributes (grouped like the read view). */
function DataEditForm({
  prospect: p,
  onSave,
  onCancel,
}: {
  prospect: ProspectDTO;
  onSave: (v: ProspectFieldsInput) => void;
  onCancel: () => void;
}) {
  const [f, setF] = useState({
    societe: p.societe,
    formeJuridique: p.formeJuridique ?? "",
    gerantsTous: p.gerantsTous ?? "",
    rue: p.rue ?? "",
    codePostal: p.codePostal ?? "",
    ville: p.ville ?? "",
    province: p.province ?? "",
    pays: p.pays ?? "",
    telSociete: p.telSociete ?? "",
    fsmaStatut: p.fsmaStatut ?? "",
    typesProduits: p.typesProduits ?? "",
    activite: p.activite ?? "",
    tailleEquipe: p.tailleEquipe ?? "",
    language: p.language ?? "",
    siteInternet: p.siteInternet ?? "",
    linkedinSociete: p.linkedinSociete ?? "",
    instagram: p.instagram ?? "",
    xTwitter: p.xTwitter ?? "",
    leadFrom: p.leadFrom ?? "",
    probability: p.conversionProbability ?? "",
    verticale: p.verticale ?? "",
    meeting: toLocalInput(p.meetingDate),
    mrr: p.mrr != null ? String(p.mrr) : "",
  });
  const set = (k: keyof typeof f) => (v: string) => setF((prev) => ({ ...prev, [k]: v }));

  // Keep an imported value not in our list selectable rather than dropping it.
  const withCurrent = (options: string[], current: string) =>
    current && !options.includes(current) ? [current, ...options] : options;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!f.societe.trim()) return;
        onSave({
          societe: f.societe.trim(),
          formeJuridique: f.formeJuridique.trim() || null,
          gerantsTous: f.gerantsTous.trim() || null,
          rue: f.rue.trim() || null,
          codePostal: f.codePostal.trim() || null,
          ville: f.ville.trim() || null,
          province: f.province.trim() || null,
          pays: f.pays.trim() || null,
          telSociete: f.telSociete.trim() || null,
          fsmaStatut: f.fsmaStatut.trim() || null,
          typesProduits: f.typesProduits.trim() || null,
          activite: f.activite.trim() || null,
          tailleEquipe: f.tailleEquipe.trim() || null,
          language: f.language || null,
          siteInternet: f.siteInternet.trim() || null,
          linkedinSociete: f.linkedinSociete.trim() || null,
          instagram: f.instagram.trim() || null,
          xTwitter: f.xTwitter.trim() || null,
          leadFrom: f.leadFrom.trim() || null,
          conversionProbability: f.probability || null,
          verticale: f.verticale || null,
          meetingDate: f.meeting ? new Date(f.meeting).toISOString() : null,
          mrr: f.mrr.trim() ? Number(f.mrr) : null,
        });
      }}
      className="space-y-6"
    >
      <FormSection title="Identité & adresse">
        <TextField label="Société" value={f.societe} onChange={set("societe")} />
        <TextField label="Forme juridique" value={f.formeJuridique} onChange={set("formeJuridique")} />
        <TextField label="Gérant(s)" value={f.gerantsTous} onChange={set("gerantsTous")} />
        <TextField label="Adresse (rue)" value={f.rue} onChange={set("rue")} />
        <TextField label="Code postal" value={f.codePostal} onChange={set("codePostal")} />
        <TextField label="Ville" value={f.ville} onChange={set("ville")} />
        <TextField label="Province" value={f.province} onChange={set("province")} />
        <TextField label="Pays" value={f.pays} onChange={set("pays")} />
        <TextField label="Tél. société" value={f.telSociete} onChange={set("telSociete")} />
      </FormSection>

      <FormSection title="Profil FSMA">
        <TextField label="Statut FSMA" value={f.fsmaStatut} onChange={set("fsmaStatut")} />
        <TextField label="Produits" value={f.typesProduits} onChange={set("typesProduits")} />
        <TextField label="Activité" value={f.activite} onChange={set("activite")} />
        <TextField label="Taille équipe" value={f.tailleEquipe} onChange={set("tailleEquipe")} />
        <Field label="Langue">
          <select value={f.language} onChange={(e) => set("language")(e.target.value)} className={FIELD_CLS}>
            <option value="">—</option>
            {LANGUAGE_OPTIONS.map((o) => (
              <option key={o.key} value={o.key}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>
      </FormSection>

      <FormSection title="Web & réseaux">
        <TextField label="Site internet" value={f.siteInternet} onChange={set("siteInternet")} placeholder="www.exemple.be" />
        <TextField label="LinkedIn (société)" value={f.linkedinSociete} onChange={set("linkedinSociete")} />
        <TextField label="Instagram" value={f.instagram} onChange={set("instagram")} />
        <TextField label="X / Twitter" value={f.xTwitter} onChange={set("xTwitter")} />
      </FormSection>

      <FormSection title="Qualification commerciale">
        <TextField label="Source" value={f.leadFrom} onChange={set("leadFrom")} placeholder="Événement, campagne, referral…" />
        <Field label="Probabilité">
          <select value={f.probability} onChange={(e) => set("probability")(e.target.value)} className={FIELD_CLS}>
            <option value="">—</option>
            {withCurrent(PROBABILITY_OPTIONS, f.probability).map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Verticale">
          <select value={f.verticale} onChange={(e) => set("verticale")(e.target.value)} className={FIELD_CLS}>
            <option value="">—</option>
            {withCurrent(VERTICALE_OPTIONS, f.verticale).map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </Field>
        <Field label="RDV / démo">
          <input
            type="datetime-local"
            value={f.meeting}
            onChange={(e) => set("meeting")(e.target.value)}
            className={FIELD_CLS}
          />
        </Field>
        <Field label="MRR (€/mois)">
          <input
            type="number"
            min="0"
            step="0.01"
            value={f.mrr}
            onChange={(e) => set("mrr")(e.target.value)}
            className={FIELD_CLS}
          />
        </Field>
      </FormSection>

      <FormButtons onCancel={onCancel} disabled={!f.societe.trim()} />
    </form>
  );
}

function FormSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-st-na">{title}</h3>
      <div className="grid gap-2.5 sm:grid-cols-2">{children}</div>
    </div>
  );
}

/** Edit an existing contact, or add a new one (no `initial`). */
function ContactForm({
  initial,
  onSave,
  onCancel,
}: {
  initial?: ProspectContactDTO;
  onSave: (v: ContactInput) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [email, setEmail] = useState(initial?.email ?? "");
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [role, setRole] = useState(initial?.role ?? "");
  const [linkedin, setLinkedin] = useState(initial?.linkedin ?? "");
  const empty = !name.trim() && !email.trim() && !phone.trim();

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (empty) return;
        onSave({
          name: name.trim() || null,
          email: email.trim() || null,
          phone: phone.trim() || null,
          role: role.trim() || null,
          linkedin: linkedin.trim() || null,
        });
      }}
      className="mb-3 space-y-2 rounded-lg border border-brand-200 bg-brand-50/40 p-3"
    >
      <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Nom…" className={FIELD_CLS} />
      <input value={role} onChange={(e) => setRole(e.target.value)} placeholder="Rôle (ex. Gérant)…" className={FIELD_CLS} />
      <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="E-mail…" className={FIELD_CLS} />
      <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Téléphone…" className={FIELD_CLS} />
      <input value={linkedin} onChange={(e) => setLinkedin(e.target.value)} placeholder="URL LinkedIn…" className={FIELD_CLS} />
      <FormButtons onCancel={onCancel} disabled={empty} />
    </form>
  );
}

function PhoneEdit({ onSave }: { onSave: (value: string) => void }) {
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
      className="mt-0.5 w-36 rounded-md border border-dashed border-line bg-transparent px-2 py-1 text-xs text-ink placeholder:text-st-na focus:border-brand-500 focus:outline-none"
    />
  );
}

function NewTaskForm({
  onSubmit,
  onCancel,
}: {
  onSubmit: (v: {
    title: string;
    type: TaskType;
    dueAt: string | null;
    assignee: string | null;
  }) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState("");
  const [type, setType] = useState<TaskType>("call");
  const [due, setDue] = useState("");
  const [assignee, setAssignee] = useState("");

  return (
    <div className="mb-3 space-y-2 rounded-lg border border-brand-200 bg-brand-50/40 p-3">
      <input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Titre de la tâche…"
        className="w-full rounded-md border border-line bg-white px-2.5 py-1.5 text-sm text-ink placeholder:text-st-na focus:border-brand-500 focus:outline-none"
      />
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={type}
          onChange={(e) => setType(e.target.value as TaskType)}
          className="rounded-md border border-line bg-white px-2 py-1.5 text-xs text-ink focus:border-brand-500 focus:outline-none"
        >
          {Object.entries(TASK_TYPE_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <input
          type="datetime-local"
          value={due}
          onChange={(e) => setDue(e.target.value)}
          className="rounded-md border border-line bg-white px-2 py-1.5 text-xs text-ink focus:border-brand-500 focus:outline-none"
        />
        <select
          value={assignee}
          onChange={(e) => setAssignee(e.target.value)}
          className="rounded-md border border-line bg-white px-2 py-1.5 text-xs text-ink focus:border-brand-500 focus:outline-none"
        >
          <option value="">Non assigné</option>
          {OFFICER_OPTIONS.map((o) => (
            <option key={o.email} value={o.email}>
              {o.name}
            </option>
          ))}
        </select>
        <div className="ml-auto flex gap-1.5">
          <button
            onClick={onCancel}
            className="rounded-md px-2.5 py-1.5 text-xs text-ink-soft hover:bg-line/40"
          >
            Annuler
          </button>
          <button
            onClick={() =>
              title.trim() &&
              onSubmit({
                title: title.trim(),
                type,
                dueAt: due ? new Date(due).toISOString() : null,
                assignee: assignee || null,
              })
            }
            disabled={!title.trim()}
            className="rounded-md bg-brand-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          >
            Créer
          </button>
        </div>
      </div>
    </div>
  );
}
