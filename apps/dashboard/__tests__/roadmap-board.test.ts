import { describe, expect, it } from "vitest";
import {
  groupByColumn,
  nextPosition,
  positionBefore,
} from "../src/lib/roadmap-board";
import { ROADMAP_SEED } from "../src/lib/roadmap-template";
import {
  ROADMAP_STATUSES,
  ROADMAP_THEMES,
  isRoadmapStatus,
  type RoadmapItemDTO,
  type RoadmapStatus,
} from "../src/lib/roadmap-types";

function card(id: string, status: RoadmapStatus, position: number): RoadmapItemDTO {
  return {
    id,
    title: id,
    description: null,
    status,
    theme: null,
    position,
    owner: null,
    sourceRef: null,
    createdBy: null,
    votes: 0,
    votedByMe: false,
    createdAt: null,
    updatedAt: null,
  };
}

describe("groupByColumn", () => {
  it("buckets cards by status and sorts each column by position", () => {
    const items = [
      card("a", "idea", 2),
      card("b", "idea", 0),
      card("c", "done", 1),
      card("d", "in_progress", 5),
    ];
    const cols = groupByColumn(items);
    expect(cols.idea.map((c) => c.id)).toEqual(["b", "a"]);
    expect(cols.done.map((c) => c.id)).toEqual(["c"]);
    expect(cols.in_progress.map((c) => c.id)).toEqual(["d"]);
    expect(cols.planned).toEqual([]);
  });

  it("always returns all four columns", () => {
    const cols = groupByColumn([]);
    expect(Object.keys(cols).sort()).toEqual(
      [...ROADMAP_STATUSES].sort(),
    );
  });
});

describe("nextPosition", () => {
  it("is 0 for an empty column", () => {
    expect(nextPosition([])).toBe(0);
  });
  it("is max + 1 otherwise", () => {
    expect(nextPosition([card("a", "idea", 3), card("b", "idea", 7)])).toBe(8);
  });
});

describe("positionBefore", () => {
  const col = [card("a", "idea", 0), card("b", "idea", 10), card("c", "idea", 20)];

  it("drops at the end when no anchor", () => {
    expect(positionBefore(col, undefined, "x")).toBe(21);
  });

  it("computes a midpoint between neighbours", () => {
    // before "c" (20), previous is "b" (10) -> 15
    expect(positionBefore(col, "c", "x")).toBe(15);
  });

  it("goes below the first when dropping before the head", () => {
    // before "a" (0), no previous -> -1 .. 0 midpoint = -0.5
    expect(positionBefore(col, "a", "x")).toBe(-0.5);
  });

  it("ignores the moving card itself", () => {
    // moving "b": ordered without b = [a(0), c(20)], before c -> prev a(0) -> 10
    expect(positionBefore(col, "c", "b")).toBe(10);
  });
});

describe("ROADMAP_SEED template", () => {
  it("has cards in every column", () => {
    const byStatus = groupByColumn(
      ROADMAP_SEED.map((s, i) => card(`${i}`, s.status, s.position)),
    );
    for (const status of ROADMAP_STATUSES) {
      expect(byStatus[status].length).toBeGreaterThan(0);
    }
  });

  it("only uses valid statuses and known themes, with non-empty titles", () => {
    for (const s of ROADMAP_SEED) {
      expect(isRoadmapStatus(s.status)).toBe(true);
      expect(ROADMAP_THEMES).toContain(s.theme);
      expect(s.title.trim().length).toBeGreaterThan(0);
    }
  });
});
