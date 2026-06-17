/**
 * Conservative AML/CTIF exclusion keyword lists (FR / NL / EN).
 *
 * These drive a deliberately broad, recall-biased filter: when in doubt, the
 * whole thread is excluded before any storage. Lists are organised by category
 * so the exclusion ledger can record *which category* triggered (never the
 * email content itself).
 *
 * All matching is case-insensitive and accent-insensitive (see filter.ts), so
 * entries here are written unaccented and lowercase.
 */
export const AML_KEYWORDS = {
  /** CTIF/CFI — the Belgian FIU. */
  ctif: [
    'ctif',
    'cfi',
    'cellule de traitement des informations financieres',
    'cellule de traitement',
    'cel voor financiele informatieverwerking',
    'financial intelligence unit',
  ],
  /** Suspicious-transaction / suspicion reports. */
  suspicion_report: [
    'declaration de soupcon',
    'declaration de soupcons',
    'melding van vermoeden',
    'verdachte transactie',
    'suspicious transaction report',
    'suspicious activity report',
    'sar',
    'str',
  ],
  /**
   * Money-laundering *reporting / disclosure act* only — NOT the topic. Bare
   * terms ("blanchiment", "witwassen", "money laundering") are deliberately
   * excluded: anti-money-laundering is the whole domain, so they appear in
   * masses of legitimate compliance Q/A (PRD excludes CTIF/suspicion reports,
   * not AML discussion). Only phrases denoting an actual report/disclosure stay.
   */
  laundering: [
    'signalement de blanchiment',
    'signalement pour blanchiment',
    'aangifte witwassen',
    'melding witwassen',
  ],
  /**
   * Actual asset-freezing actions only. Routine sanctions *screening* topic
   * terms ("liste des sanctions", "sanctions list", "sanctielijst") are
   * excluded on purpose — screening is legitimate, valuable compliance content.
   */
  sanctions: [
    'gel des avoirs',
    'bevriezing van tegoeden',
    'asset freeze',
  ],
} as const;

export type AmlCategory = keyof typeof AML_KEYWORDS;

export const AML_CATEGORIES = Object.freeze(
  Object.keys(AML_KEYWORDS) as AmlCategory[],
);

// Freeze every list so the keyword set is immutable at runtime.
for (const list of Object.values(AML_KEYWORDS)) {
  Object.freeze(list);
}
Object.freeze(AML_KEYWORDS);
