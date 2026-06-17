"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Clock, CalendarDays } from "lucide-react";
import type { Broker, Officer } from "@/lib/types";
import { daysUntil, nextAction, sortActions, type NextAction } from "@/lib/plan";
import { STATUS_DOT, STATUS_LABEL } from "@/lib/format";
import { cn } from "@/lib/cn";
import { Avatar, Card } from "./ui";

export function ActionsList({
  brokers,
  officers,
  today,
}: {
  brokers: Broker[];
  officers: Officer[];
  today: string;
}) {
  const todayDate = useMemo(() => new Date(today), [today]);
  const [officerFilter, setOfficerFilter] = useState<string>("all");

  const officerName = useMemo(() => {
    const m = new Map<string, string>();
    officers.forEach((o) => m.set(o.id, o.name));
    return m;
  }, [officers]);

  const actions = useMemo(() => {
    const list = brokers
      .filter((b) => officerFilter === "all" || b.officerId === officerFilter)
      .map((b) => nextAction(b))
      .filter((a): a is NextAction => a !== null);
    return sortActions(list);
  }, [brokers, officerFilter]);

  const groups = useMemo(() => {
    const overdue: NextAction[] = [];
    const week: NextAction[] = [];
    const later: NextAction[] = [];
    for (const a of actions) {
      const d = daysUntil(a.step.deadline, todayDate);
      if (d !== null && d < 0) overdue.push(a);
      else if (d !== null && d <= 7) week.push(a);
      else later.push(a);
    }
    return { overdue, week, later };
  }, [actions, todayDate]);

  const tabs = [
    { id: "all", label: "Tous" },
    ...officers
      .filter((o) => o.role === "officer")
      .map((o) => ({ id: o.id, label: o.name })),
  ];

  return (
    <div className="space-y-6">
      <div className="inline-flex rounded-md border border-line bg-white p-0.5">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setOfficerFilter(t.id)}
            className={cn(
              "rounded-[0.4rem] px-3 py-1.5 text-sm font-medium transition-colors",
              officerFilter === t.id
                ? "bg-brand-500 text-white"
                : "text-ink-soft hover:bg-line/60",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <Group
        title="En retard"
        icon={AlertTriangle}
        tone="blocked"
        items={groups.overdue}
        officerName={officerName}
        today={todayDate}
      />
      <Group
        title="Cette semaine"
        icon={Clock}
        tone="waiting"
        items={groups.week}
        officerName={officerName}
        today={todayDate}
      />
      <Group
        title="Plus tard"
        icon={CalendarDays}
        tone="todo"
        items={groups.later}
        officerName={officerName}
        today={todayDate}
      />
    </div>
  );
}

function Group({
  title,
  icon: Icon,
  tone,
  items,
  officerName,
  today,
}: {
  title: string;
  icon: typeof Clock;
  tone: "blocked" | "waiting" | "todo";
  items: NextAction[];
  officerName: Map<string, string>;
  today: Date;
}) {
  const toneColor = {
    blocked: "text-st-blocked",
    waiting: "text-st-waiting",
    todo: "text-st-na",
  }[tone];

  return (
    <section>
      <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-ink">
        <Icon className={cn("size-4", toneColor)} />
        {title}
        <span className="rounded-pill bg-line px-2 py-0.5 text-xs font-medium text-ink-soft">
          {items.length}
        </span>
      </h2>
      {items.length === 0 ? (
        <p className="text-sm text-st-na">Rien ici.</p>
      ) : (
        <Card className="divide-y divide-line/70">
          {items.map((a) => {
            const d = daysUntil(a.step.deadline, today);
            const overdue = d !== null && d < 0;
            return (
              <div
                key={a.broker.id}
                className="flex items-center gap-3 px-4 py-3 hover:bg-brand-50/40"
              >
                <span className={cn("size-2 rounded-full", STATUS_DOT[a.subStep.status])} />
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/courtiers/${a.broker.id}`}
                    className="font-medium text-ink hover:text-brand-700"
                  >
                    {a.broker.societe}
                  </Link>
                  <p className="truncate text-xs text-ink-soft">
                    {a.step.code} · {a.subStep.title}
                  </p>
                </div>
                <span className="hidden text-xs text-st-na sm:inline">
                  {STATUS_LABEL[a.subStep.status]}
                </span>
                <Avatar name={officerName.get(a.broker.officerId) ?? "?"} />
                <span
                  className={cn(
                    "w-24 text-right text-xs",
                    overdue ? "font-semibold text-st-blocked" : "text-st-na",
                  )}
                >
                  {d !== null
                    ? overdue
                      ? `−${Math.abs(d)} j`
                      : `dans ${d} j`
                    : "—"}
                </span>
              </div>
            );
          })}
        </Card>
      )}
    </section>
  );
}
