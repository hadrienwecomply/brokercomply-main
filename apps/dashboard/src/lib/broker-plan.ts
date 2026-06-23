import type { BrokerPlanStep, BrokerPlanSubstep, PlanStepSeed } from "@brokercomply/shared";
import { STEP_TEMPLATES } from "./plan-template";
import { brokerProgress } from "./plan";
import type { Broker, PlanStep, SubStepStatus } from "./types";

/** Stable template sub-step id, e.g. "01-0" (matches the legacy mock convention). */
export function substepTemplateId(code: string, index: number): string {
  return `${code}-${index}`;
}

const DAY = 86_400_000;

function addDaysIso(isoDate: string, days: number): string {
  const base = new Date(`${isoDate}T00:00:00.000Z`);
  return new Date(base.getTime() + days * DAY).toISOString().slice(0, 10);
}

/** Effective deadline = manual override, else signature_date + sla_days. */
export function computeDeadline(
  signatureDate: string | null | undefined,
  slaDays: number,
  override: string | null | undefined,
): string | undefined {
  if (override) return override;
  if (!signatureDate) return undefined;
  return addDaysIso(signatureDate, slaDays);
}

/**
 * The blueprint used to materialise a broker's plan in the DB: every template
 * step (applicable = its default) with every template sub-step (not_started).
 */
export function planBlueprint(): PlanStepSeed[] {
  return STEP_TEMPLATES.map((tpl, stepIdx) => ({
    code: tpl.code,
    applicable: tpl.defaultApplicable,
    position: stepIdx,
    substeps: tpl.subSteps.map((_, j) => ({
      templateSubstepId: substepTemplateId(tpl.code, j),
      position: j,
    })),
  }));
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
 * Rebuild the rich `PlanStep[]` the UI expects by merging persisted state
 * (applicability, sub-step status, overrides) with the static template content.
 * Steps/sub-steps absent from the DB fall back to template defaults.
 */
export function assemblePlan(
  stepRows: BrokerPlanStep[],
  substepRows: BrokerPlanSubstep[],
  signatureDate: string | null | undefined,
): PlanStep[] {
  const stepByCode = new Map(stepRows.map((s) => [s.code, s]));
  const subsByStepId = groupBy(substepRows, (s) => s.stepId);

  return STEP_TEMPLATES.map((tpl) => {
    const stepRow = stepByCode.get(tpl.code);
    const dbSubs = stepRow ? (subsByStepId.get(stepRow.id) ?? []) : [];
    const subByTpl = new Map(dbSubs.map((s) => [s.templateSubstepId, s]));
    const override = stepRow?.deadlineOverride ?? null;

    return {
      code: tpl.code,
      dbId: stepRow?.id,
      title: tpl.title,
      applicable: stepRow ? stepRow.applicable : tpl.defaultApplicable,
      slaDays: tpl.slaDays,
      deadline: computeDeadline(signatureDate, tpl.slaDays, override),
      deadlineOverride: override,
      subSteps: tpl.subSteps.map((ss, j) => {
        const tplId = substepTemplateId(tpl.code, j);
        const row = subByTpl.get(tplId);
        return {
          id: tplId,
          dbId: row?.id,
          title: ss.title,
          status: (row?.status as SubStepStatus) ?? "not_started",
          actions: ss.actions,
          emailTemplate: ss.emailTemplate,
          supports: ss.supports,
        };
      }),
    };
  });
}

/**
 * Onboarding pipeline label, derived from plan progress (single source of truth).
 * Mirrors the legacy mock: once any applicable step is fully done the broker has
 * a validated plan; before that, the stage tracks step-01 sub-step completion.
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
