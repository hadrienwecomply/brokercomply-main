import RECO_MATRIX_JSON from './data/recommandations.json' with { type: 'json' };
import type { LLMClient } from '../llm/types.js';
import { AUDIT_CATALOG, type CatalogPoint } from './catalog.js';
import { assemblePayload } from './assemble.js';
import { buildPointPrompt, CHECKER_SYSTEM_PROMPT, type CheckerContext } from './prompts.js';
import { scrapeSite, JS_RENDER_SUSPECT_CHARS, type ScrapeOptions } from './scraper.js';
import { measurePages, type VisualResult } from './visual.js';
import {
  PointConstatSchema,
  type AuditPayload,
  type Constats,
  type PointConstat,
  type RecoMatrix,
  type ScrapedPage,
  type ScrapedSite,
} from './types.js';

// The hand-edited matrix ships with the package (single runtime source of
// truth; the interactive skill keeps its own copy for chat use). Static JSON
// import so tsc emits it to dist/ alongside the compiled module.
const RECO_MATRIX = RECO_MATRIX_JSON as RecoMatrix;

export function getRecoMatrix(): RecoMatrix {
  return RECO_MATRIX;
}

export interface AuditInput {
  url: string;
  entity: { name: string; bce?: string; fsmaStatus?: string; contact?: string };
  auditor?: string;
  /** ISO date (YYYY-MM-DD); defaults to today. */
  date?: string;
  extraUrls?: string[];
  /** Rendered-DOM measurements for [VISUEL] checks. Default true (V1 scope). */
  visual?: boolean;
  maxPages?: number;
  /** Concurrent checker calls. */
  concurrency?: number;
  onProgress?: (event: AuditProgressEvent) => void;
}

export type AuditProgressEvent =
  | { kind: 'scrape:done'; pages: number; failed: number }
  | { kind: 'visual:done'; measured: number; available: boolean }
  | { kind: 'point:done'; pointId: string; applicable: boolean }
  | { kind: 'point:error'; pointId: string; error: string };

export interface AuditResult {
  payload: AuditPayload;
  constats: Constats;
  scraped: ScrapedSite;
  visual: VisualResult | null;
  /** Points whose checker failed even after retry (rendered "à vérifier"). */
  errors: Array<{ pointId: string; error: string }>;
}

