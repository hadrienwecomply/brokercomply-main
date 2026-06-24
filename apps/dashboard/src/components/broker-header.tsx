import { ArrowDown, Building2, Globe, Mail, User, CalendarCheck } from "lucide-react";
import type { Broker, Officer } from "@/lib/types";
import { brokerProgress, daysUntil, nextAction, stepStatus } from "@/lib/plan";
import { formatDate, flag } from "@/lib/format";
import { Avatar, ProgressRing, StatusBadge } from "./ui";
import { EditBrokerButton } from "./edit-broker-button";
import { cn } from "@/lib/cn";

export function BrokerHeader({
  broker,
  officer,
  today,
}: {
  broker: Broker;
  officer?: Officer;
  today: string;
}) {
  const progress = brokerProgress(broker);
  const na = nextAction(broker);
  const days = na ? daysUntil(na.step.deadline, new Date(today)) : null;
  const overdue = days !== null && days < 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <h1 className="font-display text-3xl font-semibold tracking-tight text-ink">
          {broker.societe}
        </h1>
        <span className="text-2xl">{broker.countries.map(flag).join(" ")}</span>
        <div className="ml-auto">
          <EditBrokerButton broker={broker} />
        </div>
      </div>

      {/* Bento: next action (hero) + progress + assignee */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* HERO — next action, the 2-second focus */}
        <div className="relative overflow-hidden rounded-lg border border-brand-300 bg-brand-50 p-6 lg:col-span-2">
          <span className="absolute inset-y-0 left-0 w-1.5 bg-brand-500" />
          <p className="text-xs font-semibold uppercase tracking-widest text-brand-700">
            Prochaine action
          </p>
          {na ? (
            <>
              <p className="mt-3 text-sm font-medium text-brand-700/80">
                Étape {na.step.code} · {na.step.title}
              </p>
              <p className="mt-1 font-display text-2xl font-semibold leading-snug text-ink sm:text-[1.75rem]">
                {na.subStep.title}
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <StatusBadge status={na.subStep.status} />
                {na.step.deadline && (
                  <span
                    className={cn(
                      "text-sm font-medium",
                      overdue ? "text-st-blocked" : "text-ink-soft",
                    )}
                  >
                    {overdue
                      ? `En retard de ${Math.abs(days!)} jours`
                      : days !== null
                        ? `Échéance dans ${days} jours · ${formatDate(na.step.deadline)}`
                        : ""}
                  </span>
                )}
                <span className="ml-auto inline-flex items-center gap-1 text-xs text-brand-700/70">
                  <ArrowDown className="size-3.5" /> détail ci-dessous
                </span>
              </div>
            </>
          ) : (
            <p className="mt-4 font-display text-2xl font-semibold text-brand-700">
              Plan d&apos;action complété 🎉
            </p>
          )}
        </div>

        {/* Right column: progress + assignee */}
        <div className="grid gap-4">
          <div className="flex items-center gap-4 rounded-lg border border-line bg-white p-5">
            <ProgressRing value={progress.pct} size={64} stroke={7} />
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-st-na">
                Avancement
              </p>
              <p className="font-display text-lg font-semibold text-ink">
                {progress.doneSteps}/{progress.activeSteps} étapes
              </p>
              {progress.currentStep && (
                <StatusBadge status={stepStatus(progress.currentStep)} className="mt-1" />
              )}
            </div>
          </div>

          <div className="flex items-center gap-3 rounded-lg border border-line bg-white p-5">
            <Avatar name={officer?.name ?? "?"} className="size-11 text-sm" />
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-st-na">
                Assigné à
              </p>
              <p className="text-lg font-semibold text-ink">{officer?.name}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Secondary metadata strip */}
      <div className="flex flex-wrap items-center gap-x-8 gap-y-3 rounded-lg border border-line bg-white px-6 py-4">
        <Meta icon={User} label="Contact" value={broker.contact} />
        {broker.emails[0] && <Meta icon={Mail} label="E-mail" value={broker.emails[0]} />}
        {broker.bce && <Meta icon={Building2} label="BCE" value={broker.bce} />}
        {broker.website && (
          <Meta
            icon={Globe}
            label="Site"
            value={broker.website.replace(/^https?:\/\//, "")}
            href={broker.website}
          />
        )}
        <Meta icon={CalendarCheck} label="Signature" value={formatDate(broker.signatureDate)} />
      </div>
    </div>
  );
}

function Meta({
  icon: Icon,
  label,
  value,
  href,
}: {
  icon: typeof User;
  label: string;
  value: string;
  href?: string;
}) {
  const body = (
    <>
      <span className="text-[11px] font-medium uppercase tracking-wide text-st-na">
        {label}
      </span>
      <span className="text-sm font-medium text-ink">{value}</span>
    </>
  );
  return (
    <div className="flex items-center gap-2.5">
      <Icon className="size-4 shrink-0 text-st-na" />
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className="flex flex-col hover:text-brand-700"
        >
          {body}
        </a>
      ) : (
        <div className="flex flex-col">{body}</div>
      )}
    </div>
  );
}
