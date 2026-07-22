import "server-only";
import {
  getProspect,
  listAiActions,
  listOpenTasks,
  listProspects,
  listProspectTasks,
  listRecentlyClosedTasks,
  type Prospect,
  type ProspectContact,
  type ProspectTask,
  type ProspectWithContacts,
} from "@brokercomply/shared";
import { getDb } from "./db.server";
import type {
  AiActionDTO,
  PipelineStage,
  LostReason,
  ProspectDTO,
  TaskDTO,
} from "./prospects-types";

function iso(d: Date | null): string | null {
  return d ? d.toISOString() : null;
}

function toDTO(row: ProspectWithContacts): ProspectDTO {
  return {
    id: row.id,
    societe: row.societe,
    siteInternet: row.siteInternet,
    verticale: row.verticale,
    language: row.language,
    owner: row.owner,
    sourceStatus: row.sourceStatus,
    lists: row.lists ?? [],
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
    bce: row.bce,
    formeJuridique: row.formeJuridique,
    gerantsTous: row.gerantsTous,
    rue: row.rue,
    codePostal: row.codePostal,
    ville: row.ville,
    province: row.province,
    pays: row.pays,
    fsmaStatut: row.fsmaStatut,
    debutStatut: iso(row.debutStatut),
    typesProduits: row.typesProduits,
    activite: row.activite,
    tailleEquipe: row.tailleEquipe,
    telSociete: row.telSociete,
    telSource: row.telSource,
    siteStatus: row.siteStatus,
    siteQuality: row.siteQuality,
    siteSummary: row.siteSummary,
    linkedinSociete: row.linkedinSociete,
    instagram: row.instagram,
    xTwitter: row.xTwitter,
    dateEnrichissement: iso(row.dateEnrichissement),
    hasLogo: row.logoBase64 != null,
    contacts: row.contacts.map((c: ProspectContact) => ({
      id: c.id,
      name: c.name,
      email: c.email,
      phone: c.phone,
      role: c.role,
      linkedin: c.linkedin,
      isPrimary: c.isPrimary,
    })),
  };
}

/** Every prospect with its contacts, serialized for the client board. */
export async function listSuiviCommercial(): Promise<ProspectDTO[]> {
  const rows = await listProspects({ db: getDb() });
  return rows.map(toDTO);
}

function taskToDTO(t: ProspectTask): TaskDTO {
  return {
    id: t.id,
    prospectId: t.prospectId,
    title: t.title,
    type: t.type as TaskDTO["type"],
    dueAt: iso(t.dueAt),
    assignee: t.assignee,
    status: t.status as TaskDTO["status"],
    outcome: t.outcome,
    notes: t.notes,
    source: t.source as TaskDTO["source"],
    cadenceKey: (t.cadenceKey as TaskDTO["cadenceKey"]) ?? null,
    createdBy: t.createdBy,
    completedBy: t.completedBy,
    completedAt: iso(t.completedAt),
    createdAt: t.createdAt.toISOString(),
  };
}

/** Open tasks (due first) + the last week's closed ones (the history strip). */
export async function listTaskBoard(): Promise<{ open: TaskDTO[]; recent: TaskDTO[] }> {
  const db = getDb();
  const [open, recent] = await Promise.all([
    listOpenTasks({ db }),
    listRecentlyClosedTasks({ db }, 7),
  ]);
  return {
    open: open.map((r) => taskToDTO(r.task)),
    recent: recent.map((r) => taskToDTO(r.task)),
  };
}

/** The intent-classifier activity feed (pending review + recent history). */
export async function listAiActivity(): Promise<AiActionDTO[]> {
  const rows = await listAiActions({ db: getDb() }, 150);
  return rows.map((r) => ({
    id: r.id,
    prospectId: r.prospectId,
    societe: r.societe,
    intent: r.intent,
    confidence: r.confidence,
    quote: r.quote,
    stageBefore: r.stageBefore as PipelineStage,
    stageAfter: (r.stageAfter as PipelineStage | null) ?? null,
    status: r.status as AiActionDTO["status"],
    resolvedBy: r.resolvedBy,
    createdAt: r.createdAt.toISOString(),
  }));
}

/** One agency (or null) + its full task history, serialized. */
export async function getProspectFile(
  id: string,
): Promise<{ prospect: ProspectDTO; tasks: TaskDTO[] } | null> {
  const db = getDb();
  const prospect = await getProspect({ db }, id);
  if (!prospect) return null;
  const tasks = await listProspectTasks({ db }, id);
  return { prospect: toDTO(prospect), tasks: tasks.map(taskToDTO) };
}

export type { Prospect };
