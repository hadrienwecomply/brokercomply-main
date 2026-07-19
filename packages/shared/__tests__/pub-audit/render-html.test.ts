import { describe, expect, it } from 'vitest';
import { assemblePubPayload } from '../../src/pub-audit/assemble.js';
import { renderPubHtml } from '../../src/pub-audit/render-html.js';
import type { PubQualification } from '../../src/pub-audit/types.js';

const qualification: PubQualification = {
  format: 'flyer',
  produits: ['credit_conso'],
  elements_fournis: ['visuel'],
  transcription: 'Empruntez malin — « taux imbattable »',
};

function html() {
  const payload = assemblePubPayload({
    qualification,
    rawConstats: [
      { id: 'G8', verdict: 'non_conforme', citation: '« taux imbattable »', reformulation: 'taux compétitif' },
      { id: 'G1', verdict: 'conforme', citation: '« Courtier SA »' },
    ],
    fileName: 'pub.png',
    dateAnalyse: '2026-07-09',
    branding: { firmName: 'Courtier SA', primaryColor: '#123456' },
  });
  return renderPubHtml(payload);
}

function htmlWithImage() {
  const payload = assemblePubPayload({
    qualification,
    rawConstats: [{ id: 'G1', verdict: 'conforme' }],
    fileName: 'pub.png',
    dateAnalyse: '2026-07-09',
  });
  return renderPubHtml({
    ...payload,
    support: { ...payload.support, image: 'data:image/png;base64,AAAA' },
  });
}

describe('renderPubHtml', () => {
  it('emits the editable format tag and contenteditable fields', () => {
    const out = html();
    expect(out).toContain('brokercomply-pub/v1');
    expect(out).toContain('contenteditable="true"');
    expect(out).toContain('id="__cfg"');
    expect(out).toContain('p-verdict'); // verdict selects
  });

  it('renders constats keyed by id for edit round-trip', () => {
    const out = html();
    expect(out).toContain('data-cid="G8"');
    expect(out).toContain('data-cid="G1"');
  });

  it('escapes the brand colour and shows the global level', () => {
    const out = html();
    expect(out).toContain('#123456');
    expect(out).toContain('ne pas diffuser'); // rouge libellé (G8 prohibition)
  });

  it('renders the analysed creative when a support image is provided', () => {
    const out = htmlWithImage();
    expect(out).toContain('class="p-creative"');
    expect(out).toContain('data:image/png;base64,AAAA');
    // ...and omits the figure when there is no image.
    expect(html()).not.toContain('class="p-creative"');
  });

  it('renders the "add constat" affordances and the officer-constat template', () => {
    const out = html();
    // One add button per rendered section, tagged with the section title.
    expect(out).toContain('class="p-add"');
    expect(out).toContain('+ Ajouter un constat');
    expect(out).toContain('data-section="Identité &amp; mentions FSMA"');
    // Catalog constats carry their origin; the cloneable template is present.
    expect(out).toContain('data-origin="catalog"');
    expect(out).toContain('id="p-officer-tpl"');
    // The template is an officer block with an editable intitulé + type select.
    expect(out).toContain('data-origin="officer"');
    expect(out).toContain('class="p-type"');
    expect(out).toContain('class="p-intitule" contenteditable="true"');
    // Client wiring for add/remove/collect is present.
    expect(out).toContain('addOfficerConstat');
    expect(out).toContain('added:');
  });

  it('renders an officer-added constat from the payload as an editable, removable block', () => {
    const payload = assemblePubPayload({
      qualification,
      rawConstats: [{ id: 'G1', verdict: 'conforme' }],
      fileName: 'pub.png',
      dateAnalyse: '2026-07-09',
    });
    const withOfficer = renderPubHtml({
      ...payload,
      constats: [
        ...payload.constats,
        {
          id: 'CUST-demo1',
          intitule: 'Constat maison',
          verdict: 'non_conforme',
          type: 'interdiction',
          section: 'Identité & mentions FSMA',
          base_legale: 'Art. X CDE',
          origin: 'officer',
        },
      ],
    });
    expect(withOfficer).toContain('data-cid="CUST-demo1"');
    expect(withOfficer).toContain('Constat maison');
    expect(withOfficer).toContain('class="p-del"'); // removable
    expect(withOfficer).toContain('p-baselegale'); // editable legal basis
  });

  it('renders the new editable fields and the (hidden) correction row', () => {
    const out = html();
    expect(out).toContain('p-averifier-ou'); // a_verifier_ou editor
    expect(out).toContain('p-commentaire'); // officer commentaire editor
    expect(out).toContain('p-correction-note'); // internal reason textarea
    expect(out).toContain('data-orig='); // verdict select carries its original value
    expect(out).toContain('class="p-field p-correction" hidden'); // reason row hidden by default
  });
});
