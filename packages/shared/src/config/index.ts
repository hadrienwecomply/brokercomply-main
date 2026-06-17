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

  // Compliance-officer mailboxes (comma-separated). Drives both the ingestion
  // scope and inbound/outbound direction classification.
  OFFICER_MAILBOXES: z
    .string()
    .default('sdv@we-comply.be,mvl@we-comply.be')
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
