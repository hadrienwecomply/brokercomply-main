import { describe, expect, it, vi } from 'vitest';
import type { LLMClient } from '@brokercomply/shared';
import { embedQuestions } from '../../src/distillation/embedder.js';

describe('embedQuestions', () => {
  it('returns [] and does not call the API for empty input', async () => {
    const embed = vi.fn();
    const llm: LLMClient = { chat: vi.fn(), embed };
    expect(await embedQuestions(llm, [])).toEqual([]);
    expect(embed).not.toHaveBeenCalled();
  });

  it('delegates to the LLM client embed', async () => {
    const vectors = [[0.1, 0.2]];
    const embed = vi.fn().mockResolvedValue(vectors);
    const llm: LLMClient = { chat: vi.fn(), embed };
    const out = await embedQuestions(llm, ['question']);
    expect(out).toBe(vectors);
    expect(embed).toHaveBeenCalledWith(['question']);
  });
});
