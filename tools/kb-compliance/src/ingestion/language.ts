import type { Language } from '@brokercomply/shared';

/**
 * Lightweight stop-word language guess for FR/NL/EN. Good enough to tag source
 * documents in Phase 0; per-Q/A detection happens later during distillation.
 */
const STOPWORDS: Record<Language, string[]> = {
  fr: ['le', 'la', 'les', 'des', 'une', 'est', 'vous', 'nous', 'pour', 'avec', 'dans', 'que', 'qui', 'pas', 'sur'],
  nl: ['de', 'het', 'een', 'van', 'is', 'wij', 'voor', 'met', 'dat', 'niet', 'op', 'aan', 'zijn', 'naar', 'ook'],
  en: ['the', 'and', 'is', 'are', 'you', 'we', 'for', 'with', 'that', 'this', 'not', 'on', 'to', 'of', 'please'],
};

export function detectLanguage(text: string): Language | null {
  const tokens = text.toLowerCase().match(/\p{L}+/gu);
  if (!tokens || tokens.length === 0) return null;
  const set = new Set(tokens);

  let best: Language | null = null;
  let bestScore = 0;
  for (const lang of Object.keys(STOPWORDS) as Language[]) {
    const score = STOPWORDS[lang].reduce((acc, w) => acc + (set.has(w) ? 1 : 0), 0);
    if (score > bestScore) {
      bestScore = score;
      best = lang;
    }
  }
  return bestScore > 0 ? best : null;
}
