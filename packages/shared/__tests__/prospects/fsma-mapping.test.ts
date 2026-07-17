import { describe, expect, it } from 'vitest';
import {
  mapFsmaLead,
  normalizeLanguage,
  parseDate,
  type FsmaRow,
} from '../../src/prospects/fsma-mapping.js';

/** A full enriched row; individual tests override what they care about. */
function row(overrides: Partial<FsmaRow> = {}): FsmaRow {
  return {
    numero_bce: '0123.456.789',
    nom: 'Assurman SRL',
    gerant_principal: 'Jan Peeters',
    gerants_tous: 'Jan Peeters, Marie Dubois',
    rue: 'Rue de la Loi 1',
    code_postal: '1000',
    ville: 'Bruxelles',
    pays: 'Belgique',
    forme_juridique: 'SRL',
    types_produits: 'Assurances Vie, Non-Vie',
    fsma_statut: 'inscrit',
    debut_statut: '2015-03-01',
    langue: 'nl',
    province: 'Bruxelles-Capitale',
    tel_gerant: '+32 470 12 34 56',
    tel_societe: '+32 2 123 45 67',
    tel_source: 'prospeo',
    email: 'jan@assurman.be',
    site_web: 'www.assurman.be',
    site_status: 'ok',
    site_summary: 'Courtier généraliste',
    site_quality: 'A',
    linkedin_societe: 'https://linkedin.com/company/assurman',
    linkedin_gerant: 'https://linkedin.com/in/janpeeters',
    instagram: '',
    x_twitter: '',
    activite: 'Courtage assurances',
    taille_equipe: '5',
    statut: 'enriched',
    date_enrichissement: '2026-07-15',
    notes: 'Rappeler après 17h',
    ...overrides,
  };
}

function mustMap(r: FsmaRow, lists: string[] = []) {
  const res = mapFsmaLead(r, lists);
  if ('skipped' in res) throw new Error(`expected a prospect, got skip=${res.skipped}`);
  return res.prospect;
}

describe('mapFsmaLead — skips', () => {
  it('skips a row with no agency name', () => {
    expect(mapFsmaLead(row({ nom: '   ' }))).toEqual({ skipped: 'no-name' });
  });

  it('skips a pending (not-yet-enriched) row', () => {
    expect(mapFsmaLead(row({ statut: 'pending' }))).toEqual({ skipped: 'not-enriched' });
  });

  it('skips a row with a blank status', () => {
    expect(mapFsmaLead(row({ statut: '' }))).toEqual({ skipped: 'not-enriched' });
  });

  it('imports abandoned rows (all worked statuses are kept)', () => {
    expect(mustMap(row({ statut: 'abandoned' })).sourceStatus).toBe('abandoned');
  });

  it('imports partial rows', () => {
    expect(mustMap(row({ statut: 'partial' })).sourceStatus).toBe('partial');
  });
});

describe('mapFsmaLead — agency mapping', () => {
  it('maps the core agency fields', () => {
    const p = mustMap(row());
    expect(p.societe).toBe('Assurman SRL');
    expect(p.bce).toBe('0123.456.789');
    expect(p.verticale).toBe('Courtiers');
    expect(p.pipelineStageOnCreate).toBe('to_contact');
    expect(p.ville).toBe('Bruxelles');
    expect(p.province).toBe('Bruxelles-Capitale');
    expect(p.fsmaStatut).toBe('inscrit');
    expect(p.telSociete).toBe('+32 2 123 45 67');
    expect(p.telSource).toBe('prospeo');
    expect(p.siteInternet).toBe('www.assurman.be');
  });

  it('builds the manager as the primary contact', () => {
    const p = mustMap(row());
    expect(p.contact).toEqual({
      name: 'Jan Peeters',
      email: 'jan@assurman.be',
      phone: '+32 470 12 34 56',
      role: 'Gérant',
      linkedin: 'https://linkedin.com/in/janpeeters',
    });
  });

  it('carries the supplied import list tags', () => {
    const p = mustMap(row(), ['FSMA NL 2026-07']);
    expect(p.lists).toEqual(['FSMA NL 2026-07']);
  });

  it('seeds notes on create only (notesOnCreate, not notes)', () => {
    const p = mustMap(row());
    expect(p.notesOnCreate).toBe('Rappeler après 17h');
    expect(p.notes).toBeUndefined();
  });

  it('leaves empty enrichment cells undefined so a re-import never clears them', () => {
    const p = mustMap(row({ instagram: '', x_twitter: '', site_summary: '' }));
    expect(p.instagram).toBeUndefined();
    expect(p.xTwitter).toBeUndefined();
    expect(p.siteSummary).toBeUndefined();
  });

  it('has no role when there is no manager name', () => {
    const p = mustMap(row({ gerant_principal: '' }));
    expect(p.contact?.name).toBeNull();
    expect(p.contact?.role).toBeNull();
  });
});

describe('normalizeLanguage', () => {
  it('maps tolerant language variants', () => {
    expect(normalizeLanguage('fr')).toBe('FR');
    expect(normalizeLanguage('Français')).toBe('FR');
    expect(normalizeLanguage('nl-BE')).toBe('NL');
    expect(normalizeLanguage('Nederlands')).toBe('NL');
    expect(normalizeLanguage('EN')).toBe('EN');
    expect(normalizeLanguage('English')).toBe('EN');
  });

  it('returns undefined for empty or unknown', () => {
    expect(normalizeLanguage('')).toBeUndefined();
    expect(normalizeLanguage('  ')).toBeUndefined();
    expect(normalizeLanguage('klingon')).toBeUndefined();
  });
});

describe('parseDate', () => {
  it('parses ISO and dd/mm/yyyy', () => {
    expect(parseDate('2026-07-15')?.getFullYear()).toBe(2026);
    const d = parseDate('01/03/2015');
    expect(d?.getFullYear()).toBe(2015);
    expect(d?.getMonth()).toBe(2); // March (0-indexed)
    expect(d?.getDate()).toBe(1);
  });

  it('returns undefined for empty or garbage', () => {
    expect(parseDate('')).toBeUndefined();
    expect(parseDate('not a date')).toBeUndefined();
  });
});
