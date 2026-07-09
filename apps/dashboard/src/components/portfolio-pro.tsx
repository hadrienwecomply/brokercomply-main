"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Search,
  Table2,
  LayoutGrid,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  ChevronRight,
} from "lucide-react";
import {
  ResponsiveContainer,
  RadialBarChart,
  RadialBar,
  PolarAngleAxis,
  PieChart,
  Pie,
  Cell,
  Tooltip,
} from "recharts";
import type { Broker, Officer, PlanStep, StepStatus } from "@/lib/types";
import {
  brokerProgress,
  daysUntil,
  nextAction,
  stepStatus,
  type BrokerProgress,
  type NextAction,
} from "@/lib/plan";
import { flag } from "@/lib/format";
import { cn } from "@/lib/cn";

/* ------------------------------------------------------------------ tokens */
/** Neutral slate carries the UI; mauve = brand accent, green = success. */
const STATUS: Record<StepStatus | "done", { label: string; dot: string; pill: string }> = {
  not_started: { label: "À démarrer", dot: "bg-slate-400", pill: "bg-slate-100 text-slate-600 ring-slate-200" },
  in_progress: { label: "En cours", dot: "bg-[#7e86dc]", pill: "bg-[#eef0fb] text-[#3b3f8f] ring-[#cdd1f2]" },
  waiting_client: { label: "Attente client", dot: "bg-amber-500", pill: "bg-amber-50 text-amber-700 ring-amber-200" },
  blocked: { label: "Bloqué", dot: "bg-rose-500", pill: "bg-rose-50 text-rose-700 ring-rose-200" },
  done: { label: "Terminé", dot: "bg-[#5fbf99]", pill: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  empty: { label: "Aucune tâche", dot: "bg-slate-300", pill: "bg-slate-50 text-slate-400 ring-slate-200" },
};

/** Plan macro-phases for the distribution donut. */
const PHASES = [
  { id: "onboarding", label: "Onboarding", codes: ["01", "02"], color: "#7e86dc" },
  { id: "remediation", label: "Remédiations", codes: ["03.01", "03.02", "04.01", "04.02", "05.01", "05.02", "06"], color: "#f0ad4e" },
  { id: "conformite", label: "Conformité", codes: ["07", "08", "09", "10"], color: "#3b3f8f" },
  { id: "done", label: "Complété", codes: [] as string[], color: "#5fbf99" },
];

function phaseOf(currentStep: PlanStep | undefined): string {
  if (!currentStep) return "done";
  return PHASES.find((p) => p.codes.includes(currentStep.code))?.id ?? "remediation";
}

type SortKey = "name" | "progress" | "deadline";
type ViewId = "table" | "cards";

interface Row {
  broker: Broker;
  progress: BrokerProgress;
  status: StepStatus;
  na: NextAction | null;
  days: number | null;
  overdue: boolean;
  officerName: string;
}

/* ------------------------------------------------------------------ shared */

function StatusDot({ status }: { status: StepStatus }) {
  return (
    <span
      title={STATUS[status].label}
      className={cn("inline-block size-2.5 shrink-0 rounded-full", STATUS[status].dot)}
    />
  );
}

function ProgressMeter({ value }: { value: number }) {
  const v = Math.max(0, Math.min(100, value));
  const tone = v === 100 ? "bg-[#5fbf99]" : v >= 50 ? "bg-[#7e86dc]" : "bg-slate-400";
  return (
    <div className="flex items-center gap-2.5">
      <div className="h-1.5 w-28 overflow-hidden rounded-full bg-slate-200">
        <div className={cn("h-full rounded-full transition-[width] duration-500", tone)} style={{ width: `${v}%` }} />
      </div>
      <span className="w-9 text-right text-sm font-semibold tabular-nums text-slate-900">{v}%</span>
    </div>
  );
}

/** Small broker logo thumbnail for list views; renders nothing when no logo. */
function LogoThumb({ broker, className }: { broker: Broker; className?: string }) {
  if (!broker.hasLogo || !broker.dbId) return null;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-md border border-slate-200 bg-white",
        className,
      )}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`/api/brokers/${broker.dbId}/logo`}
        alt=""
        className="size-full object-contain p-0.5"
      />
    </span>
  );
}

function Initials({ name, className }: { name: string; className?: string }) {
  const init = name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("");
  return (
    <span
      title={name}
      className={cn(
        "inline-flex size-7 items-center justify-center rounded-full bg-[#eef0fb] text-xs font-semibold text-[#3b3f8f] ring-1 ring-inset ring-[#cdd1f2]",
        className,
      )}
    >
      {init}
    </span>
  );
}

