import { describe, expect, it } from 'vitest';
import {
  buildAgencyFields,
  type ProspectImport,
} from '../../src/prospects/service.js';

/**
 * Guards the write path of the importers.
 *
 * `buildAgencyFields` decides which `ProspectImport` field reaches the
 * database. Dropping a key there raises NO type error — the object is a
 * `Partial<NewProspect>`, so a missing field is silently valid. That is exactly
 * how `noShow` disappeared in b5d0858: the mapper kept computing it, the pure
 * planner tests kept passing, and 65 no-show prospects were imported unflagged.
 *
 * The coverage test below fails whenever a field carried by `ProspectImport`
 * stops being written.
 */

const D = (iso: string) => new Date(iso);

/** Every field an import can carry, all set to a distinguishable value. */
function fullImport(): ProspectImport {
  return {
    societe: 'Cabinet Test',
    siteInternet: 'https://test.be',
    verticale: 'Courtiers',
    language: 'FR',
    owner: 'sdv@we-comply.be',
    sourceStatus: 'RELANCE 1',
    pipelineStage: 'offer_sent',
    lostReason: 'budget',
    noShow: true,
    needsReview: true,
    mrr: '120',
    conversionProbability: '50%',
    leadFrom: 'Salon',
    meetingDate: D('2026-05-01T09:00:00.000Z'),
    offerSentAt: D('2026-05-02T09:00:00.000Z'),
    lastReplyAt: D('2026-05-03T09:00:00.000Z'),
    lastReplySubject: 'Re: votre offre',
    calledAt: D('2026-05-04T09:00:00.000Z'),
    notes: 'Rappeler après les congés',
    bce: 'BE 0123.456.749',
    formeJuridique: 'SRL',
    gerantsTous: 'Dupont Jean',
    rue: 'Rue du Test 1',
    codePostal: '1000',
    ville: 'Bruxelles',
    province: 'Brabant',
    pays: 'Belgique',
    fsmaStatut: 'inscrit',
    debutStatut: D('2019-01-01T00:00:00.000Z'),
    typesProduits: 'Vie, Non-vie',
    activite: 'Courtage',
    tailleEquipe: '5-10',
    telSociete: '+32 2 000 00 00',
    telSource: 'site',
    siteStatus: 'ok',
    siteQuality: 'B',
    siteSummary: 'Site vitrine',
    linkedinSociete: 'https://linkedin.com/company/test',
    instagram: '@test',
    xTwitter: '@test',
    dateEnrichissement: D('2026-07-01T00:00:00.000Z'),
  };
}

/**
 * Keys of `ProspectImport` that are deliberately NOT agency columns — they are
 * handled elsewhere in `upsertProspect` (contacts, cumulative list tags,
 * create-only seeds). Everything else must round-trip.
 */
const NOT_AGENCY_COLUMNS = new Set([
  'contact',
  'otherEmails',
  'lists',
  'notesOnCreate',
  'pipelineStageOnCreate',
]);

const CTX = { matchedByEmail: false, nearDuplicate: false, bce: '0123456749' };

describe('buildAgencyFields — field coverage', () => {
  it('writes every field a ProspectImport carries', () => {
    const input = fullImport();
    const written = buildAgencyFields(input, CTX);

    const expected = Object.keys(input).filter((k) => !NOT_AGENCY_COLUMNS.has(k));
    const missing = expected.filter((k) => !(k in written));

    expect(missing).toEqual([]);
  });

  it('persists noShow — the field lost in b5d0858', () => {
    expect(buildAgencyFields(fullImport(), CTX).noShow).toBe(true);
    expect(buildAgencyFields({ ...fullImport(), noShow: false }, CTX).noShow).toBe(false);
  });

  it('persists owner, so an import can hand a prospect to an officer', () => {
    expect(buildAgencyFields(fullImport(), CTX).owner).toBe('sdv@we-comply.be');
  });
});

describe('buildAgencyFields — non-destructive re-import', () => {
  const empty: ProspectImport = { societe: 'Cabinet Test' };

  it('an absent field is omitted rather than written as null', () => {
    const written = buildAgencyFields(empty, {
      matchedByEmail: false,
      nearDuplicate: false,
      bce: null,
    });
    for (const k of ['verticale', 'ville', 'telSociete', 'noShow', 'owner']) {
      expect(written).not.toHaveProperty(k);
    }
  });

  it('never blanks a progress fact when the source cell is empty', () => {
    const written = buildAgencyFields(
      { ...empty, offerSentAt: null, lastReplyAt: null, calledAt: null },
      { matchedByEmail: false, nearDuplicate: false, bce: null },
    );
    expect(written).not.toHaveProperty('offerSentAt');
    expect(written).not.toHaveProperty('lastReplyAt');
    expect(written).not.toHaveProperty('calledAt');
  });

  it('an email match never renames the agency', () => {
    const written = buildAgencyFields(fullImport(), { ...CTX, matchedByEmail: true });
    expect(written).not.toHaveProperty('societe');
  });

  it('a near-duplicate is flagged even when the import did not ask for it', () => {
    const written = buildAgencyFields(
      { ...empty, needsReview: false },
      { matchedByEmail: false, nearDuplicate: true, bce: null },
    );
    expect(written.needsReview).toBe(true);
  });
});
