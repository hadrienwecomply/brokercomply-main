"use server";

import { revalidatePath } from "next/cache";
import {
  addProspectContact,
  cancelTask,
  completeTask,
  createTask,
  reassignTask,
  reopenTask,
  runFollowupTick,
  setProspectPhone,
  setProspectPipelineStage,
  setTaskDue,
  updateProspectContact,
  updateProspectFields,
  updateProspectNotes,
} from "@brokercomply/shared";
import { currentOfficer } from "./officer.server";
import { getDb } from "./db.server";
import type { LostReason, PipelineStage, TaskType } from "./prospects-types";

function refresh(prospectId?: string) {
  revalidatePath("/suivi-commercial");
  if (prospectId) revalidatePath(`/suivi-commercial/${prospectId}`);
}

export interface CompleteTaskPayload {
  prospectId: string;
  outcome: string;
  notes?: string;
  /** "À rappeler"-style follow-up: a new task due at this date. */
  followUp?: { title: string; dueAt: string };
  /** For 'rebooked': the new demo slot (ISO). */
  rebookedMeetingAt?: string;
}

/** Complete a task with its outcome — writes the prospect facts as needed. */
export async function finishTask(id: string, payload: CompleteTaskPayload) {
  const officer = await currentOfficer();
  await completeTask({ db: getDb() }, id, {
    outcome: payload.outcome,
    notes: payload.notes,
    completedBy: officer,
    ...(payload.followUp
      ? {
          followUp: {
            title: payload.followUp.title,
            dueAt: new Date(payload.followUp.dueAt),
          },
        }
      : {}),
    ...(payload.rebookedMeetingAt
      ? { rebookedMeetingAt: new Date(payload.rebookedMeetingAt) }
      : {}),
  });
  refresh(payload.prospectId);
}

/** ↩ Undo a completion: the task reopens and its written facts are reverted. */
export async function undoTask(id: string, prospectId: string) {
  await reopenTask({ db: getDb() }, id);
  refresh(prospectId);
}

export interface NewTaskPayload {
  prospectId: string;
  title: string;
  type?: TaskType;
  dueAt?: string | null;
  assignee?: string | null;
  notes?: string | null;
}

export async function addTask(payload: NewTaskPayload) {
  const title = payload.title?.trim();
  if (!title) throw new Error("Titre requis");
  const officer = await currentOfficer();
  await createTask({ db: getDb() }, {
    prospectId: payload.prospectId,
    title,
    type: payload.type,
    dueAt: payload.dueAt ? new Date(payload.dueAt) : null,
    assignee: payload.assignee ?? null,
    notes: payload.notes ?? null,
    createdBy: officer,
  });
  refresh(payload.prospectId);
}

export async function dropTask(id: string, prospectId: string) {
  await cancelTask({ db: getDb() }, id);
  refresh(prospectId);
}

export async function assignTask(id: string, prospectId: string, assignee: string | null) {
  await reassignTask({ db: getDb() }, id, assignee);
  refresh(prospectId);
}

export async function rescheduleTask(id: string, prospectId: string, dueAt: string | null) {
  await setTaskDue({ db: getDb() }, id, dueAt ? new Date(dueAt) : null);
  refresh(prospectId);
}

/** Add/replace the primary contact's phone. */
export async function savePhone(id: string, phone: string) {
  await setProspectPhone({ db: getDb() }, id, phone.trim() || null);
  refresh(id);
}

/** Move a card between funnel columns. */
export async function movePipeline(
  id: string,
  stage: PipelineStage,
  lostReason?: LostReason,
) {
  await setProspectPipelineStage({ db: getDb() }, id, stage, lostReason ?? null);
  refresh(id);
}

export interface ProspectFieldsInput {
  societe?: string;
  siteInternet?: string | null;
  verticale?: string | null;
  language?: string | null;
  leadFrom?: string | null;
  conversionProbability?: string | null;
  mrr?: number | null;
  /** ISO datetime, or null to clear. */
  meetingDate?: string | null;
  // --- Enrichment fields (editable) ----------------------------------------
  bce?: string | null;
  formeJuridique?: string | null;
  gerantsTous?: string | null;
  rue?: string | null;
  codePostal?: string | null;
  ville?: string | null;
  province?: string | null;
  pays?: string | null;
  fsmaStatut?: string | null;
  typesProduits?: string | null;
  activite?: string | null;
  tailleEquipe?: string | null;
  telSociete?: string | null;
  linkedinSociete?: string | null;
  instagram?: string | null;
  xTwitter?: string | null;
}

/** Edit the agency's qualification attributes (detail page « Données »). */
export async function saveProspectFields(id: string, fields: ProspectFieldsInput) {
  const { mrr, meetingDate, ...rest } = fields;
  await updateProspectFields({ db: getDb() }, id, {
    ...rest,
    ...(mrr !== undefined ? { mrr: mrr != null ? String(mrr) : null } : {}),
    ...(meetingDate !== undefined
      ? { meetingDate: meetingDate ? new Date(meetingDate) : null }
      : {}),
  });
  refresh(id);
}

export interface ContactInput {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  role?: string | null;
  linkedin?: string | null;
}

/** Edit one contact of the agency. */
export async function saveContact(prospectId: string, contactId: string, patch: ContactInput) {
  await updateProspectContact({ db: getDb() }, contactId, patch);
  refresh(prospectId);
}

/** Add a person to the agency. */
export async function addContact(prospectId: string, input: ContactInput) {
  await addProspectContact({ db: getDb() }, prospectId, input);
  refresh(prospectId);
}

export async function saveNotes(id: string, notes: string) {
  await updateProspectNotes({ db: getDb() }, id, notes);
  refresh(id);
}

/** Recompute cadences + materialize/cancel tasks (n8n will cron this in P5). */
export async function runTick() {
  const summary = await runFollowupTick({ db: getDb() });
  refresh();
  return summary;
}
