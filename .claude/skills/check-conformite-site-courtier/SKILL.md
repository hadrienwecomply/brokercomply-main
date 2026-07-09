---
name: check-conformite-site-courtier
description: >-
  Audit de conformité légale d'un site de courtier belge en crédit (hypothécaire,
  à la consommation) et/ou en assurances : Code de droit économique (Livres
  VI/VII/XII), FSMA, AR TAEG, loi assurances du 4 avril 2014, droit à l'oubli,
  RGPD et cookies. L'analyse est décomposée en points confiés à des subagents qui
  ne produisent que des constats sourcés (verdict + citation par check) ; le niveau
  (par décompte) et les recommandations (matrice déterministe) sont calculés par
  code. Produit un rapport Markdown et un payload JSON. Utilise ce skill dès que
  l'utilisateur veut vérifier la conformité d'un site, auditer un site de courtier,
  faire un check site web, analyser un site crédit/assurance, ou vérifier les
  mentions légales / le slogan crédit / l'exemple représentatif TAEG / les cookies
  d'un intermédiaire belge, ou parle d'un check Brokercomply — même s'il ne nomme
  pas la loi ou ne fournit qu'une URL.
---

# Check de conformité — site web de courtier belge

## Ce que fait ce skill

Tu audites le **contenu publicitaire et informatif** d'un site de courtier belge
en crédit et/ou en assurances, et tu produis un rapport de conformité Markdown.

Le périmètre est limité au contenu du site tel qu'il se présente. Ce n'est **pas**
un audit juridique exhaustif des pratiques commerciales, contractuelles ou
opérationnelles, ni un examen de la documentation précontractuelle. Dis-le dans le
rapport pour cadrer les attentes.

## Philosophie : décomposer pour fiabiliser

La qualité d'un audit tient à sa **constance** : deux analyses du même site doivent
donner le même résultat, et chaque constat doit reposer sur une preuve vérifiable,
pas sur une impression. Un seul agent qui « lit la page et repère les problèmes »
hallucine et oublie — il trouve des choses différentes à chaque passage.

On évite cela en décomposant le travail :

1. **Un point d'analyse = un subagent.** Chaque point du rapport (1.1 Slogan légal,
   1.2 Registre FSMA, 1.3 Statut FSMA, etc.) est confié à un subagent dédié qui ne
   s'occupe que de ce point. Il a peu à traiter, donc il se trompe peu.
2. **Un point = une mini-checklist de checks atomiques.** Un point se décompose en
   questions élémentaires, chacune vérifiable indépendamment. Exemple — le slogan
   légal se vérifie en trois checks : (a) la formulation est-elle exacte ?
   (b) est-il visible rapidement / au bon endroit ? (c) sa taille est-elle au moins
   égale aux accroches commerciales ?
3. **Chaque check produit une sortie structurée et sourcée :** un verdict, une
   **citation littérale** extraite de la page comme preuve, une justification, et
   l'article de loi. La citation est l'antidote à l'hallucination : pas de citation,
   pas de constat.
4. **L'agent principal n'analyse pas, il orchestre et agrège.** Il scrape une fois,
   distribue le travail, puis assemble les résultats en rapport. Il ne réinterprète
   pas les pages lui-même.

La référence **`references/points-analyse.md`** est le catalogue des points et de
leurs checks atomiques. Elle pilote tout le processus.

## Avant de commencer — questions d'input (obligatoire)

**Ne lance pas l'audit sans avoir recueilli ces informations.** Au début, pose-les à
l'utilisateur (via une question à choix / champ de saisie s'il y a une UI de
questions, sinon demande-les en clair). Elles alimentent l'en-tête du rapport et le
point décisif sur le statut FSMA :

1. **Dénomination exacte de la société** (ex. « Créditop Conseil SRL »).
2. **Numéro BCE** (ex. « 1017.766.461 »).
3. **Statut FSMA** : catégories d'inscription réelles (courtier crédit hypothécaire,
   crédit à la consommation, assurances…). C'est déterminant : la conformité dépend de
   l'écart entre ce que le site promeut et ce pour quoi le courtier est inscrit. Si
   l'utilisateur ne le connaît pas, tente le data portal FSMA
   (`https://www.fsma.be/fr/data-portal`) ; s'il reste inaccessible, marque les points
   liés « À vérifier » plutôt que de supposer.
4. **URL(s) à analyser** (au minimum l'accueil ; idéalement aussi crédit hypothécaire,
   prêt personnel, investissement, assurance SRD, simulateur, demande de crédit,
   mentions légales, cookies, contact).

