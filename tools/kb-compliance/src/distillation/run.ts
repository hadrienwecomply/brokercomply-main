import { parseArgs } from 'node:util';
import { createDb, createLLMClient } from '@brokercomply/shared';
import { runDistill } from './distill.js';

/**
 * Runnable entry for the distillation pipeline (precursor to the 0-F CLI).
 *
 *   tsx src/distillation/run.ts
 *   tsx src/distillation/run.ts --limit 5
 *   tsx src/distillation/run.ts --conversation-id <id> --force
 */
async function main(): Promise<void> {
  const { values } = parseArgs({
    allowPositionals: true,
    options: {
      limit: { type: 'string' },
      'conversation-id': { type: 'string' },
      force: { type: 'boolean', default: false },
    },
  });

  const { db, client } = createDb();
  const llm = createLLMClient();
  try {
    const stats = await runDistill(
      { db, llm, log: (m) => console.log(`[distill] ${m}`) },
      {
        limit: values.limit ? Number(values.limit) : undefined,
        conversationId: values['conversation-id'],
        force: values.force === true,
      },
    );
    console.log('\nResult:', JSON.stringify(stats, null, 2));
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error('[distill] failed:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
