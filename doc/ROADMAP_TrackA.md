# Track A — Répondre plus vite (Agent RAG + réponse rédigée)

> Roadmap détaillée du Track A (le plus gros gisement de temps quotidien pour l'officer).
> **Aucun code engagé à ce stade** — document de cadrage pour relecture, puis bascule en plan d'implémentation TDD section par section.
> Docs voisines : `doc/ROADMAP.md` (vue d'ensemble 4 tracks), `PROGRESS_Phase0.md` §9 (plan technique 0-F/0-G d'origine), `doc/CONTEXTE_ET_GUIDELINES.md` (le pourquoi des décisions).
> Créé : 2026-06-17.

---

## 1. Objectif & valeur

Transformer la KB consultable en **outil qui répond**. Aujourd'hui l'officer peut *chercher* des fiches (`/faq`) mais doit encore *rédiger* lui-même la réponse au client. Track A produit une **réponse de synthèse citée** et, au-delà, un **brouillon prêt-à-coller** dans la langue de la question.

- **Gain de temps** : ⭐⭐⭐ (le plus élevé des 4 tracks).
- **Alignement PRD** : c'est la brique **0-F** non construite, et le **critère de passage au V2** (« l'agent répond utilement à la majorité des recherches »).
- **Alignement moat / benchmark** : RAG cité sur corpus propriétaire = exactement le white-space concurrentiel.

---

## 2. Ce qui existe déjà (réutilisé, rien à reconstruire)

| Brique | Emplacement | Réutilisation Track A |
|---|---|---|
| **Recherche hybride** | `@brokercomply/shared` → `hybridSearch(deps, query, options)` | récupération du contexte ; `onlyPublished` **défaut `true`** ⇒ l'agent ne sert jamais un brouillon |
| **Client LLM** | `shared` → `LLMClient.chat(messages, options)` + `embed()` | synthèse + (déjà) embeddings de requête |
| **Service knowledge** | `shared/knowledge/service.ts` | `searchSemantic`, `getKnowledgeUnit`, facettes — pour le dashboard |
| **Dashboard `/faq`** | `apps/dashboard/app/faq` | surface d'accueil du chat (A4) |
| **Modèle de données** | `knowledge_units` (question, answer, topic, refs, source_ids, **source_date**, **author**, confidence, review_status, is_published) | tout est là pour citations, fraîcheur, divergences |

**À construire** : `src/agent/` (freshness, divergence, prompts, rag-agent) + `src/cli/` — confirmés absents.

---

## 3. Contrat de l'agent (cible)

```
askQuestion(query, options?) → {
  answer: string,              // synthèse en langage naturel, langue de la question
  sources: Citation[],         // {unitId, author, sourceDate, regulatoryRefs, sourceIds}
  freshnessAlerts: Alert[],    // fiches > seuil (défaut 12 mois)
  divergences: Divergence[],   // réponses divergentes entre auteurs, présentées ENSEMBLE
  draft?: string,              // (A3) brouillon de réponse client prêt-à-coller
}
```

**Règles non négociables (issues du PRD / guidelines) :**
- **Citation systématique** : toute affirmation s'appuie sur une fiche citée (id/auteur/date). Garde-fou anti-fuite inter-clients (R2).
- **Grounding strict** : répondre **uniquement** depuis le contexte récupéré. Si rien de pertinent → le dire (« pas trouvé dans la base »), **jamais halluciner**.
- **Divergences préservées** : si deux officers divergent, présenter **les deux** avec attribution, ne pas trancher ni fusionner.
- **Fraîcheur** : flaguer toute source au-delà du seuil (`FRESHNESS_THRESHOLD_MONTHS`, défaut 12).
- **Multilingue** : répondre dans la langue de la question (FR/NL/EN).

---

## 4. Phasage

Ordre conseillé : **A1 → A2 → A3 → A4 → A5**, A6 derrière le gate de prod.

### A1 — Cœur de l'agent (lib, sans UI) ⭐ priorité
**Contenu**
- `agent/freshness.ts` : `checkFreshness(unit, thresholdMonths=12)` → `{ isFresh, ageMonths, warning }` (fonction **pure**).
- `agent/divergence.ts` : grouper les résultats par proximité de question, flaguer si auteurs différents → `Divergence[]` (pure, testable sans DB).
- `agent/prompts.ts` : prompt système (grounding strict, citation id/auteur/date, signaler fraîcheur, présenter LES DEUX réponses divergentes, langue de la question).
- `agent/rag-agent.ts` : `askQuestion()` = `hybridSearch` → `checkFreshness` → `divergence` → prompt → `llm.chat` → objet structuré (Zod en sortie).

**Tests** : freshness & divergence en unitaire pur (cible 80%) ; rag-agent avec LLM mické (assemblage du contexte, format de sortie, cas « aucun résultat »).
**Garde-fous** : `onlyPublished` laissé à `true` ; injecter `today` (pas de `Date.now()` caché → testable).
**Effort** : moyen. **Dépendances** : aucune (briques existantes).

