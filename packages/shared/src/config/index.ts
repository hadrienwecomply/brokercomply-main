import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { config as loadEnv } from 'dotenv';
import { z } from 'zod';

/** Walk up from `start` to the filesystem root to find the nearest `.env`. */
function findEnvFile(start: string = process.cwd()): string | undefined {
  let dir = start;
  for (;;) {
    const candidate = resolve(dir, '.env');
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

// Load the monorepo-root .env regardless of which package the process runs from.
loadEnv({ path: findEnvFile() });

const DEFAULT_DATABASE_URL =
  'postgresql://brokercomply:brokercomply@localhost:5432/brokercomply';

/**
 * Environment schema for the whole monorepo.
 *
 * Only `DATABASE_URL` is required for Phase 0 scaffolding (it has a local-dev
 * default so migrations work out of the box). Credentials for Microsoft Graph,
 * the LLM provider and embeddings are optional here and validated lazily by the
 * features that actually need them in later phases.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  DATABASE_URL: z.string().url().default(DEFAULT_DATABASE_URL),

  // Microsoft Graph (app-only) — required by the ingestion phase (0-B).
  AZURE_TENANT_ID: z.string().optional(),
  AZURE_CLIENT_ID: z.string().optional(),
  AZURE_CLIENT_SECRET: z.string().optional(),

  // Safety guard: when set, EVERY outgoing email is redirected to this address
  // instead of the real broker (the original recipients are shown in the body).
  // Outside production this defaults to hr@we-comply.be (see resolveMailRedirect)
  // so we never email a real client before go-live. Set empty in prod.
  MAIL_REDIRECT_TO: z.string().email().optional(),

  // Compliance-officer mailboxes (comma-separated). Drives both the ingestion
  // scope and inbound/outbound direction classification. The real officers are
  // Sacha (sdv@) and Grégory (gr@); an older config mentioned mvl@ — that was a
  // mistake (see doc/CONTEXTE_ET_GUIDELINES.md).
  OFFICER_MAILBOXES: z
    .string()
    .default('sdv@we-comply.be,gr@we-comply.be')
    .transform((s) =>
      s
        .split(',')
        .map((x) => x.trim().toLowerCase())
        .filter(Boolean),
    ),

  // Mail folders to ingest (comma-separated well-known names). Excludes
  // drafts/deleteditems/junkemail by construction.
  INGEST_FOLDERS: z
    .string()
    .default('inbox,sentitems')
    .transform((s) =>
      s
        .split(',')
        .map((x) => x.trim().toLowerCase())
        .filter(Boolean),
    ),

  // SharePoint document sync (broker folders). Reuses the AZURE_* app-only
  // credentials above, plus a per-site `Sites.Selected` write grant. Optional
  // here; validated lazily by the SharePoint client when the feature runs.
  // SHAREPOINT_SITE_ID is the Graph site id, e.g.
  //   "wecomply1.sharepoint.com,<siteGuid>,<webGuid>".
  // SHAREPOINT_ROOT_PATH is the drive-relative folder under which every broker
  // folder lives (no leading/trailing slash).
  SHAREPOINT_SITE_ID: z.string().optional(),
  SHAREPOINT_ROOT_PATH: z
    .string()
    .default('01 - Verticales/01 - Brokercomply/01 - Clients & Prospects/01 - Clients')
    .transform((s) => s.replace(/^\/+|\/+$/g, '')),

  // LLM provider — required by distillation / RAG agent (0-D, 0-F).
  LLM_PROVIDER: z.enum(['anthropic', 'openai']).default('anthropic'),
  LLM_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  LLM_MODEL: z.string().default('claude-sonnet-4-6'),

  // Embeddings always go through OpenAI (Anthropic has no embeddings API).
  EMBEDDING_API_KEY: z.string().optional(),
  EMBEDDING_MODEL: z.string().default('text-embedding-3-small'),

  // Freshness alerting threshold (months) — PRD default is 12.
  FRESHNESS_THRESHOLD_MONTHS: z.coerce.number().int().positive().default(12),

  // Fillout form ingestion (inbound webhook). Both are required for the webhook
  // to accept calls: an unguessable token in the URL path AND a shared-secret
  // header. Optional here so the rest of the app boots without them configured.
  FILLOUT_URL_TOKEN: z.string().optional(),
  FILLOUT_WEBHOOK_SECRET: z.string().optional(),

  // n8n trigger (outbound). Default workflow URL + a shared secret sent as a
  // header so the n8n Webhook node can reject forged triggers. Per-form URLs may
  // override N8N_WEBHOOK_URL via the dashboard form template.
  N8N_WEBHOOK_URL: z.string().url().optional(),
  N8N_WEBHOOK_SECRET: z.string().optional(),

  // n8n result callback (inbound webhook, the mirror of the Fillout one). When a
  // workflow finishes, its final HTTP Request node POSTs the result back to
  // /api/webhooks/n8n/<N8N_CALLBACK_TOKEN> with an X-Callback-Secret header.
  N8N_CALLBACK_TOKEN: z.string().optional(),
  N8N_CALLBACK_SECRET: z.string().optional(),

  // n8n PDF workflow (outbound). The "Générer le PDF" button triggers this
  // workflow with the reviewed edits; it renders the PDF and posts it back via
  // the callback above (kind='pdf'). Shares N8N_WEBHOOK_SECRET as the header.
  N8N_PDF_WEBHOOK_URL: z.string().url().optional(),
  // Notion import (action-plan statuses). The internal-integration token and the
  // two data-source ids of the "Pilotage courtier - Full" databases. Token is
  // optional here and validated lazily by the importer; ids default to the known
  // workspace collections so the script works out of the box.
  NOTION_API_KEY: z.string().optional(),
  NOTION_PLAN_DATA_SOURCE_ID: z.string().default('37aa8d30-4b11-8023-81ee-000b793545cc'),
  NOTION_CLIENTS_DATA_SOURCE_ID: z.string().default('2c4a8d30-4b11-8182-b73c-000b02cfd7e8'),
});

export type Config = z.infer<typeof envSchema>;

let cached: Config | null = null;

/**
 * Parse and validate `process.env`. Throws a readable error listing every
 * invalid field. Result is memoised so repeated calls are cheap.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  if (cached) return cached;
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  cached = parsed.data;
  return cached;
}

/** For tests: drop the memoised config so the next loadConfig re-reads env. */
export function resetConfigCache(): void {
  cached = null;
}

/** Eagerly-validated config for convenient `config.DATABASE_URL` access. */
export const config: Config = loadConfig();
