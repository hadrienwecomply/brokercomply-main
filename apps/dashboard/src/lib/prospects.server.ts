import "server-only";
import {
  listProspects,
  type Prospect,
  type ProspectContact,
  type ProspectWithContacts,
} from "@brokercomply/shared";
import { getDb } from "./db.server";
import type { PipelineStage, LostReason, ProspectDTO } from "./prospects-types";

function iso(d: Date | null): string | null {
  return d ? d.toISOString() : null;
}

function toDTO(row: ProspectWithContacts): ProspectDTO {
  return {
    id: row.id,
    societe: row.societe,
    siteInternet: row.siteInternet,
    verticale: row.verticale,
    pipelineStage: row.pipelineStage as PipelineStage,
    lostReason: (row.lostReason as LostReason | null) ?? null,
    noShow: row.noShow,
    needsReview: row.needsReview,
    mrr: row.mrr != null ? Number(row.mrr) : null,
    conversionProbability: row.conversionProbability,
    leadFrom: row.leadFrom,
    meetingDate: iso(row.meetingDate),
    offerSentAt: iso(row.offerSentAt),
    lastReplyAt: iso(row.lastReplyAt),
    reminderSentAt: iso(row.reminderSentAt),
    calledAt: iso(row.calledAt),
    outcome: row.outcome,
    stage: row.stage,
    nextActionAt: iso(row.nextActionAt),
    notes: row.notes,
    contacts: row.contacts.map((c: ProspectContact) => ({
      id: c.id,
      name: c.name,
      email: c.email,
      phone: c.phone,
      isPrimary: c.isPrimary,
    })),
  };
}

/** Every prospect with its contacts, serialized for the client board. */
export async function listSuiviCommercial(): Promise<ProspectDTO[]> {
  const rows = await listProspects({ db: getDb() });
  return rows.map(toDTO);
}

export type { Prospect };
