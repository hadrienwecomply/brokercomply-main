import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { config } from '../config/index.js';
import * as schema from './schema.js';

export type Schema = typeof schema;

/**
 * Create a Drizzle client bound to the given connection string (defaults to
 * `DATABASE_URL`). Returns both the Drizzle instance and the underlying
 * postgres.js client so callers can `await client.end()` on shutdown.
 */
export function createDb(connectionString: string = config.DATABASE_URL) {
  const client = postgres(connectionString, { max: 10 });
  const db = drizzle(client, { schema });
  return { db, client };
}

export type Db = ReturnType<typeof createDb>['db'];
