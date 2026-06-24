import 'server-only';
import {
  getBrokerConversations,
  getLastMailSyncAt,
  type BrokerConversation,
} from '@brokercomply/shared';
import { getDb } from './db.server';

export interface ConversationMessageDTO {
  id: string;
  subject: string | null;
  bodyClean: string | null;
  sender: string | null;
  recipients: string[];
  direction: string | null;
  receivedAt: string | null; // ISO
  webLink: string | null;
  attachmentNames: string[];
}

export interface ConversationDTO {
  key: string;
  subject: string | null;
  participants: string[];
  messageCount: number;
  lastMessageAt: string | null; // ISO
  lastDirection: string | null;
  messages: ConversationMessageDTO[];
}

export interface ConversationsData {
  conversations: ConversationDTO[];
  /** When the delta sync last ran (freshness badge); null if never. */
  lastSyncedAt: string | null;
}

function toDTO(c: BrokerConversation): ConversationDTO {
  return {
    key: c.conversationKey,
    subject: c.subject,
    participants: c.participants,
    messageCount: c.messageCount,
    lastMessageAt: c.lastMessageAt ? c.lastMessageAt.toISOString() : null,
    lastDirection: c.lastDirection,
    messages: c.messages.map((m) => ({
      id: m.id,
      subject: m.subject,
      bodyClean: m.bodyClean,
      sender: m.sender,
      recipients: m.recipients,
      direction: m.direction,
      receivedAt: m.receivedAt ? m.receivedAt.toISOString() : null,
      webLink: m.webLink,
      attachmentNames: m.attachmentNames,
    })),
  };
}

/** The latest email conversations with a broker, plus the last sync time. */
export async function getConversations(brokerDbId: string): Promise<ConversationsData> {
  const db = getDb();
  const [conversations, lastSyncedAt] = await Promise.all([
    getBrokerConversations({ db }, brokerDbId),
    getLastMailSyncAt({ db }),
  ]);
  return {
    conversations: conversations.map(toDTO),
    lastSyncedAt: lastSyncedAt ? new Date(lastSyncedAt).toISOString() : null,
  };
}