function DeadlineChip({ days, overdue }: { days: number | null; overdue: boolean }) {
  if (days === null) return <span className="text-sm text-slate-400">—</span>;
  if (overdue)
    return (
      <span className="inline-flex items-center rounded-md bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-700">
        En retard · {Math.abs(days)} j
      </span>
    );
  if (days <= 7)
    return (
      <span className="inline-flex items-center rounded-md bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
        {days === 0 ? "Aujourd'hui" : `Dans ${days} j`}
      </span>
    );
  return <span className="text-sm text-slate-500">Dans {days} j</span>;
}

/* ====================================================================== root */

export function PortfolioPro({
  brokers,
  officers,
  today,
}: {
  brokers: Broker[];
  officers: Officer[];
  today: string;
}) {
  const todayDate = useMemo(() => new Date(today), [today]);
  const [search, setSearch] = useState("");
  const [officerFilter, setOfficerFilter] = useState<string>("all");
  const [view, setView] = useState<ViewId>("table");
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "deadline", dir: "asc" });

  const officerName = useMemo(() => {
    const m = new Map<string, string>();
    officers.forEach((o) => m.set(o.id, o.name));
    return m;
  }, [officers]);

  const allRows: Row[] = useMemo(() => {
    return brokers.map((b) => {
      const progress = brokerProgress(b);
      const na = nextAction(b);
      const days = na ? daysUntil(na.step.deadline, todayDate) : null;
      return {
        broker: b,
        progress,
        status: progress.currentStep ? stepStatus(progress.currentStep) : "done",
        na,
        days,
        overdue: days !== null && days < 0,
        officerName: officerName.get(b.officerId) ?? "?",
      };
    });
  }, [brokers, todayDate, officerName]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = allRows.filter(
      (r) =>
        (officerFilter === "all" || r.broker.officerId === officerFilter) &&
        (q === "" ||
          r.broker.societe.toLowerCase().includes(q) ||
          r.broker.contact.toLowerCase().includes(q)),
    );
    const dir = sort.dir === "asc" ? 1 : -1;
    return filtered.sort((a, b) => {
      switch (sort.key) {
        case "name":
          return a.broker.societe.localeCompare(b.broker.societe) * dir;
        case "progress":
          return (a.progress.pct - b.progress.pct) * dir;
        case "deadline": {
          const da = a.days ?? Infinity;
          const db = b.days ?? Infinity;
          return (da - db) * dir;
        }
      }
    });
  }, [allRows, officerFilter, search, sort]);

  /* KPIs — computed on officer scope (ignores search) */
  const kpis = useMemo(() => {
    const scope = allRows.filter((r) => officerFilter === "all" || r.broker.officerId === officerFilter);
    const total = scope.length || 1;
    const avg = Math.round(scope.reduce((acc, r) => acc + r.progress.pct, 0) / total);
    const completed = scope.filter((r) => !r.progress.currentStep).length;

    const phaseData = PHASES.map((p) => ({
      name: p.label,
      color: p.color,
      value: scope.filter((r) => phaseOf(r.progress.currentStep) === p.id).length,
    }));

    return { count: scope.length, avg, completed, phaseData };
  }, [allRows, officerFilter]);

  const officerTabs = [
    { id: "all", label: "Tous" },
    ...officers.filter((o) => o.role === "officer").map((o) => ({ id: o.id, label: o.name })),
  ];

  return (
    <div className="space-y-6">
      {/* -------------------------------------------------------- KPI strip */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <OverviewCard avg={kpis.avg} count={kpis.count} completed={kpis.completed} />
        <PhaseDonutCard data={kpis.phaseData} />
      </div>

      {/* ---------------------------------------------------------- toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-lg bg-slate-100 p-1">
          {officerTabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setOfficerFilter(t.id)}
              className={cn(
                "rounded-md px-3.5 py-1.5 text-sm font-medium transition-colors",
                officerFilter === t.id ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher un courtier…"
            className="h-10 w-64 rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-[#7e86dc] focus:ring-4 focus:ring-[#eef0fb]"
          />
        </div>

        <div className="ml-auto inline-flex rounded-lg bg-slate-100 p-1">
          {(
            [
              { id: "table", label: "Tableau", icon: Table2 },
              { id: "cards", label: "Cartes", icon: LayoutGrid },
            ] as const
          ).map((v) => (
            <button
              key={v.id}
              onClick={() => setView(v.id)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                view === v.id ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800",
              )}
            >
              <v.icon className="size-4" />
              <span className="hidden sm:inline">{v.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ------------------------------------------------------------ body */}
      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white py-20 text-center">
          <p className="text-sm font-medium text-slate-600">Aucun courtier ne correspond à la recherche.</p>
          <p className="mt-1 text-sm text-slate-400">Essayez un autre nom ou réinitialisez le filtre.</p>
        </div>
      ) : view === "table" ? (
        <TableView rows={rows} sort={sort} setSort={setSort} />
      ) : (
        <CardsView rows={rows} />
      )}
    </div>
  );
}

