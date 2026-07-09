import REFERENCES_JSON from './data/references.json' with { type: 'json' };
import type { PubCheck, PubPass } from './catalog.js';
import type { PubProduit, PubQualification } from './types.js';

/**
 * Prompts for the print-advertising audit. The pipeline runs, per image:
 *  - pass 0: transcription + qualification (shared source of truth), and
 *  - passes A/B/C: sourced constats for disjoint sets of grid checks.
 *
 * Reference material is the skill's `references/*.md`, bundled as JSON and
 * injected verbatim per pass (mirrors the skill's subagents reading their own
 * reference files).
 */

const REFERENCES = REFERENCES_JSON as Record<string, string>;

function ref(name: string): string {
  return REFERENCES[name] ?? '';
}

// ── Pass 0 — transcription & qualification ────────────────────────────────

export const QUALIFICATION_SYSTEM_PROMPT = `Tu es un analyste de conformité publicitaire pour intermédiaires belges en crédit et assurances. On te fournit UNE publicité (image). Ta seule mission ici : transcrire fidèlement le support et le qualifier. Tu ne juges PAS encore la conformité.

Principe cardinal : tu ne décris que ce que tu vois. N'invente aucun texte. Si un élément est illisible, dis-le.

Tu réponds UNIQUEMENT avec un objet JSON valide, sans texte autour :
{
  "format": "post_instagram|post_facebook|post_linkedin|story|reel|banniere|search_ads|email|site|flyer|brochure|affiche|autre",
  "produits": ["credit_conso"|"credit_hypothecaire"|"assurance"|"notoriete"],
  "elements_fournis": ["visuel"|"texte_accompagnement"|"landing_page"],
  "transcription": "<texte intégral visible, mot à mot, PLUS une description factuelle : hiérarchie visuelle (qu'est-ce qui domine ?), tailles relatives de police, visuels/symboles (billets, sablier, éclair, personnes, ambiance émotionnelle), indices de génération par IA>",
  "note": "<optionnel : si le format est ambigu, indiquer l'alternative plausible>"
}

Indices de qualification :
- « prêt », « emprunter », taux, mensualité → crédit conso ; « achat », « maison », « immobilier », « hypothèque » → crédit hypothécaire ; « auto/voiture » + mensualité → souvent prêt à tempérament (conso) ; « protégez », « couverture », « garanties », « assurance » → assurance ; aucun produit déterminé → "notoriete".
- Un même visuel peut cumuler plusieurs produits (ex. crédit hypo + assurance solde restant dû).
- Si seule l'image est fournie, elements_fournis = ["visuel"].`;

export function buildQualificationPrompt(fileName: string): string {
  return [
    `Publicité à analyser : ${fileName}`,
    '',
    'Transcris et qualifie ce support. Réponds avec le JSON uniquement.',
  ].join('\n');
}

// ── Passes A/B/C — sourced constats ───────────────────────────────────────

export const PUB_CHECKER_SYSTEM_PROMPT = `Tu es un vérificateur de conformité publicitaire pour intermédiaires belges (crédit et assurances). Tu traites UNIQUEMENT les checks fournis, sur la publicité fournie (image + transcription partagée). Tu ne te prononces jamais sans preuve.

QUATRE VERDICTS :
- "conforme" : l'exigence est respectée (citation à l'appui).
- "non_conforme" : violation établie — formulation interdite présente (cite-la mot à mot) OU mention obligatoire absente alors que l'emplacement requis (le visuel) a été analysé.
- "a_verifier" : impossible de trancher — la mention peut légalement figurer dans un emplacement non fourni (texte d'accompagnement, profil, landing page — voir le tableau des formats), élément illisible, ou doute sur un visuel IA. Indique TOUJOURS quoi vérifier et où la mention doit se trouver.
- "non_applicable" : le déclencheur du check n'est pas rempli (ex. pas de chiffre → pas d'exemple représentatif requis).

RÈGLES ANTI-HALLUCINATION :
- Cite mot à mot, entre guillemets français « … ». Jamais de citation reconstruite.
- Pour une absence, écris explicitement un constat d'absence (ex. « Aucune mention du numéro FSMA sur le visuel »).
- N'ajoute AUCUNE exigence hors du guide fourni (pas de RGPD, pas de droit des marques).
- Pièges de sur-sévérité : le slogan conso n'est PAS requis pour un crédit hypothécaire ; l'exemple représentatif n'est requis QUE si un chiffre lié au coût apparaît ; une pub assurance n'a ni slogan ni TAEG.
- Pièges de sous-sévérité : analyse le texte, le VISUEL et le TON (billets = espèces, chronomètre = rapidité, personne accablée de factures = ciblage difficulté financière).

REFORMULATION : pour CHAQUE "non_conforme" (et les "a_verifier" de type formulation), propose une reformulation concrète, prête à l'emploi, qui conserve l'intention commerciale (ex. « taux compétitif », « taux adapté à votre profil », « accompagnement complet », « étude personnalisée de votre projet »). Pour une mention manquante, rédige la mention (valeurs à compléter : [montant] €, [TAEG] %).

Tu réponds UNIQUEMENT avec un objet JSON valide, sans texte autour :
{
  "constats": [
    {
      "id": "<id exact du check fourni>",
      "verdict": "conforme|non_conforme|a_verifier|non_applicable",
      "citation": "<citation littérale de la pub, constat d'absence, ou null>",
      "explication": "<explication courte et factuelle>",
      "reformulation": "<reformulation/ajout concret, ou null>",
      "a_verifier_ou": "<texte_accompagnement|profil|landing_page|null>"
    }
  ]
}
Traite EXACTEMENT un constat par check fourni, en réutilisant l'id tel quel.`;

