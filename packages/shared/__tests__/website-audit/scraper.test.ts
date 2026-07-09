import { describe, expect, it } from 'vitest';
import {
  extractFrameSrcs,
  extractLinks,
  extractTitle,
  htmlToPlainText,
  scoreLink,
} from '../../src/website-audit/scraper.js';
import { selectPages } from '../../src/website-audit/agent.js';
import { AUDIT_CATALOG } from '../../src/website-audit/catalog.js';
import type { ScrapedPage } from '../../src/website-audit/types.js';

const HTML = `
<html><head><title>Crédimax — Courtier en crédit</title></head><body>
<nav>
  <a href="/credit-hypothecaire">Crédit hypothécaire</a>
  <a href="/pret-personnel">Prêt personnel</a>
  <a href="https://www.credimax.example/mentions-legales">Mentions légales</a>
  <a href="/politique-cookies#section">Cookies</a>
  <a href="https://facebook.com/credimax">Facebook</a>
  <a href="/brochure.pdf">Brochure</a>
  <a href="mailto:info@credimax.example">Écrivez-nous</a>
  <a href="/credit-hypothecaire">Crédit hypothécaire (dupliqué)</a>
</nav>
<h1>Empruntez malin</h1>
<p>Attention, emprunter de l'argent coûte aussi de l'argent</p>
</body></html>`;

describe('scraper', () => {
  it('extracts same-origin links, deduped, without assets/mailto', () => {
    const links = extractLinks(HTML, 'https://www.credimax.example/');
    expect(links).toContain('https://www.credimax.example/credit-hypothecaire');
    expect(links).toContain('https://www.credimax.example/mentions-legales');
    expect(links).toContain('https://www.credimax.example/politique-cookies');
    expect(links).not.toContain('https://facebook.com/credimax');
    expect(links.some((l) => l.includes('brochure.pdf'))).toBe(false);
    expect(links.some((l) => l.startsWith('mailto'))).toBe(false);
    expect(links.filter((l) => l.endsWith('/credit-hypothecaire'))).toHaveLength(1);
  });

  it('scores compliance pages above generic ones', () => {
    expect(scoreLink('https://x.be/mentions-legales')).toBeGreaterThan(scoreLink('https://x.be/blog/post'));
    expect(scoreLink('https://x.be/politique-cookies')).toBeGreaterThan(scoreLink('https://x.be/contact'));
    expect(scoreLink('https://x.be/equipe')).toBeGreaterThan(0);
  });

  it('follows frameset targets cross-origin but skips embedded widgets', () => {
    const frameset = `
      <frameset rows="100%,*"><frame src="http://113475.brokerweb.be/fr/" name="main"></frameset>
      <iframe src="https://www.google.com/maps/embed?pb=xyz"></iframe>
      <iframe src="/simulateur-embed"></iframe>`;
    const srcs = extractFrameSrcs(frameset, 'https://www.finassura.be/');
    expect(srcs).toContain('http://113475.brokerweb.be/fr/');
    expect(srcs).toContain('https://www.finassura.be/simulateur-embed');
    expect(srcs.some((s) => s.includes('google.com/maps'))).toBe(false);
  });

  it('extracts title and converts HTML to text with the legal slogan intact', () => {
    expect(extractTitle(HTML)).toBe('Crédimax — Courtier en crédit');
    const text = htmlToPlainText(HTML);
    expect(text).toContain("Attention, emprunter de l'argent coûte aussi de l'argent");
    expect(text).not.toContain('<p>');
  });
});

describe('selectPages', () => {
  const page = (url: string): ScrapedPage => ({ url, title: null, text: 'x' });
  const pages = [
    page('https://x.be/'),
    page('https://x.be/credit-hypothecaire'),
    page('https://x.be/mentions-legales'),
    page('https://x.be/politique-cookies'),
  ];

  it('routes P18 (mentions légales) to the legal pages', () => {
    const p18 = AUDIT_CATALOG.find((p) => p.id === 'P18')!;
    const selected = selectPages(p18, pages);
    expect(selected.map((p) => p.url)).toContain('https://x.be/mentions-legales');
    expect(selected.map((p) => p.url)).not.toContain('https://x.be/credit-hypothecaire');
  });

  it('always includes the homepage for P01 (slogan)', () => {
    const p01 = AUDIT_CATALOG.find((p) => p.id === 'P01')!;
    const selected = selectPages(p01, pages);
    expect(selected.map((p) => p.url)).toContain('https://x.be/');
    expect(selected.map((p) => p.url)).toContain('https://x.be/credit-hypothecaire');
  });

  it('falls back to all pages when no hint matches', () => {
    const p22 = AUDIT_CATALOG.find((p) => p.id === 'P22')!;
    expect(selectPages(p22, pages)).toHaveLength(pages.length);
  });

  it('gives points without hints the whole site', () => {
    const p02 = AUDIT_CATALOG.find((p) => p.id === 'P02')!;
    expect(selectPages(p02, pages)).toHaveLength(pages.length);
  });
});