Optionnel : auteur du rapport, version (DRAFT/FINAL), date — sinon valeurs par défaut.
Ces champs renseignent directement `audit.entity.name`, `audit.entity.bce`,
`audit.entity.fsmaStatus` et `audit.site.url` du payload.

## Workflow

### Étape 1 — Scraper et figer le contenu (agent principal)

Crée un dossier de travail (par ex. `audit-[entite]-[AAAAMMJJ]/pages/`). Pour chaque
URL, récupère le contenu avec `mcp__workspace__web_fetch` et **enregistre le texte
dans un fichier** (`accueil.md`, `credit-hypothecaire.md`, etc.). Tous les subagents
liront ces fichiers figés : ils voient ainsi exactement le même contenu, ce qui rend
le processus reproductible.

Si une page revient vide, réduite à un squelette, ou clairement incomplète (rendu
JavaScript), bascule sur Claude in Chrome (`mcp__Claude_in_Chrome__navigate` puis
`get_page_text`) pour cette page, et enregistre le résultat. Ne contourne jamais une
restriction de fetch par d'autres moyens. Note les pages que tu n'as pas pu récupérer.

Dresse un petit inventaire (quelle page sauvegardée correspond à quel type) — il sert
à donner à chaque subagent les bons fichiers.

### Étape 1bis — Mesures visuelles (DOM rendu, via Claude in Chrome)

Certains checks ne portent pas sur le texte mais sur le **rendu** : la taille du
slogan par rapport aux accroches, sa visibilité sans défilement, la présence d'une
bannière cookies. Le scrape texte (`web_fetch`, `get_page_text`) jette tout le CSS :
ces informations n'y figurent jamais. Il faut donc les mesurer sur la page rendue.

Pour chaque page promouvant un crédit, ouvre-la dans Claude in Chrome
(`mcp__Claude_in_Chrome__navigate`), **fais défiler jusqu'en bas et attends** (le
contenu de pied de page est souvent chargé dynamiquement — un footer non scrollé peut
être absent du DOM), puis exécute le snippet de `references/checks-visuels.md` avec
`mcp__Claude_in_Chrome__javascript_tool`. Il renvoie, pour les éléments clés (slogan
légal, H1/accroches, CTA), leur `font-size` calculé, leur graisse, leur position
verticale et leur visibilité dans la fenêtre. Enregistre ce résultat en JSON à côté de
la page (`<page>.visuel.json`) : il est figé au même titre que le texte.

Deux points importants. La taille calculée est **responsive** : elle dépend de la
largeur de la fenêtre. Un check de taille compare donc le slogan aux accroches **à la
même largeur** (slogan ≥ accroches), jamais à un seuil absolu en pixels. Et l'eval
JavaScript ne supporte pas `await` : fais le défilement dans un premier appel, puis la
mesure dans un second (le snippet est découpé en conséquence).

Si Claude in Chrome n'est pas disponible, n'invente rien : les checks visuels
resteront « À vérifier » et tu le signaleras dans le rapport (à contrôler
manuellement par inspection du navigateur).

### Étape 2 — Dispatcher un subagent par point d'analyse

Lis `references/points-analyse.md`. Pour **chaque point applicable** au site, lance
un subagent (outil Task) avec le prompt standardisé ci-dessous. Lance-les en
parallèle par lots raisonnables (par ex. 5-6 à la fois) pour aller vite sans saturer.

Donne à chaque subagent uniquement ce dont il a besoin : l'énoncé du point et de ses
checks atomiques (copié depuis le catalogue), et les **chemins des fichiers de pages
concernés** par ce point. Un subagent ne doit pas avoir à deviner ni à explorer tout
le site : il vérifie sa mini-checklist sur les pages qu'on lui désigne. Pour les
checks tagués **[VISUEL]** dans le catalogue, fournis aussi le fichier
`<page>.visuel.json` correspondant : le subagent y lit les tailles et positions
mesurées et les cite comme preuve (ex. « slogan 14px vs accroche 24px »), au lieu de
conclure « À vérifier ».

Si l'environnement ne permet pas de lancer des subagents imbriqués, exécute les
mini-checklists toi-même **une par une**, dans l'ordre du catalogue, en appliquant
exactement le même protocole et le même schéma de sortie. La décomposition (un point,
puis ses checks atomiques, traités isolément) reste la garantie de constance même
sans parallélisme.

