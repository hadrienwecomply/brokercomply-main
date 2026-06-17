import { ClientSecretCredential } from '@azure/identity';
import { Client } from '@microsoft/microsoft-graph-client';
import { TokenCredentialAuthenticationProvider } from '@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials/index.js';
import { classifyDirection, officerSet } from './direction.js';
import type {
  AttachmentContent,
  EmailSource,
  ListMessagesOptions,
  RawAttachment,
  RawMessage,
} from './types.js';

/** Well-known mail folders read by default. Excludes drafts/deleted/junk. */
export const DEFAULT_FOLDERS = ['inbox', 'sentitems'] as const;

export interface GraphClientConfig {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  /** Well-known folders to read (default: inbox + sentitems). */
  folders?: readonly string[];
  /** Officer mailbox addresses, used to classify message direction. */
  officers?: readonly string[];
  /** Max retries on throttling/transient errors. */
  maxRetries?: number;
}

/** Shape of the Graph `message` resource fields we request. */
interface GraphMessage {
  id: string;
  internetMessageId?: string;
  conversationId?: string;
  parentFolderId?: string;
  subject?: string;
  body?: { contentType?: string; content?: string };
  from?: { emailAddress?: { address?: string } };
  toRecipients?: Array<{ emailAddress?: { address?: string } }>;
  ccRecipients?: Array<{ emailAddress?: { address?: string } }>;
  receivedDateTime?: string;
  hasAttachments?: boolean;
}

interface MessagesPage {
  value: GraphMessage[];
  '@odata.nextLink'?: string;
}

interface GraphAttachment {
  id: string;
  name?: string;
  contentType?: string;
  size?: number;
  '@odata.type'?: string;
  contentBytes?: string;
}

const MESSAGE_SELECT = [
  'id',
  'internetMessageId',
  'conversationId',
  'parentFolderId',
  'subject',
  'body',
  'from',
  'toRecipients',
  'ccRecipients',
  'receivedDateTime',
  'hasAttachments',
].join(',');

