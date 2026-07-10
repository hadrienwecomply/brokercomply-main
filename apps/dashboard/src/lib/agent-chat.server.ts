import "server-only";
import {
  appendAgentChatMessage,
  archiveAgentChat,
  createAgentChat,
  getAgentChat,
  listAgentChats,
  renameAgentChat,
  setAgentChatSession,
  type AgentChatDetail,
  type AgentChatMessageRow,
  type AgentChatRow,
} from "@brokercomply/shared";
import { getDb } from "./db.server";

/** A conversation summary for the shared list (JSON-safe). */
export interface AgentChatSummary {
  id: string;
  title: string | null;
  createdBy: string;
  totalCostUsd: number;
  updatedAt: string;
}

/** A transcript message for rendering (JSON-safe). */
export interface AgentChatMessageDTO {
  id: string;
  role: string;
  content: unknown[];
  officer: string | null;
  costUsd: number | null;
  createdAt: string;
}

function toSummary(r: AgentChatRow): AgentChatSummary {
  return {
    id: r.id,
    title: r.title,
    createdBy: r.createdBy,
    totalCostUsd: Number(r.totalCostUsd),
    updatedAt: new Date(r.updatedAt).toISOString(),
  };
}

function toMessageDTO(m: AgentChatMessageRow): AgentChatMessageDTO {
  return {
    id: m.id,
    role: m.role,
    content: m.content ?? [],
    officer: m.officer,
    costUsd: m.costUsd != null ? Number(m.costUsd) : null,
    createdAt: new Date(m.createdAt).toISOString(),
  };
}

export async function listChats(): Promise<AgentChatSummary[]> {
  const rows = await listAgentChats({ db: getDb() });
  return rows.map(toSummary);
}

export async function getChat(
  chatId: string,
): Promise<{ chat: AgentChatSummary; sdkSessionId: string | null; messages: AgentChatMessageDTO[] } | null> {
  const detail: AgentChatDetail | null = await getAgentChat({ db: getDb() }, chatId);
  if (!detail) return null;
  return {
    chat: toSummary(detail.chat),
    sdkSessionId: detail.chat.sdkSessionId,
    messages: detail.messages.map(toMessageDTO),
  };
}

export async function createChat(createdBy: string): Promise<AgentChatSummary> {
  const row = await createAgentChat({ db: getDb() }, { createdBy });
  return toSummary(row);
}

export async function appendMessage(input: {
  chatId: string;
  role: "user" | "assistant";
  content: unknown[];
  officer?: string | null;
  costUsd?: number | null;
}): Promise<void> {
  await appendAgentChatMessage({ db: getDb() }, input);
}

export async function saveSession(chatId: string, sdkSessionId: string): Promise<void> {
  await setAgentChatSession({ db: getDb() }, chatId, sdkSessionId);
}

export async function renameChat(chatId: string, title: string): Promise<void> {
  await renameAgentChat({ db: getDb() }, chatId, title);
}

export async function archiveChat(chatId: string): Promise<void> {
  await archiveAgentChat({ db: getDb() }, chatId);
}
