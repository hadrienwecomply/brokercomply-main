import { z } from 'zod';

/**
 * Print-advertising compliance audit — shared types.
 *
 * The JSON contract mirrors the `check-conformite-pub-courtier` skill's payload
 * (its "Payload JSON" section): the payload is the single source of truth
 * consumed by the editable HTML renderer and the n8n PDF workflow. One payload =
 * one advertisement (each uploaded image is analysed independently).
 *
 * Key difference from the website audit: there is no hand-edited recommendation
 * matrix. The checkers produce sourced constats *including* a ready-to-use
 * reformulation per non-conformity (skill étape 4); only the global level is
 * computed deterministically by code (skill étape 3).
 */

/** The skill's four verdicts (note: `non_applicable`, not `sans_objet`). */
export const PubVerdictSchema = z.enum([
  'conforme',
  'non_conforme',
  'a_verifier',
  'non_applicable',
]);
export type PubVerdict = z.infer<typeof PubVerdictSchema>;

/** Nature of a check — drives the deterministic global level. */
export const ConstatTypeSchema = z.enum(['interdiction', 'mention_obligatoire', 'principe']);
export type ConstatType = z.infer<typeof ConstatTypeSchema>;

/** Global level codes (skill étape 3). */
export const PubLevelSchema = z.enum(['rouge', 'orange', 'jaune', 'vert']);
export type PubLevel = z.infer<typeof PubLevelSchema>;

/** Product families a pub can promote. */
export const PubProduitSchema = z.enum([
  'credit_conso',
  'credit_hypothecaire',
  'assurance',
  'notoriete',
]);
export type PubProduit = z.infer<typeof PubProduitSchema>;

/** Which supplied elements were available for analysis. */
export const ElementFourniSchema = z.enum(['visuel', 'texte_accompagnement', 'landing_page']);
export type ElementFourni = z.infer<typeof ElementFourniSchema>;

/**
 * One constat as produced by a checker pass — a single grid check (G*, C*, H*,
 * A*). `citation` is the anti-hallucination proof (literal quote from the ad) or
 * an explicit statement of absence; `reformulation` is present for every
 * non-conformity (and formulation-type `a_verifier`).
 */
export const PubConstatSchema = z.object({
  id: z.string(),
  intitule: z.string(),
  verdict: PubVerdictSchema,
  type: ConstatTypeSchema,
  /** Literal quote from the ad, a "constat d'absence", or null. */
  citation: z.string().nullable().optional(),
  explication: z.string().optional(),
  base_legale: z.string().optional(),
  reformulation: z.string().nullable().optional(),
  /** Where a tolerated mention may legally sit (a_verifier cases). */
  a_verifier_ou: z.string().nullable().optional(),
  /**
   * Free-form officer note kept with the constat and shown in the report/PDF
   * (e.g. "vérifié avec le courtier : mention présente sur la landing"). Unlike
   * an edit's internal `correction_note`, this IS part of the deliverable.
   */
  commentaire: z.string().nullable().optional(),
  /** Grouping label for the report. */
  section: z.string().optional(),
  /**
   * Provenance of the constat. `catalog` (or absent) = a code-owned check from
   * {@link PUB_CATALOG}; `officer` = a constat the compliance officer added by
   * hand in the editable report (see {@link PubAddedConstatSchema}). Only
   * `officer` constats are user-removable and mined for the custom-check store.
   */
  origin: z.enum(['catalog', 'officer']).optional(),
});
export type PubConstat = z.infer<typeof PubConstatSchema>;

/** Max officer-added constats accepted per report (abuse / payload-size guard). */
export const MAX_ADDED_CONSTATS = 15;

/** Prefix of every officer-added constat id (namespaced away from catalog ids). */
export const PUB_ADDED_ID_PREFIX = 'CUST-';

/**
 * An officer-added constat as collected by the editable report. Unlike a catalog
 * constat, its `intitule`, `type` and `base_legale` are officer-authored (the
 * catalog can't supply them), so they travel in full — there is no base to diff
 * against. The `id` is a client-generated `CUST-…` token, stable across saves.
 * Field lengths are capped because this text is rendered into HTML and the PDF.
 */