/* -------------------------------------------------------------- KPI visuals */

function OverviewCard({
  avg,
  count,
  completed,
}: {
  avg: number;
  count: number;
  completed: number;
}) {
  const pct = count ? Math.round((completed / count) * 100) : 0;
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-center gap-6">
        <div className="relative size-40 shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <RadialBarChart innerRadius="76%" outerRadius="100%" data={[{ value: avg }]} startAngle={90} endAngle={-270}>
              <PolarAngleAxis type="number" domain={[0, 100]} angleAxisId={0} tick={false} />
              <RadialBar background={{ fill: "#eef0f2" }} dataKey="value" angleAxisId={0} cornerRadius={12} fill="#5fbf99" isAnimationActive={false} />
            </RadialBarChart>
          </ResponsiveContainer>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="font-display text-4xl font-semibold tabular-nums text-slate-900">{avg}%</span>
            <span className="text-xs font-medium uppercase tracking-wide text-slate-500">avancement</span>
          </div>
        </div>

        <div className="flex-1 space-y-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Courtiers suivis</p>
            <p className="font-display text-5xl font-semibold tabular-nums tracking-tight text-slate-900">{count}</p>
          </div>
          <div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-500">Plans complétés</span>
              <span className="font-semibold tabular-nums text-slate-700">{completed}/{count}</span>
            </div>
            <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-slate-200">
              <div className="h-full rounded-full bg-[#5fbf99]" style={{ width: `${pct}%` }} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function PhaseDonutCard({ data }: { data: { name: string; value: number; color: string }[] }) {
  const total = data.reduce((a, d) => a + d.value, 0);
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Répartition par phase</p>
      <div className="mt-3 flex items-center gap-6">
        <div className="relative size-40 shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={data} dataKey="value" nameKey="name" innerRadius="64%" outerRadius="94%" paddingAngle={2} stroke="none" isAnimationActive={false}>
                {data.map((d) => (
                  <Cell key={d.name} fill={d.color} />
                ))}
              </Pie>
              <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="font-display text-2xl font-semibold tabular-nums text-slate-900">{total}</span>
            <span className="text-xs text-slate-500">courtiers</span>
          </div>
        </div>
        <ul className="flex-1 space-y-2.5 text-sm">
          {data.map((d) => (
            <li key={d.name} className="flex items-center gap-2">
              <span className="size-2.5 rounded-full" style={{ background: d.color }} />
              <span className="text-slate-600">{d.name}</span>
              <span className="ml-auto font-semibold tabular-nums text-slate-900">{d.value}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ table */

function SortHeader({
  label,
  col,
  sort,
  setSort,
  align = "left",
}: {
  label: string;
  col: SortKey;
  sort: { key: SortKey; dir: "asc" | "desc" };
  setSort: (s: { key: SortKey; dir: "asc" | "desc" }) => void;
  align?: "left" | "right";
}) {
  const active = sort.key === col;
  const Icon = !active ? ArrowUpDown : sort.dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <button
      onClick={() => setSort({ key: col, dir: active && sort.dir === "asc" ? "desc" : "asc" })}
      className={cn(
        "inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide transition-colors hover:text-slate-900",
        active ? "text-slate-900" : "text-slate-500",
        align === "right" && "flex-row-reverse",
      )}
    >
      {label}
      <Icon className={cn("size-3.5", !active && "text-slate-300")} />
    </button>
  );
}

function TableView({
  rows,
  sort,
  setSort,
}: {
  rows: Row[];
  sort: { key: SortKey; dir: "asc" | "desc" };
  setSort: (s: { key: SortKey; dir: "asc" | "desc" }) => void;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[680px] border-separate border-spacing-0 text-sm">
          <thead>
            <tr className="bg-slate-50">
              <th className="sticky left-0 z-10 bg-slate-50 px-5 py-3 text-left">
                <SortHeader label="Courtier" col="name" sort={sort} setSort={setSort} />
              </th>
              <th className="px-4 py-3 text-left">
                <SortHeader label="Avancement" col="progress" sort={sort} setSort={setSort} />
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                Prochaine action
              </th>
              <th className="px-4 py-3 text-left">
                <SortHeader label="Échéance" col="deadline" sort={sort} setSort={setSort} />
              </th>
              <th className="w-10 px-2 py-3" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.broker.id} className="group transition-colors hover:bg-slate-50">
                <td className="sticky left-0 z-10 border-t border-slate-100 bg-white px-5 py-3.5 group-hover:bg-slate-50">
                  <div className="flex items-center gap-3">
                    <LogoThumb broker={r.broker} className="size-9" />
                    <Initials name={r.officerName} className="size-7" />
                    <Link href={`/courtiers/${r.broker.id}`} className="block min-w-0">
                      <span className="block truncate font-semibold text-slate-900 group-hover:text-[#5b62c4]">
                        {r.broker.societe}
                      </span>
                      <span className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500">
                        <span>{r.broker.countries.map(flag).join(" ")}</span>
                        <span className="truncate">{r.broker.contact}</span>
                      </span>
                    </Link>
                  </div>
                </td>
                <td className="border-t border-slate-100 px-4 py-3.5">
                  <ProgressMeter value={r.progress.pct} />
                  <span className="mt-1 block text-xs text-slate-400">
                    {r.progress.doneSteps}/{r.progress.activeSteps} étapes
                  </span>
                </td>
                <td className="max-w-[18rem] border-t border-slate-100 px-4 py-3.5">
                  <div className="flex items-center gap-2">
                    <StatusDot status={r.status} />
                    {r.na ? (
                      <span className="truncate text-sm text-slate-700">{r.na.subStep.title}</span>
                    ) : (
                      <span className="text-sm font-medium text-emerald-600">Plan complété</span>
                    )}
                  </div>
                  {r.progress.currentStep && (
                    <span className="mt-0.5 block truncate pl-4 text-xs text-slate-400">
                      {r.progress.currentStep.code} · {r.progress.currentStep.title}
                    </span>
                  )}
                </td>
                <td className="border-t border-slate-100 px-4 py-3.5">
                  <DeadlineChip days={r.days} overdue={r.overdue} />
                </td>
                <td className="border-t border-slate-100 px-2 py-3.5">
                  <Link
                    href={`/courtiers/${r.broker.id}`}
                    aria-label={`Ouvrir ${r.broker.societe}`}
                    className="inline-flex size-7 items-center justify-center rounded-md text-slate-300 transition-colors hover:bg-slate-100 hover:text-slate-700"
                  >
                    <ChevronRight className="size-4" />
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ cards */

function CardsView({ rows }: { rows: Row[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {rows.map((r) => (
        <Link
          key={r.broker.id}
          href={`/courtiers/${r.broker.id}`}
          className="group flex flex-col rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-[#cdd1f2] hover:shadow-md"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <LogoThumb broker={r.broker} className="size-10" />
              <div className="min-w-0">
                <h3 className="truncate text-base font-semibold text-slate-900 group-hover:text-[#5b62c4]">
                  {r.broker.societe}
                </h3>
                <p className="mt-0.5 truncate text-sm text-slate-500">
                  {r.broker.countries.map(flag).join(" ")} · {r.broker.contact}
                </p>
              </div>
            </div>
            <StatusDot status={r.status} />
          </div>

          <div className="mt-4">
            <ProgressMeter value={r.progress.pct} />
            <p className="mt-1.5 text-xs text-slate-400">
              {r.progress.doneSteps}/{r.progress.activeSteps} étapes ·{" "}
              {r.progress.currentStep ? `${r.progress.currentStep.code} ${r.progress.currentStep.title}` : "terminé"}
            </p>
          </div>

          <div className="mt-4 rounded-lg bg-slate-50 px-3.5 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Prochaine action</p>
            {r.na ? (
              <div className="mt-1.5 flex items-center justify-between gap-2">
                <p className="truncate text-sm text-slate-700">{r.na.subStep.title}</p>
                <DeadlineChip days={r.days} overdue={r.overdue} />
              </div>
            ) : (
              <p className="mt-1 text-sm font-medium text-emerald-600">Plan complété</p>
            )}
          </div>

          <div className="mt-4 flex items-center border-t border-slate-100 pt-3.5 text-sm">
            <span className="inline-flex items-center gap-2 text-slate-500">
              <Initials name={r.officerName} className="size-6" />
              {r.officerName}
            </span>
          </div>
        </Link>
      ))}
    </div>
  );
}
