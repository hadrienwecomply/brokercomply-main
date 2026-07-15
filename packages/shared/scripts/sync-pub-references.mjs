#!/usr/bin/env node
/**
 * Regenerate packages/shared/src/pub-audit/data/references.json from the
 * `check-conformite-pub-courtier` skill's `references/*.md`. Each markdown file
 * becomes one JSON entry keyed by its basename (e.g. `regles-generales.md` →
 * `"regles-generales"`), matching the keys `prompts.ts` reads.
 *
 * Run from the repo root: `node packages/shared/scripts/sync-pub-references.mjs`
 * This replaces the previous hand-copy step so the referential never drifts.
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../..');
const refsDir = join(repoRoot, 'check-conformite-pub-courtier', 'references');
const outFile = join(here, '..', 'src', 'pub-audit', 'data', 'references.json');

const files = readdirSync(refsDir).filter((f) => f.endsWith('.md'));
if (files.length === 0) {
  console.error(`No .md reference files found in ${refsDir}`);
  process.exit(1);
}

const out = {};
for (const file of files.sort()) {
  const key = file.replace(/\.md$/, '');
  out[key] = readFileSync(join(refsDir, file), 'utf8').trim();
}

writeFileSync(outFile, JSON.stringify(out, null, 0) + '\n');
console.log(`Wrote ${files.length} references (${Object.keys(out).join(', ')}) → ${outFile}`);
