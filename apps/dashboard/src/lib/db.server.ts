import "server-only";
import { createDb, type Db } from "@brokercomply/shared";

// Cache the connection on globalThis so Next.js HMR in dev doesn't open a new
// postgres.js pool on every module reload.
const globalForDb = globalThis as unknown as { __bcDb?: ReturnType<typeof createDb> };

export function getDb(): Db {
  if (!globalForDb.__bcDb) globalForDb.__bcDb = createDb();
  return globalForDb.__bcDb.db;
}
