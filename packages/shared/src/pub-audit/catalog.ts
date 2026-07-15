import type { ConstatType, PubProduit } from './types.js';

/**
 * Deterministic grid of every check of the `check-conformite-pub-courtier`
 * skill (~50 checks). Ported by hand from the skill's `references/*.md`; kept in
 * sync manually (same convention as the website-audit catalog).
 *
 * The catalog is the code-owned source of truth for:
 *  - the canonical intitulé, section and legal basis of each check (so the
 *    report's structure and legal refs never drift with the LLM);
 *  - the `type` (interdiction | mention_obligatoire | principe) that drives the
 *    deterministic global level (skill étape 3) — the LLM's own `type` is
 *    advisory only.
 *
 * `pass` assigns each check to exactly one analysis pass so the passes cover
 * disjoint check-ids (no dedup needed):
 *  - A: identité, rôle, identification publicitaire, comparaisons, cohérence
 *  - B: product-specific mentions & prohibitions (conso / hypo / assurance)
 *  - C: visual balance & proportions (sizes, superlatives, AI, risk/reward)
 */

export type PubPass = 'A' | 'B' | 'C';

/**
 * Version tag of the grid below. Bump it whenever a check is added, removed or
 * re-scoped so a stored audit records which grid produced it (payload.meta).
 */
export const PUB_CATALOG_VERSION = '2026-07';

export interface PubCheck {
  id: string;
  intitule: string;
  type: ConstatType;
  section: string;
  baseLegale: string;
  pass: PubPass;
  /**
   * Products this check applies to. `undefined` = applies to any pub
   * (general checks). Used to skip product passes for pure-notoriety ads.
   */
  produits?: PubProduit[];
}

const S_IDENTITE = 'Identité & mentions FSMA';
const S_LOYAUTE = 'Loyauté, clarté & non-tromperie';
const S_IDENTIF = 'Identification publicitaire, comparaisons & IA';
const S_CONSO = 'Crédit à la consommation';
const S_HYPO = 'Crédit hypothécaire';
const S_ASSUR = 'Assurances';

