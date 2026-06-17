"use client";

import Link from "next/link";
import { Check, ChevronDown, ArrowUpRight } from "lucide-react";
import type { CockpitAction } from "@/lib/actions";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/cn";
import { Avatar, StatusBadge } from "./ui";
import { EmailModal } from "./email-modal";

export function ActionCard({
  action,
  officerName,
  done,
  onToggleDone,
  expanded,
  onToggleExpand,
  compact,
}: {
  action: CockpitAction;
  officerName: string;
  done: boolean;
  onToggleDone: () => void;
  expanded: boolean;
  onToggleExpand: () => void;
  compact?: boolean;
}) {
  const { broker, step, subStep, days, bucket } = action;
  const overdue = bucket === "overdue";
  const others = step.subSteps.filter((s) => s.id !== subStep.id);

  const deadlineText =
    days === null
      ? "—"
      : overdue
        ? `En retard de ${Math.abs(days)} j`
        : days === 0
          ? "Aujourd'hui"
          : `dans ${days} j`;

  return (
    <div
      className={cn(
        "rounded-lg border bg-white transition-colors",
        done ? "border-line opacity-55" : "border-line hover:border-brand-300",
      )}
    >
      <div className={cn("flex items-start gap-3", compact ? "p-3" : "p-4")}>
        <button
          type="button"
          role="checkbox"
          aria-checked={done}
          aria-label={`Marquer « ${subStep.title} » comme fait`}
          onClick={onToggleDone}
          className={cn(
            "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md border-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40",
            done
              ? "border-transparent bg-brand-500 text-white"
              : "border-st-na/60 bg-white hover:border-brand-400",
          )}
        >
          {done && <Check className="size-4" strokeWidth={3} />}
        </button>

        <div className="min-w-0 flex-1">
          {/* The action — dominant line */}
          <p
            className={cn(
              "font-medium text-ink",
              compact ? "text-base" : "text-lg leading-snug",
              done && "text-st-na line-through",
            )}
          >
            {subStep.title}
          </p>

          {/* Context */}
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-st-na">
            <Link
              href={`/courtiers/${broker.id}`}
              className="font-medium text-ink-soft hover:text-brand-700"
            >
              {broker.societe}
            </Link>
            <span aria-hidden>·</span>
            <span>
              {step.code} {step.title}
            </span>
          </div>

          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <StatusBadge status={subStep.status} />
            <span
              className={cn(
                "inline-flex items-center rounded-pill px-2.5 py-0.5 text-xs font-semibold",
                overdue
                  ? "bg-[#fde2e5] text-[#bb1626]"
                  : days === 0
                    ? "bg-[#fdf1da] text-[#8a5300]"
                    : "bg-line text-ink-soft",
              )}
              title={step.deadline ? formatDate(step.deadline) : undefined}
            >
              {deadlineText}
            </span>

            <div className="ml-auto flex items-center gap-1.5">
              {subStep.emailTemplate && (
                <EmailModal template={subStep.emailTemplate} label="Modèle" />
              )}
              <Link
                href={`/courtiers/${broker.id}`}
                className="inline-flex min-h-9 items-center gap-1 rounded-md border border-line px-2.5 py-1.5 text-sm font-medium text-ink-soft transition-colors hover:border-brand-300 hover:text-brand-700"
              >
                Ouvrir <ArrowUpRight className="size-3.5" />
              </Link>
              {others.length > 0 && (
                <button
                  type="button"
                  onClick={onToggleExpand}
                  aria-expanded={expanded}
                  aria-label="Voir les autres sous-étapes"
                  className="flex size-9 items-center justify-center rounded-md text-st-na transition-colors hover:bg-line/60 hover:text-ink"
                >
                  <ChevronDown
                    className={cn("size-4 transition-transform", expanded && "rotate-180")}
                  />
                </button>
              )}
            </div>
          </div>

          {expanded && others.length > 0 && (
            <ul className="mt-3 space-y-1.5 border-t border-line pt-3">
              {others.map((s) => (
                <li key={s.id} className="flex items-center gap-2 text-sm">
                  <span className="text-ink-soft">{s.title}</span>
                  <StatusBadge status={s.status} className="ml-auto" />
                </li>
              ))}
            </ul>
          )}
        </div>

        {!compact && <Avatar name={officerName} className="shrink-0" />}
      </div>
    </div>
  );
}
