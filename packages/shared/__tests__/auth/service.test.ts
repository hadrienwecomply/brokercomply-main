import { describe, expect, it } from 'vitest';
import {
  MIN_PASSWORD_LENGTH,
  authenticateUser,
  createUser,
  hashPassword,
  normalizeEmail,
  setUserPassword,
} from '../../src/auth/index.js';
import type { Db, UserRow } from '../../src/db/index.js';

/**
 * Minimal stub of the drizzle query chains the service uses — auth logic is
 * unit-tested here; real SQL is exercised in the app (dev DB tests are
 * forbidden: they run against real data).
 */
function stubDb(rows: UserRow[]) {
  const calls = { updates: [] as unknown[], inserts: [] as Record<string, unknown>[] };
  const db = {
    select: () => ({ from: () => ({ where: () => ({ limit: async () => rows }) }) }),
    update: () => ({
      set: (values: unknown) => ({
        where: async () => {
          calls.updates.push(values);
        },
      }),
    }),
    insert: () => ({
      values: (values: Record<string, unknown>) => ({
        returning: async () => {
          calls.inserts.push(values);
          return [{ id: 'new-id', lastLoginAt: null, createdAt: new Date(), isActive: true, ...values }];
        },
      }),
    }),
  } as unknown as Db;
  return { db, calls };
}

async function makeUser(overrides: Partial<UserRow> = {}): Promise<UserRow> {
  return {
    id: 'user-1',
    email: 'sacha@we-comply.be',
    displayName: 'Sacha',
    passwordHash: await hashPassword('correct-password'),
    isActive: true,
    lastLoginAt: null,
    createdAt: new Date(),
    ...overrides,
  };
}

describe('authenticateUser', () => {
  it('returns the user and stamps lastLoginAt on correct credentials', async () => {
    const { db, calls } = stubDb([await makeUser()]);
    const result = await authenticateUser({ db }, 'sacha@we-comply.be', 'correct-password');
    expect(result?.email).toBe('sacha@we-comply.be');
    expect(calls.updates).toHaveLength(1);
  });

  it('rejects a wrong password without touching lastLoginAt', async () => {
    const { db, calls } = stubDb([await makeUser()]);
    await expect(
      authenticateUser({ db }, 'sacha@we-comply.be', 'wrong-password'),
    ).resolves.toBeNull();
    expect(calls.updates).toHaveLength(0);
  });

  it('rejects an inactive account even with the correct password', async () => {
    const { db, calls } = stubDb([await makeUser({ isActive: false })]);
    await expect(
      authenticateUser({ db }, 'sacha@we-comply.be', 'correct-password'),
    ).resolves.toBeNull();
    expect(calls.updates).toHaveLength(0);
  });

  it('rejects an unknown email (still burning a dummy hash verify)', async () => {
    const { db } = stubDb([]);
    await expect(
      authenticateUser({ db }, 'nobody@we-comply.be', 'whatever-password'),
    ).resolves.toBeNull();
  });
});

describe('createUser', () => {
  it('normalizes the email and stores a scrypt hash, never the plaintext', async () => {
    const { db, calls } = stubDb([]);
    const user = await createUser(
      { db },
      { email: '  Sacha@We-Comply.BE ', displayName: ' Sacha ', password: 'long-enough-password' },
    );
    expect(user.email).toBe('sacha@we-comply.be');
    expect(user.displayName).toBe('Sacha');
    expect(String(calls.inserts[0]?.passwordHash)).toMatch(/^scrypt\$/);
    expect(JSON.stringify(calls.inserts)).not.toContain('long-enough-password');
  });

  it(`rejects passwords shorter than ${MIN_PASSWORD_LENGTH} chars`, async () => {
    const { db } = stubDb([]);
    await expect(
      createUser({ db }, { email: 'a@b.co', displayName: 'A', password: 'short' }),
    ).rejects.toThrow(/at least/);
  });

  it("rejects emails containing '|' (would break the session payload) or no '@'", async () => {
    const { db } = stubDb([]);
    await expect(
      createUser({ db }, { email: 'a|b@we-comply.be', displayName: 'A', password: 'long-enough-password' }),
    ).rejects.toThrow(/invalid account email/);
    await expect(
      createUser({ db }, { email: 'not-an-email', displayName: 'A', password: 'long-enough-password' }),
    ).rejects.toThrow(/invalid account email/);
  });
});

describe('setUserPassword', () => {
  it('hashes the new password', async () => {
    const { db, calls } = stubDb([]);
    await setUserPassword({ db }, 'user-1', 'new-long-password');
    expect(String((calls.updates[0] as Record<string, unknown>).passwordHash)).toMatch(/^scrypt\$/);
  });

  it('enforces the minimum length', async () => {
    const { db } = stubDb([]);
    await expect(setUserPassword({ db }, 'user-1', 'short')).rejects.toThrow(/at least/);
  });
});

describe('normalizeEmail', () => {
  it('trims and lowercases', () => {
    expect(normalizeEmail('  SDV@We-Comply.BE ')).toBe('sdv@we-comply.be');
  });
});
