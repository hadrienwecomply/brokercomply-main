# Phase 0 — Prototype Local : Plan d'execution

**Statut :** En attente de lancement
**Objectif :** Valider le pipeline complet en local sur un echantillon reduit (fixtures ou boite fondateur).
**Contrainte :** Zero dependance hosting/production. CLI uniquement. Pas de front-end.

---

## Structure cible du repo

```
brokercomply-main/
  package.json                        # pnpm workspace root
  tsconfig.json                       # strict, ESNext, NodeNext
  tsconfig.build.json
  docker-compose.yml                  # Postgres 16 + pgvector
  drizzle.config.ts
  .env.example
  .gitignore

  packages/
    shared/                           # Code partage entre tous les outils
      src/
        db/
          client.ts                   # Drizzle PostgreSQL client
          schema.ts                   # Tables : source_documents, knowledge_units, aml_exclusion_log
          migrations/
        llm/
          client.ts                   # Interface LLMClient + adapters Anthropic/OpenAI
          types.ts
        config/
          index.ts                    # dotenv + zod validation
        types/
          index.ts

  tools/
    kb-compliance/                    # Outil 1 : moteur KB compliance
      src/
        ingestion/
          graph-client.ts
          thread-builder.ts
          email-cleaner.ts
          attachment-parser.ts
          ingest.ts
        aml-filter/
          keywords.ts
          filter.ts
          types.ts
        distillation/
          extractor.ts
          embedder.ts
          distill.ts
        retrieval/
          hybrid-search.ts
        agent/
          rag-agent.ts
          prompts.ts
          freshness.ts
          divergence.ts
        cli/
          index.ts
          commands/
            ingest.ts
            distill.ts
            ask.ts
            stats.ts
            validate.ts
      fixtures/
        sample-threads.json
        expected-qa-pairs.json
      __tests__/
        ingestion/
        aml-filter/
        distillation/
        retrieval/
        agent/
        integration/
```

---

## Taches

### 0-A : Scaffolding

- [ ] **A1** — Init pnpm workspace
  - Creer `package.json` root avec `workspaces: ["packages/*", "tools/*"]`
  - Configurer scripts root : `build`, `test`, `lint`, `db:migrate`, `db:generate`
  - Installer devDependencies root : `typescript`, `vitest`, `eslint`, `prettier`

- [ ] **A2** — Config TypeScript
  - Creer `tsconfig.json` root : `strict: true`, `module: "ESNext"`, `moduleResolution: "NodeNext"`, path aliases `@brokercomply/shared`
  - Creer `tsconfig.build.json` pour la compilation

- [ ] **A3** — Fichiers projet
  - Creer `.gitignore` : node_modules, dist, .env, data/, *.local
  - Creer `.env.example` avec toutes les variables :
    ```
    DATABASE_URL=postgresql://brokercomply:brokercomply@localhost:5432/brokercomply
    AZURE_TENANT_ID=
    AZURE_CLIENT_ID=
    AZURE_CLIENT_SECRET=
    LLM_PROVIDER=anthropic          # anthropic | openai
    LLM_API_KEY=
    LLM_MODEL=claude-sonnet-4-6
    EMBEDDING_API_KEY=               # OpenAI key pour embeddings
    EMBEDDING_MODEL=text-embedding-3-small
    FRESHNESS_THRESHOLD_MONTHS=12
    ```

- [ ] **A4** — Package `@brokercomply/shared`
  - Creer `packages/shared/package.json` (name: `@brokercomply/shared`)
  - Creer `packages/shared/tsconfig.json`
  - Implementer `src/config/index.ts` : chargement env avec `dotenv` + validation `zod`
  - Exporter types partages dans `src/types/index.ts`

- [ ] **A5** — Package `kb-compliance`
  - Creer `tools/kb-compliance/package.json` (dependance sur `@brokercomply/shared`)
  - Creer `tools/kb-compliance/tsconfig.json`
  - Configurer Vitest dans le package

- [ ] **A6** — Docker Compose Postgres + pgvector
  - Creer `docker-compose.yml` : image `pgvector/pgvector:pg16`, port 5432, volume persistent, env vars
  - Verifier `docker compose up -d` demarre correctement

