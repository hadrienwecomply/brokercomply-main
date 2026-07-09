import type { CatalogPoint } from './catalog.js';
import type { ScrapedPage } from './types.js';

/**
 * Prompt for a point-checker call — the programmatic equivalent of the
 * skill's "prompt standard pour un subagent de point". One call handles ONE
 * point and only its atomic checks; it produces sourced observations only
 * (verdict + literal quote), never a severity level or a recommendation:
 * those are computed deterministically by the assembler + matrix.
 */

export const CHECKER_SYSTEM_PROMPT = `Tu es un vérificateur de conformité de sites web de courtiers belges (crédit et assurances). Tu ne traites QUE le point d'analyse fourni, sur les pages fournies. Tu ne te prononces jamais sans preuve tirée du texte.

RÈGLES ANTI-HALLUCINATION :
- "non_conforme" exige soit une citation qui montre le problème, soit la confirmation d'une absence après recherche réelle du terme attendu (ex. "prospectus", "FSMA").
- N'invente jamais une citation. Si tu ne trouves pas, le verdict est "a_verifier".
- "sans_objet" si le check ne s'applique pas à ce site.
- Normalise les espaces avant toute comparaison de texte : les pages contiennent souvent des espaces insécables ou multiples. Avant de conclure "absent", retente en ignorant les différences d'espaces.
- Reste factuel : tu décris ce que tu observes.

TU NE PRODUIS QUE DES CONSTATS. Ne calcule pas de niveau de gravité et ne rédige AUCUNE recommandation : ils sont déterminés ensuite, de façon déterministe, par le code d'assemblage.

Tu réponds UNIQUEMENT avec un objet JSON valide, sans texte autour, au format :
{
  "applicable": true | false,
  "checks": [
    {
      "id": "<id du check>",
      "label": "<intitulé court>",
      "verdict": "conforme" | "non_conforme" | "sans_objet" | "a_verifier",
      "evidence": "<citation littérale extraite de la page — ou 'Aucune occurrence trouvée après recherche' pour une absence — ou 'Page non disponible'>",
      "source": "<URL de la page d'où provient la preuve>",
      "article": "<référence légale>"
    }
  ]
}
Si le point n'est pas applicable (champ d'application non réuni), renvoie {"applicable": false, "checks": []} et rien d'autre.`;

export interface CheckerContext {
  entityName: string;
  bce?: string;
  /** Real FSMA registration categories, or undefined = unknown ("à vérifier"). */
  fsmaStatus?: string;
}

const PAGE_TEXT_BUDGET = 12_000;

export function buildPointPrompt(
  point: CatalogPoint,
  pages: ScrapedPage[],
  context: CheckerContext,
): string {
  const lines: string[] = [];
  lines.push(`POINT : ${point.id} — ${point.titre}`);
  lines.push(`BASE LÉGALE : ${point.baseLegale.join(' ; ')}`);
  if (point.champApplication) {
    lines.push(`CHAMP D'APPLICATION : ${point.champApplication}`);
    lines.push(
      `Vérifie d'abord si le champ d'application est réuni sur les pages fournies ; sinon renvoie {"applicable": false, "checks": []}.`,
    );
  }
  if (point.note) lines.push(`NOTE : ${point.note}`);

  lines.push('');
  lines.push('CONTEXTE ENTITÉ :');
  lines.push(`- Dénomination : ${context.entityName}`);
  if (context.bce) lines.push(`- BCE : ${context.bce}`);
  lines.push(
    `- Statut FSMA (catégories d'inscription réelles) : ${context.fsmaStatus ?? 'inconnu — pour tout check qui en dépend, verdict "a_verifier"'}`,
  );

  lines.push('');
  lines.push('MINI-CHECKLIST (traite chaque check indépendamment) :');
  for (const sp of point.sousPoints) {
    lines.push(`- ${sp.id}${sp.visuel ? ' [VISUEL]' : ''} — ${sp.question}`);
  }

  const hasVisualChecks = point.sousPoints.some((sp) => sp.visuel);
  const hasMeasurements = pages.some((p) => p.visual);
  if (hasVisualChecks) {
    lines.push('');
    if (hasMeasurements) {
      lines.push(
        'Pour les checks [VISUEL], utilise les MESURES DU DOM RENDU jointes à chaque page (tailles en px, positions, visibilité, bannière cookies) et cite les valeurs mesurées comme preuve (ex. « slogan 14px vs accroche max 24px à 1280px de large »). La taille est responsive : compare toujours à la même largeur de fenêtre.',
      );
    } else {
      lines.push(
        "Aucune mesure du DOM rendu n'est disponible pour cette passe : les checks [VISUEL] reçoivent le verdict \"a_verifier\" (contrôle manuel requis), sauf si le texte seul suffit à les trancher.",
      );
    }
  }

  lines.push('');
  lines.push('PAGES À EXAMINER (texte extrait, liens conservés) :');
  for (const page of pages) {
    lines.push('');
    lines.push(`===== PAGE : ${page.url}${page.title ? ` — « ${page.title} »` : ''} =====`);
    lines.push(page.text.slice(0, PAGE_TEXT_BUDGET));
    if (page.visual) {
      // texteRendu already replaced page.text when relevant — don't repeat 40k chars here.
      const { texteRendu: _texteRendu, ...measures } = page.visual;
      lines.push(`--- MESURES DOM RENDU (${page.url}) ---`);
      lines.push(JSON.stringify(measures));
    }
  }

  lines.push('');
  lines.push('Réponds avec le JSON uniquement.');
  return lines.join('\n');
}
