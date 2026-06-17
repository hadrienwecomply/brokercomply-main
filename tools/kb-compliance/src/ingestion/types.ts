import type { MessageDirection } from './direction.js';

/** Normalised attachment metadata (content fetched separately). */
export interface RawAttachment {
  /** Provider-specific attachment id (used to fetch the bytes). */
  id: string;
  name: string;
  contentType: string;
  /** Size in bytes. */
  size: number;
}

/** A normalised email message, provider-agnostic. */
export interface RawMessage {
  /** Provider message id — used to fetch attachments (mailbox-scoped for Graph). */
  id: string;
  /**
   * Stable cross-system message id (RFC 5322 Message-ID). Persisted as
   * `source_documents.message_id` and used for idempotent upserts.
   */
  internetMessageId: string;
  conversationId: string | null;
  subject: string;
  /** Raw body as returned by the provider. */
  bodyContent: string;
  bodyContentType: 'html' | 'text';
  from: string;
  to: string[];
  cc: string[];
  /** ISO-8601 timestamp. */
  receivedDateTime: string;
  hasAttachments: boolean;
  attachments: RawAttachment[];
  /** Well-known folder the message was fetched from (e.g. 'inbox', 'sentitems'). */
  folder?: string;
  /** Graph parent folder id (kept for traceability). */
  parentFolderId?: string | null;
  /** Direction relative to the officer mailboxes (set by the source). */
  direction?: MessageDirection;
}

/** Decoded attachment content. */
export interface AttachmentContent {
  name: string;
  contentType: string;
  size: number;
  bytes: Buffer;
}

export interface ListMessagesOptions {
  since?: Date;
  until?: Date;
  /** Hard cap on the number of messages returned (across pages). */
  limit?: number;
}

/**
 * Source of email messages. Implemented by both the live Microsoft Graph client
 * and the fixture adapter, so the ingestion pipeline is identical in test and
 * production.
 */
export interface EmailSource {
  listMessages(mailbox: string, options?: ListMessagesOptions): Promise<RawMessage[]>;
  getAttachmentContent(
    mailbox: string,
    messageId: string,
    attachmentId: string,
  ): Promise<AttachmentContent | null>;
}
