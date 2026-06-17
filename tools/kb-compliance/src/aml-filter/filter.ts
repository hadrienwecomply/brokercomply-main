import type { Thread } from '../ingestion/thread-builder.js';
import { AML_KEYWORDS, type AmlCategory } from './keywords.js';
import type { AmlMatch, FilterResult } from './types.js';

/** Lowercase + strip diacritics so "déclaration" matches "declaration". */
export function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Precompiled matchers. Each keyword becomes a word-boundary regex (spaces are
 * matched flexibly), so short acronyms like "sar"/"str" don't match inside
 * unrelated words while phrases tolerate varied whitespace.
 */
const MATCHERS: ReadonlyArray<{ category: AmlCategory; keyword: string; re: RegExp }> =
  Object.entries(AML_KEYWORDS).flatMap(([category, keywords]) =>
    keywords.map((keyword) => ({
      category: category as AmlCategory,
      keyword,
      re: new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(keyword).replace(/\s+/g, '\\s+')}(?![\\p{L}\\p{N}])`, 'u'),
    })),
  );

/** Return every AML keyword match found in `text` (deduplicated by keyword). */
export function scanText(text: string): AmlMatch[] {
  const haystack = normalize(text);
  const seen = new Set<string>();
  const matches: AmlMatch[] = [];
  for (const { category, keyword, re } of MATCHERS) {
    if (seen.has(keyword)) continue;
    if (re.test(haystack)) {
      seen.add(keyword);
      matches.push({ category, keyword });
    }
  }
  return matches;
}

function toResult(matches: AmlMatch[]): FilterResult {
  const categories = [...new Set(matches.map((m) => m.category))];
  return { excluded: matches.length > 0, matches, categories };
}

/**
 * Conservative thread-level filter. Scans the subject + every message body +
 * all attachment text. ANY match excludes the ENTIRE thread (recall-biased:
 * when in doubt, exclude).
 */
export function filterThread(thread: Thread, attachmentTexts: readonly string[] = []): FilterResult {
  const parts: string[] = [thread.subject];
  for (const message of thread.messages) {
    parts.push(message.subject, message.bodyContent);
  }
  parts.push(...attachmentTexts);
  return toResult(scanText(parts.join('\n')));
}
