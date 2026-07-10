import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm';
import {
  agentChatMessages,
  agentChats,
  agentToolAudit,
  type AgentChatMessageRow,
  type AgentChatRow,
  type Db,
} from '../db/index.js';

export interface AgentChatServiceDeps {
  db: Db;
}

/** A conversation plus its ordered messages (transcript view). */
export interface AgentChatDetail {
  chat: AgentChatRow;
  messages: AgentChatMessageRow[];
}

/** Derive a short title from the first user prompt (trimmed to a single line). */
function deriveTitle(firstMessage: string): string {
  const oneLine = firstMessage.replace(/\s+/g, ' ').trim();
  return oneLine.length > 80 ? `${oneLine.slice(0, 79)}…` : oneLine || 'Nouvelle conversation';
}

/** List the shared, non-archived conversations, most-recently-active first. */
export async function listAgentChats({ db }: AgentChatServiceDeps): Promise<AgentChatRow[]> {
  return db
    .select()
    .from(agentChats)
    .where(isNull(agentChats.archivedAt))
    .orderBy(desc(agentChats.updatedAt));
}

/** Fetch one conversation with its full transcript, or null if unknown/archived. */
export async function getAgentChat(
  { db }: AgentChatServiceDeps,
  chatId: string,
): Promise<AgentChatDetail | null> {
  const [chat] = await db
    .select()
    .from(agentChats)
    .where(and(eq(agentChats.id, chatId), isNull(agentChats.archivedAt)));
  if (!chat) return null;
  const messages = await db
    .select()
    .from(agentChatMessages)
    .where(eq(agentChatMessages.chatId, chatId))
    .orderBy(asc(agentChatMessages.createdAt));
  return { chat, messages };
}

/** Create an empty conversation attributed to the given officer. */
export async function createAgentChat(
  { db }: AgentChatServiceDeps,
  opts: { createdBy: string; title?: string | null },
): Promise<AgentChatRow> {
  const [row] = await db
    .insert(agentChats)
    .values({ createdBy: opts.createdBy, title: opts.title ?? null })
    .returning();
  if (!row) throw new Error('Failed to create agent chat');
  return row;
}

/** Append a message to a conversation and bump the parent's `updatedAt`. */
export async function appendAgentChatMessage(
  { db }: AgentChatServiceDeps,
  input: {
    chatId: string;
    role: 'user' | 'assistant';
    content: unknown[];
    officer?: string | null;
    costUsd?: number | null;
  },
): Promise<AgentChatMessageRow> {
  return db.transaction(async (tx) => {
    const [msg] = await tx
      .insert(agentChatMessages)
      .values({
        chatId: input.chatId,
        role: input.role,
        content: input.content,
        officer: input.officer ?? null,
        costUsd: input.costUsd != null ? String(input.costUsd) : null,
      })
      .returning();
    if (!msg) throw new Error('Failed to append agent chat message');

    // If this is the first user message and the chat has no title yet, seed one.
    const firstText =
      input.role === 'user'
        ? input.content.find(
            (b): b is { type: 'text'; text: string } =>
              typeof b === 'object' &&
              b !== null &&
              (b as { type?: unknown }).type === 'text' &&
              typeof (b as { text?: unknown }).text === 'string',
          )?.text
        : undefined;

    // Update title/cost with SQL-side expressions so concurrent turns on a
    // shared chat can't clobber each other (title only fills when still null;
    // cost increments atomically instead of read-modify-write in JS).
    const set: Partial<typeof agentChats.$inferInsert> = { updatedAt: new Date() };
    if (firstText) {
      set.title = sql`coalesce(${agentChats.title}, ${deriveTitle(firstText)})` as never;
    }
    if (input.costUsd != null) {
      set.totalCostUsd = sql`${agentChats.totalCostUsd} + ${input.costUsd}` as never;
    }
    await tx.update(agentChats).set(set).where(eq(agentChats.id, input.chatId));
    return msg;
  });
}

/** Persist the Agent SDK session id so later turns can resume the conversation. */
export async function setAgentChatSession(
  { db }: AgentChatServiceDeps,
  chatId: string,
  sdkSessionId: string,
): Promise<void> {
  await db
    .update(agentChats)
    .set({ sdkSessionId, updatedAt: new Date() })
    .where(eq(agentChats.id, chatId));
}

/** Rename a conversation (officer edit). */
export async function renameAgentChat(
  { db }: AgentChatServiceDeps,
  chatId: string,
  title: string,
): Promise<void> {
  await db
    .update(agentChats)
    .set({ title: title.trim() || null, updatedAt: new Date() })
    .where(eq(agentChats.id, chatId));
}

/** Soft-delete a conversation (hidden from the shared list). */
export async function archiveAgentChat(
  { db }: AgentChatServiceDeps,
  chatId: string,
): Promise<void> {
  await db
    .update(agentChats)
    .set({ archivedAt: new Date() })
    .where(eq(agentChats.id, chatId));
}

/** Record one tool invocation attempt in the audit trail. Never throws — audit
 * logging must not break the agent turn. */
export async function logAgentToolCall(
  { db }: AgentChatServiceDeps,
  input: {
    chatId: string | null;
    officer: string | null;
    toolName: string;
    input: unknown;
    decision: 'allow' | 'deny' | 'confirm_required' | 'confirmed' | 'rejected';
  },
): Promise<void> {
  try {
    await db.insert(agentToolAudit).values({
      chatId: input.chatId,
      officer: input.officer,
      toolName: input.toolName,
      input: input.input,
      decision: input.decision,
    });
  } catch {
    // Swallow — a failed audit write must never abort the agent.
  }
}
