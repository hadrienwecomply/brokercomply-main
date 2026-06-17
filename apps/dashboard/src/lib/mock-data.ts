import seedData from "@/data/brokers.seed.json";
import { STEP_TEMPLATES } from "./plan-template";
import type { Broker, Officer, PlanStep, SubStepStatus } from "./types";

/** Fixed reference date so server and client renders match (no hydration drift). */
export const TODAY = new Date("2026-06-16T00:00:00.000Z");

export const OFFICERS: Officer[] = [
  { id: "sacha", name: "Sacha", role: "officer" },
  { id: "gregory", name: "Gregory", role: "officer" },
  { id: "founder", name: "Fondateur", role: "founder" },
];

interface RawBroker {
  societe: string;
  contact: string;
  emails: string[];
  countries: string[];
}

// ---- deterministic pseudo-random helpers -------------------------------------

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DAY = 86_400_000;
function addDays(base: Date, days: number): Date {
  return new Date(base.getTime() + days * DAY);
}
function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function brokerSlug(societe: string): string {
  return societe
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

// ---- broker builder ----------------------------------------------------------

function buildBroker(raw: RawBroker, index: number): Broker {
  const rng = mulberry32(hashString(`${raw.societe}:${index}`));
  const officerId = index % 2 === 0 ? "sacha" : "gregory";

  const monthsAgo = 1 + Math.floor(rng() * 8); // 1..8 months
  const signature = addDays(TODAY, -(monthsAgo * 30 + Math.floor(rng() * 25)));

  const steps: PlanStep[] = STEP_TEMPLATES.map((tpl) => {
    const isRecyclage = tpl.code.endsWith(".02");
    const applicable = isRecyclage
      ? rng() > 0.5
      : tpl.code === "08"
        ? rng() > 0.3
        : true;
    return {
      code: tpl.code,
      title: tpl.title,
      applicable,
      slaDays: tpl.slaDays,
      deadline: iso(addDays(signature, tpl.slaDays)),
      subSteps: tpl.subSteps.map((ss, j) => ({
        id: `${tpl.code}-${j}`,
        title: ss.title,
        status: "not_started" as SubStepStatus,
        actions: ss.actions,
        emailTemplate: ss.emailTemplate,
        supports: ss.supports,
      })),
    };
  });

  // Advancement: how many applicable steps are fully done.
  const applicableSteps = steps.filter((s) => s.applicable);
  const adv = rng();
  const currentIdx = Math.min(
    applicableSteps.length,
    Math.floor(adv * (applicableSteps.length + 1)),
  );

  for (let k = 0; k < applicableSteps.length; k++) {
    const step = applicableSteps[k]!;
    if (k < currentIdx) {
      step.subSteps.forEach((s) => (s.status = "done"));
    } else if (k === currentIdx) {
      const doneCount = Math.floor(rng() * step.subSteps.length);
      step.subSteps.forEach((s, idx) => {
        if (idx < doneCount) {
          s.status = "done";
        } else if (idx === doneCount) {
          const r = rng();
          s.status = r < 0.55 ? "in_progress" : r < 0.8 ? "waiting_client" : "blocked";
        }
      });
    }
  }

  // Onboarding status derived from how far step 01 has progressed.
  const step01 = steps[0]!;
  const s01done = step01.subSteps.filter((s) => s.status === "done").length;
  const onboardingStatus =
    currentIdx >= 1
      ? ["Plan d'action validé"]
      : s01done === 0
        ? ["Diagnostic à envoyer"]
        : s01done === 1
          ? ["Diagnostic envoyé"]
          : s01done === 2
            ? ["Diagnostic rempli"]
            : ["Meeting plan action planifié"];

  const domain = raw.emails[0]?.split("@")[1];
  const bceCore = (hashString(raw.societe) % 1_000_000_000)
    .toString()
    .padStart(9, "0");

  return {
    id: brokerSlug(raw.societe),
    societe: raw.societe,
    contact: raw.contact,
    emails: raw.emails,
    countries: raw.countries,
    officerId,
    signatureDate: iso(signature),
    bce: `BE ${bceCore.slice(0, 4)}.${bceCore.slice(4, 7)}.${bceCore.slice(7)}`,
    website: domain && !domain.includes("gmail") ? `https://www.${domain}` : undefined,
    lastContactDate: iso(addDays(TODAY, -Math.floor(rng() * 40))),
    onboardingStatus,
    plan: steps,
  };
}

export const BROKERS: Broker[] = (seedData.brokers as RawBroker[])
  .map(buildBroker)
  .sort((a, b) => a.societe.localeCompare(b.societe, "fr"));

export function getBroker(id: string): Broker | undefined {
  return BROKERS.find((b) => b.id === id);
}

export function getOfficer(id: string): Officer | undefined {
  return OFFICERS.find((o) => o.id === id);
}
