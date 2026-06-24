import type { StepStatus, SubStepStatus } from "./types";

export const STATUS_LABEL: Record<StepStatus, string> = {
  not_started: "Pas commencé",
  in_progress: "En cours",
  waiting_client: "En attente client",
  blocked: "Bloqué",
  done: "Terminé",
  empty: "Aucune tâche",
};

/** Tailwind classes per status (text + bg + border) — AA contrast, harmonized with brand. */
export const STATUS_STYLE: Record<StepStatus, string> = {
  not_started: "bg-[#eef0f2] text-[#4b5159] border-[#d3d7dc]",
  in_progress: "bg-purple-100 text-[#3b3f8f] border-purple-500/45",
  waiting_client: "bg-[#fdf1da] text-[#8a5300] border-[#f0ad4e]/55",
  blocked: "bg-[#fde2e5] text-[#bb1626] border-[#ea384c]/55 font-semibold",
  done: "bg-brand-100 text-brand-700 border-brand-500/45",
  empty: "bg-[#eef0f2] text-[#6b7280] border-transparent",
};

/** Solid dot color per status. */
export const STATUS_DOT: Record<StepStatus, string> = {
  not_started: "bg-st-todo",
  in_progress: "bg-st-progress",
  waiting_client: "bg-st-waiting",
  blocked: "bg-st-blocked",
  done: "bg-st-done",
  empty: "bg-st-na",
};

const dateFmt = new Intl.DateTimeFormat("fr-BE", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

export function formatDate(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : dateFmt.format(d);
}

const eur = new Intl.NumberFormat("fr-BE", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

export function formatEur(n: number): string {
  return eur.format(n);
}

export function flag(country: string): string {
  switch (country) {
    case "BE":
      return "🇧🇪";
    case "LU":
      return "🇱🇺";
    case "FR":
      return "🇫🇷";
    default:
      return country;
  }
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

export function isSubActionable(status: SubStepStatus): boolean {
  return status === "not_started" || status === "in_progress" || status === "blocked";
}
