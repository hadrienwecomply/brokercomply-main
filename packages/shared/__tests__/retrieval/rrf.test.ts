import { describe, expect, it } from 'vitest';
import { RRF_K, reciprocalRankFusion } from '../../src/retrieval/rrf.js';

describe('reciprocalRankFusion', () => {
  it('returns an empty list when both legs are empty', () => {
    expect(reciprocalRankFusion([], [])).toEqual([]);
  });

  it('scores a single leg by 1/(k+rank)', () => {
    const fused = reciprocalRankFusion([{ id: 'a', score: 0.9 }], []);
    expect(fused).toHaveLength(1);
    expect(fused[0]!.id).toBe('a');
    expect(fused[0]!.score).toBeCloseTo(1 / (RRF_K + 1), 10);
    expect(fused[0]!.semantic).toEqual({ rank: 1, score: 0.9 });
    expect(fused[0]!.lexical).toBeUndefined();
  });

  it('sums contributions for items present in both legs', () => {
    // 'a' is rank 1 semantic and rank 2 lexical → highest fused score.
    const fused = reciprocalRankFusion(
      [
        { id: 'a', score: 0.95 },
        { id: 'b', score: 0.8 },
      ],
      [
        { id: 'c', score: 0.5 },
        { id: 'a', score: 0.4 },
      ],
    );
    const a = fused.find((e) => e.id === 'a')!;
    expect(a.score).toBeCloseTo(1 / (RRF_K + 1) + 1 / (RRF_K + 2), 10);
    expect(a.semantic).toEqual({ rank: 1, score: 0.95 });
    expect(a.lexical).toEqual({ rank: 2, score: 0.4 });
  });

  it('ranks an item shared across both legs above singletons', () => {
    const fused = reciprocalRankFusion(
      [
        { id: 'shared', score: 0.7 },
        { id: 'semOnly', score: 0.9 },
      ],
      [
        { id: 'lexOnly', score: 0.9 },
        { id: 'shared', score: 0.6 },
      ],
    );
    expect(fused[0]!.id).toBe('shared');
    // Result is sorted by descending fused score.
    for (let i = 1; i < fused.length; i++) {
      expect(fused[i - 1]!.score).toBeGreaterThanOrEqual(fused[i]!.score);
    }
  });

  it('honours a custom k', () => {
    const fused = reciprocalRankFusion([{ id: 'a', score: 1 }], [], 10);
    expect(fused[0]!.score).toBeCloseTo(1 / (10 + 1), 10);
  });
});
