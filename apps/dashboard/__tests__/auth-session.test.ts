import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  SESSION_MAX_AGE_S,
  safeNextPath,
  signSession,
  verifySession,
} from "../src/lib/auth";

const NOW = 1_760_000_000_000;
const CLAIMS = { email: "sacha@we-comply.be", phf: "a1b2c3d4e5f6" };

beforeEach(() => {
  process.env.DASHBOARD_SESSION_SECRET = "test-secret-for-vitest";
});

afterEach(() => {
  delete process.env.DASHBOARD_SESSION_SECRET;
});

describe("signSession / verifySession", () => {
  it("round-trips the claims", async () => {
    const token = await signSession(CLAIMS, NOW);
    await expect(verifySession(token, NOW)).resolves.toEqual(CLAIMS);
  });

  it("still verifies just before expiry, not after", async () => {
    const token = await signSession(CLAIMS, NOW);
    const lifeMs = SESSION_MAX_AGE_S * 1000;
    await expect(verifySession(token, NOW + lifeMs - 1)).resolves.toEqual(CLAIMS);
    await expect(verifySession(token, NOW + lifeMs)).resolves.toBeNull();
  });

  it("rejects a tampered payload", async () => {
    const token = await signSession(CLAIMS, NOW);
    const [payload, sig] = token.split(".");
    const flipped = payload[0] === "A" ? "B" + payload.slice(1) : "A" + payload.slice(1);
    await expect(verifySession(`${flipped}.${sig}`, NOW)).resolves.toBeNull();
  });

  it("rejects a token signed with a different secret", async () => {
    const token = await signSession(CLAIMS, NOW);
    process.env.DASHBOARD_SESSION_SECRET = "rotated-secret";
    await expect(verifySession(token, NOW)).resolves.toBeNull();
  });

  it("rejects garbage tokens", async () => {
    await expect(verifySession("", NOW)).resolves.toBeNull();
    await expect(verifySession("not-a-token", NOW)).resolves.toBeNull();
    await expect(verifySession("a.b", NOW)).resolves.toBeNull();
  });

  it("returns null when no session secret is configured (gate disabled)", async () => {
    const token = await signSession(CLAIMS, NOW);
    delete process.env.DASHBOARD_SESSION_SECRET;
    await expect(verifySession(token, NOW)).resolves.toBeNull();
  });
});

describe("safeNextPath", () => {
  it("keeps internal absolute paths", () => {
    expect(safeNextPath("/courtiers/abc?tab=plan")).toBe("/courtiers/abc?tab=plan");
  });

  it("falls back to / for external or malformed targets", () => {
    expect(safeNextPath(null)).toBe("/");
    expect(safeNextPath("")).toBe("/");
    expect(safeNextPath("https://evil.example")).toBe("/");
    expect(safeNextPath("//evil.example")).toBe("/");
    expect(safeNextPath("/\\evil.example")).toBe("/");
  });

  it("rejects control-char and backslash bypasses (browser strips \\t\\r\\n)", () => {
    expect(safeNextPath("/\t/evil.example")).toBe("/");
    expect(safeNextPath("/\n/evil.example")).toBe("/");
    expect(safeNextPath("/\r/evil.example")).toBe("/");
    expect(safeNextPath("/a\\evil.example")).toBe("/");
  });
});
