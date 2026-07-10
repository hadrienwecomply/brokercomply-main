import { NextResponse } from "next/server";
import { currentOfficer } from "@/lib/officer.server";
import { createChat, listChats } from "@/lib/agent-chat.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Shared list of conversations, most-recently-active first. */
export async function GET(): Promise<Response> {
  const chats = await listChats();
  return NextResponse.json({ chats });
}

/** Create an empty conversation attributed to the current officer. */
export async function POST(): Promise<Response> {
  const officer = await currentOfficer();
  const chat = await createChat(officer);
  return NextResponse.json({ chat });
}
