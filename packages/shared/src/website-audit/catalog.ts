/**
 * Catalogue of analysis points, ported from the audit skill's
 * `references/points-analyse.md`. Each point maps to one checker call; its
 * sub-points are the atomic checks. Level and recommendation are NEVER decided
 * here or by the LLM — they come from the deterministic assembler + matrix.
 *
 * `pageHints` are lowercase keywords matched against page URL/title to select
 * which scraped pages a point receives (empty = all pages).
 */

export interface CatalogSubPoint {
  id: string;
  /** The atomic question, phrased positively ("rempli" = compliant). */
  question: string;
  /** Requires rendered-DOM measurement (visual.ts) as primary evidence. */
  visuel?: boolean;
}

export interface CatalogPoint {
  id: string;
  titre: string;
  /** When the point applies; null = always applicable. */
  champApplication: string | null;
  baseLegale: string[];
  sousPoints: CatalogSubPoint[];
  note?: string;
  pageHints: string[];
}

const PHRASE_LEGALE = "Attention, emprunter de l'argent coûte aussi de l'argent";

export const AUDIT_CATALOG: CatalogPoint[] = [
  {
    id: 'P01',
    titre: 'Slogan légal crédit',
    champApplication: "pages promouvant un crédit (+ footer)",
    baseLegale: ['art. VII.64 §2 CDE'],
    sousPoints: [
      {
        id: 'P01.1',
        question: `La formulation exacte « ${PHRASE_LEGALE} » figure au mot près (toute variante comme « a un coût » n'est pas remplie). Localiser par le noyau « emprunter de l'argent » puis comparer le texte réel.`,
      },
      {
        id: 'P01.2',
        question:
          "Le slogan est visible rapidement (zone de contenu, près de la première offre de crédit), pas relégué au seul pied de page (slogan.visibleSansScroll, slogan.yTop).",
        visuel: true,
      },
      {
        id: 'P01.3',
        question:
          "Sa taille est au moins égale à celle de l'accroche commerciale la plus grande, à la même largeur d'écran (slogan.fontSizePx ≥ accrocheMaxPx).",
        visuel: true,
      },
      { id: 'P01.4', question: "Le slogan est présent sur chaque page promouvant un crédit (pas seulement l'accueil)." },
    ],
    pageHints: ['credit', 'crédit', 'pret', 'prêt', 'hypothec', 'emprunt', 'simulateur', 'regroupement', ''],
  },
  {
    id: 'P02',
    titre: 'Registre FSMA et lien de vérification (identification)',
    champApplication: null,
    baseLegale: ['art. VII.128 §1 2° CDE', 'art. XII.6 §1 CDE'],
    sousPoints: [
      {
        id: 'P02.1',
        question:
          "La/les qualité(s) d'intermédiaire (crédit hypothécaire, crédit conso, assurances selon le cas) sont indiquées (footer ou mentions).",
      },
      { id: 'P02.2', question: "Le numéro d'inscription FSMA est indiqué (au-delà du seul BCE)." },
      { id: 'P02.3', question: 'Un lien de vérification vers le data portal FSMA (fsma.be) est présent.' },
    ],
    pageHints: [],
  },
  {
    id: 'P03',
    titre: 'Cohérence statut FSMA / activité promue',
    champApplication:
      "le site présente activement du crédit à la consommation (montants, durées, TAEG, comparaison d'offres, simulateur conso). Sinon → Sans objet.",
    baseLegale: ['art. I.9 35° CDE', 'art. VII.161 §1 CDE'],
    sousPoints: [
      {
        id: 'P03.1',
        question:
          "La catégorie crédit à la consommation figure dans le statut FSMA de l'entité (à défaut, le positionnement reste apporteur d'affaires pur, sans présentation active). Si le statut FSMA est inconnu → À vérifier.",
      },
    ],
    note:
      "En cas de manquement, présenter les deux options dans le constat : (A) s'inscrire en crédit conso (CABRIO), (B) revoir les pages pour supprimer toute présentation active.",
    pageHints: [],
  },
  {
    id: 'P04',
    titre: 'Publicité incitative au regroupement de crédits',
    champApplication: null,
    baseLegale: ['art. VII.65 §1 3° CDE', 'art. VII.123 §2 3° CDE'],
    sousPoints: [
      { id: 'P04.1', question: 'Absence de vignette ou de section mettant en avant le regroupement de crédits.' },
      {
        id: 'P04.2',
        question:
          "Absence de call-to-action incitatif (« regroupez vos crédits », « facilitez-vous la vie », bouton dédié).",
      },
      {
        id: 'P04.3',
        question:
          "Absence de liste d'avantages ou de FAQ incitative (« réduire vos mensualités », « gestion simplifiée »…).",
      },
      { id: 'P04.4', question: 'Le regroupement ne figure pas dans les services mis en avant (menu, footer).' },
    ],
    note: 'Une description strictement neutre et factuelle du mécanisme (sans mise en avant) remplit ces sous-points.',
    pageHints: [],
  },
  {
    id: 'P05',
    titre: 'Voies de réclamation et organismes de médiation',
    champApplication: null,
    baseLegale: ['art. VII.128 §1 4° CDE'],
    sousPoints: [
      { id: 'P05.1', question: 'Une procédure de réclamation interne est communiquée.' },
      { id: 'P05.2', question: 'OMBUDSFIN (médiation crédit) est mentionné.' },
      { id: 'P05.3', question: "L'Ombudsman des Assurances est mentionné. Sans objet si pas d'activité assurances." },
    ],
    pageHints: ['mentions', 'legal', 'légal', 'plainte', 'reclamation', 'réclamation', 'contact', 'confidentialite', 'privacy'],
  },
  {
    id: 'P06',
    titre: 'Exemple représentatif TAEG',
    champApplication:
      "la page affiche un chiffre lié au coût/montant/durée/taux d'un crédit (y compris résultat de simulateur). Sinon → Sans objet.",
    baseLegale: ['art. VII.64 §1 CDE', 'art. VII.124 §1 et §2 CDE'],
    sousPoints: [
      {
        id: 'P06.1',
        question:
          'Un exemple représentatif complet (type, montant, durée, TAEG, taux débiteur, mensualité, montant total) figure sur la même page. Hypothèses : hypothécaire 170 000 €/20 ans/taux fixe ; conso 1 500 €/12 mois.',
      },
      {
        id: 'P06.2',
        question:
          'Un exemple distinct existe pour chaque type de crédit proposé. Sans objet si un seul type sur la page.',
      },
    ],
    pageHints: ['credit', 'crédit', 'pret', 'prêt', 'hypothec', 'simulateur', 'taux', ''],
  },
  {
    id: 'P07',
    titre: 'Prospectus crédit hypothécaire',
    champApplication: 'le site exerce en crédit hypothécaire.',
    baseLegale: ['art. VII.125 CDE'],
    sousPoints: [
      {
        id: 'P07.1',
        question:
          'Un prospectus gratuit et permanent (types de crédits, sûretés, durées, types de taux, exemple TAEG, frais et indemnités, indices de référence, conséquences du non-paiement) est accessible.',
      },
    ],
    pageHints: [],
  },
  {
    id: 'P08',
    titre: 'Rapidité / facilité d’obtention',
    champApplication: 'pages de produit crédit.',
    baseLegale: ['art. VII.65 §1 2° CDE', 'art. VII.123 §2 2° CDE'],
    sousPoints: [
      {
        id: 'P08.1',
        question:
          "Absence de formulation chiffrée de rapidité d'octroi (« argent en 24 h », « décision dans l'heure »).",
      },
      {
        id: 'P08.2',
        question:
          "Absence de mise en avant générale de la rapidité/facilité (le discours porte sur la qualité de l'analyse du dossier, pas sur la vitesse).",
      },
    ],
    pageHints: ['credit', 'crédit', 'pret', 'prêt', 'hypothec', 'emprunt', 'simulateur', ''],
  },
  {
    id: 'P09',
    titre: 'Vente groupée / libre choix de l’assureur',
    champApplication: 'une assurance est liée/associée au crédit.',
    baseLegale: ['art. VII.147 §1 CDE (mod. 1er juin 2024)'],
    sousPoints: [
      { id: 'P09.1', question: "Le libre choix de l'assureur est mentionné." },
      {
        id: 'P09.2',
        question:
          "Le droit de changer d'assureur après un tiers de la durée du crédit, sans perdre la réduction de taux, est mentionné.",
      },
    ],
    pageHints: ['assurance', 'srd', 'solde', 'credit', 'crédit', 'hypothec'],
  },
  {
    id: 'P10',
    titre: 'Qualité d’intermédiaire en assurances + FSMA assurances',
    champApplication: 'le site propose/négocie des assurances (SRD, etc.).',
    baseLegale: ['loi 4 avril 2014, art. 261/262/281'],
    sousPoints: [
      { id: 'P10.1', question: 'La qualité de courtier en assurances est mentionnée (page assurance ET footer).' },
      { id: 'P10.2', question: "Le numéro d'inscription FSMA assurances + un lien de vérification figurent." },
    ],
    pageHints: ['assurance', 'srd', 'mentions', 'legal', 'légal', ''],
  },
  {
    id: 'P11',
    titre: 'Caractère non obligatoire de l’assurance SRD',
    champApplication: 'le site propose une assurance SRD.',
    baseLegale: ['art. VI.97 CDE'],
    sousPoints: [
      {
        id: 'P11.1',
        question: "Le caractère non légalement obligatoire est indiqué dans le corps du texte (pas seulement en FAQ).",
      },
      { id: 'P11.2', question: "Le produit n'est pas présenté comme « essentiel / incontournable » sans nuance." },
    ],
    pageHints: ['assurance', 'srd', 'solde'],
  },
  {
    id: 'P12',
    titre: 'Droit à l’oubli',
    champApplication: 'la page évoque le questionnaire médical, les pathologies ou maladies chroniques.',
    baseLegale: ['loi 4 avril 2019', 'AR 26 mai 2019 (mod. 2023)'],
    sousPoints: [
      { id: 'P12.1', question: 'Le droit à l’oubli est mentionné.' },
      {
        id: 'P12.2',
        question:
          'Le délai applicable (ramené à 5 ans depuis le 1er janvier 2025 pour la plupart des cancers) est précisé.',
      },
    ],
    pageHints: ['assurance', 'srd', 'solde', 'sante', 'santé', 'medical', 'médical'],
  },
  {
    id: 'P13',
    titre: 'Investissement : distinction consommateur / professionnel',
    champApplication: "pages d'investissement immobilier, ou mention « professionnels ».",
    baseLegale: ['art. VII.3 §2 2° CDE'],
    sousPoints: [
      { id: 'P13.1', question: 'Le public visé (consommateur particulier vs professionnel) est précisé.' },
      {
        id: 'P13.2',
        question:
          'Le régime applicable est adapté au public visé (ou, pour un public mixte, le régime le plus protecteur — Livre VII — est retenu).',
      },
    ],
    pageHints: ['invest', 'immobilier', 'professionnel', 'rendement'],
  },
  {
    id: 'P14',
    titre: 'Investissement : risque de requalification fiscale',
    champApplication:
      "la page emploie des formulations de rentabilité (« cash-flow », « optimiser la rentabilité », « stratégies de revente », « actif générateur de revenus »).",
    baseLegale: ['CIR 92 art. 90 1°', 'art. VI.97 CDE'],
    sousPoints: [
      {
        id: 'P14.1',
        question:
          'Un avertissement sur le risque de requalification fiscale (imposition au taux progressif) est présent.',
      },
      { id: 'P14.2', question: 'Une invitation à consulter un conseiller fiscal avant tout projet est présente.' },
    ],
    pageHints: ['invest', 'immobilier', 'rendement', 'rentabilite', 'rentabilité'],
  },
  {
    id: 'P15',
    titre: 'Crédit in fine / bullet : communication des risques',
    champApplication: 'un crédit in fine / bullet est présenté.',
    baseLegale: ['art. VI.97 CDE'],
    sousPoints: [
      {
        id: 'P15.1',
        question:
          "Les risques spécifiques (capital à rembourser en totalité à l'échéance, échec de la stratégie de sortie, saisie, risque de taux/dépréciation) sont communiqués.",
      },
      { id: 'P15.2', question: 'La nécessité de définir une stratégie de sortie avant souscription est mentionnée.' },
    ],
    pageHints: ['credit', 'crédit', 'invest', 'bullet', 'fine'],
  },
  {
    id: 'P16',
    titre: 'Crédit sans apport : contraintes prudentielles BNB',
    champApplication: 'le crédit sans apport ou des quotités élevées (100 %, 125 %) sont présentés.',
    baseLegale: ['Circulaire NBB_2019_27', 'art. VI.97 CDE'],
    sousPoints: [
      {
        id: 'P16.1',
        question:
          'Les contraintes prudentielles BNB (quotités de référence ~90 % primo / ~80 % autres) sont mentionnées.',
      },
      { id: 'P16.2', question: 'Le caractère exceptionnel et conditionné de ces financements est précisé.' },
    ],
    pageHints: ['credit', 'crédit', 'pret', 'prêt', 'hypothec', 'apport', 'quotite', 'quotité'],
  },
  {
    id: 'P17',
    titre: 'Demande de crédit : nature de la démarche',
    champApplication: 'page « demande de crédit » comportant un formulaire.',
    baseLegale: ['art. VII.126 §2 CDE', 'art. VI.97 CDE'],
    sousPoints: [
      {
        id: 'P17.1',
        question:
          "Le formulaire comporte les éléments de l'art. VII.126 §2 (but du crédit, revenus, personnes à charge, engagements en cours).",
      },
      {
        id: 'P17.2',
        question:
          "À défaut, l'intitulé et la présentation reflètent une simple prise de contact (et non une demande de crédit formelle, ce qui serait trompeur).",
      },
    ],
    note: "Si le contenu du formulaire n'est pas lisible (rendu dynamique) → À vérifier.",
    pageHints: ['demande', 'formulaire', 'contact', 'simulateur'],
  },
  {
    id: 'P18',
    titre: 'Mentions légales conformes',
    champApplication: null,
    baseLegale: ['art. VII.128 §1 CDE', 'art. XII.6 §1 CDE'],
    sousPoints: [
      {
        id: 'P18.1',
        question:
          "Les mentions identifient l'entité auditée (et non l'agence web comme propriétaire/exploitant).",
      },
      { id: 'P18.2', question: "L'inscription FSMA et les qualités d'intermédiaire y figurent." },
      {
        id: 'P18.3',
        question:
          'Les coordonnées du SPF Économie, les voies de médiation et une référence à la CCP y figurent.',
      },
    ],
    pageHints: ['mentions', 'legal', 'légal', 'condition', 'disclaimer'],
  },
  {
    id: 'P19',
    titre: 'Cookies : consentement préalable et politique',
    champApplication: null,
    baseLegale: ['loi 13 juin 2005 art. 129 §1', 'Recommandation APD n° 01/2020', 'RGPD art. 7'],
    sousPoints: [
      {
        id: 'P19.1',
        question:
          "Une bannière de consentement (CMP) est présente, avec un refus aussi simple que l'acceptation (banniereCookies).",
        visuel: true,
      },
      {
        id: 'P19.2',
        question:
          "Aucun cookie non essentiel (Google Analytics _ga/_gid/_gat, Adwords) n'est déposé avant le consentement opt-in.",
      },
      {
        id: 'P19.3',
        question:
          'La politique cookies est complète et accessible via un lien fonctionnel (chaque cookie : finalité, durée, base légale).',
      },
    ],
    pageHints: ['cookie', 'confidentialite', 'confidentialité', 'privacy', 'vie-privee', 'vie privée', ''],
  },
  {
    id: 'P20',
    titre: 'RGPD formulaires : lien vers la politique de confidentialité',
    champApplication: 'un formulaire collecte des données personnelles.',
    baseLegale: ['RGPD art. 7 et 13'],
    sousPoints: [
      {
        id: 'P20.1',
        question:
          'La case de consentement contient un lien cliquable vers la politique de confidentialité, accessible avant soumission.',
      },
    ],
    pageHints: ['contact', 'demande', 'formulaire', 'simulateur'],
  },
  {
    id: 'P21',
    titre: 'Centrale des Crédits aux Particuliers (CCP)',
    champApplication: null,
    baseLegale: ['art. VII.69 CDE'],
    sousPoints: [
      {
        id: 'P21.1',
        question:
          'Une information sur la CCP (avec renvoi vers la BNB) figure sur le site (mentions légales / politique de confidentialité).',
      },
    ],
    pageHints: ['mentions', 'legal', 'légal', 'confidentialite', 'confidentialité', 'privacy'],
  },
  {
    id: 'P22',
    titre: 'Simulateur : avertissement de non-contractualité',
    champApplication: 'un simulateur affiche des résultats chiffrés.',
    baseLegale: ['bonne pratique', 'art. VI.97 CDE'],
    sousPoints: [
      {
        id: 'P22.1',
        question:
          "Un avertissement indique que la simulation est fournie à titre indicatif et ne constitue pas une offre de crédit.",
      },
      { id: 'P22.2', question: "Il est précisé que l'octroi reste sous réserve d'acceptation du dossier par le prêteur." },
    ],
    pageHints: ['simulat', 'calcul'],
  },
  {
    id: 'P23',
    titre: 'Articles de blog et pages géolocalisées',
    champApplication: "présence d'articles de blog ou de pages géolocalisées.",
    baseLegale: ['art. VI.97 CDE', 'art. VII.64/VII.124 CDE'],
    sousPoints: [
      { id: 'P23.1', question: 'Ces contenus ont pu être analysés (sinon À vérifier — point de vigilance).' },
      { id: 'P23.2', question: "L'information est équilibrée (risques présentés au même titre que les avantages)." },
      {
        id: 'P23.3',
        question:
          "Aucune publicité chiffrée déguisée (slogan + exemple représentatif présents dès que des chiffres apparaissent) ni incitation au regroupement.",
      },
    ],
    pageHints: ['blog', 'article', 'actualite', 'actualité', 'news', 'conseil'],
  },
];

export { PHRASE_LEGALE };
