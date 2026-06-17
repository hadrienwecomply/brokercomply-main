/** Freshness threshold in months (PRD default — surfaces stale knowledge). */
export const FRESHNESS_MONTHS = 12;

export interface Freshness {
  ageMonths: number | null;
  isFresh: boolean;
}

/** Age (in whole months) of a source date and whether it is within threshold. */
export function freshness(
  sourceDate: string | null | undefined,
  months: number = FRESHNESS_MONTHS,
  now: Date = new Date(),
): Freshness {
  if (!sourceDate) return { ageMonths: null, isFresh: true };
  const d = new Date(sourceDate);
  if (Number.isNaN(d.getTime())) return { ageMonths: null, isFresh: true };
  const ageMonths =
    (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth());
  return { ageMonths, isFresh: ageMonths < months };
}
