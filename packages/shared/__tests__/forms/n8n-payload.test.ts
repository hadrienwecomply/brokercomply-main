import { describe, expect, it } from 'vitest';
import { buildN8nPayload } from '../../src/integrations/index.js';

describe('buildN8nPayload', () => {
  it('shapes a stable contract and normalises missing answer fields to null', () => {
    const payload = buildN8nPayload({
      submissionId: 'uuid-1',
      filloutSubmissionId: 'sub_1',
      formType: 'Onboarding',
      matchMethod: 'domain',
      broker: { id: 'b1', slug: 'cabinet-durand', societe: 'Cabinet Durand', website: 'https://cabinet-durand.be' },
      answers: [
        { questionId: 'q1', name: 'Email', type: 'Email', value: 'a@b.be' },
        { questionId: 'q2', value: 'no name/type' },
      ],
    });

    expect(payload).toEqual({
      submissionId: 'uuid-1',
      filloutSubmissionId: 'sub_1',
      formType: 'Onboarding',
      matchMethod: 'domain',
      broker: { id: 'b1', slug: 'cabinet-durand', societe: 'Cabinet Durand', website: 'https://cabinet-durand.be' },
      answers: [
        { questionId: 'q1', name: 'Email', type: 'Email', value: 'a@b.be' },
        { questionId: 'q2', name: null, type: null, value: 'no name/type' },
      ],
    });
  });

  it('normalises a missing broker website to null', () => {
    const payload = buildN8nPayload({
      submissionId: 'uuid-2',
      filloutSubmissionId: 'sub_2',
      formType: 'Onboarding',
      matchMethod: 'email',
      broker: { id: 'b2', slug: 'no-site', societe: 'No Site' },
      answers: [],
    });

    expect(payload.broker).toEqual({ id: 'b2', slug: 'no-site', societe: 'No Site', website: null });
  });
});
