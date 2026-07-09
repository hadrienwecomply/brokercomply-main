---
name: check-conformite-pub-courtier
description: >-
  Analyse de conformité d'une publicité d'un intermédiaire belge en crédit
  (hypothécaire, consommation) et/ou en assurances, sur base du guide Do & Don't
  Brokercomply : identité et mentions FSMA, loyauté et non-tromperie, slogan
  crédit obligatoire, exemple représentatif TAEG, pratiques publicitaires
  interdites (VII.65 / VII.123 CDE), assurances (SRD, rendements, IPID),
  influenceurs, visuels IA. Produit des constats sourcés (verdict + citation +
  base légale), des reformulations conformes, un rapport Markdown et un payload
  JSON. Utilise ce skill dès que l'utilisateur fournit une publicité, un visuel,
  un post, une story, une bannière, un flyer ou une brochure d'un courtier ou
  intermédiaire et veut savoir si c'est conforme, publiable, légal, ou demande
  un « check pub », une analyse do & don't, une relecture compliance d'une
  campagne — même s'il ne fournit qu'une image sans autre explication.
---

# Check conformité publicité — intermédiaires crédit & assurances (Belgique)

Tu analyses une publicité (image, screenshot, PDF, brochure) d'un intermédiaire belge en crédit et/ou en assurances et tu produis des constats vérifiables par rapport au guide Do & Don't Brokercomply (version Juillet 2026), avec reformulations conformes.

Principe cardinal : **chaque constat doit être sourcé**. Un verdict sans citation de la pub (ou sans constat d'absence explicite) et sans base légale ne vaut rien. Tu n'inventes jamais un texte que tu n'as pas lu dans la pub. Si un élément est illisible ou incertain, dis-le (`a_verifier`), ne devine pas.

## Étape 0 — Ingestion du support

- **Image / screenshot** : lis l'image directement. Note le texte intégral visible, les tailles relatives de police (qu'est-ce qui domine visuellement ?), la disposition, les visuels (personnes, ambiance émotionnelle, symboles — billets, sablier, éclair…), tout indice de génération par IA.
- **PDF / brochure** : extrais le texte ET rends chaque page en image (`pdftoppm -png -r 100`) pour juger la mise en page et la hiérarchie visuelle — le texte seul ne permet pas d'évaluer les checks de visibilité (slogan 4 %, TAEG aussi visible que le taux, risques à taille égale).
- Commence le rapport par une **transcription/description factuelle** du support : c'est la matière première des citations.

## Étape 1 — Qualification (produit × format)

Déduis de la pub elle-même :

1. **Produit(s)** : crédit à la consommation / crédit hypothécaire / assurance (préciser laquelle : SRD, vie, hospitalisation…) / mixte / notoriété pure (aucun produit déterminé). Indices : « prêt », « emprunter », taux, mensualité → crédit ; « achat », « maison », « immobilier » → hypothécaire ; « auto », « voiture » avec mensualité → souvent prêt à tempérament (conso) ; « protégez », « couverture », « garanties » → assurance. Un même visuel peut cumuler (ex. crédit hypo + SRD).
2. **Format** : post FB/Instagram/LinkedIn, story/reel, bannière display, Search/Google Ads, email, page de site, flyer/affiche imprimée, brochure, vidéo. Indices : ratio de l'image, éléments d'interface (❤️, « Sponsorisé », barre de story), présence d'un texte d'accompagnement.
3. **Éléments fournis** : visuel seul ? visuel + texte d'accompagnement ? landing page fournie ? Ceci conditionne les verdicts (voir étape 2).

Ne pose une question à l'utilisateur QUE si le produit est réellement indéterminable (ex. « on s'occupe de tout » sans aucun indice produit) ou si le format change le verdict et est ambigu. Sinon, annonce ta qualification en tête de rapport et analyse. Si l'utilisateur a précisé produit/format, sa qualification prime. Si le format reste plausiblement double (ex. visuel 4:5 qui peut être un post comme un corps d'email), retiens le plus probable, mais ajoute dans le rapport une note « Si le support est en réalité un <autre format> » indiquant quels verdicts basculeraient (les emplacements tolérés diffèrent par format).

## Étape 2 — Analyse décomposée en subagents

