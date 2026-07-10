import "server-only";
import {
  createSdkMcpServer,
  query,
  type HookCallback,
  type Options,
  type PreToolUseHookInput,
  type SDKUserMessage,
} from "@anthropic-ai/claude-agent-sdk";
import { config, logAgentToolCall } from "@brokercomply/shared";
import { getDb } from "../db.server";
import { AGENT_MCP_SERVER, READ_ONLY_TOOLS, READ_ONLY_TOOL_NAMES } from "./tools";
import { buildWriteTools, WRITE_TOOL_NAMES } from "./tools.write";
import { CONFIRM_TOOL_NAMES, buildActionTools } from "./tools.actions";
import type { ToolContext } from "./tool-kit";
import { createPendingConfirmation } from "./confirmations";

/** Normalized events the runner streams to the SSE route (and, in turn, the UI). */
export type AgentEvent =
  | { kind: "session"; sessionId: string }
  | { kind: "delta"; text: string }
  | { kind: "text"; text: string }
  | { kind: "tool_use"; id: string; name: string; input: unknown }
  | { kind: "tool_result"; toolUseId: string; name: string | null; ok: boolean }
  | { kind: "confirm_required"; id: string; name: string; input: unknown }
  | { kind: "confirm_resolved"; id: string; approved: boolean }
  | { kind: "done"; cost: number; result: string }
  | { kind: "error"; message: string };