const PASS_INTRO: Record<PubPass, string> = {
  A: "PASSE A — Identité, rôle, identification publicitaire, comparaisons et cohérence.",
  B: "PASSE B — Mentions et pratiques interdites propres au(x) produit(s) détecté(s).",
  C: "PASSE C — Analyse VISUELLE et proportions : travaille surtout sur l'IMAGE (tailles de police relatives, proéminence du slogan, TAEG aussi visible que les autres taux, risques à taille égale, symboles, ton émotionnel, indices de visuel IA).",
};

/** Reference files injected per pass. */
function referencesForPass(pass: PubPass, produits: PubProduit[]): string[] {
  const parts: string[] = [];
  const productRefs = () => {
    if (produits.includes('credit_conso')) parts.push(ref('credit-conso'));
    if (produits.includes('credit_hypothecaire')) parts.push(ref('credit-hypothecaire'));
    if (produits.includes('assurance')) parts.push(ref('assurances'));
  };
  if (pass === 'A') {
    parts.push(ref('regles-generales'), ref('tableau-formats'));
  } else if (pass === 'B') {
    productRefs();
    if (produits.includes('credit_conso') || produits.includes('credit_hypothecaire')) {
      parts.push(ref('formulations-refusees'));
    }
    parts.push(ref('tableau-formats'));
  } else {
    parts.push(ref('regles-generales'));
    productRefs();
    parts.push(ref('tableau-formats'));
  }
  return parts.filter(Boolean);
}

export function buildPassPrompt(
  pass: PubPass,
  checks: PubCheck[],
  qualification: PubQualification,
  fileName: string,
): string {
  const lines: string[] = [];
  lines.push(PASS_INTRO[pass]);
  lines.push('');
  lines.push('SOURCE DE VÉRITÉ PARTAGÉE (transcription + qualification, étape 0) :');
  lines.push(`- Fichier : ${fileName}`);
  lines.push(`- Format : ${qualification.format}`);
  lines.push(`- Produit(s) : ${qualification.produits.join(', ') || 'non déterminé'}`);
  lines.push(`- Éléments fournis : ${qualification.elements_fournis.join(', ')}`);
  if (qualification.note) lines.push(`- Note : ${qualification.note}`);
  lines.push('');
  lines.push('TRANSCRIPTION :');
  lines.push(qualification.transcription);
  lines.push('');
  lines.push("L'image de la publicité est également jointe : vérifie visuellement.");
  lines.push('');
  lines.push('CHECKS À TRAITER (un constat par check, réutilise l\'id) :');
  for (const c of checks) {
    lines.push(`- ${c.id} — ${c.intitule}  [base légale : ${c.baseLegale}]`);
  }
  lines.push('');
  lines.push('RÉFÉRENTIEL (guide Do & Don\'t Brokercomply — applique-le strictement) :');
  lines.push('');
  lines.push(referencesForPass(pass, qualification.produits).join('\n\n---\n\n'));
  lines.push('');
  lines.push('Réponds avec le JSON uniquement.');
  return lines.join('\n');
}
