/**
 * Shared types for the collaborative roadmap Kanban board.
 * Kept free of `server-only` so both the board logic and the UI can import it.
 */

export type RoadmapStatus = "idea" | "planned" | "in_progress" | "done";

export interface RoadmapColumn {
  key: RoadmapStatus;
  label: string;
}

/** The four Kanban columns, left → right. */
export const ROADMAP_COLUMNS: RoadmapColumn[] = [
  { key: "idea", label: "Idées" },
  { key: "planned", label: "Prévu" },
  { key: "in_progress", label: "En cours" },
  { key: "done", label: "Fait" },
];

export const ROADMAP_STATUSES: RoadmapStatus[] = ROADMAP_COLUMNS.map((c) => c.key);

export function isRoadmapStatus(v: string): v is RoadmapStatus {
  return (ROADMAP_STATUSES as string[]).includes(v);
}

/** Themes drive card colour + the theme filter. */
export const ROADMAP_THEMES = ["KB", "Docs", "Pilotage", "Infra", "GTM"] as const;
export type RoadmapTheme = (typeof ROADMAP_THEMES)[number];

/** Tailwind classes per theme (pill). */
export const THEME_STYLE: Record<string, string> = {
  KB: "bg-brand-100 text-brand-700 border-brand-500/40",
  Docs: "bg-purple-100 text-[#3b3f8f] border-purple-500/40",
  Pilotage: "bg-[#fdf1da] text-[#8a5300] border-[#f0ad4e]/55",
  Infra: "bg-[#eef0f2] text-[#4b5159] border-[#d3d7dc]",
  GTM: "bg-[#fde2e5] text-[#bb1626] border-[#ea384c]/45",
};

export function themeStyle(theme?: string | null): string {
  return (theme && THEME_STYLE[theme]) || "bg-[#eef0f2] text-[#6b7280] border-transparent";
}

/** DTO sent to the client — no raw DB rows leak across the server boundary. */
export interface RoadmapItemDTO {
  id: string;
  title: string;
  description: string | null;
  status: RoadmapStatus;
  theme: string | null;
  position: number;
  owner: string | null;
  sourceRef: string | null;
  createdBy: string | null;
  votes: number;
  votedByMe: boolean;
  createdAt: string | null;
  updatedAt: string | null;
}

/** Shape used when seeding / creating a card. */
export interface RoadmapSeedItem {
  title: string;
  description: string;
  status: RoadmapStatus;
  theme: RoadmapTheme;
  sourceRef?: string;
  position: number;
}
