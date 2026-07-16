/**
 * Session primitives for the dashboard gate.
 *
 * Used by BOTH the Edge middleware and Node server actions, so everything here
 * must stay edge-safe: Web Crypto only, no `node:crypto`, no Buffer, no DB.
 *
 * Model: accounts live in the `users` table (see @brokercomply/shared `auth/`);
 * the /login server action checks the password against the DB and sets a
 * signed session cookie. This module only signs/verifies that cookie.
 *
 * The HMAC key derives from `DASHBOARD_SESSION_SECRET`, which doubles as the
 * gate switch: unset (local `next dev`) → gate disabled entirely; rotating it
 * invalidates every open session (the hard kill).
 *
 * Claims carry `phf`, a fingerprint of the user's stored password hash, so a
 * password change (or account deactivation) marks that user's sessions stale —
 * checked against the DB via /api/auth/validate (middleware) and the root
 * layout, never here (this module must stay DB-free for the Edge runtime).
 */

export const SESSION_COOKIE = "bc_session";
/** Session lifetime: 30 days (3 internal users, low-risk back-office). */
export const SESSION_MAX_AGE_S = 30 * 24 * 60 * 60;

export interface SessionClaims {
  /** User's login email (lowercase). */
  email: string;
  /** Password-hash fingerprint at sign-in time (see shared `passwordFragment`). */
  phf: string;
}

/** The auth gate is ON iff a session secret is configured. */
export function isAuthEnabled(): boolean {
  return Boolean(process.env.DASHBOARD_SESSION_SECRET);
}

const b64url = {
  encode(bytes: Uint8Array): string {
    let bin = "";
    for (const b of bytes) bin += String.fromCharCode(b);
    return btoa(bin).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
  },
  decode(s: string): Uint8Array | null {
    try {
      const bin = atob(s.replaceAll("-", "+").replaceAll("_", "/"));
      return Uint8Array.from(bin, (c) => c.charCodeAt(0));
    } catch {
      return null;
    }
  },
};

async function hmacKey(): Promise<CryptoKey | null> {
  const secret = process.env.DASHBOARD_SESSION_SECRET;
  if (!secret) return null;
  const material = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return crypto.subtle.importKey("raw", material, { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
    "verify",
  ]);
}

/** Create a signed session token: b64url(email|phf|expiresAtMs) + "." + b64url(hmac). */
export async function signSession(claims: SessionClaims, nowMs: number): Promise<string> {
  const key = await hmacKey();
  if (!key) throw new Error("DASHBOARD_SESSION_SECRET is not configured");
  const payload = new TextEncoder().encode(
    `${claims.email}|${claims.phf}|${nowMs + SESSION_MAX_AGE_S * 1000}`,
  );
  const sig = await crypto.subtle.sign("HMAC", key, payload);
  return `${b64url.encode(payload)}.${b64url.encode(new Uint8Array(sig))}`;
}

/** Verify a session token. Returns the claims, or null if invalid/expired. */
export async function verifySession(
  token: string,
  nowMs: number,
): Promise<SessionClaims | null> {
  const key = await hmacKey();
  if (!key) return null;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const payload = b64url.decode(token.slice(0, dot));
  const sig = b64url.decode(token.slice(dot + 1));
  if (!payload || !sig) return null;
  const ok = await crypto.subtle.verify(
    "HMAC",
    key,
    sig as unknown as BufferSource,
    payload as unknown as BufferSource,
  );
  if (!ok) return null;
  const parts = new TextDecoder().decode(payload).split("|");
  if (parts.length !== 3) return null;
  const [email, phf, expiresRaw] = parts;
  const expiresAt = Number(expiresRaw);
  if (!email || !phf || !Number.isFinite(expiresAt) || nowMs >= expiresAt) return null;
  return { email, phf };
}

/**
 * Sanitize a post-login redirect target: internal absolute paths only, so a
 * crafted ?next=https://evil.example (or //evil.example) can't bounce the user.
 * Control chars and backslashes are rejected outright — browsers strip
 * tab/CR/LF when parsing URLs, so `/\t/evil.example` would otherwise be
 * re-read as protocol-relative after stripping.
 */
export function safeNextPath(next: string | null | undefined): string {
  if (
    !next ||
    !next.startsWith("/") ||
    next.startsWith("//") ||
    // eslint-disable-next-line no-control-regex
    /[\u0000-\u001f\\]/.test(next)
  ) {
    return "/";
  }
  return next;
}
