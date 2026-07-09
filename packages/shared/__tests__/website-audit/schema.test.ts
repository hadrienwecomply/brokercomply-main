import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { AuditPayloadSchema } from '../../src/website-audit/types.js';

const here = dirname(fileURLToPath(import.meta.url));

describe('AuditPayloadSchema', () => {
  it('accepts the reference payload produced by the original skill', () => {
    // Fixture copied from the skill's assets/payload-genere-exemple.json —
    // the contract consumed by the n8n `rapport-reco` PDF workflow.
    const example: unknown = JSON.parse(
      readFileSync(join(here, 'fixtures', 'payload-genere-exemple.json'), 'utf8'),
    );
    const parsed = AuditPayloadSchema.parse(example);
    expect(parsed.findings.length).toBeGreaterThan(0);
    expect(parsed.audit.entity.name).toBeTruthy();
  });

  it('rejects a payload without findings', () => {
    expect(() =>
      AuditPayloadSchema.parse({
        audit: { entity: { name: 'X' }, site: { url: 'https://x.be' }, date: '2026-07-08' },
        findings: [],
      }),
    ).toThrow();
  });
});