const SYSTEM_PROMPT = `Tu es l'assistant de conformité de BrokerComply (WeComply), utilisé en interne par les compliance officers d'un cabinet belge encadrant des courtiers en assurances et en crédit régulés par la FSMA.

Ton rôle : répondre à leurs questions réglementaires et les aider à piloter le portefeuille de courtiers, en t'appuyant EXCLUSIVEMENT sur les outils fournis (préfixés « mcp__brokercomply__ »). Ne prétends jamais avoir effectué une action qu'aucun outil ne permet.

Règles :
- Pour toute question réglementaire (FSMA, Code de droit économique, AR TAEG, loi assurances, RGPD…), utilise « kb_search » puis, si besoin, « kb_get_unit » pour lire la source complète. CITE systématiquement tes sources : mentionne l'auteur, la date source et, quand c'est pertinent, les références réglementaires et l'id de l'unité.
- La base contient parfois des réponses DIVERGENTES de deux officers : présente-les toutes les deux avec leur attribution, ne les fusionne jamais silencieusement.
- Signale la FRAÎCHEUR : si une réponse s'appuie sur une source de plus de 12 mois, préviens qu'elle est potentiellement obsolète.
- Pour les questions sur un courtier, retrouve d'abord son « slug » via « broker_list », puis utilise les outils courtier (« broker_get », etc.). Pour agir sur le plan d'action, utilise les stepId / substepId renvoyés par « broker_get ».
- Certaines actions sont IRRÉVERSIBLES (envoi d'email, lancement d'un audit facturé, génération de PDF) : APPELLE DIRECTEMENT l'outil correspondant quand l'utilisateur le demande — le système affichera automatiquement à l'officer une demande de confirmation explicite (Approuver / Refuser) avant toute exécution. Ne redemande donc PAS la confirmation en texte, et n'annonce pas longuement : déclenche l'outil, il sera gated. Si l'officer refuse, l'outil renverra une erreur : explique-le simplement. Les workflows n8n sont asynchrones : dis « déclenché », pas « terminé ».
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

/** Minimal push/close async queue so hook-originated events (confirmations) can
 * be interleaved into the same stream as the query loop's events. */
class EventQueue<T> {
  private items: T[] = [];
  private resolvers: Array<(r: IteratorResult<T>) => void> = [];
  private closed = false;

  push(item: T): void {
    if (this.closed) return;
    const r = this.resolvers.shift();
    if (r) r({ value: item, done: false });
    else this.items.push(item);
  }

  close(): void {
    this.closed = true;
    let r: ((r: IteratorResult<T>) => void) | undefined;
    while ((r = this.resolvers.shift())) r({ value: undefined as never, done: true });
  }

  async *drain(): AsyncGenerator<T> {
    for (;;) {
      if (this.items.length) {
        yield this.items.shift() as T;
        continue;
      }
      if (this.closed) return;
      const result = await new Promise<IteratorResult<T>>((res) => this.resolvers.push(res));
      if (result.done) return;
      yield result.value;
    }
  }
}

export interface RunAgentTurnInput {
  userText: string;
  sdkSessionId: string | null;
  abortController: AbortController;
  ctx: ToolContext;
}

/**
 * Run one agent turn and stream normalized events. Read-only + reversible write
 * tools are pre-approved (`allowedTools`); irreversible action tools are NOT —
 * the PreToolUse hook audits every call and, for action tools, parks on a
 * confirmation the SSE stream surfaces to the officer before allowing execution.
 */
export async function* runAgentTurn(
  input: RunAgentTurnInput,
): AsyncGenerator<AgentEvent> {
  const apiKey = resolveApiKey();
  if (!apiKey) {
    yield { kind: "error", message: "ANTHROPIC_API_KEY manquante côté serveur." };
    return;
  }

  const { ctx } = input;
  const queue = new EventQueue<AgentEvent>();

  const server = createSdkMcpServer({
    name: AGENT_MCP_SERVER,
    version: "1.0.0",
    tools: [...READ_ONLY_TOOLS, ...buildWriteTools(ctx), ...buildActionTools(ctx)],
  });

  const isOurTool = (name: string) => name.startsWith(`mcp__${AGENT_MCP_SERVER}__`);

  // Single control point: audit every brokercomply tool call and gate the
  // irreversible ones behind an officer confirmation.
  const preToolUse: HookCallback = async (input) => {
    const hookInput = input as PreToolUseHookInput;
    const toolName = hookInput.tool_name;
    if (!isOurTool(toolName)) return {}; // let dontAsk deny anything foreign
    const needsConfirm = CONFIRM_TOOL_NAMES.has(toolName);

    await logAgentToolCall(
      { db: getDb() },
      {
        chatId: ctx.chatId,
        officer: ctx.officer,
        toolName,
        input: hookInput.tool_input,
        decision: needsConfirm ? "confirm_required" : "allow",
      },
    );

    if (!needsConfirm) return {}; // read-only/write: allowed via allowedTools

    const { id, promise } = createPendingConfirmation();
    queue.push({ kind: "confirm_required", id, name: toolName, input: hookInput.tool_input });
    const approved = await promise;
    queue.push({ kind: "confirm_resolved", id, approved });

    await logAgentToolCall(
      { db: getDb() },
      {
        chatId: ctx.chatId,
        officer: ctx.officer,
        toolName,
        input: hookInput.tool_input,
        decision: approved ? "confirmed" : "rejected",
      },
    );

    return {
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: approved ? "allow" : "deny",
        ...(approved ? {} : { permissionDecisionReason: "Action refusée par l'officer." }),
      },
    };
  };

  const options: Options = {
    mcpServers: { [AGENT_MCP_SERVER]: server },
    // Action tools are intentionally NOT pre-approved — the hook gates them.
    allowedTools: [...READ_ONLY_TOOL_NAMES, ...WRITE_TOOL_NAMES],
    permissionMode: "dontAsk",
    systemPrompt: SYSTEM_PROMPT,
    settingSources: [],
    model: config.LLM_MODEL,
    maxTurns: 16,
    includePartialMessages: true,
    abortController: input.abortController,
    env: { ...process.env, ANTHROPIC_API_KEY: apiKey },
    hooks: { PreToolUse: [{ hooks: [preToolUse] }] },
    ...(input.sdkSessionId ? { resume: input.sdkSessionId } : {}),
  };

  const toolNames = new Map<string, string>();
  let sessionEmitted = false;

  // Drive the query loop in the background, funnelling events into the queue so
  // hook-originated confirmation events can interleave with model output.
  const run = (async () => {
    try {
      for await (const message of query({ prompt: singleUserTurn(input.userText), options })) {
        switch (message.type) {
          case "system":
            if (message.subtype === "init" && !sessionEmitted) {
              sessionEmitted = true;
              queue.push({ kind: "session", sessionId: message.session_id });
            }
            break;
          case "stream_event": {
            const ev = message.event;
            if (
              ev.type === "content_block_delta" &&
              ev.delta.type === "text_delta" &&
              ev.delta.text
            ) {
              queue.push({ kind: "delta", text: ev.delta.text });
            }
            break;
          }
          case "assistant":
            for (const block of message.message.content) {
              if (block.type === "text" && block.text) {
                queue.push({ kind: "text", text: block.text });
              } else if (block.type === "tool_use") {
                if (!isOurTool(block.name)) continue;
                toolNames.set(block.id, block.name);
                queue.push({ kind: "tool_use", id: block.id, name: block.name, input: block.input });
              }
            }
            break;
          case "user": {
            const content = message.message.content;
            if (Array.isArray(content)) {
              for (const block of content) {
                if (block.type === "tool_result") {
                  const name = toolNames.get(block.tool_use_id);
                  if (!name) continue;
                  queue.push({
                    kind: "tool_result",
                    toolUseId: block.tool_use_id,
                    name,
                    ok: !block.is_error,
                  });
                }
              }
            }
            break;
          }
          case "result":
            if (message.subtype === "success") {
              queue.push({ kind: "done", cost: message.total_cost_usd, result: message.result });
            } else {
              queue.push({ kind: "error", message: `L'agent s'est arrêté (${message.subtype}).` });
            }
            break;
          default:
            break;
        }
      }
    } catch (e) {
      if (!input.abortController.signal.aborted) {
        queue.push({ kind: "error", message: `Erreur de l'agent: ${(e as Error).message}` });
      }
    } finally {
      queue.close();
    }
  })();

  yield* queue.drain();
  await run;
}
