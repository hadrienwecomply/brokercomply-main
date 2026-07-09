import { PUB_CATALOG, PUB_CHECK_BY_ID, PUB_SECTIONS, type PubCheck } from './catalog.js';
import type {
  Decompte,
  NiveauGlobal,
  PubAuditPayload,
  PubConstat,
  PubLevel,
  PubProduit,
  PubQualification,
} from './types.js';

/**
 * Deterministic assembler for the print-advertising audit. Given the raw
 * constats produced by the checker passes (verdict + citation + reformulation)
 * and the shared qualification, it:
 *  - enriches each constat with the catalog's authoritative intitulé, type,
 *    section and legal basis (the LLM never decides these);
 *  - fills any applicable-but-unanalysed check with an honest `a_verifier`;
 *  - orders constats by section then catalog order;
 *  - computes the decompte and the global level (skill étape 3) purely by
 *    counting — the same constats always yield the same level.
 */

const LEVEL_LIBELLE: Record<PubLevel, string> = {
  rouge: "Non conforme — ne pas diffuser en l'état",
  orange: 'Non conforme — mentions à compléter avant diffusion',
  jaune: 'Sous réserve — éléments à vérifier',
  vert: 'Aucun constat de non-conformité',
};

const DEFAULT_DISCLAIMER =
  "Analyse informative sur base du guide Do & Don't Brokercomply (juillet 2026). Ne constitue pas un conseil juridique ; la FSMA et le SPF Économie peuvent avoir une lecture différente. En cas de doute, consulter le compliance officer.";

/** Checks applicable to the qualified products (across all passes). */
export function applicableChecks(produits: PubProduit[]): PubCheck[] {
  const set = new Set(produits);
  return PUB_CATALOG.filter((c) => {
    if (!c.produits) return true; // general check
    return c.produits.some((p) => set.has(p));
  });
}

/** Verdict severity for dedup (higher wins when the same id appears twice). */
const VERDICT_RANK: Record<PubConstat['verdict'], number> = {
  non_conforme: 3,
  a_verifier: 2,
  conforme: 1,
  non_applicable: 0,
};

/** Global level from the constats (skill étape 3, applied in order). */
export function computeNiveau(constats: PubConstat[]): NiveauGlobal {
  const decompte: Decompte = { non_conforme: 0, a_verifier: 0, conforme: 0, non_applicable: 0 };
  let hasProhibitionNc = false;
  let hasOtherNc = false;
  let hasAVerifier = false;
  for (const c of constats) {
    decompte[c.verdict] += 1;
    if (c.verdict === 'non_conforme') {
      if (c.type === 'interdiction') hasProhibitionNc = true;
      else hasOtherNc = true;
    } else if (c.verdict === 'a_verifier') {
      hasAVerifier = true;
    }
  }
  let code: PubLevel;
  if (hasProhibitionNc) code = 'rouge';
  else if (hasOtherNc) code = 'orange';
  else if (hasAVerifier) code = 'jaune';
  else code = 'vert';
  return { code, libelle: LEVEL_LIBELLE[code], decompte };
}

export interface AssemblePubInput {
  qualification: PubQualification;
  /** Raw constats from the checker passes (may omit or duplicate ids). */
  rawConstats: Array<Partial<PubConstat> & { id: string; verdict: PubConstat['verdict'] }>;
  fileName: string;
  dateAnalyse: string;
  entiteName?: string;
  branding?: PubAuditPayload['branding'];
}

export function assemblePubPayload(input: AssemblePubInput): PubAuditPayload {
  const { qualification, rawConstats, fileName, dateAnalyse } = input;
  const applicable = applicableChecks(qualification.produits);
  const applicableIds = new Set(applicable.map((c) => c.id));

  // Merge raw constats by id: keep the most severe verdict, drop unknown ids.
  const byId = new Map<string, PubConstat>();
  for (const raw of rawConstats) {
    const check = PUB_CHECK_BY_ID[raw.id];
    if (!check || !applicableIds.has(raw.id)) continue; // hors périmètre → ignoré
    const enriched: PubConstat = {
      id: check.id,
      intitule: check.intitule,
      type: check.type,
      section: check.section,
      base_legale: check.baseLegale,
      verdict: raw.verdict,
      citation: raw.citation ?? null,
      explication: raw.explication ?? '',
      reformulation: raw.reformulation ?? null,
      a_verifier_ou: raw.a_verifier_ou ?? null,
    };
    const prev = byId.get(check.id);
    if (!prev || VERDICT_RANK[enriched.verdict] > VERDICT_RANK[prev.verdict]) {
      byId.set(check.id, enriched);
    }
  }

  // Fill any applicable check that no pass returned — honest "à vérifier".
  for (const check of applicable) {
    if (byId.has(check.id)) continue;
    byId.set(check.id, {
      id: check.id,
      intitule: check.intitule,
      type: check.type,
      section: check.section,
      base_legale: check.baseLegale,
      verdict: 'a_verifier',
      citation: null,
      explication: "Ce point n'a pas pu être analysé lors de cette passe.",
      reformulation: null,
      a_verifier_ou: null,
    });
  }

  // Order by section, then by catalog order within the section.
  const catalogOrder = new Map(PUB_CATALOG.map((c, i) => [c.id, i]));
  const constats = [...byId.values()].sort((a, b) => {
    const sa = PUB_SECTIONS.indexOf(a.section ?? '');
    const sb = PUB_SECTIONS.indexOf(b.section ?? '');
    if (sa !== sb) return sa - sb;
    return (catalogOrder.get(a.id) ?? 0) - (catalogOrder.get(b.id) ?? 0);
  });

  const niveauGlobal = computeNiveau(constats);

  return {
    meta: { locale: 'fr-BE', template: 'brokercomply-pub/v1', version: 'DRAFT', generatedAt: dateAnalyse },
    branding: input.branding ?? {},
    support: {
      fichier: fileName,
      format: qualification.format,
      produits: qualification.produits,
      elements_fournis: qualification.elements_fournis,
      ...(input.entiteName ? { entiteName: input.entiteName } : {}),
    },
    dateAnalyse,
    description: qualification.transcription,
    niveauGlobal,
    constats,
    disclaimer: DEFAULT_DISCLAIMER,
    note: qualification.note ?? null,
  };
}
