"use client";

import { useState } from "react";
import type { Broker } from "@/lib/types";
import type { SentEmailDTO } from "@/lib/mail.server";
import { brokerProgress } from "@/lib/plan";
import { StepTimeline } from "./step-timeline";
import { StepPanel } from "./step-panel";

export function BrokerWorkspace({
  broker,
  today,
  sentEmails,
  mailConfigured,
  mailRedirect,
}: {
  broker: Broker;
  today: string;
  sentEmails: SentEmailDTO[];
  mailConfigured: boolean;
  mailRedirect: string | null;
}) {
  const current = brokerProgress(broker).currentStep;
  const fallback =
    [...broker.plan].reverse().find((s) => s.applicable)?.code ??
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
        step={step}
        broker={broker}
        isCurrent={step.code === current?.code}
        today={today}
        sentEmails={sentEmails}
        mailConfigured={mailConfigured}
        mailRedirect={mailRedirect}
      />
    </div>
  );
}
