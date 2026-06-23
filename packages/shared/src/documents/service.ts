import { and, eq, isNotNull, isNull } from 'drizzle-orm';
import {
  brokers,
  brokerDocuments,
  sharepointSyncState,
  type Broker,
  type BrokerDocument,
  type Db,
  type NewBrokerDocument,
  type SharepointSyncState,
} from '../db/index.js';

/** A live transaction handle, so service fns compose inside an outer transaction. */
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

export interface DocumentsServiceDeps {
  db: Db | Tx;
}

/** Provisioning state of a broker's SharePoint folder. */
export type SharePointStatus = 'linked' | 'pending' | 'error';

export interface SharePointFolderPatch {
  folderId?: string | null;
  webUrl?: string | null;
  path?: string | null;
  status: SharePointStatus;
}

/**
 * Record (or clear) a broker's SharePoint folder linkage + provisioning status.
 * Used by the create hook (best-effort) and the backfill.
 */
export async function setSharePointFolder(
  { db }: DocumentsServiceDeps,
  brokerId: string,
  patch: SharePointFolderPatch,
): Promise<Broker | undefined> {
  const [row] = await db
    .update(brokers)
    .set({
      sharePointFolderId: patch.folderId ?? null,
      sharePointWebUrl: patch.webUrl ?? null,
      sharePointFolderPath: patch.path ?? null,
      sharePointStatus: patch.status,
      updatedAt: new Date(),
    })
    .where(eq(brokers.id, brokerId))
    .returning();
  return row;
}

/** Fields the sync provides for a mirrored document (driveItemId is the key). */
export interface DocumentUpsert {
  brokerId: string;
  driveItemId: string;
  name: string;
  path?: string | null;
  webUrl?: string | null;
  size?: number | null;
  mimeType?: string | null;
  isFolder?: boolean;
  etag?: string | null;
  lastModifiedAt?: Date | null;
}

/**
 * Idempotently mirror a SharePoint item into `broker_documents`, keyed by the
 * stable `drive_item_id`. Re-running with the same item updates metadata in
 * place (and clears any prior soft-delete) rather than inserting a duplicate.
 */
export async function upsertBrokerDocument(
  { db }: DocumentsServiceDeps,
  doc: DocumentUpsert,
): Promise<BrokerDocument | undefined> {
  const values: NewBrokerDocument = {
    brokerId: doc.brokerId,
    driveItemId: doc.driveItemId,
    name: doc.name,
    path: doc.path ?? null,
    webUrl: doc.webUrl ?? null,
    size: doc.size ?? null,
    mimeType: doc.mimeType ?? null,
    isFolder: doc.isFolder ?? false,
    etag: doc.etag ?? null,
    lastModifiedAt: doc.lastModifiedAt ?? null,
  };
  const [row] = await db
    .insert(brokerDocuments)
    .values(values)
    .onConflictDoUpdate({
      target: brokerDocuments.driveItemId,
      set: {
        brokerId: values.brokerId,
        name: values.name,
        path: values.path,
        webUrl: values.webUrl,
        size: values.size,
        mimeType: values.mimeType,
        isFolder: values.isFolder,
        etag: values.etag,
        lastModifiedAt: values.lastModifiedAt,
        // A re-appearing item is no longer deleted.
        deletedAt: null,
        updatedAt: new Date(),
      },
    })
    .returning();
  return row;
}

/**
 * Soft-delete a mirrored item when it disappears from SharePoint. Never removes
 * the row (and never touches SharePoint). No-op if the item is unknown.
 */
export async function markDocumentDeleted(
  { db }: DocumentsServiceDeps,
  driveItemId: string,
  when: Date = new Date(),
): Promise<BrokerDocument | undefined> {
  const [row] = await db
    .update(brokerDocuments)
    .set({ deletedAt: when, updatedAt: new Date() })
    .where(eq(brokerDocuments.driveItemId, driveItemId))
    .returning();
  return row;
}

/**
 * Fetch one mirrored document by broker + drive item id. Returns undefined when
 * absent or when it belongs to a different broker — used to authorize downloads
 * (prevents fetching another broker's file by guessing its item id).
 */
export async function getBrokerDocument(
  { db }: DocumentsServiceDeps,
  brokerId: string,
  driveItemId: string,
): Promise<BrokerDocument | undefined> {
  const [row] = await db
    .select()
    .from(brokerDocuments)
    .where(
      and(eq(brokerDocuments.brokerId, brokerId), eq(brokerDocuments.driveItemId, driveItemId)),
    );
  return row;
}

/** List a broker's mirrored documents (live by default, i.e. not soft-deleted). */
export async function listBrokerDocuments(
  { db }: DocumentsServiceDeps,
  brokerId: string,
  options: { includeDeleted?: boolean } = {},
): Promise<BrokerDocument[]> {
  const where = options.includeDeleted
    ? eq(brokerDocuments.brokerId, brokerId)
    : and(eq(brokerDocuments.brokerId, brokerId), isNull(brokerDocuments.deletedAt));
  return db.select().from(brokerDocuments).where(where);
}

/** Brokers whose folder is linked and can be delta-synced (id + folder item id). */
export async function listSyncableBrokers({
  db,
}: DocumentsServiceDeps): Promise<Array<{ brokerId: string; folderItemId: string }>> {
  const rows = await db
    .select({ id: brokers.id, folderId: brokers.sharePointFolderId })
    .from(brokers)
    .where(and(eq(brokers.sharePointStatus, 'linked'), isNotNull(brokers.sharePointFolderId)));
  return rows
    .filter((r): r is { id: string; folderId: string } => Boolean(r.folderId))
    .map((r) => ({ brokerId: r.id, folderItemId: r.folderId }));
}

/** Read the persisted folder delta token for a broker, if any. */
export async function getSyncState(
  { db }: DocumentsServiceDeps,
  brokerId: string,
): Promise<SharepointSyncState | undefined> {
  const [row] = await db
    .select()
    .from(sharepointSyncState)
    .where(eq(sharepointSyncState.brokerId, brokerId));
  return row;
}

/** Persist the next folder delta token + sync timestamp for a broker (upsert). */
export async function setSyncState(
  { db }: DocumentsServiceDeps,
  brokerId: string,
  state: { folderItemId: string; deltaLink: string },
  lastSyncedAt: Date = new Date(),
): Promise<SharepointSyncState | undefined> {
  const [row] = await db
    .insert(sharepointSyncState)
    .values({
      brokerId,
      folderItemId: state.folderItemId,
      deltaLink: state.deltaLink,
      lastSyncedAt,
    })
    .onConflictDoUpdate({
      target: sharepointSyncState.brokerId,
      set: { folderItemId: state.folderItemId, deltaLink: state.deltaLink, lastSyncedAt },
    })
    .returning();
  return row;
}

/**
 * Find a broker already linked to a given SharePoint folder path, optionally
 * excluding one broker. Used to BLOCK linking two same-named brokers to the same
 * folder (Q2: no shared folder / no silent document mixing).
 */
export async function findBrokerBySharePointPath(
  { db }: DocumentsServiceDeps,
  path: string,
  excludeBrokerId?: string,
): Promise<Broker | undefined> {
  const rows = await db.select().from(brokers).where(eq(brokers.sharePointFolderPath, path));
  return rows.find((r) => r.id !== excludeBrokerId);
}
