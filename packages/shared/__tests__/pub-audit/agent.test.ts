import { describe, expect, it } from 'vitest';
import { runPubAudit } from '../../src/pub-audit/agent.js';
import { PassResultSchema } from '../../src/pub-audit/types.js';
import type { ChatMessage, ChatOptions, LLMClient } from '../../src/llm/types.js';

/**
 * Regression guard for the checker-pass parse step: the checker prompt asks the
 * model for ONLY id/verdict/citation/explication/reformulation/a_verifier_ou —
 * NOT intitule/type (those are catalog-owned). If the pass parser required
 * intitule/type, every real response would fail to parse and every audit would
 * silently degrade to "all à vérifier". These tests exercise that exact shape.
 */

/** LLM stub: returns pass-0 qualification, then prompt-contract-shaped constats. */
function fakeLLM(): LLMClient {
  return {
    async chat(messages: ChatMessage[], options?: ChatOptions): Promise<string> {
      const system = options?.system ?? '';
      // Vision image must be attached on every call.
      expect(options?.images?.length).toBe(1);
      if (system.startsWith('Tu es un analyste')) {
        return JSON.stringify({
          format: 'flyer',
          produits: ['credit_conso'],
          elements_fournis: ['visuel'],
          transcription: 'Empruntez malin — « taux imbattable »',
        });
      }
      // Checker pass: return one non_conforme for the first check listed, using
      // ONLY the fields the prompt declares (no intitule/type).
      const prompt = messages[messages.length - 1]?.content ?? '';
      const m = /^- ([A-Z][0-9a-z]+) —/m.exec(prompt);
      const id = m?.[1] ?? 'G1';
      return JSON.stringify({
        constats: [
          { id, verdict: 'non_conforme', citation: '« taux imbattable »', reformulation: 'taux compétitif' },
        ],
      });
    },
    async embed(): Promise<number[][]> {
      return [];
    },
  };
}

describe('runPubAudit (parse against the prompt contract)', () => {
  it('PassResultSchema accepts constats without intitule/type', () => {
    expect(() =>
      PassResultSchema.parse({ constats: [{ id: 'G8', verdict: 'non_conforme', citation: 'x' }] }),
    ).not.toThrow();
  });

  it('produces real verdicts (does not degrade to all à_vérifier)', async () => {
    const result = await runPubAudit(fakeLLM(), {
      fileName: 'pub.png',
      imageBase64: 'AAAA',
      imageMediaType: 'image/png',
      entiteName: 'Courtier SA',
      date: '2026-07-09',
    });

    expect(result.errors).toHaveLength(0);
    const nonConf = result.payload.constats.filter((c) => c.verdict === 'non_conforme');
    expect(nonConf.length).toBeGreaterThan(0);
    // A prohibition among them → rouge (not the jaune fallback).
    expect(result.payload.niveauGlobal.code).toBe('rouge');
    // Enriched from the catalog: intitulé + legal basis present despite the LLM
    // never returning them.
    const first = nonConf[0]!;
    expect(first.intitule.length).toBeGreaterThan(0);
    expect(first.base_legale).toContain('CDE');
  });
});
