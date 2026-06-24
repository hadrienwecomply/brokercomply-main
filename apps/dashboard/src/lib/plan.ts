import type { Broker, PlanStep, StepStatus, SubStep } from "./types";

/** A section with at least one (non-archived) task is "active". */
export function isActiveStep(step: PlanStep): boolean {
  return step.subSteps.length > 0;
}

/** Derive a step's status from its sub-steps. Empty sections are neutral. */
export function stepStatus(step: PlanStep): StepStatus {
  const subs = step.subSteps;
  if (subs.length === 0) return "empty";
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
  activeSteps: number;
}

/** Progress = done tasks / tasks across active (non-empty) sections. */
export function brokerProgress(broker: Broker): BrokerProgress {
  const active = broker.plan.filter(isActiveStep);
  let done = 0;
  let total = 0;
  for (const step of active) {
    total += step.subSteps.length;
    done += step.subSteps.filter((s) => s.status === "done").length;
  }
  const currentStep = active.find((s) => stepStatus(s) !== "done");
  return {
    doneSubSteps: done,
    totalSubSteps: total,
    pct: total === 0 ? 0 : Math.round((done / total) * 100),
    currentStep,
    doneSteps: active.filter((s) => stepStatus(s) === "done").length,
    activeSteps: active.length,
  };
}

/** A task's effective deadline: its own due date, else the section deadline. */
export function effectiveDeadline(
  step: PlanStep,
  sub: SubStep,
): string | undefined {
  return sub.dueDate ?? step.deadline;
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

/** Sort next actions by effective deadline then status urgency. Earliest first. */
export function sortActions(actions: NextAction[]): NextAction[] {
  return [...actions].sort((a, b) => {
    const ea = effectiveDeadline(a.step, a.subStep);
    const eb = effectiveDeadline(b.step, b.subStep);
    const da = ea ? new Date(ea).getTime() : Infinity;
    const db = eb ? new Date(eb).getTime() : Infinity;
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
