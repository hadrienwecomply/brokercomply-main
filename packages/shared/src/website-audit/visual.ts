/// <reference lib="dom" />
/// <reference lib="dom.iterable" />
import type { VisualMeasurement } from './types.js';

/**
 * Rendered-DOM measurements for the [VISUEL] checks (port of the skill's
 * `references/checks-visuels.md` snippet): legal-slogan real text, font size
 * vs. commercial headlines at the same viewport width, above-the-fold
 * visibility, cookie banner presence.
 *
 * Playwright is loaded lazily: environments without it (or without the
 * chromium binary — `pnpm exec playwright install chromium`) degrade
 * gracefully, and the affected checks are reported "À vérifier" as the skill
 * prescribes.
 */

export const DEFAULT_VIEWPORT_WIDTH = 1280;

/**
 * Runs in the BROWSER context via page.evaluate — must stay self-contained
 * (no imports, no outer-scope references).
 */
function measureInPage(): VisualMeasurement {
  const norm = (s: string | null | undefined) => (s || '').replace(/[\s ]+/g, ' ').trim();
  function ownText(e: Element): string {
    return norm(
      Array.from(e.childNodes)
        .filter((n) => n.nodeType === 3)
        .map((n) => n.textContent)
        .join(''),
    );
  }
  function measure(e: Element | null) {
    if (!e) return null;
    const cs = getComputedStyle(e as HTMLElement);
    const r = e.getBoundingClientRect();
    return {
      tag: e.tagName,
      cls: String((e as HTMLElement).className).slice(0, 40),
      texteReel: norm(e.textContent).slice(0, 120),
      fontSizePx: parseFloat(cs.fontSize),
      fontWeight: cs.fontWeight,
      color: cs.color,
      yTop: Math.round(r.top + window.scrollY),
      visibleSansScroll: r.top >= 0 && r.top < window.innerHeight,
      display: cs.display,
      visibility: cs.visibility,
    };
  }
  // Deep walk: also descends into shadow roots (footers/CMP in web components)
  function allElements(root: Document | ShadowRoot = document): Element[] {
    const out: Element[] = [];
    const walk = (n: Document | ShadowRoot) => {
      for (const e of n.querySelectorAll('*')) {
        out.push(e);
        if (e.shadowRoot) walk(e.shadowRoot);
      }
    };
    walk(root);
    return out;
  }
  const ALL = allElements();
  // Leaf element: directly carries the text (not an ancestor container)
  function findLeaf(re: RegExp): Element | null {
    let best: Element | null = null;
    for (const e of ALL) {
      if (re.test(ownText(e))) {
        if (!best || best.contains(e)) best = e;
      }
    }
    return best;
  }

  // Cascade lookup by invariant core — NEVER by the exact legal phrase (a
  // faulty slogan must still be found, quoted and measured).
  const RE_EXACT = /emprunter de l['’]argent co[uû]te aussi de l['’]argent/i;
  const RE_NOYAU = /emprunter de l['’]argent/i;
  const RE_LARGE = /(emprunter|cr[ée]dit)[^.]{0,40}co[uû]t/i;
  let slogan: Element | null = null;
  let confiance: 'exact' | 'noyau' | 'large' | null = null;
  if ((slogan = findLeaf(RE_EXACT))) confiance = 'exact';
  else if ((slogan = findLeaf(RE_NOYAU))) confiance = 'noyau';
  else if ((slogan = findLeaf(RE_LARGE))) confiance = 'large';
  const PHRASE_LEGALE = "Attention, emprunter de l'argent coûte aussi de l'argent";
  const formulationExacte = slogan
    ? norm(slogan.textContent).toLowerCase() === norm(PHRASE_LEGALE).toLowerCase()
    : null;

  const accroches = Array.from(document.querySelectorAll('h1,h2,h3')).slice(0, 6).map(measure);
  const accrocheSizes = accroches.filter((a): a is NonNullable<typeof a> => a !== null).map((a) => a.fontSizePx);
  const accrocheMaxPx = accrocheSizes.length ? Math.max(...accrocheSizes) : null;
  const banner = ALL.find((e) =>
    /accepter( les)? cookies|param[ée]trer ou refuser|tout refuser|cookie consent/i.test(ownText(e)),
  );

  return {
    url: location.href,
    largeurFenetre: window.innerWidth,
    hauteurFenetre: window.innerHeight,
    pageHeight: document.body.scrollHeight,
    sloganTrouve: !!slogan,
    confiance,
    slogan: measure(slogan) as VisualMeasurement['slogan'],
    formulationExacte,
    accrocheMaxPx,
    accroches: accroches as VisualMeasurement['accroches'],
    banniereCookies: !!banner,
    texteRendu: norm(document.body?.innerText).slice(0, 40_000),
  };
}

export interface VisualOptions {
  viewportWidth?: number;
  /** Wait after scrolling to the bottom (dynamic footers/CMP). */
  settleMs?: number;
  timeoutMs?: number;
}

export interface VisualResult {
  measurements: Map<string, VisualMeasurement>;
  failed: Array<{ url: string; reason: string }>;
  /** False when Playwright (or its chromium binary) is unavailable. */
  available: boolean;
}

/** Measure a batch of pages with a single headless browser. */
export async function measurePages(urls: string[], options: VisualOptions = {}): Promise<VisualResult> {
  const measurements = new Map<string, VisualMeasurement>();
  const failed: Array<{ url: string; reason: string }> = [];

  let chromium;
  try {
    ({ chromium } = await import('playwright'));
  } catch {
    return { measurements, failed, available: false };
  }

  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      // Container-safe flags: Chromium's sandbox can't run as root inside a
      // container, and the default /dev/shm is too small for headless renders.
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });
  } catch (error) {
    // Playwright installed but no browser binary (run: playwright install chromium)
    failed.push({ url: '*', reason: error instanceof Error ? error.message : String(error) });
    return { measurements, failed, available: false };
  }

  try {
    const context = await browser.newContext({
      viewport: { width: options.viewportWidth ?? DEFAULT_VIEWPORT_WIDTH, height: 900 },
      userAgent: 'BrokerComplyAuditBot/1.0 (+https://we-comply.be; compliance pre-audit)',
      locale: 'fr-BE',
    });
    for (const url of urls) {
      const page = await context.newPage();
      try {
        await page.goto(url, { waitUntil: 'load', timeout: options.timeoutMs ?? 30_000 });
        // Two-step scroll-then-measure, as in the skill: dynamic footers/CMP
        // need time to attach after the scroll.
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await page.waitForTimeout(options.settleMs ?? 1_500);
        const result = await page.evaluate(measureInPage);
        measurements.set(url, result);
      } catch (error) {
        failed.push({ url, reason: error instanceof Error ? error.message : String(error) });
      } finally {
        await page.close();
      }
    }
  } finally {
    await browser.close();
  }

  return { measurements, failed, available: true };
}
