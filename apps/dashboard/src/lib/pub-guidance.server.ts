import "server-only";
import { revalidatePath } from "next/cache";
import {
  addPubGuidanceReformulation,
  getPubCalibration,
  getPubPromotionCandidates,
  listPubCheckGuidance,
  markPubReformulationPromoted,
  PUB_CATALOG,
  PUB_CHECK_BY_ID,
  PUB_SECTIONS,
  upsertPubCheckGuidance,
} from "@brokercomply/shared";
import { getDb } from "./db.server";

/** One catalog check joined with its current cabinet guidance, for the Config UI. */
export interface PubGuidanceRow {
  checkId: string;
  intitule: string;
  section: string;
  reformulations: string[];
  consigne: string | null;
  active: boolean;
}

export interface PubGuidanceConfig {
  sections: Array<{ titre: string; rows: PubGuidanceRow[] }>;
  candidates: Array<{ checkId: string; intitule: string; reformulation: string; count: number }>;
  calibration: Array<{ checkId: string; intitule: string; verdictFlips: number }>;
}

/** Load the full pub-guidance config: catalog × guidance, promotion candidates, calibration. */
export async function getPubGuidanceConfig(): Promise<PubGuidanceConfig> {
  const db = getDb();
  const [guidance, candidates, calibration] = await Promise.all([
    listPubCheckGuidance({ db }),
    getPubPromotionCandidates({ db }),
    getPubCalibration({ db }),
  ]);
  const byId = new Map(guidance.map((g) => [g.checkId, g]));

  const sections = PUB_SECTIONS.map((titre) => ({
    titre,
    rows: PUB_CATALOG.filter((c) => c.section === titre).map((c): PubGuidanceRow => {
      const g = byId.get(c.id);
      return {
        checkId: c.id,
        intitule: c.intitule,
        section: c.section,
        reformulations: g?.reformulations ?? [],
        consigne: g?.consigne ?? null,
        active: g?.active ?? true,
      };
    }),
  })).filter((s) => s.rows.length > 0);

  return {
    sections,
    candidates: candidates.map((c) => ({
      checkId: c.checkId,
      intitule: PUB_CHECK_BY_ID[c.checkId]?.intitule ?? c.checkId,
      reformulation: c.reformulation,
      count: c.count,
    })),
    calibration: calibration.map((c) => ({
      checkId: c.checkId,
      intitule: PUB_CHECK_BY_ID[c.checkId]?.intitule ?? c.checkId,
      verdictFlips: c.verdictFlips,
    })),
  };
}

export interface SavePubGuidanceInput {
  checkId: string;
  reformulations: string[];
  consigne: string | null;
  active: boolean;
}

/** Save a check's cabinet guidance (rejects unknown check ids). */
export async function savePubGuidance(input: SavePubGuidanceInput): Promise<{ ok: boolean; error?: string }> {
  if (!PUB_CHECK_BY_ID[input.checkId]) return { ok: false, error: "Check inconnu" };
  await upsertPubCheckGuidance(
    { db: getDb() },
    input.checkId,
    {
      reformulations: input.reformulations,
      consigne: input.consigne,
      active: input.active,
    },
  );
  revalidatePath("/config/pub");
  return { ok: true };
}

/** Promote a suggested reformulation into a check's guidance library (one click). */
export async function promotePubReformulation(
  checkId: string,
  reformulation: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!PUB_CHECK_BY_ID[checkId]) return { ok: false, error: "Check inconnu" };
  const db = getDb();
  await addPubGuidanceReformulation({ db }, checkId, reformulation);
  await markPubReformulationPromoted({ db }, checkId, reformulation);
  revalidatePath("/config/pub");
  return { ok: true };
}
