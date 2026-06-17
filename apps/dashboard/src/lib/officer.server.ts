import "server-only";
import { cookies } from "next/headers";
import { DEFAULT_OFFICER, OFFICER_COOKIE, OFFICER_OPTIONS } from "./officers";

/** The officer currently selected (cookie), used to attribute edits. */
export async function currentOfficer(): Promise<string> {
  const store = await cookies();
  const value = store.get(OFFICER_COOKIE)?.value;
  return OFFICER_OPTIONS.some((o) => o.email === value) ? value! : DEFAULT_OFFICER;
}
