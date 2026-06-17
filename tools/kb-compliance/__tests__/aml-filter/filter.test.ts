import { describe, expect, it } from 'vitest';
import { filterThread, normalize, scanText } from '../../src/aml-filter/filter.js';
import type { Thread } from '../../src/ingestion/thread-builder.js';
import type { RawMessage } from '../../src/ingestion/types.js';

function thread(subject: string, bodies: string[]): Thread {
  const messages: RawMessage[] = bodies.map((bodyContent, i) => ({
    id: `m${i}`,
    internetMessageId: `<m${i}@x>`,
    conversationId: 'c',
    subject,
    bodyContent,
    bodyContentType: 'text',
    from: 'a@x.be',
    to: ['b@x.be'],
    cc: [],
    receivedDateTime: '2025-01-01T00:00:00Z',
    hasAttachments: false,
    attachments: [],
  }));
  return { id: 'c', subject, messages, participants: [] };
}

describe('normalize', () => {
  it('lowercases and strips accents', () => {
    expect(normalize('Déclaration de Soupçon')).toBe('declaration de soupcon');
  });
});

describe('scanText', () => {
  it('detects CTIF and suspicion-report keywords (accent/case-insensitive)', () => {
    const matches = scanText('Faut-il transmettre une déclaration de soupçon à la CTIF ?');
    const categories = new Set(matches.map((m) => m.category));
    expect(categories.has('ctif')).toBe(true);
    expect(categories.has('suspicion_report')).toBe(true);
  });

  it('matches short acronyms only on word boundaries', () => {
    expect(scanText('We filed a SAR yesterday')).toHaveLength(1); // SAR matches
    expect(scanText('Caesar dressing and sarcasm')).toHaveLength(0); // no false positive
  });

  it('matches phrases with flexible whitespace', () => {
    expect(scanText('melding   van    vermoeden').length).toBeGreaterThan(0);
  });

  it('returns nothing for benign compliance content', () => {
    expect(scanText('Combien d heures de formation continue IDD par an ?')).toHaveLength(0);
  });

  it('does NOT flag the AML topic itself (bare "blanchiment"/"money laundering")', () => {
    // The whole domain is anti-money-laundering; topic mentions must pass.
    expect(scanText('Nos obligations en matière de blanchiment de capitaux ?')).toHaveLength(0);
    expect(scanText('Quelles procédures anti-money-laundering pour un nouveau client ?')).toHaveLength(0);
    expect(scanText('Hoe zit het met onze witwassen-verplichtingen ?')).toHaveLength(0);
  });

  it('still flags an actual money-laundering report/disclosure act', () => {
    expect(scanText('Nous devons faire un signalement de blanchiment au CTIF')
      .some((m) => m.category === 'laundering')).toBe(true);
    expect(scanText('aangifte witwassen ingediend').some((m) => m.category === 'laundering')).toBe(true);
  });

  it('does NOT flag routine sanctions screening, but flags an asset freeze', () => {
    expect(scanText('Comment vérifier la liste des sanctions UE pour ce client ?')).toHaveLength(0);
    expect(scanText('La banque a procédé au gel des avoirs du client')
      .some((m) => m.category === 'sanctions')).toBe(true);
  });
});

describe('filterThread', () => {
  it('excludes the whole thread on any match (conservative)', () => {
    const t = thread('Cas client', ['Question banale', 'Nous devons faire une declaration de soupcon']);
    const result = filterThread(t);
    expect(result.excluded).toBe(true);
    expect(result.categories).toContain('suspicion_report');
  });

  it('detects keywords located in attachment text', () => {
    const t = thread('Sujet neutre', ['Corps neutre']);
    const result = filterThread(t, ['document mentionnant une declaration de soupcon au CTIF']);
    expect(result.excluded).toBe(true);
    expect(result.categories).toContain('suspicion_report');
  });

  it('keeps a legitimate business thread that merely mentions the AML topic', () => {
    // Real false-positive class: a business/compliance follow-up that name-drops
    // "blanchiment" must NOT be excluded.
    const t = thread('Suivi / Brokercomply x Directfin', [
      'Bonjour, peux-tu confirmer notre politique anti-blanchiment pour le dossier ?',
      'Oui, la procédure de vigilance est à jour, rien à signaler.',
    ]);
    expect(filterThread(t).excluded).toBe(false);
  });

  it('passes a general AML (AMLR) thread that has no CTIF/suspicion content', () => {
    const t = thread('AMLR - identification client', [
      'A partir de quel montant identifier un nouveau client ?',
      'Les mesures de vigilance s appliquent des l entree en relation, documentez le risque.',
    ]);
    expect(filterThread(t).excluded).toBe(false);
  });
});
