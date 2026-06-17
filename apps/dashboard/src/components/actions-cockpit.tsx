"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Clock,
  CalendarDays,
  CalendarClock,
  Hourglass,
  LayoutList,
  KanbanSquare,
  ArrowUpRight,
  X,
  ArrowDown,
} from "lucide-react";
import type { Broker, Officer } from "@/lib/types";
import {
  buildCockpit,
  matchesFilter,
  weekLoad,
  type Bucket,
  type CockpitAction,
} from "@/lib/actions";
import { cn } from "@/lib/cn";
import { Avatar, Card, StatusBadge } from "./ui";
import { EmailModal } from "./email-modal";
import { ActionCard } from "./action-card";
import { WeekDeadlinesChart } from "./week-deadlines-chart";

const BUCKETS: { id: Bucket; label: string; icon: typeof Clock }[] = [
  { id: "overdue", label: "En retard", icon: AlertTriangle },
  { id: "today", label: "Aujourd'hui", icon: Clock },
  { id: "week", label: "Cette semaine", icon: CalendarDays },
  { id: "later", label: "Plus tard", icon: CalendarClock },
];

export function ActionsCockpit({
  brokers,
  officers,
  today,
}: {
  brokers: Broker[];
  officers: Officer[];
  today: string;
}) {
  const [officerId, setOfficerId] = useState<string>("sacha");
  const [filter, setFilter] = useState<string>("all");
  const [tab, setTab] = useState<"cards" | "kanban">("cards");
  const [done, setDone] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [openSections, setOpenSections] = useState<Set<string>>(
    new Set(["overdue", "today", "week"]),
  );
  const [relanceOpen, setRelanceOpen] = useState(false);

  const officerName = useMemo(() => {
    const m = new Map<string, string>();
    officers.forEach((o) => m.set(o.id, o.name));
    return m;
  }, [officers]);

  const { actions, relances } = useMemo(
    () => buildCockpit(brokers, officerId, today),
    [brokers, officerId, today],
  );

  const liveActions = actions.filter((a) => !done.has(a.broker.id));
  const week = useMemo(() => weekLoad(liveActions, today), [liveActions, today]);
  const focus = liveActions[0];
  const shown = liveActions.filter((a) => matchesFilter(a, filter));

  const kpis = [
    { key: "week", label: "Cette semaine", icon: CalendarDays, count: liveActions.filter((a) => a.bucket === "week").length, tone: "neutral" as const },
    { key: "overdue", label: "En retard", icon: AlertTriangle, count: liveActions.filter((a) => a.bucket === "overdue").length, tone: "danger" as const },
    { key: "today", label: "Aujourd'hui", icon: Clock, count: liveActions.filter((a) => a.bucket === "today").length, tone: "warn" as const },
    { key: "relance", label: "En attente client", icon: Hourglass, count: relances.length, tone: "neutral" as const },
  ];

  const toggle = (set: Set<string>, key: string) => {
    const next = new Set(set);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
  };

  const onKpi = (key: string) => {
    if (key === "relance") {
      setRelanceOpen(true);
      return;
    }
    setFilter((f) => (f === key ? "all" : key));
  };

  const officerTabs = [
    ...officers.filter((o) => o.role === "officer").map((o) => ({ id: o.id, label: o.name })),
    { id: "all", label: "Tous" },
  ];

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-brand-700">
            Poste de pilotage
          </p>
          <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight text-ink">
            Prochaines actions
          </h1>
        </div>
        <div className="inline-flex rounded-md border border-line bg-white p-0.5">
          {officerTabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setOfficerId(t.id)}
              className={cn(
                "rounded-[0.4rem] px-3.5 py-1.5 text-sm font-medium transition-colors",
                officerId === t.id ? "bg-brand-500 text-white" : "text-ink-soft hover:bg-line/60",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </header>

      {/* Row 1: Focus (2/3) + KPIs (1/3) */}
      <div className="grid gap-4 lg:grid-cols-3">
        <FocusCard focus={focus} />
        <div className="grid grid-cols-2 gap-3">
          {kpis.map((k) => (
            <KpiCard
              key={k.key}
              label={k.label}
              icon={k.icon}
              count={k.count}
              tone={k.tone}
              active={filter === k.key}
              onClick={() => onKpi(k.key)}
            />
          ))}
        </div>
      </div>

      {/* Row 2: chart */}
      <Card className="p-5">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-ink">Charge des 7 prochains jours</h2>
          {filter !== "all" && (
            <button
              onClick={() => setFilter("all")}
              className="inline-flex items-center gap-1 rounded-pill bg-line px-2.5 py-1 text-xs font-medium text-ink-soft hover:bg-line/70"
            >
              Filtre actif <X className="size-3" />
            </button>
          )}
        </div>
        <WeekDeadlinesChart data={week} activeKey={filter} onSelect={(k) => setFilter((f) => (f === k ? "all" : k))} />
      </Card>

      {/* Work tabs */}
      <div className="flex items-center gap-3">
        <div className="inline-flex rounded-md border border-line bg-white p-0.5">
          {([
            { id: "cards", label: "Cartes", icon: LayoutList },
            { id: "kanban", label: "Kanban", icon: KanbanSquare },
          ] as const).map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-[0.4rem] px-3.5 py-1.5 text-sm font-medium transition-colors",
                tab === t.id ? "bg-ink text-white" : "text-ink-soft hover:bg-line/60",
              )}
            >
              <t.icon className="size-4" />
              {t.label}
            </button>
          ))}
        </div>
        <span className="text-sm text-st-na">{shown.length} action(s)</span>
      </div>

      {tab === "cards" ? (
        <div className="space-y-4">
          {BUCKETS.map((b) => {
            const items = shown.filter((a) => a.bucket === b.id);
            if (items.length === 0) return null;
            const open = openSections.has(b.id);
            return (
              <section key={b.id}>
                <button
                  onClick={() => setOpenSections((s) => toggle(s, b.id))}
                  aria-expanded={open}
                  className="mb-2 flex w-full items-center gap-2 rounded-md px-2 py-2 transition-colors hover:bg-line/50"
                >
                  <b.icon
                    className={cn(
                      "size-4",
                      b.id === "overdue" ? "text-st-blocked" : b.id === "today" ? "text-st-waiting" : "text-st-na",
                    )}
                  />
                  <span className="text-base font-semibold text-ink">{b.label}</span>
                  <span
                    className={cn(
                      "rounded-pill px-2 py-0.5 text-xs font-semibold",
                      b.id === "overdue" ? "bg-[#fde2e5] text-[#bb1626]" : "bg-line text-ink-soft",
                    )}
                  >
                    {items.length}
                  </span>
                  <ArrowDown
                    className={cn(
                      "ml-auto size-4 text-ink-soft transition-transform",
                      !open && "-rotate-90",
                    )}
                  />
                </button>
                {open && (
                  <div className="space-y-2.5">
                    {items.map((a) => (
                      <ActionCard
                        key={a.broker.id}
                        action={a}
                        officerName={officerName.get(a.broker.officerId) ?? "?"}
                        done={done.has(a.broker.id)}
                        onToggleDone={() => setDone((s) => toggle(s, a.broker.id))}
                        expanded={expanded.has(a.broker.id)}
                        onToggleExpand={() => setExpanded((s) => toggle(s, a.broker.id))}
                      />
                    ))}
                  </div>
                )}
              </section>
            );
          })}
          {shown.length === 0 && <EmptyState />}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {BUCKETS.map((b) => {
            const items = shown.filter((a) => a.bucket === b.id);
            return (
              <div key={b.id} className="flex flex-col rounded-lg bg-line/40 p-2.5">
                <div className="flex items-center gap-2 px-2 py-2">
                  <b.icon className={cn("size-4", b.id === "overdue" ? "text-st-blocked" : b.id === "today" ? "text-st-waiting" : "text-st-na")} />
                  <h3 className="text-sm font-semibold text-ink">{b.label}</h3>
                  <span className="ml-auto rounded-pill bg-white px-2 py-0.5 text-xs font-medium text-ink-soft">
                    {items.length}
                  </span>
                </div>
                <div className="flex flex-col gap-2.5">
                  {items.map((a) => (
                    <ActionCard
                      key={a.broker.id}
                      action={a}
                      officerName={officerName.get(a.broker.officerId) ?? "?"}
                      done={done.has(a.broker.id)}
                      onToggleDone={() => setDone((s) => toggle(s, a.broker.id))}
                      expanded={expanded.has(a.broker.id)}
                      onToggleExpand={() => setExpanded((s) => toggle(s, a.broker.id))}
                      compact
                    />
                  ))}
                  {items.length === 0 && (
                    <p className="px-2 py-6 text-center text-xs text-st-na">—</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Relance section */}
      <RelanceSection
        relances={relances}
        officerName={officerName}
        open={relanceOpen}
        onToggle={() => setRelanceOpen((v) => !v)}
      />
    </div>
  );
}

/* --------------------------------------------------------------- Focus card */

function FocusCard({ focus }: { focus?: CockpitAction }) {
  if (!focus) {
    return (
      <Card className="flex items-center justify-center p-6 lg:col-span-2">
        <p className="text-ink-soft">Aucune action urgente à traiter. ✨</p>
      </Card>
    );
  }
  const overdue = focus.bucket === "overdue";
  return (
    <div className="relative overflow-hidden rounded-lg border border-brand-300 bg-brand-50 p-6 lg:col-span-2">
      <span className="absolute inset-y-0 left-0 w-1.5 bg-brand-500" />
      <p className="text-xs font-semibold uppercase tracking-widest text-brand-700">
        Focus maintenant
      </p>
      <p className="mt-3 text-sm font-medium text-brand-700/80">
        {focus.broker.societe} · {focus.step.code} {focus.step.title}
      </p>
      <p className="mt-1 font-display text-2xl font-semibold leading-snug text-ink sm:text-[1.75rem]">
        {focus.subStep.title}
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <StatusBadge status={focus.subStep.status} />
        <span className={cn("text-sm font-medium", overdue ? "text-st-blocked" : "text-ink-soft")}>
          {focus.days === null
            ? ""
            : overdue
              ? `En retard de ${Math.abs(focus.days)} jours`
              : focus.days === 0
                ? "À traiter aujourd'hui"
                : `Échéance dans ${focus.days} jours`}
        </span>
        <span className="ml-auto inline-flex items-center gap-2">
          {focus.subStep.emailTemplate && (
            <EmailModal template={focus.subStep.emailTemplate} label="Modèle" />
          )}
          <Link
            href={`/courtiers/${focus.broker.id}`}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-md bg-brand-500 px-4 text-sm font-semibold text-white transition-colors hover:bg-brand-600"
          >
            Ouvrir le courtier <ArrowUpRight className="size-4" />
          </Link>
        </span>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------- KPI card */

function KpiCard({
  label,
  icon: Icon,
  count,
  tone,
  active,
  onClick,
}: {
  label: string;
  icon: typeof Clock;
  count: number;
  tone: "danger" | "warn" | "neutral";
  active: boolean;
  onClick: () => void;
}) {
  const toneText =
    tone === "danger" ? "text-st-blocked" : tone === "warn" ? "text-st-waiting" : "text-ink";
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex flex-col justify-between rounded-lg border bg-white p-4 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40",
        active ? "border-brand-400 ring-2 ring-brand-100" : "border-line hover:border-brand-300",
      )}
    >
      <span className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-st-na">
        <Icon className="size-3.5" />
        {label}
      </span>
      <span className={cn("mt-2 font-display text-3xl font-semibold tabular-nums", toneText)}>
        {count}
      </span>
    </button>
  );
}

/* ------------------------------------------------------------ Relance block */

function RelanceSection({
  relances,
  officerName,
  open,
  onToggle,
}: {
  relances: Broker[];
  officerName: Map<string, string>;
  open: boolean;
  onToggle: () => void;
}) {
  if (relances.length === 0) return null;
  return (
    <section className="rounded-lg border border-line bg-white">
      <button
        onClick={onToggle}
        className="flex w-full items-center gap-2 px-5 py-4"
        aria-expanded={open}
      >
        <Hourglass className="size-4 text-st-waiting" />
        <span className="font-semibold text-ink">À relancer</span>
        <span className="rounded-pill bg-st-waiting/15 px-2 py-0.5 text-xs font-medium text-st-waiting">
          {relances.length}
        </span>
        <span className="ml-2 text-sm text-st-na">en attente d&apos;une réponse client</span>
        <ArrowDown className={cn("ml-auto size-4 text-st-na transition-transform", !open && "-rotate-90")} />
      </button>
      {open && (
        <ul className="divide-y divide-line border-t border-line">
          {relances.map((b) => {
            const firstName = b.contact.split(/\s+/)[0] ?? b.contact;
            return (
              <li key={b.id} className="flex items-center gap-3 px-5 py-3">
                <Avatar name={officerName.get(b.officerId) ?? "?"} className="size-7 text-[10px]" />
                <div className="min-w-0 flex-1">
                  <Link href={`/courtiers/${b.id}`} className="font-medium text-ink hover:text-brand-700">
                    {b.societe}
                  </Link>
                  <p className="truncate text-sm text-st-na">{b.contact}</p>
                </div>
                <EmailModal
                  label="Relancer"
                  template={{
                    subject: `Petit rappel — ${b.societe}`,
                    body: `Bonjour ${firstName},\n\nJe me permets de revenir vers toi : nous attendons ton retour pour avancer sur ton plan d'action de conformité.\n\nN'hésite pas si tu as la moindre question, je reste à ta disposition.\n\nBien à toi,`,
                  }}
                />
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function EmptyState() {
  return (
    <Card className="px-4 py-12 text-center text-st-na">
      Rien ici pour ce filtre.
    </Card>
  );
}
