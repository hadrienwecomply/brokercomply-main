// Client-safe types + funnel metadata for the /suivi-commercial tab.
// (No server imports here — this file is shared with client components.)

import type { LostReason, PipelineStage } from "@brokercomply/shared";

export type { LostReason, PipelineStage };

export interface ProspectContactDTO {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  isPrimary: boolean;
}

export interface ProspectDTO {
  id: string;
  societe: string;
  siteInternet: string | null;
  verticale: string | null;
  /** Verbatim lifecycle tags from the import source (Notion/CSV). */
  sourceStatus: string | null;
  pipelineStage: PipelineStage;
  lostReason: LostReason | null;
  noShow: boolean;
  needsReview: boolean;
  mrr: number | null;
  conversionProbability: string | null;
  leadFrom: string | null;
  meetingDate: string | null;
  offerSentAt: string | null;
  lastReplyAt: string | null;
  reminderSentAt: string | null;
  calledAt: string | null;
  outcome: string | null;
  /** Cadence stage: awaiting_reply | reminded | to_call | replied | closed. */
  stage: string;
  nextActionAt: string | null;
  notes: string | null;
  contacts: ProspectContactDTO[];
}

export const PIPELINE_COLUMNS: { key: PipelineStage; label: string }[] = [
  { key: "to_contact", label: "À contacter" },
  { key: "contacted", label: "Contacté" },
  { key: "demo_planned", label: "Démo planifiée" },
  { key: "demo_done", label: "Démo faite" },
  { key: "offer_to_send", label: "Offre à envoyer" },
  { key: "offer_sent", label: "Offre envoyée" },
  { key: "won", label: "Gagné 🎉" },
  { key: "lost", label: "Perdu" },
];

export const LOST_REASON_LABEL: Record<LostReason, string> = {
  not_interested: "Pas intéressé",
  budget: "Budget",
  wrong_target: "Mauvaise cible",
  unreachable: "Injoignable",
  other: "Autre",
};

export type CallOutcome = "reachable" | "callback" | "not_interested" | "signed";

export const CALL_OUTCOMES: { key: CallOutcome; label: string }[] = [
  { key: "reachable", label: "Joignable ✓" },
  { key: "callback", label: "À rappeler" },
  { key: "not_interested", label: "Pas intéressé" },
  { key: "signed", label: "Signé 🎉" },
];

/* --------------------------------- Tasks ---------------------------------- */

export type TaskType = "call" | "email" | "meeting" | "other";
export type TaskStatus = "open" | "done" | "cancelled";
export type CadenceKey = "offer_reminder" | "offer_call" | "no_show_rebook";

export interface TaskDTO {
  id: string;
  prospectId: string;
  title: string;
  type: TaskType;
  dueAt: string | null;
  assignee: string | null;
  status: TaskStatus;
  outcome: string | null;
  notes: string | null;
  source: "cadence" | "manual" | "ai";
  cadenceKey: CadenceKey | null;
  createdBy: string | null;
  completedBy: string | null;
  completedAt: string | null;
  createdAt: string;
}

export const TASK_TYPE_LABEL: Record<TaskType, string> = {
  call: "Appel",
  email: "E-mail",
  meeting: "RDV",
  other: "Autre",
};

/** Filter chips of the task list (derived from cadence_key / source). */
export const TASK_GROUPS: { key: string; label: string }[] = [
  { key: "all", label: "Toutes" },
  { key: "offer_call", label: "☎ Rappels d'offre" },
  { key: "offer_reminder", label: "✉️ Relances e-mail" },
  { key: "no_show_rebook", label: "💔 RDV à recaler" },
  { key: "manual", label: "📌 Manuelles" },
];

export function taskGroup(t: TaskDTO): string {
  return t.cadenceKey ?? "manual";
}

export const TASK_OUTCOME_LABEL: Record<string, string> = {
  reachable: "Joignable",
  callback: "À rappeler",
  not_interested: "Pas intéressé",
  signed: "Signé 🎉",
  rebooked: "RDV recalé",
  sent: "Relance envoyée",
  done: "Fait",
};

/** The contact the cadence chases (primary first, else the first known). */
export function primaryContact(p: ProspectDTO): ProspectContactDTO | null {
  return p.contacts.find((c) => c.isPrimary) ?? p.contacts[0] ?? null;
}

/** First phone found on any contact of the agency. */
export function anyPhone(p: ProspectDTO): string | null {
  return p.contacts.find((c) => c.phone)?.phone ?? null;
}
