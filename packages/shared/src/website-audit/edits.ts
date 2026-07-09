import { z } from 'zod';
import { LevelSchema, type AuditPayload, type Level } from './types.js';

/**
 * Officer edits captured by the editable audit report
 * (format `brokercomply-audit/v1`) and re-injected into the payload before it
 * is sent to the PDF workflow. Keyed by finding id so edits survive re-renders.
 */
export const AuditEditsSchema = z.object({
  header: z
    .object({
      scope: z.string().optional(),
      disclaimer: z.string().optional(),
      fsmaStatus: z.string().optional(),
    })
    .optional(),
  findings: z
    .record(
      z.object({
        constat: z.string().optional(),
        recommandation: z.string().optional(),
        suggestedText: z.string().optional(),
        level: LevelSchema.optional(),
      }),
    )
    .optional(),
});
export type AuditEdits = z.infer<typeof AuditEditsSchema>;

function recomputeSummary(payload: AuditPayload): AuditPayload['summary'] {
  const counts: Record<Level, number> = {
    critique: 0,
    amelioration: 0,
    conforme: 0,
    a_verifier: 0,
    sans_objet: 0,
  };
  for (const f of payload.findings) counts[f.level] += 1;
  return {
    critiques: counts.critique,
    ameliorations: counts.amelioration,
    conformes: counts.conforme,
    aVerifier: counts.a_verifier,
  };
}

/**
 * Merge officer edits into an audit payload. Unknown finding ids are ignored;
 * the summary is recomputed when levels changed. Throws (Zod) on malformed
 * edits — callers surface that as a 400.
 */
export function applyAuditEdits(payload: AuditPayload, rawEdits: unknown): AuditPayload {
  const edits = AuditEditsSchema.parse(rawEdits ?? {});
  const out: AuditPayload = {
    ...payload,
    audit: {
      ...payload.audit,
      ...(edits.header?.scope !== undefined ? { scope: edits.header.scope } : {}),
      ...(edits.header?.disclaimer !== undefined ? { disclaimer: edits.header.disclaimer } : {}),
      entity: {
        ...payload.audit.entity,
        ...(edits.header?.fsmaStatus !== undefined ? { fsmaStatus: edits.header.fsmaStatus } : {}),
      },
    },
    findings: payload.findings.map((f) => {
      const e = edits.findings?.[f.id];
      if (!e) return f;
      return {
        ...f,
        ...(e.constat !== undefined ? { constat: e.constat } : {}),
        ...(e.recommandation !== undefined ? { recommandation: e.recommandation } : {}),
        ...(e.suggestedText !== undefined ? { suggestedText: e.suggestedText } : {}),
        ...(e.level !== undefined ? { level: e.level } : {}),
      };
    }),
  };
  out.summary = recomputeSummary(out);
  return out;
}
