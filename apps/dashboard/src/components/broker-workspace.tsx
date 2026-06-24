"use client";

import { useState } from "react";
import type { Broker } from "@/lib/types";
import { brokerProgress, isActiveStep } from "@/lib/plan";
import { StepTimeline } from "./step-timeline";
import { StepPanel } from "./step-panel";

export function BrokerWorkspace({
  broker,
  today,
}: {
  broker: Broker;
  today: string;
}) {
  const current = brokerProgress(broker).currentStep;
  const fallback =
    [...broker.plan].reverse().find(isActiveStep)?.code ??
    broker.plan[0]!.code;
  const [selected, setSelected] = useState(current?.code ?? fallback);

  const step = broker.plan.find((s) => s.code === selected) ?? broker.plan[0]!;

  return (
    <div className="space-y-5">
      <StepTimeline
        steps={broker.plan}
        selectedCode={selected}
        currentCode={current?.code}
        onSelect={setSelected}
      />
      <StepPanel
        key={step.code}
        slug={broker.id}
        step={step}
        isCurrent={step.code === current?.code}
        today={today}
      />
    </div>
  );
}
