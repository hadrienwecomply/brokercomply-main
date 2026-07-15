"use server";

import { revalidatePath } from "next/cache";
import { retryPubAudit } from "./pub-audit.server";
import {
  promotePubReformulation,
  savePubGuidance,
  type SavePubGuidanceInput,
} from "./pub-guidance.server";

/** Re-run a failed/stuck pub audit in place ("Relancer"). */
export async function retryPubAuditAction(
  slug: string,
  auditId: string,
): Promise<{ ok: boolean; error?: string }> {
  const res = await retryPubAudit(auditId);
  revalidatePath(`/courtiers/${slug}`);
  return res;
}

/** Save a check's cabinet guidance from the Config UI (Phase 3). */
export async function savePubGuidanceAction(
  input: SavePubGuidanceInput,
): Promise<{ ok: boolean; error?: string }> {
  return savePubGuidance(input);
}

/** Promote a suggested reformulation into a check's guidance (Phase 4 → 3). */
export async function promotePubReformulationAction(
  checkId: string,
  reformulation: string,
): Promise<{ ok: boolean; error?: string }> {
  return promotePubReformulation(checkId, reformulation);
}
