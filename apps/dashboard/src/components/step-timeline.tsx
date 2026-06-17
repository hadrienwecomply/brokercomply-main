"use client";

import { useEffect, useRef } from "react";
import { Check } from "lucide-react";
import type { PlanStep, StepStatus } from "@/lib/types";
import { stepStatus } from "@/lib/plan";
import { STATUS_DOT } from "@/lib/format";
import { cn } from "@/lib/cn";

export function StepTimeline({
  steps,
  selectedCode,
  currentCode,
  onSelect,
}: {
  steps: PlanStep[];
  selectedCode: string;
  currentCode?: string;
  onSelect: (code: string) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const currentRef = useRef<HTMLButtonElement>(null);

  // Center the current step on mount.
  useEffect(() => {
    currentRef.current?.scrollIntoView({
      behavior: "auto",
      inline: "center",
      block: "nearest",
    });
  }, []);

  return (
    <div
      ref={scrollRef}
      className="overflow-x-auto pb-2 [scrollbar-width:thin]"
      role="tablist"
      aria-label="Étapes du plan d'action"
    >
      <div className="flex min-w-max items-start gap-0 px-1">
        {steps.map((step, i) => {
          const status = stepStatus(step);
          const isCurrent = step.code === currentCode;
          const isSelected = step.code === selectedCode;
          return (
            <div key={step.code} className="flex items-start">
              {i > 0 && (
                <span
                  aria-hidden
                  className={cn(
                    "mt-5 h-0.5 w-8 shrink-0 sm:w-12",
                    status === "done" || stepStatus(steps[i - 1]!) === "done"
                      ? "bg-brand-300"
                      : "bg-line",
                  )}
                />
              )}
              <button
                ref={isCurrent ? currentRef : undefined}
                role="tab"
                aria-selected={isSelected}
                onClick={() => onSelect(step.code)}
                className="group flex w-20 shrink-0 flex-col items-center gap-1.5 outline-none"
                title={`${step.code} · ${step.title}`}
              >
                <TimelineNode
                  status={status}
                  isCurrent={isCurrent}
                  isSelected={isSelected}
                  code={step.code}
                />
                <span
                  className={cn(
                    "line-clamp-2 px-0.5 text-center text-xs leading-tight transition-colors",
                    isSelected
                      ? "font-semibold text-ink"
                      : isCurrent
                        ? "font-medium text-ink-soft"
                        : "text-st-na group-hover:text-ink-soft",
                  )}
                >
                  {step.title}
                </span>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TimelineNode({
  status,
  isCurrent,
  isSelected,
  code,
}: {
  status: StepStatus;
  isCurrent: boolean;
  isSelected: boolean;
  code: string;
}) {
  const done = status === "done";
  return (
    <span
      className={cn(
        "relative flex size-10 items-center justify-center rounded-full border-2 text-sm font-semibold transition-all",
        done
          ? "border-transparent bg-brand-500 text-white"
          : isCurrent
            ? "border-brand-500 bg-white text-brand-700"
            : "border-line bg-white text-st-na",
        isSelected && "ring-4 ring-brand-500/25",
      )}
    >
      {done ? (
        <Check className="size-5" strokeWidth={3} />
      ) : (
        <span className="tabular-nums">{code.replace(/^0/, "")}</span>
      )}
      {!done && (
        <span
          aria-hidden
          className={cn(
            "absolute -bottom-1 size-2 rounded-full ring-2 ring-white",
            STATUS_DOT[status],
          )}
        />
      )}
    </span>
  );
}
