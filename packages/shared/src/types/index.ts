/** Languages handled across the corpus (PRD: multilingual FR/NL/EN). */
export const LANGUAGES = ['fr', 'nl', 'en'] as const;
export type Language = (typeof LANGUAGES)[number];

/**
 * Controlled vocabulary for knowledge-unit topics. Kept deliberately small in
 * Phase 0; extended as coverage grows.
 */
export const TOPICS = [
  'AMLR',
  'fit_and_proper',
  'IDD',
  'EGR',
  'mystery_shopping',
  'general_compliance',
  'other',
] as const;
export type Topic = (typeof TOPICS)[number];

/** Which officer authored an answer — drives divergence detection. */
export type Author = string;
