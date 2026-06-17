import mammoth from 'mammoth';
import { PDFParse } from 'pdf-parse';
import type { AttachmentContent } from './types.js';

/** Skip attachments larger than this (bytes). */
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

const PDF_TYPES = ['application/pdf'];
const DOCX_TYPES = [
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

/** Injectable extractors so the dispatcher is unit-testable without real files. */
export interface AttachmentExtractors {
  pdf(bytes: Buffer): Promise<string>;
  docx(bytes: Buffer): Promise<string>;
}

async function extractPdf(bytes: Buffer): Promise<string> {
  const parser = new PDFParse({ data: new Uint8Array(bytes) });
  try {
    const result = await parser.getText();
    return result.text;
  } finally {
    await parser.destroy();
  }
}

async function extractDocx(bytes: Buffer): Promise<string> {
  const result = await mammoth.extractRawText({ buffer: bytes });
  return result.value;
}

const defaultExtractors: AttachmentExtractors = { pdf: extractPdf, docx: extractDocx };

function kind(contentType: string, name: string): 'pdf' | 'docx' | null {
  const type = contentType.toLowerCase();
  const lowerName = name.toLowerCase();
  if (PDF_TYPES.includes(type) || lowerName.endsWith('.pdf')) return 'pdf';
  if (DOCX_TYPES.includes(type) || lowerName.endsWith('.docx')) return 'docx';
  return null;
}

/**
 * Extract plain text from a supported attachment (PDF, DOCX). Returns null for
 * unsupported types, oversized files, or extraction failures — ingestion must
 * never fail because of one bad attachment.
 */
export async function parseAttachment(
  attachment: AttachmentContent,
  extractors: AttachmentExtractors = defaultExtractors,
): Promise<string | null> {
  if (attachment.bytes.length > MAX_ATTACHMENT_BYTES) return null;

  const type = kind(attachment.contentType, attachment.name);
  if (!type) return null;

  try {
    const text = type === 'pdf' ? await extractors.pdf(attachment.bytes) : await extractors.docx(attachment.bytes);
    const trimmed = text.trim();
    return trimmed.length > 0 ? trimmed : null;
  } catch {
    return null;
  }
}
