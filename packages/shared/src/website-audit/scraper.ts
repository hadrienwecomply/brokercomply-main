import { convert } from 'html-to-text';
import type { ScrapedPage, ScrapedSite } from './types.js';

/**
 * Bounded, polite scraper for public broker websites. Plain fetch +
 * html-to-text; JS-heavy pages come back near-empty and are flagged so the
 * caller can fall back to the rendered-DOM path (visual.ts) or mark the
 * audit `needs_manual`.
 */

const USER_AGENT = 'BrokerComplyAuditBot/1.0 (+https://we-comply.be; compliance pre-audit)';
const FETCH_TIMEOUT_MS = 20_000;
const MAX_HTML_BYTES = 2_000_000;
const MAX_TEXT_CHARS = 40_000;
export const DEFAULT_MAX_PAGES = 10;

/** Compliance-relevant path keywords, scored for crawl priority. */
const LINK_SCORES: Array<[RegExp, number]> = [
  [/mentions?-?l[eé]gales?|legal/i, 100],
  [/cookies?/i, 95],
  [/vie-?priv[eé]e|privacy|confidentialit[eé]|rgpd|gdpr/i, 90],
  [/cr[eé]dit-?hypoth|hypoth[eé]caire|pr[eê]t-?hypo/i, 85],
  [/regroupement|rachat-?de-?cr[eé]dit/i, 82],
  [/cr[eé]dit|pr[eê]t|emprunt|financement/i, 80],
  [/assurance|srd|solde-?restant/i, 75],
  [/simulat|calcul/i, 70],
  [/demande|devis/i, 65],
  [/invest/i, 60],
  [/plainte|r[eé]clamation|m[eé]diation/i, 58],
  [/contact/i, 55],
  [/conditions|disclaimer/i, 50],
  [/blog|actualit|article|conseil|news/i, 30],
  [/a-?propos|about|equipe|team/i, 20],
];

/** Paths that never contain compliance content. */
const LINK_EXCLUDE = /\.(pdf|jpe?g|png|gif|svg|webp|zip|docx?|xlsx?)$|^(mailto|tel|javascript):|\/(wp-json|wp-admin|feed)\b/i;

export async function fetchHtml(url: string, timeoutMs = FETCH_TIMEOUT_MS): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: { 'user-agent': USER_AGENT, accept: 'text/html,application/xhtml+xml' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const type = res.headers.get('content-type') ?? '';
    if (!type.includes('html')) throw new Error(`Not HTML (${type || 'unknown content-type'})`);
    const html = await res.text();
    return html.length > MAX_HTML_BYTES ? html.slice(0, MAX_HTML_BYTES) : html;
  } finally {
    clearTimeout(timer);
  }
}

export function htmlToPlainText(html: string): string {
  const text = convert(html, {
    wordwrap: false,
    selectors: [
      { selector: 'img', format: 'skip' },
      { selector: 'nav', options: { itemPrefix: ' ' } },
      // Keep hrefs: policy/FSMA verification links are themselves checks.
      { selector: 'a', options: { hideLinkHrefIfSameAsText: true } },
    ],
  });
  return text.length > MAX_TEXT_CHARS ? text.slice(0, MAX_TEXT_CHARS) : text;
}

export function extractTitle(html: string): string | null {
  const m = /<title[^>]*>([^<]*)<\/title>/i.exec(html);
  return m?.[1] ? m[1].trim() || null : null;
}

/** Same-origin links found in the HTML, absolute, deduped, hash-stripped. */
export function extractLinks(html: string, baseUrl: string): string[] {
  const base = new URL(baseUrl);
  const out = new Set<string>();
  for (const m of html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"'#]+)["'#]/gi)) {
    const href = (m[1] ?? '').trim();
    if (!href || LINK_EXCLUDE.test(href)) continue;
    let url: URL;
    try {
      url = new URL(href, base);
    } catch {
      continue;
    }
    if (url.origin !== base.origin) continue;
    url.hash = '';
    out.add(url.toString());
  }
  return [...out];
}