- [ ] **A7** — Schema DB avec Drizzle
  - Installer `drizzle-orm`, `drizzle-kit`, `postgres` (postgres.js driver)
  - Implementer `packages/shared/src/db/schema.ts` :
    - Table `source_documents` :
      - `id` uuid PK
      - `message_id` text UNIQUE
      - `conversation_id` text
      - `subject` text
      - `body_clean` text
      - `attachment_text` text nullable
      - `sender` text
      - `recipients` jsonb
      - `mailbox` text
      - `language` text
      - `received_at` timestamptz
      - `raw_metadata` jsonb
      - `created_at` timestamptz DEFAULT now()
    - Table `knowledge_units` (exactement comme le PRD) :
      - `id` uuid PK
      - `question` text NOT NULL
      - `answer` text NOT NULL
      - `topic` text
      - `regulatory_refs` jsonb
      - `language` text
      - `source_ids` uuid[]
      - `source_date` date
      - `author` text
      - `confidence` real
      - `embedding` vector(1536)
      - `created_at` timestamptz
      - `updated_at` timestamptz
      - Index HNSW sur `embedding` (cosine)
      - Colonne `tsvector` generated stored sur `question || answer`, index GIN
    - Table `aml_exclusion_log` :
      - `id` uuid PK
      - `message_id` text
      - `reason` text
      - `excluded_at` timestamptz DEFAULT now()
  - Implementer `packages/shared/src/db/client.ts` : factory Drizzle avec `DATABASE_URL`
  - Creer `drizzle.config.ts` a la racine

- [ ] **A8** — Verification scaffolding
  - `pnpm install` reussit
  - `pnpm build` compile sans erreurs
  - `docker compose up -d` + `pnpm db:migrate` cree les tables
  - Verifier les tables et index existent via `psql`

---

### 0-B : Pipeline d'ingestion email

- [ ] **B1** — Microsoft Graph client
  - Fichier : `tools/kb-compliance/src/ingestion/graph-client.ts`
  - Installer `@microsoft/microsoft-graph-client`, `@azure/identity`
  - Implementer `GraphEmailClient` :
    - Auth via `ClientSecretCredential` (app-only, `Mail.Read`)
    - `listMessages(mailboxId, options)` : pagination `@odata.nextLink`, `$top`, `$filter` par date, `$select`, `$expand` attachments
    - `getMessage(mailboxId, messageId)`
    - `getAttachmentContent(mailboxId, messageId, attachmentId)`
    - Rate-limit handling : exponential backoff avec jitter
  - Definir interface `EmailSource` (adapter pattern) pour permettre le mode fixture

- [ ] **B2** — Thread builder
  - Fichier : `tools/kb-compliance/src/ingestion/thread-builder.ts`
  - Grouper messages par `conversationId`
  - Trier par `receivedDateTime` dans chaque thread
  - Fallback sur sujet quand `conversationId` absent : strip `Re:`, `Fw:`, `AW:`, `TR:`, `Antw:` puis matching exact
  - Type de sortie : `Thread { id, subject, messages: Message[], participants }`

- [ ] **B3** — Email cleaner
  - Fichier : `tools/kb-compliance/src/ingestion/email-cleaner.ts`
  - Strip signatures : detecter `--`, `___`, `Sent from`, `Cordialement`, `Met vriendelijke groeten`, `Kind regards`, etc.
  - Supprimer blocs de citation : lignes `>`, `-----Original Message-----`, `Van:`, `De:`, `From:`
  - HTML vers texte brut (utiliser `html-to-text`)
  - Normaliser whitespace
  - Fonction pure, facilement testable

- [ ] **B4** — Attachment parser
  - Fichier : `tools/kb-compliance/src/ingestion/attachment-parser.ts`
  - Installer `pdf-parse`, `mammoth`
  - Extraire texte des PDF et DOCX
  - Ignorer types non-texte (images, zip, etc.)
  - Limite de taille : skip > 10MB
  - Retourner texte extrait ou null

