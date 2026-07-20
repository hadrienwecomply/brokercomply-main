import "server-only";
import { cookies } from "next/headers";
import { DEFAULT_OFFICER, OFFICER_COOKIE, OFFICER_OPTIONS } from "./officers";
import { currentUser } from "./session.server";

/**
 * Who is acting — used to attribute edits and to resolve "Mes tâches".
 *
 * The signed-in account is authoritative: since the DB-backed auth landed
 * (a751427) the app knows who the user really is, and the three `users` rows
 * carry the same emails as `OFFICER_OPTIONS`. Before this, identity came from
 * a freely-editable `bc_officer` cookie whose picker lives only on the
 * knowledge-base screen — so anyone who had never visited that screen silently
 * acted as Sacha, and every attribution landed on the wrong person.
 *
 * The cookie stays as the fallback for local development, where the auth gate
 * is off (`DASHBOARD_SESSION_SECRET` unset) and there is no session to read.
 */
export async function currentOfficer(): Promise<string> {
  const user = await currentUser();
  if (user) return user.email;

  const store = await cookies();
  const value = store.get(OFFICER_COOKIE)?.value;
  return OFFICER_OPTIONS.some((o) => o.email === value) ? value! : DEFAULT_OFFICER;
}
