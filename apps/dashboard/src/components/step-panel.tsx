"use client";

import { useState } from "react";
import { Check, FileText, Link2, Video, CalendarClock } from "lucide-react";
import type { Broker, PlanStep, Support } from "@/lib/types";
import type { SentEmailDTO } from "@/lib/mail.server";
import { stepStatus, daysUntil } from "@/lib/plan";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/cn";
import { StatusBadge } from "./ui";
import { SendEmailModal } from "./send-email-modal";

const SUPPORT_ICON: Record<Support["type"], typeof FileText> = {
  pdf: FileText,
  link: Link2,
  video: Video,
};

export function StepPanel({
  step,
  broker,
  isCurrent,
  today,
  sentEmails,
  mailConfigured,
  mailRedirect,
}: {
  step: PlanStep;
  broker: Broker;
  isCurrent: boolean;
  today: string;
  sentEmails: SentEmailDTO[];
  mailConfigured: boolean;
  mailRedirect: string | null;
}) {
  const status = stepStatus(step);
  /** Most recent send (if any) for a given sub-step template id. */
  const lastSentFor = (substepId: string): string | null =>
    sentEmails.find((e) => e.substepTemplateId === substepId)?.sentAt ?? null;
  const days = daysUntil(step.deadline, new Date(today));
  const overdue = status !== "done" && days !== null && days < 0;

  // Local (non-persisted) checkbox state, seeded from the mocked statuses.
  const [checked, setChecked] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    for (const sub of step.subSteps) {
      const done = sub.status === "done";
      init[sub.id] = done;
      sub.actions?.forEach((_, i) => {
        init[`${sub.id}#${i}`] = done;
      });
    }
    return init;
  });

  const toggle = (key: string) =>
    setChecked((prev) => ({ ...prev, [key]: !prev[key] }));

  return (
    <section className="rounded-lg border border-line bg-white">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line px-6 py-5">
        <span className="font-mono text-base font-semibold text-brand-600">
          {step.code}
        </span>
        <h2 className="font-display text-2xl font-semibold text-ink">
          {step.title}
        </h2>
        <div className="ml-auto flex items-center gap-3">
          {step.deadline && status !== "done" && (
            <span
              className={cn(
                "inline-flex items-center gap-1.5 text-sm",
                overdue ? "font-semibold text-st-blocked" : "text-ink-soft",
              )}
            >
              <CalendarClock className="size-4" />
              {overdue
                ? `En retard de ${Math.abs(days!)} j`
                : `Échéance ${formatDate(step.deadline)}`}
            </span>
          )}
          <StatusBadge status={status} />
        </div>
      </header>

      {!isCurrent && (
        <p className="border-b border-line bg-canvas px-6 py-2.5 text-sm text-st-na">
          {status === "done"
            ? "Étape terminée — affichée pour consultation."
            : "Étape à venir — se débloque après l'étape en cours."}
        </p>
      )}

      <div className="divide-y divide-line">
        {step.subSteps.map((sub) => {
          const subStatus = sub.status;
          return (
            <div key={sub.id} className="px-6 py-5">
              <div className="flex items-start gap-3">
                <Checkbox
                  checked={!!checked[sub.id]}
                  onChange={() => toggle(sub.id)}
                  label={sub.title}
                />
                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span
                      className={cn(
                        "text-lg font-medium text-ink",
                        checked[sub.id] && "text-st-na line-through",
                      )}
                    >
                      {sub.title}
                    </span>
                    <StatusBadge status={subStatus} />
                  </div>

                  {sub.actions && sub.actions.length > 0 && (
                    <ul className="mt-3 space-y-2">
                      {sub.actions.map((action, i) => {
                        const key = `${sub.id}#${i}`;
                        return (
                          <li key={key} className="flex items-start gap-2.5">
                            <Checkbox
                              checked={!!checked[key]}
                              onChange={() => toggle(key)}
                              label={action}
                              small
                            />
                            <span
                              className={cn(
                                "text-base leading-snug",
                                checked[key]
                                  ? "text-st-na line-through"
                                  : "text-ink-soft",
                              )}
                            >
                              {action}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  )}

                  {(sub.emailTemplate || sub.supports?.length) && (
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {sub.emailTemplate && (
                        <SendEmailModal
                          broker={broker}
                          step={step}
                          substep={sub}
                          lastSentAt={lastSentFor(sub.id)}
                          configured={mailConfigured}
                          redirectTo={mailRedirect}
                        />
                      )}
                      {sub.supports?.map((s, i) => {
                        const Icon = SUPPORT_ICON[s.type];
                        return (
                          <span
                            key={i}
                            className="inline-flex min-h-11 items-center gap-2 rounded-md border border-line px-3 py-2 text-sm text-ink-soft"
                          >
                            <Icon className="size-4 text-st-na" />
                            {s.label}
                          </span>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Checkbox({
  checked,
  onChange,
  label,
  small,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
  small?: boolean;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      onClick={onChange}
      className={cn(
        "flex shrink-0 items-center justify-center rounded-md border-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40",
        small ? "mt-0.5 size-5" : "mt-1 size-6",
        checked
          ? "border-transparent bg-brand-500 text-white"
          : "border-st-na/60 bg-white hover:border-brand-400",
      )}
    >
      {checked && <Check className={small ? "size-3.5" : "size-4"} strokeWidth={3} />}
    </button>
  );
}
