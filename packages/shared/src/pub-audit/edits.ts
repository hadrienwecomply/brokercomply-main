import { z } from 'zod';
import { computeNiveau } from './assemble.js';
import { PubVerdictSchema, type PubAuditPayload } from './types.js';

/**
 * Officer edits captured by the editable pub report (format
 * `brokercomply-pub/v1`) and re-injected into the payload before it is sent to
 * the PDF workflow. Keyed by constat id so edits survive re-renders. When a
 * verdict changes, the global level is recomputed deterministically.
 */
export const PubAuditEditsSchema = z.object({
  header: z
    .object({
      description: z.string().optional(),
      disclaimer: z.string().optional(),
      note: z.string().optional(),
    })
    .optional(),
  constats: z
    .record(
      z.object({
        verdict: PubVerdictSchema.optional(),
        citation: z.string().optional(),
        explication: z.string().optional(),
        reformulation: z.string().optional(),
      }),
    )
    .optional(),
});
export type PubAuditEdits = z.infer<typeof PubAuditEditsSchema>;

/**
 * Merge officer edits into a pub payload. Unknown constat ids are ignored; the
 * global level (niveauGlobal) is recomputed from the resulting verdicts. Throws
 * (Zod) on malformed edits — callers surface that as a 400.
 */
export function applyPubEdits(payload: PubAuditPayload, rawEdits: unknown): PubAuditPayload {
  const edits = PubAuditEditsSchema.parse(rawEdits ?? {});
  const constats = payload.constats.map((c) => {
    const e = edits.constats?.[c.id];
    if (!e) return c;
    return {
      ...c,
      ...(e.verdict !== undefined ? { verdict: e.verdict } : {}),
      ...(e.citation !== undefined ? { citation: e.citation } : {}),
      ...(e.explication !== undefined ? { explication: e.explication } : {}),
      ...(e.reformulation !== undefined ? { reformulation: e.reformulation } : {}),
    };
  });

  return {
    ...payload,
    ...(edits.header?.description !== undefined ? { description: edits.header.description } : {}),
    ...(edits.header?.disclaimer !== undefined ? { disclaimer: edits.header.disclaimer } : {}),
    ...(edits.header?.note !== undefined ? { note: edits.header.note } : {}),
    constats,
    niveauGlobal: computeNiveau(constats),
  };
}
