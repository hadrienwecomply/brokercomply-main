import { describe, expect, it } from 'vitest';
import { renderEmailTemplate, renderTemplate } from '../../src/templates/index.js';

describe('renderTemplate', () => {
  it('substitutes known tokens', () => {
    const r = renderTemplate('Bonjour [Prénom], bienvenue chez [Société].', {
      Prénom: 'Jean',
      Société: 'Acme',
    });
    expect(r.text).toBe('Bonjour Jean, bienvenue chez Acme.');
    expect(r.missing).toEqual([]);
  });

  it('matches keys case-insensitively', () => {
    const r = renderTemplate('Bonjour [prénom]', { Prénom: 'Jean' });
    expect(r.text).toBe('Bonjour Jean');
  });

  it('leaves unknown tokens verbatim and reports them', () => {
    const r = renderTemplate('Bonjour [Prénom], échéance [Échéance].', { Prénom: 'Jean' });
    expect(r.text).toBe('Bonjour Jean, échéance [Échéance].');
    expect(r.missing).toEqual(['Échéance']);
  });

  it('treats an empty value as missing (no blank substitution)', () => {
    const r = renderTemplate('Bonjour [Prénom]', { Prénom: '' });
    expect(r.text).toBe('Bonjour [Prénom]');
    expect(r.missing).toEqual(['Prénom']);
  });

  it('does not match across newlines', () => {
    const r = renderTemplate('[Pré\nnom]', { Prénom: 'Jean' });
    expect(r.text).toBe('[Pré\nnom]');
  });
});

describe('renderEmailTemplate', () => {
  it('renders subject + body and merges missing tokens', () => {
    const r = renderEmailTemplate(
      { subject: 'Rapport [Société]', body: 'Bonjour [Prénom], avant le [Échéance].' },
      { Société: 'Acme', Prénom: 'Jean' },
    );
    expect(r.subject).toBe('Rapport Acme');
    expect(r.body).toBe('Bonjour Jean, avant le [Échéance].');
    expect(r.missing).toEqual(['Échéance']);
  });
});