### A2 — CLI `ask` + `validate` (0-G)
**Contenu**
- `cli/` (`commander` + `chalk` + `ora`) : commandes `ask` (single-shot **et** REPL), `stats`, et raccordement de `ingest`/`distill` existants ; configurer `bin`.
- `ask` affiche : réponse + citations (auteur/date) + alertes fraîcheur + divergences.
- Commande `validate` (0-G) : 3–5 questions prédéfinies, run manuel avec vrai LLM → affichage réponse + citations + alertes + divergences (revue humaine de qualité).

**Tests** : parsing d'args ; rendu (snapshot). **Garde-fous** : `--limit`/coût visible. **Effort** : faible-moyen. **Dépendances** : A1.

### A3 — Réponse rédigée « prête-à-coller »
**Contenu** : extension de la synthèse pour produire un **brouillon de réponse au client** (ton professionnel, langue de la question, sources citées en pied) — le vrai accélérateur quotidien. Champ `draft` du contrat.
**Tests** : présence des citations dans le brouillon ; respect de la langue. **Garde-fous** : brouillon **toujours** marqué « à relire » ; ne jamais s'appuyer sur une fiche `review_status` douteuse sans le signaler (R1). **Effort** : faible (sur A1). **Dépendances** : A1.

### A4 — Branchement dashboard `/faq` (chat)
**Contenu** : UI de chat sur `/faq` (server action → `askQuestion`), réponse avec citations cliquables vers le drawer provenance existant, badges fraîcheur, bloc divergences, bouton « copier le brouillon ». Frontière `server-only` stricte (DB/secrets/embeddings jamais côté client — cohérent avec l'archi actuelle).
**Tests** : `next build` vert ; server action ; rendu citations. **Garde-fous** : pas d'embedding sérialisé vers le client. **Effort** : moyen. **Dépendances** : A1 (+ A3 pour le bouton brouillon).

### A5 — Métriques (instrumenter l'hypothèse de valeur)
**Contenu** : journaliser (côté serveur) les requêtes et si une réponse a été trouvée/réutilisée → **taux de réutilisation** + **couverture**, métriques secondaires du PRD et déclencheur de la décision go/no-go V2.
**Tests** : agrégations pures. **Garde-fous** : pas de PII dans les logs de requête. **Effort** : faible-moyen. **Dépendances** : A4.

### A6 — Préparation V2 : draft dans Outlook *(derrière le gate de prod)*
**Contenu** : pousser le brouillon (A3) comme **draft Outlook** via Graph. **Bloquant** : passage de permission `Mail.Read` → `Mail.ReadWrite`/`Mail.Send` + re-consent admin, et **validation humaine avant envoi** obligatoire.
**Effort** : moyen. **Dépendances** : A3 + gate de prod du PRD (DPA, règle AML figée, hébergement).

---

## 5. Dépendance qualité : le corpus

L'agent peut **être construit** sur le corpus actuel (~26 fiches) — l'UX et la mécanique sont valides. Mais sa **valeur démontrable** (et le critère V2) dépendent du **backfill complet Inbox + Sent Items** (Track 0). Recommandation : construire A1→A4 en parallèle, puis **juger la qualité réelle après backfill**, pas avant.

> Rappel guideline : la base de test n'est pas isolée → lancer la suite efface la KB. À traiter (Track 0) **avant** un backfill sérieux, sinon on reconstruit le corpus à chaque run de tests.

---

## 6. Risques & mitigations

| Risque | Mitigation |
|---|---|
| **Hallucination / sur-affirmation** | Grounding strict + « je ne sais pas » + citation obligatoire (prompt A1) |
| **R1 — fiche fausse propagée dans un brouillon** | Brouillon « à relire » ; signaler `review_status`/confiance faible ; citations vérifiables |
| **R2 — fuite inter-clients** | Citation systématique rend tout emprunt visible ; `onlyPublished=true` |
| **Coût LLM par requête** | Limites, caching de requêtes fréquentes, modèle adapté |
| **Détection de divergence imparfaite** | Heuristique simple + seuil ; biais « montrer les deux » plutôt que masquer |
| **Corpus trop mince pour convaincre** | Construire l'agent maintenant, juger après backfill (Track 0) |

---

## 7. Décisions ouvertes avant implémentation

1. **Périmètre du premier lot** : A1+A2 (CLI d'abord, pour juger la qualité au plus vite) ou A1+A4 directement (chat dashboard) ?
2. **Brouillon (A3)** : un seul ton par défaut, ou paramétrable (formel/synthétique) ?
3. **Modèle LLM de synthèse** : garder `claude-sonnet-4-6` (défaut actuel) ou tester un modèle plus économique pour le volume ?
4. **Métriques (A5)** : minimum (trouvé/pas trouvé) en v1, ou tracking de réutilisation plus fin dès le départ ?

> Au choix d'une décision, je bascule en plan d'implémentation TDD détaillé (restitution besoin → risques → phases → tests d'abord → vérif réel), conformément à la méthode des guidelines, en consultant la doc à jour des libs (context7) avant toute intégration.
