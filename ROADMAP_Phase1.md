# BrokerComply — Roadmap Phase 1 (3 mois) · « Industrialiser le delivery »

> Suite logique de `PLAN_Phase0.md` / `PROGRESS_Phase0.md`.
> Horizon : 3 mois. Axe prioritaire : **industrialiser le delivery** (pas le SaaS commercial).
> Dernière mise à jour : 2026-06-22.

---

## 0. Objectif & principes directeurs

**Objectif central :** faire passer le delivery de *« tout à la main dans Notion + Word + SharePoint »* à un *pipeline outillé avec l'humain en validation*, pour absorber plus de courtiers **sans recruter**.

**Fil rouge :** automatiser la chaîne **Diagnostic → Rapport → Plan 13 étapes → Documents → Suivi/Fraîcheur**.

**Principes directeurs (issus du benchmark — voir `memory/competitive-benchmark.md`) :**
1. **Humain-in-the-loop** : l'IA *propose et cite*, l'officer *valide*. Jamais d'auto-décision réglementaire (modèle Recordsure/Ncontracts, le mieux vu des régulateurs).
2. **Le moat = le corpus distillé des 2 mailboxes**, pas la tech RAG (copiable). → prioriser qualité du corpus + agent RAG.
3. **Buy-don't-build sur l'AML/KYC screening** : intégrer un pure-player (ComplyAdvantage/Sumsub) plutôt que réécrire. Concentrer l'IP sur la couche connaissance + profondeur FSMA.
4. **Tout produit doit être "inspection-ready FSMA"** : traçabilité, citations, archivage (table-stakes BE/FR).

---

## 1. Vue d'ensemble des 3 mois

| Mois | Thème | Livrable de jalon |
|------|-------|-------------------|
| **M1** | Socle data + delivery sur données réelles | Officer interroge la KB en NL **et** voit l'état réel des 44 courtiers dans le dashboard |
| **M2** | Automatiser rapport & documents | Pack AML complet **pré-rempli** pour un courtier en minutes (prêt à relecture) |
| **M3** | Boucle de pilotage, fraîcheur & mesure | Delivery outillé bout-en-bout ; pilotage des 44 courtiers + exports inspection-ready |

---

## 2. Mois 1 — Socle data + delivery réel

| # | Chantier | Détail | Dépend de |
|---|----------|--------|-----------|
| **1.1** | **Finir 0-F : Agent RAG + CLI** | Brancher l'agent sur `knowledge_units` ; réponses avec citations + dates + auteur + alerte fraîcheur + divergences. Copilot interne pour les 2 officers. | corpus distillé suffisant |
| **1.2** | **Dashboard sur vraie data** | Remplacer les mocks du plan d'action : 44 courtiers + 13 étapes branchés sur la DB. Statut/owner/échéance par étape. | table `brokers` + `action_plan_steps` |
| **1.3** | **Ingestion du Diagnostic** | Récupérer les réponses Fillout (`complianceaudit.fillout.com`) → table structurée `diagnostics`. | accès API/export Fillout |

🎯 **Jalon M1** — détaillé en tâches exécutables en §5.

---

## 3. Mois 2 — Automatiser le rapport et les documents (plus gros gain de temps)

