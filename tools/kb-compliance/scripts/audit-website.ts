import { writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import {
  createLLMClient,
  runWebsiteAudit,
  AuditPayloadSchema,
  type AuditProgressEvent,
} from '@brokercomply/shared'; // also loads the root .env into process.env

/**
 * Run a website compliance audit from the command line — the validation
 * harness for the audit agent before it is wired into the dashboard.
 *
 * Usage:
 *   pnpm --filter @brokercomply/kb-compliance audit:website -- \
 *     --url https://www.courtier.be --name "Courtier SRL" \
 *     [--bce 0123.456.789] [--fsma "courtier en crédit hypothécaire et assurances"] \
 *     [--pages url1,url2] [--max-pages 10] [--no-visual] [--out audit.json]
 *
 * Visual checks need the chromium binary once: pnpm exec playwright install chromium
 */

const { values } = parseArgs({
  // Tolerate the `--` separator that `pnpm run` forwards verbatim.
  allowPositionals: true,
  options: {
    url: { type: 'string' },
    name: { type: 'string' },
    bce: { type: 'string' },
    fsma: { type: 'string' },
    pages: { type: 'string' },
    'max-pages': { type: 'string' },
    'no-visual': { type: 'boolean', default: false },
    out: { type: 'string' },
  },
});

if (!values.url || !values.name) {
  console.error('Usage: audit-website --url <https://…> --name "<dénomination>" [--bce …] [--fsma "…"] [--out audit.json]');
  process.exit(1);
}

function onProgress(event: AuditProgressEvent): void {
  switch (event.kind) {
    case 'scrape:done':
      console.log(`📄 Scrape terminé : ${event.pages} page(s), ${event.failed} échec(s)`);
      break;
    case 'visual:done':
      console.log(
        event.available
          ? `👁  Mesures visuelles : ${event.measured} page(s)`
          : '👁  Mesures visuelles indisponibles (playwright/chromium manquant) — checks [VISUEL] → "à vérifier"',
      );
      break;
    case 'point:done':
      console.log(`  ✓ ${event.pointId}${event.applicable ? '' : ' (sans objet)'}`);
      break;
    case 'point:error':
      console.log(`  ✗ ${event.pointId} : ${event.error}`);
      break;
  }
}

const llm = createLLMClient();
const started = Date.now();

const result = await runWebsiteAudit(llm, {
  url: values.url,
  entity: { name: values.name, bce: values.bce, fsmaStatus: values.fsma },
  extraUrls: values.pages ? values.pages.split(',').map((s) => s.trim()) : undefined,
  maxPages: values['max-pages'] ? Number(values['max-pages']) : undefined,
  visual: !values['no-visual'],
  onProgress,
});

AuditPayloadSchema.parse(result.payload); // fail loudly if the contract drifts

const { summary } = result.payload;
console.log('');
console.log(`⏱  ${Math.round((Date.now() - started) / 1000)}s`);
console.log(
  `📊 Critiques: ${summary?.critiques ?? 0} | Améliorations: ${summary?.ameliorations ?? 0} | Conformes: ${summary?.conformes ?? 0} | À vérifier: ${summary?.aVerifier ?? 0}`,
);
for (const f of result.payload.findings) {
  if (f.level === 'critique' || f.level === 'amelioration') {
    console.log(`  [${f.level.toUpperCase()}] ${f.id} — ${f.title}`);
  }
}
if (result.errors.length > 0) {
  console.log(`⚠️  Points en erreur (rendus "à vérifier") : ${result.errors.map((e) => e.pointId).join(', ')}`);
}

const outPath =
  values.out ?? `audit-${new URL(values.url).hostname.replace(/^www\./, '')}-${new Date().toISOString().slice(0, 10)}.json`;
writeFileSync(outPath, JSON.stringify(result.payload, null, 2), 'utf8');
console.log(`💾 Payload écrit : ${outPath}`);
