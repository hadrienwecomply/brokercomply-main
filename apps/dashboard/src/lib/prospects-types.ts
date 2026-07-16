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

/** The contact the cadence chases (primary first, else the first known). */
export function primaryContact(p: ProspectDTO): ProspectContactDTO | null {
  return p.contacts.find((c) => c.isPrimary) ?? p.contacts[0] ?? null;
}

/** First phone found on any contact of the agency. */
export function anyPhone(p: ProspectDTO): string | null {
  return p.contacts.find((c) => c.phone)?.phone ?? null;
}
