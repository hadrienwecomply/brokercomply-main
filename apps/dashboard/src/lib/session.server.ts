import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { getUserByEmail, passwordFragment } from "@brokercomply/shared";
import { SESSION_COOKIE, isAuthEnabled, verifySession, type SessionClaims } from "./auth";
import { getDb } from "./db.server";

export interface SessionUser {
  email: string;
  displayName: string;
}

export type SessionCheck =
  /** Valid session, DB-confirmed (or DB unreachable → HMAC trusted, see below). */
  | { status: "ok"; user: SessionUser }
  /** Cookie is HMAC-valid but DEFINITIVELY rejected by the DB: user deleted,
   *  deactivated, or password changed since sign-in (`phf` mismatch). */
  | { status: "stale" }
  /** Gate disabled, or no/invalid cookie. */
  | { status: "anonymous" };

/**
 * DB-side staleness results are cached briefly so the per-request middleware
 * check (see /api/auth/validate) doesn't hammer Postgres: a revocation takes
 * at most VALIDATION_TTL_MS to propagate, which is fine for 3 internal users.
 */
const VALIDATION_TTL_MS = 30_000;
const validationCache = new Map<string, { result: SessionCheck; at: number }>();

/**
 * Validate HMAC-verified claims against the DB.
 *
 * Fail-open on infrastructure errors: the HMAC already proves a real login
 * less than 30 days ago, so a transient Postgres blip must not take every
 * page of the app down (the root layout awaits this on each render). Only a
 * DEFINITIVE rejection (row missing / inactive / phf mismatch) returns stale.
 */
export async function validateClaims(claims: SessionClaims): Promise<SessionCheck> {
  const key = `${claims.email}|${claims.phf}`;
  const hit = validationCache.get(key);
  if (hit && Date.now() - hit.at < VALIDATION_TTL_MS) return hit.result;

  let result: SessionCheck;
  try {
    const user = await getUserByEmail({ db: getDb() }, claims.email);
    result =
      !user || !user.isActive || passwordFragment(user.passwordHash) !== claims.phf
        ? { status: "stale" }
        : { status: "ok", user: { email: user.email, displayName: user.displayName } };
  } catch (err) {
    console.error("[auth] user lookup failed — trusting HMAC-verified claims", err);
    return { status: "ok", user: { email: claims.email, displayName: claims.email } };
  }

  validationCache.set(key, { result, at: Date.now() });
  if (validationCache.size > 1000) validationCache.clear(); // paranoia bound
  return result;
}

/** Full session check for the current request (cookie → HMAC → DB). */
export const checkSession = cache(async (): Promise<SessionCheck> => {
  if (!isAuthEnabled()) return { status: "anonymous" };
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const claims = token ? await verifySession(token, Date.now()) : null;
  if (!claims) return { status: "anonymous" };
  return validateClaims(claims);
});

/**
 * The signed-in user — or null when the gate is disabled, the cookie is
 * missing/invalid, or the session is stale (see `SessionCheck`).
 */
export async function currentUser(): Promise<SessionUser | null> {
  const check = await checkSession();
  return check.status === "ok" ? check.user : null;
}
