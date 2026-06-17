import { describe, expect, it } from 'vitest';
import { cleanEmailBody } from '../../src/ingestion/email-cleaner.js';

describe('cleanEmailBody', () => {
  it('converts HTML to plain text and ignores links/images', () => {
    const html = '<p>Bonjour <strong>Jean</strong></p><img src="x.png"><a href="http://x">site</a>';
    const out = cleanEmailBody(html, 'html');
    expect(out).toContain('Bonjour');
    expect(out).toContain('Jean');
    expect(out).not.toContain('http://x');
    expect(out).not.toContain('x.png');
  });

  it('strips an RFC 3676 "-- " signature delimiter and everything after', () => {
    const body = 'Voici la reponse utile.\n\n-- \nSDV\nWeComply\n+32 2 000 00 00';
    const out = cleanEmailBody(body, 'text');
    expect(out).toContain('Voici la reponse utile.');
    expect(out).not.toContain('WeComply');
    expect(out).not.toContain('+32');
  });

  it('strips multilingual sign-offs', () => {
    expect(cleanEmailBody('Reponse.\nCordialement,\nSDV')).toBe('Reponse.');
    expect(cleanEmailBody('Antwoord.\nMet vriendelijke groeten,\nSDV')).toBe('Antwoord.');
    expect(cleanEmailBody('Answer.\nKind regards,\nSDV')).toBe('Answer.');
  });

  it('removes quoted reply lines starting with ">"', () => {
    const body = 'Ma reponse.\n> Question originale\n> deuxieme ligne citee';
    const out = cleanEmailBody(body, 'text');
    expect(out).toBe('Ma reponse.');
  });

  it('removes "-----Original Message-----" blocks', () => {
    const body = 'Reponse.\n-----Original Message-----\nFrom: x\nblah';
    const out = cleanEmailBody(body, 'text');
    expect(out).toBe('Reponse.');
  });

  it('drops a "Le ... a ecrit :" quote header', () => {
    const body = 'Reponse claire.\nLe 10/09/2025 client a ecrit :\nQuestion';
    expect(cleanEmailBody(body, 'text')).toBe('Reponse claire.');
  });

  it('normalises whitespace and trims', () => {
    const body = '  Ligne 1   avec   espaces\n\n\n\nLigne 2  ';
    expect(cleanEmailBody(body, 'text')).toBe('Ligne 1 avec espaces\n\nLigne 2');
  });

  it('returns empty string for empty input', () => {
    expect(cleanEmailBody('', 'text')).toBe('');
  });

  // --- Real-world Outlook cases (from sdv mailbox inspection) ---

  it('strips an accented FR Outlook citation header (De/Envoyé/À/Objet)', () => {
    const body = [
      'Voici les éléments demandés.',
      '',
      'De : Info',
      'Envoyé : mardi 16 juin 2026 12:14',
      'À : simon@example.com',
      'Objet : Police 200K',
      '',
      'Allocation 50/50',
    ].join('\n');
    expect(cleanEmailBody(body, 'text')).toBe('Voici les éléments demandés.');
  });

  it('drops an accented "Le … a écrit :" quote header', () => {
    const body = [
      'Bonjour, 14 ou 22/07 à 10h ?',
      '',
      'Le 16 juin 2026 à 13:32, Sacha De Vleeschouwer <sdv@we-comply.be> a écrit :',
      '',
      'Bonjour Jérôme, merci d’avoir rempli le document.',
    ].join('\n');
    expect(cleanEmailBody(body, 'text')).toBe('Bonjour, 14 ou 22/07 à 10h ?');
  });

  it('strips an English confidentiality disclaimer', () => {
    const body = [
      'Réponse utile sur la conformité FSMA.',
      '',
      'The information contained in this communication is intended solely for the use of the individual to whom it is addressed.',
    ].join('\n');
    const out = cleanEmailBody(body, 'text');
    expect(out).toContain('Réponse utile sur la conformité FSMA.');
    expect(out).not.toMatch(/information contained/i);
  });

  it('strips a French confidentiality disclaimer', () => {
    const body = [
      'Réponse claire.',
      '',
      'Ce message et ses pièces jointes sont confidentiels et destinés exclusivement à leur destinataire.',
    ].join('\n');
    const out = cleanEmailBody(body, 'text');
    expect(out).toBe('Réponse claire.');
  });

  it('keeps accented content intact (folding is only for matching)', () => {
    const body = 'La société doit vérifier l’honorabilité des dirigeants.';
    expect(cleanEmailBody(body, 'text')).toBe(
      'La société doit vérifier l’honorabilité des dirigeants.',
    );
  });
});
