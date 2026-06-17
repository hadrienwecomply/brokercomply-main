import { parseArgs } from 'node:util';
import { config } from '@brokercomply/shared';
import { GraphEmailClient } from '../src/ingestion/graph-client.js';
import { cleanEmailBody } from '../src/ingestion/email-cleaner.js';
import { parseAttachment } from '../src/ingestion/attachment-parser.js';
import { filterThread } from '../src/aml-filter/filter.js';
import { buildThreads } from '../src/ingestion/thread-builder.js';

/**
 * Read-only Microsoft Graph inspector. Prints, for each fetched email, the raw
 * received body, the cleaned body the pipeline would keep, parsed attachment
 * text, and whether the AML filter would exclude it. Stores nothing.
 *
 * Usage:
 *   tsx scripts/inspect-graph.ts
 *   tsx scripts/inspect-graph.ts --mailbox sdv@we-comply.be --limit 10 --since 2026-06-01
 *   tsx scripts/inspect-graph.ts --full          # don't truncate bodies
 *   tsx scripts/inspect-graph.ts --attachments   # also extract attachment text
 */
function truncate(text: string, full: boolean, max = 1000): string {
  if (full || text.length <= max) return text;
  return `${text.slice(0, max)}\n… [${text.length - max} more chars — use --full]`;
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    allowPositionals: true,
    options: {
      mailbox: { type: 'string', default: 'sdv@we-comply.be' },
      limit: { type: 'string', default: '5' },
      since: { type: 'string' },
      until: { type: 'string' },
      full: { type: 'boolean', default: false },
      attachments: { type: 'boolean', default: false },
    },
  });

  if (!config.AZURE_TENANT_ID || !config.AZURE_CLIENT_ID || !config.AZURE_CLIENT_SECRET) {
    throw new Error('Missing AZURE_TENANT_ID / AZURE_CLIENT_ID / AZURE_CLIENT_SECRET in .env');
  }

  const mailbox = values.mailbox!;
  const client = new GraphEmailClient({
    tenantId: config.AZURE_TENANT_ID,
    clientId: config.AZURE_CLIENT_ID,
    clientSecret: config.AZURE_CLIENT_SECRET,
    folders: config.INGEST_FOLDERS,
    officers: config.OFFICER_MAILBOXES,
  });

  console.log(`Reading up to ${values.limit} message(s) from ${mailbox} (read-only)…\n`);
  const messages = await client.listMessages(mailbox, {
    limit: Number(values.limit),
    since: values.since ? new Date(values.since) : undefined,
    until: values.until ? new Date(values.until) : undefined,
  });

  for (const [i, m] of messages.entries()) {
    console.log('═'.repeat(80));
    console.log(`#${i + 1}  ${m.receivedDateTime}  [${m.direction ?? '?'} · ${m.folder ?? '?'}]`);
    console.log(`From:    ${m.from}`);
    console.log(`To:      ${m.to.join(', ')}${m.cc.length ? `   Cc: ${m.cc.join(', ')}` : ''}`);
    console.log(`Subject: ${m.subject}`);
    console.log(`Ids:     internet=${m.internetMessageId}  conversation=${m.conversationId ?? '—'}`);
    console.log(`Body:    contentType=${m.bodyContentType}  rawLength=${m.bodyContent.length}`);

    console.log('\n── RAW BODY (as received) ──');
    console.log(truncate(m.bodyContent, values.full ?? false));

    console.log('\n── CLEANED BODY (what the pipeline keeps) ──');
    console.log(truncate(cleanEmailBody(m.bodyContent, m.bodyContentType), values.full ?? false));

    if (m.hasAttachments && m.attachments.length) {
      console.log('\n── ATTACHMENTS ──');
      for (const a of m.attachments) {
        console.log(`  • ${a.name} (${a.contentType}, ${a.size} bytes)`);
        if (values.attachments) {
          const content = await client.getAttachmentContent(mailbox, m.id, a.id);
          const text = content ? await parseAttachment(content) : null;
          console.log(text ? truncate(`    text: ${text}`, values.full ?? false, 500) : '    (no extractable text)');
        }
      }
    }
    console.log('');
  }

  // Thread-level AML preview so you can see what would be excluded.
  console.log('═'.repeat(80));
  console.log('AML FILTER PREVIEW (thread level)\n');
  for (const thread of buildThreads(messages)) {
    const result = filterThread(thread);
    const tag = result.excluded ? `EXCLUDED (${result.categories.join(', ')})` : 'kept';
    console.log(`  [${tag}] ${thread.subject}  (${thread.messages.length} msg)`);
  }
}

main().catch((error) => {
  console.error('Failed:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
