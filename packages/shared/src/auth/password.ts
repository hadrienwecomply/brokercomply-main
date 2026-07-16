/**
 * Password hashing for dashboard user accounts (Node-only: node:crypto).
 *
 * Stored format is a PHC-style string: `scrypt$N$r$p$<salt>$<hash>` with salt
 * and hash base64url-encoded. Parameters travel with the hash so they can be
 * strengthened later without invalidating existing rows.
 */
import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

/** Interactive-login cost (~16 MiB, <100 ms): standard scrypt defaults. */
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LENGTH = 32;
const SALT_LENGTH = 16;

/** Refuse stored params above this memory bound (128*N*r bytes) — DoS guard. */
const MAX_MEM_BYTES = 64 * 1024 * 1024;

function scryptAsync(
  password: string,
  salt: Buffer,
  N: number,
  r: number,
  p: number,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, KEY_LENGTH, { N, r, p, maxmem: MAX_MEM_BYTES * 2 }, (err, key) =>
      err ? reject(err) : resolve(key),
    );
  });
}

/** Hash a plaintext password for storage in `users.password_hash`. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const key = await scryptAsync(password, salt, SCRYPT_N, SCRYPT_R, SCRYPT_P);
  return [
    'scrypt',
    SCRYPT_N,
    SCRYPT_R,
    SCRYPT_P,
    salt.toString('base64url'),
    key.toString('base64url'),
  ].join('$');
}

/**
 * Check a plaintext password against a stored hash. Malformed or non-scrypt
 * stored values return false rather than throwing (login must never 500 on a
 * bad row).
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const saltRaw = parts[4] ?? '';
  const hashRaw = parts[5] ?? '';

  const N = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  if (![N, r, p].every((v) => Number.isInteger(v) && v > 0)) return false;
  if (128 * N * r > MAX_MEM_BYTES || p > 16) return false;

  let salt: Buffer;
  let expected: Buffer;
  try {
    salt = Buffer.from(saltRaw, 'base64url');
    expected = Buffer.from(hashRaw, 'base64url');
  } catch {
    return false;
  }
  if (salt.length === 0 || expected.length === 0) return false;

  try {
    const key = await scryptAsync(password, salt, N, r, p);
    return key.length === expected.length && timingSafeEqual(key, expected);
  } catch {
    return false;
  }
}

/**
 * Short deterministic fingerprint of a stored hash, embedded in the session
 * cookie so that changing a user's password (new hash → new fragment) marks
 * that user's existing sessions as stale without touching anyone else's.
 */
export function passwordFragment(stored: string): string {
  return createHash('sha256').update(stored).digest('hex').slice(0, 12);
}
