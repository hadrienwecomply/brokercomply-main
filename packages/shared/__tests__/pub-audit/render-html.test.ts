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
});
