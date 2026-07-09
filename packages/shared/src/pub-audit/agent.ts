import type { ChatImage, LLMClient } from '../llm/types.js';
import { checksForPass, type PubPass } from './catalog.js';
import { assemblePubPayload } from './assemble.js';
import {
  buildPassPrompt,
  buildQualificationPrompt,
  PUB_CHECKER_SYSTEM_PROMPT,
  QUALIFICATION_SYSTEM_PROMPT,
} from './prompts.js';
import {
  PassResultSchema,
  PubQualificationSchema,
  type PubAuditPayload,
  type PubConstat,
  type PubQualification,
} from './types.js';

/** One advertisement to analyse. */
export interface PubAuditInput {
  /** Display name of the uploaded file (shown in the report). */
  fileName: string;
  /** Raw base64 of the image (no data: prefix). */
  imageBase64: string;
  /** e.g. 'image/png', 'image/jpeg', 'image/webp'. */
  imageMediaType: string;
  /** Broker/firm name, for the report header. */
  entiteName?: string;
  /** ISO date (YYYY-MM-DD); defaults to today. */
  date?: string;
  branding?: PubAuditPayload['branding'];
  onProgress?: (event: PubAuditProgressEvent) => void;
}

export type PubAuditProgressEvent =
  | { kind: 'qualification:done'; format: string; produits: string[] }
  | { kind: 'pass:done'; pass: PubPass; constats: number }
  | { kind: 'pass:error'; pass: PubPass; error: string };

export interface PubAuditResult {
  payload: PubAuditPayload;
  qualification: PubQualification;
  /** Passes that failed even after retry (their checks fall back to "à vérifier"). */
  errors: Array<{ pass: PubPass; error: string }>;
}

function extractJsonObject(text: string): string {
  const cleaned = text.replace(/```(?:json)?/gi, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) {
    throw new Error('No JSON object found in LLM output');
  }
  return cleaned.slice(start, end + 1);
}

async function callWithRetry<T>(
  llm: LLMClient,
  system: string,
  prompt: string,
  image: ChatImage,
  parse: (raw: string) => T,
  maxRetries = 2,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    const reminder =
      attempt === 0
        ? ''
        : "\n\nTa réponse précédente n'était pas un JSON valide conforme au format demandé. Réponds avec UNIQUEMENT l'objet JSON.";
    try {
      const raw = await llm.chat([{ role: 'user', content: prompt + reminder }], {
        system,
        maxTokens: 4096,
        temperature: 0,
        images: [image],
      });
      return parse(raw);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

/**
 * Analyse ONE advertisement image. Runs the shared transcription/qualification
 * pass, then the three checker passes (A/B/C) in parallel — each sees the image
 * and the shared transcription and owns a disjoint set of grid checks. The
 * global level is computed deterministically by the assembler.
 */
export async function runPubAudit(llm: LLMClient, input: PubAuditInput): Promise<PubAuditResult> {
  const onProgress = input.onProgress ?? (() => {});
  const image: ChatImage = { base64: input.imageBase64, mediaType: input.imageMediaType };
  const dateAnalyse = input.date ?? new Date().toISOString().slice(0, 10);

  // Pass 0 — transcription + qualification (shared source of truth).
  const qualification = await callWithRetry(
    llm,
    QUALIFICATION_SYSTEM_PROMPT,
    buildQualificationPrompt(input.fileName),
    image,
    (raw) => PubQualificationSchema.parse(JSON.parse(extractJsonObject(raw))),
  );
  onProgress({
    kind: 'qualification:done',
    format: qualification.format,
    produits: qualification.produits,
  });

  // Passes A/B/C — parallel, disjoint check sets. Skip passes with no
  // applicable checks (e.g. pass B for a pure-notoriety ad).
  const passes: PubPass[] = ['A', 'B', 'C'];
  const errors: Array<{ pass: PubPass; error: string }> = [];
  const rawConstats: Array<Partial<PubConstat> & { id: string; verdict: PubConstat['verdict'] }> = [];

  await Promise.all(
    passes.map(async (pass) => {
      const checks = checksForPass(pass, qualification.produits);
      if (checks.length === 0) return;
      try {
        const result = await callWithRetry(
          llm,
          PUB_CHECKER_SYSTEM_PROMPT,
          buildPassPrompt(pass, checks, qualification, input.fileName),
          image,
          (raw) => PassResultSchema.parse(JSON.parse(extractJsonObject(raw))),
        );
        for (const c of result.constats) rawConstats.push(c);
        onProgress({ kind: 'pass:done', pass, constats: result.constats.length });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        errors.push({ pass, error: message });
        onProgress({ kind: 'pass:error', pass, error: message });
      }
    }),
  );

  const payload = assemblePubPayload({
    qualification,
    rawConstats,
    fileName: input.fileName,
    dateAnalyse,
    entiteName: input.entiteName,
    branding: input.branding,
  });

  return { payload, qualification, errors };
}
