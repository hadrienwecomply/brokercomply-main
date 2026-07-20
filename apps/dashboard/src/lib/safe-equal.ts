import { timingSafeEqual } from "node:crypto";

/**
 * Constant-time string compare for shared secrets (URL tokens, callback
 * headers). Pads both buffers to the same length so `timingSafeEqual` always
 * runs — an early length-mismatch return would leak the secret's length
 * through response timing.
 *
 * Node runtime only: `node:crypto` is unavailable on Edge, so any route using
 * this must declare `export const runtime = "nodejs"`.
 */
export function safeEqual(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  if (!a || !b) return false;
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  const len = Math.max(ba.length, bb.length);
  const pa = Buffer.alloc(len);
  const pb = Buffer.alloc(len);
  ba.copy(pa);
  bb.copy(pb);
  return timingSafeEqual(pa, pb) && ba.length === bb.length;
}
