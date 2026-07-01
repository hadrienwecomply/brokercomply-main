"use client";

import { useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";

type TabKey = "plan" | "forms";

/**
 * Client tab switcher for the broker detail view. Server-rendered content is
 * passed in as `plan` / `forms` slots (React nodes), so the heavy data fetching
 * stays in the server component while only the active-tab state lives here.
 */
export function BrokerDetailTabs({
  plan,
  forms,
  formsCount,
}: {
  plan: ReactNode;
  forms: ReactNode;
  formsCount: number;
}) {
  const [active, setActive] = useState<TabKey>("plan");

  const tabs: Array<{ key: TabKey; label: string; count?: number }> = [
    { key: "plan", label: "Plan d'action" },
    { key: "forms", label: "Formulaires", count: formsCount },
  ];

  return (
    <section className="space-y-5">
      <div className="flex items-center gap-1 border-b border-line">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActive(tab.key)}
            className={cn(
              "-mb-px inline-flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors",
              active === tab.key
                ? "border-brand-500 text-brand-700"
                : "border-transparent text-ink-soft hover:text-ink",
            )}
          >
            {tab.label}
            {tab.count != null && tab.count > 0 && (
              <span className="inline-flex min-w-5 items-center justify-center rounded-pill bg-brand-50 px-1.5 text-xs font-semibold text-brand-700">
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className={cn(active !== "plan" && "hidden")}>{plan}</div>
      <div className={cn(active !== "forms" && "hidden")}>{forms}</div>
    </section>
  );
}
