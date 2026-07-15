/**
 * Shared auth primitives for the dashboard gate.
 *
 * Used by BOTH the Edge middleware and Node server actions, so everything here
 * must stay edge-safe: Web Crypto only, no `node:crypto`, no Buffer, and env
 * read straight from `process.env` (the shared config package is Node-only).
 *
 * Model: the same per-person credentials as the Basic Auth gate
 * (`DASHBOARD_BASIC_AUTH_USERS`), but the browser flow goes through a branded
 * /login page that sets a signed session cookie instead of the native popup.
 * The HMAC key is derived from `DASHBOARD_SESSION_SECRET` when set, otherwise
 * from the credentials list itself — so rotating a password invalidates every
 * open session, which is exactly what we want with shared env-based accounts.
 */

export const SESSION_COOKIE = "bc_session";
/** Session lifetime: 30 days (3 internal users, low-risk back-office). */
export const SESSION_MAX_AGE_S = 30 * 24 * 60 * 60;

export interface Credential {
  user: string;
  password: string;
}

/** Parse the configured credentials from env. Empty array → auth disabled. */
export function loadCredentials(): Credential[] {
  const creds: Credential[] = [];

  const list = process.env.DASHBOARD_BASIC_AUTH_USERS;
  if (list) {
    for (const raw of list.split(/[,\n]/)) {
      const pair = raw.trim();
      if (!pair) continue;
      const sep = pair.indexOf(":");
      if (sep <= 0) continue; // need a non-empty username before ':'
      creds.push({ user: pair.slice(0, sep), password: pair.slice(sep + 1) });
    }
  }

  const singleUser = process.env.DASHBOARD_BASIC_AUTH_USER;
  const singlePassword = process.env.DASHBOARD_BASIC_AUTH_PASSWORD;
  if (singleUser && singlePassword) {
    creds.push({ user: singleUser, password: singlePassword });
  }

  return creds;
}

/**
 * Constant-time string comparison. Avoids leaking how many leading characters
 * matched via timing. The length XOR folds a length mismatch into the diff so
 * the loop bound (driven by `a`, the attacker-controlled input) can't be used
 * to distinguish a wrong-length guess from a wrong-value one.
 */
export function safeEqual(a: string, b: string): boolean {
  const ab = new TextEncoder().encode(a);
  const bb = new TextEncoder().encode(b);
  let diff = ab.length ^ bb.length;
  for (let i = 0; i < ab.length; i++) {
    diff |= ab[i] ^ (bb[i] ?? 0);
  }
  return diff === 0;
}

/**
 * Check a user/password pair against every configured credential without
 * early-exit, so a wrong username and a wrong password take the same path
 * (no user enumeration). Returns the canonical username on success.
 */
export function checkCredentials(user: string, password: string): string | null {
  let matchedUser: string | null = null;
  for (const cred of loadCredentials()) {
    const ok = safeEqual(user, cred.user) && safeEqual(password, cred.password);
    if (ok) matchedUser = cred.user;
  }
  return matchedUser;
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

async function hmacKey(): Promise<CryptoKey> {
  const secret =
    process.env.DASHBOARD_SESSION_SECRET ||
    process.env.DASHBOARD_BASIC_AUTH_USERS ||
    `${process.env.DASHBOARD_BASIC_AUTH_USER ?? ""}:${process.env.DASHBOARD_BASIC_AUTH_PASSWORD ?? ""}`;
  const material = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return crypto.subtle.importKey("raw", material, { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
    "verify",
  ]);
}

/** Create a signed session token: b64url(user|expiresAtMs) + "." + b64url(hmac). */
export async function signSession(user: string, nowMs: number): Promise<string> {
  const payload = new TextEncoder().encode(`${user}|${nowMs + SESSION_MAX_AGE_S * 1000}`);
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(), payload);
  return `${b64url.encode(payload)}.${b64url.encode(new Uint8Array(sig))}`;
}

/** Verify a session token. Returns the username, or null if invalid/expired. */
export async function verifySession(token: string, nowMs: number): Promise<string | null> {
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const payload = b64url.decode(token.slice(0, dot));
  const sig = b64url.decode(token.slice(dot + 1));
  if (!payload || !sig) return null;
  const ok = await crypto.subtle.verify(
    "HMAC",
    await hmacKey(),
    sig as unknown as BufferSource,
    payload as unknown as BufferSource,
  );
  if (!ok) return null;
  const text = new TextDecoder().decode(payload);
  const sep = text.lastIndexOf("|");
  if (sep <= 0) return null;
  const expiresAt = Number(text.slice(sep + 1));
  if (!Number.isFinite(expiresAt) || nowMs >= expiresAt) return null;
  return text.slice(0, sep);
}

/**
 * Sanitize a post-login redirect target: internal absolute paths only, so a
 * crafted ?next=https://evil.example (or //evil.example) can't bounce the user.
 */
export function safeNextPath(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) {
    return "/";
  }
  return next;
}
