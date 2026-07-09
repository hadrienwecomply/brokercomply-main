"use server";

import { revalidatePath } from "next/cache";
import { retryPubAudit } from "./pub-audit.server";

/** Re-run a failed/stuck pub audit in place ("Relancer"). */
export async function retryPubAuditAction(
  slug: string,
  auditId: string,
): Promise<{ ok: boolean; error?: string }> {
  const res = await retryPubAudit(auditId);
  revalidatePath(`/courtiers/${slug}`);
  return res;
}
