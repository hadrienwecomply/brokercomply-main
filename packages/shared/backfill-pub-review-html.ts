/**
 * Backfill pub_audits.review_html: re-render the report from the stored
 * findings + image column. Deterministic, no LLM calls. Fixes:
 *  - audits analysed before the "show the creative" feature (no image at all)
 *  - the `.p-ad` class rename (EasyList cosmetic filters hid the creative)
 *
 * Usage: BACKFILL_DATABASE_URL=postgres://... pnpm tsx backfill-pub-review-html.ts
 */
import postgres from 'postgres';
import { renderPubHtml, PubAuditPayloadSchema } from './src/index.js';

const url = process.env.BACKFILL_DATABASE_URL;
if (!url) throw new Error('BACKFILL_DATABASE_URL missing');

const sql = postgres(url, { max: 1, ssl: url.includes('localhost') ? undefined : 'require' });

const rows = await sql`
  SELECT id, file_name, findings, image_base64, image_mime_type
  FROM pub_audits
  WHERE findings IS NOT NULL AND review_html IS NOT NULL
  ORDER BY created_at
`;

let done = 0;
for (const row of rows) {
  try {
    const payload = PubAuditPayloadSchema.parse(row.findings);
    const image = `data:${row.image_mime_type};base64,${row.image_base64}`;
    const html = renderPubHtml({ ...payload, support: { ...payload.support, image } });
    await sql`UPDATE pub_audits SET review_html = ${html}, updated_at = now() WHERE id = ${row.id}`;
    done++;
    console.log(`OK  ${row.id}  ${row.file_name}`);
  } catch (e) {
    console.error(`SKIP ${row.id}  ${row.file_name}: ${e instanceof Error ? e.message.slice(0, 150) : e}`);
  }
}
console.log(`\n${done}/${rows.length} rapports re-rendus.`);
await sql.end();
