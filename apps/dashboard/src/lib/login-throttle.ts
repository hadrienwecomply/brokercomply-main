import "server-only";

/**
 * In-memory login throttle: after MAX_FAILURES failed attempts for the same
 * (ip, email) pair, further attempts are locked out for LOCKOUT_MS.
 *
 * Per-instance state is fine here: the dashboard runs as a single Railway
 * instance and protects 3 accounts — this is a brute-force speed bump, not a
 * distributed rate limiter.
 */
const MAX_FAILURES = 5;
const LOCKOUT_MS = 15 * 60 * 1000;
/** Failure counters reset if the last failure is older than this. */
const WINDOW_MS = 15 * 60 * 1000;

interface Entry {
  failures: number;
  lastFailureAt: number;
  lockedUntil: number;
}

const attempts = new Map<string, Entry>();

function keyOf(ip: string, email: string): string {
  return `${ip}|${email}`;
}

function sweep(now: number): void {
  if (attempts.size < 1000) return; // bound memory under a flood
  for (const [key, entry] of attempts) {
    if (now - entry.lastFailureAt > WINDOW_MS && entry.lockedUntil <= now) {
      attempts.delete(key);
    }
  }
}

/** Minutes left on the lockout for this (ip, email), or 0 if allowed. */
export function lockedForMinutes(ip: string, email: string, now = Date.now()): number {
  const entry = attempts.get(keyOf(ip, email));
  if (!entry || entry.lockedUntil <= now) return 0;
  return Math.ceil((entry.lockedUntil - now) / 60_000);
}

export function recordLoginFailure(ip: string, email: string, now = Date.now()): void {
  sweep(now);
  const key = keyOf(ip, email);
  const entry = attempts.get(key);
  const failures = entry && now - entry.lastFailureAt < WINDOW_MS ? entry.failures + 1 : 1;
  attempts.set(key, {
    failures,
    lastFailureAt: now,
    lockedUntil: failures >= MAX_FAILURES ? now + LOCKOUT_MS : 0,
  });
}

export function recordLoginSuccess(ip: string, email: string): void {
  attempts.delete(keyOf(ip, email));
}
