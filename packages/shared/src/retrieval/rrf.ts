/** Default Reciprocal Rank Fusion constant (smooths out top-rank dominance). */
export const RRF_K = 60;

/** An item as ranked by a single retrieval leg (lists are ordered best-first). */
export interface RankedItem {
  id: string;
  /** Raw leg score, carried through untouched for transparency. */
  score: number;
}

/** A fused result combining both legs' contributions for one id. */
export interface FusedEntry {
  id: string;
  /** Reciprocal-rank-fusion score (higher = better). */
  score: number;
  semantic?: { rank: number; score: number };
  lexical?: { rank: number; score: number };
}

/**
 * Reciprocal Rank Fusion of a semantic and a lexical ranking. Each input list
 * is assumed ordered best-first; an item's RRF contribution from a list is
 * `1 / (k + rank)` with `rank` 1-based. Contributions sum across legs, so an
 * item appearing in both is rewarded over singletons. Returns entries sorted by
 * descending fused score.
 */
export function reciprocalRankFusion(
  semantic: RankedItem[],
  lexical: RankedItem[],
  k: number = RRF_K,
): FusedEntry[] {
  const entries = new Map<string, FusedEntry>();

  const ingest = (list: RankedItem[], leg: 'semantic' | 'lexical') => {
    list.forEach((item, i) => {
      const rank = i + 1;
      let entry = entries.get(item.id);
      if (!entry) {
        entry = { id: item.id, score: 0 };
        entries.set(item.id, entry);
      }
      entry.score += 1 / (k + rank);
      entry[leg] = { rank, score: item.score };
    });
  };

  ingest(semantic, 'semantic');
  ingest(lexical, 'lexical');

  return [...entries.values()].sort((a, b) => b.score - a.score);
}
