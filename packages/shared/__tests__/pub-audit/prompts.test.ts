import { describe, expect, it } from 'vitest';
import { checksForPass } from '../../src/pub-audit/catalog.js';
import {
  buildPassPrompt,
  buildQualificationPrompt,
  PUB_CHECKER_SYSTEM_PROMPT,
} from '../../src/pub-audit/prompts.js';
import type { PubQualification } from '../../src/pub-audit/types.js';

const qualification: PubQualification = {
  format: 'post_instagram',
  produits: ['credit_conso'],
  elements_fournis: ['visuel'],
  transcription: 'Prêt auto en 24h.',
};

describe('buildPassPrompt guidance & feedback', () => {
  it('injects cabinet guidance for checks of the pass', () => {
    const checks = checksForPass('A', qualification.produits);
    const out = buildPassPrompt('A', checks, qualification, 'pub.png', {
      guidance: { G1: { reformulations: ['Cabinet Untel — courtier en crédit'], consigne: 'Toujours viser le nom BCE' } },
    });
    expect(out).toContain('CONSIGNES DU CABINET');
    expect(out).toContain('Cabinet Untel — courtier en crédit');
    expect(out).toContain('Toujours viser le nom BCE');
  });

  it('injects past officer corrections as few-shot', () => {
    const checks = checksForPass('A', qualification.produits);
    const out = buildPassPrompt('A', checks, qualification, 'pub.png', {
      feedback: {
        G12: [{ verdictBefore: 'non_conforme', verdictAfter: 'conforme', note: 'label Sponsorisé suffit' }],
      },
    });
    expect(out).toContain('CORRECTIONS PASSÉES');
    expect(out).toContain('label Sponsorisé suffit');
    expect(out).toContain('non conforme');
    expect(out).toContain('conforme');
  });

  it('injects accompanying text and landing text (Phase 2)', () => {
    const checks = checksForPass('A', qualification.produits);
    const out = buildPassPrompt('A', checks, qualification, 'pub.png', {
      accompanyingText: 'Légende: contactez-nous',
      landingText: 'Mentions FSMA 12345',
    });
    expect(out).toContain("TEXTE D'ACCOMPAGNEMENT FOURNI");
    expect(out).toContain('Légende: contactez-nous');
    expect(out).toContain('CONTENU DE LA LANDING PAGE');
    expect(out).toContain('Mentions FSMA 12345');
    // Supplied/third-party text is fenced as untrusted data (prompt-injection guard).
    expect(out).toContain('<<<DÉBUT CONTENU FOURNI');
    expect(out).toContain('NON FIABLE');
  });

  it('omits the blocks when no guidance/feedback given', () => {
    const checks = checksForPass('A', qualification.produits);
    const out = buildPassPrompt('A', checks, qualification, 'pub.png');
    expect(out).not.toContain('CONSIGNES DU CABINET');
    expect(out).not.toContain('CORRECTIONS PASSÉES');
  });
});

describe('buildQualificationPrompt', () => {
  it('mentions supplied elements so elements_fournis reflects them', () => {
    const out = buildQualificationPrompt('pub.png', {
      accompanyingText: 'texte',
      landingText: 'landing',
    });
    expect(out).toContain('texte_accompagnement');
    expect(out).toContain('landing_page');
  });
});

describe('checker system prompt', () => {
  it('tells the model to prefer approved reformulations', () => {
    expect(PUB_CHECKER_SYSTEM_PROMPT).toContain('CONSIGNES DU CABINET');
  });
});
