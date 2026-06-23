import { describe, expect, it } from 'vitest';
import { buildN8nPayload } from '../../src/integrations/index.js';

describe('buildN8nPayload', () => {
  it('shapes a stable contract and normalises missing answer fields to null', () => {
    const payload = buildN8nPayload({
      submissionId: 'uuid-1',
      filloutSubmissionId: 'sub_1',
      formType: 'Onboarding',
      matchMethod: 'domain',
      broker: { id: 'b1', slug: 'cabinet-durand', societe: 'Cabinet Durand' },
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
      broker: { id: 'b1', slug: 'cabinet-durand', societe: 'Cabinet Durand' },
      answers: [
        { questionId: 'q1', name: 'Email', type: 'Email', value: 'a@b.be' },
        { questionId: 'q2', name: null, type: null, value: 'no name/type' },
      ],
    });
  });
});
