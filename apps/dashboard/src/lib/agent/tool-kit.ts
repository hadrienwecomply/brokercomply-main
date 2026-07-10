import "server-only";
import { getBroker } from "../brokers.server";
import type { UploadedImage } from "../pub-audit.server";

/** MCP server name — tools are addressed as `mcp__<AGENT_MCP_SERVER>__<tool>`. */
export const AGENT_MCP_SERVER = "brokercomply";

/** Fully-qualify a bare tool name for the `allowedTools` whitelist. */
export function qualify(name: string): string {
  return `mcp__${AGENT_MCP_SERVER}__${name}`;
}

/**
 * Per-turn context injected into every tool factory. `officer` is the cookie
 * identity used for edit attribution / audit; `chatId` correlates side effects
 * to the conversation.
 */
export interface ToolContext {
  officer: string;
  chatId: string | null;
  /** Images attached to THIS turn — the source for `pub_audit_start`. */
  images?: UploadedImage[];
}

/** Result shape returned by an SDK tool handler. */
export type ToolResult = {
  content: Array<{ type: "text"; text: string }>;
  isError?: true;
};

/** Shape a successful tool result as JSON text the agent can read. */
export function ok(data: unknown): ToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

/** Shape a tool error so the agent can recover instead of throwing. */
export function fail(message: string): ToolResult {
  return { content: [{ type: "text", text: message }], isError: true };
}

/** Resolve a broker by slug; throws a readable error when unknown or unpersisted. */
export async function resolveBroker(slug: string) {
  const broker = await getBroker(slug);
  if (!broker) throw new Error(`Aucun courtier avec le slug "${slug}".`);
  if (!broker.dbId) throw new Error(`Le courtier "${slug}" n'est pas encore persisté.`);
  return broker as typeof broker & { dbId: string };
}