function addr(box?: { emailAddress?: { address?: string } }): string {
  return box?.emailAddress?.address ?? '';
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Live Microsoft Graph email source (app-only `Mail.Read`).
 *
 * Iterates the configured well-known folders (default Inbox + Sent Items, which
 * excludes Drafts/Deleted/Junk by construction), follows `@odata.nextLink`
 * pagination, captures `parentFolderId`, classifies each message direction from
 * the officer mailbox list, and fetches attachment bytes on demand. Throttling
 * (429/503) is retried with exponential backoff + jitter, honouring `Retry-After`.
 */
export class GraphEmailClient implements EmailSource {
  private readonly client: Client;
  private readonly maxRetries: number;
  private readonly folders: readonly string[];
  private readonly officers: Set<string>;

  constructor(config: GraphClientConfig) {
    const credential = new ClientSecretCredential(
      config.tenantId,
      config.clientId,
      config.clientSecret,
    );
    const authProvider = new TokenCredentialAuthenticationProvider(credential, {
      scopes: ['https://graph.microsoft.com/.default'],
    });
    this.client = Client.initWithMiddleware({ authProvider });
    this.maxRetries = config.maxRetries ?? 5;
    this.folders = config.folders && config.folders.length ? config.folders : DEFAULT_FOLDERS;
    this.officers = officerSet(config.officers ?? []);
  }

  /** GET with backoff on transient/throttling errors. */
  private async get<T>(requestUrl: string): Promise<T> {
    let attempt = 0;
    for (;;) {
      try {
        return (await this.client.api(requestUrl).get()) as T;
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode;
        const retryable = status === 429 || status === 503 || status === 504;
        if (!retryable || attempt >= this.maxRetries) throw error;
        const retryAfter = Number((error as { headers?: { get?: (k: string) => string } })?.headers?.get?.('retry-after'));
        const backoff = Number.isFinite(retryAfter) && retryAfter > 0
          ? retryAfter * 1000
          : 2 ** attempt * 500;
        const jitter = Math.floor(backoff * 0.25 * Math.random());
        await sleep(backoff + jitter);
        attempt += 1;
      }
    }
  }

  async listMessages(mailbox: string, options: ListMessagesOptions = {}): Promise<RawMessage[]> {
    const filters: string[] = [];
    if (options.since) filters.push(`receivedDateTime ge ${options.since.toISOString()}`);
    if (options.until) filters.push(`receivedDateTime le ${options.until.toISOString()}`);
    const filter = filters.length ? filters.join(' and ') : undefined;

    const out: RawMessage[] = [];
    for (const folder of this.folders) {
      await this.collectFolder(mailbox, folder, filter, options.limit, out);
      if (options.limit && out.length >= options.limit) break;
    }
    return out;
  }

  /** Page through one well-known folder, appending mapped messages to `out`. */
  private async collectFolder(
    mailbox: string,
    folder: string,
    filter: string | undefined,
    limit: number | undefined,
    out: RawMessage[],
  ): Promise<void> {
    const params = new URLSearchParams({
      $select: MESSAGE_SELECT,
      $top: String(Math.min(limit ?? 50, 50)),
      $orderby: 'receivedDateTime desc',
    });
    if (filter) params.set('$filter', filter);

    let url: string | undefined = `/users/${encodeURIComponent(mailbox)}/mailFolders/${encodeURIComponent(
      folder,
    )}/messages?${params.toString()}`;

    while (url) {
      const page: MessagesPage = await this.get<MessagesPage>(url);
      for (const message of page.value ?? []) {
        out.push(await this.toRawMessage(mailbox, message, folder));
        if (limit && out.length >= limit) return;
      }
      url = page['@odata.nextLink'];
    }
  }

  private async toRawMessage(
    mailbox: string,
    message: GraphMessage,
    folder: string,
  ): Promise<RawMessage> {
    let attachments: RawAttachment[] = [];
    if (message.hasAttachments) {
      const list = await this.get<{ value: GraphAttachment[] }>(
        `/users/${encodeURIComponent(mailbox)}/messages/${message.id}/attachments?$select=id,name,contentType,size`,
      );
      attachments = (list.value ?? []).map((a) => ({
        id: a.id,
        name: a.name ?? 'attachment',
        contentType: a.contentType ?? 'application/octet-stream',
        size: a.size ?? 0,
      }));
    }

    const contentType = message.body?.contentType?.toLowerCase() === 'html' ? 'html' : 'text';
    const from = addr(message.from);
    const to = (message.toRecipients ?? []).map(addr).filter(Boolean);
    const cc = (message.ccRecipients ?? []).map(addr).filter(Boolean);
    return {
      id: message.id,
      internetMessageId: message.internetMessageId ?? message.id,
      conversationId: message.conversationId ?? null,
      subject: message.subject ?? '',
      bodyContent: message.body?.content ?? '',
      bodyContentType: contentType,
      from,
      to,
      cc,
      receivedDateTime: message.receivedDateTime ?? new Date(0).toISOString(),
      hasAttachments: Boolean(message.hasAttachments),
      attachments,
      folder,
      parentFolderId: message.parentFolderId ?? null,
      direction: classifyDirection(from, [...to, ...cc], this.officers),
    };
  }

  async getAttachmentContent(
    mailbox: string,
    messageId: string,
    attachmentId: string,
  ): Promise<AttachmentContent | null> {
    const a = await this.get<GraphAttachment>(
      `/users/${encodeURIComponent(mailbox)}/messages/${messageId}/attachments/${attachmentId}`,
    );
    // Only inline file attachments carry contentBytes; skip item/reference types.
    if (!a.contentBytes) return null;
    return {
      name: a.name ?? 'attachment',
      contentType: a.contentType ?? 'application/octet-stream',
      size: a.size ?? 0,
      bytes: Buffer.from(a.contentBytes, 'base64'),
    };
  }
}