La grille compte ~40 checks : un seul passage tend à survoler. Décompose l'analyse en trois subagents parallèles, chacun focalisé sur une compétence. La transcription et la qualification de l'étape 0-1 sont la **source de vérité partagée** : transmets-les intégralement à chaque subagent pour éviter que chacun « relise » la pub différemment. Chaque subagent reçoit : la transcription complète, la qualification (produit, format, éléments fournis), le chemin du fichier image (pour vérification visuelle), les chemins de ses fichiers de référence, et la consigne de ne rendre QUE des constats au format JSON (voir schéma des constats plus bas) — pas de niveau global, pas de recommandations générales.

| Subagent | Périmètre | Références à lui indiquer |
|---|---|---|
| A — Mentions & règles générales | Checks G1–G6, G11, G12, G13 (identité, rôle, identification publicitaire, comparaisons, cohérence) | `references/regles-generales.md` + `references/tableau-formats.md` |
| B — Checks produit | Selon qualification : C* (conso), H* (hypo), A* (assurance), ou combinaison si mixte ; notoriété pure → pas d'agent B | référence(s) produit (`credit-conso.md`, `credit-hypothecaire.md`, `assurances.md`) + `formulations-refusees.md` (crédit) + `tableau-formats.md` |
| C — Analyse visuelle & proportions | Checks de visibilité et d'équilibre : G7, G8, G9, G10, G14, C2, H3, A9e (tailles de police relatives, slogan ≥ 7 pts / 4 % de l'espace, TAEG aussi visible que les autres taux, risques à taille égale, symboles — billets, chronomètre —, ton émotionnel, indices de visuel IA) | `references/regles-generales.md` + fiches produit pertinentes ; consigne : travailler surtout sur l'IMAGE |

Rappelle à chaque subagent le principe cardinal (verdict + citation ou constat d'absence + base légale, jamais d'exigence hors référentiel) et les quatre verdicts. Chaque agent lit lui-même ses fichiers de référence — c'est `tableau-formats.md` qui départage `non_conforme` de `a_verifier` selon l'emplacement toléré de chaque mention pour le format qualifié.

### Fusion (orchestrateur)

À la réception des constats : déduplique (une même phrase flaguée par deux agents → garde le check le plus spécifique, ex. C5b prime sur G8 pour une promesse de rapidité en crédit) ; résous les contradictions en te référant aux références et à l'image (en cas de doute persistant → `a_verifier`) ; vérifie que chaque check applicable de la grille a exactement un verdict et que les IDs correspondent aux références.

**Repli sans subagents** : si l'outil de lancement d'agents n'est pas disponible, fais l'analyse en un seul passage : lis toi-même `regles-generales.md`, la ou les références produit, `formulations-refusees.md` (crédit) et `tableau-formats.md`, et déroule la grille section par section dans le même ordre A → B → C.

### Verdicts

Pour chaque check applicable, rends exactement un verdict :

- `conforme` — l'exigence est respectée, citation à l'appui.
- `non_conforme` — violation établie : formulation interdite présente (cite-la mot à mot), ou mention obligatoire absente alors que l'emplacement requis (le visuel) a été analysé.
- `a_verifier` — impossible de trancher avec les éléments fournis : la mention peut légalement figurer dans un emplacement non fourni (texte d'accompagnement, profil, landing page — cf. tableau-formats), élément illisible, formulation « ⚠ trop générale » de l'annexe 1, doute sur un visuel IA, ou fait à confirmer par l'intermédiaire (ex. la comparaison est-elle documentée ?). Indique toujours QUOI vérifier et OÙ la mention doit se trouver.
- `non_applicable` — le déclencheur du check n'est pas rempli (pas de chiffre → pas d'exemple représentatif ; pas de comparaison → G13 N.A. ; etc.). Mentionne brièvement pourquoi.

Attention aux pièges de sur-sévérité : le slogan conso n'est PAS requis pour un crédit hypothécaire ; l'exemple représentatif n'est requis QUE si un chiffre lié au coût apparaît ; une pub assurance n'a ni slogan ni TAEG. Et de sous-sévérité : l'analyse porte sur le texte, le VISUEL et le ton (une image de billets = « espèces », un chronomètre = rapidité, une personne accablée de factures = ciblage difficulté financière).

## Étape 3 — Niveau global (règle déterministe, ne pas improviser)

Compte les verdicts, puis applique dans l'ordre :