- [ ] **B5** — Fixtures synthethiques
  - Fichier : `tools/kb-compliance/fixtures/sample-threads.json`
  - Creer 5-10 threads realistes couvrant :
    - Question fit & proper
    - Question IDD distribution
    - Question obligations EGR
    - Question mystery shopping
    - Question AML generale (non-CTIF, doit passer le filtre)
    - 1 thread CTIF/SAR (doit etre exclu par le filtre AML)
    - 1 thread avec piece jointe PDF simulee
    - 1 thread multilingue (FR + NL dans le meme thread)
    - 1 thread avec reponses divergentes entre 2 officers
  - Implementer `FixtureAdapter` compatible avec l'interface `EmailSource`

- [ ] **B6** — Orchestrateur d'ingestion
  - Fichier : `tools/kb-compliance/src/ingestion/ingest.ts`
  - Orchestrer : fetch → group threads → clean → parse attachments → AML filter → store
  - Options : `--mailbox`, `--since`, `--until`, `--limit`, `--fixture`
  - Idempotent : upsert sur `message_id`
  - Loguer progression (nombre de threads traites, exclus, stockes)

---

### 0-C : Filtre AML conservateur

- [ ] **C1** — Liste de keywords AML
  - Fichier : `tools/kb-compliance/src/aml-filter/keywords.ts`
  - Listes multilingues (FR/NL/EN) par categorie :
    - CTIF/CFI : `CTIF`, `CFI`, `Cellule de Traitement`, `cel voor financiele informatieverwerking`
    - Declarations : `declaration de soupcon`, `melding van vermoeden`, `suspicious transaction report`, `SAR`, `STR`
    - Blanchiment : `signalement`, `aangifte witwassen`, `blanchiment`
    - Sanctions : `gel des avoirs`, `bevriezing van tegoeden`, `liste des sanctions`
  - Arrays freeze, export en const

- [ ] **C2** — Logique de filtrage
  - Fichier : `tools/kb-compliance/src/aml-filter/filter.ts`
  - `filterThread(thread): FilterResult { excluded, reasons, matchedKeywords }`
  - Scanner : sujet + tous les body + texte des PJ
  - Biais conservateur : ANY match → exclure le thread ENTIER
  - Case-insensitive matching
  - Logger dans `aml_exclusion_log` (message_id + reason, JAMAIS de contenu)

---

### 0-D : Distillation Q/R + Embeddings

- [ ] **D1** — Abstraction LLM client
  - Fichier : `packages/shared/src/llm/client.ts` + `types.ts`
  - Interface `LLMClient` : `chat(messages, options): Promise<string>`, `embed(texts): Promise<number[][]>`
  - Adapter `AnthropicAdapter` : `@anthropic-ai/sdk`
  - Adapter `OpenAIAdapter` : `openai` SDK
  - Embeddings toujours via OpenAI `text-embedding-3-small` (1536d) — Anthropic n'offre pas d'API embeddings
  - Gestion rate-limit + retry
  - Factory function basee sur config (`LLM_PROVIDER`)

- [ ] **D2** — Extracteur Q/R
  - Fichier : `tools/kb-compliance/src/distillation/extractor.ts`
  - Prompt structure pour extraction JSON array de paires Q/R
  - Chaque paire contient :
    - `question` : formulation canonique
    - `answer` : reponse synthetisee
    - `topic` : vocabulaire controle (AMLR, fit_and_proper, IDD, EGR, mystery_shopping, general_compliance, other)
    - `regulatory_refs` : array de refs reglementaires citees
    - `language` : langue detectee
    - `confidence` : 0-1 auto-evaluee par le LLM
    - `author` : officer qui a repondu (pas qui a pose la question)
  - Instructions prompt :
    - Extraire TOUTES les paires Q/R distinctes d'un thread
    - Preserver la langue originale de la reponse
    - NE PAS fusionner les reponses divergentes — les garder separees
    - Attribuer l'auteur correctement
  - Inclure 2-3 few-shot examples dans le prompt
  - Validation output avec Zod
  - Retry (max 2) si output malformed

