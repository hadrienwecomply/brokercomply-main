"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Send, Trash2, Wrench, Check, X, Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";
import type { AgentChatSummary, AgentChatMessageDTO } from "@/lib/agent-chat.server";

type Block =
  | { type: "text"; text: string }
  | { type: "tool_use"; name: string; input: unknown }
  | { type: "tool_result"; name: string | null; ok: boolean };

type LiveItem =
  | { type: "text"; text: string }
  | { type: "tool"; name: string; ok: boolean | null };

interface Props {
  initialChats: AgentChatSummary[];
  officer: string;
  activeChatId: string | null;
  initialMessages: AgentChatMessageDTO[];
}

const TOOL_LABELS: Record<string, string> = {
  kb_search: "Recherche base de connaissances",
  kb_get_unit: "Lecture d'une fiche",
  broker_list: "Liste des courtiers",
  broker_get: "Fiche courtier",
  broker_sent_emails: "Emails envoyés",
  website_audit_list: "Audits de site",
  pub_audit_list: "Audits de publicités",
};

function toolLabel(name: string): string {
  const short = name.replace(/^mcp__brokercomply__/, "");
  return TOOL_LABELS[short] ?? short;
}

export function AgentChat({ initialChats, officer, activeChatId, initialMessages }: Props) {
  const router = useRouter();
  const [chats, setChats] = useState<AgentChatSummary[]>(initialChats);
  const [chatId, setChatId] = useState<string | null>(activeChatId);
  const [messages, setMessages] = useState<AgentChatMessageDTO[]>(initialMessages);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [live, setLive] = useState<LiveItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
    });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, live, scrollToBottom]);

  const refreshTranscript = useCallback(async (id: string) => {
    const res = await fetch(`/api/agent/chats/${id}`, { cache: "no-store" });
    if (res.ok) {
      const data = (await res.json()) as { messages: AgentChatMessageDTO[] };
      setMessages(data.messages);
    }
  }, []);

  const refreshChats = useCallback(async () => {
    const res = await fetch("/api/agent/chats", { cache: "no-store" });
    if (res.ok) {
      const data = (await res.json()) as { chats: AgentChatSummary[] };
      setChats(data.chats);
    }
  }, []);

  const selectChat = useCallback(
    async (id: string | null) => {
      if (streaming) return;
      setChatId(id);
      setError(null);
      setLive([]);
      if (id) {
        await refreshTranscript(id);
        router.replace(`/assistant?c=${id}`, { scroll: false });
      } else {
        setMessages([]);
        router.replace(`/assistant`, { scroll: false });
      }
    },
    [streaming, refreshTranscript, router],
  );

  const applyLiveEvent = useCallback(
    (
      evt:
        | { kind: "delta"; text: string }
        | { kind: "tool_use"; name: string }
        | { kind: "tool_result"; name: string | null; ok: boolean },
    ) => {
      setLive((prev) => {
        const next = [...prev];
        if (evt.kind === "delta") {
          const last = next[next.length - 1];
          if (last && last.type === "text") {
            next[next.length - 1] = { type: "text", text: last.text + evt.text };
          } else {
            next.push({ type: "text", text: evt.text });
          }
        } else if (evt.kind === "tool_use") {
          next.push({ type: "tool", name: evt.name, ok: null });
        } else if (evt.kind === "tool_result") {
          for (let i = next.length - 1; i >= 0; i--) {
            const item = next[i];
            if (item.type === "tool" && item.ok === null) {
              next[i] = { type: "tool", name: item.name, ok: evt.ok };
              break;
            }
          }
        }
        return next;
      });
    },
    [],
  );

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || streaming) return;
    setInput("");
    setError(null);
    setStreaming(true);
    setLive([]);

    // Optimistically show the user's message.
    const optimistic: AgentChatMessageDTO = {
      id: `tmp-${Date.now()}`,
      role: "user",
      content: [{ type: "text", text }],
      officer,
      costUsd: null,
      createdAt: new Date().toISOString(),
    };
    setMessages((m) => [...m, optimistic]);

    let currentId = chatId;
    try {
      const res = await fetch("/api/agent/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatId: currentId, message: text }),
      });
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split("\n\n");
        buffer = frames.pop() ?? "";
        for (const frame of frames) {
          const line = frame.replace(/^data: /, "").trim();
          if (!line || line === "[DONE]") continue;
          let evt: Record<string, unknown>;
          try {
            evt = JSON.parse(line);
          } catch {
            continue;
          }
          switch (evt.kind) {
            case "chat":
              currentId = evt.chatId as string;
              setChatId(currentId);
              router.replace(`/assistant?c=${currentId}`, { scroll: false });
              break;
            case "delta":
              applyLiveEvent({ kind: "delta", text: evt.text as string });
              break;
            case "tool_use":
              applyLiveEvent({ kind: "tool_use", name: evt.name as string });
              break;
            case "tool_result":
              applyLiveEvent({
                kind: "tool_result",
                name: (evt.name as string | null) ?? null,
                ok: Boolean(evt.ok),
              });
              break;
            case "error":
              setError(evt.message as string);
              break;
            default:
              break;
          }
        }
      }
    } catch (e) {
      setError(`Échec de la conversation: ${(e as Error).message}`);
    } finally {
      setStreaming(false);
      setLive([]);
      if (currentId) {
        await refreshTranscript(currentId);
        await refreshChats();
      }
    }
  }, [input, streaming, chatId, officer, applyLiveEvent, refreshTranscript, refreshChats, router]);

  const deleteChat = useCallback(
    async (id: string) => {
      await fetch(`/api/agent/chats/${id}`, { method: "DELETE" });
      setChats((c) => c.filter((x) => x.id !== id));
      if (id === chatId) await selectChat(null);
    },
    [chatId, selectChat],
  );

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[260px_1fr]">
      {/* Conversation list */}
      <aside className="flex flex-col gap-2">
        <button
          onClick={() => selectChat(null)}
          disabled={streaming}
          className="flex items-center justify-center gap-2 rounded-md bg-brand-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-700 disabled:opacity-50"
        >
          <Plus className="size-4" /> Nouvelle conversation
        </button>
        <div className="flex flex-col gap-1">
          {chats.length === 0 && (
            <p className="px-2 py-4 text-xs text-ink-soft">Aucune conversation pour l'instant.</p>
          )}
          {chats.map((c) => (
            <div
              key={c.id}
              className={cn(
                "group flex items-center gap-1 rounded-md px-2 py-2 text-sm transition-colors",
                c.id === chatId ? "bg-brand-50 text-brand-700" : "text-ink-soft hover:bg-line/60",
              )}
            >
              <button
                onClick={() => selectChat(c.id)}
                className="flex-1 truncate text-left"
                title={c.title ?? "Sans titre"}
              >
                {c.title ?? "Sans titre"}
              </button>
              <button
                onClick={() => deleteChat(c.id)}
                className="opacity-0 transition-opacity group-hover:opacity-100"
                title="Archiver"
              >
                <Trash2 className="size-3.5 text-ink-soft hover:text-red-600" />
              </button>
            </div>
          ))}
        </div>
      </aside>

      {/* Transcript + composer */}
      <section className="flex h-[calc(100vh-220px)] min-h-[420px] flex-col rounded-xl border border-line bg-white">
        <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto p-5">
          {messages.length === 0 && live.length === 0 && (
            <div className="flex h-full flex-col items-center justify-center text-center text-sm text-ink-soft">
              <p className="max-w-sm">
                Posez une question de conformité, ou demandez l'état du plan d'action d'un courtier.
              </p>
            </div>
          )}
          {messages.map((m) => (
            <MessageBubble key={m.id} message={m} />
          ))}
          {live.length > 0 && <LiveBubble items={live} />}
          {streaming && live.length === 0 && (
            <div className="flex items-center gap-2 text-sm text-ink-soft">
              <Loader2 className="size-4 animate-spin" /> L'assistant réfléchit…
            </div>
          )}
        </div>

        {error && (
          <div className="border-t border-line bg-red-50 px-5 py-2 text-sm text-red-700">{error}</div>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
          className="flex items-end gap-2 border-t border-line p-3"
        >
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            rows={1}
            placeholder="Votre question…"
            disabled={streaming}
            className="max-h-40 flex-1 resize-none rounded-md border border-line px-3 py-2 text-sm outline-none focus:border-brand-400 disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={streaming || !input.trim()}
            className="flex items-center justify-center rounded-md bg-brand-600 px-3 py-2 text-white transition-colors hover:bg-brand-700 disabled:opacity-50"
          >
            {streaming ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          </button>
        </form>
      </section>
    </div>
  );
}

function MessageBubble({ message }: { message: AgentChatMessageDTO }) {
  const isUser = message.role === "user";
  const blocks = (message.content ?? []) as Block[];
  return (
    <div className={cn("flex", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[85%] space-y-2 rounded-2xl px-4 py-2.5 text-sm",
          isUser ? "bg-brand-600 text-white" : "bg-line/40 text-ink",
        )}
      >
        {blocks.map((b, i) => {
          if (b.type === "text") {
            return (
              <p key={i} className="whitespace-pre-wrap leading-relaxed">
                {b.text}
              </p>
            );
          }
          if (b.type === "tool_use") {
            return <ToolChip key={i} name={b.name} ok={null} />;
          }
          if (b.type === "tool_result") {
            return <ToolChip key={i} name={b.name ?? ""} ok={b.ok} />;
          }
          return null;
        })}
      </div>
    </div>
  );
}

function LiveBubble({ items }: { items: LiveItem[] }) {
  return (
    <div className="flex justify-start">
      <div className="max-w-[85%] space-y-2 rounded-2xl bg-line/40 px-4 py-2.5 text-sm text-ink">
        {items.map((item, i) =>
          item.type === "text" ? (
            <p key={i} className="whitespace-pre-wrap leading-relaxed">
              {item.text}
            </p>
          ) : (
            <ToolChip key={i} name={item.name} ok={item.ok} />
          ),
        )}
      </div>
    </div>
  );
}

function ToolChip({ name, ok }: { name: string; ok: boolean | null }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-white/70 px-2 py-0.5 text-xs text-ink-soft ring-1 ring-line">
      {ok === null ? (
        <Wrench className="size-3 animate-pulse" />
      ) : ok ? (
        <Check className="size-3 text-green-600" />
      ) : (
        <X className="size-3 text-red-600" />
      )}
      {toolLabel(name)}
    </span>
  );
}
