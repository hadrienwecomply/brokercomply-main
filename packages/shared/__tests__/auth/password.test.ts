import { describe, expect, it } from 'vitest';
import { hashPassword, passwordFragment, verifyPassword } from '../../src/auth/index.js';

describe('hashPassword', () => {
  it('produces a PHC-style scrypt string', async () => {
    const stored = await hashPassword('s3cret!');
    const parts = stored.split('$');
    expect(parts).toHaveLength(6);
    expect(parts[0]).toBe('scrypt');
    // N, r, p are positive integers.
    expect(Number(parts[1])).toBeGreaterThan(0);
    expect(Number(parts[2])).toBeGreaterThan(0);
    expect(Number(parts[3])).toBeGreaterThan(0);
    // salt + hash are non-empty base64url.
    expect(parts[4]).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(parts[5]).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('salts: same password twice → different strings, both verify', async () => {
    const a = await hashPassword('same-password');
    const b = await hashPassword('same-password');
    expect(a).not.toBe(b);
    await expect(verifyPassword('same-password', a)).resolves.toBe(true);
    await expect(verifyPassword('same-password', b)).resolves.toBe(true);
  });
});

describe('verifyPassword', () => {
  it('accepts the correct password', async () => {
    const stored = await hashPassword('correct horse battery staple');
    await expect(verifyPassword('correct horse battery staple', stored)).resolves.toBe(true);
  });

  it('rejects a wrong password', async () => {
    const stored = await hashPassword('right');
    await expect(verifyPassword('wrong', stored)).resolves.toBe(false);
  });

  it('handles unicode passwords', async () => {
    const stored = await hashPassword('pâsswörd✓émoji🎉');
    await expect(verifyPassword('pâsswörd✓émoji🎉', stored)).resolves.toBe(true);
    await expect(verifyPassword('pâsswörd✓émoji', stored)).resolves.toBe(false);
  });

  it('rejects malformed stored hashes instead of throwing', async () => {
    await expect(verifyPassword('x', '')).resolves.toBe(false);
    await expect(verifyPassword('x', 'garbage')).resolves.toBe(false);
    await expect(verifyPassword('x', 'bcrypt$2b$10$abc')).resolves.toBe(false);
    await expect(verifyPassword('x', 'scrypt$16384$8$1$onlyfiveparts')).resolves.toBe(false);
    await expect(verifyPassword('x', 'scrypt$NaN$8$1$c2FsdA$aGFzaA')).resolves.toBe(false);
    // Absurd cost params must be refused (DoS guard), not executed.
    await expect(verifyPassword('x', 'scrypt$1073741824$8$1$c2FsdA$aGFzaA')).resolves.toBe(false);
  });
});

describe('passwordFragment', () => {
  it('is deterministic for the same stored hash', () => {
    expect(passwordFragment('scrypt$16384$8$1$abc$def')).toBe(
      passwordFragment('scrypt$16384$8$1$abc$def'),
    );
  });

  it('changes when the stored hash changes', () => {
    expect(passwordFragment('scrypt$16384$8$1$abc$def')).not.toBe(
      passwordFragment('scrypt$16384$8$1$abc$xyz'),
    );
  });

  it('is short and hex (goes into the session cookie payload)', () => {
    expect(passwordFragment('whatever')).toMatch(/^[0-9a-f]{12}$/);
  });
});
