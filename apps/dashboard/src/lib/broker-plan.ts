import type {
  BrokerPlanStep,
  BrokerPlanSubstep,
  PlanGlobals,
  PlanStepOffset,
  PlanStepSeed,
} from "@brokercomply/shared";
import { CONTENT_BY_KEY, stepOffsetSeeds } from "./plan-template";
import { brokerProgress } from "./plan";
import type { Broker, PlanStep, SubStepStatus } from "./types";

const DAY = 86_400_000;

function addDaysIso(isoDate: string, days: number): string {
  const base = new Date(`${isoDate}T00:00:00.000Z`);
  return new Date(base.getTime() + days * DAY).toISOString().slice(0, 10);
}

/** Effective section deadline = manual override, else signature_date + offset days. */
export function computeDeadline(
  signatureDate: string | null | undefined,
  offsetDays: number,
  override: string | null | undefined,
): string | undefined {
  if (override) return override;
  if (!signatureDate) return undefined;
  return addDaysIso(signatureDate, offsetDays);
}

/** Ordered section list, falling back to the code template when the DB is unseeded. */
function orderedOffsets(offsets: PlanStepOffset[]): PlanStepOffset[] {
  if (offsets.length === 0) {
    return stepOffsetSeeds().map((s) => ({
      code: s.code,
      title: s.title,
      offsetDays: s.offsetDays,
      position: s.position,
    }));
  }
  return [...offsets].sort((a, b) => a.position - b.position);
}

/**
 * The blueprint used to materialise a new broker's plan: every section (from the
 * global offsets) with its current non-archived template tasks, forked into the
 * broker's own rows (so later template edits don't touch this broker).
 */
export function planBlueprint(globals: PlanGlobals): PlanStepSeed[] {
  const tasksByStep = new Map<string, PlanGlobals["tasks"]>();
  for (const t of globals.tasks) {
    const bucket = tasksByStep.get(t.stepCode);
    if (bucket) bucket.push(t);
    else tasksByStep.set(t.stepCode, [t]);
  }
  return orderedOffsets(globals.offsets).map((off, stepIdx) => {
    const tasks = [...(tasksByStep.get(off.code) ?? [])].sort((a, b) => a.position - b.position);
    return {
      code: off.code,
      applicable: true,
      position: stepIdx,
      substeps: tasks.map((t, j) => ({
        contentKey: t.contentKey,
        title: t.title,
        emailSubject: t.emailSubject,
        emailBody: t.emailBody,
        isCustom: false,
        position: j,
      })),
    };
  });
}

function groupBy<T, K>(rows: T[], key: (r: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>();
  for (const row of rows) {
    const bucket = map.get(key(row));
    if (bucket) bucket.push(row);
    else map.set(key(row), [row]);
  }
  return map;
}

/**
 * Rebuild the rich `PlanStep[]` the UI expects from the broker's own (forked)
 * rows: sections come from the global offsets, tasks from `broker_plan_substeps`
 * (archived excluded), and supports/actions are resolved from code by content key.
 */
export function assemblePlan(
  stepRows: BrokerPlanStep[],
  substepRows: BrokerPlanSubstep[],
  signatureDate: string | null | undefined,
  offsets: PlanStepOffset[],
): PlanStep[] {
  const stepByCode = new Map(stepRows.map((s) => [s.code, s]));
  const liveSubs = substepRows.filter((s) => !s.archivedAt);
  const subsByStepId = groupBy(liveSubs, (s) => s.stepId);

  return orderedOffsets(offsets).map((off) => {
    const stepRow = stepByCode.get(off.code);
    const override = stepRow?.deadlineOverride ?? null;
    const dbSubs = stepRow ? [...(subsByStepId.get(stepRow.id) ?? [])] : [];
    dbSubs.sort((a, b) => a.position - b.position);

    return {
      code: off.code,
      dbId: stepRow?.id,
      title: off.title,
      deadline: computeDeadline(signatureDate, off.offsetDays, override),
      deadlineOverride: override,
      subSteps: dbSubs.map((row) => {
        const content = row.contentKey ? CONTENT_BY_KEY.get(row.contentKey) : undefined;
        const hasEmail = Boolean(row.emailSubject || row.emailBody);
        return {
          id: row.id,
          dbId: row.id,
          title: row.title ?? content?.title ?? "Tâche",
          status: row.status as SubStepStatus,
          dueDate: row.dueDate ?? null,
          isCustom: row.isCustom,
          actions: content?.actions,
          emailTemplate: hasEmail
            ? { subject: row.emailSubject ?? "", body: row.emailBody ?? "" }
            : content?.emailTemplate,
          supports: content?.supports,
        };
      }),
    };
  });
}

/**
 * Onboarding pipeline label, derived from plan progress (single source of truth).
 * Once any active section is fully done the broker has a validated plan; before
 * that, the stage tracks step-01 task completion.
 */
export function deriveOnboardingStatus(broker: Broker): string[] {
  const { doneSteps } = brokerProgress(broker);
  if (doneSteps >= 1) return ["Plan d'action validé"];
  const step01 = broker.plan[0];
  const s01done = step01 ? step01.subSteps.filter((s) => s.status === "done").length : 0;
  if (s01done === 0) return ["Diagnostic à envoyer"];
  if (s01done === 1) return ["Diagnostic envoyé"];
  if (s01done === 2) return ["Diagnostic rempli"];
  return ["Meeting plan action planifié"];
}
