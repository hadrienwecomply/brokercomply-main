import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { classifyDirection, officerSet } from './direction.js';
import type {
  AttachmentContent,
  EmailSource,
  ListMessagesOptions,
  RawAttachment,
  RawMessage,
} from './types.js';

/** Officer mailboxes used to classify fixture message direction. */
const DEFAULT_FIXTURE_OFFICERS = ['sdv@we-comply.be', 'mvl@we-comply.be'];

/** Attachment as described in the fixtures JSON (bytes loaded from disk). */
interface FixtureAttachment extends Omit<RawAttachment, 'size'> {
  /** File under fixtures/attachments/. */
  file: string;
  size?: number;
}

interface FixtureMessage extends Omit<RawMessage, 'attachments' | 'hasAttachments'> {
  /** Optional mailbox tag; when set, listMessages filters on it. */
  mailbox?: string;
  attachments?: FixtureAttachment[];
}

interface FixtureFile {
  threads: Array<{ messages: FixtureMessage[] }>;
}

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

/**
 * Offline {@link EmailSource} backed by `fixtures/sample-threads.json`. Lets the
 * full ingestion pipeline run with zero credentials, including real PDF/DOCX
 * attachment bytes read from `fixtures/attachments/`.
 */
export class FixtureEmailSource implements EmailSource {
  private readonly fixturesDir: string;
  private readonly officers: Set<string>;
  private cache: FixtureMessage[] | null = null;

  constructor(
    fixturesDir: string = resolve(PACKAGE_ROOT, 'fixtures'),
    officers: readonly string[] = DEFAULT_FIXTURE_OFFICERS,
  ) {
    this.fixturesDir = fixturesDir;
    this.officers = officerSet(officers);
  }

  private async load(): Promise<FixtureMessage[]> {
    if (this.cache) return this.cache;
    const raw = await readFile(resolve(this.fixturesDir, 'sample-threads.json'), 'utf8');
    const parsed = JSON.parse(raw) as FixtureFile;
    this.cache = parsed.threads.flatMap((t) => t.messages);
    return this.cache;
  }

  private attachmentPath(file: string): string {
    return resolve(this.fixturesDir, 'attachments', file);
  }

  async listMessages(mailbox: string, options: ListMessagesOptions = {}): Promise<RawMessage[]> {
    const messages = await this.load();
    const since = options.since?.getTime();
    const until = options.until?.getTime();

    const result: RawMessage[] = [];
    for (const m of messages) {
      if (m.mailbox && mailbox && m.mailbox !== mailbox) continue;
      const received = new Date(m.receivedDateTime).getTime();
      if (since !== undefined && received < since) continue;
      if (until !== undefined && received > until) continue;

      const attachments: RawAttachment[] = [];
      for (const a of m.attachments ?? []) {
        const size = a.size ?? (await stat(this.attachmentPath(a.file)).then((s) => s.size).catch(() => 0));
        attachments.push({ id: a.id, name: a.name, contentType: a.contentType, size });
      }

      const to = m.to ?? [];
      const cc = m.cc ?? [];
      result.push({
        id: m.id,
        internetMessageId: m.internetMessageId,
        conversationId: m.conversationId ?? null,
        subject: m.subject,
        bodyContent: m.bodyContent,
        bodyContentType: m.bodyContentType,
        from: m.from,
        to,
        cc,
        receivedDateTime: m.receivedDateTime,
        hasAttachments: attachments.length > 0,
        attachments,
        folder: m.mailbox ? undefined : 'fixtures',
        parentFolderId: null,
        direction: classifyDirection(m.from, [...to, ...cc], this.officers),
      });
      if (options.limit && result.length >= options.limit) break;
    }
    return result;
  }

  async getAttachmentContent(
    _mailbox: string,
    messageId: string,
    attachmentId: string,
  ): Promise<AttachmentContent | null> {
    const messages = await this.load();
    const message = messages.find((m) => m.id === messageId);
    const attachment = message?.attachments?.find((a) => a.id === attachmentId);
    if (!attachment) return null;

    const bytes = await readFile(this.attachmentPath(attachment.file)).catch(() => null);
    if (!bytes) return null;
    return {
      name: attachment.name,
      contentType: attachment.contentType,
      size: bytes.length,
      bytes,
    };
  }
}
