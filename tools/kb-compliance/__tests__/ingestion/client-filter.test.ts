import { describe, expect, it } from 'vitest';
import {
  extractEmail,
  matchesAllowlist,
  parseAllowlist,
  threadMatchesClient,
} from '../../src/ingestion/client-filter.js';
import type { Thread } from '../../src/ingestion/thread-builder.js';
import type { RawMessage } from '../../src/ingestion/types.js';

const allowlist = parseAllowlist({
  domains: ['Solidas.be', 'agifin.be'],
  emails: ['directfinmail@gmail.com'],
});

function msg(from: string, to: string[] = [], cc: string[] = []): RawMessage {
  return {
    id: 'x',
    internetMessageId: '<x@host>',
    conversationId: 'c1',
    subject: 's',
    bodyContent: '',
    bodyContentType: 'text',
    from,
    to,
    cc,
    receivedDateTime: '2026-01-01T00:00:00Z',
    hasAttachments: false,
    attachments: [],
  };
}

function thread(messages: RawMessage[]): Thread {
  return { id: 'c1', subject: 's', messages, participants: [] };
}

describe('extractEmail', () => {
  it('returns a bare address lowercased and trimmed', () => {
    expect(extractEmail('  Romain@Solidas.BE ')).toBe('romain@solidas.be');
  });

  it('extracts the address from a "Name <email>" header', () => {
    expect(extractEmail('Frederic Druet <Frederic.Druet@AlliancePatrimoine.be>')).toBe(
      'frederic.druet@alliancepatrimoine.be',
    );
  });

  it('returns null when there is no address', () => {
    expect(extractEmail('')).toBeNull();
    expect(extractEmail('not-an-email')).toBeNull();
    expect(extractEmail(null)).toBeNull();
  });
});

describe('matchesAllowlist', () => {
  it('matches by domain (case-insensitive)', () => {
    expect(matchesAllowlist('ROMAIN@solidas.be', allowlist)).toBe(true);
    expect(matchesAllowlist('someone.else@agifin.be', allowlist)).toBe(true);
  });

  it('matches a colleague at the same domain, not just the listed contact', () => {
    expect(matchesAllowlist('collegue@solidas.be', allowlist)).toBe(true);
  });

  it('matches an exact email even on a generic domain', () => {
    expect(matchesAllowlist('directfinmail@gmail.com', allowlist)).toBe(true);
  });

  it('does NOT match other addresses on a generic domain', () => {
    expect(matchesAllowlist('random@gmail.com', allowlist)).toBe(false);
  });

  it('does not match an out-of-scope address', () => {
    expect(matchesAllowlist('officer@we-comply.be', allowlist)).toBe(false);
    expect(matchesAllowlist('', allowlist)).toBe(false);
  });
});

describe('threadMatchesClient', () => {
  it('matches when a client is the sender', () => {
    expect(threadMatchesClient(thread([msg('romain@solidas.be', ['sdv@we-comply.be'])]), allowlist)).toBe(
      true,
    );
  });

  it('matches when a client is in cc of a later message', () => {
    const t = thread([
      msg('sdv@we-comply.be', ['someone@elsewhere.com']),
      msg('sdv@we-comply.be', ['x@elsewhere.com'], ['bruno.ferrier@agifin.be']),
    ]);
    expect(threadMatchesClient(t, allowlist)).toBe(true);
  });

  it('does not match a thread with no client participant', () => {
    const t = thread([msg('sdv@we-comply.be', ['mvl@we-comply.be'])]);
    expect(threadMatchesClient(t, allowlist)).toBe(false);
  });
});

describe('parseAllowlist', () => {
  it('lowercases, trims and drops blanks', () => {
    const a = parseAllowlist({ domains: [' Solidas.be ', '', 'AGIFIN.BE'], emails: ['  X@Gmail.com '] });
    expect(a.domains.has('solidas.be')).toBe(true);
    expect(a.domains.has('agifin.be')).toBe(true);
    expect(a.domains.has('')).toBe(false);
    expect(a.emails.has('x@gmail.com')).toBe(true);
  });

  it('handles a missing key', () => {
    const a = parseAllowlist({ domains: ['solidas.be'] });
    expect(a.emails.size).toBe(0);
  });
});