export function scoreLink(url: string): number {
  for (const [re, score] of LINK_SCORES) {
    if (re.test(url)) return score;
  }
  return 0;
}

/**
 * Frame/iframe targets of a page. Legacy broker sites (white-label platforms
 * like brokerweb.be) are often a 300-byte frameset whose whole content lives
 * in one frame — possibly on ANOTHER origin, so these are followed even
 * cross-origin, unlike regular links.
 */
export function extractFrameSrcs(html: string, baseUrl: string): string[] {
  const out = new Set<string>();
  for (const m of html.matchAll(/<i?frame\b[^>]*src\s*=\s*["']([^"']+)["']/gi)) {
    const src = (m[1] ?? '').trim();
    if (!src || LINK_EXCLUDE.test(src)) continue;
    // Skip common embedded widgets — never the main content.
    if (/google\.com\/maps|youtube|youtu\.be|vimeo|facebook\.com|recaptcha|doubleclick/i.test(src)) continue;
    try {
      out.add(new URL(src, baseUrl).toString());
    } catch {
      // ignore unparsable src
    }
  }
  return [...out];
}

/** A page whose extracted text is this short is likely JS-rendered. */
export const JS_RENDER_SUSPECT_CHARS = 300;

export interface ScrapeOptions {
  maxPages?: number;
  /** Additional URLs to always fetch (e.g. provided by the officer). */
  extraUrls?: string[];
}

export async function scrapeSite(startUrl: string, options: ScrapeOptions = {}): Promise<ScrapedSite> {
  const maxPages = options.maxPages ?? DEFAULT_MAX_PAGES;
  const pages: ScrapedPage[] = [];
  const failed: Array<{ url: string; reason: string }> = [];
  const seen = new Set<string>();

  const home = new URL(startUrl);
  const queue: string[] = [home.toString(), ...(options.extraUrls ?? [])];

  // Fetch the homepage first to discover the rest of the crawl list.
  let discovered: string[] = [];
  for (const url of queue) {
    if (seen.has(url) || pages.length >= maxPages) continue;
    seen.add(url);
    try {
      const html = await fetchHtml(url);
      pages.push({ url, title: extractTitle(html), text: htmlToPlainText(html) });
      if (url === home.toString()) {
        discovered = extractLinks(html, url);
        // Frameset shell: the real site lives inside the frame. Fetch the
        // frame targets and discover links from the first one (its own
        // origin becomes the effective site).
        const homeText = pages[pages.length - 1]?.text ?? '';
        if (homeText.length < JS_RENDER_SUSPECT_CHARS) {
          for (const frameUrl of extractFrameSrcs(html, url)) {
            if (seen.has(frameUrl) || pages.length >= maxPages) continue;
            seen.add(frameUrl);
            try {
              const frameHtml = await fetchHtml(frameUrl);
              pages.push({ url: frameUrl, title: extractTitle(frameHtml), text: htmlToPlainText(frameHtml) });
              discovered.push(...extractLinks(frameHtml, frameUrl));
            } catch (error) {
              failed.push({ url: frameUrl, reason: error instanceof Error ? error.message : String(error) });
            }
          }
        }
      }
    } catch (error) {
      failed.push({ url, reason: error instanceof Error ? error.message : String(error) });
    }
  }

  const ranked = discovered
    .filter((u) => !seen.has(u))
    .map((u) => ({ url: u, score: scoreLink(u) }))
    .filter((l) => l.score > 0)
    .sort((a, b) => b.score - a.score);

  for (const { url } of ranked) {
    if (pages.length >= maxPages) break;
    if (seen.has(url)) continue;
    seen.add(url);
    try {
      const html = await fetchHtml(url);
      pages.push({ url, title: extractTitle(html), text: htmlToPlainText(html) });
    } catch (error) {
      failed.push({ url, reason: error instanceof Error ? error.message : String(error) });
    }
  }

  return { baseUrl: home.toString(), pages, failed };
}
