"use client";

import { useMemo, useState, useTransition } from "react";
import { Plus, ThumbsUp, Pencil, Trash2, GripVertical } from "lucide-react";
import { cn } from "@/lib/cn";
import { groupByColumn, nextPosition, positionBefore } from "@/lib/roadmap-board";
import {
  ROADMAP_COLUMNS,
  ROADMAP_THEMES,
  themeStyle,
  type RoadmapItemDTO,
  type RoadmapStatus,
} from "@/lib/roadmap-types";
import {
  addCard,
  archiveCard,
  moveCard,
  saveCard,
  voteCard,
} from "@/lib/roadmap-actions";
import { RoadmapEditor, type EditorValues } from "./roadmap-editor";

type EditorState =
  | { mode: "add"; status: RoadmapStatus }
  | { mode: "edit"; card: RoadmapItemDTO }
  | null;

export function RoadmapBoard({ initialItems }: { initialItems: RoadmapItemDTO[] }) {
  const [items, setItems] = useState<RoadmapItemDTO[]>(initialItems);
  const [themeFilter, setThemeFilter] = useState<string>("");
  const [dragging, setDragging] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<RoadmapStatus | null>(null);
  const [editor, setEditor] = useState<EditorState>(null);
  const [, startTransition] = useTransition();

  // Columns built from the full (unfiltered) state so positions stay correct.
  const columns = useMemo(() => groupByColumn(items), [items]);
  const visible = (col: RoadmapItemDTO[]) =>
    themeFilter ? col.filter((c) => c.theme === themeFilter) : col;

  function move(cardId: string, target: RoadmapStatus, beforeId?: string) {
    const targetItems = columns[target];
    const position = beforeId
      ? positionBefore(targetItems, beforeId, cardId)
      : nextPosition(targetItems.filter((i) => i.id !== cardId));
    setItems((prev) =>
      prev.map((i) => (i.id === cardId ? { ...i, status: target, position } : i)),
    );
    startTransition(() => moveCard(cardId, target, position));
  }

  function vote(card: RoadmapItemDTO) {
    setItems((prev) =>
      prev.map((i) =>
        i.id === card.id
          ? { ...i, votedByMe: !i.votedByMe, votes: i.votes + (i.votedByMe ? -1 : 1) }
          : i,
      ),
    );
    startTransition(async () => {
      const count = await voteCard(card.id);
      setItems((prev) => prev.map((i) => (i.id === card.id ? { ...i, votes: count } : i)));
    });
  }

  function remove(card: RoadmapItemDTO) {
    setItems((prev) => prev.filter((i) => i.id !== card.id));
    startTransition(() => archiveCard(card.id));
  }

  function submitEditor(values: EditorValues) {
    const e = editor;
    if (!e) return;
    if (e.mode === "add") {
      const position = nextPosition(columns[values.status]);
      startTransition(async () => {
        const row = await addCard({
          title: values.title,
          description: values.description,
          theme: values.theme,
          status: values.status,
          position,
        });
        setItems((prev) => [...prev, row]);
      });
    } else {
      const card = e.card;
      const statusChanged = values.status !== card.status;
      const position = statusChanged ? nextPosition(columns[values.status]) : card.position;
      setItems((prev) =>
        prev.map((i) =>
          i.id === card.id
            ? {
                ...i,
                title: values.title,
                description: values.description || null,
                theme: values.theme,
                status: values.status,
                position,
              }
            : i,
        ),
      );
      startTransition(async () => {
        await saveCard(card.id, {
          title: values.title,
          description: values.description,
          theme: values.theme,
        });
        if (statusChanged) await moveCard(card.id, values.status, position);
      });
    }
    setEditor(null);
  }

  return (
    <div>
      {/* Theme filter */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-ink-soft">Thème :</span>
        <FilterChip active={themeFilter === ""} onClick={() => setThemeFilter("")}>
          Tous
        </FilterChip>
        {ROADMAP_THEMES.map((t) => (
          <FilterChip key={t} active={themeFilter === t} onClick={() => setThemeFilter(t)}>
            {t}
          </FilterChip>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {ROADMAP_COLUMNS.map((col) => {
          const cards = visible(columns[col.key]);
          return (
            <section
              key={col.key}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(col.key);
              }}
              onDragLeave={() => setDragOver((s) => (s === col.key ? null : s))}
              onDrop={(e) => {
                e.preventDefault();
                const id = e.dataTransfer.getData("text/plain");
                setDragOver(null);
                setDragging(null);
                if (id) move(id, col.key);
              }}
              className={cn(
                "flex flex-col rounded-lg border bg-line/30 p-2.5 transition-colors",
                dragOver === col.key ? "border-brand-400 bg-brand-50/50" : "border-line",
              )}
            >
              <header className="mb-2 flex items-center justify-between px-1.5 py-1">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-semibold text-ink">{col.label}</h2>
                  <span className="rounded-pill bg-white px-1.5 py-0.5 text-xs font-medium text-ink-soft">
                    {cards.length}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setEditor({ mode: "add", status: col.key })}
                  className="rounded-md p-1 text-ink-soft hover:bg-white hover:text-brand-600"
                  aria-label={`Ajouter dans ${col.label}`}
                  title={`Ajouter dans ${col.label}`}
                >
                  <Plus className="size-4" />
                </button>
              </header>

              <div className="flex flex-1 flex-col gap-2">
                {cards.map((card) => (
                  <article
                    key={card.id}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData("text/plain", card.id);
                      e.dataTransfer.effectAllowed = "move";
                      setDragging(card.id);
                    }}
                    onDragEnd={() => setDragging(null)}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      const id = e.dataTransfer.getData("text/plain");
                      setDragOver(null);
                      setDragging(null);
                      if (id && id !== card.id) move(id, col.key, card.id);
                    }}
                    className={cn(
                      "group rounded-md border border-line bg-white p-2.5 shadow-sm shadow-black/[0.02]",
                      dragging === card.id && "opacity-50",
                    )}
                  >
                    <div className="flex items-start gap-1.5">
                      <GripVertical className="mt-0.5 size-3.5 shrink-0 cursor-grab text-st-na opacity-0 group-hover:opacity-100" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="text-sm font-medium leading-snug text-ink">
                            {card.title}
                          </h3>
                          <div className="flex shrink-0 gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                            <button
                              type="button"
                              onClick={() => setEditor({ mode: "edit", card })}
                              className="rounded p-1 text-ink-soft hover:bg-line/60 hover:text-ink"
                              aria-label="Éditer"
                            >
                              <Pencil className="size-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => remove(card)}
                              className="rounded p-1 text-ink-soft hover:bg-[#fde2e5] hover:text-[#bb1626]"
                              aria-label="Archiver"
                            >
                              <Trash2 className="size-3.5" />
                            </button>
                          </div>
                        </div>

                        {card.description && (
                          <p className="mt-1 line-clamp-3 text-xs leading-relaxed text-ink-soft">
                            {card.description}
                          </p>
                        )}

                        <div className="mt-2 flex items-center gap-1.5">
                          {card.theme && (
                            <span
                              className={cn(
                                "inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-semibold",
                                themeStyle(card.theme),
                              )}
                            >
                              {card.theme}
                            </span>
                          )}
                          {card.sourceRef && (
                            <span className="rounded bg-line/60 px-1.5 py-0.5 text-[10px] font-medium text-ink-soft">
                              {card.sourceRef}
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() => vote(card)}
                            className={cn(
                              "ml-auto inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium transition-colors",
                              card.votedByMe
                                ? "border-brand-500/45 bg-brand-50 text-brand-700"
                                : "border-line bg-white text-ink-soft hover:border-brand-300",
                            )}
                            aria-pressed={card.votedByMe}
                          >
                            <ThumbsUp className="size-3" />
                            {card.votes}
                          </button>
                        </div>
                      </div>
                    </div>
                  </article>
                ))}

                <button
                  type="button"
                  onClick={() => setEditor({ mode: "add", status: col.key })}
                  className="flex items-center gap-1.5 rounded-md border border-dashed border-line px-2.5 py-2 text-xs font-medium text-ink-soft transition-colors hover:border-brand-300 hover:text-brand-600"
                >
                  <Plus className="size-3.5" /> Ajouter
                </button>
              </div>
            </section>
          );
        })}
      </div>

      {editor && (
        <RoadmapEditor
          title={editor.mode === "add" ? "Nouvelle carte" : "Éditer la carte"}
          initial={
            editor.mode === "add"
              ? { title: "", description: "", theme: ROADMAP_THEMES[0], status: editor.status }
              : {
                  title: editor.card.title,
                  description: editor.card.description ?? "",
                  theme: editor.card.theme ?? ROADMAP_THEMES[0],
                  status: editor.card.status,
                }
          }
          onSubmit={submitEditor}
          onClose={() => setEditor(null)}
        />
      )}
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-pill border px-2.5 py-1 text-xs font-medium transition-colors",
        active
          ? "border-brand-500/45 bg-brand-50 text-brand-700"
          : "border-line bg-white text-ink-soft hover:border-brand-300",
      )}
    >
      {children}
    </button>
  );
}
