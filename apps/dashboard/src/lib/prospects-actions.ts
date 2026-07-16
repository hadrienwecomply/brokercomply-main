"use server";

import { revalidatePath } from "next/cache";
import {
  markProspectCalled,
  setProspectPhone,
  setProspectPipelineStage,
  tickProspects,
} from "@brokercomply/shared";
import { getDb } from "./db.server";
import type { CallOutcome, LostReason, PipelineStage } from "./prospects-types";

/** Log the +15d call outcome — closes the chase for this prospect. */
export async function markCalled(id: string, outcome: CallOutcome, notes?: string) {
  await markProspectCalled({ db: getDb() }, id, {
    outcome,
    ...(notes?.trim() ? { notes: notes.trim() } : {}),
  });
  // Signing on the phone also moves the deal in the funnel.
  if (outcome === "signed") {
    await setProspectPipelineStage({ db: getDb() }, id, "won");
  } else if (outcome === "not_interested") {
    await setProspectPipelineStage({ db: getDb() }, id, "lost", "not_interested");
  }
  revalidatePath("/suivi-commercial");
}

/** Add/replace the primary contact's phone from the call-list UI. */
export async function savePhone(id: string, phone: string) {
  await setProspectPhone({ db: getDb() }, id, phone.trim() || null);
  revalidatePath("/suivi-commercial");
}

/** Move a card between funnel columns. */
export async function movePipeline(
  id: string,
  stage: PipelineStage,
  lostReason?: LostReason,
) {
  await setProspectPipelineStage({ db: getDb() }, id, stage, lostReason ?? null);
  revalidatePath("/suivi-commercial");
}

/** Recompute every cadence stage now (manual refresh; n8n will cron this in P5). */
export async function runTick() {
  const summary = await tickProspects({ db: getDb() });
  revalidatePath("/suivi-commercial");
  return summary;
}
