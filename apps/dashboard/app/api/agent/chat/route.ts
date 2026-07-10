import { type NextRequest } from "next/server";
import { currentOfficer } from "@/lib/officer.server";
import { appendMessage, createChat, getChat, saveSession } from "@/lib/agent-chat.server";
import { runAgentTurn, type AgentEvent } from "@/lib/agent/runner";

// postgres.js + the Agent SDK subprocess need the Node runtime, never Edge.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Persisted display block for an assistant turn. A tool call and its result are
 * merged into one `tool` block (ok:null until the result lands). */
type Block =
  | { type: "text"; text: string }
  | { type: "tool"; name: string; ok: boolean | null };

/** An image attached to a user turn (base64 kept out of the persisted transcript). */
interface UploadedImage {
  fileName: string;
  base64: string;
  mimeType: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Generous upper bound on a single prompt (bounds per-turn spend). */
const MAX_MESSAGE_CHARS = 8000;
const MAX_IMAGES = 10;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const ALLOWED_MIME = new Set(["image/png", "image/jpeg", "image/webp"]);

/** Validate + clamp the attached images from the request body. */
function parseImages(raw: unknown): UploadedImage[] {
  if (!Array.isArray(raw)) return [];
  const out: UploadedImage[] = [];
  for (const item of raw.slice(0, MAX_IMAGES)) {
    if (!item || typeof item !== "object") continue;
    const { fileName, base64, mimeType } = item as Record<string, unknown>;
    if (typeof base64 !== "string" || typeof mimeType !== "string") continue;
    if (!ALLOWED_MIME.has(mimeType)) continue;
    // base64 length ≈ 4/3 of byte size; reject over-sized before decoding.
    if (base64.length > (MAX_IMAGE_BYTES * 4) / 3) continue;
    out.push({
      fileName: typeof fileName === "string" && fileName ? fileName : "image",
      base64,
      mimeType,
    });
  }
  return out;
}

/**
 * Chats with a turn currently streaming. Shared chats are hit by 2-3 officers;
 * one in-flight turn per chat avoids concurrent agent runs racing on the same
 * session id / cost total. In-process is enough for the single-node deployment.
 */
const inFlight = new Set<string>();

/**
 * Stream one assistant turn over SSE. Body: `{ chatId?, message }`. Creates the
 * conversation when `chatId` is absent (emitting a `chat` event with the new id),
 * persists the user turn, streams the agent's events, then persists the assembled
 * assistant turn (text + condensed tool markers) and its cost — even if the
 * client disconnected mid-stream, so a spent response is never silently lost.
 */
export async function POST(req: NextRequest): Promise<Response> {
  const officer = await currentOfficer();

  let body: { chatId?: unknown; message?: unknown; images?: unknown };
  try {
    body = await req.json();
  } catch {
    return new Response("Invalid JSON body", { status: 400 });
  }

  const message = typeof body.message === "string" ? body.message.trim() : "";
  const images = parseImages(body.images);
  if (!message && images.length === 0) return new Response("Missing message", { status: 400 });
  if (message.length > MAX_MESSAGE_CHARS) {
    return new Response(`Message too long (max ${MAX_MESSAGE_CHARS} chars)`, { status: 413 });
  }

  // Resolve or create the conversation.
  let chatId = typeof body.chatId === "string" ? body.chatId : null;
  if (chatId && !UUID_RE.test(chatId)) return new Response("Invalid chat id", { status: 400 });

  let sdkSessionId: string | null = null;
  let created = false;
  if (chatId) {
    const existing = await getChat(chatId);
    if (!existing) return new Response("Unknown chat", { status: 404 });
    if (inFlight.has(chatId)) {
      return new Response("A turn is already in progress for this conversation", { status: 409 });
    }
    sdkSessionId = existing.sdkSessionId;
  } else {
    const chat = await createChat(officer);
    chatId = chat.id;
    created = true;
  }

  // Persist the user turn before streaming so it survives a disconnect. The
  // image bytes are NOT stored on the message (they'd bloat the transcript); a
  // lightweight attachments marker records that images were sent.
  const userContent: unknown[] = [{ type: "text", text: message }];
  if (images.length > 0) {
    userContent.push({ type: "attachments", names: images.map((i) => i.fileName) });
  }
  await appendMessage({ chatId, role: "user", content: userContent, officer });

  // Tell the model images are attached so it can offer pub_audit_start.
  const promptText =
    images.length > 0
      ? `${message || "(pas de texte)"}\n\n[${images.length} image(s) publicitaire(s) jointe(s) : ${images
          .map((i) => i.fileName)
          .join(", ")}. Pour lancer un audit de conformité de ces publicités, utilise l'outil pub_audit_start avec le slug du courtier concerné.]`
      : message;

  const abortController = new AbortController();
  req.signal.addEventListener("abort", () => abortController.abort());

  const encoder = new TextEncoder();
  const resolvedChatId = chatId;
  const resolvedSession = sdkSessionId;
  inFlight.add(resolvedChatId);

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      // Enqueue best-effort: once the client is gone the controller throws, but
      // we must keep collecting blocks and persist the turn regardless.
      let clientGone = false;
      const send = (event: AgentEvent | { kind: "chat"; chatId: string }) => {
        if (clientGone) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          clientGone = true;
        }
      };

      if (created) send({ kind: "chat", chatId: resolvedChatId });

      const blocks: Block[] = [];
      let cost = 0;
      let savedSession = resolvedSession;

      try {
        for await (const event of runAgentTurn({
          userText: promptText,
          sdkSessionId: resolvedSession,
          abortController,
          ctx: { officer, chatId: resolvedChatId, images },
        })) {
          send(event);
          switch (event.kind) {
            case "session":
              // Always track the latest session id (a resumed run may report a
              // different one); never let a stale id block the next turn.
              if (event.sessionId && event.sessionId !== savedSession) {
                savedSession = event.sessionId;
                await saveSession(resolvedChatId, event.sessionId);
              }
              break;
            case "text":
              blocks.push({ type: "text", text: event.text });
              break;
            case "tool_use":
              blocks.push({ type: "tool", name: event.name, ok: null });
              break;
            case "tool_result": {
              // Merge into the matching pending tool block (mirrors the live UI).
              const pending = [...blocks]
                .reverse()
                .find((b): b is Extract<Block, { type: "tool" }> => b.type === "tool" && b.ok === null);
              if (pending) pending.ok = event.ok;
              else blocks.push({ type: "tool", name: event.name ?? "", ok: event.ok });
              break;
            }
            case "done":
              cost = event.cost;
              break;
            default:
              break;
          }
        }
      } catch (err) {
        send({ kind: "error", message: (err as Error).message });
      } finally {
        // Persist whatever the agent produced, even on client disconnect.
        if (blocks.length > 0) {
          try {
            await appendMessage({
              chatId: resolvedChatId,
              role: "assistant",
              content: blocks,
              costUsd: cost || null,
            });
          } catch {
            // Nothing more we can do; the user turn is already persisted.
          }
        }
        inFlight.delete(resolvedChatId);
        if (!clientGone) {
          try {
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          } catch {
            /* client already gone */
          }
        }
        try {
          controller.close();
        } catch {
          /* already closed */
        }
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
