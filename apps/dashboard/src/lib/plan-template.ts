import type { EmailTemplate, Support } from "./types";

export interface SubStepTemplate {
  title: string;
  actions?: string[];
  emailTemplate?: EmailTemplate;
  supports?: Support[];
}

export interface StepTemplate {
  code: string;
  title: string;
  /** Target SLA in days from the signature date. */
  slaDays: number;
  defaultApplicable: boolean;
  subSteps: SubStepTemplate[];
}

/**
 * The standard 13-step action plan. This is now only a SEED + static-content
 * source: section offsets and the default task list are seeded into the DB
 * (`plan_step_offsets`, `plan_task_templates`) on first run and edited from the
 * Config tab. Supports / action bullets stay here, resolved by `contentKey`
 * (`${code}-${index}`) — so reordering a `subSteps` array only changes seed order,
 * never the identity of already-materialised broker tasks.
 */
export const STEP_TEMPLATES: StepTemplate[] = [
  {
    code: "01",
    title: "Validation du plan d'action",
    slaDays: 14,
    defaultApplicable: true,
    subSteps: [
      {
        title: "Onboarding — e-mail + document",
        actions: [
          "Envoyer l'e-mail d'onboarding avec le document de bienvenue",
          "Partager le lien du diagnostic de conformité",
        ],
        emailTemplate: {
          subject: "Bienvenue chez BrokerComply 🎉",
          body:
            "Bonjour [Prénom],\n\nMerci pour ta confiance ! Nous sommes heureux de t'accompagner au quotidien dans ta conformité.\n\nPour bien démarrer, complète le diagnostic de conformité (≈ 10-15 min) :\n👉 https://complianceaudit.fillout.com/brokercomply\n\nUne fois rempli, nous établirons ton plan d'action personnalisé et organiserons une réunion de validation.\n\nBelle journée,",
        },
        supports: [
          { label: "Document d'onboarding (assurance)", type: "pdf" },
          { label: "Diagnostic de conformité", type: "link", url: "https://complianceaudit.fillout.com/brokercomply" },
        ],
      },
      {
        title: "Planification réunion validation + rapport de conformité",
        actions: [
          "Accuser réception du diagnostic et demander des créneaux",
          "Rédiger le rapport de conformité",
        ],
        emailTemplate: {
          subject: "Bien reçu — proposons une date de validation 💫",
          body:
            "Bonjour [Prénom],\n\nMerci d'avoir rempli le diagnostic de conformité. Nous avons bien reçu tes réponses 💫\n\nNotre équipe travaille sur le rapport de conformité et le plan d'action de ton bureau. Pourrais-tu nous proposer quelques dates pour te le présenter en vue de sa validation ?\n\nBien cordialement,",
        },
      },
      {
        title: "Réunion de validation",
        actions: [
          "Présenter constats, recommandations et plan d'action",
          "Prendre note en live des adaptations nécessaires",
        ],
      },
      {
        title: "Finalisation et envoi du rapport",
        actions: [
          "Actualiser le rapport suite à la réunion",
          "Envoyer le rapport finalisé et demander validation",
        ],
        emailTemplate: {
          subject: "Ton rapport de conformité mis à jour",
          body:
            "Bonjour [Prénom],\n\nMerci pour notre échange. En pièce jointe, le rapport mis à jour suite à nos discussions. Pourrais-tu le parcourir et me faire part de tes éventuelles observations ?\n\nDès validation de ta part, nous pourrons nous mettre au travail.\n\nBien à toi,",
        },
      },
    ],
  },
  {
    code: "02",
    title: "Nomination dans CABRIO",
    slaDays: 21,
    defaultApplicable: true,
    subSteps: [
      {
        title: "Envoyer le process de nomination",
        actions: ["Envoyer le process à chaque nouveau courtier pour être nommé dans CABRIO"],
        emailTemplate: {
          subject: "Nous désigner dans CABRIO — marche à suivre",
          body:
            "Cher Courtier,\n\nDans le cadre de notre accompagnement, nous vous proposons de nous désigner dans CABRIO comme personne de contact secondaire.\n\n1. Connectez-vous à CABRIO\n2. « Account » → « Ajouter une personne de contact secondaire »\n3. E-mail : info@we-comply.be — N° registre national : 92.07.30-499.97\n\nMerci d'avance,\nL'équipe BrokerComply",
        },
        supports: [{ label: "Process de nomination CABRIO", type: "pdf" }],
      },
      {
        title: "Monitorer l'adresse info@we-comply",
        actions: ["Surveiller la réception du lien de validation"],
      },
      {
        title: "Valider l'accès (sous 24h ⚠️)",
        actions: ["Cliquer sur le lien de validation dans les 24h"],
      },
    ],
  },
  {
    code: "03.01",
    title: "Remédiation AML",
    slaDays: 60,
    defaultApplicable: true,
    subSteps: [
      {
        title: "Confection des documents",
        actions: [
          "Se procurer la dernière enquête AML (questionnaire périodique)",
          "Adapter tous les passages en jaune au bureau (identité, BCE, signataires, logo)",
          "Renseigner les données du questionnaire (EGR, rapport EGR, rapport annuel AMLCO)",
          "Établir les documents dans l'espace SharePoint du client",
        ],
        supports: [
          { label: "Templates AML (SharePoint)", type: "link" },
        ],
      },
      {
        title: "Proposer réunion de validation",
        actions: [
          "Envoyer un e-mail pour proposer des créneaux",
          "Expliquer la logique de chaque document et valider les points nécessaires",
        ],
        emailTemplate: {
          subject: "Documents AML finalisés — organisons leur validation 💫",
          body:
            "Cher [Prénom],\n\nNous avons finalisé plusieurs documents clés pour ton bureau (rapport d'activité annuel de l'AMLCO, évaluation globale des risques, politiques et procédures, etc.). Une étape importante franchie ! 💫\n\nNous souhaiterions organiser une réunion d'environ 30 minutes afin de te les présenter en vue de leur approbation. Pourrais-tu nous communiquer tes disponibilités ?\n\nMerci d'avance et belle journée,",
        },
      },
      {
        title: "Suivi et accès au SharePoint",
        actions: [
          "Cleaner les documents après la réunion",
          "Envoyer un e-mail de suivi et donner accès au SharePoint (avec hyperlien)",
        ],
        supports: [{ label: "Comment donner accès au SharePoint", type: "video" }],
      },
      {
        title: "Validation et signature",
        actions: [
          "Convertir les documents validés en PDF",
          "Créer un dossier « Signature des documents AML » dans le SharePoint",
          "Envoyer les PDF à signer puis dispatcher les documents signés",
        ],
      },
    ],
  },
  {
    code: "03.02",
    title: "Recyclage AML",
    slaDays: 90,
    defaultApplicable: true,
    subSteps: [
      { title: "Revue annuelle de l'EGR" },
      { title: "Mise à jour du rapport d'activité AMLCO" },
      { title: "Validation et signature des documents recyclés" },
    ],
  },
  {
    code: "04.01",
    title: "Remédiation IDD",
    slaDays: 75,
    defaultApplicable: true,
    subSteps: [
      { title: "Confection des documents IDD" },
      { title: "Réunion de validation IDD" },
      { title: "Validation et signature" },
    ],
  },
  {
    code: "04.02",
    title: "Recyclage IDD",
    slaDays: 105,
    defaultApplicable: true,
    subSteps: [
      { title: "Revue annuelle de la formation IDD" },
      { title: "Mise à jour des registres" },
    ],
  },
  {
    code: "05.01",
    title: "Remédiation RGPD",
    slaDays: 90,
    defaultApplicable: true,
    subSteps: [
      { title: "Registre des traitements" },
      { title: "Politique de confidentialité & mentions légales" },
      { title: "Validation et signature" },
    ],
  },
  {
    code: "05.02",
    title: "Recyclage RGPD",
    slaDays: 120,
    defaultApplicable: true,
    subSteps: [
      { title: "Revue annuelle du registre des traitements" },
      { title: "Mise à jour des contrats sous-traitants" },
    ],
  },
  {
    code: "06",
    title: "Enregistrement goAML",
    slaDays: 45,
    defaultApplicable: true,
    subSteps: [
      { title: "Création du compte goAML" },
      { title: "Validation de l'enregistrement" },
    ],
  },
  {
    code: "07",
    title: "Mise en conformité site internet",
    slaDays: 75,
    defaultApplicable: true,
    subSteps: [
      { title: "Audit du site internet" },
      { title: "Recommandations et corrections" },
      { title: "Vérification finale" },
    ],
  },
  {
    code: "08",
    title: "Implémentation AI Act",
    slaDays: 120,
    defaultApplicable: true,
    subSteps: [
      { title: "Cartographie des usages IA" },
      { title: "Mise en conformité AI Act" },
    ],
  },
  {
    code: "09",
    title: "Check Cabrio",
    slaDays: 30,
    defaultApplicable: true,
    subSteps: [
      { title: "Vérification des données dans CABRIO" },
      { title: "Corrections éventuelles" },
    ],
  },
  {
    code: "10",
    title: "Plan de redocumentation",
    slaDays: 150,
    defaultApplicable: true,
    subSteps: [
      { title: "Inventaire documentaire" },
      { title: "Plan de redocumentation" },
      { title: "Suivi de mise à jour" },
    ],
  },
];

