import { describe, expect, it } from 'vitest';
import { buildThreads, normalizeSubject } from '../../src/ingestion/thread-builder.js';
import type { RawMessage } from '../../src/ingestion/types.js';

function msg(partial: Partial<RawMessage>): RawMessage {
  return {
    id: 'id',
    internetMessageId: '<id@x>',
    conversationId: null,
    subject: 'Subject',
    bodyContent: '',
    bodyContentType: 'text',
    from: 'a@x.be',
    to: ['b@x.be'],
    cc: [],
    receivedDateTime: '2025-01-01T00:00:00Z',
    hasAttachments: false,
    attachments: [],
    ...partial,
  };
}

describe('normalizeSubject', () => {
  it('strips repeated reply/forward prefixes across languages', () => {
    expect(normalizeSubject('RE: Fw: AW: Question IDD')).toBe('question idd');
    expect(normalizeSubject('TR: Antw: Sujet')).toBe('sujet');
    expect(normalizeSubject('Question IDD')).toBe('question idd');
  });
});

describe('buildThreads', () => {
  it('groups by conversationId and sorts messages oldest-first', () => {
    const messages = [
      msg({ id: 'm2', conversationId: 'c1', receivedDateTime: '2025-01-02T00:00:00Z' }),
      msg({ id: 'm1', conversationId: 'c1', receivedDateTime: '2025-01-01T00:00:00Z' }),
    ];
    const threads = buildThreads(messages);
    expect(threads).toHaveLength(1);
    expect(threads[0]!.messages.map((m) => m.id)).toEqual(['m1', 'm2']);
    expect(threads[0]!.subject).toBe(threads[0]!.messages[0]!.subject);
  });

  it('falls back to normalised subject when conversationId is missing', () => {
    const messages = [
      msg({ id: 'm1', conversationId: null, subject: 'Question EGR' }),
      msg({ id: 'm2', conversationId: null, subject: 'RE: Question EGR' }),
    ];
    const threads = buildThreads(messages);
    expect(threads).toHaveLength(1);
    expect(threads[0]!.messages).toHaveLength(2);
  });

  it('keeps unrelated subjects in separate threads', () => {
    const messages = [
      msg({ id: 'm1', conversationId: null, subject: 'Question IDD' }),
      msg({ id: 'm2', conversationId: null, subject: 'Question AMLR' }),
    ];
    expect(buildThreads(messages)).toHaveLength(2);
  });

  it('collects distinct participants', () => {
    const messages = [
      msg({ conversationId: 'c1', from: 'a@x.be', to: ['b@x.be'], cc: ['c@x.be'] }),
      msg({ id: 'm2', conversationId: 'c1', from: 'b@x.be', to: ['a@x.be'], cc: [] }),
    ];
    const [thread] = buildThreads(messages);
    expect(new Set(thread!.participants)).toEqual(new Set(['a@x.be', 'b@x.be', 'c@x.be']));
  });
});
