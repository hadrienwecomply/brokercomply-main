/**
 * Pure board logic (no DB, no React) — easy to unit test.
 */
import {
  ROADMAP_COLUMNS,
  type RoadmapItemDTO,
  type RoadmapStatus,
} from "./roadmap-types";

export type BoardColumns = Record<RoadmapStatus, RoadmapItemDTO[]>;

/** Group items into the four columns, each sorted by ascending position. */
export function groupByColumn(items: RoadmapItemDTO[]): BoardColumns {
  const cols = {
    idea: [],
    planned: [],
    in_progress: [],
    done: [],
  } as BoardColumns;
  for (const item of items) {
    (cols[item.status] ?? cols.idea).push(item);
  }
  for (const key of Object.keys(cols) as RoadmapStatus[]) {
    cols[key].sort((a, b) => a.position - b.position);
  }
  return cols;
}

/**
 * Position to append a new card at the end of a column.
 * Lower position = higher in the column, so "end" = max + 1.
 */
export function nextPosition(itemsInColumn: RoadmapItemDTO[]): number {
  if (itemsInColumn.length === 0) return 0;
  return Math.max(...itemsInColumn.map((i) => i.position)) + 1;
}

/**
 * Position that drops `target` just before `before` within a column. When
 * `before` is undefined the card lands at the end. Uses the midpoint between
 * neighbours so we never have to renumber the whole column.
 */
export function positionBefore(
  columnItems: RoadmapItemDTO[],
  beforeId: string | undefined,
  movingId: string,
): number {
  const ordered = columnItems
    .filter((i) => i.id !== movingId)
    .sort((a, b) => a.position - b.position);
  if (!beforeId) return nextPosition(ordered);
  const idx = ordered.findIndex((i) => i.id === beforeId);
  if (idx === -1) return nextPosition(ordered);
  const prev = idx === 0 ? ordered[0].position - 1 : ordered[idx - 1].position;
  const next = ordered[idx].position;
  return (prev + next) / 2;
}

export function totalVotes(items: RoadmapItemDTO[]): number {
  return items.reduce((sum, i) => sum + i.votes, 0);
}

export { ROADMAP_COLUMNS };
