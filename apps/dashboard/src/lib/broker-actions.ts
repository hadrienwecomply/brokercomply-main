"use server";

import { revalidatePath } from "next/cache";
import { currentOfficer } from "./officer.server";
import {
  changeSubstepStatus,
  createBroker,
  overrideStepDeadline,
  patchBroker,
  setBrokerMatchDomains,
  toggleStepApplicable,
  type CreateBrokerInput,
  type UpdateBrokerPatch,
} from "./brokers.server";

/** Create a broker (auto-instantiates its 13-step plan). Returns the new slug. */
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

/** Update the opt-in domains used to match a broker's email conversations. */
export async function setMatchDomains(slug: string, domains: string[]) {
  await setBrokerMatchDomains(slug, domains);
  revalidatePath(`/courtiers/${slug}/conversations`);
}

export async function setStepApplicable(slug: string, stepDbId: string, applicable: boolean) {
  await toggleStepApplicable(slug, stepDbId, applicable);
  revalidatePath("/");
  revalidatePath(`/courtiers/${slug}`);
}

export async function setStepDeadline(slug: string, stepDbId: string, deadline: string | null) {
  await overrideStepDeadline(slug, stepDbId, deadline);
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