export const PubAddedConstatSchema = z.object({
  id: z.string().regex(new RegExp(`^${PUB_ADDED_ID_PREFIX}[A-Za-z0-9_-]{1,48}$`)),
  section: z.string().min(1).max(120),
  intitule: z.string().min(1).max(300),
  type: ConstatTypeSchema.default('principe'),
  verdict: PubVerdictSchema.default('a_verifier'),
  citation: z.string().max(4000).nullable().optional(),
  explication: z.string().max(4000).optional(),
  base_legale: z.string().max(500).optional(),
  reformulation: z.string().max(4000).nullable().optional(),
  a_verifier_ou: z.string().max(1000).nullable().optional(),
  commentaire: z.string().max(4000).nullable().optional(),
});
export type PubAddedConstat = z.infer<typeof PubAddedConstatSchema>;

/** Result of the shared transcription + qualification pass (pass 0). */
export const PubQualificationSchema = z.object({
  format: z.string(),
  produits: z.array(PubProduitSchema),
  elements_fournis: z.array(ElementFourniSchema),
  /** Full factual transcription of the ad — the shared source of truth. */
  transcription: z.string(),
  /** Optional note (e.g. "si le support est en réalité un email…"). */
  note: z.string().optional(),
});
export type PubQualification = z.infer<typeof PubQualificationSchema>;

/**
 * A raw constat as returned by a checker pass — ONLY the fields the checker
 * prompt asks the model to produce. `intitule`, `type`, `section` and
 * `base_legale` are deliberately NOT here: they are catalog-owned and injected
 * deterministically by the assembler. Validating the LLM output against the
 * full {@link PubConstatSchema} (which requires intitule/type) would reject
 * every real response — keep this schema in sync with PUB_CHECKER_SYSTEM_PROMPT.
 */
export const RawPassConstatSchema = z.object({
  id: z.string(),
  verdict: PubVerdictSchema,
  citation: z.string().nullable().optional(),
  explication: z.string().optional(),
  reformulation: z.string().nullable().optional(),
  a_verifier_ou: z.string().nullable().optional(),
});
export type RawPassConstat = z.infer<typeof RawPassConstatSchema>;

/** Raw output of a single analysis pass (A/B/C). */
export const PassResultSchema = z.object({
  constats: z.array(RawPassConstatSchema),
});
export type PassResult = z.infer<typeof PassResultSchema>;

export const DecompteSchema = z.object({
  non_conforme: z.number().int().min(0),
  a_verifier: z.number().int().min(0),
  conforme: z.number().int().min(0),
  non_applicable: z.number().int().min(0),
});
export type Decompte = z.infer<typeof DecompteSchema>;

export const NiveauGlobalSchema = z.object({
  code: PubLevelSchema,
  libelle: z.string(),
  decompte: DecompteSchema,
});
export type NiveauGlobal = z.infer<typeof NiveauGlobalSchema>;

/**
 * The deliverable payload — input of the editable HTML report and of the n8n
 * PDF workflow. Format tag: `brokercomply-pub/v1`.
 */
export const PubAuditPayloadSchema = z.object({
  meta: z
    .object({
      locale: z.string().optional(),
      template: z.string().optional(),
      version: z.string().optional(),
      generatedAt: z.string().optional(),
      /** Version tag of the check catalog the audit was produced with. */
      catalogVersion: z.string().optional(),
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
  /** Ad header. */
  support: z.object({
    fichier: z.string(),
    format: z.string(),
    produits: z.array(PubProduitSchema),
    elements_fournis: z.array(ElementFourniSchema),
    entiteName: z.string().optional(),
    /**
     * The analysed creative as a `data:<mime>;base64,...` URI, for display in
     * the report. Injected at render/PDF time from the stored image — NOT
     * persisted in the findings payload (avoids duplicating the image blob).
     */
    image: z.string().optional(),
  }),
  dateAnalyse: z.string(),
  /** Factual description/transcription of the ad. */
  description: z.string(),
  niveauGlobal: NiveauGlobalSchema,
  constats: z.array(PubConstatSchema),
  disclaimer: z.string().optional(),
  note: z.string().nullable().optional(),
});
export type PubAuditPayload = z.infer<typeof PubAuditPayloadSchema>;
