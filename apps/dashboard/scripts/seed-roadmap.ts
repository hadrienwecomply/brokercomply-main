/**
 * Seed the roadmap board from ROADMAP_Phase1 (idempotent).
 *
 * Inserts the template cards only when the table is empty, so re-running never
 * duplicates or clobbers team edits.
 *
 * Run: pnpm -F @brokercomply/dashboard exec tsx scripts/seed-roadmap.ts
 *      (add --force to wipe + reseed)
 */
import { createDb, roadmapItems } from "@brokercomply/shared";
import { ROADMAP_SEED } from "../src/lib/roadmap-template.js";

async function main() {
  const force = process.argv.includes("--force");
  const { db, client } = createDb();
  try {
    const existing = await db.select({ id: roadmapItems.id }).from(roadmapItems);
    if (existing.length > 0 && !force) {
      console.log(`Roadmap already has ${existing.length} cards — skipping (use --force to reseed).`);
      return;
    }
    if (force) {
      await db.delete(roadmapItems);
      console.log("Wiped existing roadmap cards (--force).");
    }
    await db.insert(roadmapItems).values(
      ROADMAP_SEED.map((s) => ({
        title: s.title,
        description: s.description,
        status: s.status,
        theme: s.theme,
        position: s.position,
        sourceRef: s.sourceRef ?? null,
        createdBy: "founder@we-comply.be",
      })),
    );
    console.log(`Seeded ${ROADMAP_SEED.length} roadmap cards.`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
