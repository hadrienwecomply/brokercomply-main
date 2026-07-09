"use server";

import { revalidatePath } from "next/cache";
import { currentOfficer } from "./officer.server";
import {
  changeSubstepStatus,
  createBroker,
  createSubstep,
  createTaskTemplate,
  deleteSubstep,
  deleteTaskTemplate,
  editSubstep,
  editTaskTemplate,
  overrideStepDeadline,
  patchBroker,
  reorderSubsteps,
  reorderTemplateTasks,
  setBrokerMatchDomains,
  setStepOffset,
  type CreateBrokerInput,
  type UpdateBrokerPatch,
} from "./brokers.server";
import type { SubstepContentPatch, TaskTemplatePatch } from "@brokercomply/shared";

/** Create a broker (auto-instantiates its plan). Returns the new slug. */
export async function addBroker(input: CreateBrokerInput) {
  const societe = input.societe?.trim();
  if (!societe) throw new Error("Société requise");
  const officer = await currentOfficer();
  const broker = await createBroker({ ...input, societe }, officer);
  revalidatePath("/");
  revalidatePath(`/courtiers/${broker.id}`);
  return broker;
}

export async function saveBroker(id: string, slug: string, patch: UpdateBrokerPatch) {
  await patchBroker(id, patch);
  revalidatePath("/");
  revalidatePath(`/courtiers/${slug}`);
}

/** Set (or clear, with null) a broker's brand primary colour. */
export async function setPrimaryColor(id: string, slug: string, hex: string | null) {
  await patchBroker(id, { primaryColor: hex });
  revalidatePath(`/courtiers/${slug}`);
}

/** Update the opt-in domains used to match a broker's email conversations. */
export async function setMatchDomains(slug: string, domains: string[]) {
  await setBrokerMatchDomains(slug, domains);
  revalidatePath(`/courtiers/${slug}/conversations`);
}

export async function setStepDeadline(slug: string, stepDbId: string, deadline: string | null) {
  await overrideStepDeadline(slug, stepDbId, deadline);
  revalidatePath("/");
  revalidatePath("/actions");
  revalidatePath(`/courtiers/${slug}`);
}

export async function setSubstepStatus(
  slug: string,
  substepDbId: string,
  status: string,
  notes?: string | null,
) {
  await changeSubstepStatus(slug, substepDbId, status, notes);
  revalidatePath("/");
  revalidatePath("/actions");
  revalidatePath(`/courtiers/${slug}`);
}

// --- Per-broker task CRUD ----------------------------------------------------

export async function addSubstep(slug: string, stepDbId: string, fields: SubstepContentPatch) {
  await createSubstep(slug, stepDbId, fields);
  revalidatePath("/");
  revalidatePath("/actions");
  revalidatePath(`/courtiers/${slug}`);
}

export async function updateSubstep(slug: string, substepDbId: string, patch: SubstepContentPatch) {
  await editSubstep(slug, substepDbId, patch);
  revalidatePath("/");
  revalidatePath("/actions");
  revalidatePath(`/courtiers/${slug}`);
}

export async function removeSubstep(slug: string, substepDbId: string) {
  await deleteSubstep(slug, substepDbId);
  revalidatePath("/");
  revalidatePath("/actions");
  revalidatePath(`/courtiers/${slug}`);
}

export async function moveSubsteps(slug: string, stepDbId: string, orderedIds: string[]) {
  await reorderSubsteps(slug, stepDbId, orderedIds);
  revalidatePath(`/courtiers/${slug}`);
}

// --- Global template (Config tab) --------------------------------------------

export async function saveStepOffset(code: string, offsetDays: number) {
  await setStepOffset(code, offsetDays);
  revalidatePath("/config");
  revalidatePath("/");
  revalidatePath("/actions");
}

export async function addTemplateTask(stepCode: string, fields: TaskTemplatePatch) {
  await createTaskTemplate(stepCode, fields);
  revalidatePath("/config");
}

export async function updateTemplateTask(id: string, patch: TaskTemplatePatch) {
  await editTaskTemplate(id, patch);
  revalidatePath("/config");
}

export async function removeTemplateTask(id: string) {
  await deleteTaskTemplate(id);
  revalidatePath("/config");
}

export async function moveTemplateTasks(orderedIds: string[]) {
  await reorderTemplateTasks(orderedIds);
  revalidatePath("/config");
}
