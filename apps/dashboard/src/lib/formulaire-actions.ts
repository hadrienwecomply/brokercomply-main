"use server";

import { revalidatePath } from "next/cache";
import { retrySubmissionTrigger } from "./formulaires.server";

/** Re-fire the n8n workflow for a failed submission, then refresh the broker page. */
export async function retryTrigger(slug: string, submissionId: string): Promise<string> {
  const status = await retrySubmissionTrigger(submissionId);
  revalidatePath(`/courtiers/${slug}`);
  return status;
}
