# BrokerComply — Phase 0 : état d'avancement & passation

> Document de reprise pour continuer dans une autre session.
> Dernière mise à jour : 2026-06-16.
> Voir aussi : `PRD_KB_Compliance_v1.md` (le quoi/pourquoi) et `PLAN_Phase0.md` (le découpage des tâches 0-A → 0-G).

---

## 1. Résumé exécutif

Prototype local d'un moteur de capitalisation compliance (KB + futur agent RAG) pour courtiers FSMA.
Pipeline : **Ingestion (Graph) → Filtre AML → Distillation LLM (Q/R + embeddings) → [à venir] Recherche hybride → Agent RAG**.

| Phase | Sujet | État |
|-------|-------|------|
| 0-A | Scaffolding (monorepo, Docker pgvector, schéma Drizzle) | ✅ Fait |
| 0-B | Ingestion email (Microsoft Graph + fixtures) | ✅ Fait |
| 0-C | Filtre AML conservateur | ✅ Fait |
| 0-D | Distillation Q/R + embeddings | ✅ Fait |
| 0-E | Recherche hybride (pgvector + tsvector, RRF) | ✅ Fait |
| 0-F | Agent RAG + CLI (fraîcheur, divergences, citations) | ⏳ À faire |
| 0-G | Tests/validation (commande `validate` revue humaine) | ⏳ Partiel (tests unitaires/intégration faits) |

**Tests : 94 passent** (unitaires + intégration sur Postgres Docker). Build TypeScript **vert**, ESLint **vert sur kb-compliance/shared** (⚠️ une erreur ESLint non liée subsiste dans `apps/dashboard/` — feature séparée).

**Scope clients signés (nouveau, hors PLAN initial) :** l'ingestion peut être restreinte aux correspondances des **44 courtiers signés** (source : Notion « Espace clients (signés) »). Stratégie retenue : **domaine d'entreprise + email exact** pour les fournisseurs génériques (Gmail). Allowlist dans `tools/kb-compliance/config/client-allowlist.json` (**gitignorée**, PII clients ; `.example.json` committé). Filtre `client-filter.ts` appliqué **avant** parsing/AML (économise le coût). `runIngest` accepte `clientAllowlist` et renvoie `threadsOutOfScope` ; le CLI `run.ts` charge l'allowlist par défaut (`--all` pour bypasser). ⚠️ 3 paires de courtiers partagent un email (Agreassure/Atrium, FIC/AMK, Tournaisis/Pays Vert) → attribution par-client ambigüe ; **Credit Home** n'a pas d'email (hors scope). `vitest` configuré en `fileParallelism: false` (tests d'intégration sériés sur la Postgres partagée).

