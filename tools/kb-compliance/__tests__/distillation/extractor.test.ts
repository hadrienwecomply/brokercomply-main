import { describe, expect, it, vi } from 'vitest';
import type { LLMClient } from '@brokercomply/shared';
import { extractQaPairs } from '../../src/distillation/extractor.js';

function mockLLM(chatResponses: string[]): LLMClient {
  const chat = vi.fn<LLMClient['chat']>();
  for (const r of chatResponses) chat.mockResolvedValueOnce(r);
  return { chat, embed: vi.fn() };
}

const VALID = JSON.stringify([
  {
    question: 'Combien d heures de formation IDD par an ?',
    answer: 'Au minimum 15 heures par an.',
    topic: 'IDD',
    regulatoryRefs: [],
    language: 'fr',
    confidence: 0.9,
    author: 'sdv@we-comply.be',
  },
]);

describe('extractQaPairs', () => {
  it('parses a valid JSON array of pairs', async () => {
    const llm = mockLLM([VALID]);
    const pairs = await extractQaPairs(llm, 'thread context');
    expect(pairs).toHaveLength(1);
    expect(pairs[0]).toMatchObject({ topic: 'IDD', language: 'fr', author: 'sdv@we-comply.be' });
    expect(llm.chat).toHaveBeenCalledTimes(1);
  });

  it('tolerates code fences around the JSON', async () => {
    const llm = mockLLM(['```json\n' + VALID + '\n```']);
    const pairs = await extractQaPairs(llm, 'ctx');
    expect(pairs).toHaveLength(1);
  });

  it('coerces an unknown topic to "other" and clamps bad confidence', async () => {
    const llm = mockLLM([
      JSON.stringify([
        { question: 'q', answer: 'a', topic: 'not_a_topic', confidence: 5, language: 'xx' },
      ]),
    ]);
    const [pair] = await extractQaPairs(llm, 'ctx');
    expect(pair!.topic).toBe('other');
    expect(pair!.confidence).toBe(0.5); // invalid value falls back via .catch
    expect(pair!.language).toBeNull();
    expect(pair!.regulatoryRefs).toEqual([]);
  });

  it('returns [] when the thread has no answered question', async () => {
    const llm = mockLLM(['[]']);
    expect(await extractQaPairs(llm, 'ctx')).toEqual([]);
  });

  it('retries on malformed output then succeeds', async () => {
    const llm = mockLLM(['not json at all', VALID]);
    const pairs = await extractQaPairs(llm, 'ctx');
    expect(pairs).toHaveLength(1);
    expect(llm.chat).toHaveBeenCalledTimes(2);
  });

  it('throws after exhausting retries', async () => {
    const llm = mockLLM(['bad', 'still bad', 'nope']);
    await expect(extractQaPairs(llm, 'ctx', 2)).rejects.toThrow(/extraction failed/i);
    expect(llm.chat).toHaveBeenCalledTimes(3);
  });
});
