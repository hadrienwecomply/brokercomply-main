import type { AmlCategory } from './keywords.js';

export interface AmlMatch {
  category: AmlCategory;
  /** The keyword that matched (kept for debugging; never persisted with content). */
  keyword: string;
}

export interface FilterResult {
  excluded: boolean;
  matches: AmlMatch[];
  /** Distinct categories that triggered — safe to persist in the exclusion ledger. */
  categories: AmlCategory[];
}