#### Prompt standard pour un subagent de point

```
Tu es un vérificateur de conformité. Tu ne traites QUE le point ci-dessous, sur les
pages fournies. Ne te prononce jamais sans preuve tirée du texte.

POINT : [ID + titre, ex. "1.1 Slogan légal"]
BASE LÉGALE : [article(s)]
PAGES À EXAMINER : [chemins des fichiers .md]

MINI-CHECKLIST (traite chaque check indépendamment) :
- [check 1 : question précise]
- [check 2 : ...]
- [check 3 : ...]

Pour CHAQUE check, renvoie un bloc EXACTEMENT dans ce format :

  ### [ID du check] — [question]
  - Verdict : Conforme | Non-conforme | Sans objet | À vérifier
  - Preuve : "<citation littérale extraite de la page>" (page : <fichier>)
             — ou "Aucune occurrence trouvée après recherche" si c'est une absence
             — ou "Page non disponible" si tu n'as pas pu la lire
  - Justification : <1-3 phrases reliant la preuve à l'exigence légale>
  - Article : <référence>

RÈGLES ANTI-HALLUCINATION :
- "Non-conforme" exige soit une citation qui montre le problème, soit la confirmation
  d'une absence après recherche réelle du terme attendu (ex. "prospectus", "FSMA").
- N'invente jamais une citation. Si tu ne trouves pas, le verdict est "À vérifier".
- "Sans objet" si le check ne s'applique pas à ce site (ex. pas de crédit conso).
- Normalise les espaces avant toute comparaison de texte : les pages contiennent
  souvent des espaces insécables (&nbsp;) ou multiples. Une phrase peut être présente
  même si une recherche avec des espaces ordinaires échoue. Avant de conclure
  "absent", retente en ignorant les différences d'espaces.
- Reste factuel : tu décris ce que tu observes.

TU NE PRODUIS QUE DES CONSTATS. Ne calcule pas le niveau de gravité et ne rédige
AUCUNE recommandation : le niveau (par décompte) et la recommandation (par la matrice
gravée dans la roche) sont déterminés ensuite, de façon déterministe, par le script
d'assemblage. Renvoie uniquement les blocs de check ci-dessus.
```

**Séparation des responsabilités (essentiel).** Le subagent *observe* (verdicts +
preuves). La *recommandation* et la *gravité* ne sont jamais écrites par un LLM : elles
sont calculées à l'étape 3 à partir de `assets/recommandations.json` (matrice figée) et
de la règle de décompte. C'est ce qui garantit qu'un même constat produit toujours
exactement la même reco et le même niveau.

### Étape 3 — Assembler les constats → payload (déterministe, sans LLM)

Tu ne rédiges plus le rapport à la main. Tu rassembles les constats des subagents dans
un fichier `constats.json`, puis tu lances le script d'assemblage qui calcule, de façon
déterministe, le niveau (par décompte) et la recommandation (par la matrice).

**1. Construire `constats.json`** à partir des sorties des subagents — un objet par
point, avec ses checks (verdict + preuve). Format :

```json
{
  "meta": {…}, "branding": {…}, "audit": {…},
  "constats": {
    "P01": { "applicable": true, "checks": [
      { "id":"P01.1","label":"…","verdict":"conforme","evidence":"« … »","source":"accueil" }
    ]},
    "P06": { "applicable": false }
  }
}
```
Mets `"applicable": false` pour un point hors champ (→ Sans objet). Un point absent de
`constats` sera rendu « non analysé » (la structure reste complète).

**2. Lancer le script :**

```
python scripts/assemble_reco.py constats.json assets/recommandations.json --out check-conformite-[entite]-[AAAAMMJJ].json
```

Le script applique :
- **Niveau par décompte** (parmi les sous-points applicables, hors « Sans objet ») :
  tous remplis → Conforme ; au moins 2 remplis mais pas tous → Amélioration ; 0 ou 1
  rempli → Non-conformité critique ; aucun manquement confirmé mais incertitude →
  À vérifier. Un « À vérifier » compte comme non rempli.
- **Recommandation par la matrice** `recommandations.json` : pour l'ensemble des checks
  non conformes d'une sous-section, combinaison exacte si elle existe, sinon repli =
  assemblage des fragments des checks manquants. Jamais rédigée par un LLM.
- **Structure figée** : toutes les sections et sous-sections de la matrice sont
  rendues, dans l'ordre, même conformes / sans objet / non analysées.

