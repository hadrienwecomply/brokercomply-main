# Feature Plan — Track A : Agent RAG + réponse rédigée (plan d'attaque)

> **Plan d'exécution résumable entre sessions.** Cocher les cases au fur et à mesure.
> Statut global : `not-started` · Branche : _(à créer)_ `feat/track-a-rag-agent` · Démarré : — · Terminé : — · PR : —
> Docs : `doc/ROADMAP_TrackA.md` (le pourquoi/quoi détaillé), `PROGRESS_Phase0.md` §9 (plan 0-F/0-G d'origine), `doc/CONTEXTE_ET_GUIDELINES.md` (règles de travail).
> Créé : 2026-06-22.

---

## 0. Résumé en une page

Construire l'**agent RAG** manquant (brique 0-F) : `askQuestion(query)` = recherche hybride → fraîcheur → divergences → synthèse LLM **citée** → (option) **brouillon de réponse client prêt-à-coller**. Exposé d'abord en **CLI**, puis dans le **chat `/faq`** du dashboard.

**Tout l'outillage amont existe déjà** (ne pas reconstruire) : `hybridSearch` (`onlyPublished` défaut `true`), `LLMClient.chat/embed`, service knowledge, modèle `knowledge_units`, page `/faq`. **À créer** : `tools/kb-compliance/src/agent/` + `src/cli/`.

**Ordre d'attaque** : A1 (cœur lib) → A2 (CLI) → A3 (brouillon) → A4 (chat dashboard) → A5 (métriques) → A6 (draft Outlook, derrière gate prod).

---

## 1. Décisions de cadrage (défauts retenus, à confirmer au démarrage)

Ces défauts permettent de démarrer sans rebloquer ; modifier ici si le user tranche autrement.

- **D1 — Premier lot** : **A1 + A2** (CLI d'abord, pour juger la qualité réelle au plus vite avant l'UI). _Confirmé ? ☐_
- **D2 — Brouillon (A3)** : un **ton unique** par défaut (professionnel, concis) en v1 ; paramétrable plus tard. _Confirmé ? ☐_
- **D3 — Modèle de synthèse** : garder `claude-sonnet-4-6` (défaut `LLM_MODEL`) pour la qualité ; évaluer un modèle moins cher après mesure du volume. _Confirmé ? ☐_
- **D4 — Métriques (A5)** : minimum en v1 (requête → trouvé/pas trouvé), tracking de réutilisation fin plus tard. _Confirmé ? ☐_

---

## 2. Contrat cible de l'agent (référence pour toutes les phases)

```ts
// tools/kb-compliance/src/agent/types.ts
export interface Citation {
  unitId: string;
  author: string;            // officer (sdv / gr / fondateur)
  sourceDate: string | null; // pilote la fraîcheur
  regulatoryRefs: string[];
  sourceIds: string[];       // → source_documents (drawer provenance)
}
export interface FreshnessAlert { unitId: string; ageMonths: number; warning: string; }
export interface Divergence {
  question: string;
  answers: Array<{ unitId: string; author: string; answer: string; sourceDate: string | null }>;
}
export interface AskResult {
  answer: string;            // synthèse, langue de la question
  sources: Citation[];
  freshnessAlerts: FreshnessAlert[];
  divergences: Divergence[];
  draft?: string;            // (A3) brouillon prêt-à-coller
  noResults: boolean;        // true → l'agent dit "pas trouvé", n'invente pas
}
export interface AskOptions {
  limit?: number;                    // défaut 5
  freshnessThresholdMonths?: number; // défaut FRESHNESS_THRESHOLD_MONTHS (12)
  today?: Date;                      // injecté pour testabilité (pas de Date.now caché)
  withDraft?: boolean;               // (A3)
}
```

**Règles non négociables** (PRD/guidelines) — à encoder dans le prompt et tester :
- Citation systématique (id/auteur/date) — garde-fou anti-fuite (R2).
- **Grounding strict** : répondre uniquement depuis le contexte ; sinon `noResults=true` + message « pas trouvé », **jamais halluciner**.
- Divergences présentées **ensemble** avec attribution, jamais fusionnées.
- Fraîcheur > seuil ⇒ alerte.
- Réponse dans la **langue de la question** (FR/NL/EN).
- `onlyPublished` laissé à `true` (l'agent ne sert jamais un brouillon non publié).

---

## 3. Phase A1 — Cœur de l'agent (lib, sans UI) ⭐

**Fichiers à créer** (`tools/kb-compliance/src/agent/`)
- [ ] `types.ts` — interfaces du §2.
- [ ] `freshness.ts` — `checkFreshness(sourceDate, today, thresholdMonths=12): { isFresh, ageMonths, warning? }` (**pure**).
- [ ] `divergence.ts` — `detectDivergences(results: SearchResult[]): Divergence[]` : grouper par question normalisée, flaguer si ≥2 auteurs différents avec réponses différentes (**pure**, sans DB).
- [ ] `prompts.ts` — `buildSystemPrompt(opts)` (grounding strict, citations, fraîcheur, divergences, langue) + `buildUserPrompt(query, context)`.
- [ ] `rag-agent.ts` — `askQuestion(deps, query, options?)` : `hybridSearch` → `checkFreshness` par unité → `detectDivergences` → assemblage contexte → `llm.chat` → parse/valide (Zod) → `AskResult`. `deps = { db, llm, log? }`.

**Tests** (`tools/kb-compliance/__tests__/agent/`)
- [ ] `freshness.test.ts` — frais / périmé / limite exacte / `source_date` nulle (pur, cible 80%).
- [ ] `divergence.test.ts` — pas de divergence / divergence 2 auteurs / même auteur (pur).
- [ ] `rag-agent.test.ts` — LLM **mické** : assemblage du contexte, format de sortie, cas `noResults` (aucun résultat), citations présentes.

**Garde-fous / DoD** : `today` injecté ; `onlyPublished=true` ; build `tsc` vert ; lint vert ; tests passent.

---

## 4. Phase A2 — CLI `ask` + `validate`

**Fichiers** (`tools/kb-compliance/src/cli/`)
- [ ] `index.ts` — `commander` + `chalk` + `ora`. Configurer `bin` dans `package.json`.
- [ ] Commande `ask` — single-shot (`ask "question"`) **et** REPL ; affiche réponse + citations (auteur/date) + alertes fraîcheur + divergences.
- [ ] Commande `validate` (0-G) — 3–5 questions prédéfinies, run vrai LLM, affichage complet (revue qualité humaine).
- [ ] Commande `stats` — comptes KB (fiches, par topic/auteur/fraîcheur).
- [ ] Raccorder `ingest` / `distill` existants sous le même CLI (optionnel).

**Tests** : parsing d'args ; rendu (snapshot d'une réponse mickée).
**Garde-fous / DoD** : coût visible (`--limit`), pas de secret loggé. ⚠️ Lancer via `pnpm -F @brokercomply/kb-compliance exec tsx src/cli/index.ts ...` (le `pnpm run -- ...` casse `parseArgs`/commander).

---

## 5. Phase A3 — Réponse rédigée « prête-à-coller »

- [ ] Étendre `prompts.ts` / `rag-agent.ts` : champ `draft` quand `withDraft=true` (ton pro, langue de la question, sources citées en pied).
- [ ] CLI `ask --draft` affiche le brouillon.
- [ ] Tests : citations présentes dans le brouillon ; respect de la langue.
- [ ] Garde-fou : brouillon **toujours** marqué « à relire » ; signaler si une fiche source a `review_status` faible/confiance basse (R1).

---

## 6. Phase A4 — Chat dans le dashboard `/faq`

- [ ] Promouvoir `askQuestion` (ou un wrapper) accessible au dashboard (via `@brokercomply/shared` ou import outil) — respecter la frontière `server-only`.
- [ ] Server action `ask` dans `apps/dashboard` → `askQuestion`.
- [ ] UI chat sur `/faq` : réponse + **citations cliquables** vers le drawer provenance existant + badges fraîcheur + bloc divergences + bouton « copier le brouillon ».
- [ ] Tests : `next build` vert ; server action ; rendu citations.
- [ ] Garde-fou : **aucun embedding sérialisé** vers le client (réutiliser le DTO `KnowledgeRow`).

---

## 7. Phase A5 — Métriques (hypothèse de valeur)

- [ ] Journaliser côté serveur : requête → trouvé/pas trouvé (D4 = minimum v1).
- [ ] Agrégations : **taux de réutilisation** + **couverture** (métriques secondaires PRD).
- [ ] Tests : agrégations pures.
- [ ] Garde-fou : **pas de PII** dans les logs de requête.

---

## 8. Phase A6 — Draft Outlook (V2, derrière le gate de prod) — NE PAS démarrer avant le gate

- [ ] Pré-requis bloquants : permission Graph `Mail.Read` → `Mail.ReadWrite`/`Mail.Send` + re-consent admin ; **validation humaine avant envoi** ; gate prod PRD (DPA documenté, règle AML figée, hébergement choisi).
- [ ] Pousser le brouillon (A3) comme **draft Outlook** via Graph.

---

## 9. Dépendances qualité (à garder en tête)

- L'agent est **constructible sur le corpus actuel (~26 fiches)** — la mécanique est valide. Sa **valeur démontrable** dépend du **backfill complet Inbox + Sent Items** (Track 0). → Construire A1→A4, **juger la qualité après backfill**.
- ⚠️ **Base de test non isolée** : lancer la suite efface la KB réelle. Traiter l'isolation (`TEST_DATABASE_URL`, Track 0) **avant** un backfill sérieux, sinon le corpus est détruit à chaque run de tests.

---

## 10. Comment reprendre (checklist de session)

1. Lire ce fichier (statut global + cases cochées) et `doc/ROADMAP_TrackA.md`.
2. Vérifier l'env : `pnpm install` ; `docker compose up -d` ; `pnpm db:migrate` ; `pnpm build` ; `pnpm test`.
3. Confirmer/mettre à jour les décisions §1.
4. Reprendre à la **première case non cochée** de la phase courante.
5. Avant d'intégrer une lib (commander/chalk/ora, etc.) → **doc à jour via context7**.
6. TDD : test d'abord (RED) → impl (GREEN) → refactor. Vérifier en réel (CLI / `next build`).
7. À la fin d'un jalon : cocher les cases, mettre à jour le **statut global** en tête, et la mémoire de session.

---

## 11. Journal d'exécution

| Date | Phase | Fait | Notes |
|---|---|---|---|
| 2026-06-22 | — | Plan créé | En attente confirmation décisions §1 + go implémentation |