**Dashboard — onglet « Base de connaissances » (FAQ) :** `apps/dashboard` (Next.js 15 App Router, React 19, Tailwind v4). Route `/faq` : **table interactive** (filtres topic/auteur/langue/fraîcheur/statut via URL, recherche plein-texte, tri, pagination) + **recherche sémantique** (server action → `searchSemantic` = même `hybridSearch` que l'agent) + **drawer provenance** (emails sources). Source unique de vérité = table `knowledge_units`. Architecture : `retrieval` + `knowledge/service.ts` **promus dans `@brokercomply/shared`** ; dashboard branché via Server Components/Actions, frontière **`server-only`** stricte (DB/secrets jamais côté client ; embedding **jamais** sérialisé — DTO `KnowledgeRow`). `next.config` : `transpilePackages: ['@brokercomply/shared']` + `serverExternalPackages` (postgres/openai/anthropic/dotenv).

**Phase 3 — Édition (FAIT) :** le drawer est éditable (réponse + question/topic/réfs/langue/auteur/date/publication) + bouton « Marquer revu ». Service `updateKnowledgeUnit`/`markKnowledgeUnitReviewed` (shared) : **re-embed seulement si la `question` change** (Q3), UPDATE **atomique**, validation **Zod** (topic∈TOPICS, langue∈LANGUAGES). **Q4** : toute mutation officer sort de `unreviewed` → `edited` (contenu) / `reviewed` (publish-toggle ou approbation), pose `updated_by`/`updated_at` ⇒ protégée du `distill --force`. **Identité officer** sans auth : sélecteur en **cookie** (`bc_officer`), email (`sdv@`/`gr@`/fondateur), helper `currentOfficer()` ; server actions `saveUnit`/`reviewUnit` + `revalidatePath('/faq')`. Édition immédiatement visible par l'agent (même table) ; `is_published` = brouillon. **Création/suppression : pas encore** (édition seule en v1 ; last-write-wins, pas de verrou). Validé : `next build` OK (`/faq` Dynamic), `tsc` OK, service knowledge **16 tests** (dont 6 mutations), retrieval 13.

> ⚠️ **Leçon / dette outillage :** les tests d'intégration tournent sur la **base de dev** et **suppriment `knowledge_units` + `source_documents`** (beforeAll/afterAll). Lancer la suite **efface les données réelles** du prototype (re-dérivables via ré-ingestion + `distill`). **À faire : faire pointer les tests d'intégration sur une base/realm de test séparée** (`TEST_DATABASE_URL`) pour ne plus toucher la base de dev.
Distillation **validée avec les vraies API** Anthropic + OpenAI sur les fixtures.

---

## 2. Stack & prérequis

- Node 24, **pnpm 10** (workspace), TypeScript strict **NodeNext**.
- **Docker** : Postgres 16 + pgvector via `docker-compose.yml` (conteneur `brokercomply-postgres`, volume persistant, extension `vector` créée par `docker/init/01-extensions.sql`).
- **psql 18** dispo en local pour inspection.
- ORM : **Drizzle** (`drizzle-orm` ~0.39, `drizzle-kit` ~0.30, driver `postgres.js`).
- LLM : `@anthropic-ai/sdk` (chat), `openai` (embeddings).
- Parsing : `html-to-text`, `pdf-parse` **v2** (`PDFParse` class), `mammoth`.
- Graph : `@microsoft/microsoft-graph-client` v3 + `@azure/identity`.

### Démarrer l'environnement
```bash
pnpm install
docker compose up -d                 # Postgres + pgvector
pnpm db:migrate                      # applique les migrations
pnpm build                           # tsc -b (compile tous les packages)
pnpm test                            # vitest (passWithNoTests à la racine)
```

---

## 3. Structure du repo

Monorepo pnpm : `packages/*` (code partagé) + `tools/*` (outils).

```
packages/shared/                 @brokercomply/shared
  src/
    config/index.ts              env via dotenv (walk-up .env) + validation zod
    types/index.ts               Language, Topic (vocabulaire contrôlé), Author
    db/
      schema.ts                  source_documents, knowledge_units, aml_exclusion_log
      client.ts                  createDb() -> { db, client }  (Drizzle + postgres.js)
      migrations/                0000_*.sql (3 tables), 0001_*.sql (direction + distilled_at)
    llm/
      types.ts                   LLMClient { chat, embed }, ChatMessage, ChatOptions
      client.ts                  createLLMClient(config) : Anthropic chat + OpenAI embed, retry
    retrieval/                   (déplacé de kb-compliance → partagé agent + dashboard)
      rrf.ts                     reciprocalRankFusion() : fonction pure (k=60), testable sans DB
      hybrid-search.ts           hybridSearch() : cosine + ts_rank + RRF + hydratation ; option onlyPublished
      types.ts                   HybridSearchOptions/Deps, SearchResult, LegRank
    knowledge/
      service.ts                 listKnowledgeUnits/getKnowledgeUnit/searchSemantic/getKnowledgeFacets (server-only)
    index.ts                     ré-exporte config/types/db/llm/retrieval/knowledge

tools/kb-compliance/             @brokercomply/kb-compliance
  src/
    ingestion/
      types.ts                   RawMessage, RawAttachment, EmailSource (interface adaptateur)
      direction.ts               classifyDirection(from, recipients, officers) -> inbound|outbound|internal
      graph-client.ts            GraphEmailClient : itère par dossier, pagination, backoff, direction
      fixture-source.ts          FixtureEmailSource : EmailSource offline (sample-threads.json)
      thread-builder.ts          buildThreads() : groupe par conversationId, fallback sujet
      email-cleaner.ts           cleanEmailBody() : HTML->texte, retire citations (accents pliés)/signatures/disclaimers FR-NL-EN
      attachment-parser.ts       parseAttachment() : PDF (pdf-parse v2) + DOCX (mammoth), skip >10MB
      language.ts                detectLanguage() : heuristique stop-words FR/NL/EN
      client-filter.ts           allowlist clients signés (domaine + email exact) : threadMatchesClient(), loadClientAllowlist()
      ingest.ts                  runIngest() : fetch->threads->parse->AML->store (upsert message_id)
      run.ts                     entrée CLI ingestion (--fixture | --mailbox --since --until --limit)
    aml-filter/
      keywords.ts                listes multilingues figées par catégorie (ctif/suspicion/laundering/sanctions)
      filter.ts                  scanText/filterThread : normalise (accents), word-boundary, ANY match -> exclut
      types.ts                   AmlMatch, FilterResult
    distillation/
      types.ts                   QaPair
      extractor.ts               extractQaPairs() : prompt + few-shot, JSON, Zod, retry max 2
      embedder.ts                embedQuestions() : délègue à llm.embed (batch)
      distill.ts                 runDistill() : groupe par conversation_id, insère knowledge_units, idempotent
      run.ts                     entrée CLI distillation (--limit --conversation-id --force)
    (retrieval/ déplacé vers packages/shared — réutilisé par le dashboard)
    index.ts                     barrel exports (ré-exporte hybridSearch depuis @brokercomply/shared)
  scripts/
    inspect-graph.ts             lecture seule : affiche brut+nettoyé+PJ+direction+aperçu AML
    test-llm.ts                  test connectivité ANTHROPIC_API_KEY + EMBEDDING_API_KEY
  fixtures/
    sample-threads.json          9 threads (fit&proper, IDD, EGR, mystery, AML-ok, CTIF, multilingue, 2x divergence)
    attachments/                 circulaire-fsma.pdf + .docx (vrais fichiers générés via macOS textutil/cupsfilter)
  __tests__/                     ingestion/*, aml-filter/*, distillation/*, integration/pipeline.test.ts
```

### Scripts npm
- Racine : `build` (`tsc -b`), `test`, `lint`, `format`, `db:generate`, `db:migrate`, `db:studio`, `db:push`.
- kb-compliance : `build`, `test`, `inspect:graph`, `test:llm`, `ingest`, `distill`.
- ⚠️ Passer les arguments via `pnpm -F @brokercomply/kb-compliance exec tsx <script> --flags`
  (le `pnpm run -- ...` injecte un `--` parasite qui casse `parseArgs`).

---

## 4. Modèle de données (Postgres + pgvector)

**`source_documents`** (couche 1, immuable, traçabilité/citation) :
`id uuid pk`, `message_id text unique` (= internetMessageId), `conversation_id`, `subject`, `body_clean`,
`attachment_text`, `sender`, `recipients jsonb`, `mailbox`, `language`, **`direction`** (inbound/outbound/internal),
`received_at timestamptz`, `raw_metadata jsonb` (graphId, to, cc, folder, parentFolderId, attachmentNames),
`created_at`, **`distilled_at timestamptz`** (marqueur d'idempotence de la distillation).
Index : conversation_id, received_at, distilled_at.

**`knowledge_units`** (couche 2, distillée, interrogée) :
`id`, `question`, `answer`, `topic`, `regulatory_refs jsonb`, `language`, `source_ids uuid[]` (→ couche 1),
`source_date date` (date de la réponse officer → pilote la fraîcheur), `author`, `confidence real`,
**`origin`** (`distilled`|`manual`), **`review_status`** (`unreviewed`|`reviewed`|`edited`), **`updated_by`**, **`is_published`** (curation dashboard),
`embedding vector(1536)`, `search_vector tsvector` **généré STORED** sur `simple(question||answer)`,
`created_at`, `updated_at`.
Index : **HNSW cosine** sur `embedding`, **GIN** sur `search_vector`, + topic/language/source_date/origin/is_published.
Migration `0002_*` ajoute origin/review_status/updated_by/is_published. `distill --force` n'écrase **que** les fiches `origin='distilled' AND review_status='unreviewed'` (protège la curation humaine).

**`aml_exclusion_log`** : `id`, `message_id`, `reason` (catégories uniquement, **jamais de contenu**), `excluded_at`.

Migrations : `0000_premium_karma.sql` (tables+index), `0001_opposite_agent_zero.sql` (direction + distilled_at).
Régénérer après modif schéma : `pnpm db:generate` puis `pnpm db:migrate`.

---

## 5. Configuration (`.env` à la racine, gitignoré)

Le chargement remonte l'arborescence pour trouver `.env` (marche depuis n'importe quel package).

| Variable | Rôle | État |
|----------|------|------|
| `DATABASE_URL` | Postgres (défaut local docker) | défaut OK |
| `AZURE_TENANT_ID` / `AZURE_CLIENT_ID` / `AZURE_CLIENT_SECRET` | Graph app-only `Mail.Read` | ✅ fournis, validés sur `sdv@we-comply.be` |
| `OFFICER_MAILBOXES` | boîtes officers (CSV) → scope + direction | défaut `sdv@we-comply.be,mvl@we-comply.be` |
| `INGEST_FOLDERS` | dossiers à lire (CSV) | défaut `inbox,sentitems` |
| `LLM_PROVIDER` | `anthropic` \| `openai` | défaut anthropic |
| `ANTHROPIC_API_KEY` | clé chat Anthropic | ✅ fourni, validé |
| `LLM_MODEL` | modèle chat | défaut `claude-sonnet-4-6` |
| `EMBEDDING_API_KEY` | clé OpenAI embeddings | ✅ fourni, validé (1536-d) |
| `EMBEDDING_MODEL` | modèle embeddings | défaut `text-embedding-3-small` |
| `FRESHNESS_THRESHOLD_MONTHS` | seuil fraîcheur | défaut 12 |

⚠️ Côté Azure : `Mail.Read` est de type **Application** avec admin consent. Pensez à une **Application Access Policy** pour restreindre l'app aux 2 boîtes (sinon accès tenant-wide).

---

## 6. Flux de bout en bout (validé)

1. **Ingestion** (`runIngest`) : `EmailSource.listMessages` (Graph par dossier, ou fixtures) → `buildThreads` → pour chaque message : `cleanEmailBody` + `parseAttachment` → **`filterThread` (AML)** : si match → `aml_exclusion_log` (catégories) et **rien stocké** ; sinon upsert dans `source_documents` (idempotent sur `message_id`), avec `direction`.
2. **Distillation** (`runDistill`) : sélectionne les docs `distilled_at IS NULL`, **groupe par `conversation_id`** (le thread entier), `extractQaPairs` (LLM+Zod+retry) → `embedQuestions` (OpenAI) → insère `knowledge_units` (`source_ids` = ids du thread, `source_date` = date de la réponse outbound), puis marque `distilled_at`. `--force` re-distille en supprimant d'abord les unités liées.

Preuve réelle : la référence **« Circ. FSMA 2023_12 » issue de la PJ PDF** est remontée dans `regulatory_refs` → parsing PJ → distillation OK. Auteurs corrects (EGR→`mvl`, autres→`sdv`).

### Commandes utiles
```bash
# Inspecter la vraie boîte (lecture seule)
pnpm -F @brokercomply/kb-compliance exec tsx scripts/inspect-graph.ts --limit 5 --full --attachments

# Tester les clés LLM/embeddings
pnpm -F @brokercomply/kb-compliance run test:llm

# Ingestion fixtures (offline) puis vrai mailbox
pnpm -F @brokercomply/kb-compliance exec tsx src/ingestion/run.ts --fixture
pnpm -F @brokercomply/kb-compliance exec tsx src/ingestion/run.ts --mailbox sdv@we-comply.be --limit 20

# Distillation
pnpm -F @brokercomply/kb-compliance exec tsx src/distillation/run.ts --limit 3
```

---

## 7. Décisions & écarts vs PLAN_Phase0

- **TS `module: NodeNext`** (pas `ESNext`) : `ESNext`+`moduleResolution NodeNext` est rejeté par TS (TS5110). Imports relatifs en `.js`.
- **pnpm** : `pnpm-workspace.yaml` (le champ `workspaces` de package.json est ignoré par pnpm). `pnpm.onlyBuiltDependencies: ["esbuild"]` (pnpm 10 bloque les postinstall).
- **pdf-parse v2** (API `PDFParse` class), pas v1 (API callable).
- **0-C fait avec 0-B** : l'orchestrateur ne doit jamais stocker avant le garde-fou AML.
- **Distillation par `conversation_id`** (et non « par source_document » comme écrit dans le plan) : une paire Q/R s'étale sur plusieurs messages.
- **`html-to-text`** : pas de types fournis → déclaration ambiante locale `src/types/html-to-text.d.ts`.
- **Filtre AML resserré (2026-06-16)** : la catégorie `laundering` ne matche plus les termes-sujets nus (`blanchiment`, `witwassen`, `money laundering`) — uniquement les **actes de signalement** (`signalement de blanchiment`, `aangifte witwassen`…). `sanctions` ne matche plus les termes de screening (`liste des sanctions`, `sanctions list`) — uniquement le **gel d'avoirs** réel. Aligné PRD (exclure CTIF/déclarations de soupçon, pas la discussion AML, qui est le cœur de valeur). Constaté en vrai : le thread « Suivi/Brokercomply x Directfin » passait en EXCLUDED(laundering) à tort → désormais gardé. Trade-off assumé : une délibération « j'ai un doute de blanchiment » sans mention CTIF/déclaration passe maintenant le filtre.
- **Recomposition de thread non matérialisée** : pas de table `threads`, le lien est `conversation_id` (suffisant ; le regroupement se fait à la distillation).

---

## 8. Limites connues / dette à traiter

1. **`email-cleaner` durci sur vrais emails Outlook (2026-06-16).** Les blocs de citation FR (`De:/Envoyé:/À:/Objet:`, `Le … a écrit :`) sont désormais retirés malgré les accents (repli diacritique préservant les index avant matching), ainsi que les disclaimers de confidentialité FR/EN. Vérifié sur la boîte sdv réelle (l'historique cité + PII d'autres clients dans les forwards ne fuit plus). **Résidu faible-risque** : les signatures *sans* délimiteur `--` (nom + titre + tél + n° FSMA + adresse) passent encore — peu gênant pour la distillation. Tests réels ajoutés dans `email-cleaner.test.ts`.
2. **Backfill réel non effectué** : seules les fixtures ont été ingérées/distillées. Le `inspect-graph` a confirmé la connectivité, mais aucune donnée client réelle n'est stockée.
3. **Détection de langue** : heuristique simple (stop-words). La distillation détecte mieux par paire.
4. **2ᵉ boîte officer** (`mvl@…`) non branchée en réel (config prête).
5. **Itération par dossier avec `--limit`** : on vide Inbox avant Sent Items ; un petit `--limit` peut ne ramener que l'Inbox. OK pour backfill complet.

---

## 9. Prochaines étapes

### 0-E — Recherche hybride (`src/retrieval/hybrid-search.ts`) — ✅ FAIT
- `hybridSearch(deps, query, options?)` implémenté :
  - **Sémantique** : `llm.embed([query])` → littéral pgvector `[...]::vector` → cosine (`embedding <=> $1`, similarité = `1 - distance`) → top-K (défaut 10).
  - **Lexical** : `plainto_tsquery('simple', query)` (robuste ponctuation, pas de stemming) → `ts_rank` sur `search_vector` → top-K (défaut 10).
  - **Fusion RRF** k=60 dans `rrf.ts` (fonction **pure**, `score = Σ 1/(k+rank)`), fusion côté TypeScript (choix validé : testable sans DB).
  - Filtres SQL optionnels (`topic`, `language`, `sourceDateFrom`/`sourceDateTo`) appliqués **aux deux** legs.
  - Retour top-N (défaut 5) : `{ unit, score, semantic?, lexical? }` (métadonnées complètes + rangs par leg).
  - Tests : `__tests__/retrieval/rrf.test.ts` (5, sans DB) + `__tests__/retrieval/hybrid-search.test.ts` (8, Postgres Docker).
  - ⚠️ Exporté depuis le barrel mais **pas encore branché en CLI** (commande `ask` → 0-F).

### 0-F — Agent RAG + CLI
- `agent/freshness.ts` : `checkFreshness(unit, thresholdMonths)` (défaut 12) → `{ isFresh, ageMonths, warning }`.
- `agent/divergence.ts` : grouper résultats par similarité de question, flag si auteurs différents.
- `agent/prompts.ts` : système (répondre uniquement sur contexte, citer ID/auteur/date, signaler fraîcheur, présenter LES DEUX réponses divergentes, langue de la question).
- `agent/rag-agent.ts` : `askQuestion(query)` = hybridSearch → freshness → divergence → prompt → LLM → `{ answer, sources, freshnessAlerts, divergences }`.
- `cli/` : `commander` + `chalk` + `ora` ; commandes `ingest`, `distill`, `ask` (REPL/single-shot), `stats`, `validate`. Configurer `bin`.

### 0-G — finalisation
- Commande `validate` : 3-5 questions prédéfinies, run manuel avec vrai LLM, affichage réponse+citations+alertes+divergences.
- Compléter la couverture de tests (objectif 80% sur modules purs).

---

## 10. Mémoire de session

Un mémo persistant existe :
`~/.claude/projects/-Users-hadrienrobert-Desktop-Coding-Project-brokercomply-main/memory/phase0-progress.md`
(statut des phases, boîte Graph validée, écarts clés). Mis à jour à chaque jalon.