Le script produit directement le **payload** conforme à `assets/payload.schema.json`
(voir `assets/payload-exemple-creditop.json`). C'est le livrable JSON pour l'API PDF.

**3. Valider** le JSON produit contre le schéma avant livraison. Tu peux aussi générer
une vue Markdown du même payload pour relecture rapide (facultatif), mais le JSON reste
la source de vérité.

Tu n'édites ni les niveaux ni les recommandations à la main. Si une reco te paraît
inadaptée, c'est la **matrice** qu'on corrige (`recommandations.json`), pas le rapport :
ainsi la correction vaut pour tous les audits futurs.

### Étape 3bis — Envoyer le payload à l'API de génération PDF (sur confirmation)

Le payload peut être envoyé à un webhook qui génère le PDF de marque. **Demande
toujours l'accord de l'utilisateur avant l'envoi** (cela déclenche une génération
externe et transmet les données du dossier). N'envoie jamais sans un « oui » explicite.

- Endpoint (configurable) : `https://massive-flowing-baboon.ngrok-free.app/webhook/rapport-reco`
- Méthode : `POST`, corps = le payload JSON, en-tête `Content-Type: application/json`.

```
curl -sS -X POST "<ENDPOINT>" \
  -H "Content-Type: application/json" \
  -H "ngrok-skip-browser-warning: true" \
  --data @check-conformite-[entite]-[AAAAMMJJ].json
```

La réponse renvoie `{ "ok": true, "fileName": "...pdf", "summary": {...} }`. Vérifie que
`summary` (nCrit / nWarn / nOk / nTodo) correspond au décompte du payload, et
communique le nom du fichier généré. Si l'endpoint a changé (ngrok, domaine de prod),
utilise l'URL fournie par l'utilisateur. En cas d'erreur HTTP, signale-la sans réessayer
en boucle.

### Étape 4 — Vérification finale

Relis : chaque check « non conforme » s'appuie sur une preuve citée ; le décompte et la
synthèse sont cohérents (le script les calcule) ; les pages non récupérées et les points
« à vérifier » sont signalés ; aucun check n'affirme un fait non observé. En cas de
doute sur un verdict, relance le subagent concerné plutôt que de corriger à la main.

## Dépendances

- `mcp__workspace__web_fetch` (ou Claude in Chrome) pour récupérer le contenu texte.
- **Claude in Chrome** (`mcp__Claude_in_Chrome__*`) pour les checks visuels (étape
  1bis) et pour les pages rendues en JavaScript. Sans lui, les checks de contenu
  fonctionnent, mais les checks [VISUEL] restent « À vérifier ».
- Subagents (outil Task) pour l'exécution d'un point par subagent. À défaut, exécuter
  les mini-checklists en série, une par une.
- `assets/recommandations.json` — matrice « gravée dans la roche » (structure
  sections/sous-sections, fragments par check, combinaisons exactes). Éditée à la main.
- `scripts/assemble_reco.py` — assemblage déterministe constats → payload (Python 3).
- Webhook de génération PDF (optionnel, sur confirmation) : voir Étape 3bis. Endpoint à
  jour fourni par l'utilisateur ; aucune donnée n'est envoyée sans son accord explicite.

## Règles de rédaction

Les recommandations livrées ne sont jamais rédigées ici : elles proviennent de la
matrice `recommandations.json`. Les principes ci-dessous s'appliquent donc à
l'**édition de cette matrice** (et aux éventuelles notes de cadrage du rapport).
Suis les principes de voix de l'utilisateur (`00_Resources/voice-principles.md`)
s'ils sont accessibles. Au-delà :

- **Registre juridique.** Constats et recommandations sont rédigés en prose juridique
  impersonnelle : le constat sous la forme « S'agissant de …, il est constaté que … » ;
  la recommandation sous la forme « … Il convient de … ». Ces textes proviennent de la
  matrice (`constatLead` + `constatClause` par check ; `combinaisons` pour les recos) et
  sont assemblés par le script — ne les rédige pas à la main.
- Ton factuel et professionnel, jamais alarmiste : tu décris un risque, tu ne rends
  pas un jugement.
- Toute affirmation réglementaire est sourcée (article, circulaire).
- Recommandations concrètes ; propose une formulation de remplacement prête à
  l'emploi quand c'est utile.
- Quand une non-conformité admet plusieurs voies de résolution, présente les options.
- Rappelle que les niveaux de risque sont indicatifs et ne préjugent pas de
  l'appréciation d'une autorité de contrôle ou d'un juge.
