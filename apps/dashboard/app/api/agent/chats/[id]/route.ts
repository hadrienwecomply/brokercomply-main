import { NextResponse, type NextRequest } from "next/server";
import { archiveChat, getChat, renameChat } from "@/lib/agent-chat.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Full transcript of one conversation. */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  const chat = await getChat(id);
  if (!chat) return new Response("Unknown chat", { status: 404 });
  return NextResponse.json({ chat: chat.chat, messages: chat.messages });
}

/** Rename a conversation. Body: `{ title }`. */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { title?: unknown };
  const title = typeof body.title === "string" ? body.title : "";
  await renameChat(id, title);
  return NextResponse.json({ ok: true });
}

/** Archive (soft-delete) a conversation. */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  await archiveChat(id);
  return NextResponse.json({ ok: true });
}
