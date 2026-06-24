"use server";

import { revalidatePath } from "next/cache";
import { currentOfficer } from "./officer.server";
import { sendStepEmail as sendStepEmailServer } from "./mail.server";

export interface SendStepEmailArgs {
  slug: string;
  stepCode: string | null;
  substepTemplateId: string | null;
  to: string[];
  cc: string[];
  subject: string;
  body: string;
}

/** Send an action-plan template email; the sender officer is the cookie identity. */
export async function sendStepEmail(args: SendStepEmailArgs): Promise<void> {
  const officer = await currentOfficer();
  await sendStepEmailServer({ ...args, officer });
  revalidatePath(`/courtiers/${args.slug}`);
  revalidatePath(`/courtiers/${args.slug}/conversations`);
}