/** Stable content key for a template sub-step, e.g. "01-0". */
export function contentKeyFor(code: string, index: number): string {
  return `${code}-${index}`;
}

/** Static (code-side) content keyed by `contentKey`. Supports/actions stay in code;
 * title/email are mirrored here only as a fallback for rows not yet forked. */
export interface StaticContent {
  title: string;
  emailTemplate?: EmailTemplate;
  actions?: string[];
  supports?: Support[];
}

/**
 * Map of code-side static content by `contentKey`. Supports / action bullets are
 * code-only; title + email are also kept here as a fallback for legacy broker rows
 * whose `title`/`email_*` columns haven't been backfilled yet.
 */
export const CONTENT_BY_KEY: Map<string, StaticContent> = new Map(
  STEP_TEMPLATES.flatMap((tpl) =>
    tpl.subSteps.map((ss, j): [string, StaticContent] => [
      contentKeyFor(tpl.code, j),
      {
        title: ss.title,
        emailTemplate: ss.emailTemplate,
        actions: ss.actions,
        supports: ss.supports,
      },
    ]),
  ),
);

export interface StepOffsetSeed {
  code: string;
  title: string;
  offsetDays: number;
  position: number;
}

export interface TaskTemplateSeed {
  stepCode: string;
  title: string;
  emailSubject: string | null;
  emailBody: string | null;
  contentKey: string;
  position: number;
}

/** Seed rows for `plan_step_offsets` (the 13 sections, ordered). */
export function stepOffsetSeeds(): StepOffsetSeed[] {
  return STEP_TEMPLATES.map((tpl, i) => ({
    code: tpl.code,
    title: tpl.title,
    offsetDays: tpl.slaDays,
    position: i,
  }));
}

/** Seed rows for `plan_task_templates` (the default tasks per section). */
export function taskTemplateSeeds(): TaskTemplateSeed[] {
  return STEP_TEMPLATES.flatMap((tpl) =>
    tpl.subSteps.map((ss, j) => ({
      stepCode: tpl.code,
      title: ss.title,
      emailSubject: ss.emailTemplate?.subject ?? null,
      emailBody: ss.emailTemplate?.body ?? null,
      contentKey: contentKeyFor(tpl.code, j),
      position: j,
    })),
  );
}
