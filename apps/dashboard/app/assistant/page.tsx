import { listChats, getChat } from "@/lib/agent-chat.server";
import { currentOfficer } from "@/lib/officer.server";
import { AgentChat } from "@/components/agent-chat";

export const dynamic = "force-dynamic";

/** The assistant tab — a shared Claude-powered chat over the compliance data. */
export default async function AssistantPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string }>;
}) {
  const { c } = await searchParams;
  const [chats, officer] = await Promise.all([listChats(), currentOfficer()]);
  const active = c ? await getChat(c) : null;

  return (
    <AgentChat
      initialChats={chats}
      officer={officer}
      activeChatId={active?.chat.id ?? null}
      initialMessages={active?.messages ?? []}
    />
  );
}
