"use server";

import { revalidatePath } from "next/cache";
import {
  cancelTask,
  completeTask,
  createTask,
  reassignTask,
  reopenTask,
  runFollowupTick,
  setProspectPhone,
  setProspectPipelineStage,
  setTaskDue,
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
