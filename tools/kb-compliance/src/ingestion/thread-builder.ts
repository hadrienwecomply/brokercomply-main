import type { RawMessage } from './types.js';

export interface Thread {
  /** conversationId when available, otherwise a key derived from the subject. */
  id: string;
  subject: string;
  /** Messages sorted by receivedDateTime ascending (oldest first). */
  messages: RawMessage[];
  /** Distinct participant addresses across the thread. */
  participants: string[];
}

/** Reply/forward prefixes across FR/NL/EN/DE mail clients. */
const SUBJECT_PREFIX = /^\s*(re|fw|fwd|aw|tr|antw|ref)\s*(\[\d+\])?\s*:\s*/i;

/** Strip leading Re:/Fw:/AW:/TR:/Antw: prefixes (possibly repeated) and normalise. */
export function normalizeSubject(subject: string): string {
  let s = subject ?? '';
  let prev: string;
  do {
    prev = s;
    s = s.replace(SUBJECT_PREFIX, '');
  } while (s !== prev);
  return s.trim().replace(/\s+/g, ' ').toLowerCase();
}

function threadKey(message: RawMessage): string {
  if (message.conversationId) return `conv:${message.conversationId}`;
  const normalized = normalizeSubject(message.subject);
  return `subj:${normalized || message.internetMessageId}`;
}

/**
 * Group messages into threads by `conversationId`, falling back to a normalised
 * subject when the conversation id is missing. Messages within each thread are
 * sorted oldest-first; the thread subject is taken from its earliest message.
 */
export function buildThreads(messages: RawMessage[]): Thread[] {
  const groups = new Map<string, RawMessage[]>();
  for (const message of messages) {
    const key = threadKey(message);
    const bucket = groups.get(key);
    if (bucket) bucket.push(message);
    else groups.set(key, [message]);
  }

  const threads: Thread[] = [];
  for (const [key, bucket] of groups) {
    bucket.sort(
      (a, b) => new Date(a.receivedDateTime).getTime() - new Date(b.receivedDateTime).getTime(),
    );
    const first = bucket[0]!;
    const participants = [
      ...new Set(bucket.flatMap((m) => [m.from, ...m.to, ...m.cc]).filter(Boolean)),
    ];
    threads.push({
      id: first.conversationId ?? key,
      subject: first.subject,
      messages: bucket,
      participants,
    });
  }
  return threads;
}
