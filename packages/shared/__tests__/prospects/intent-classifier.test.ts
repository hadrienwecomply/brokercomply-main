import { describe, expect, it, vi } from 'vitest';
import {
  classifyIntent,
  parseClassification,
  IntentParseError,
  CLASSIFIER_MODEL,
} from '../../src/prospects/intent-classifier.js';
import type { LLMClient } from '../../src/llm/types.js';

/** An LLMClient whose chat() returns a fixed string. */
function fakeLLM(reply: string): { llm: LLMClient; chat: ReturnType<typeof vi.fn> } {
  const chat = vi.fn().mockResolvedValue(reply);
  return { llm: { chat, embed: vi.fn() }, chat };
}

const input = {
  threadText: 'Bonjour, votre solution nous intéresse, pouvez-vous m\'en dire plus ?',
  societe: 'Cabinet Test',
  offerAlreadySent: false,
  today: new Date('2026-07-21T00:00:00.000Z'),
};

describe('parseClassification', () => {
  it('parses a clean JSON object', () => {
    const r = parseClassification(
      '{"intent":"interested","confidence":0.9,"quote":"votre solution nous intéresse","suggestedDate":null}',
    );
    expect(r).toEqual({
      intent: 'interested',
      confidence: 0.9,
      quote: 'votre solution nous intéresse',
      suggestedDate: null,
    });
  });

  it('tolerates code fences and surrounding prose', () => {
    const r = parseClassification(
      'Voici le résultat :\n```json\n{"intent":"not_interested","confidence":0.95,"quote":"pas intéressé"}\n```',
    );
    expect(r.intent).toBe('not_interested');
    expect(r.quote).toBe('pas intéressé');
  });

  it('clamps confidence into [0,1]', () => {
    expect(parseClassification('{"intent":"later","confidence":1.4}').confidence).toBe(1);
    expect(parseClassification('{"intent":"later","confidence":-0.2}').confidence).toBe(0);
  });

  it('keeps a valid suggestedDate, drops a malformed one', () => {
    expect(
      parseClassification('{"intent":"later","confidence":0.8,"suggestedDate":"2026-09-01"}')
        .suggestedDate,
    ).toBe('2026-09-01');
    expect(
      parseClassification('{"intent":"later","confidence":0.8,"suggestedDate":"septembre"}')
        .suggestedDate,
    ).toBeNull();
  });

  it('throws on an unknown intent', () => {
    expect(() => parseClassification('{"intent":"maybe","confidence":0.8}')).toThrow(
      IntentParseError,
    );
  });

  it('throws when there is no JSON at all', () => {
    expect(() => parseClassification('je ne sais pas')).toThrow(IntentParseError);
  });

  it('throws when confidence is missing/non-numeric', () => {
    expect(() => parseClassification('{"intent":"interested"}')).toThrow(IntentParseError);
  });
});

describe('classifyIntent', () => {
  it('calls the LLM with Sonnet 5, temperature 0, and a system prompt', async () => {
    const { llm, chat } = fakeLLM('{"intent":"interested","confidence":0.9,"quote":"intéresse"}');
    const r = await classifyIntent(llm, input);

    expect(r.intent).toBe('interested');
    const [messages, options] = chat.mock.calls[0];
    expect(options.model).toBe(CLASSIFIER_MODEL);
    // Temperature is intentionally NOT sent — Sonnet 5 rejects it.
    expect(options.temperature).toBeUndefined();
    expect(options.system).toContain('intent');
    // The prompt grounds the model with the agency and offer context.
    expect(messages[0].content).toContain('Cabinet Test');
    expect(messages[0].content).toContain('déjà envoyée : non');
  });

  it('propagates a parse error from an unusable reply', async () => {
    const { llm } = fakeLLM('¯\\_(ツ)_/¯');
    await expect(classifyIntent(llm, input)).rejects.toThrow(IntentParseError);
  });
});
