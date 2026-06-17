import type { Broker, PlanStep, StepStatus, SubStep } from "./types";

/** Derive a step's status from its sub-steps. */
export function stepStatus(step: PlanStep): StepStatus {
  if (!step.applicable) return "not_applicable";
  const subs = step.subSteps;
  if (subs.length === 0) return "not_started";
  if (subs.every((s) => s.status === "done")) return "done";
  if (subs.some((s) => s.status === "blocked")) return "blocked";
  if (subs.some((s) => s.status === "waiting_client")) return "waiting_client";
  if (subs.some((s) => s.status === "in_progress")) return "in_progress";
  if (subs.some((s) => s.status === "done")) return "in_progress";
  return "not_started";
}

export interface BrokerProgress {
  doneSubSteps: number;
  totalSubSteps: number;
  pct: number;
  currentStep?: PlanStep;
  doneSteps: number;
  applicableSteps: number;
}

/** Progress = done sub-steps / applicable sub-steps. */
export function brokerProgress(broker: Broker): BrokerProgress {
  const applicable = broker.plan.filter((s) => s.applicable);
  let done = 0;
  let total = 0;
  for (const step of applicable) {
    total += step.subSteps.length;
    done += step.subSteps.filter((s) => s.status === "done").length;
  }
  const currentStep = applicable.find((s) => {
    const st = stepStatus(s);
    return st !== "done" && st !== "not_applicable";
  });
  return {
    doneSubSteps: done,
    totalSubSteps: total,
    pct: total === 0 ? 0 : Math.round((done / total) * 100),
    currentStep,
    doneSteps: applicable.filter((s) => stepStatus(s) === "done").length,
    applicableSteps: applicable.length,
  };
}

export interface NextAction {
  broker: Broker;
  step: PlanStep;
  subStep: SubStep;
}

/**
 * The next concrete action for the officer: first sub-step in the active step
 * whose status is actionable (excludes `waiting_client` and `done`).
 */
export function nextAction(broker: Broker): NextAction | null {
  const { currentStep } = brokerProgress(broker);
  if (!currentStep) return null;
  const sub = currentStep.subSteps.find(
    (s) =>
      s.status === "not_started" ||
      s.status === "in_progress" ||
      s.status === "blocked",
  );
  if (!sub) return null;
  return { broker, step: currentStep, subStep: sub };
}

const URGENCY: Record<string, number> = {
  blocked: 0,
  in_progress: 1,
  not_started: 2,
};

/** Sort next actions by deadline then status urgency. Earliest deadline first. */
export function sortActions(actions: NextAction[]): NextAction[] {
  return [...actions].sort((a, b) => {
    const da = a.step.deadline ? new Date(a.step.deadline).getTime() : Infinity;
    const db = b.step.deadline ? new Date(b.step.deadline).getTime() : Infinity;
    if (da !== db) return da - db;
    return (URGENCY[a.subStep.status] ?? 9) - (URGENCY[b.subStep.status] ?? 9);
  });
}

export function daysUntil(iso: string | undefined, today: Date): number | null {
  if (!iso) return null;
  const target = new Date(iso);
  const ms = target.getTime() - today.getTime();
  return Math.round(ms / (1000 * 60 * 60 * 24));
}