function extractJsonObject(text: string): string {
  const cleaned = text.replace(/```(?:json)?/gi, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) throw new Error('No JSON object found in LLM output');
  return cleaned.slice(start, end + 1);
}

/** Pages relevant to a point, by URL/title keyword. '' hint = homepage. */
export function selectPages(point: CatalogPoint, pages: ScrapedPage[]): ScrapedPage[] {
  if (point.pageHints.length === 0 || pages.length === 0) return pages;
  const selected = new Set<ScrapedPage>();
  const home = pages[0];
  for (const hint of point.pageHints) {
    if (hint === '') {
      if (home) selected.add(home);
      continue;
    }
    for (const page of pages) {
      const hay = `${page.url} ${page.title ?? ''}`.toLowerCase();
      if (hay.includes(hint)) selected.add(page);
    }
  }
  // No hint matched: the point still deserves a full-site look rather than a
  // silently skipped analysis.
  return selected.size > 0 ? pages.filter((p) => selected.has(p)) : pages;
}

async function checkPoint(
  llm: LLMClient,
  point: CatalogPoint,
  pages: ScrapedPage[],
  context: CheckerContext,
  maxRetries = 2,
): Promise<PointConstat> {
  const prompt = buildPointPrompt(point, pages, context);
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    const reminder =
      attempt === 0
        ? ''
        : '\n\nTa réponse précédente n\'était pas un JSON valide conforme au format demandé. Réponds avec UNIQUEMENT l\'objet JSON.';
    try {
      const raw = await llm.chat([{ role: 'user', content: prompt + reminder }], {
        system: CHECKER_SYSTEM_PROMPT,
        maxTokens: 4096,
        temperature: 0,
      });
      return PointConstatSchema.parse(JSON.parse(extractJsonObject(raw)));
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

/** Pages that look like they promote a credit product (visual-check targets). */
function creditPages(pages: ScrapedPage[]): ScrapedPage[] {
  return pages.filter((p, i) => i === 0 || /cr[ée]dit|pr[êe]t|emprunt|hypoth[ée]c|simulat/i.test(`${p.url} ${p.text.slice(0, 4000)}`));
}

async function runPool<T>(items: T[], worker: (item: T) => Promise<void>, size: number): Promise<void> {
  const queue = [...items];
  await Promise.all(
    Array.from({ length: Math.min(size, queue.length) }, async () => {
      for (;;) {
        const item = queue.shift();
        if (item === undefined) return;
        await worker(item);
      }
    }),
  );
}

/**
 * Full audit pipeline: scrape → measure rendered DOM → one checker call per
 * catalog point (sourced constats only) → deterministic assembly against the
 * matrix. Returns the payload consumed by the editable report and the PDF
 * workflow.
 */
export async function runWebsiteAudit(llm: LLMClient, input: AuditInput): Promise<AuditResult> {
  const onProgress = input.onProgress ?? (() => {});

  const scrapeOptions: ScrapeOptions = { maxPages: input.maxPages, extraUrls: input.extraUrls };
  const scraped = await scrapeSite(input.url, scrapeOptions);
  onProgress({ kind: 'scrape:done', pages: scraped.pages.length, failed: scraped.failed.length });
  if (scraped.pages.length === 0) {
    throw new Error(
      `Aucune page récupérable sur ${input.url} (${scraped.failed.map((f) => `${f.url}: ${f.reason}`).join(' ; ')})`,
    );
  }

  // Visual measurements (V1 scope): credit-promoting pages + any page whose
  // text extraction came back suspiciously short (JS rendering).
  let visual: VisualResult | null = null;
  if (input.visual !== false) {
    const targets = new Set(creditPages(scraped.pages).map((p) => p.url));
    for (const p of scraped.pages) {
      if (p.text.length < JS_RENDER_SUSPECT_CHARS) targets.add(p.url);
    }
    visual = await measurePages([...targets]);
    for (const page of scraped.pages) {
      page.visual = visual.measurements.get(page.url) ?? null;
      // JS-rendered page: the plain fetch saw nothing, the browser did —
      // substitute the rendered text so the checkers work on real content.
      if (page.text.length < JS_RENDER_SUSPECT_CHARS && page.visual && page.visual.texteRendu.length > page.text.length) {
        page.text = page.visual.texteRendu;
      }
    }
    onProgress({ kind: 'visual:done', measured: visual.measurements.size, available: visual.available });
  }

  const context: CheckerContext = {
    entityName: input.entity.name,
    bce: input.entity.bce,
    fsmaStatus: input.entity.fsmaStatus,
  };

  const constatsMap: Record<string, PointConstat> = {};
  const errors: Array<{ pointId: string; error: string }> = [];
  await runPool(
    AUDIT_CATALOG,
    async (point) => {
      try {
        const result = await checkPoint(llm, point, selectPages(point, scraped.pages), context);
        constatsMap[point.id] = result;
        onProgress({ kind: 'point:done', pointId: point.id, applicable: result.applicable });
      } catch (error) {
        // Leave the point out: the assembler renders it "non analysé / à
        // vérifier", which is the honest output for a failed checker.
        const message = error instanceof Error ? error.message : String(error);
        errors.push({ pointId: point.id, error: message });
        onProgress({ kind: 'point:error', pointId: point.id, error: message });
      }
    },
    input.concurrency ?? 4,
  );

  const toVerify: Array<{ topic: string; reason: string }> = [];
  if (input.visual !== false && visual && !visual.available) {
    toVerify.push({
      topic: 'Checks visuels (taille/position du slogan, bannière cookies)',
      reason: 'Mesure du DOM rendu indisponible (Playwright/chromium non installé) — contrôle manuel requis.',
    });
  }

  const constats: Constats = {
    meta: { locale: 'fr-BE', version: 'DRAFT', generatedAt: new Date().toISOString() },
    audit: {
      entity: {
        name: input.entity.name,
        ...(input.entity.bce ? { bce: input.entity.bce } : {}),
        fsmaStatus: input.entity.fsmaStatus ?? 'à confirmer',
        ...(input.entity.contact ? { contact: input.entity.contact } : {}),
      },
      site: { url: scraped.baseUrl, environment: 'production' },
      ...(input.auditor ? { auditor: input.auditor } : {}),
      date: input.date ?? new Date().toISOString().slice(0, 10),
      scope:
        "Audit du contenu publicitaire et informatif du site tel qu'il se présente. Il ne s'agit pas d'un audit juridique exhaustif des pratiques commerciales, contractuelles ou opérationnelles, ni d'un examen de la documentation précontractuelle.",
      disclaimer:
        "Les niveaux de risque sont indicatifs et ne préjugent pas de l'appréciation d'une autorité de contrôle ou d'un juge.",
      pages: {
        analysed: scraped.pages.map((p) => p.url),
        notAnalysed: scraped.failed.map((f) => ({ page: f.url, reason: f.reason })),
        ...(toVerify.length > 0 ? { toVerify } : {}),
      },
    },
    constats: constatsMap,
  };

  const payload = assemblePayload(constats, RECO_MATRIX);
  return { payload, constats, scraped, visual, errors };
}
