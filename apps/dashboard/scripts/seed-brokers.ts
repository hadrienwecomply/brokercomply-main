/**
 * Seed the 44 brokers from brokers.seed.json (idempotent).
 *
 * Upserts by slug, so re-running never duplicates or clobbers edits. Each broker
 * gets its full 13-step plan with deterministic signature date + progress, so the
 * dashboard looks the same as the former in-memory mock — now DB-backed.
 *
 * Run: pnpm -F @brokercomply/dashboard exec tsx scripts/seed-brokers.ts
 *      (add --force to wipe + reseed)
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  createDb,
  brokers,
  createBrokerWithPlan,
  seedPlanGlobals,
  upsertBrokerBySlug,
  type NewBroker,
  type PlanStepSeed,
} from "@brokercomply/shared";
import {
  STEP_TEMPLATES,
  contentKeyFor,
  stepOffsetSeeds,
  taskTemplateSeeds,
} from "../src/lib/plan-template.js";
import { brokerSlug } from "../src/lib/slug.js";

const OFFICERS = ["sdv@we-comply.be", "gr@we-comply.be"];
const TODAY = new Date("2026-06-16T00:00:00.000Z");
const DAY = 86_400_000;

interface RawBroker {
  societe: string;
  contact: string;
  emails: string[];
  countries: string[];
}

// ---- deterministic pseudo-random helpers (ported from the legacy mock) -------

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

interface SeededBroker {
  broker: NewBroker;
  steps: PlanStepSeed[];
}

function buildSeed(raw: RawBroker, index: number): SeededBroker {
  const rng = mulberry32(hashString(`${raw.societe}:${index}`));
  const owner = OFFICERS[index % OFFICERS.length]!;
  const monthsAgo = 1 + Math.floor(rng() * 8);
  const signature = new Date(TODAY.getTime() - (monthsAgo * 30 + Math.floor(rng() * 25)) * DAY);

  // Status map: templateSubstepId -> status, computed from a deterministic
  // advancement over the applicable steps (mirrors the old mock).
  const status = new Map<string, string>();
  const applicable = STEP_TEMPLATES.filter((t) => t.defaultApplicable);
  const adv = rng();
  const currentIdx = Math.min(applicable.length, Math.floor(adv * (applicable.length + 1)));
  applicable.forEach((tpl, k) => {
    if (k < currentIdx) {
      tpl.subSteps.forEach((_, j) => status.set(contentKeyFor(tpl.code, j), "done"));
    } else if (k === currentIdx) {
      const doneCount = Math.floor(rng() * tpl.subSteps.length);
      tpl.subSteps.forEach((_, j) => {
        const id = contentKeyFor(tpl.code, j);
        if (j < doneCount) status.set(id, "done");
        else if (j === doneCount) {
          const r = rng();
          status.set(id, r < 0.55 ? "in_progress" : r < 0.8 ? "waiting_client" : "blocked");
        }
      });
    }
  });

  const steps: PlanStepSeed[] = STEP_TEMPLATES.map((tpl, stepIdx) => ({
    code: tpl.code,
    applicable: tpl.defaultApplicable,
    position: stepIdx,
    substeps: tpl.subSteps.map((ss, j) => {
      const key = contentKeyFor(tpl.code, j);
      return {
        contentKey: key,
        title: ss.title,
        emailSubject: ss.emailTemplate?.subject ?? null,
        emailBody: ss.emailTemplate?.body ?? null,
        isCustom: false,
        position: j,
        status: status.get(key) ?? "not_started",
      };
    }),
  }));

  const domain = raw.emails[0]?.split("@")[1];
  const broker: NewBroker = {
    slug: brokerSlug(raw.societe),
    societe: raw.societe,
    contactName: raw.contact,
    emails: raw.emails,
    countries: raw.countries,
    accountOwner: owner,
    signatureDate: iso(signature),
    website: domain && !domain.includes("gmail") ? `https://www.${domain}` : null,
    status: "active",
    product: "BrokerComply",
  };
  return { broker, steps };
}

async function main() {
  const force = process.argv.includes("--force");
  const here = dirname(fileURLToPath(import.meta.url));
  const seedPath = join(here, "../src/data/brokers.seed.json");
  const raw = JSON.parse(readFileSync(seedPath, "utf8")) as { brokers: RawBroker[] };

  const { db, client } = createDb();
  try {
    // Seed the global template (section offsets + default tasks) first, so brokers
    // fork from it. Idempotent: offsets upserted by code, tasks only when empty.
    await seedPlanGlobals(
      { db },
      { offsets: stepOffsetSeeds(), tasks: taskTemplateSeeds() },
    );
    const seeds = raw.brokers.map((b, i) => buildSeed(b, i));
    if (force) {
      // Wipe + reseed atomically: a mid-loop failure must not leave 0 brokers.
      await db.transaction(async (tx) => {
        await tx.delete(brokers);
        for (const seed of seeds) await createBrokerWithPlan({ db: tx }, seed);
      });
      console.log(`Brokers reseeded (--force): ${seeds.length} created.`);
      return;
    }
    let created = 0;
    let skipped = 0;
    for (const seed of seeds) {
      const res = await upsertBrokerBySlug({ db }, seed);
      if (res.created) created++;
      else skipped++;
    }
    console.log(`Brokers seeded: ${created} created, ${skipped} skipped (already present).`);
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
