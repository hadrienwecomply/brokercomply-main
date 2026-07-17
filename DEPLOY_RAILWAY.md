# Déploiement Railway — brokercomply.be

Déploiement de la stack complète sur **Railway** (région **EU / Amsterdam**), sous le
domaine **brokercomply.be** (DNS chez **OVH**).

## Architecture

| Service | Source | Exposition | Domaine |
|---|---|---|---|
| `dashboard` | Docker `apps/dashboard/Dockerfile` | public | `app.brokercomply.be` |
| `n8n` | image `n8nio/n8n` + volume `/home/node/.n8n` | public | `n8n.brokercomply.be` |
| `gotenberg` | image `gotenberg/gotenberg:8` | **interne** | `gotenberg.railway.internal:3000` |
| `postgres` | pgvector + volume | **interne** | `postgres.railway.internal` |

- Un seul projet Railway `brokercomply`, environnement **production** uniquement.
- 2 bases logiques dans la **même** instance Postgres : `railway` (dashboard) + `n8n`.
- Services reliés par le **réseau privé** `*.railway.internal` (Gotenberg et Postgres
  ne sont jamais exposés publiquement).

## Pré-requis

```bash
npm i -g @railway/cli                 # CLI (déjà installée)
# Token de COMPTE, présent dans .env sous RAILWAY_TOKEN (à passer en RAILWAY_API_TOKEN) :
export RAILWAY_API_TOKEN=$(grep -E '^RAILWAY_TOKEN=' .env | cut -d= -f2-)
railway whoami                        # => hr@we-comply.be
railway link --project brokercomply   # lier le dossier au projet
```

> ⚠️ Toutes les commandes `railway` ci-dessous supposent `RAILWAY_API_TOKEN` exporté.

---

## Phase 1 — Postgres (pgvector)

```bash
railway add --database postgres                      # crée le service Postgres
# Région EU + volume : à fixer dans l'UI (Service → Settings → Region = europe-west4)
railway connect postgres                             # psql
#   CREATE EXTENSION IF NOT EXISTS vector;
#   CREATE DATABASE n8n;                              -- base dédiée n8n
```

