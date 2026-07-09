"use server";

import { revalidatePath } from "next/cache";
import {
  retryWebsiteAudit,
  startWebsiteAudit,
  type StartAuditResult,
} from "./website-audit.server";

/** Launch a website compliance audit for a broker ("Lancer l'audit"). */
export async function triggerWebsiteAudit(slug: string): Promise<StartAuditResult> {
  const res = await startWebsiteAudit(slug);
  revalidatePath(`/courtiers/${slug}`);
  return res;
}

/** Re-run a failed/stuck audit in place ("Relancer"). */
export async function retryWebsiteAuditAction(
  slug: string,
  auditId: string,
): Promise<StartAuditResult> {
  const res = await retryWebsiteAudit(auditId);
  revalidatePath(`/courtiers/${slug}`);
  return res;
}