- [ ] **D3** — Generateur d'embeddings
  - Fichier : `tools/kb-compliance/src/distillation/embedder.ts`
  - Embed le champ `question` de chaque paire Q/R
  - Batch requests (jusqu'a 100 textes par appel OpenAI)
  - Retourner `number[]` (1536 dimensions)

- [ ] **D4** — Orchestrateur de distillation
  - Fichier : `tools/kb-compliance/src/distillation/distill.ts`
  - Pour chaque `source_document` non encore distille :
    1. Extraire paires Q/R (D2)
    2. Generer embeddings (D3)
    3. Inserer dans `knowledge_units` avec `source_ids` pointant vers la couche 1
  - Options : `--limit`, `--source-id`, `--force` (re-distiller meme si deja fait)
  - Idempotent (verifier `knowledge_units` existants pour un source_id)
  - Loguer : nombre de Q/R extraites, tokens consommes

---

### 0-E : Recherche hybride

- [ ] **E1** — Recherche hybride
  - Fichier : `tools/kb-compliance/src/retrieval/hybrid-search.ts`
  - `hybridSearch(query, options?): Promise<SearchResult[]>`
  - **Chemin semantique** : embed la query → cosine similarity pgvector (`<=>`) → top-K (defaut 10)
  - **Chemin lexical** : query → `to_tsquery('simple', ...)` → `ts_rank` sur colonne tsvector → top-K
  - **Fusion** : Reciprocal Rank Fusion (RRF) avec k=60
    - `score = sum(1 / (k + rank))` pour chaque resultat dans les deux listes
  - **Filtres SQL** optionnels : `topic`, `language`, plage `source_date`
  - Retourner top-N (defaut 5) avec scores + metadata completes
  - Config tsvector `simple` pour support multilingue sans stemming

---

### 0-F : Agent RAG (CLI)

- [ ] **F1** — Logique de fraicheur
  - Fichier : `tools/kb-compliance/src/agent/freshness.ts`
  - `checkFreshness(unit, thresholdMonths): FreshnessStatus`
  - Comparer `source_date` vs date courante
  - Retourner `{ isFresh, ageMonths, warning? }`
  - Seuil par defaut depuis config (12 mois)

- [ ] **F2** — Detection de divergences
  - Fichier : `tools/kb-compliance/src/agent/divergence.ts`
  - Parmi les knowledge_units recuperes pour une meme question :
    - Grouper par similarite semantique de la question
    - Comparer les champs `author`
    - Si auteurs differents pour questions tres similaires → flag divergence
  - Retourner `{ hasDivergence, entries: DivergentEntry[] }`

- [ ] **F3** — Templates de prompts
  - Fichier : `tools/kb-compliance/src/agent/prompts.ts`
  - System prompt :
    - Repondre UNIQUEMENT sur base du contexte fourni (pas d'hallucination)
    - Citer chaque source par ID, auteur et date
    - Signaler les sources au-dela du seuil de fraicheur
    - Si reponses divergentes entre officers : presenter LES DEUX avec attribution et noter explicitement la divergence
    - Repondre dans la langue de la question
    - Si aucun contexte pertinent : le dire explicitement
  - User prompt template : injecter contexte recupere + question

- [ ] **F4** — Orchestrateur RAG agent
  - Fichier : `tools/kb-compliance/src/agent/rag-agent.ts`
  - `askQuestion(query): Promise<AgentResponse>`
  - Pipeline :
    1. `hybridSearch(query)` → top-N knowledge units
    2. `checkFreshness()` sur chaque resultat
    3. Detection divergences
    4. Build prompt LLM (system + contexte + question)
    5. Appel LLM
    6. Retourner `{ answer, sources: SourceCitation[], freshnessAlerts, divergences }`

- [ ] **F5** — CLI entry point et commandes
  - Fichier : `tools/kb-compliance/src/cli/index.ts` + `commands/*.ts`
  - Installer `commander`, `chalk`, `ora`
  - Commandes :
    - `ingest` : lancer le pipeline d'ingestion (`--mailbox`, `--since`, `--until`, `--limit`, `--fixture`)
    - `distill` : lancer la distillation (`--limit`, `--source-id`, `--force`)
    - `ask` : mode REPL interactif ou single-shot (`--query "..."`)
    - `stats` : stats KB (total sources, total KU, par topic, par auteur, distribution fraicheur)
    - `validate` : lancer questions predefinies et afficher les reponses completes pour revue humaine
  - Configurer `bin` dans package.json

---

### 0-G : Tests et validation

- [ ] **G1** — Tests unitaires
  - `__tests__/ingestion/email-cleaner.test.ts` : strip signatures, quotes, HTML→texte
  - `__tests__/ingestion/thread-builder.test.ts` : groupement, tri, fallback sujet
  - `__tests__/ingestion/attachment-parser.test.ts` : extraction PDF, DOCX
  - `__tests__/aml-filter/filter.test.ts` : keyword matching, exclusion thread, edge cases (partiel, casse)
  - `__tests__/agent/freshness.test.ts` : calcul age, comparaison seuil
  - `__tests__/agent/divergence.test.ts` : detection multi-auteur
  - Objectif : 80%+ coverage sur les modules de logique pure

- [ ] **G2** — Test d'integration pipeline complet
  - `__tests__/integration/pipeline.test.ts`
  - End-to-end sur fixtures + LLM mocke :
    - Thread AML exclu
    - Q/R correctement extraites et stockees
    - Recherche hybride retourne resultats pertinents
    - Alertes fraicheur sur entrees anciennes
    - Divergences detectees
  - Necessite Docker Postgres running

- [ ] **G3** — Commande `validate` pour revue humaine
  - 3-5 questions predefinies couvrant les cas d'usage
  - Affichage complet : reponse + citations + alertes + divergences
  - Prevu pour un run manuel avec LLM reel (pas de mock)

---

## Dependances

| Package | Usage |
|---------|-------|
| `typescript` ~5.5 | Langage |
| `vitest` ~3.x | Tests |
| `drizzle-orm` ~0.39 + `drizzle-kit` ~0.30 | ORM + migrations |
| `postgres` ~3.x | Driver Postgres (postgres.js) |
| `@anthropic-ai/sdk` ~0.39 | API Claude |
| `openai` ~4.x | API OpenAI (embeddings + optionnel chat) |
| `@microsoft/microsoft-graph-client` ~3.x | API Graph |
| `@azure/identity` ~4.x | Auth Azure AD |
| `html-to-text` | Conversion HTML |
| `pdf-parse` ~1.x | Extraction PDF |
| `mammoth` ~1.x | Extraction DOCX |
| `commander` ~12.x | CLI |
| `chalk` ~5.x | Formatage CLI |
| `ora` ~8.x | Spinners CLI |
| `zod` ~3.x | Validation schemas |
| `dotenv` ~16.x | Env vars |
| Docker: `pgvector/pgvector:pg16` | DB locale |

---

## Graphe de dependances entre taches

```
A1-A3 (parallel) ──→ A4 ──→ A5 ──→ A7 ──→ A8
A6 (parallel) ─────────────────────→ A7

B1 ──→ B2 ──→ B6
B3 (parallel avec B1-B2)
B4 (parallel avec B1-B2)
B5 (parallel, depend de B1 interface)

C1 ──→ C2 (parallel avec Phase B apres A7)

D1 ──→ D2 ──→ D4
D1 ──→ D3 (parallel avec D2)

E1 (depend de D3 pour query embedding + A7 pour tsvector index)

F1, F2, F3 (parallel, pas de dependances)
F4 (depend de E1, F1, F2, F3)
F5 (depend de B6, D4, F4)

G1 (en continu pendant le dev)
G2 (depend de tout le pipeline)
G3 (depend de F5)
```

---

## Criteres de succes

- [ ] `docker compose up` → Postgres + pgvector OK, migrations creent les 3 tables + indexes
- [ ] `cli ingest --fixture` → threads charges, thread AML exclu et logue
- [ ] `cli distill` → paires Q/R extraites avec embeddings dans `knowledge_units`
- [ ] `cli ask --query "..."` → reponse synthetisee avec citations, auteurs, dates
- [ ] Alerte fraicheur sur sources > 12 mois
- [ ] Divergences entre officers signalees explicitement
- [ ] `cli stats` → compteurs par topic, auteur, fraicheur
- [ ] Tests unitaires passent avec 80%+ coverage sur modules purs
- [ ] Test integration E2E sur fixtures OK

---

## Hors perimetre Phase 0

- Hosting / deploiement cloud
- Front-end / Web UI / HTTP API
- Auth / SSO
- Delta sync quotidien (batch only)
- Regle AML definitive (garde-fou de base uniquement)
- Audit logging des requetes
- Deduplication des knowledge units
- Optimisation performance / caching
- Documentation DPA / conformite legale
