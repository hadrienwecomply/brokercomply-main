/**
 * Import the REAL action-plan statuses from the Notion "Pilotage courtier - Full"
 * databases into Postgres, replacing the synthetic seed progress.
 *
 * Scope: action plan only — broker fields are never touched. Brokers are matched
 * to existing rows by slug (brokerSlug of the Notion "Société"); unmatched
 * brokers are reported and skipped, never created.
 *
 * Granularity: Notion tracks status per SECTION; we broadcast that status onto
 * every (non-archived) sub-step of the section. Deadline → step deadline_override,
 * Suivi → notes of the section's first sub-step.
 *
 * Source of truth = Notion: every matched broker is first RESET to not_started,
 * then the meaningful statuses are applied — so sections Notion does not cover
 * (e.g. "10") end up not_started rather than keeping stale seed values.
 *
 * Two modes:
 *   - live   : when NOTION_API_KEY is set, query Notion directly (re-runnable).
 *   - offline: otherwise read scripts/notion-plan-snapshot.json (a captured
 *              snapshot of the meaningful rows). Refresh it from Notion anytime.
 *
 * Run: pnpm -F @brokercomply/dashboard exec tsx scripts/import-notion-plan.ts
 *      (dry-run by default — add --apply to write)
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createDb,
  createNotionClient,
  fetchNotionPlan,
  listBrokerPlans,
  loadConfig,
  resetBrokerPlanStatuses,
  setStepDeadlineOverride,
  setSubstepStatus,
  type BrokerPlan,
} from "@brokercomply/shared";
import { brokerSlug } from "../src/lib/slug.js";

/** A plan status row, shape shared by the live fetch and the snapshot file. */
interface PlanRow {
  societe: string;
  code: string;
  status: string;
  deadline: string | null;
  suivi: string | null;
}

/**
 * Manual slug reconciliation for brokers whose Notion "Société" differs from the
 * seeded company name (same broker, different label). Notion slug → DB slug.
 */
const SLUG_ALIASES: Record<string, string> = {
  "jean-louis-cloes": "cloes-consult",
};

interface Outcome {
  applied: number; // sections whose sub-steps were updated
  noSection: { societe: string; code: string }[]; // code absent from broker's plan
  byStatus: Record<string, number>;
}

function activeSubsteps(plan: BrokerPlan, code: string) {
  const step = plan.steps.find((s) => s.code === code);
  if (!step) return null;
  const subs = plan.substeps
    .filter((ss) => ss.stepId === step.id && !ss.archivedAt)
    .sort((a, b) => a.position - b.position);
  return { step, subs };
}

/** Load plan rows + the full broker list from Notion or the captured snapshot. */
async function loadRows(): Promise<{ rows: PlanRow[]; brokers: string[]; source: string }> {
  const cfg = loadConfig();
  if (cfg.NOTION_API_KEY) {
    const report = await fetchNotionPlan(createNotionClient(), {
      planDataSourceId: cfg.NOTION_PLAN_DATA_SOURCE_ID,
      clientsDataSourceId: cfg.NOTION_CLIENTS_DATA_SOURCE_ID,
    });
    if (report.skippedNoBroker.length || report.skippedNoCode.length) {
      console.log(
        `  (skipped ${report.skippedNoBroker.length} without broker, ` +
          `${report.skippedNoCode.length} without section code)`,
      );
    }
    return { rows: report.rows, brokers: report.brokers, source: "Notion (live)" };
  }
  const here = dirname(fileURLToPath(import.meta.url));
  const file = join(here, "notion-plan-snapshot.json");
  const parsed = JSON.parse(readFileSync(file, "utf8")) as {
    rows: PlanRow[];
    brokers?: string[];
    capturedAt?: string;
  };
  return {
    rows: parsed.rows,
    brokers: parsed.brokers ?? [],
    source: `snapshot ${parsed.capturedAt ?? "(file)"}`,
  };
}

async function main() {
  const apply = process.argv.includes("--apply");

  console.log("Loading Notion plan…");
  const { rows: planRows, brokers: notionBrokers, source } = await loadRows();
  console.log(`  ${planRows.length} rows, ${notionBrokers.length} brokers from ${source}.`);

  const { db, client } = createDb();
  try {
    const plans = await listBrokerPlans({ db });
    const bySlug = new Map(plans.map((p) => [p.broker.slug, p]));

    // Group rows by broker slug.
    const rowsBySlug = new Map<string, { societe: string; rows: PlanRow[] }>();
    for (const row of planRows) {
      const rawSlug = brokerSlug(row.societe);
      const slug = SLUG_ALIASES[rawSlug] ?? rawSlug;
      const bucket = rowsBySlug.get(slug);
      if (bucket) bucket.rows.push(row);
      else rowsBySlug.set(slug, { societe: row.societe, rows: [row] });
    }

    const matched: { slug: string; plan: BrokerPlan; rows: PlanRow[] }[] = [];
    const unmatched: string[] = [];
    for (const [slug, { societe, rows }] of rowsBySlug) {
      const plan = bySlug.get(slug);
      if (plan) matched.push({ slug, plan, rows });
      else unmatched.push(`${societe} (${slug})`);
    }

    // Reset EVERY Notion-known broker to a clean baseline so Notion is the source
    // of truth — including brokers whose sections are all "No started" (no rows).
    const resolveSlug = (societe: string) => {
      const raw = brokerSlug(societe);
      return SLUG_ALIASES[raw] ?? raw;
    };
    const resetIds = notionBrokers
      .map((societe) => bySlug.get(resolveSlug(societe))?.broker.id)
      .filter((id): id is string => Boolean(id));
    if (apply) {
      await resetBrokerPlanStatuses({ db }, resetIds);
    }

    const outcome: Outcome = { applied: 0, noSection: [], byStatus: {} };
    for (const { plan, rows } of matched) {
      for (const row of rows) {
        outcome.byStatus[row.status] = (outcome.byStatus[row.status] ?? 0) + 1;
        const target = activeSubsteps(plan, row.code);
        if (!target) {
          outcome.noSection.push({ societe: plan.broker.societe, code: row.code });
          continue;
        }
        outcome.applied++;
        if (!apply) continue;

        for (let i = 0; i < target.subs.length; i++) {
          const ss = target.subs[i]!;
          const patch = i === 0 && row.suivi ? { notes: row.suivi } : undefined;
          await setSubstepStatus({ db }, ss.id, row.status, patch);
        }
        await setStepDeadlineOverride({ db }, target.step.id, row.deadline);
      }
    }

    // --- report ----------------------------------------------------------
    console.log("\n=== Import report ===");
    console.log(`Brokers reset     : ${resetIds.length} / ${notionBrokers.length} Notion brokers`);
    console.log(`Brokers with rows : ${matched.length}`);
    console.log(`Brokers unmatched : ${unmatched.length}`);
    if (unmatched.length) console.log("  - " + unmatched.join("\n  - "));
    console.log(`Sections ${apply ? "updated" : "to update"} : ${outcome.applied}`);
    console.log(`Status distribution:`);
    for (const [s, n] of Object.entries(outcome.byStatus).sort()) {
      console.log(`  ${s.padEnd(14)} ${n}`);
    }
    if (outcome.noSection.length) {
      const codes = [...new Set(outcome.noSection.map((x) => x.code))].sort();
      console.log(
        `Rows with no matching section in plan: ${outcome.noSection.length} ` +
          `(codes: ${codes.join(", ")})`,
      );
    }

    console.log(
      apply
        ? "\n✅ Applied to the database (matched brokers reset, then Notion statuses applied)."
        : "\nDry-run only — re-run with --apply to write these changes.",
    );
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
