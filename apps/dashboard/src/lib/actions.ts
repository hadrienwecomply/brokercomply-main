import type { Broker, PlanStep, SubStep } from "./types";
import { brokerProgress, daysUntil, effectiveDeadline, nextAction, stepStatus } from "./plan";

export type Bucket = "overdue" | "today" | "week" | "later";

export interface CockpitAction {
  broker: Broker;
  step: PlanStep;
  subStep: SubStep;
  days: number | null;
  bucket: Bucket;
}

export function bucketOf(days: number | null): Bucket {
  if (days === null) return "later";
  if (days < 0) return "overdue";
  if (days === 0) return "today";
  if (days <= 7) return "week";
  return "later";
}

const STATUS_RANK: Record<string, number> = {
  blocked: 0,
  in_progress: 1,
  not_started: 2,
};

export interface Cockpit {
  actions: CockpitAction[];
  relances: Broker[];
  completed: Broker[];
}

/** Build the cockpit data for a given officer scope ("all" or an officer id). */
export function buildCockpit(
  brokers: Broker[],
  officerId: string,
  todayIso: string,
): Cockpit {
  const today = new Date(todayIso);
  const scope = brokers.filter(
    (b) => officerId === "all" || b.officerId === officerId,
  );

  const actions: CockpitAction[] = [];
  const relances: Broker[] = [];
  const completed: Broker[] = [];

  for (const broker of scope) {
    const current = brokerProgress(broker).currentStep;
    if (!current) {
      completed.push(broker);
      continue;
    }
    // Ball in the client's court → follow-up list, not actionable work.
    if (stepStatus(current) === "waiting_client") {
      relances.push(broker);
      continue;
    }
    const na = nextAction(broker);
    if (!na) {
      relances.push(broker);
      continue;
    }
    const days = daysUntil(effectiveDeadline(na.step, na.subStep), today);
    actions.push({ ...na, days, bucket: bucketOf(days) });
  }

  actions.sort((a, b) => {
    const da = a.days ?? 1e9;
    const db = b.days ?? 1e9;
    if (da !== db) return da - db;
    return (
      (STATUS_RANK[a.subStep.status] ?? 9) - (STATUS_RANK[b.subStep.status] ?? 9)
    );
  });

  return { actions, relances, completed };
}

export interface WeekBar {
  key: string; // "overdue" | "d0".."d6"
  label: string;
  count: number;
  urgency: "overdue" | "soon" | "normal";
}

const dayFmt = new Intl.DateTimeFormat("fr-BE", {
  weekday: "short",
  day: "2-digit",
});

/** 7-day deadline load + an "overdue" bucket, for the bar chart. */
export function weekLoad(actions: CockpitAction[], todayIso: string): WeekBar[] {
  const today = new Date(todayIso);
  const bars: WeekBar[] = [
    {
      key: "overdue",
      label: "Retard",
      count: actions.filter((a) => a.bucket === "overdue").length,
      urgency: "overdue",
    },
  ];
  for (let i = 0; i < 7; i++) {
    const date = new Date(today.getTime() + i * 86_400_000);
    bars.push({
      key: `d${i}`,
      label: dayFmt.format(date),
      count: actions.filter((a) => a.days === i).length,
      urgency: i <= 2 ? "soon" : "normal",
    });
  }
  return bars;
}

/** Does an action match the active filter key? */
export function matchesFilter(action: CockpitAction, filter: string): boolean {
  if (filter === "all") return true;
  if (filter === "overdue") return action.bucket === "overdue";
  if (filter === "today") return action.bucket === "today";
  if (filter === "week") return action.bucket === "week";
  if (filter === "later") return action.bucket === "later";
  if (filter.startsWith("d")) return action.days === Number(filter.slice(1));
  return true;
}
