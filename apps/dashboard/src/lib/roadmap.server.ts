import "server-only";
import {
  insertRoadmapItem,
  listRoadmapItems,
  patchRoadmapItem,
  toggleRoadmapVote,
  type RoadmapItem,
} from "@brokercomply/shared";
import { getDb } from "./db.server";
import {
  isRoadmapStatus,
  type RoadmapItemDTO,
  type RoadmapStatus,
} from "./roadmap-types";

function toDTO(row: RoadmapItem, votes: number, votedByMe: boolean): RoadmapItemDTO {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    status: isRoadmapStatus(row.status) ? row.status : "idea",
    theme: row.theme,
    position: row.position,
    owner: row.owner,
    sourceRef: row.sourceRef,
    createdBy: row.createdBy,
    votes,
    votedByMe,
    createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : null,
    updatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString() : null,
  };
}

export async function listRoadmap(viewer: string): Promise<RoadmapItemDTO[]> {
  const rows = await listRoadmapItems({ db: getDb() }, viewer);
  return rows.map((r) => toDTO(r.item, r.votes, r.votedByMe));
}

export interface CreateItemInput {
  title: string;
  description?: string | null;
  status?: RoadmapStatus;
  theme?: string | null;
  position?: number;
}

export async function createItem(
  input: CreateItemInput,
  createdBy: string,
): Promise<RoadmapItemDTO> {
  const status = input.status && isRoadmapStatus(input.status) ? input.status : "idea";
  const row = await insertRoadmapItem(
    { db: getDb() },
    {
      title: input.title.trim(),
      description: input.description?.trim() || null,
      status,
      theme: input.theme || null,
      position: input.position ?? 0,
      createdBy,
    },
  );
  return toDTO(row, 0, false);
}

export interface UpdateItemPatch {
  title?: string;
  description?: string | null;
  theme?: string | null;
  owner?: string | null;
}

export async function updateItem(
  id: string,
  patch: UpdateItemPatch,
): Promise<RoadmapItemDTO | null> {
  const fields: Partial<RoadmapItem> = {};
  if (patch.title !== undefined) fields.title = patch.title.trim();
  if (patch.description !== undefined) fields.description = patch.description?.trim() || null;
  if (patch.theme !== undefined) fields.theme = patch.theme || null;
  if (patch.owner !== undefined) fields.owner = patch.owner || null;
  const row = await patchRoadmapItem({ db: getDb() }, id, fields);
  return row ? toDTO(row, 0, false) : null;
}

export async function moveItem(
  id: string,
  status: RoadmapStatus,
  position: number,
): Promise<void> {
  await patchRoadmapItem({ db: getDb() }, id, { status, position });
}

export async function voteItem(id: string, voter: string): Promise<number> {
  return toggleRoadmapVote({ db: getDb() }, id, voter);
}

export async function archiveItem(id: string): Promise<void> {
  await patchRoadmapItem({ db: getDb() }, id, { archived: true });
}
