import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  MAX_ATTACHMENT_BYTES,
  parseAttachment,
  type AttachmentExtractors,
} from '../../src/ingestion/attachment-parser.js';
import type { AttachmentContent } from '../../src/ingestion/types.js';

const ATTACH_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../../fixtures/attachments');

function content(partial: Partial<AttachmentContent> & { bytes: Buffer }): AttachmentContent {
  return { name: 'file', contentType: 'application/octet-stream', size: partial.bytes.length, ...partial };
}

describe('parseAttachment — real files', () => {
  it('extracts text from a real PDF', async () => {
    const bytes = await readFile(resolve(ATTACH_DIR, 'circulaire-fsma.pdf'));
    const text = await parseAttachment(content({ name: 'c.pdf', contentType: 'application/pdf', bytes }));
    expect(text).toContain('Circulaire FSMA 2023_12');
    expect(text).toContain('fit & proper');
  });

  it('extracts text from a real DOCX', async () => {
    const bytes = await readFile(resolve(ATTACH_DIR, 'circulaire-fsma.docx'));
    const text = await parseAttachment(
      content({
        name: 'c.docx',
        contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        bytes,
      }),
    );
    expect(text).toContain('Circulaire FSMA 2023_12');
  });
});

describe('parseAttachment — dispatch logic', () => {
  const extractors: AttachmentExtractors = {
    pdf: vi.fn(async () => '  pdf text  '),
    docx: vi.fn(async () => 'docx text'),
  };

  it('routes by content type and trims', async () => {
    expect(
      await parseAttachment(content({ contentType: 'application/pdf', bytes: Buffer.from('x') }), extractors),
    ).toBe('pdf text');
  });

  it('routes by filename extension when content type is generic', async () => {
    expect(
      await parseAttachment(content({ name: 'a.docx', bytes: Buffer.from('x') }), extractors),
    ).toBe('docx text');
  });

  it('returns null for unsupported types', async () => {
    expect(
      await parseAttachment(content({ name: 'img.png', contentType: 'image/png', bytes: Buffer.from('x') }), extractors),
    ).toBeNull();
  });

  it('skips files over the size limit', async () => {
    const big = content({ contentType: 'application/pdf', bytes: Buffer.alloc(MAX_ATTACHMENT_BYTES + 1) });
    expect(await parseAttachment(big, extractors)).toBeNull();
  });

  it('returns null when extraction throws', async () => {
    const throwing: AttachmentExtractors = {
      pdf: async () => {
        throw new Error('boom');
      },
      docx: async () => '',
    };
    expect(
      await parseAttachment(content({ contentType: 'application/pdf', bytes: Buffer.from('x') }), throwing),
    ).toBeNull();
  });
});