Migrations Drizzle + seed (avec l'env du service injecté) :

```bash
railway run --service dashboard pnpm db:migrate      # applique packages/shared/.../migrations
railway run --service dashboard pnpm tsx <seed>      # seed minimal (brokers, template plan)
```

## Phase 2 — Dashboard (Next.js + Chromium)

```bash
railway add --service dashboard
railway variables --service dashboard \
  --set 'RAILWAY_DOCKERFILE_PATH=apps/dashboard/Dockerfile' \
  --set 'DATABASE_URL=${{Postgres.DATABASE_URL}}' \
  --set 'NODE_ENV=production'
# + tous les secrets (cf. « Variables » plus bas)
railway up --service dashboard                       # build Docker + deploy
railway domain --service dashboard                   # domaine .up.railway.app
# puis ajouter le domaine custom app.brokercomply.be (UI ou API)
```

Le `Dockerfile` a été **validé en local** (`docker build` + boot smoke-test : serveur
`Ready`, écoute `$PORT`). Il build `@brokercomply/shared`, fait `next build`, installe
Chromium (`playwright install --with-deps chromium`).

## Phase 3 — n8n

```bash
railway add --service n8n --image n8nio/n8n
railway volume add --service n8n --mount-path /home/node/.n8n   # persistance
railway variables --service n8n \
  --set 'DB_TYPE=postgresdb' \
  --set 'DB_POSTGRESDB_HOST=postgres.railway.internal' \
  --set 'DB_POSTGRESDB_DATABASE=n8n' \
  --set 'DB_POSTGRESDB_USER=${{Postgres.PGUSER}}' \
  --set 'DB_POSTGRESDB_PASSWORD=${{Postgres.PGPASSWORD}}' \
  --set 'N8N_ENCRYPTION_KEY=<GÉNÉRÉ UNE FOIS, NE JAMAIS CHANGER>' \
  --set 'WEBHOOK_URL=https://n8n.brokercomply.be/' \
  --set 'N8N_HOST=n8n.brokercomply.be' \
  --set 'N8N_PROTOCOL=https' \
  --set 'N8N_BASIC_AUTH_ACTIVE=true' \
  --set 'N8N_BASIC_AUTH_USER=<user>' \
  --set 'N8N_BASIC_AUTH_PASSWORD=<pass>'
railway domain --service n8n     # + domaine custom n8n.brokercomply.be
```

Puis **importer les workflows** brokercomply (fichiers `.json` de
`~/Desktop/Coding_Project/n8n-automations/workflows`) via l'UI n8n ou l'API, et
reconfigurer les credentials (Anthropic, Fillout, callbacks).

## Phase 4 — Gotenberg (rendu PDF, interne)

```bash
railway add --service gotenberg --image gotenberg/gotenberg:8
# PAS de domaine public. Joignable en interne : http://gotenberg.railway.internal:3000
```

Les nodes HTTP « Gotenberg » des workflows PDF (`rapport-pub`, `audit-site-web`,
`brokercomply-rapport`) ne codent **plus** l'URL en dur. Ils utilisent une expression
pilotée par variable d'environnement (fallback dev sur `localhost:3001`) :

```
={{ $env.GOTENBERG_URL || 'http://127.0.0.1:3001' }}/forms/chromium/convert/html
```

Pré-requis côté service `n8n` (sinon l'expression échoue avec `access to env vars denied`
ou tombe sur `localhost:3001` injoignable en prod → *« The service refused the connection »*) :

```bash
railway variables --service n8n --set 'GOTENBERG_URL=http://gotenberg.railway.internal:3000'
railway variables --service n8n --set 'N8N_BLOCK_ENV_ACCESS_IN_NODE=false'  # requis pour lire $env
```

> ⚠️ En **dev local**, le n8n doit aussi avoir `N8N_BLOCK_ENV_ACCESS_IN_NODE=false` pour que
> le fallback `localhost:3001` soit évalué (l'accès `$env` est bloqué par défaut). Sinon
> définir `GOTENBERG_URL` localement, ou l'accès `$env` lève une erreur avant le fallback.

Chaque node PDF porte aussi un `timeout` de 120 s. On conserve les marges + `@page{size:A4}`
→ **rendu identique à aujourd'hui**.

## Phase 5 — Domaine & DNS (OVH)

1. Sur chaque service (dashboard, n8n) : ajouter le domaine custom → Railway fournit
   une **cible CNAME** `xxx.up.railway.app` + SSL auto.
2. Chez OVH (zone `brokercomply.be`) :
   - `CNAME  app   → <cible-railway-dashboard>`
   - `CNAME  n8n   → <cible-railway-n8n>`
   - **Apex** `brokercomply.be` : **redirection 301 → https://app.brokercomply.be**
     (OVH ne gère pas de CNAME à l'apex).

## Phase 6 — Go-live

- **Backups Postgres** (⚠️ NON managé par Railway — BLOQUANT compliance) : planifier un
  `pg_dump` vers un stockage objet, ou activer les snapshots de volume.
- Smoke tests bout-en-bout : `/faq` (RAG), audit site (Playwright), Fillout → n8n →
  callback → PDF Gotenberg, envoi email.
- **Puis seulement** : vider `MAIL_REDIRECT_TO` pour l'envoi réel des emails.

---

## Variables du dashboard (depuis `.env` racine)

À définir sur le service `dashboard` (`railway variables --service dashboard --set ...`) :

```
DATABASE_URL=${{Postgres.DATABASE_URL}}
AZURE_TENANT_ID= / AZURE_CLIENT_ID= / AZURE_CLIENT_SECRET=
LLM_PROVIDER=anthropic  LLM_API_KEY=  LLM_MODEL=claude-sonnet-4-6
EMBEDDING_API_KEY=  EMBEDDING_MODEL=text-embedding-3-small
SHAREPOINT_SITE_ID=  SHAREPOINT_ROOT_PATH=...
FILLOUT_URL_TOKEN=  FILLOUT_WEBHOOK_SECRET=
N8N_WEBHOOK_URL=https://n8n.brokercomply.be/webhook/brokercomply
N8N_WEBHOOK_SECRET=  N8N_CALLBACK_TOKEN=  N8N_CALLBACK_SECRET=
N8N_PDF_WEBHOOK_URL=https://n8n.brokercomply.be/webhook/rapport-review
N8N_RAPPORT_WEBHOOK_URL=https://n8n.brokercomply.be/webhook/rapport-reco
N8N_PUB_RAPPORT_WEBHOOK_URL=https://n8n.brokercomply.be/webhook/rapport-pub
FRESHNESS_THRESHOLD_MONTHS=12
MAIL_REDIRECT_TO=hr@we-comply.be   # vider au go-live
# + auth basique devant le dashboard (app « réseau privé » exposée sur Internet)
```

> Les noms exacts des sous-commandes CLI (`railway add`, `volume add`, `domain`) peuvent
> varier selon la version ; l'UID Railway (dashboard web) reste l'équivalent fiable.
