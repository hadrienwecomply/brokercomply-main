import { z } from 'zod';

/**
 * Website compliance audit — shared types.
 *
 * The JSON contract mirrors the skill's `payload.schema.json`
 * (.claude/skills/check-conformite-site-courtier/assets/): the payload is the
 * single source of truth consumed by the editable HTML renderer and the n8n
 * PDF workflow (`rapport-reco`). Keep both schemas in sync.
 */

export const VerdictSchema = z.enum(['conforme', 'non_conforme', 'sans_objet', 'a_verifier']);
export type Verdict = z.infer<typeof VerdictSchema>;

export const LevelSchema = z.enum(['critique', 'amelioration', 'conforme', 'a_verifier', 'sans_objet']);
export type Level = z.infer<typeof LevelSchema>;

/** One atomic check result produced by a point-checker (LLM). */
export const CheckResultSchema = z.object({
  id: z.string(),
  label: z.string().optional(),
  verdict: VerdictSchema,
  /** Literal quote from the page — the anti-hallucination proof. */
  evidence: z.string().optional(),
  /** Page/file the evidence comes from. */
  source: z.string().optional(),
  article: z.string().optional(),
});
export type CheckResult = z.infer<typeof CheckResultSchema>;

/** Constat for one analysis point, as returned by its checker. */
export const PointConstatSchema = z.object({
  applicable: z.boolean(),
  checks: z.array(CheckResultSchema).optional(),
});
export type PointConstat = z.infer<typeof PointConstatSchema>;

export const AuditEntitySchema = z.object({
  name: z.string(),
  bce: z.string().optional(),
  fsmaStatus: z.string().optional(),
  contact: z.string().optional(),
});
export type AuditEntity = z.infer<typeof AuditEntitySchema>;

export const AuditHeaderSchema = z.object({
  entity: AuditEntitySchema,
  site: z.object({
    url: z.string(),
    environment: z.enum(['production', 'preproduction', 'staging']).optional(),
  }),
  auditor: z.string().optional(),
  date: z.string(),
  scope: z.string().optional(),
  disclaimer: z.string().optional(),
  pages: z
    .object({
      analysed: z.array(z.string()).optional(),
      notAnalysed: z.array(z.object({ page: z.string(), reason: z.string().optional() })).optional(),
      toVerify: z.array(z.object({ topic: z.string(), reason: z.string().optional() })).optional(),
    })
    .optional(),
});
export type AuditHeader = z.infer<typeof AuditHeaderSchema>;

export const FindingSchema = z.object({
  id: z.string(),
  section: z.string().optional(),
  title: z.string(),
  level: LevelSchema,
  score: z.object({ filled: z.number().int().min(0), applicable: z.number().int().min(0) }).optional(),
  constat: z.string(),
  recommandation: z.string().optional(),
  suggestedText: z.string().nullable().optional(),
  legalRefs: z.array(z.string()).optional(),
  checks: z.array(CheckResultSchema).optional(),
});
export type Finding = z.infer<typeof FindingSchema>;

/** The deliverable JSON — input of the editable HTML and of the PDF API. */
export const AuditPayloadSchema = z.object({
  meta: z
    .object({
      locale: z.string().optional(),
      template: z.string().optional(),
      version: z.string().optional(),
      generatedAt: z.string().optional(),
    })
    .optional(),
  branding: z
    .object({
      firmName: z.string().optional(),
      logoUrl: z.string().optional(),
      primaryColor: z.string().optional(),
      accentColor: z.string().optional(),
      confidentialityNote: z.string().optional(),
    })
    .optional(),
  audit: AuditHeaderSchema,
  legalFramework: z.array(z.object({ ref: z.string(), label: z.string().optional() })).optional(),
  findings: z.array(FindingSchema).min(1),
  summary: z
    .object({
      critiques: z.number().int().min(0),
      ameliorations: z.number().int().min(0),
      conformes: z.number().int().min(0),
      aVerifier: z.number().int().min(0),
    })
    .optional(),
});
export type AuditPayload = z.infer<typeof AuditPayloadSchema>;

/** Constats file: point results keyed by point id (input of the assembler). */
export const ConstatsSchema = z.object({
  meta: z.record(z.unknown()).optional(),
  branding: z.record(z.unknown()).optional(),
  audit: AuditHeaderSchema.optional(),
  constats: z.record(PointConstatSchema),
});
export type Constats = z.infer<typeof ConstatsSchema>;

/** The hand-edited recommendation matrix ("gravée dans la roche"). */
export interface RecoMatrix {
  sections: Array<{ id: string; titre: string; sousSections: string[] }>;
  sousSections: Record<
    string,
    {
      titre?: string;
      legalRefs?: string[];
      constatLead?: string;
      checks?: Record<string, { label?: string; constatClause?: string }>;
      combinaisons?: Array<{ manquants: string[]; reco: string }>;
    }
  >;
}

/** One page scraped from the audited site. */
export interface ScrapedPage {
  url: string;
  title: string | null;
  /** Plain text extracted with html-to-text. */
  text: string;
  /** Raw visual measurement for [VISUEL] checks, when available. */
  visual?: VisualMeasurement | null;
}

export interface ScrapedSite {
  baseUrl: string;
  pages: ScrapedPage[];
  failed: Array<{ url: string; reason: string }>;
}

/** Output of the rendered-DOM measurement (see visual.ts / checks-visuels.md). */
export interface VisualMeasurement {
  url: string;
  largeurFenetre: number;
  hauteurFenetre: number;
  pageHeight: number;
  sloganTrouve: boolean;
  confiance: 'exact' | 'noyau' | 'large' | null;
  slogan: {
    tag: string;
    cls: string;
    texteReel: string;
    fontSizePx: number;
    fontWeight: string;
    color: string;
    yTop: number;
    visibleSansScroll: boolean;
    display: string;
    visibility: string;
  } | null;
  formulationExacte: boolean | null;
  accrocheMaxPx: number | null;
  accroches: Array<{ texteReel: string; fontSizePx: number; yTop: number } | null>;
  banniereCookies: boolean;
  /** Rendered-page text — the fallback content for JS/frameset pages whose
   * plain-fetch extraction came back empty. */
  texteRendu: string;
}