1. ≥ 1 `non_conforme` sur une **pratique interdite** (C5*, H7*, G5, G8, ou formulation ❌ de l'annexe 1) → 🔴 **Non conforme — ne pas diffuser en l'état** (infraction, pas simple omission).
2. Sinon ≥ 1 `non_conforme` (mention obligatoire manquante) → 🟠 **Non conforme — mentions à compléter avant diffusion**.
3. Sinon ≥ 1 `a_verifier` → 🟡 **Sous réserve — éléments à vérifier** (lister).
4. Sinon → 🟢 **Aucun constat de non-conformité**.

## Étape 4 — Reformulations

Pour CHAQUE `non_conforme` (et les `a_verifier` de type formulation ⚠) : propose une reformulation ou un ajout concret, prêt à l'emploi, qui conserve l'intention commerciale. Appuie-toi sur les reformulations validées du guide (« taux compétitif », « taux adapté à votre profil », « accompagnement complet », angle « étude personnalisée de votre projet »…). Pour une mention manquante, rédige la mention (ex. l'exemple représentatif complet avec des valeurs à faire compléter : `[montant] €`, `[TAEG] %`). Une seule proposition par constat, la meilleure.

## Étape 5 — Produire les livrables

Sauvegarde dans le dossier de travail de l'utilisateur : `rapport-pub-<slug>-<AAAA-MM-JJ>.md` et `rapport-pub-<slug>-<AAAA-MM-JJ>.json`, puis présente les fichiers.

### Structure du rapport Markdown

```
# Analyse de conformité publicitaire — <intermédiaire ou slug>
**Date** · **Support analysé** (fichier) · **Produit(s) détecté(s)** · **Format détecté** · **Éléments fournis** (visuel seul / + accompagnement / + landing)

## Niveau global
🔴/🟠/🟡/🟢 + phrase de synthèse + décompte (X non conformes, Y à vérifier, Z conformes, N N.A.)

## Description du support
Transcription factuelle (texte intégral, hiérarchie visuelle, visuels).

## Constats
### 🔴 Non conforme (d'abord les pratiques interdites, puis les mentions manquantes)
Par constat : **[ID] Intitulé** — verdict, citation ou constat d'absence, explication courte, base légale, **Reformulation proposée**.
### 🟡 À vérifier
Par constat : quoi vérifier, où la mention peut légalement figurer.
### ✅ Conforme
Une ligne par check, avec citation courte.
### ⚪ Non applicable
Une ligne par check, raison entre parenthèses.

## Avertissement
Analyse informative sur base du guide Do & Don't Brokercomply (juillet 2026). Ne constitue pas un conseil juridique ; la FSMA et le SPF Économie peuvent avoir une lecture différente. En cas de doute, consulter le compliance officer.
```

### Payload JSON

```json
{
  "skill": "check-conformite-pub-courtier",
  "version_guide": "2026-07",
  "date_analyse": "AAAA-MM-JJ",
  "support": {"fichier": "...", "format": "post_instagram|story|banniere|search_ads|email|site|flyer|brochure|video|autre", "produits": ["credit_conso", "credit_hypothecaire", "assurance", "notoriete"], "elements_fournis": ["visuel", "texte_accompagnement", "landing_page"]},
  "niveau_global": {"code": "rouge|orange|jaune|vert", "libelle": "...", "decompte": {"non_conforme": 0, "a_verifier": 0, "conforme": 0, "non_applicable": 0}},
  "constats": [{"id": "C1", "intitule": "...", "verdict": "conforme|non_conforme|a_verifier|non_applicable", "type": "interdiction|mention_obligatoire|principe", "citation": "texte exact de la pub ou null", "explication": "...", "base_legale": "...", "reformulation": "... ou null", "a_verifier_ou": "texte_accompagnement|profil|landing_page|null"}]
}
```

## Garde-fous

- Cite mot à mot ; entre guillemets français « … ». Jamais de citation reconstruite.
- N'ajoute pas d'exigences hors guide (pas de RGPD, pas de droit des marques…) : si tu remarques autre chose d'important, une note « Hors périmètre du guide » en fin de rapport, clairement séparée des constats.
- Plusieurs pubs fournies → un rapport par pub (fichiers distincts), plus une synthèse en conversation.
- Réponds dans la langue de l'utilisateur ; les verdicts/IDs restent tels quels.
