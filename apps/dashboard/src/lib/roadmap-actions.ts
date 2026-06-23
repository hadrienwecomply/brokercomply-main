"use server";

import { revalidatePath } from "next/cache";
import { currentOfficer } from "./officer.server";
import {
  archiveItem,
  createItem,
  moveItem,
  updateItem,
  voteItem,
  type CreateItemInput,
  type UpdateItemPatch,
} from "./roadmap.server";
import type { RoadmapStatus } from "./roadmap-types";

/** Add a card (default column = Idées). Attribution via cookie officer. */
export async function addCard(input: CreateItemInput) {
  const title = input.title?.trim();
  if (!title) throw new Error("Titre requis");
  const officer = await currentOfficer();
  const row = await createItem({ ...input, title }, officer);
  revalidatePath("/roadmap");
  return row;
}

export async function saveCard(id: string, patch: UpdateItemPatch) {
  const row = await updateItem(id, patch);
  revalidatePath("/roadmap");
  return row;
}

export async function moveCard(id: string, status: RoadmapStatus, position: number) {
  await moveItem(id, status, position);
  revalidatePath("/roadmap");
}

export async function voteCard(id: string): Promise<number> {
  const officer = await currentOfficer();
  const count = await voteItem(id, officer);
  revalidatePath("/roadmap");
  return count;
}

export async function archiveCard(id: string) {
  await archiveItem(id);
  revalidatePath("/roadmap");
}