| # | Chantier | Détail |
|---|----------|--------|
| **2.1** | **Générateur Rapport de conformité + Plan d'action** | Depuis le diagnostic (1.3) : LLM produit brouillon de rapport + plan 13 étapes pré-rempli → l'officer corrige avant le call de validation. Remplace le « Process Mise en conformité » manuel. |
| **2.2** ⭐ | **Générateur de documents AML** | Templating des 5 livrables (Politique LBC/FT ~55p, Procédure EGR, EGR, Rapport EGR, Rapport AMLCO) + remplissage auto depuis le **questionnaire périodique FSMA**. **Sous-tâche benchmark : auto-pull identité bureau / n°BCE / UBO depuis les registres BCE & UBO** (le moat local d'AML Company — fiabilise + accélère). |
| **2.3** | **Amorce templates IDD / RGPD** | Mêmes mécaniques de remplissage pour les remédiations 04.01 / 05.01. |

🎯 **Jalon M2** : produire un pack AML complet pré-rempli en minutes au lieu de jours.

---

## 4. Mois 3 — Boucle de pilotage, fraîcheur & mesure

| # | Chantier | Détail |
|---|----------|--------|
| **3.1** | **Workflow 13 étapes complet** | Assignation, statuts, échéances, tickets courtiers, lien vers docs SharePoint. **Export PDF « prêt pour contrôle FSMA »** du statut conformité d'un courtier (table-stakes BE/FR + argument commercial). |
| **3.2** | **Alertes fraîcheur / recyclage** | Échéances annuelles AML/IDD/RGPD (« 03.02/04.02/05.02 Recyclage »). **Enrichissement benchmark : fraîcheur prospective** — remonter aussi les *nouveautés* FSMA/IDD/AML, pas seulement le périmé (modèle Aptus.AI/RegEd). |
| **3.3** | **Métriques delivery** | Temps gagné/courtier, couverture du plan, taux de réutilisation KB. Nourrit le pricing futur. |
| **3.4** | **Hardening** | **DB de test séparée** (`TEST_DATABASE_URL` — les tests d'intégration wipent la dev DB actuellement, cf. dette PROGRESS §8). Sécurité accès. |

🎯 **Jalon M3 (= Phase 1 atteinte)** : les 2 officers pilotent les 44 courtiers depuis le dashboard, packs documentaires générés semi-automatiquement.

---

## 5. Mois 1 — Tâches exécutables

### 1.1 — Agent RAG + CLI (0-F)  ← *prochain pas, à démarrer*

Crée `tools/kb-compliance/src/agent/` et `src/cli/`. Réutilise `hybridSearch` (déjà dans `@brokercomply/shared/retrieval`).

- [ ] **1.1.a** `agent/freshness.ts` — `checkFreshness(unit, thresholdMonths=12)` → `{ isFresh, ageMonths, warning }`. Source = `source_date`. Seuil via `FRESHNESS_THRESHOLD_MONTHS`. *Fonction pure → testable sans DB.*
- [ ] **1.1.b** `agent/divergence.ts` — grouper les résultats par similarité de question ; flag si **auteurs différents** répondent différemment (divergence = feature, jamais merge silencieux — cf. règle domaine PRD).
- [ ] **1.1.c** `agent/prompts.ts` — prompt système : répondre **uniquement** sur le contexte récupéré ; **citer** ID source + auteur + date ; signaler la fraîcheur ; présenter **LES DEUX** réponses si divergence ; répondre dans la **langue de la question** (FR/NL/EN).
- [ ] **1.1.d** `agent/rag-agent.ts` — `askQuestion(query)` = `hybridSearch` → `checkFreshness` → `detectDivergence` → prompt → `llm.chat` → `{ answer, sources, freshnessAlerts, divergences }`.
- [ ] **1.1.e** `cli/` — `commander` + `chalk` + `ora`. Commandes : `ingest`, `distill` (wrap existants), `ask` (single-shot + REPL), `stats`, `validate`. Configurer `bin` dans `package.json`.
- [ ] **1.1.f** Tests : `freshness` + `divergence` (purs, viser 80%), `rag-agent` (LLM mocké). 1 test e2e `ask` sur fixtures.
- [ ] **1.1.g** Maj `PROGRESS_Phase0.md` (0-F ✅) + `memory/phase0-progress.md`.

### 1.2 — Dashboard sur vraie data

- [ ] **1.2.a** Schéma : tables `brokers` (depuis `brokers.seed.json`, 44 clients) + `action_plan_steps` (13 étapes × statut/owner/échéance/notes). Migration Drizzle (`pnpm db:generate`).
- [ ] **1.2.b** Service `@brokercomply/shared/pilotage` : `listBrokers`, `getBrokerPlan`, `updateStep` (server-only, frontière stricte comme `knowledge/service.ts`).
- [ ] **1.2.c** Seed : importer `brokers.seed.json` → table `brokers` ; initialiser les 13 étapes par courtier.
- [ ] **1.2.d** Brancher la feature plan d'action existante (mocks → service réel) via Server Components/Actions + `revalidatePath`.
- [ ] **1.2.e** Tests service pilotage + `next build` vert.

### 1.3 — Ingestion du Diagnostic

- [ ] **1.3.a** **Lever la dépendance d'abord** : confirmer l'accès aux réponses Fillout (API ? export CSV/webhook ?). *Bloquant — voir §6.*
- [ ] **1.3.b** Schéma table `diagnostics` (broker_id, payload jsonb structuré, submitted_at, source).
- [ ] **1.3.c** Adaptateur d'ingestion Fillout → `diagnostics` (idempotent sur submission id).
- [ ] **1.3.d** Tests sur fixture de réponse Fillout.

---

## 6. Dépendances & risques à lever tôt

| Risque | Impact | Action |
|--------|--------|--------|
| **Accès données Fillout** | Bloque 1.3 + tout le Mois 2 | Vérifier API/export/webhook **en S1** |
| **Format questionnaire périodique FSMA** | Conditionne 2.2 (chantier clé) | Récupérer 2-3 exemplaires réels pour caler le templating |
| **Intégration SharePoint** | Impacte 2.2 + 3.1 | Évaluer Graph API (déjà utilisé pour Mail) sur Files/Sites |
| **Volume corpus KB** | Conditionne l'utilité du RAG (1.1) | Lancer le **backfill réel** (non fait — cf. PROGRESS §8.2) avant de juger 1.1 |
| **Registres BCE/UBO** | Sous-tâche 2.2 | Vérifier conditions d'accès API officielles |

---

## 7. Positionnement (rappel benchmark)

White-space confirmé sur les 4 zones (BE/FR/UK/US/EU) : **personne ne combine service externalisé + software + RAG sur corpus officer maison, localisé FSMA**. Concurrent le plus frontal : **Vandelanotte "Compliance Compass"** (BE) — à battre sur l'IA et la profondeur (goAML/CABRIO, diagnostic→plan). Détails : `memory/competitive-benchmark.md`.