export const PUB_CATALOG: PubCheck[] = [
  // ── Partie 1 · Règles générales ────────────────────────────────────────
  { id: 'G1', intitule: "Nom de l'intermédiaire", type: 'mention_obligatoire', section: S_IDENTITE, baseLegale: 'Art. VII.123 §1 al. 2 CDE ; Art. VII.65 §2 CDE', pass: 'A' },
  { id: 'G2', intitule: "Statut d'intermédiaire", type: 'mention_obligatoire', section: S_IDENTITE, baseLegale: 'Art. VII.123 §2 al. 2, 1° CDE ; Art. VII.73 CDE', pass: 'A' },
  { id: 'G3', intitule: "Numéro d'inscription FSMA", type: 'mention_obligatoire', section: S_IDENTITE, baseLegale: 'Art. VII.123 §2 al. 2, 1° CDE', pass: 'A' },
  { id: 'G4', intitule: 'Adresse géographique', type: 'mention_obligatoire', section: S_IDENTITE, baseLegale: 'Art. VII.123 §1 al. 2 CDE', pass: 'A' },
  { id: 'G5', intitule: "Pas d'usage de l'inscription FSMA comme argument commercial", type: 'interdiction', section: S_IDENTITE, baseLegale: 'Art. VII.65 §2 CDE ; Art. VII.123 §2 CDE', pass: 'A' },
  { id: 'G6', intitule: 'Pas de confusion sur le rôle', type: 'interdiction', section: S_IDENTITE, baseLegale: 'Art. VII.73 CDE ; Art. VII.65 §2 CDE', pass: 'A' },
  { id: 'G7', intitule: 'Équilibre avantages / risques', type: 'interdiction', section: S_LOYAUTE, baseLegale: 'Art. VI.97 CDE ; Art. VII.123 §1 al. 1 CDE', pass: 'C' },
  { id: 'G8', intitule: 'Pas de promesses ou superlatifs non démontrables', type: 'interdiction', section: S_LOYAUTE, baseLegale: 'Art. VI.95 et VI.97 CDE ; Circulaire FSMA_2015_16', pass: 'C' },
  { id: 'G9', intitule: 'Pas de chiffre hors contexte, pas de fausse accessibilité', type: 'interdiction', section: S_LOYAUTE, baseLegale: 'Art. VI.97 CDE', pass: 'C' },
  { id: 'G10', intitule: "Pas d'événement futur incertain présenté comme certain", type: 'interdiction', section: S_LOYAUTE, baseLegale: 'Art. VI.97 CDE', pass: 'C' },
  { id: 'G11', intitule: 'Cohérence visuel / texte / documentation', type: 'principe', section: S_LOYAUTE, baseLegale: 'Art. VI.95 et VI.97 CDE ; Circulaire FSMA_2015_16', pass: 'A' },
  { id: 'G12', intitule: 'Identification de la publicité comme telle', type: 'interdiction', section: S_IDENTIF, baseLegale: 'Art. VI.93 et suiv. CDE ; Art. XII.6 et XII.12 CDE', pass: 'A' },
  { id: 'G13', intitule: 'Comparaison loyale', type: 'interdiction', section: S_IDENTIF, baseLegale: 'Art. VI.17 à VI.19 CDE', pass: 'A' },
  { id: 'G14', intitule: "Transparence de l'usage de l'IA", type: 'mention_obligatoire', section: S_IDENTIF, baseLegale: 'Règlement (UE) 2024/1689 (AI Act) art. 50 ; Art. VI.97 CDE', pass: 'C' },

  // ── Partie 2 · Crédit à la consommation ────────────────────────────────
  { id: 'C1', intitule: 'Slogan obligatoire présent', type: 'mention_obligatoire', section: S_CONSO, baseLegale: 'Art. VII.64 §1 CDE ; AR du 14 septembre 2016', pass: 'B', produits: ['credit_conso'] },
  { id: 'C2', intitule: 'Slogan lisible et proéminent (≥ 7 pts / 4 %)', type: 'mention_obligatoire', section: S_CONSO, baseLegale: 'Art. VII.64 §1 CDE ; AR du 14 septembre 2016', pass: 'C', produits: ['credit_conso'] },
  { id: 'C3', intitule: 'Exemple représentatif complet', type: 'mention_obligatoire', section: S_CONSO, baseLegale: 'Art. VII.64 §2 CDE ; AR TAEG du 14 septembre 2016', pass: 'B', produits: ['credit_conso'] },
  { id: 'C4', intitule: 'Exemple distinct par type de crédit', type: 'mention_obligatoire', section: S_CONSO, baseLegale: 'Art. VII.64 §1 al. 3 CDE', pass: 'B', produits: ['credit_conso'] },
  { id: 'C5a', intitule: 'Ne pas inciter le consommateur en difficulté', type: 'interdiction', section: S_CONSO, baseLegale: 'Art. VII.65 §1 et §2 CDE', pass: 'B', produits: ['credit_conso'] },
  { id: 'C5b', intitule: 'Ne pas mettre en valeur la facilité ou la rapidité', type: 'interdiction', section: S_CONSO, baseLegale: 'Art. VII.65 §2 CDE', pass: 'B', produits: ['credit_conso'] },
  { id: 'C5c', intitule: 'Ne pas inciter au regroupement de crédits', type: 'interdiction', section: S_CONSO, baseLegale: 'Art. VII.65 §2 CDE', pass: 'B', produits: ['credit_conso'] },
  { id: 'C5d', intitule: "Ne pas minimiser l'influence des crédits en cours", type: 'interdiction', section: S_CONSO, baseLegale: 'Art. VII.65 §2 CDE', pass: 'B', produits: ['credit_conso'] },
  { id: 'C5e', intitule: "Ne pas faire de l'inscription FSMA un argument", type: 'interdiction', section: S_CONSO, baseLegale: 'Art. VII.65 §2 CDE', pass: 'B', produits: ['credit_conso'] },
  { id: 'C5f', intitule: 'Ne pas se référer au TAEG maximum / légalité des taux', type: 'interdiction', section: S_CONSO, baseLegale: 'Art. VII.65 §2 CDE', pass: 'B', produits: ['credit_conso'] },
  { id: 'C5g', intitule: 'Dénomination légale du crédit présente', type: 'interdiction', section: S_CONSO, baseLegale: 'Art. VII.65 §2 CDE', pass: 'B', produits: ['credit_conso'] },
  { id: 'C5h', intitule: 'Taux avantageux : conditions indiquées', type: 'interdiction', section: S_CONSO, baseLegale: 'Art. VII.65 §2 CDE', pass: 'B', produits: ['credit_conso'] },
  { id: 'C5i', intitule: 'Pas de « gratuité » / espèces / acte interdit', type: 'interdiction', section: S_CONSO, baseLegale: 'Art. VII.65 §2 CDE ; Art. VII.73 CDE', pass: 'B', produits: ['credit_conso'] },
  { id: 'C6', intitule: 'Services accessoires (caractère obligatoire, libre choix)', type: 'mention_obligatoire', section: S_CONSO, baseLegale: 'Art. VII.64 §3 CDE ; Art. VI.81 CDE ; Art. VII.87 CDE', pass: 'B', produits: ['credit_conso'] },

  // ── Partie 3 · Crédit hypothécaire ─────────────────────────────────────
  { id: 'H1', intitule: "Identité du prêteur ou de l'intermédiaire", type: 'mention_obligatoire', section: S_HYPO, baseLegale: 'Art. VII.123 §1 al. 2 CDE ; Art. VII.124 §1 CDE', pass: 'B', produits: ['credit_hypothecaire'] },
  { id: 'H2', intitule: 'Mention de la sûreté hypothécaire', type: 'mention_obligatoire', section: S_HYPO, baseLegale: 'Art. VII.124 §1 CDE', pass: 'B', produits: ['credit_hypothecaire'] },
  { id: 'H3', intitule: 'Visibilité du TAEG (≥ tout autre taux)', type: 'mention_obligatoire', section: S_HYPO, baseLegale: 'Art. VII.124 §1 CDE', pass: 'C', produits: ['credit_hypothecaire'] },
  { id: 'H4', intitule: 'Avertissement risque de change (si devise)', type: 'mention_obligatoire', section: S_HYPO, baseLegale: 'Art. VII.124 §1 CDE', pass: 'B', produits: ['credit_hypothecaire'] },
  { id: 'H5', intitule: 'Exemple représentatif complet (7 éléments)', type: 'mention_obligatoire', section: S_HYPO, baseLegale: 'Art. VII.124 §1 et §2 CDE ; AR du 14 septembre 2016', pass: 'B', produits: ['credit_hypothecaire'] },
  { id: 'H6', intitule: 'Exemple distinct par type de crédit', type: 'mention_obligatoire', section: S_HYPO, baseLegale: 'Art. VII.124 §2 CDE', pass: 'B', produits: ['credit_hypothecaire'] },
  { id: 'H7a', intitule: 'Ne pas inciter le consommateur en difficulté', type: 'interdiction', section: S_HYPO, baseLegale: 'Art. VII.123 §2 CDE', pass: 'B', produits: ['credit_hypothecaire'] },
  { id: 'H7b', intitule: 'Ne pas mettre en valeur la facilité ou la rapidité', type: 'interdiction', section: S_HYPO, baseLegale: 'Art. VII.123 §2 CDE', pass: 'B', produits: ['credit_hypothecaire'] },
  { id: 'H7c', intitule: 'Ne pas inciter au regroupement de crédits', type: 'interdiction', section: S_HYPO, baseLegale: 'Art. VII.123 §2 CDE', pass: 'B', produits: ['credit_hypothecaire'] },
  { id: 'H7d', intitule: "Ne pas minimiser l'influence des crédits en cours", type: 'interdiction', section: S_HYPO, baseLegale: 'Art. VII.123 §2 CDE', pass: 'B', produits: ['credit_hypothecaire'] },
  { id: 'H7e', intitule: "Ne pas faire de l'inscription FSMA un argument", type: 'interdiction', section: S_HYPO, baseLegale: 'Art. VII.123 §2 CDE', pass: 'B', produits: ['credit_hypothecaire'] },
  { id: 'H7f', intitule: 'Ne pas se référer au TAEG maximum / légalité des taux', type: 'interdiction', section: S_HYPO, baseLegale: 'Art. VII.123 §2 CDE', pass: 'B', produits: ['credit_hypothecaire'] },
  { id: 'H7g', intitule: 'Dénomination légale du crédit présente', type: 'interdiction', section: S_HYPO, baseLegale: 'Art. VII.123 §2 CDE', pass: 'B', produits: ['credit_hypothecaire'] },
  { id: 'H7h', intitule: 'Taux avantageux : conditions indiquées', type: 'interdiction', section: S_HYPO, baseLegale: 'Art. VII.123 §2 CDE', pass: 'B', produits: ['credit_hypothecaire'] },
  { id: 'H7i', intitule: 'Pas de « gratuité » / espèces / acte interdit', type: 'interdiction', section: S_HYPO, baseLegale: 'Art. VII.123 §2 CDE', pass: 'B', produits: ['credit_hypothecaire'] },
  { id: 'H7j', intitule: 'Pas de fausses attentes sur la disponibilité / le coût', type: 'interdiction', section: S_HYPO, baseLegale: 'Art. VII.123 §2 CDE ; Directive 2014/17/UE', pass: 'B', produits: ['credit_hypothecaire'] },
  { id: 'H8', intitule: "Quotité élevée / sans apport pas en accroche centrale", type: 'interdiction', section: S_HYPO, baseLegale: 'Circulaire NBB_2019_27 ; Art. VI.97 CDE', pass: 'B', produits: ['credit_hypothecaire'] },
  { id: 'H9', intitule: 'Équilibre avantages/risques (crédit bullet, accordéon)', type: 'interdiction', section: S_HYPO, baseLegale: 'Art. VI.97 CDE ; Art. VII.123 §1 CDE', pass: 'B', produits: ['credit_hypothecaire'] },
  { id: 'H10', intitule: 'Services accessoires (caractère obligatoire, libre choix)', type: 'mention_obligatoire', section: S_HYPO, baseLegale: 'Art. VII.124 §1 al. 2 CDE', pass: 'B', produits: ['credit_hypothecaire'] },

  // ── Partie 4 · Assurances ──────────────────────────────────────────────
  { id: 'A1', intitule: 'Nom exact du produit', type: 'mention_obligatoire', section: S_ASSUR, baseLegale: 'Art. 279 §2 Loi du 4 avril 2014 ; Circulaire FSMA_2015_16', pass: 'B', produits: ['assurance'] },
  { id: 'A2', intitule: 'Type de produit (branche…)', type: 'mention_obligatoire', section: S_ASSUR, baseLegale: 'Art. 279 §2 Loi du 4 avril 2014 ; IDD', pass: 'B', produits: ['assurance'] },
  { id: 'A3', intitule: 'Garanties principales et couverture', type: 'mention_obligatoire', section: S_ASSUR, baseLegale: 'Art. 279 §2 Loi du 4 avril 2014 ; Circulaire FSMA_2015_16', pass: 'B', produits: ['assurance'] },
  { id: 'A4', intitule: 'Principales exclusions ou limitations', type: 'mention_obligatoire', section: S_ASSUR, baseLegale: 'Art. 279 §2 Loi du 4 avril 2014 ; Circulaire FSMA_2015_16', pass: 'B', produits: ['assurance'] },
  { id: 'A5', intitule: 'Durée du contrat', type: 'mention_obligatoire', section: S_ASSUR, baseLegale: 'Art. 279 §2 Loi du 4 avril 2014', pass: 'B', produits: ['assurance'] },
  { id: 'A6', intitule: 'Renvoi vers les documents officiels (IPID, KID, CG)', type: 'mention_obligatoire', section: S_ASSUR, baseLegale: 'Art. 279 §2 Loi du 4 avril 2014 ; IDD', pass: 'B', produits: ['assurance'] },
  { id: 'A7', intitule: "Nature de l'obligation (légale vs contractuelle)", type: 'interdiction', section: S_ASSUR, baseLegale: 'Art. VI.97 CDE ; Loi du 4 avril 2014', pass: 'B', produits: ['assurance'] },
  { id: 'A8a', intitule: 'SRD : caractère non légalement obligatoire', type: 'interdiction', section: S_ASSUR, baseLegale: 'Art. VI.97 CDE ; Art. VII.146 CDE', pass: 'B', produits: ['assurance'] },
  { id: 'A8b', intitule: "SRD : libre choix de l'assureur", type: 'mention_obligatoire', section: S_ASSUR, baseLegale: 'Art. VII.147 §1 CDE ; Loi du 4 avril 2014', pass: 'B', produits: ['assurance'] },
  { id: 'A8c', intitule: "SRD : droit à l'oubli", type: 'mention_obligatoire', section: S_ASSUR, baseLegale: 'Loi du 4 avril 2019 ; Loi du 30 octobre 2022', pass: 'B', produits: ['assurance'] },
  { id: 'A9a', intitule: 'Vie : distinction rendement garanti / non garanti', type: 'interdiction', section: S_ASSUR, baseLegale: 'AR du 25 avril 2014 ; Circulaire FSMA_2015_16', pass: 'B', produits: ['assurance'] },
  { id: 'A9b', intitule: 'Vie : coûts du produit (entrée, gestion)', type: 'mention_obligatoire', section: S_ASSUR, baseLegale: 'AR du 25 avril 2014 ; Circulaire FSMA_2015_16', pass: 'B', produits: ['assurance'] },
  { id: 'A9c', intitule: 'Vie : hypothèses et bases de calcul réalistes', type: 'interdiction', section: S_ASSUR, baseLegale: 'AR du 25 avril 2014 ; Circulaire FSMA_2015_16', pass: 'B', produits: ['assurance'] },
  { id: 'A9d', intitule: 'Vie : avertissement performances passées', type: 'mention_obligatoire', section: S_ASSUR, baseLegale: 'AR du 25 avril 2014 ; Circulaire FSMA_2015_16', pass: 'B', produits: ['assurance'] },
  { id: 'A9e', intitule: 'Vie : risques présentés à taille égale (pas « 100 % sûr »)', type: 'interdiction', section: S_ASSUR, baseLegale: 'AR du 25 avril 2014, art. 11, 2°', pass: 'C', produits: ['assurance'] },
];

/** Fast lookup by check id. */
export const PUB_CHECK_BY_ID: Record<string, PubCheck> = Object.fromEntries(
  PUB_CATALOG.map((c) => [c.id, c]),
);

/** Ordered section labels, for stable report grouping. */
export const PUB_SECTIONS: string[] = [
  S_IDENTITE,
  S_LOYAUTE,
  S_IDENTIF,
  S_CONSO,
  S_HYPO,
  S_ASSUR,
];

/** Checks a given pass owns, filtered to the qualified products. */
export function checksForPass(pass: PubPass, produits: PubProduit[]): PubCheck[] {
  const set = new Set(produits);
  return PUB_CATALOG.filter((c) => {
    if (c.pass !== pass) return false;
    if (!c.produits) return true; // general check → always applies
    return c.produits.some((p) => set.has(p));
  });
}
