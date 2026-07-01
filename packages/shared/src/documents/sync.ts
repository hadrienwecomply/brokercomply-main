import { drivePathFromParentRef, joinPath } from '../sharepoint/paths.js';
import type { DeltaResult, DriveItem } from '../sharepoint/types.js';
import {
  getSyncState,
  markDocumentDeleted,
  setSyncState,
  upsertBrokerDocument,
  type DocumentsServiceDeps,
  type DocumentUpsert,
} from './service.js';

/** Anything able to produce a folder-scoped delta (the SharePoint client, or a test fake). */
export interface FolderDeltaSource {
  syncFolderDelta(folderId: string, deltaLink?: string): Promise<DeltaResult>;
}

/** A broker whose linked folder we sync. */
export interface SyncTarget {
  brokerId: string;
  folderItemId: string;
}

export interface SyncResult {
  brokerId: string;
  upserted: number;
  deleted: number;
  deltaLink: string;
}

/**
 * Map a Graph driveItem to the document-mirror upsert shape. Pure + total so the
 * risky field extraction is unit tested in isolation. `path` is the item's
 * drive-relative path (parent path + name).
 */
export function driveItemToDocumentUpsert(brokerId: string, item: DriveItem): DocumentUpsert {
  const parent = drivePathFromParentRef(item.parentReference?.path) ?? '';
  const name = item.name ?? '';
  return {
    brokerId,
    driveItemId: item.id,
    name,
    path: joinPath(parent, name),
    webUrl: item.webUrl ?? null,
    size: item.size ?? null,
    mimeType: item.file?.mimeType ?? null,
    isFolder: Boolean(item.folder),
    etag: item.eTag ?? null,
    lastModifiedAt: item.lastModifiedDateTime ? new Date(item.lastModifiedDateTime) : null,
  };
}

/**
 * Pull one broker folder's changes and reconcile the DB mirror:
 *  - tombstones (deleted facet) → soft-delete (never removed remotely or in DB),
 *  - everything else            → upsert by drive_item_id,
 *  - the folder root itself is skipped (it's the sync scope, not a document).
 * Persists the next delta token for resumable incremental syncs.
 */
export async function syncBrokerFolderDelta(
  deps: DocumentsServiceDeps,
  source: FolderDeltaSource,
  target: SyncTarget,
): Promise<SyncResult> {
  const state = await getSyncState(deps, target.brokerId);
  const { items, deltaLink } = await source.syncFolderDelta(
    target.folderItemId,
    state?.deltaLink ?? undefined,
  );

  let upserted = 0;
  let deleted = 0;
  for (const item of items) {
    if (item.id === target.folderItemId) continue; // the scope folder, not a doc
    if (item.deleted) {
      await markDocumentDeleted(deps, item.id);
      deleted += 1;
      continue;
    }
    await upsertBrokerDocument(deps, driveItemToDocumentUpsert(target.brokerId, item));
    upserted += 1;
  }

  await setSyncState(deps, target.brokerId, {
    folderItemId: target.folderItemId,
    deltaLink,
  });
  return { brokerId: target.brokerId, upserted, deleted, deltaLink };
}
