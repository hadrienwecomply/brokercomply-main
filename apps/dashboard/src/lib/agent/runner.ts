import "server-only";
import {
  createSdkMcpServer,
  query,
  type Options,
  type SDKUserMessage,
} from "@anthropic-ai/claude-agent-sdk";
import { config } from "@brokercomply/shared";
import { AGENT_MCP_SERVER, READ_ONLY_TOOLS, READ_ONLY_TOOL_NAMES } from "./tools";

/** Normalized events the runner streams to the SSE route (and, in turn, the UI). */
export type AgentEvent =
  | { kind: "session"; sessionId: string }
  | { kind: "delta"; text: string }
  | { kind: "text"; text: string }
  | { kind: "tool_use"; id: string; name: string; input: unknown }
  | { kind: "tool_result"; toolUseId: string; name: string | null; ok: boolean }
  | { kind: "done"; cost: number; result: string }
  | { kind: "error"; message: string };

const SYSTEM_PROMPT = `Tu es l'assistant de conformité de BrokerComply (WeComply), utilisé en interne par les compliance officers d'un cabinet belge encadrant des courtiers en assurances et en crédit régulés par la FSMA.

Ton rôle : répondre à leurs questions réglementaires et les aider à piloter le portefeuille de courtiers, en t'appuyant EXCLUSIVEMENT sur les outils fournis (préfixés « mcp__brokercomply__ »). Ne prétends jamais avoir effectué une action qu'aucun outil ne permet.

Règles :
- Pour toute question réglementaire (FSMA, Code de droit économique, AR TAEG, loi assurances, RGPD…), utilise « kb_search » puis, si besoin, « kb_get_unit » pour lire la source complète. CITE systématiquement tes sources : mentionne l'auteur, la date source et, quand c'est pertinent, les références réglementaires et l'id de l'unité.
- La base contient parfois des réponses DIVERGENTES de deux officers : présente-les toutes les deux avec leur attribution, ne les fusionne jamais silencieusement.
- Signale la FRAÎCHEUR : si une réponse s'appuie sur une source de plus de 12 mois, préviens qu'elle est potentiellement obsolète.
- Pour les questions sur un courtier, retrouve d'abord son « slug » via « broker_list », puis utilise « broker_get », « broker_sent_emails », « website_audit_list » ou « pub_audit_list ».
- Réponds dans la langue de l'utilisateur (français par défaut ; néerlandais ou anglais s'il écrit ainsi). Sois précis, concis et factuel ; si l'information n'est pas dans la base, dis-le clairement plutôt que d'inventer.`;

/** Resolve the API key from either the Anthropic-specific or generic LLM var. */
function resolveApiKey(): string | undefined {
  return config.ANTHROPIC_API_KEY ?? config.LLM_API_KEY ?? process.env.ANTHROPIC_API_KEY;
}

/** Yield exactly one user turn as the streaming-input prompt the SDK expects. */
async function* singleUserTurn(text: string): AsyncGenerator<SDKUserMessage> {
  yield {
    type: "user",
    message: { role: "user", content: text },
    parent_tool_use_id: null,
  } as SDKUserMessage;
}

export interface RunAgentTurnInput {
  userText: string;
  /** SDK session id to resume, when the conversation already has one. */
  sdkSessionId: string | null;
  abortController: AbortController;
}

/**
 * Run one agent turn and stream normalized events. Wraps the read-only tools in
 * an in-process MCP server, locks the agent to that whitelist (`dontAsk` denies
 * anything else), and disables filesystem settings so the repo's own
 * CLAUDE.md/settings never leak into the assistant.
 */
export async function* runAgentTurn(
  input: RunAgentTurnInput,
): AsyncGenerator<AgentEvent> {
  const apiKey = resolveApiKey();
  if (!apiKey) {
    yield { kind: "error", message: "ANTHROPIC_API_KEY manquante côté serveur." };
    return;
  }

  const server = createSdkMcpServer({
    name: AGENT_MCP_SERVER,
    version: "1.0.0",
    tools: READ_ONLY_TOOLS,
  });

  const options: Options = {
    mcpServers: { [AGENT_MCP_SERVER]: server },
    allowedTools: READ_ONLY_TOOL_NAMES,
    permissionMode: "dontAsk",
    systemPrompt: SYSTEM_PROMPT,
    settingSources: [],
    model: config.LLM_MODEL,
    maxTurns: 12,
    includePartialMessages: true,
    abortController: input.abortController,
    env: { ...process.env, ANTHROPIC_API_KEY: apiKey },
    ...(input.sdkSessionId ? { resume: input.sdkSessionId } : {}),
  };

  // Map tool_use_id → tool name so tool_result events can be labelled.
  const toolNames = new Map<string, string>();
  let sessionEmitted = false;

  try {
    for await (const message of query({ prompt: singleUserTurn(input.userText), options })) {
      switch (message.type) {
        case "system": {
          if (message.subtype === "init" && !sessionEmitted) {
            sessionEmitted = true;
            yield { kind: "session", sessionId: message.session_id };
          }
          break;
        }
        case "stream_event": {
          const ev = message.event;
          if (
            ev.type === "content_block_delta" &&
            ev.delta.type === "text_delta" &&
            ev.delta.text
          ) {
            yield { kind: "delta", text: ev.delta.text };
          }
          break;
        }
        case "assistant": {
          for (const block of message.message.content) {
            if (block.type === "text" && block.text) {
              yield { kind: "text", text: block.text };
            } else if (block.type === "tool_use") {
              // Only surface our own tools; hide harness-internal ones
              // (e.g. ToolSearch) so the transcript stays clean.
              if (!block.name.startsWith(`mcp__${AGENT_MCP_SERVER}__`)) continue;
              toolNames.set(block.id, block.name);
              yield { kind: "tool_use", id: block.id, name: block.name, input: block.input };
            }
          }
          break;
        }
        case "user": {
          // Tool results are injected back as user messages with tool_result blocks.
          const content = message.message.content;
          if (Array.isArray(content)) {
            for (const block of content) {
              if (block.type === "tool_result") {
                // Skip results of hidden internal tools (not in the name map).
                const name = toolNames.get(block.tool_use_id);
                if (!name) continue;
                yield {
                  kind: "tool_result",
                  toolUseId: block.tool_use_id,
                  name,
                  ok: !block.is_error,
                };
              }
            }
          }
          break;
        }
        case "result": {
          if (message.subtype === "success") {
            yield { kind: "done", cost: message.total_cost_usd, result: message.result };
          } else {
            yield {
              kind: "error",
              message: `L'agent s'est arrêté (${message.subtype}).`,
            };
          }
          break;
        }
        default:
          break;
      }
    }
  } catch (e) {
    if (input.abortController.signal.aborted) return;
    yield { kind: "error", message: `Erreur de l'agent: ${(e as Error).message}` };
  }
}
