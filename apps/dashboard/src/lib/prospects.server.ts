import "server-only";
import {
  getProspect,
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
    sourceStatus: row.sourceStatus,
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
