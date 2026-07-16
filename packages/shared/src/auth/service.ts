/**
 * User-account service for the dashboard login. Mirrors the deps-injection
 * style of the other shared services (`{ db }`), so it composes with the
 * app's connection pool and with transactions.
 */
import { eq, sql } from 'drizzle-orm';
import { users, type Db, type NewUserRow, type UserRow } from '../db/index.js';
import { hashPassword, verifyPassword } from './password.js';

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

export interface AuthServiceDeps {
  db: Db | Tx;
}

/** Canonical form for login identifiers. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Minimum password length, enforced at every write path (CLI, future UI). */
export const MIN_PASSWORD_LENGTH = 10;

/**
 * Guard for account emails. `|` is banned because the session cookie payload
 * is pipe-delimited (see dashboard src/lib/auth.ts) — such an account could
 * never hold a valid session; whitespace and a missing '@' are plain typos.
 */
export function assertValidAccountEmail(email: string): void {
  if (!/^[^\s|]+@[^\s|]+\.[^\s|]+$/.test(email)) {
    throw new Error(`invalid account email: ${JSON.stringify(email)}`);
  }
}

function assertValidPassword(password: string): void {
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  }
}

/** Fetch a user by email (any status). Null when unknown. */
export async function getUserByEmail(
  { db }: AuthServiceDeps,
  email: string,
): Promise<UserRow | null> {
  const rows = await db
    .select()
    .from(users)
    .where(eq(users.email, normalizeEmail(email)))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Validate a login attempt. Returns the user on success (and stamps
 * `last_login_at`), null on unknown email / wrong password / inactive account.
 *
 * When the email is unknown we still burn a hash verification against a dummy
 * hash so the response time doesn't reveal which emails exist.
 */
export async function authenticateUser(
  deps: AuthServiceDeps,
  email: string,
  password: string,
): Promise<UserRow | null> {
  const user = await getUserByEmail(deps, email);
  const ok = await verifyPassword(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !ok || !user.isActive) return null;

  await deps.db.update(users).set({ lastLoginAt: sql`now()` }).where(eq(users.id, user.id));
  return user;
}

/** Create (or fail on duplicate email) a user account. Used by the CLI script. */
export async function createUser(
  { db }: AuthServiceDeps,
  input: { email: string; displayName: string; password: string },
): Promise<UserRow> {
  const email = normalizeEmail(input.email);
  assertValidAccountEmail(email);
  assertValidPassword(input.password);
  const row: NewUserRow = {
    email,
    displayName: input.displayName.trim(),
    passwordHash: await hashPassword(input.password),
  };
  const inserted = await db.insert(users).values(row).returning();
  const user = inserted[0];
  if (!user) throw new Error(`user insert returned no row for ${row.email}`);
  return user;
}

/** Set a new password. Existing sessions of this user become stale. */
export async function setUserPassword(
  { db }: AuthServiceDeps,
  userId: string,
  password: string,
): Promise<void> {
  assertValidPassword(password);
  await db
    .update(users)
    .set({ passwordHash: await hashPassword(password) })
    .where(eq(users.id, userId));
}

/**
 * Valid scrypt hash of a random throwaway string — verified against when the
 * email is unknown, to equalize timing (see `authenticateUser`).
 */
const DUMMY_HASH =
  'scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA$hK0mUJnQ4c3vXBHHXbXPYJbNczEV0RtV3PL2vTU3Cf4';
