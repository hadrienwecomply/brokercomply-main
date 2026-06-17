import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

const DATABASE_URL =
  process.env.DATABASE_URL ??
  'postgresql://brokercomply:brokercomply@localhost:5432/brokercomply';

export default defineConfig({
  dialect: 'postgresql',
  schema: './packages/shared/src/db/schema.ts',
  out: './packages/shared/src/db/migrations',
  dbCredentials: {
    url: DATABASE_URL,
  },
  strict: true,
  verbose: true,
});
