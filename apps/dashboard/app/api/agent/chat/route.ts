import { type NextRequest } from "next/server";
import { currentOfficer } from "@/lib/officer.server";
import { appendMessage, createChat, getChat, saveSession } from "@/lib/agent-chat.server";
import { runAgentTurn, type AgentEvent } from "@/lib/agent/runner";

// postgres.js + the Agent SDK subprocess need the Node runtime, never Edge.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Persisted display block for an assistant turn. */
type Block =
  | { type: "text"; text: string }
  | { type: "tool_use"; name: string; input: unknown }
  | { type: "tool_result"; name: string | null; ok: boolean };

/**
 * Stream one assistant turn over SSE. Body: `{ chatId?, message }`. Creates the
 * conversation when `chatId` is absent (emitting a `chat` event with the new id),
 * persists the user turn, streams the agent's events, then persists the assembled
 * assistant turn (text + condensed tool markers) and its cost.
 */
export async function POST(req: NextRequest): Promise<Response> {
  const officer = await currentOfficer();

  let body: { chatId?: unknown; message?: unknown };
  try {
    body = await req.json();
  } catch {
    return new Response("Invalid JSON body", { status: 400 });
  }

  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!message) return new Response("Missing message", { status: 400 });

  // Resolve or create the conversation.
  let chatId = typeof body.chatId === "string" ? body.chatId : null;
  let sdkSessionId: string | null = null;
  let created = false;
  if (chatId) {
    const existing = await getChat(chatId);
    if (!existing) return new Response("Unknown chat", { status: 404 });
    sdkSessionId = existing.sdkSessionId;
  } else {
    const chat = await createChat(officer);
    chatId = chat.id;
    created = true;
  }

  // Persist the user turn before streaming so it survives a disconnect.
  await appendMessage({
    chatId,
    role: "user",
    content: [{ type: "text", text: message }],
    officer,
  });

  const abortController = new AbortController();
  req.signal.addEventListener("abort", () => abortController.abort());

  const encoder = new TextEncoder();
  const resolvedChatId = chatId;
  const resolvedSession = sdkSessionId;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: AgentEvent | { kind: "chat"; chatId: string }) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };

      if (created) send({ kind: "chat", chatId: resolvedChatId });

      const blocks: Block[] = [];
      let cost = 0;
      let sessionSaved = Boolean(resolvedSession);

      try {
        for await (const event of runAgentTurn({
          userText: message,
          sdkSessionId: resolvedSession,
          abortController,
        })) {
          send(event);
          switch (event.kind) {
            case "session":
              if (!sessionSaved) {
                sessionSaved = true;
                await saveSession(resolvedChatId, event.sessionId);
              }
              break;
            case "text":
              blocks.push({ type: "text", text: event.text });
              break;
            case "tool_use":
              blocks.push({ type: "tool_use", name: event.name, input: event.input });
              break;
            case "tool_result":
              blocks.push({ type: "tool_result", name: event.name, ok: event.ok });
              break;
            case "done":
              cost = event.cost;
              break;
            default:
              break;
          }
        }

        // Persist the assistant turn (skip if the client aborted mid-stream and
        // nothing was produced).
        if (blocks.length > 0) {
          await appendMessage({
            chatId: resolvedChatId,
            role: "assistant",
            content: blocks,
            costUsd: cost || null,
          });
        }
      } catch (err) {
        send({ kind: "error", message: (err as Error).message });
      } finally {
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      }
    },
    cancel() {
      abortController.abort();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
