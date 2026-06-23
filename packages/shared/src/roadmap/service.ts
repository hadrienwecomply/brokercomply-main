import { and, eq } from 'drizzle-orm';
import {
  roadmapItems,
  roadmapVotes,
  type Db,
  type NewRoadmapItem,
  type RoadmapItem,
} from '../db/index.js';

export interface RoadmapServiceDeps {
  db: Db;
}

/** A card plus its aggregated vote info for a given viewer. */
export interface RoadmapItemWithVotes {
  item: RoadmapItem;
  votes: number;
  votedByMe: boolean;
}

/** All non-archived cards with vote counts (and whether `viewer` voted). */
export async function listRoadmapItems(
  { db }: RoadmapServiceDeps,
  viewer: string,
): Promise<RoadmapItemWithVotes[]> {
  const [items, votes] = await Promise.all([
    db.select().from(roadmapItems).where(eq(roadmapItems.archived, false)),
    db.select().from(roadmapVotes),
  ]);
  const counts = new Map<string, number>();
  const mine = new Set<string>();
  for (const v of votes) {
    counts.set(v.itemId, (counts.get(v.itemId) ?? 0) + 1);
    if (v.voter === viewer) mine.add(v.itemId);
  }
  return items.map((item) => ({
    item,
    votes: counts.get(item.id) ?? 0,
    votedByMe: mine.has(item.id),
  }));
}

export async function insertRoadmapItem(
  { db }: RoadmapServiceDeps,
  values: NewRoadmapItem,
): Promise<RoadmapItem> {
  const [row] = await db.insert(roadmapItems).values(values).returning();
  if (!row) throw new Error('Failed to insert roadmap item');
  return row;
}

export async function patchRoadmapItem(
  { db }: RoadmapServiceDeps,
  id: string,
  fields: Partial<RoadmapItem>,
): Promise<RoadmapItem | undefined> {
  const [row] = await db
    .update(roadmapItems)
    .set({ ...fields, updatedAt: new Date() })
    .where(eq(roadmapItems.id, id))
    .returning();
  return row;
}

/** Toggle the viewer's vote on a card; returns the new vote count. */
export async function toggleRoadmapVote(
  { db }: RoadmapServiceDeps,
  id: string,
  voter: string,
): Promise<number> {
  const existing = await db
    .select()
    .from(roadmapVotes)
    .where(and(eq(roadmapVotes.itemId, id), eq(roadmapVotes.voter, voter)));
  if (existing.length > 0) {
    await db
      .delete(roadmapVotes)
      .where(and(eq(roadmapVotes.itemId, id), eq(roadmapVotes.voter, voter)));
  } else {
    await db.insert(roadmapVotes).values({ itemId: id, voter });
  }
  const all = await db.select().from(roadmapVotes).where(eq(roadmapVotes.itemId, id));
  return all.length;
}
