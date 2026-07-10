"use client";

import { memo, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ArrowUp, Check, Loader2, PenSquare, Sparkles, Trash2, Wrench, X } from "lucide-react";
import { cn } from "@/lib/cn";
import type { AgentChatSummary, AgentChatMessageDTO } from "@/lib/agent-chat.server";

type Block =
  | { type: "text"; text: string }
  | { type: "tool"; name: string; ok: boolean | null }
  // Legacy blocks from earlier turns (kept for backward compatibility).
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
  kb_search: "Base de connaissances",
  kb_get_unit: "Lecture d'une fiche",
  broker_list: "Liste des courtiers",
  broker_get: "Fiche courtier",
  broker_sent_emails: "Emails envoyés",
  website_audit_list: "Audits de site",
  pub_audit_list: "Audits de publicités",
};

const SUGGESTIONS = [
  "Combien de courtiers actifs dans le portefeuille ?",
  "Quelles mentions légales sont obligatoires sur le site d'un courtier crédit ?",
  "Résume l'avancement du plan d'action d'un courtier de ton choix.",
  "Quels audits de publicité sont en attente de relecture ?",
];

function toolLabel(name: string): string {
  const short = name.replace(/^mcp__brokercomply__/, "");
  return TOOL_LABELS[short] ?? short;
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.round(diff / 60000);
  if (m < 1) return "à l'instant";
  if (m < 60) return `il y a ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `il y a ${h} h`;
  const d = Math.round(h / 24);
  if (d < 7) return `il y a ${d} j`;
  return new Date(iso).toLocaleDateString("fr-BE", { day: "numeric", month: "short" });
}

const Markdown = memo(function Markdown({ text }: { text: string }) {
  return (
    <div className="chat-prose">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
    </div>
  );
});

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
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, live, scrollToBottom]);

  // Auto-grow the composer.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [input]);

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
        textareaRef.current?.focus();
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

  const send = useCallback(
    async (raw?: string) => {
      const text = (raw ?? input).trim();
      if (!text || streaming) return;
      setInput("");
      setError(null);
      setStreaming(true);
      setLive([]);

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
            const dataLine = frame.replace(/^data: /, "").trim();
            if (!dataLine || dataLine === "[DONE]") continue;
            let evt: Record<string, unknown>;
            try {
              evt = JSON.parse(dataLine);
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
        setError(`Échec de la conversation : ${(e as Error).message}`);
      } finally {
        setStreaming(false);
        setLive([]);
        if (currentId) {
          await refreshTranscript(currentId);
          await refreshChats();
        }
      }
    },
    [input, streaming, chatId, officer, applyLiveEvent, refreshTranscript, refreshChats, router],
  );

  const deleteChat = useCallback(
    async (id: string, e: React.MouseEvent) => {
      e.stopPropagation();
      await fetch(`/api/agent/chats/${id}`, { method: "DELETE" });
      setChats((c) => c.filter((x) => x.id !== id));
      if (id === chatId) await selectChat(null);
    },
    [chatId, selectChat],
  );

  const isEmpty = messages.length === 0 && live.length === 0 && !streaming;

  return (
    <div className="flex h-[calc(100vh-9rem)] min-h-[500px] overflow-hidden rounded-2xl border border-line bg-white shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
      {/* Sidebar */}
      <aside className="flex w-64 shrink-0 flex-col border-r border-line bg-canvas/60">
        <div className="flex items-center gap-2 px-4 pt-4">
          <span className="grid size-7 place-items-center rounded-lg bg-brand-600 text-white">
            <Sparkles className="size-4" />
          </span>
          <span className="font-display text-sm font-semibold text-ink">Assistant</span>
        </div>
        <div className="p-3">
          <button
            onClick={() => selectChat(null)}
            disabled={streaming}
            className="flex w-full items-center gap-2 rounded-lg border border-line bg-white px-3 py-2 text-sm font-medium text-ink shadow-sm transition-colors hover:border-brand-300 hover:text-brand-700 disabled:opacity-50"
          >
            <PenSquare className="size-4" /> Nouvelle conversation
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
          {chats.length === 0 ? (
            <p className="px-3 py-6 text-center text-xs text-ink-soft/70">
              Aucune conversation pour l'instant.
            </p>
          ) : (
            <ul className="space-y-0.5">
              {chats.map((c) => {
                const active = c.id === chatId;
                return (
                  <li key={c.id}>
                    <button
                      onClick={() => selectChat(c.id)}
                      className={cn(
                        "group flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left transition-colors",
                        active ? "bg-brand-50 text-brand-800" : "text-ink-soft hover:bg-line/50",
                      )}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">
                          {c.title ?? "Nouvelle conversation"}
                        </span>
                        <span className="block truncate text-[11px] text-ink-soft/60">
                          {relativeTime(c.updatedAt)}
                        </span>
                      </span>
                      <span
                        role="button"
                        tabIndex={-1}
                        onClick={(e) => deleteChat(c.id, e)}
                        className="shrink-0 rounded p-1 opacity-0 transition-opacity hover:bg-white group-hover:opacity-100"
                        title="Archiver"
                      >
                        <Trash2 className="size-3.5 text-ink-soft/60 hover:text-st-blocked" />
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </aside>

      {/* Main column */}
      <section className="relative flex min-w-0 flex-1 flex-col">
        <div ref={scrollRef} className="flex-1 overflow-y-auto scroll-smooth">
          <div className="mx-auto w-full max-w-3xl px-6 py-8">
            {isEmpty ? (
              <EmptyState officer={officer} onPick={(s) => void send(s)} disabled={streaming} />
            ) : (
              <div className="space-y-7">
                {messages.map((m) => (
                  <MessageRow key={m.id} message={m} />
                ))}
                {(live.length > 0 || streaming) && <LiveRow items={live} />}
              </div>
            )}
          </div>
        </div>

        {/* Composer */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0">
          <div className="mx-auto w-full max-w-3xl px-6 pb-5">
            {error && (
              <div className="pointer-events-auto mb-2 rounded-lg border border-st-blocked/30 bg-st-blocked/5 px-3 py-2 text-sm text-st-blocked">
                {error}
              </div>
            )}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void send();
              }}
              className="pointer-events-auto rounded-2xl border border-line bg-white p-2 shadow-[0_4px_24px_rgba(31,29,30,0.08)] transition-shadow focus-within:border-brand-300 focus-within:shadow-[0_4px_28px_rgba(76,153,122,0.12)]"
            >
              <div className="flex items-end gap-2">
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void send();
                    }
                  }}
                  rows={1}
                  placeholder="Écrivez à l'assistant conformité…"
                  disabled={streaming}
                  className="max-h-52 flex-1 resize-none bg-transparent px-2.5 py-1.5 text-[0.97rem] leading-relaxed text-ink outline-none placeholder:text-ink-soft/50 disabled:opacity-60"
                />
                <button
                  type="submit"
                  disabled={streaming || !input.trim()}
                  className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand-600 text-white transition-all hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-line disabled:text-ink-soft/40"
                  title="Envoyer"
                >
                  {streaming ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <ArrowUp className="size-4" />
                  )}
                </button>
              </div>
            </form>
            <p className="pointer-events-none mt-1.5 text-center text-[11px] text-ink-soft/50">
              Entrée pour envoyer · Maj+Entrée pour un retour à la ligne · les réponses citent leurs
              sources
            </p>
          </div>
          <div className="pointer-events-none h-4 bg-gradient-to-t from-white to-transparent" />
        </div>
      </section>
    </div>
  );
}

function EmptyState({
  officer,
  onPick,
  disabled,
}: {
  officer: string;
  onPick: (s: string) => void;
  disabled: boolean;
}) {
  const name = officer.split("@")[0];
  return (
    <div className="flex min-h-[calc(100vh-20rem)] flex-col items-center justify-center text-center">
      <span className="mb-5 grid size-14 place-items-center rounded-2xl bg-brand-50 text-brand-600 ring-1 ring-brand-100">
        <Sparkles className="size-7" />
      </span>
      <h2 className="font-display text-2xl font-semibold text-ink">
        Bonjour {name}, comment puis-je aider ?
      </h2>
      <p className="mt-2 max-w-md text-sm text-ink-soft">
        Posez une question de conformité ou interrogez le portefeuille courtiers. Je m'appuie sur la
        base de connaissances de votre cabinet et cite mes sources.
      </p>
      <div className="mt-7 grid w-full max-w-xl grid-cols-1 gap-2 sm:grid-cols-2">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            onClick={() => onPick(s)}
            disabled={disabled}
            className="rounded-xl border border-line bg-white px-4 py-3 text-left text-sm text-ink-soft transition-colors hover:border-brand-300 hover:bg-brand-50/50 hover:text-ink disabled:opacity-50"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

function MessageRow({ message }: { message: AgentChatMessageDTO }) {
  const isUser = message.role === "user";
  const blocks = (message.content ?? []) as Block[];

  if (isUser) {
    const text = blocks
      .filter((b): b is Extract<Block, { type: "text" }> => b.type === "text")
      .map((b) => b.text)
      .join("\n");
    return (
      <div className="msg-in flex justify-end">
        <div className="max-w-[80%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-brand-50 px-4 py-2.5 text-[0.97rem] leading-relaxed text-ink">
          {text}
        </div>
      </div>
    );
  }

  return (
    <div className="msg-in flex gap-3.5">
      <AssistantAvatar />
      <div className="min-w-0 flex-1 space-y-2 pt-0.5">
        {blocks.map((b, i) => {
          if (b.type === "text") return <Markdown key={i} text={b.text} />;
          if (b.type === "tool") return <ToolChip key={i} name={b.name} ok={b.ok} />;
          if (b.type === "tool_use") return <ToolChip key={i} name={b.name} ok={null} />;
          if (b.type === "tool_result") return <ToolChip key={i} name={b.name ?? ""} ok={b.ok} />;
          return null;
        })}
      </div>
    </div>
  );
}

function LiveRow({ items }: { items: LiveItem[] }) {
  const hasText = items.some((i) => i.type === "text");
  return (
    <div className="msg-in flex gap-3.5">
      <AssistantAvatar pulse />
      <div className="min-w-0 flex-1 space-y-2 pt-0.5">
        {items.map((item, i) =>
          item.type === "text" ? (
            <div key={i} className="stream-caret">
              <Markdown text={item.text} />
            </div>
          ) : (
            <ToolChip key={i} name={item.name} ok={item.ok} />
          ),
        )}
        {!hasText && (
          <div className="flex items-center gap-2 py-1 text-sm text-ink-soft/70">
            <span className="inline-flex gap-1">
              <Dot /> <Dot delay="150ms" /> <Dot delay="300ms" />
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function AssistantAvatar({ pulse }: { pulse?: boolean }) {
  return (
    <span
      className={cn(
        "mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg bg-brand-600 text-white",
        pulse && "animate-pulse",
      )}
    >
      <Sparkles className="size-4" />
    </span>
  );
}

function Dot({ delay }: { delay?: string }) {
  return (
    <span
      className="inline-block size-1.5 animate-bounce rounded-full bg-ink-soft/40"
      style={delay ? { animationDelay: delay } : undefined}
    />
  );
}

function ToolChip({ name, ok }: { name: string; ok: boolean | null }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-canvas px-2.5 py-1 text-xs font-medium text-ink-soft">
      {ok === null ? (
        <Wrench className="size-3 animate-pulse text-brand-600" />
      ) : ok ? (
        <Check className="size-3 text-st-done" />
      ) : (
        <X className="size-3 text-st-blocked" />
      )}
      {toolLabel(name)}
    </span>
  );
}
