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
    <div>
      <header className="mb-6">
        <h1 className="font-display text-2xl font-semibold text-ink">Assistant</h1>
        <p className="mt-1 text-sm text-ink-soft">
          Conversations partagées entre officers, connectées à la base de connaissances et au
          portefeuille courtiers.
        </p>
      </header>
      <AgentChat
        initialChats={chats}
        officer={officer}
        activeChatId={active?.chat.id ?? null}
        initialMessages={active?.messages ?? []}
      />
    </div>
  );
}
